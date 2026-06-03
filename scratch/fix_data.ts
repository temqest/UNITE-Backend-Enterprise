import { supabaseAdmin } from '../src/lib/supabase/supabase.client';

async function fixData() {
  console.log('Starting data fix...');
  
  // Fix Iriga Blood (429f1f46-a33c-4f77-9ae8-5b1580caf72a)
  // @ts-ignore
  const { data: e1, error: err1 } = await supabaseAdmin
    .from<any, any>('events')
    .update({
      coverage_area_id: '3ed6037a-5ceb-4c66-8731-ddce7a96ab7a',
      coverage_area_psgc_code: '501716000',
      coverage_area_boundary_id: 'iriga-city',
      coverage_area_name: 'City of Iriga',
      coverage_area_province: 'Camarines Sur',
      coverage_area_municipality: 'City of Iriga',
      coverage_area_normalized_key: 'bicol-region|camarines-sur|city-of-iriga|'
    })
    .eq('id', '429f1f46-a33c-4f77-9ae8-5b1580caf72a')
    .select();
    
  if (err1) {
    console.error('Error updating Iriga Blood:', err1);
  } else {
    console.log('Updated Iriga Blood geographic fields:', e1?.length);
  }

  // Fix Iriga Birthday (3ef800c0-6e16-4ef2-80a7-03fe319554e7)
  // @ts-ignore
  const { data: e2, error: err2 } = await supabaseAdmin
    .from<any, any>('events')
    .update({
      status: 'completed'
    })
    .eq('id', '3ef800c0-6e16-4ef2-80a7-03fe319554e7')
    .select();
    
  if (err2) {
    console.error('Error updating Iriga Birthday:', err2);
  } else {
    console.log('Updated Iriga Birthday to completed:', e2?.length);
  }
}

fixData().catch(console.error);
