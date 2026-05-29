import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

type EventRow = {
  id: string;
  org_id: string;
  title: string;
  event_date: string;
  status: string;
  creation_method: string;
  plotting_calendar_id: string | null;
};

type Options = {
  execute: boolean;
  allPlotted: boolean;
  orgId?: string;
  calendarId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
};

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function requireEnv(...names: string[]): string {
  for (const name of names) {
    const value = readEnv(name);
    if (value) return value;
  }

  throw new Error(`Missing required environment variable. Expected one of: ${names.join(', ')}`);
}

function printUsage(): void {
  console.log(`
Usage:
  npx ts-node scripts/clear-plotted-events.ts [options]

Safety:
  - Dry run by default
  - Only targets plotting-calendar-created events
  - Requires at least one filter unless --all-plotted is passed

Options:
  --execute              Actually delete the matched events
  --all-plotted          Allow clearing all plotted events across all orgs/calendars
  --org-id <uuid>        Only delete events for one organization
  --calendar-id <uuid>   Only delete events linked to one plotting calendar
  --status <status>      Only delete events with a matching status
  --from-date <date>     Only delete events on/after YYYY-MM-DD
  --to-date <date>       Only delete events on/before YYYY-MM-DD
  --help                 Show this message

Examples:
  npx ts-node scripts/clear-plotted-events.ts --calendar-id <calendar-id>
  npx ts-node scripts/clear-plotted-events.ts --org-id <org-id> --from-date 2026-06-01 --to-date 2026-06-30
  npx ts-node scripts/clear-plotted-events.ts --calendar-id <calendar-id> --execute
`);
}

function assertDate(value: string, flag: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${flag} value "${value}". Expected YYYY-MM-DD.`);
  }

  return value;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    execute: false,
    allPlotted: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--execute':
        options.execute = true;
        break;
      case '--all-plotted':
        options.allPlotted = true;
        break;
      case '--org-id':
        options.orgId = argv[++index];
        break;
      case '--calendar-id':
        options.calendarId = argv[++index];
        break;
      case '--status':
        options.status = argv[++index];
        break;
      case '--from-date':
        options.fromDate = assertDate(argv[++index], '--from-date');
        break;
      case '--to-date':
        options.toDate = assertDate(argv[++index], '--to-date');
        break;
      case '--help':
        printUsage();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.allPlotted && !options.orgId && !options.calendarId && !options.status && !options.fromDate && !options.toDate) {
    throw new Error('Refusing to continue without a filter. Pass --calendar-id, --org-id, or another filter, or use --all-plotted explicitly.');
  }

  return options;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABSE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  let query = supabase
    .from('events')
    .select('id, org_id, title, event_date, status, creation_method, plotting_calendar_id')
    .eq('creation_method', 'plotting_calendar')
    .order('event_date', { ascending: true });

  if (options.orgId) {
    query = query.eq('org_id', options.orgId);
  }

  if (options.calendarId) {
    query = query.eq('plotting_calendar_id', options.calendarId);
  }

  if (options.status) {
    query = query.eq('status', options.status);
  }

  if (options.fromDate) {
    query = query.gte('event_date', options.fromDate);
  }

  if (options.toDate) {
    query = query.lte('event_date', options.toDate);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load events: ${error.message}`);
  }

  const events = (data ?? []) as EventRow[];

  console.log(`Matched ${events.length} plotted event(s).`);
  if (events.length > 0) {
    for (const event of events.slice(0, 20)) {
      console.log(
        `- ${event.event_date} | ${event.title} | status=${event.status} | org=${event.org_id} | calendar=${event.plotting_calendar_id ?? 'none'}`
      );
    }

    if (events.length > 20) {
      console.log(`...and ${events.length - 20} more.`);
    }
  }

  if (!options.execute) {
    console.log('\nDry run only. Re-run with --execute to delete these events.');
    return;
  }

  if (events.length === 0) {
    console.log('\nNothing to delete.');
    return;
  }

  let deletedCount = 0;
  for (const idChunk of chunk(events.map((event) => event.id), 200)) {
    const { error: deleteError, count } = await supabase
      .from('events')
      .delete({ count: 'exact' })
      .in('id', idChunk);

    if (deleteError) {
      throw new Error(`Failed while deleting events: ${deleteError.message}`);
    }

    deletedCount += count ?? idChunk.length;
  }

  console.log(`\nDeleted ${deletedCount} plotted event(s).`);
  console.log('Dependent rows in event_staff, event_participants, and event_approvals were removed by cascade.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
