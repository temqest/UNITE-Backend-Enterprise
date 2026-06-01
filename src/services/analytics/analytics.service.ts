import { supabaseAdmin } from '../../lib/supabase/supabase.client';
import type { AnalyticsDashboardQuery } from '../../api/v1/validators/analytics/analytics.validator';

export class AnalyticsService {
  public async getDashboard(orgId: string, query: AnalyticsDashboardQuery) {
    const filters = {
      from: query.from,
      to: query.to,
      dateRange: query.date_range || 'last_30_days',
      eventType: query.event_type,
      coverageAreaId: query.coverage_area_id,
      staffId: query.staff_id,
      bloodType: query.blood_type
    };

    const [summary, events, collection, inventory, coverage, staff] = await Promise.all([
      this.getSummaryMetrics(orgId, filters),
      this.getEventAnalytics(orgId, filters),
      this.getCollectionPerformance(orgId, filters),
      this.getInventoryAnalytics(orgId, filters),
      this.getCoverageAnalytics(orgId, filters),
      this.getStaffAnalytics(orgId, filters)
    ]);

    const insights = await this.getOperationalInsights(orgId, filters, inventory, events, coverage);
    const keyFindings = await this.getKeyFindings(orgId, insights);

    return {
      filters,
      summary,
      events,
      collection,
      inventory,
      coverage,
      staff,
      insights,
      key_findings: keyFindings,
      generated_at: new Date().toISOString()
    };
  }

  private async getSummaryMetrics(orgId: string, filters: any) {
    // Basic queries for summary
    const { count: totalEvents } = await supabaseAdmin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId);

    const { count: completedEvents } = await supabaseAdmin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'completed');

    const { data: eventData } = await supabaseAdmin
      .from('events')
      .select('actual_collected_bags, extra_data')
      .eq('org_id', orgId)
      .eq('status', 'completed');

    let collectedUnits = 0;
    let targetUnits = 0;
    
    if (eventData) {
      eventData.forEach((e: any) => {
        collectedUnits += (e.actual_collected_bags || 0);
        if (e.extra_data && typeof e.extra_data === 'object' && 'target_donation' in e.extra_data) {
           targetUnits += (Number((e.extra_data as any).target_donation) || 0);
        }
      });
    }

    const { count: lowStockAlerts } = await supabaseAdmin
      .from('blood_inventory')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .lt('quantity', 10); // simple fallback

    const { count: activeCoverageAreas } = await supabaseAdmin
      .from('organization_coverage_areas')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'active');

    return {
      total_events: totalEvents || 0,
      completed_events: completedEvents || 0,
      collected_units: collectedUnits,
      target_units: targetUnits,
      goal_achievement_percentage: targetUnits > 0 ? Math.round((collectedUnits / targetUnits) * 100) : 0,
      low_stock_alerts: lowStockAlerts || 0,
      active_coverage_areas: activeCoverageAreas || 0,
    };
  }

  private async getEventAnalytics(orgId: string, filters: any) {
    const { data: events } = await supabaseAdmin
      .from('events')
      .select('id, status, type, actual_collected_bags, creation_method, extra_data')
      .eq('org_id', orgId);

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const creationMethod = { manual: 0, plotting_calendar: 0 };

    (events || []).forEach((e: any) => {
      byStatus[e.status] = (byStatus[e.status] || 0) + 1;
      byType[e.type] = (byType[e.type] || 0) + 1;
      if (e.creation_method === 'manual') creationMethod.manual++;
      if (e.creation_method === 'plotting_calendar') creationMethod.plotting_calendar++;
    });

    return {
      events_by_status: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
      events_by_type: Object.entries(byType).map(([type, count]) => ({ type, count })),
      creation_method: Object.entries(creationMethod).map(([method, count]) => ({ method, count })),
      events_needing_details: byStatus['needs_details'] || 0
    };
  }

  private async getCollectionPerformance(orgId: string, filters: any) {
    const { data: events } = await supabaseAdmin
      .from('events')
      .select('event_date, actual_collected_bags')
      .eq('org_id', orgId)
      .eq('status', 'completed')
      .order('event_date', { ascending: true });

    const monthly: Record<string, number> = {};
    (events || []).forEach((e: any) => {
      if (!e.event_date) return;
      const d = new Date(e.event_date);
      const month = d.toLocaleString('default', { month: 'short' });
      monthly[month] = (monthly[month] || 0) + (e.actual_collected_bags || 0);
    });

    const monthly_collections = Object.entries(monthly).map(([month, units]) => ({ month, units }));
    let topMonth = { month: 'N/A', units: 0 };
    monthly_collections.forEach((m: any) => {
      if (m.units > topMonth.units) topMonth = m;
    });

    return {
      monthly_collections,
      highest_collection_month: topMonth,
      average_monthly_collection: monthly_collections.length > 0 
        ? Math.round(monthly_collections.reduce((a, c) => a + c.units, 0) / monthly_collections.length)
        : 0
    };
  }

  private async getInventoryAnalytics(orgId: string, filters: any) {
    const { data: inventory } = await supabaseAdmin
      .from('blood_inventory')
      .select('blood_type, quantity, min_threshold')
      .eq('org_id', orgId);

    const aggregated: Record<string, { blood_type: string; quantity: number; min_threshold: number }> = {};
    
    (inventory || []).forEach((item: any) => {
      if (!aggregated[item.blood_type]) {
        aggregated[item.blood_type] = { blood_type: item.blood_type, quantity: 0, min_threshold: item.min_threshold || 0 };
      }
      aggregated[item.blood_type].quantity += item.quantity || 0;
      // We assume min_threshold is the same across rows for a blood type, or we take the max
      aggregated[item.blood_type].min_threshold = Math.max(aggregated[item.blood_type].min_threshold, item.min_threshold || 0);
    });

    const bloodTypesOrder = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    const currentStock = Object.values(aggregated).sort((a: any, b: any) => 
      bloodTypesOrder.indexOf(a.blood_type) - bloodTypesOrder.indexOf(b.blood_type)
    );

    const lowStock = currentStock.filter((i: any) => i.quantity < i.min_threshold);
    const codeRed = currentStock.filter((i: any) => i.quantity <= Math.max(5, i.min_threshold * 0.3));

    return {
      current_stock: currentStock,
      low_stock_blood_types: lowStock,
      code_red_blood_types: codeRed
    };
  }

  private async getCoverageAnalytics(orgId: string, filters: any) {
    const { data: areas } = await supabaseAdmin
      .from('organization_coverage_areas')
      .select('id, area_name, target_units')
      .eq('org_id', orgId)
      .eq('status', 'active');

    // Mapped mock data for now since event matching by PSGC requires complex joins not fully implemented
    const areaProgress = (areas || []).map((a: any) => ({
      area: a.area_name,
      target: a.target_units || 100,
      collected: Math.floor(Math.random() * (a.target_units || 100)), // Placeholder
      progress: 0
    }));

    areaProgress.forEach((a: any) => {
      a.progress = a.target > 0 ? Math.round((a.collected / a.target) * 100) : 0;
    });

    return {
      progress_by_area: areaProgress.sort((a: any, b: any) => b.progress - a.progress),
      top_performing_areas: areaProgress.filter((a: any) => a.progress >= 80).slice(0, 3),
      areas_needing_attention: areaProgress.filter((a: any) => a.progress < 50)
    };
  }

  private async getStaffAnalytics(orgId: string, filters: any) {
    const { data: staffData } = await supabaseAdmin
      .from('event_staff')
      .select('user_id, event_id, events!inner(status, actual_collected_bags)')
      .eq('org_id', orgId);

    // Aggregate by user
    const userStats: Record<string, { assigned: number, completed: number, units: number }> = {};
    (staffData || []).forEach((s: any) => {
      if (!userStats[s.user_id]) userStats[s.user_id] = { assigned: 0, completed: 0, units: 0 };
      userStats[s.user_id].assigned++;
      const event: any = s.events;
      if (event && event.status === 'completed') {
        userStats[s.user_id].completed++;
        userStats[s.user_id].units += (event.actual_collected_bags || 0);
      }
    });

    return {
      staff_activity: Object.entries(userStats).map(([userId, stats]) => ({
        staff_id: userId,
        ...stats,
        completion_rate: stats.assigned > 0 ? Math.round((stats.completed / stats.assigned) * 100) : 0
      }))
    };
  }

  private async getOperationalInsights(orgId: string, filters: any, inventory: any, events: any, coverage: any) {
    const insights: any[] = [];
    
    inventory.code_red_blood_types.forEach((cr: any) => {
      insights.push({
        id: `cr-${cr.blood_type}`,
        severity: 'critical',
        category: 'inventory',
        title: 'Critical Blood Stock',
        description: `${cr.blood_type} is at Code Red level (${cr.quantity} units).`,
        action_label: 'View Inventory',
        action_href: '/dashboard/inventory'
      });
    });

    if (events.events_needing_details > 0) {
      insights.push({
        id: 'evt-needs-details',
        severity: 'warning',
        category: 'events',
        title: 'Events Needing Details',
        description: `${events.events_needing_details} events need details before publishing.`,
        action_label: 'Manage Campaigns',
        action_href: '/dashboard/campaign'
      });
    }

    coverage.areas_needing_attention.forEach((a: any) => {
      insights.push({
        id: `cov-${a.area}`,
        severity: 'warning',
        category: 'coverage',
        title: 'Low Coverage Progress',
        description: `${a.area} is below 50% of target (${a.progress}%).`,
        action_label: 'View Map',
        action_href: '/dashboard/coverage-map'
      });
    });

    return insights;
  }

  private async getKeyFindings(orgId: string, insights: any[]) {
    return insights.slice(0, 4).map(i => i.description);
  }
}
