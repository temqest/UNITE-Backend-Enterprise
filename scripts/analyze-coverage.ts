import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY! || process.env.SUPABSE_SERVICE_ROLE_KEY!);
const DEMO_ORG_ID = '1fa1539b-694b-4344-9b22-3a2d18ca6b84';

async function analyze() {
  const { data, error } = await supabase.from('organization_coverage_areas').select('*').eq('org_id', DEMO_ORG_ID);
  if (error) { console.error(error); return; }

  console.log(`Total coverage areas: ${data.length}`);
  
  const groups: Record<string, any[]> = {};
  for (const row of data) {
    const key = row.area_name.trim().toLowerCase();
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }

  const duplicates = Object.entries(groups).filter(([k, v]) => v.length > 1);
  console.log(`\nFound ${duplicates.length} duplicate groups.`);
  for (const [k, v] of duplicates) {
    console.log(`\nGroup: ${k} (${v.length} records)`);
    v.forEach(r => {
      console.log(`  - ID: ${r.id}, Name: ${r.area_name}, PSGC: ${r.psgc_code}, Key: ${r.normalized_area_key}, Target: ${r.target_units}, Created: ${r.created_at}`);
    });
  }

  fs.writeFileSync('debug/coverage-area-analysis.json', JSON.stringify({ total: data.length, groups, duplicates: duplicates.map(([k,v]) => ({ key: k, records: v })) }, null, 2));
}

analyze();
