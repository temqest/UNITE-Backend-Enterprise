import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { AnalyticsService } from '../services/analytics/analytics.service';

// Load environment variables
dotenv.config();

const DEMO_ORG_ID = '1fa1539b-694b-4344-9b22-3a2d18ca6b84';
const OUT_DIR = path.join(process.cwd(), 'debug', 'analytics-demo-org-snapshot');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABSE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function writeJson(filename: string, data: any, header?: string) {
  const filePath = path.join(OUT_DIR, filename);
  let output = '';
  if (header) {
    output += `/* ${header} */\n`;
  }
  output += JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, output, 'utf8');
  console.log(`Saved: ${filePath}`);
}

async function exportData() {
  console.log(`Starting export for Demo Org: ${DEMO_ORG_ID}...`);
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  // 1. 00_org_context.json
  const orgContext = {
    org_id: DEMO_ORG_ID,
    user_id: 'b733ec80-37c8-44b7-97d6-90b78675c4dc',
    auth_id: '013ee486-c883-43bc-aa8b-7910cdfc4261',
    user_email: 'demo@admin.com',
    user_full_name: 'Patrick Villamer',
    role: 'admin',
    geographic_area: 'Camarines Sur',
    export_timestamp: new Date().toISOString()
  };
  writeJson('00_org_context.json', orgContext, 'Organization and Demo User Context');

  // 2. 01_events.json & 3. 02_event_results_post_updates.json
  const { data: events, error: eventsErr } = await supabase
    .from('events')
    .select('*')
    .eq('org_id', DEMO_ORG_ID);
  
  if (eventsErr) console.error("Error fetching events:", eventsErr);

  writeJson('01_events.json', events || [], `Total Events: ${events?.length || 0}`);

  const postEventUpdates = (events || [])
    .filter(e => e.actual_collected_bags !== null || e.actual_donors !== null)
    .map(e => ({
      event_id: e.id,
      event_title: e.title,
      actual_collected_bags: e.actual_collected_bags,
      actual_donors: e.actual_donors,
      wastage_units: e.wastage_units,
      post_event_notes: e.post_event_notes,
      updated_by: e.updated_by,
      created_at: e.created_at,
      updated_at: e.updated_at
    }));
  writeJson('02_event_results_post_updates.json', postEventUpdates, `Total Results: ${postEventUpdates.length}`);

  // 4. 03_plotting_calendars.json
  const { data: plottingCalendars, error: calendarsErr } = await supabase
    .from('plotting_calendars')
    .select('*')
    .eq('org_id', DEMO_ORG_ID);

  if (calendarsErr) console.error("Error fetching plotting calendars:", calendarsErr);

  const safeCalendars = (plottingCalendars || []).map(c => {
    const { share_token, public_access_code, ...rest } = c;
    return rest;
  });
  writeJson('03_plotting_calendars.json', safeCalendars, `Total Calendars: ${safeCalendars.length}`);

  // 5. 04_plotting_reservations_or_plotted_events.json
  const plottedEvents = (events || []).filter(e => e.plotting_calendar_id !== null).map(e => ({
    plotting_calendar_id: e.plotting_calendar_id,
    event_id: e.id,
    event_title: e.title,
    reserved_by: e.requested_by_user_id,
    status: e.status,
    created_at: e.created_at
  }));
  writeJson('04_plotting_reservations_or_plotted_events.json', plottedEvents, `Total Plotted Events: ${plottedEvents.length}`);

  // 6. 05_coverage_areas.json
  const { data: coverageAreas, error: coverageErr } = await supabase
    .from('organization_coverage_areas')
    .select('*')
    .eq('org_id', DEMO_ORG_ID);

  if (coverageErr) console.error("Error fetching coverage areas:", coverageErr);
  writeJson('05_coverage_areas.json', coverageAreas || [], `Total Coverage Areas: ${coverageAreas?.length || 0}`);

  // 7. 06_event_coverage_matching.json
  const matchingData = (events || []).map(e => {
    let matchedArea = null;
    let matchMethod = 'no_match';
    let reason = '';

    if (e.coverage_area_id) {
      matchedArea = (coverageAreas || []).find(a => a.id === e.coverage_area_id);
      if (matchedArea) matchMethod = 'coverage_area_id';
    } else if (e.coverage_area_psgc_code) {
      matchedArea = (coverageAreas || []).find(a => a.psgc_code === e.coverage_area_psgc_code);
      if (matchedArea) matchMethod = 'psgc_code';
    } else if (e.coverage_area_normalized_key) {
      matchedArea = (coverageAreas || []).find(a => a.normalized_area_key === e.coverage_area_normalized_key);
      if (matchedArea) matchMethod = 'normalized_area_key';
    }

    if (!matchedArea) {
      reason = 'No explicit ID, PSGC, or normalized key matching available areas.';
    }

    return {
      event_id: e.id,
      event_title: e.title,
      event_location_fields: {
        address: e.address,
        coverage_area_id: e.coverage_area_id,
        psgc_code: e.coverage_area_psgc_code,
        boundary_id: e.coverage_area_boundary_id,
        normalized_key: e.coverage_area_normalized_key,
        province: e.coverage_area_province,
        municipality: e.coverage_area_municipality
      },
      matched_coverage_area_id: matchedArea?.id || null,
      matched_coverage_area_name: matchedArea?.area_name || null,
      match_method: matchMethod,
      reason: reason
    };
  });
  writeJson('06_event_coverage_matching.json', matchingData, `Event Matching Evaluation`);

  // 8. 07_inventory.json
  const { data: inventory, error: invErr } = await supabase
    .from('blood_inventory')
    .select('*')
    .eq('org_id', DEMO_ORG_ID);
  if (invErr) console.error("Error fetching inventory:", invErr);
  writeJson('07_inventory.json', inventory || [], `Total Inventory Records: ${inventory?.length || 0}`);

  // 9. 08_inventory_transactions.json
  const { data: invTx, error: invTxErr } = await supabase
    .from('blood_inventory_transactions')
    .select('*')
    .eq('org_id', DEMO_ORG_ID);
  if (invTxErr) console.error("Error fetching inventory transactions:", invTxErr);
  writeJson('08_inventory_transactions.json', invTx || [], `Total Inventory Transactions: ${invTx?.length || 0}`);

  // 10. 09_staff_users.json
  const { data: staffUsers, error: staffErr } = await supabase
    .from('users')
    .select('id, auth_id, first_name, last_name, email, role, is_active, geographic_area, created_at, updated_at')
    .eq('org_id', DEMO_ORG_ID);
  if (staffErr) console.error("Error fetching staff:", staffErr);
  
  const formattedStaff = (staffUsers || []).map(u => ({
    ...u,
    full_name: `${u.first_name} ${u.last_name}`,
    first_name: undefined,
    last_name: undefined
  }));
  writeJson('09_staff_users.json', formattedStaff, `Total Staff Users: ${formattedStaff.length}`);

  // 11. 10_staff_event_links.json
  const { data: staffEvents, error: staffEventsErr } = await supabase
    .from('event_staff')
    .select('*')
    .eq('org_id', DEMO_ORG_ID);
  if (staffEventsErr) console.error("Error fetching staff events:", staffEventsErr);
  writeJson('10_staff_event_links.json', staffEvents || [], `Total Staff-Event Assignments: ${staffEvents?.length || 0}`);

  // 12. 11_analytics_backend_response.json
  console.log("Calling AnalyticsService...");
  const analyticsService = new AnalyticsService();
  const analyticsResponse = await analyticsService.getDashboard(DEMO_ORG_ID, {
    date_range: 'last_30_days',
  });
  writeJson('11_analytics_backend_response.json', analyticsResponse, `Analytics Service Response`);

  // 13. 12_analytics_manual_recalculation.json
  console.log("Performing manual recalculation...");
  const manual = {
    total_events: (events || []).length,
    completed_events: (events || []).filter(e => e.status === 'completed').length,
    events_needing_details: (events || []).filter(e => e.status === 'needs_details').length,
    collected_units: 0,
    target_units: 0,
    coverage_progress: [] as any[],
  };

  const coverageTotals: Record<string, { target: number, collected: number, name: string }> = {};
  (coverageAreas || []).forEach(a => {
    coverageTotals[a.id] = { target: a.target_units || 0, collected: 0, name: a.area_name };
  });

  (events || []).forEach(e => {
    if (e.status === 'completed') {
      const collected = e.actual_collected_bags || 0;
      manual.collected_units += collected;
      const target = e.extra_data?.target_donation ? Number(e.extra_data.target_donation) : 0;
      manual.target_units += target;

      const matched = matchingData.find(m => m.event_id === e.id);
      if (matched && matched.matched_coverage_area_id && coverageTotals[matched.matched_coverage_area_id]) {
        coverageTotals[matched.matched_coverage_area_id].collected += collected;
      }
    }
  });

  manual.coverage_progress = Object.entries(coverageTotals).map(([id, stats]) => ({
    area_id: id,
    area_name: stats.name,
    target: stats.target,
    collected: stats.collected,
    progress: stats.target > 0 ? Math.round((stats.collected / stats.target) * 100) : 0
  })).sort((a, b) => b.progress - a.progress);

  writeJson('12_analytics_manual_recalculation.json', manual, `Manual Recalculation Output`);

  // 14. 13_discrepancy_report.json
  console.log("Generating discrepancy report...");
  const discrepancies: any[] = [];

  // Compare Totals
  if (manual.total_events !== analyticsResponse.summary.total_events) {
    discrepancies.push({
      issue_type: "Total Events Mismatch",
      affected_entity: "summary",
      expected_value: manual.total_events,
      actual_value: analyticsResponse.summary.total_events,
      likely_cause: "Backend analytics might be filtering out certain events."
    });
  }

  if (manual.collected_units !== analyticsResponse.summary.collected_units) {
    discrepancies.push({
      issue_type: "Collected Units Mismatch",
      affected_entity: "summary",
      expected_value: manual.collected_units,
      actual_value: analyticsResponse.summary.collected_units,
      likely_cause: "Event collected units not properly summed by backend or excluded by status."
    });
  }

  // Compare Coverage matching
  manual.coverage_progress.forEach(mc => {
    const backendCov = analyticsResponse.coverage.progress_by_area.find((ac: any) => ac.area === mc.area_name);
    if (!backendCov) {
      discrepancies.push({
        issue_type: "Missing Coverage Area in Analytics",
        affected_entity: `coverage_area: ${mc.area_name}`,
        expected_value: mc.area_name,
        actual_value: null,
        likely_cause: "Coverage area might be inactive or excluded by Analytics query."
      });
    } else {
      if (mc.collected !== backendCov.collected) {
        discrepancies.push({
          issue_type: "Coverage Collected Units Mismatch",
          affected_entity: `coverage_area: ${mc.area_name}`,
          expected_value: mc.collected,
          actual_value: backendCov.collected,
          likely_cause: "Event-to-coverage area matching differs between raw data join and manual loop. Check if Iriga collected units = 0."
        });
      }
    }
  });

  // Specifically check for Iriga event as mentioned in user prompt
  const irigaEvent = events?.find(e => e.title.includes('Iriga') || e.address?.includes('Iriga'));
  if (irigaEvent) {
    if (irigaEvent.status !== 'completed') {
      discrepancies.push({
        issue_type: "Iriga Event Not Completed",
        affected_entity: `event: ${irigaEvent.title}`,
        expected_value: 'completed',
        actual_value: irigaEvent.status,
        likely_cause: "Event must be in completed status to count collected units."
      });
    } else {
      const match = matchingData.find(m => m.event_id === irigaEvent.id);
      if (!match?.matched_coverage_area_id) {
         discrepancies.push({
            issue_type: "Iriga Event Coverage Area Unmatched",
            affected_entity: `event: ${irigaEvent.title}`,
            expected_value: "Matched Coverage Area",
            actual_value: "no_match",
            likely_cause: "Event does not have coverage_area_id, coverage_area_psgc_code, or normalized_key correctly linked to a Coverage Area."
         });
      }
    }
  } else {
    discrepancies.push({
      issue_type: "Iriga Event Missing",
      affected_entity: `event: Iriga`,
      expected_value: "Exists in raw events",
      actual_value: "Not found",
      likely_cause: "Event was deleted, never created, or is under a different name."
    });
  }

  writeJson('13_discrepancy_report.json', discrepancies, `Discrepancy Report`);

  console.log("Export complete!");
}

exportData().catch(console.error);
