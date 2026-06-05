# Logging and Monitoring Strategy

This document outlines the logging architecture of the UNITE Backend Enterprise, which separates **Audit/Activity Logs** (for organization administrators) from **Developer Performance Logs** (for system health and troubleshooting).

## 1. Organization Activity Logs (Audit Trail)

**Purpose**: Provide a user-facing, immutable audit trail of business actions taken within an organization.
**Visibility**: Only visible to organization administrators and super admins via the `/dashboard/settings/activity-logs` UI.
**Storage**: Persisted in the Supabase database under the `organization_activity_logs` table.

### Implementation Details
- **Service**: `ActivityLogService` (`src/services/activity-logs/activity-log.service.ts`)
- **Key Method**: `recordActivityLog(input: ActivityLogInput)`
- **Behavior**: Fire-and-forget. The service wraps database insertions in a `try/catch` and suppresses errors to guarantee that the main business flow (e.g., creating an event) is never blocked or aborted if the logging database fails.

### Usage Example
Whenever a business action occurs (e.g., an event is updated or inventory stock is added), call the service:
```typescript
import { ActivityLogService } from '../activity-logs/activity-log.service';

ActivityLogService.recordActivityLog({
  orgId: user.org_id,
  actorUserId: user.id,
  action: 'event.published',
  entityType: 'event',
  entityId: event.id,
  entityLabel: event.title,
  description: `Event "${event.title}" was published.`,
  metadata: { previousStatus: 'draft', newStatus: 'published' }
});
```

---

## 2. Developer & Performance Logging

**Purpose**: Monitor backend health, API request speeds, errors, and system events for developers and DevOps.
**Visibility**: Visible only via server stdout/stderr (e.g., Docker logs, Datadog, AWS CloudWatch). Not exposed to end-users.
**Tooling**: Powered by [Pino](https://getpino.io/) for high-performance, structured JSON logging.

### Implementation Details
- **Logger Utility**: `src/utils/logger.ts` exports `systemLogger`, `requestLogger`, and `errorLogger`.
- **HTTP Middleware**: `src/middleware/request-logger.middleware.ts` uses `pino-http` to track every API request, injecting the `orgId` and `userId` if available, and automatically flagging slow requests (>1000ms).
- **Error Tracking**: Centralized in the global error handler (`src/index.js`).

### Health Endpoint
A system health endpoint is available at `GET /api/v1/system/health`.
It checks database connectivity, memory usage (RSS, Heap), and uptime.

```json
{
  "status": "ok",
  "service": "UNITE Backend Enterprise",
  "timestamp": "2026-06-05T12:00:00Z",
  "uptime_seconds": 1205.5,
  "database": "connected",
  "memory_usage": {
    "rss_mb": 145,
    "heap_total_mb": 80,
    "heap_used_mb": 55
  }
}
```

### Best Practices for Developers
- **DO NOT** use `console.log()` for business logic or request tracing.
- Use `systemLogger.info()` or `systemLogger.error()` for internal background jobs or database migrations.
- Always redact sensitive information (passwords, tokens, PII) before passing objects to the logger. `pino-http` is already configured to redact the `Authorization` header.
- For business events that users need to see, use `ActivityLogService`. For internal warnings/errors, use `systemLogger`.
