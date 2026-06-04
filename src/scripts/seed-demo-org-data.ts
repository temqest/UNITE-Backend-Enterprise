import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
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

// Check args
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isReset = args.includes('--reset-demo-seed');

const STAFF = [
  { first_name: 'Maria', last_name: 'Santos', email: 'maria.santos@demo.com', role: 'event_coordinator', location: 'City of Naga' },
  { first_name: 'Joseph', last_name: 'Reyes', email: 'joseph.reyes@demo.com', role: 'inventory_staff', location: 'Pili' },
  { first_name: 'Ana', last_name: 'Villanueva', email: 'ana.villanueva@demo.com', role: 'coordinator', location: 'City of Iriga' },
  { first_name: 'Carlo', last_name: 'Mendoza', email: 'carlo.mendoza@demo.com', role: 'field_staff', location: 'Calabanga' },
  { first_name: 'Grace', last_name: 'Mercado', email: 'grace.mercado@demo.com', role: 'donor_relations', location: 'Legazpi City' }
];

const COVERAGE_AREAS = [
  { area_name: 'City of Naga', area_type: 'city', province: 'Camarines Sur', municipality: 'Naga City', normalized_area_key: 'camarines-sur_naga-city', target_units: 500, psgc_code: '051724000' },
  { area_name: 'City of Iriga', area_type: 'city', province: 'Camarines Sur', municipality: 'Iriga City', normalized_area_key: 'camarines-sur_iriga-city', target_units: 350, psgc_code: '501716000' },
  { area_name: 'Pili', area_type: 'municipality', province: 'Camarines Sur', municipality: 'Pili', normalized_area_key: 'camarines-sur_pili', target_units: 300, psgc_code: '501728000' },
  { area_name: 'Calabanga', area_type: 'municipality', province: 'Camarines Sur', municipality: 'Calabanga', normalized_area_key: 'camarines-sur_calabanga', target_units: 200, psgc_code: null },
  { area_name: 'Baao', area_type: 'municipality', province: 'Camarines Sur', municipality: 'Baao', normalized_area_key: 'camarines-sur_baao', target_units: 150, psgc_code: '501701000' },
  { area_name: 'Bato', area_type: 'municipality', province: 'Camarines Sur', municipality: 'Bato', normalized_area_key: 'camarines-sur_bato', target_units: 100, psgc_code: null },
  { area_name: 'Daet', area_type: 'municipality', province: 'Camarines Norte', municipality: 'Daet', normalized_area_key: 'camarines-norte_daet', target_units: 250, psgc_code: '051603000' },
  { area_name: 'Legazpi City', area_type: 'city', province: 'Albay', municipality: 'Legazpi City', normalized_area_key: 'albay_legazpi-city', target_units: 400, psgc_code: '050506000' },
  { area_name: 'Masbate City', area_type: 'city', province: 'Masbate', municipality: 'Masbate City', normalized_area_key: 'masbate_masbate-city', target_units: 250, psgc_code: '054111000' }
];

const LOCATIONS: Record<string, { lat: number, lng: number }> = {
  'City of Naga': { lat: 13.6218, lng: 123.1948 },
  'City of Iriga': { lat: 13.4217, lng: 123.4182 },
  'Pili': { lat: 13.5833, lng: 123.2833 },
  'Calabanga': { lat: 13.7083, lng: 123.1861 },
  'Baao': { lat: 13.4500, lng: 123.3667 },
  'Legazpi City': { lat: 13.1391, lng: 123.7345 },
  'Masbate City': { lat: 12.3667, lng: 123.6167 },
  'Daet': { lat: 14.1167, lng: 122.9500 },
  'Bato': { lat: 13.3500, lng: 123.3667 }
};

const INVENTORY = [
  { blood_type: 'A+', quantity: 42, min_threshold: 15 },
  { blood_type: 'A-', quantity: 12, min_threshold: 10 },
  { blood_type: 'B+', quantity: 35, min_threshold: 15 },
  { blood_type: 'B-', quantity: 8, min_threshold: 10 },
  { blood_type: 'AB+', quantity: 10, min_threshold: 5 },
  { blood_type: 'AB-', quantity: 4, min_threshold: 5 },
  { blood_type: 'O+', quantity: 25, min_threshold: 40 }, // Code Red
  { blood_type: 'O-', quantity: 5, min_threshold: 15 }   // Code Red
];

async function runSeed() {
  console.log(`\n=== Starting Demo Data Seeding for Org: ${DEMO_ORG_ID} ===\n`);
  
  if (isDryRun) {
    console.log("[DRY RUN MODE] No data will be written.\n");
    return;
  }

  try {
    // 1. Coverage Areas
    let coverageMap: Record<string, any> = {};
    for (const area of COVERAGE_AREAS) {
      const { data: existing } = await supabase
        .from('organization_coverage_areas')
        .select('*')
        .eq('org_id', DEMO_ORG_ID)
        .eq('normalized_area_key', area.normalized_area_key)
        .single();
      
      if (existing) {
        coverageMap[area.area_name] = existing;
      } else {
        const { data, error } = await supabase
          .from('organization_coverage_areas')
          .insert({
            org_id: DEMO_ORG_ID,
            area_name: area.area_name,
            area_type: area.area_type,
            province: area.province,
            municipality: area.municipality,
            normalized_area_key: area.normalized_area_key,
            psgc_code: area.psgc_code,
            target_units: area.target_units,
            notes: 'demo_seed: true'
          })
          .select()
          .single();
        if (error) throw error;
        coverageMap[area.area_name] = data;
      }
    }
    console.log(`✅ Coverage Areas: ensured ${COVERAGE_AREAS.length} records.`);

    // 2. Staff Users
    let staffMap: Record<string, any> = {};
    for (const staff of STAFF) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('org_id', DEMO_ORG_ID)
        .eq('email', staff.email)
        .single();

      if (existingUser) {
        staffMap[staff.email] = existingUser;
      } else {
        // Find or create in auth.users
        let { data: authUsers } = await supabase.auth.admin.listUsers();
        let authUser = authUsers?.users?.find(u => u.email === staff.email);
        
        if (!authUser) {
          const { data, error } = await supabase.auth.admin.createUser({
            email: staff.email,
            password: 'Password123!',
            email_confirm: true,
          });
          if (error) throw error;
          authUser = data.user;
        }

        const { data, error } = await supabase
          .from('users')
          .insert({
            org_id: DEMO_ORG_ID,
            auth_id: authUser!.id,
            email: staff.email,
            first_name: staff.first_name,
            last_name: staff.last_name,
            role: { type: 'staff', permissions: [staff.role] },
            geographic_area: { description: staff.location }
          })
          .select()
          .single();
        if (error) throw error;
        staffMap[staff.email] = data;
      }
    }
    console.log(`✅ Staff Users: ensured ${STAFF.length} records.`);

    // 3. Events & Results
    const now = new Date();
    const pastDate = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const futureDate = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const EVENTS = [
      // Completed Events
      { title: 'Naga Community Blood Drive', type: 'blood_drive', status: 'completed', setup_status: 'complete', event_date: pastDate(30), visibility: 'public', is_public: true, loc: 'City of Naga', target: 200, collected: 260, donors: 280, wastage: 2 },
      { title: 'Iriga City Donation Drive', type: 'blood_drive', status: 'completed', setup_status: 'complete', event_date: pastDate(20), visibility: 'public', is_public: true, loc: 'City of Iriga', target: 150, collected: 180, donors: 190, wastage: 1 },
      { title: 'Pili Campus Bloodletting', type: 'blood_drive', status: 'completed', setup_status: 'complete', event_date: pastDate(10), visibility: 'internal', is_public: false, loc: 'Pili', target: 120, collected: 95, donors: 105, wastage: 0 },
      { title: 'Calabanga Barangay Outreach', type: 'blood_drive', status: 'completed', setup_status: 'complete', event_date: pastDate(5), visibility: 'internal', is_public: false, loc: 'Calabanga', target: 80, collected: 34, donors: 40, wastage: 0 },
      { title: 'Baao Municipal Blood Drive', type: 'blood_drive', status: 'completed', setup_status: 'complete', event_date: pastDate(2), visibility: 'internal', is_public: false, loc: 'Baao', target: 100, collected: 110, donors: 120, wastage: 1 },
      
      // Upcoming Public Events
      { title: 'Legazpi Public Donation Day', type: 'blood_drive', status: 'published', setup_status: 'complete', event_date: futureDate(5), visibility: 'public', is_public: true, loc: 'Legazpi City', target: 300 },
      { title: 'Naga Community Blood Drive - Phase 2', type: 'blood_drive', status: 'published', setup_status: 'complete', event_date: futureDate(10), visibility: 'public', is_public: true, loc: 'City of Naga', target: 250 },
      { title: 'Masbate Community Blood Drive', type: 'blood_drive', status: 'published', setup_status: 'complete', event_date: futureDate(15), visibility: 'public', is_public: true, loc: 'Masbate City', target: 200 },
      
      // Plotted Events
      { title: 'Bato Health Center Donation Day', type: 'blood_drive', status: 'plotted', setup_status: 'needs_details', event_date: futureDate(20), visibility: 'internal', is_public: false, loc: 'Bato', target: 100, creation_method: 'plotting_calendar' },
      { title: 'Daet Provincial Bloodletting', type: 'blood_drive', status: 'plotted', setup_status: 'needs_details', event_date: futureDate(25), visibility: 'internal', is_public: false, loc: 'Daet', target: 150, creation_method: 'plotting_calendar' },
      
      // Draft / Cancelled
      { title: 'Draft Iriga Event', type: 'blood_drive', status: 'draft', setup_status: 'needs_details', event_date: futureDate(30), visibility: 'internal', is_public: false, loc: 'City of Iriga', target: 50 },
      { title: 'Cancelled Legazpi Event', type: 'blood_drive', status: 'cancelled', setup_status: 'complete', event_date: pastDate(1), visibility: 'public', is_public: true, loc: 'Legazpi City', target: 100 }
    ];

    let eventsMap: Record<string, any> = {};
    for (const evt of EVENTS) {
      const { data: existing } = await supabase
        .from('events')
        .select('*')
        .eq('org_id', DEMO_ORG_ID)
        .eq('title', evt.title)
        .eq('event_date', evt.event_date)
        .single();
      
      const coverage = coverageMap[evt.loc];
      const coords = LOCATIONS[evt.loc] || { lat: 13.6218, lng: 123.1948 };

      if (existing) {
        // Update results just in case
        if (evt.status === 'completed' && !existing.actual_collected_bags) {
          const { data } = await supabase.from('events').update({
            actual_collected_bags: evt.collected,
            actual_donors: evt.donors,
            wastage_units: evt.wastage,
            post_event_notes: 'demo_seed: true'
          }).eq('id', existing.id).select().single();
          eventsMap[evt.title] = data || existing;
        } else {
          eventsMap[evt.title] = existing;
        }
      } else {
        const { data, error } = await supabase
          .from('events')
          .insert({
            org_id: DEMO_ORG_ID,
            title: evt.title,
            type: evt.type,
            status: evt.status,
            setup_status: evt.setup_status,
            event_date: evt.event_date,
            start_time: '08:00',
            end_time: '17:00',
            visibility: evt.visibility,
            is_public: evt.is_public,
            creation_method: evt.creation_method || 'manual',
            address: `${evt.loc} Main Center`,
            latitude: coords.lat,
            longitude: coords.lng,
            coverage_area_id: coverage?.id,
            coverage_area_psgc_code: coverage?.psgc_code,
            coverage_area_normalized_key: coverage?.normalized_area_key,
            extra_data: { target_donation: evt.target, collected_blood: evt.collected || 0 },
            actual_collected_bags: evt.collected || null,
            actual_donors: evt.donors || null,
            wastage_units: evt.wastage || null,
            post_event_notes: 'demo_seed: true',
            description: `A demo ${evt.type} event located at ${evt.loc}.`
          })
          .select()
          .single();
        if (error) throw error;
        eventsMap[evt.title] = data;
      }
    }
    console.log(`✅ Events & Results: ensured ${EVENTS.length} records.`);

    // 4. Plotting Calendars
    const { data: existingCal } = await supabase
      .from('plotting_calendars')
      .select('*')
      .eq('org_id', DEMO_ORG_ID)
      .eq('title', 'June–July Public Blood Drive Slots')
      .single();

    if (!existingCal) {
      const allowedDates = [futureDate(20), futureDate(25), futureDate(30)];
      const { data: cal, error } = await supabase
        .from('plotting_calendars')
        .insert({
          org_id: DEMO_ORG_ID,
          title: 'June–July Public Blood Drive Slots',
          description: 'demo_seed: true',
          access_type: 'organization_link',
          status: 'active',
          allowed_dates: allowedDates,
          allowed_event_types: ['blood_drive'],
          max_events_per_date: 2
        })
        .select()
        .single();
      if (error) throw error;
      
      for (const d of allowedDates) {
        await supabase.from('plotting_calendar_days').insert({
          plotting_calendar_id: cal.id,
          date: d,
          availability_mode: 'flexible',
          flexible_starts_at: '08:00:00',
          flexible_ends_at: '17:00:00',
          max_events_for_day: 2,
          status: 'open'
        });
      }
      
      // Link the plotted events to this calendar
      await supabase.from('events').update({ plotting_calendar_id: cal.id })
        .eq('org_id', DEMO_ORG_ID)
        .eq('creation_method', 'plotting_calendar');
    }
    console.log(`✅ Plotting Calendars: ensured calendar exists.`);

    // 5. Inventory & Transactions
    let addedInventory = false;
    for (const inv of INVENTORY) {
      const { data: existingInvs, error: existErr } = await supabase
        .from('blood_inventory')
        .select('*')
        .eq('org_id', DEMO_ORG_ID)
        .eq('blood_type', inv.blood_type)
        .limit(1);
      
      let existingInv = existingInvs && existingInvs.length > 0 ? existingInvs[0] : null;
      let invRecord = existingInv;
      if (!existingInv) {
        const { data, error } = await supabase
          .from('blood_inventory')
          .insert({
            org_id: DEMO_ORG_ID,
            blood_type: inv.blood_type,
            quantity: inv.quantity,
            min_threshold: inv.min_threshold,
            location: 'Main Blood Bank'
          })
          .select()
          .single();
        if (error) throw error;
        invRecord = data;
        addedInventory = true;
      }
      
      // If we just added inventory, or want to seed transactions
      if (addedInventory || !existingInv) {
        // check if transactions exist
        const { data: txs } = await supabase.from('blood_inventory_transactions')
          .select('id').eq('org_id', DEMO_ORG_ID).eq('blood_type', inv.blood_type).limit(1);
        
        if (!txs || txs.length === 0) {
          await supabase.from('blood_inventory_transactions').insert({
            org_id: DEMO_ORG_ID,
            blood_type: inv.blood_type,
            transaction_type: 'add_stock',
            direction: 'in',
            quantity: inv.quantity,
            location: 'Main Blood Bank',
            notes: 'demo_seed: true'
          });
        }
      }
    }
    console.log(`✅ Inventory & Transactions: ensured ${INVENTORY.length} blood types.`);

    console.log("\n✅ Demo Seeding Completed Successfully.");
  } catch (err) {
    console.error("❌ Seeding Error:", err);
  }
}

runSeed();
