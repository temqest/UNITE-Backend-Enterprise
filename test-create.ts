import { createClient } from '@supabase/supabase-js';
import { EventService } from './src/services/events/event.service';

const supabase = createClient('https://pbtufpfhndtlzwxkpugp.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBidHVmcGZobmR0bHp3eGtwdWdwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUyNDU0NiwiZXhwIjoyMDg3MTAwNTQ2fQ.oZcKp7SXwNxp18YhzpDepZi_LlnKXAOrW-1jlY7nApk');

async function check() {
  const service = new EventService(supabase);
  const actor = {
    id: 'b733ec80-37c8-44b7-97d6-90b78675c4dc', 
    org_id: '1fa1539b-694b-4344-9b22-3a2d18ca6b84',
    role: { type: 'admin', permissions: ['events.create', 'events.approve'] },
    is_active: true,
    geographic_area: null
  };
  
  const payload = {
    org_id: '1fa1539b-694b-4344-9b22-3a2d18ca6b84',
    title: 'QA Single Event Creation Verification',
    type: 'blood_drive' as any,
    event_date: '2026-06-15',
    hosting_organization: 'Demo Org',
    status: 'published' as any,
    coverage_area_boundary_id: 'some-boundary',
    extra_data: {},
    creation_method: 'manual' as any
  };

  const result = await service.createEvent(actor, payload);
  console.log(JSON.stringify(result, null, 2));
}

check().catch(console.error);
