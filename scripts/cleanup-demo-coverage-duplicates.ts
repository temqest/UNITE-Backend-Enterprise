import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABSE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const DEMO_ORG_ID = '1fa1539b-694b-4344-9b22-3a2d18ca6b84';

async function cleanup() {
  console.log(`Starting Coverage Area deduplication for org: ${DEMO_ORG_ID}...`);

  const { data, error } = await supabase.from('organization_coverage_areas').select('*').eq('org_id', DEMO_ORG_ID);
  if (error) { console.error("Error fetching coverage areas:", error); return; }

  const groups: Record<string, any[]> = {};
  for (const row of data) {
    const key = row.area_name.trim().toLowerCase();
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }

  const duplicates = Object.entries(groups).filter(([k, v]) => v.length > 1);
  console.log(`Found ${duplicates.length} duplicate groups.`);

  let report = {
    total_raw_records: data.length,
    duplicate_groups: duplicates.length,
    actions: [] as any[]
  };

  for (const [key, records] of duplicates) {
    console.log(`Processing group: ${key}`);

    // The canonical record should be the one from the seed script (has a valid normalized_area_key like 'camarines-sur_naga-city' not '||...|')
    let canonical = records.find(r => r.normalized_area_key && !r.normalized_area_key.startsWith('||'));
    if (!canonical) canonical = records.find(r => r.normalized_area_key);
    if (!canonical) canonical = records[0];

    // Merge in psgc_code from others
    const psgcSource = records.find(r => r.psgc_code);
    const newPsgc = canonical.psgc_code || psgcSource?.psgc_code;

    // Optional: merge target units
    const bestTarget = Math.max(...records.map(r => r.target_units || 0));

    // Update canonical if needed
    if (canonical.psgc_code !== newPsgc || canonical.target_units !== bestTarget) {
      const { error: updateErr } = await supabase.from('organization_coverage_areas').update({
        psgc_code: newPsgc,
        target_units: bestTarget
      }).eq('id', canonical.id);
      
      if (updateErr) console.error(`Failed to update canonical record ${canonical.id}:`, updateErr);
      else console.log(`Updated canonical record ${canonical.id} with psgc_code: ${newPsgc}`);
    }

    // Process others
    for (const record of records) {
      if (record.id === canonical.id) continue;

      // Reassign events
      const { data: events, error: evErr } = await supabase.from('events').select('id').eq('coverage_area_id', record.id);
      if (evErr) console.error("Error fetching events for old area:", evErr);
      
      if (events && events.length > 0) {
        console.log(`Reassigning ${events.length} events from ${record.id} to ${canonical.id}`);
        const { error: evUpdateErr } = await supabase.from('events').update({
          coverage_area_id: canonical.id,
          coverage_area_psgc_code: newPsgc,
          coverage_area_normalized_key: canonical.normalized_area_key
        }).eq('coverage_area_id', record.id);
        if (evUpdateErr) console.error("Error updating events:", evUpdateErr);
      }

      // Delete the duplicate
      console.log(`Deleting duplicate record ${record.id}`);
      const { error: delErr } = await supabase.from('organization_coverage_areas').delete().eq('id', record.id);
      if (delErr) console.error("Error deleting duplicate:", delErr);

      report.actions.push({
        action: 'merge_and_delete',
        group: key,
        canonical_id: canonical.id,
        deleted_id: record.id,
        reassigned_events: events?.length || 0
      });
    }
  }

  // Create Unique Constraint
  console.log("Applying unique constraint...");
  // We can't use RPC without setting it up, but we can do it if `pg` is available.
  // Wait, supabase-js does not support raw SQL unless via RPC. 
  // If we can't run raw SQL, we just have to rely on the app logic, but it's better to add via RPC if we have one, 
  // or we can just update the AI_PROJECT_GUIDE to mention it. 
  // I'll try to invoke a generic SQL RPC, but if none exists, I'll print the SQL to the console.

  console.log(`
  -- To enforce uniqueness at the database level, please run this SQL in your Supabase SQL editor:
  CREATE UNIQUE INDEX IF NOT EXISTS organization_coverage_areas_org_normalized_key_idx 
  ON public.organization_coverage_areas (org_id, normalized_area_key);
  `);

  if (!fs.existsSync('debug')) fs.mkdirSync('debug');
  fs.writeFileSync('debug/coverage-area-dedupe-report.json', JSON.stringify(report, null, 2));
  console.log("Deduplication complete. See debug/coverage-area-dedupe-report.json for details.");
}

cleanup();
