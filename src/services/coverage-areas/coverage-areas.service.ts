import { supabaseServer as supabase } from '../../lib/supabase/supabase.client';
import { CoverageAreaRow } from '../../models/coverage_areas/types';
import { ApiError } from '../../lib/async-handler';
import { normalizeGeoAreaKey } from '../../utils/geo';

export class CoverageAreasService {
  async listCoverageAreas(orgId: string, filters: { status?: string; area_type?: string; search?: string }) {
    let query = supabase.from('organization_coverage_areas').select('*').eq('org_id', orgId);

    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.area_type) {
      query = query.eq('area_type', filters.area_type);
    }
    if (filters.search) {
      query = query.ilike('area_name', `%${filters.search}%`);
    }

    const { data, error } = await query.order('area_name', { ascending: true });
    
    if (error) {
      throw new ApiError(500, 'COVERAGE_AREA_FETCH_FAILED', error.message);
    }
    
    return await this.aggregateCoverageData(orgId, data as CoverageAreaRow[]);
  }

  async getCoverageArea(id: string, orgId: string) {
    const { data, error } = await supabase
      .from('organization_coverage_areas')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (error || !data) {
      throw new ApiError(404, 'COVERAGE_AREA_NOT_FOUND', 'Coverage area not found or you do not have permission.');
    }

    const aggregated = await this.aggregateCoverageData(orgId, [data as CoverageAreaRow]);
    return aggregated[0];
  }

  async createCoverageArea(orgId: string, userId: string, payload: any) {
    const normalized_area_key = (payload.normalized_area_key ?? normalizeGeoAreaKey({
      region: null,
      province: payload.province,
      municipality_or_city: payload.municipality || payload.area_name,
      barangay: payload.barangay,
    })) || null;

    const { data, error } = await supabase
      .from('organization_coverage_areas')
      .insert({
        ...payload,
        normalized_area_key,
        org_id: orgId,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw new ApiError(500, 'COVERAGE_AREA_CREATE_FAILED', error.message);
    }

    await this.reconcileEventsForCoverageArea(orgId, data as CoverageAreaRow);

    const aggregated = await this.aggregateCoverageData(orgId, [data as CoverageAreaRow]);
    return aggregated[0];
  }

  async updateCoverageArea(id: string, orgId: string, userId: string, payload: any) {
    // Check if exists first
    await this.getCoverageArea(id, orgId);

    const normalized_area_key = (payload.normalized_area_key ?? normalizeGeoAreaKey({
      region: null,
      province: payload.province,
      municipality_or_city: payload.municipality || payload.area_name,
      barangay: payload.barangay,
    })) || null;

    const { data, error } = await (supabase
      .from('organization_coverage_areas') as any)
      .update({
        ...payload,
        ...(payload.province || payload.municipality || payload.area_name ? { normalized_area_key } : {}),
        updated_by: userId,
      } as any)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) {
      throw new ApiError(500, 'COVERAGE_AREA_UPDATE_FAILED', error.message);
    }

    // Attempt to reconcile any existing unlinked events that might match the updated geo identity
    await this.reconcileEventsForCoverageArea(orgId, data as CoverageAreaRow);

    const aggregated = await this.aggregateCoverageData(orgId, [data as CoverageAreaRow]);
    return aggregated[0];
  }

  async deleteCoverageArea(id: string, orgId: string) {
    await this.getCoverageArea(id, orgId);

    const { error } = await supabase
      .from('organization_coverage_areas')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) {
      throw new ApiError(500, 'COVERAGE_AREA_DELETE_FAILED', error.message);
    }

    return { success: true };
  }

  async reconcileEventsForCoverageArea(orgId: string, coverageArea: CoverageAreaRow) {
    // 1. First, fetch all unlinked events for this org
    const { data: unlinkedEvents, error: fetchError } = await supabase
      .from('events')
      .select('id, title, address, coverage_area_psgc_code, coverage_area_normalized_key, extra_data')
      .eq('org_id', orgId)
      .is('coverage_area_id', null);

    if (fetchError || !unlinkedEvents || unlinkedEvents.length === 0) {
      return 0;
    }

    const baseAreaName = (coverageArea.area_name || '').toLowerCase()
      .replace(/city of|municipality of|province of/g, '')
      .trim();

    const eventsToUpdate: string[] = [];

    for (const e of unlinkedEvents as any[]) {
      let isMatch = false;

      // PSGC match
      if (coverageArea.psgc_code && e.coverage_area_psgc_code === coverageArea.psgc_code) {
        isMatch = true;
      }
      // Normalized key match
      else if (coverageArea.normalized_area_key && e.coverage_area_normalized_key === coverageArea.normalized_area_key && e.coverage_area_normalized_key !== '|||') {
        isMatch = true;
      }
      // Fallback text match
      else if (baseAreaName.length > 2) {
        const eTitle = (e.title || '').toLowerCase();
        const eAddress = (e.address || '').toLowerCase();
        const eLoc = (e.extra_data?.location || '').toLowerCase();
        const eMuni = (e.extra_data?.municipality || '').toLowerCase();
        
        if (eTitle.includes(baseAreaName) || eAddress.includes(baseAreaName) || eLoc.includes(baseAreaName) || eMuni.includes(baseAreaName)) {
          isMatch = true;
        }
      }

      if (isMatch) {
        eventsToUpdate.push(e.id);
      }
    }

    if (eventsToUpdate.length === 0) {
      return 0;
    }

    // 2. Perform the update
    const { error: updateError } = await (supabase
      .from('events') as any)
      .update({ coverage_area_id: coverageArea.id } as any)
      .in('id', eventsToUpdate);

    if (updateError) {
      console.error('Failed to reconcile events for coverage area:', updateError);
      return 0;
    }
    
    return eventsToUpdate.length;
  }

  private async aggregateCoverageData(orgId: string, coverageAreas: CoverageAreaRow[]): Promise<CoverageAreaRow[]> {
    if (coverageAreas.length === 0) return [];

    // Fetch all events for the org to aggregate
    // In a huge system, doing this in SQL with a GROUP BY would be better, but doing it in memory is fine for MVP/v1.
    const { data: events, error } = await supabase
      .from('events')
      .select('id, title, address, coverage_area_id, coverage_area_psgc_code, coverage_area_normalized_key, status, actual_collected_bags, actual_donors, wastage_units, type, extra_data')
      .eq('org_id', orgId)
      .in('status', ['completed', 'published', 'scheduled', 'ongoing', 'plotted']);

    if (error || !events) {
      console.error('Failed to fetch events for aggregation:', error);
      return coverageAreas;
    }

    const rawEvents = events as any[];
    const completedEvents = rawEvents.filter(e => e.status === 'completed');
    const upcomingEvents = rawEvents.filter(e => ['published', 'scheduled', 'ongoing', 'plotted'].includes(e.status));

    return coverageAreas.map(area => {
      // Clean up area name for fallback matching (e.g., "City of Iriga" -> "iriga")
      const baseAreaName = (area.area_name || '').toLowerCase()
        .replace(/city of|municipality of|province of/g, '')
        .trim();

      const isMatch = (e: any) => {
        // 1. Direct ID match
        if (e.coverage_area_id === area.id) return true;
        
        // 2. PSGC match
        if (area.psgc_code && e.coverage_area_psgc_code === area.psgc_code) return true;
        
        // 3. Strict normalized key match
        if (area.normalized_area_key && e.coverage_area_normalized_key === area.normalized_area_key && e.coverage_area_normalized_key !== '|||') return true;
        
        // 4. Fallback text matching for orphaned events
        if (!e.coverage_area_id) {
          const eTitle = (e.title || '').toLowerCase();
          const eAddress = (e.address || '').toLowerCase();
          const eLoc = (e.extra_data?.location || '').toLowerCase();
          const eMuni = (e.extra_data?.municipality || '').toLowerCase();
          
          if (baseAreaName.length > 2 && (
            eTitle.includes(baseAreaName) || 
            eAddress.includes(baseAreaName) || 
            eLoc.includes(baseAreaName) || 
            eMuni.includes(baseAreaName)
          )) {
            return true;
          }
        }
        
        return false;
      };

      // Find matching completed events for this area
      const areaCompletedEvents = completedEvents.filter(isMatch);

      // Find matching upcoming events for this area
      const areaUpcomingEvents = upcomingEvents.filter(isMatch);

      const collected_units = areaCompletedEvents.reduce((sum, e) => sum + (e.actual_collected_bags || 0), 0);
      const donor_count = areaCompletedEvents.reduce((sum, e) => sum + (e.actual_donors || 0), 0);
      
      // Calculate successful donations if available in extra_data, otherwise default to collected units
      const successful_donations = areaCompletedEvents.reduce((sum, e) => {
        const extra = e.extra_data as any;
        return sum + (extra?.successful_donations || e.actual_collected_bags || 0);
      }, 0);
      
      const deferred_donors = areaCompletedEvents.reduce((sum, e) => {
        const extra = e.extra_data as any;
        return sum + (extra?.deferred_donors || 0);
      }, 0);

      return {
        ...area,
        collected_units,
        donor_count,
        successful_donations,
        deferred_donors,
        upcoming_events_count: areaUpcomingEvents.length,
      };
    });
  }
}

export const coverageAreasService = new CoverageAreasService();
