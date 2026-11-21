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

    const dataQuality = {
      uses_mock_data: false,
      event_result_count: summary.completed_events,
      coverage_result_count: coverage.progress_by_area.length,
      inventory_transaction_count: inventory.movement_trend ? inventory.movement_trend.length : 0,
      staff_activity_source: "assignments",
      warnings: [] as string[]
    };

    if (summary.completed_events === 0) {
      dataQuality.warnings.push("No completed events available for accurate performance tracking.");
    }


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
      data_quality: dataQuality,
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
    const { data: events, error } = await supabaseAdmin
      .from('events')
      .select('id, title, status, type, actual_collected_bags, creation_method, extra_data, event_date')
      .eq('org_id', orgId);
    
    if (error) console.error("Error fetching events for analytics:", error);

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const creationMethod = { manual: 0, plotting_calendar: 0 };

    let totalCompleted = 0;
    let withPostEventUpdate = 0;
    let cancelledOrRejected = 0;
    const targetVsActual: any[] = [];
    const eventsNeedingAction: any[] = [];

    (events || []).forEach((e: any) => {
      byStatus[e.status] = (byStatus[e.status] || 0) + 1;
      byType[e.type] = (byType[e.type] || 0) + 1;
      if (e.creation_method === 'manual') creationMethod.manual++;
      if (e.creation_method === 'plotting_calendar') creationMethod.plotting_calendar++;

      if (e.status === 'rejected' || e.status === 'cancelled') {
        cancelledOrRejected++;
      }

      const eventName = e.name || e.title || `Event #${e.id.substring(0,6)}`;

      if (e.status === 'completed') {
        totalCompleted++;
        if (e.actual_collected_bags !== null && e.actual_collected_bags !== undefined) {
          withPostEventUpdate++;
        } else {
          eventsNeedingAction.push({
            id: e.id,
            name: eventName,
            reason: 'Missing post-event update',
            status: e.status
          });
        }

        const target = e.extra_data?.target_donation ? Number(e.extra_data.target_donation) : 0;
        const collected = e.actual_collected_bags || 0;
        
        targetVsActual.push({
          id: e.id,
          name: eventName,
          target_units: target,
          collected_units: collected,
          achievement_percentage: target > 0 ? Math.round((collected / target) * 100) : 0
        });
      } else if (e.status === 'needs_details') {
        eventsNeedingAction.push({
          id: e.id,
          name: eventName,
          reason: 'Missing required details',
          status: e.status
        });
      } else if (e.status === 'approved') {
        if (!e.extra_data?.target_donation) {
           eventsNeedingAction.push({
            id: e.id,
            name: eventName,
            reason: 'Upcoming without full setup',
            status: e.status
          });
        }
      }
    });

    const topPerformingEvents = [...targetVsActual]
      .sort((a, b) => b.collected_units - a.collected_units)
      .slice(0, 5);

    return {
      events_by_status: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
      events_by_type: Object.entries(byType).map(([type, count]) => ({ type, count })),
      creation_method: Object.entries(creationMethod).map(([method, count]) => ({ method, count })),
      events_needing_details: byStatus['needs_details'] || 0,
      
      target_vs_actual_by_event: targetVsActual,
      top_performing_events: topPerformingEvents,
      events_needing_action: eventsNeedingAction,
      event_completion_quality: {
        total_completed: totalCompleted,
        with_post_event_update: withPostEventUpdate,
        completion_update_rate: totalCompleted > 0 ? Math.round((withPostEventUpdate / totalCompleted) * 100) : 0,
        cancelled_events: cancelledOrRejected
      }
    };
  }

  private async getCollectionPerformance(orgId: string, filters: any) {
    let dbQuery = supabaseAdmin
      .from('events')
      .select('event_date, actual_collected_bags')
      .eq('org_id', orgId)
      .eq('status', 'completed')
      .order('event_date', { ascending: true });

    if (filters?.year) {
      dbQuery = dbQuery
        .gte('event_date', `${filters.year}-01-01`)
        .lte('event_date', `${filters.year}-12-31`);
    }

    const { data: events } = await dbQuery;

    const monthly: Map<string, { month: string; units: number; completed_events: number }> = new Map();
    (events || []).forEach((e: any) => {
      if (!e.event_date) return;
      const d = new Date(e.event_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleString('default', { month: 'short' });
      const current = monthly.get(key) || { month: monthLabel, units: 0, completed_events: 0 };
      current.units += (e.actual_collected_bags || 0);
      current.completed_events += 1;
      monthly.set(key, current);
    });

    const sortedKeys = Array.from(monthly.keys()).sort();
    const monthly_collections = sortedKeys.map((key) => {
      const stats = monthly.get(key)!;
      return { month: stats.month, units: stats.units, completed_events: stats.completed_events };
    });
    let topMonth = { month: 'N/A', units: 0, completed_events: 0 };
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
      .select('blood_type, quantity, min_threshold, expiry_date, location')
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

    const now = new Date();
    const nowIso = now.toISOString().slice(0, 10);
    const soon7 = new Date(now);
    soon7.setDate(soon7.getDate() + 7);
    const soon7Iso = soon7.toISOString().slice(0, 10);

    const expiringSoon = (inventory || [])
      .filter((row: any) => row.quantity > 0 && !!row.expiry_date && row.expiry_date >= nowIso && row.expiry_date <= soon7Iso)
      .map((row: any) => ({
        blood_type: row.blood_type,
        quantity: row.quantity,
        expiry_date: row.expiry_date,
        location: row.location,
      }))
      .sort((a: any, b: any) => (a.expiry_date > b.expiry_date ? 1 : -1));

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { data: transactions } = await supabaseAdmin
      .from('blood_inventory_transactions')
      .select('direction, quantity, created_at')
      .eq('org_id', orgId)
      .gte('created_at', sixMonthsAgo.toISOString());

    const monthlyMovement: Map<string, { month: string; added: number; used: number }> = new Map();
    (transactions || []).forEach((t: any) => {
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleString('default', { month: 'short' });
      const current = monthlyMovement.get(key) || { month: monthLabel, added: 0, used: 0 };
      if (t.direction === 'in') {
        current.added += t.quantity;
      } else {
        current.used += t.quantity;
      }
      monthlyMovement.set(key, current);
    });

    const sortedMovementKeys = Array.from(monthlyMovement.keys()).sort();
    const movementTrend = sortedMovementKeys.map((key) => {
      const stats = monthlyMovement.get(key)!;
      return {
        month: stats.month,
        added: stats.added,
        used: stats.used,
      };
    });

    return {
      current_stock: currentStock,
      low_stock_blood_types: lowStock,
      code_red_blood_types: codeRed,
      expiring_soon_units: expiringSoon,
      movement_trend: movementTrend
    };
  }

  private async getCoverageAnalytics(orgId: string, filters: any) {
    const { data: areas } = await supabaseAdmin
      .from('organization_coverage_areas')
      .select('id, area_name, target_units, psgc_code, normalized_area_key')
      .eq('org_id', orgId)
      .eq('status', 'active');

    const { data: events } = await supabaseAdmin
      .from('events')
      .select('status, actual_collected_bags, coverage_area_id, coverage_area_psgc_code, coverage_area_boundary_id, coverage_area_normalized_key')
      .eq('org_id', orgId);

    const areaProgress = (areas || []).map((area: any) => {
      let collected = 0;
      let completed_events = 0;
      let upcoming_events = 0;
      
      (events || []).forEach((e: any) => {
        const matches = 
          (e.coverage_area_id && e.coverage_area_id === area.id) ||
          (e.coverage_area_psgc_code && area.psgc_code && e.coverage_area_psgc_code === area.psgc_code) ||
          (e.coverage_area_normalized_key && area.normalized_area_key && e.coverage_area_normalized_key === area.normalized_area_key);
          
        if (matches) {
          if (e.status === 'completed') {
            collected += (e.actual_collected_bags || 0);
            completed_events++;
          } else if (['scheduled', 'published', 'plotted', 'needs_details'].includes(e.status)) {
            upcoming_events++;
          }
        }
      });

      const target = area.target_units || 0;
      const progress = target > 0 ? Math.round((collected / target) * 100) : 0;

      return {
        area: area.area_name,
        target,
        collected,
        progress,
        completed_events,
        upcoming_events
      };
    });

    return {
      progress_by_area: areaProgress.sort((a: any, b: any) => b.progress - a.progress),
      top_performing_areas: areaProgress.filter((a: any) => a.progress >= 80 && a.collected > 0).slice(0, 3),
      areas_needing_attention: areaProgress.filter((a: any) => (a.progress < 50 || a.collected === 0) && a.target > 0)
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

    const staffActivity = Object.entries(userStats).map(([userId, stats]) => ({
      staff_id: userId,
      ...stats,
      completion_rate: stats.assigned > 0 ? Math.round((stats.completed / stats.assigned) * 100) : 0
    }));

    const topPerformingStaff = [...staffActivity]
      .filter(s => s.completed > 0)
      .sort((a, b) => b.units - a.units)
      .slice(0, 5);

    const staffNeedingFollowUp = [...staffActivity]
      .filter(s => s.assigned > s.completed)
      .map(s => ({
        ...s,
        pending_events: s.assigned - s.completed
      }))
      .sort((a, b) => b.pending_events - a.pending_events)
      .slice(0, 5);

    return {
      staff_activity: staffActivity,
      top_performing_staff: topPerformingStaff,
      staff_needing_follow_up: staffNeedingFollowUp
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
