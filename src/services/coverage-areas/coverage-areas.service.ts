import { supabase } from '../../lib/supabase/supabase.client';
import { CoverageAreaRow } from '../../models/coverage_areas/types';
import { ApiError } from '../../lib/async-handler';

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
    
    return data as CoverageAreaRow[];
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

    return data as CoverageAreaRow;
  }

  async createCoverageArea(orgId: string, userId: string, payload: any) {
    const { data, error } = await supabase
      .from('organization_coverage_areas')
      .insert({
        ...payload,
        org_id: orgId,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw new ApiError(500, 'COVERAGE_AREA_CREATE_FAILED', error.message);
    }

    return data as CoverageAreaRow;
  }

  async updateCoverageArea(id: string, orgId: string, userId: string, payload: any) {
    // Check if exists first
    await this.getCoverageArea(id, orgId);

    const { data, error } = await supabase
      .from('organization_coverage_areas')
      .update({
        ...payload,
        updated_by: userId,
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) {
      throw new ApiError(500, 'COVERAGE_AREA_UPDATE_FAILED', error.message);
    }

    return data as CoverageAreaRow;
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
}

export const coverageAreasService = new CoverageAreasService();
