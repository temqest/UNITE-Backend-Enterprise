"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const supabase_client_1 = require("../../lib/supabase/supabase.client");
class AnalyticsService {
    async getDashboard(orgId, query) {
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
    async getSummaryMetrics(orgId, filters) {
        // Basic queries for summary
        const { count: totalEvents } = await supabase_client_1.supabaseAdmin
            .from('events')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId);
        const { count: completedEvents } = await supabase_client_1.supabaseAdmin
            .from('events')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .eq('status', 'completed');
        const { data: eventData } = await supabase_client_1.supabaseAdmin
            .from('events')
            .select('actual_collected_bags, extra_data')
            .eq('org_id', orgId)
            .eq('status', 'completed');
        let collectedUnits = 0;
        let targetUnits = 0;
        if (eventData) {
            eventData.forEach((e) => {
                collectedUnits += (e.actual_collected_bags || 0);
                if (e.extra_data && typeof e.extra_data === 'object' && 'target_donation' in e.extra_data) {
                    targetUnits += (Number(e.extra_data.target_donation) || 0);
                }
            });
        }
        const { count: lowStockAlerts } = await supabase_client_1.supabaseAdmin
            .from('blood_inventory')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .lt('quantity', 10); // simple fallback
        const { count: activeCoverageAreas } = await supabase_client_1.supabaseAdmin
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
    async getEventAnalytics(orgId, filters) {
        const { data: events } = await supabase_client_1.supabaseAdmin
            .from('events')
            .select('id, name, status, type, actual_collected_bags, creation_method, extra_data, event_date')
            .eq('org_id', orgId);
        const byStatus = {};
        const byType = {};
        const creationMethod = { manual: 0, plotting_calendar: 0 };
        let totalCompleted = 0;
        let withPostEventUpdate = 0;
        let cancelledOrRejected = 0;
        const targetVsActual = [];
        const eventsNeedingAction = [];
        (events || []).forEach((e) => {
            byStatus[e.status] = (byStatus[e.status] || 0) + 1;
            byType[e.type] = (byType[e.type] || 0) + 1;
            if (e.creation_method === 'manual')
                creationMethod.manual++;
            if (e.creation_method === 'plotting_calendar')
                creationMethod.plotting_calendar++;
            if (e.status === 'rejected' || e.status === 'cancelled') {
                cancelledOrRejected++;
            }
            const eventName = e.name || e.title || `Event #${e.id.substring(0, 6)}`;
            if (e.status === 'completed') {
                totalCompleted++;
                if (e.actual_collected_bags !== null && e.actual_collected_bags !== undefined) {
                    withPostEventUpdate++;
                }
                else {
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
            }
            else if (e.status === 'needs_details') {
                eventsNeedingAction.push({
                    id: e.id,
                    name: eventName,
                    reason: 'Missing required details',
                    status: e.status
                });
            }
            else if (e.status === 'approved') {
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
    async getCollectionPerformance(orgId, filters) {
        const { data: events } = await supabase_client_1.supabaseAdmin
            .from('events')
            .select('event_date, actual_collected_bags')
            .eq('org_id', orgId)
            .eq('status', 'completed')
            .order('event_date', { ascending: true });
        const monthly = {};
        (events || []).forEach((e) => {
            if (!e.event_date)
                return;
            const d = new Date(e.event_date);
            const month = d.toLocaleString('default', { month: 'short' });
            if (!monthly[month])
                monthly[month] = { units: 0, completed_events: 0 };
            monthly[month].units += (e.actual_collected_bags || 0);
            monthly[month].completed_events += 1;
        });
        const monthly_collections = Object.entries(monthly).map(([month, stats]) => ({ month, units: stats.units, completed_events: stats.completed_events }));
        let topMonth = { month: 'N/A', units: 0, completed_events: 0 };
        monthly_collections.forEach((m) => {
            if (m.units > topMonth.units)
                topMonth = m;
        });
        return {
            monthly_collections,
            highest_collection_month: topMonth,
            average_monthly_collection: monthly_collections.length > 0
                ? Math.round(monthly_collections.reduce((a, c) => a + c.units, 0) / monthly_collections.length)
                : 0
        };
    }
    async getInventoryAnalytics(orgId, filters) {
        const { data: inventory } = await supabase_client_1.supabaseAdmin
            .from('blood_inventory')
            .select('blood_type, quantity, min_threshold')
            .eq('org_id', orgId);
        const aggregated = {};
        (inventory || []).forEach((item) => {
            if (!aggregated[item.blood_type]) {
                aggregated[item.blood_type] = { blood_type: item.blood_type, quantity: 0, min_threshold: item.min_threshold || 0 };
            }
            aggregated[item.blood_type].quantity += item.quantity || 0;
            // We assume min_threshold is the same across rows for a blood type, or we take the max
            aggregated[item.blood_type].min_threshold = Math.max(aggregated[item.blood_type].min_threshold, item.min_threshold || 0);
        });
        const bloodTypesOrder = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
        const currentStock = Object.values(aggregated).sort((a, b) => bloodTypesOrder.indexOf(a.blood_type) - bloodTypesOrder.indexOf(b.blood_type));
        const lowStock = currentStock.filter((i) => i.quantity < i.min_threshold);
        const codeRed = currentStock.filter((i) => i.quantity <= Math.max(5, i.min_threshold * 0.3));
        return {
            current_stock: currentStock,
            low_stock_blood_types: lowStock,
            code_red_blood_types: codeRed
        };
    }
    async getCoverageAnalytics(orgId, filters) {
        const { data: areas } = await supabase_client_1.supabaseAdmin
            .from('organization_coverage_areas')
            .select('id, area_name, target_units')
            .eq('org_id', orgId)
            .eq('status', 'active');
        // Mapped mock data for now since event matching by PSGC requires complex joins not fully implemented
        const areaProgress = (areas || []).map((a) => ({
            area: a.area_name,
            target: a.target_units || 100,
            collected: Math.floor(Math.random() * (a.target_units || 100)), // Placeholder
            progress: 0
        }));
        areaProgress.forEach((a) => {
            a.progress = a.target > 0 ? Math.round((a.collected / a.target) * 100) : 0;
        });
        return {
            progress_by_area: areaProgress.sort((a, b) => b.progress - a.progress),
            top_performing_areas: areaProgress.filter((a) => a.progress >= 80).slice(0, 3),
            areas_needing_attention: areaProgress.filter((a) => a.progress < 50)
        };
    }
    async getStaffAnalytics(orgId, filters) {
        const { data: staffData } = await supabase_client_1.supabaseAdmin
            .from('event_staff')
            .select('user_id, event_id, events!inner(status, actual_collected_bags)')
            .eq('org_id', orgId);
        // Aggregate by user
        const userStats = {};
        (staffData || []).forEach((s) => {
            if (!userStats[s.user_id])
                userStats[s.user_id] = { assigned: 0, completed: 0, units: 0 };
            userStats[s.user_id].assigned++;
            const event = s.events;
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
    async getOperationalInsights(orgId, filters, inventory, events, coverage) {
        const insights = [];
        inventory.code_red_blood_types.forEach((cr) => {
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
        coverage.areas_needing_attention.forEach((a) => {
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
    async getKeyFindings(orgId, insights) {
        return insights.slice(0, 4).map(i => i.description);
    }
}
exports.AnalyticsService = AnalyticsService;
