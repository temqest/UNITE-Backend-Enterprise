# System Logs Module

## Overview

Immutable audit trail for tracking all critical actions across the multi-tenant blood bank SaaS platform. Designed for compliance, security auditing, and operational troubleshooting.

## Core Principles

- **Immutability**: Logs cannot be updated or deleted by users (only admin purge via `purge_old_system_logs()`)
- **Multi-tenancy**: All logs scoped to `org_id`, RLS enforces isolation
- **Extensibility**: Generic `category` + `action_type` + JSONB `payload` allows future modules without schema changes
- **Auto-logging**: Postgres triggers capture key events (event creation, approvals, participant joins)
- **Compliance**: Timestamped, IP-tracked, immutable records for regulatory requirements (HIPAA, GDPR audit trails)

## Schema Design

### Key Fields

| Field         | Type      | Purpose                                                      |
| ------------- | --------- | ------------------------------------------------------------ |
| `id`          | UUID      | Primary key                                                  |
| `org_id`      | UUID      | Multi-tenant isolation (CASCADE DELETE with organizations)   |
| `user_id`     | UUID      | Actor who performed action (SET NULL if user deleted)        |
| `category`    | TEXT      | High-level classification (events, users, staff, etc.)       |
| `action_type` | TEXT      | Specific action (event_approved, staff_rejected, etc.)       |
| `entity_type` | TEXT      | Type of entity acted upon (event, user, donation, etc.)      |
| `entity_id`   | UUID      | ID of the entity                                             |
| `payload`     | JSONB     | Flexible metadata (before/after states, reason, etc.)        |
| `notes`       | TEXT      | Human-readable description                                   |
| `status`      | TEXT      | Outcome (approved, rejected, completed, failed, etc.)        |
| `ip_address`  | INET      | Client IP for security auditing                              |
| `user_agent`  | TEXT      | Browser/app info                                             |
| `created_at`  | TIMESTAMP | Immutable creation time                                      |

### Indexes

- Composite: `org_id + created_at + category` for fast filtered queries
- Entity lookup: `entity_type + entity_id` for "show all logs for this event"
- JSONB GIN: `payload` for flexible JSON queries (`payload @> '{"status": "approved"}'`)

## Auto-Logging with Triggers

### Example: Event Approval

When an event's status changes to `approved`, a trigger automatically creates a log:

```sql
CREATE TRIGGER trigger_log_event_status_change
AFTER UPDATE ON events
FOR EACH ROW 
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION log_event_status_change();
```

**Payload structure**:

```json
{
  "before": { "status": "pending" },
  "after": { "status": "approved" },
  "event_name": "Spring Blood Drive"
}
```

### Triggers to Implement

1. ✅ **Event created** → `log_event_created()`
2. ✅ **Event status change** → `log_event_status_change()` (approval/rejection/cancellation)
3. ✅ **Participant joined** → `log_participant_joined()`
4. ✅ **Staff approval** → `log_staff_approval()` (when `users.is_approved` changes)
5. 🔜 **Donation recorded** → `log_donation_recorded()` (future)
6. 🔜 **Inventory change** → `log_inventory_change()` (future)

### When to Use Triggers vs Manual Logging

- **Triggers**: Database-level changes (status updates, approvals, row insertions)
- **Manual (`create_system_log()`)**: App-level logic (login, password reset, bulk operations, API calls)

## RLS Policies

| Operation | Policy                                                       |
| --------- | ------------------------------------------------------------ |
| SELECT    | Allowed for admins/super_admins with `view_logs` permission |
| INSERT    | Via SECURITY DEFINER functions only (triggers, services)    |
| UPDATE    | **DENIED** (immutable)                                       |
| DELETE    | **DENIED** (except via `purge_old_system_logs()`)            |

### Admin-Only Access

```sql
CREATE POLICY system_logs_select_policy ON system_logs
    FOR SELECT
    USING (
        org_id = current_user_org_id() 
        AND user_has_permission('view_logs')
    );
```

Regular users **cannot** see logs. Only admins with explicit `view_logs` permission.

## Querying Logs

### Common Queries

#### 1. All logs for a specific event

```sql
SELECT * FROM system_logs
WHERE entity_type = 'event' 
  AND entity_id = '<event_uuid>'
  AND org_id = current_user_org_id()
ORDER BY created_at DESC;
```

#### 2. All approval/rejection actions in last 30 days

```sql
SELECT * FROM system_logs
WHERE action_type IN ('event_approved', 'event_rejected', 'staff_approved', 'staff_rejected')
  AND created_at > NOW() - INTERVAL '30 days'
  AND org_id = current_user_org_id()
ORDER BY created_at DESC;
```

#### 3. All actions by a specific user

```sql
SELECT * FROM system_logs
WHERE user_id = '<user_uuid>'
  AND org_id = current_user_org_id()
ORDER BY created_at DESC;
```

#### 4. Search payload for specific reason

```sql
SELECT * FROM system_logs
WHERE payload @> '{"reason": "Venue unavailable"}'
  AND org_id = current_user_org_id();
```

#### 5. Login attempts from suspicious IPs

```sql
SELECT * FROM system_logs
WHERE action_type = 'login'
  AND ip_address = '<suspicious_ip>'
  AND created_at > NOW() - INTERVAL '7 days';
```

## Manual Logging from Application

Use `create_system_log()` function:

```typescript
// Example: Log password reset
await supabase.rpc('create_system_log', {
  p_org_id: user.org_id,
  p_user_id: user.id,
  p_category: 'auth',
  p_action_type: 'password_reset',
  p_payload: {
    reset_method: 'email',
    ip_address: req.ip,
  },
  p_ip_address: req.ip,
  p_user_agent: req.headers['user-agent'],
});
```

## Data Retention & Compliance

### Retention Policy

- **Default**: Keep all logs indefinitely (storage-permitting)
- **Compliance**: Some regulations require 7+ years for medical/financial records
- **Purge**: Use `purge_old_system_logs()` for GDPR "right to erasure" (org-level purge only)

### Purge Function (Admin Only)

```sql
SELECT purge_old_system_logs(
  p_org_id := '<org_uuid>',
  p_older_than_days := 365
);
```

This deletes logs older than 365 days and creates a log of the purge itself.

### HIPAA/GDPR Considerations

- ✅ **Immutable**: Logs cannot be tampered with
- ✅ **Timestamped**: Precise audit trail
- ✅ **Actor tracking**: `user_id` + `ip_address` for accountability
- ✅ **Selective purge**: Admins can delete org-specific logs (GDPR erasure)
- ⚠️ **PII in payload**: Avoid storing sensitive personal data in `payload` (use entity references instead)

## Extensibility for Future Modules

### Adding New Categories

1. Update `category` CHECK constraint in `schema.sql`:

```sql
CHECK (category IN ('events', 'users', 'staff', 'participants', 'donations', 'inventory', 'blood_tests', 'shipments', 'system', 'auth'))
```

2. Add corresponding `action_type` values

3. Update TypeScript types in `types.ts`

### Adding New Action Types

No schema migration needed! Just:

1. Update `action_type` CHECK constraint
2. Update TypeScript union in `types.ts`
3. Create trigger or use `create_system_log()` in service

### Example: Blood Test Results

```sql
-- Future action_type
'blood_test_completed', 'blood_test_failed', 'blood_test_reviewed'

-- Future trigger
CREATE TRIGGER trigger_log_blood_test_completed
AFTER INSERT ON blood_tests
FOR EACH ROW EXECUTE FUNCTION log_blood_test_completed();
```

## Performance Considerations

- **Index usage**: Composite indexes optimize queries by org + date + category
- **JSONB queries**: Use GIN index for fast payload searches
- **Partition by date**: For high-volume orgs, consider table partitioning by `created_at` (monthly/yearly)
- **Archival**: Move old logs to cold storage (S3, data warehouse) after 1-2 years

## Security Best Practices

1. **Never log passwords or tokens** in `payload`
2. **Sanitize user input** in `notes` field
3. **Rate limit** log queries to prevent DoS
4. **Encrypt at rest** (Supabase default)
5. **Alert on suspicious patterns** (e.g., 100+ failed logins from one IP)

## Integration Checklist

- [ ] Deploy `schema.sql` to database
- [ ] Deploy `rls.sql` policies
- [ ] Uncomment triggers in `schema.sql` after verifying table structures
- [ ] Add `view_logs` permission to admin roles in `user_settings` or `organization_settings`
- [ ] Implement TypeScript service layer using `types.ts`
- [ ] Add log viewer UI for admins (table with filters: date range, category, user, action)
- [ ] Set up alerts for critical actions (staff_approved, data_purge, etc.)
- [ ] Configure data retention policy (manual purge vs. automated archival)

## Example Integration in Service Layer

```typescript
// services/system-logs/system-logs.service.ts
import { supabase } from '@/config/supabase';
import { SystemLogCreateInput, SystemLogQueryFilters, SystemLogQueryResponse } from '@/models/system_logs/types';

export async function createLog(input: SystemLogCreateInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_system_log', {
    p_org_id: input.org_id,
    p_user_id: input.user_id,
    p_category: input.category,
    p_action_type: input.action_type,
    p_entity_type: input.entity_type || null,
    p_entity_id: input.entity_id || null,
    p_payload: input.payload || {},
    p_notes: input.notes || null,
    p_status: input.status || null,
    p_ip_address: input.ip_address || null,
    p_user_agent: input.user_agent || null,
  });

  if (error) throw error;
  return data;
}

export async function queryLogs(filters: SystemLogQueryFilters): Promise<SystemLogQueryResponse> {
  let query = supabase
    .from('system_logs')
    .select('*', { count: 'exact' })
    .eq('org_id', filters.org_id);

  if (filters.user_id) query = query.eq('user_id', filters.user_id);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.action_type) query = query.eq('action_type', filters.action_type);
  if (filters.entity_type) query = query.eq('entity_type', filters.entity_type);
  if (filters.entity_id) query = query.eq('entity_id', filters.entity_id);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.date_from) query = query.gte('created_at', filters.date_from);
  if (filters.date_to) query = query.lte('created_at', filters.date_to);

  const limit = filters.limit || 50;
  const offset = filters.offset || 0;
  const order = filters.order_by === 'created_at_asc' ? 'asc' : 'desc';

  query = query.order('created_at', { ascending: order === 'asc' }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    logs: data || [],
    total_count: count || 0,
    page: Math.floor(offset / limit) + 1,
    page_size: limit,
    has_more: (count || 0) > offset + limit,
  };
}
```

## Testing Checklist

- [ ] Verify triggers fire on event creation/update
- [ ] Verify RLS blocks non-admin users from SELECT
- [ ] Verify RLS blocks all UPDATE/DELETE attempts
- [ ] Verify `create_system_log()` inserts correctly
- [ ] Verify `purge_old_system_logs()` only works for super_admin
- [ ] Test JSONB queries with complex payloads
- [ ] Test pagination and filtering in log queries
- [ ] Load test: Insert 10,000 logs and measure query performance

## Future Enhancements

- [ ] Real-time log streaming to admins (Supabase Realtime)
- [ ] Export logs to CSV/JSON for external analysis
- [ ] Integration with SIEM tools (Splunk, DataDog, ELK)
- [ ] Anomaly detection (ML-based suspicious activity alerts)
- [ ] Automatic archival to S3 after 1 year
- [ ] Log aggregation dashboard (charts for actions per day, top users, etc.)
