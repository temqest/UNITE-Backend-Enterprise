# UNITE Self-Hosting Migration Plan

Date: 2026-04-07
Scope: Backend + Frontend migration from Supabase-managed stack to self-hosted infrastructure while preserving behavior.

## 1) Current Stack and Architecture (Baseline)

### Backend
- Runtime: Node.js + Express + TypeScript
- Validation: Zod
- Auth/database/storage SDK: @supabase/supabase-js
- Email: Nodemailer via Brevo SMTP
- Pattern: Service-oriented domain modules in src/services with API controllers in src/api

Key folders:
- src/api: REST routes and controllers
- src/services: business logic by domain (auth, users, events, chat, inventory, notifications, settings, geographic)
- src/lib/supabase: Supabase client initialization and helpers
- migrations: SQL schema, RLS policies, RBAC, donor, events, inventory, notifications

### Frontend
- Runtime: Next.js 16 + React 19 + TypeScript
- Main data path: frontend calls backend REST API
- Direct Supabase usage: Google OAuth handoff and one storage upload path (event results attachments)

Key folders:
- unite-frontend-enterprise-prototype/app: pages and route logic
- unite-frontend-enterprise-prototype/lib: API client, session storage, Supabase browser client
- unite-frontend-enterprise-prototype/hooks: auth restore and related client hooks

## 2) Supabase Dependency Inventory (Exhaustive Classification)

## AUTH

Backend usages:
- Session/user lookup and token flows:
  - src/services/auth/session.service.ts
  - src/middelware/auth.middleware.ts
  - src/lib/supabase/supabase.utils.ts
- Password and OTP auth:
  - src/services/auth/login.service.ts (signInWithPassword, signInWithOtp, verifyOtp)
  - src/services/auth/verify-otp.service.ts (finalize flow + auth admin confirmation)
- Google auth exchange and linking:
  - src/services/auth/google-auth.service.ts
- Admin auth lifecycle operations:
  - src/services/users/user.service.ts (create/list/update/delete users, invite)
  - src/services/users/donor.service.ts (admin create/list/update/delete)
  - src/api/v1/controllers/users/staff-management.controller.ts
  - src/api/v1/controllers/users/approval.controller.ts
  - src/api/v1/controllers/auth/password.controller.ts

Frontend usages:
- Google OAuth redirect + code/session exchange:
  - unite-frontend-enterprise-prototype/app/auth/login/page.tsx
  - unite-frontend-enterprise-prototype/app/auth/google/callback/page.tsx
  - unite-frontend-enterprise-prototype/lib/supabase.ts

JWT/RLS coupling in SQL:
- Policies use auth.jwt(), auth.uid(), role claims, org_id/sub claims:
  - migrations/20260331_create_rbac_core_tables.sql
  - migrations/20260401_enable_rbac_rls_policies.sql
  - migrations/20260403_enable_donor_profiles_rls.sql

## DATABASE

PostgREST table access via Supabase .from() is widespread across:
- Users and orgs: users, organizations, donor_profiles, pending_signups, email_verification_codes
- Events: events, event_staff, event_participants, event_approvals
- Chat: chats, messages
- Notifications/logging: notifications, notification_reads, notification_email_queue, system_logs
- Settings/RBAC: organization_settings, user_settings, user_role_assignments, role_permissions, permissions, user_permission_overrides
- Inventory: blood_inventory, blood_inventory_transactions
- Geographic: provinces, districts, municipalities
- Invites: invites

Representative files:
- src/services/events/*.ts
- src/services/users/*.ts
- src/services/chat/*.ts
- src/services/notifications/*.ts
- src/services/inventory/inventory.service.ts
- src/services/geographic/geographic.service.ts
- src/services/auth/authorization.service.ts

RPC usage found:
- src/services/chat/chat.service.ts: find_or_create_chat
- src/services/auth/verify-otp.service.ts: finalize_pending_signup

## STORAGE

Backend storage dependencies:
- Chat bucket management and policy setup:
  - src/services/chat/storage.setup.ts
- Chat file upload/signed/public URL handling:
  - src/services/chat/message.service.ts
- Env controls:
  - CHAT_BUCKET_NAME, CHAT_MAX_FILE_SIZE, CHAT_ALLOWED_FILE_EXTENSIONS, CHAT_SIGNED_URL_EXPIRES

Frontend storage dependency:
- Event result attachments upload and public URL retrieval:
  - unite-frontend-enterprise-prototype/app/dashboard/my-events/[eventId]/page.tsx
  - bucket from NEXT_PUBLIC_SUPABASE_EVENT_RESULTS_BUCKET (default event-results)

## REALTIME

Active realtime usage exists (not only documentation):
- Event subscriptions:
  - src/services/events/event.service.ts (subscribeToEventUpdates)
- Chat subscriptions and broadcasts:
  - src/services/chat/chat.service.ts (channel subscriptions, removeChannel, broadcast)

## EDGE FUNCTIONS

No active Supabase Edge Function invocations found:
- No supabase.functions.invoke references in source
- Classification: currently none

## 3) External Services and Third-Party APIs

Active external service calls:
- Brevo REST health check on startup:
  - src/server.js (https://api.brevo.com/v3/account)
- Brevo SMTP email sending:
  - src/services/email/brevo.service.ts
- Google OAuth via Supabase auth provider (frontend + backend exchange path):
  - unite-frontend-enterprise-prototype/app/auth/login/page.tsx
  - unite-frontend-enterprise-prototype/app/auth/google/callback/page.tsx
  - src/services/auth/google-auth.service.ts

## 4) Environment Variables and Connection Targets

Backend core:
- SUPABASE_URL: Supabase endpoint
- SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY: public auth key path
- SUPABASE_SERVICE_ROLE_KEY / SUPABSE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY: privileged backend key path
- SUPABASE_ID: optional project id

Backend operational:
- PORT, NODE_ENV, CORS_ALLOWED_ORIGINS
- AUTH_LOGIN_RATE_LIMIT_WINDOW_MS, AUTH_LOGIN_RATE_LIMIT_MAX
- AUTH_OTP_RATE_LIMIT_WINDOW_MS, AUTH_OTP_RATE_LIMIT_MAX
- NOTIFICATIONS_READ_RATE_LIMIT_WINDOW_MS, NOTIFICATIONS_READ_RATE_LIMIT_MAX
- NOTIFICATIONS_WRITE_RATE_LIMIT_WINDOW_MS, NOTIFICATIONS_WRITE_RATE_LIMIT_MAX
- NOTIFICATION_BROADCAST_BATCH_SIZE, NOTIFICATION_QUEUE_BACKEND, NOTIFICATION_QUEUE_FLUSH_BATCH_SIZE, NOTIFICATION_MAX_RETRY

Email:
- BREVO_API_KEY / SENDINBLUE_API_KEY
- BREVO_SENDER_EMAIL, BREVO_SENDER_NAME
- BREVO_SMTP variants and credentials used by brevo.service.ts
- DAILY_EMAIL_LIMIT, DEFAULT_EMAIL_FROM

Storage/chat:
- CHAT_BUCKET_NAME
- CHAT_MAX_FILE_SIZE
- CHAT_ALLOWED_FILE_EXTENSIONS
- CHAT_ALLOWED_MIME_TYPES
- CHAT_SIGNED_URL_EXPIRES

Frontend:
- NEXT_PUBLIC_BACKEND_BASE_URL / BACKEND_BASE_URL
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_SUPABASE_EVENT_RESULTS_BUCKET
- NEXT_PUBLIC_APP_URL
- NEXT_PUBLIC_API_URL (appears legacy in current frontend)

## 5) Self-Hosted Target Design

This plan supports dual mode deployment:
- cloud: existing Supabase path
- selfhosted: PostgreSQL + MinIO + app-managed auth/realtime

ENV switch:
- DEPLOYMENT_TARGET=cloud|selfhosted

### AUTH replacement
Option A (recommended for minimal disruption):
- Keep current session shape in API responses
- Replace Supabase auth with custom auth module:
  - password hashing via bcrypt
  - JWT access token + refresh token issuance and rotation
  - OAuth broker endpoint for Google (or keep a dedicated OAuth middleware)
- Persist refresh tokens and revocation metadata in Postgres

Option B (enterprise IAM):
- Keycloak integration
- Map Keycloak groups/roles to existing RBAC role and permission model

### DATABASE replacement
- Use plain PostgreSQL with current schema from migrations
- Preserve constraints, indexes, triggers, and functions
- Replace reliance on Supabase auth.jwt() policy checks with app-level guards plus optional PostgreSQL RLS using app JWT claims injected through session variables
- Remove Supabase-specific assumptions from policies if not maintaining compatible JWT claims

### STORAGE replacement
- MinIO as S3-compatible storage
- Create buckets:
  - chat-files (or configured chat bucket)
  - event-results
- Replace Supabase storage SDK usage with S3 client wrapper
- Keep signed URL behavior and expiry parity

### REALTIME replacement
- Replace Supabase channel subscriptions with:
  - WebSocket gateway (Socket.IO or ws), or
  - Postgres LISTEN/NOTIFY + websocket fanout
- Preserve event channels for:
  - events by org_id
  - chats by chat_id

### EDGE FUNCTIONS replacement
- No current edge functions to migrate
- Keep all business logic in main API service

## 6) Abstraction Layer Design (Dual Provider)

Target interfaces:
- src/services/platform/auth.ts
- src/services/platform/db.ts
- src/services/platform/storage.ts
- src/services/platform/realtime.ts

Implementations:
- src/services/platform/cloud/
  - auth.supabase.ts
  - db.supabase.ts
  - storage.supabase.ts
  - realtime.supabase.ts
- src/services/platform/selfhosted/
  - auth.jwt.ts
  - db.postgres.ts
  - storage.minio.ts
  - realtime.websocket.ts

Resolver/factory:
- src/services/platform/index.ts
- reads DEPLOYMENT_TARGET and exports active provider implementations

Migration rule:
- Existing domain services should depend on platform interfaces, not direct Supabase clients.

## 7) File-Level Change Plan (What changes and why)

High-priority core files:
1. src/lib/supabase/supabase.client.ts
- Why: central Supabase singleton creation.
- Change: keep for cloud provider only; stop importing directly in domain services.

2. src/lib/supabase/supabase.utils.ts
- Why: auth/session helper coupling to Supabase.
- Change: route through provider auth interface.

3. src/middelware/auth.middleware.ts
- Why: currently depends on Supabase session user resolution.
- Change: validate custom JWT or Keycloak token via provider auth service.

4. src/services/auth/*.ts
- Why: direct auth SDK calls and signup/session logic.
- Change: isolate Supabase logic behind AuthProvider, add JWT refresh token store for selfhosted.

5. src/services/chat/storage.setup.ts and src/services/chat/message.service.ts
- Why: direct Supabase storage API usage.
- Change: abstract bucket operations, upload, get public URL, signed URL via StorageProvider.

6. src/services/chat/chat.service.ts and src/services/events/event.service.ts
- Why: direct Supabase realtime channels and rpc calls.
- Change: move realtime to RealtimeProvider; move RPC behavior into repository/service methods.

7. src/services/* domain modules using .from() directly
- Why: hard coupling to Supabase query API.
- Change: progressively migrate to DbProvider repository methods (domain-specific queries).

8. src/api/v1/controllers/* files instantiating services with supabaseServer
- Why: direct dependency injection of Supabase client.
- Change: inject platform provider container.

Frontend files:
9. unite-frontend-enterprise-prototype/lib/supabase.ts
- Why: direct Supabase client in browser.
- Change: keep only if cloud mode is required in frontend, otherwise remove and rely on backend OAuth + storage endpoint.

10. unite-frontend-enterprise-prototype/app/auth/login/page.tsx
11. unite-frontend-enterprise-prototype/app/auth/google/callback/page.tsx
- Why: direct supabase.auth OAuth handoff.
- Change: route OAuth start/callback through backend auth endpoints for selfhosted mode.

12. unite-frontend-enterprise-prototype/app/dashboard/my-events/[eventId]/page.tsx
- Why: direct browser upload to Supabase storage.
- Change: replace with backend upload endpoint or S3 pre-signed upload flow.

Config and docs:
13. env-copy.txt, backend .env template, frontend .env template
- Why: new selfhost env vars needed; deprecate supabase-only vars in selfhost mode.

14. BACKEND_ARCHITECTURE.md and deployment docs
- Why: update architecture and operational procedures for dual target.

## 8) Proposed New Folder Structure

- src/services/platform/
  - index.ts
  - types.ts
  - auth.ts
  - db.ts
  - storage.ts
  - realtime.ts
  - cloud/
    - auth.supabase.ts
    - db.supabase.ts
    - storage.supabase.ts
    - realtime.supabase.ts
  - selfhosted/
    - auth.jwt.ts
    - db.postgres.ts
    - storage.minio.ts
    - realtime.websocket.ts

- src/repositories/
  - users.repository.ts
  - events.repository.ts
  - chat.repository.ts
  - notifications.repository.ts
  - inventory.repository.ts
  - etc.

- src/infrastructure/
  - postgres/
  - minio/
  - websocket/

## 9) Docker Compose for Self-Hosted Deployment

Example baseline compose:

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16
    container_name: unite-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: unite
      POSTGRES_USER: unite
      POSTGRES_PASSWORD: unite_dev_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  minio:
    image: minio/minio:latest
    container_name: unite-minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadminpassword
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: unite-backend
    restart: unless-stopped
    depends_on:
      - postgres
      - minio
    environment:
      DEPLOYMENT_TARGET: selfhosted
      PORT: 6900
      NODE_ENV: production

      DATABASE_URL: postgres://unite:unite_dev_password@postgres:5432/unite

      JWT_ACCESS_SECRET: change_me
      JWT_REFRESH_SECRET: change_me_too
      JWT_ACCESS_TTL: 30m
      JWT_REFRESH_TTL: 14d

      STORAGE_ENDPOINT: http://minio:9000
      STORAGE_REGION: us-east-1
      STORAGE_ACCESS_KEY: minioadmin
      STORAGE_SECRET_KEY: minioadminpassword
      STORAGE_BUCKET_CHAT: chat-files
      STORAGE_BUCKET_EVENT_RESULTS: event-results

      CORS_ALLOWED_ORIGINS: http://localhost:3000
    ports:
      - "6900:6900"

volumes:
  postgres_data:
  minio_data:
```

Notes:
- Add an optional reverse proxy service (Traefik or Nginx) for TLS and routing in non-local deployments.
- Add optional worker service if notification queue processing is separated from API process.

## 10) SQL and Schema Changes Required

Keep:
- Existing business tables, constraints, indexes, triggers, and non-Supabase-specific SQL functions.

Refactor required:
1. Remove or rewrite policies/functions that rely on:
- auth.jwt()
- auth.uid()
- auth schema conventions that do not exist in plain PostgreSQL

2. Replace RPC assumptions where needed:
- find_or_create_chat: keep as SQL function or move to transaction in app repository layer
- finalize_pending_signup: keep as SQL function or move to application transaction logic

3. Add self-host auth tables if not using external IdP:
- auth_users
- auth_refresh_tokens
- auth_password_resets (optional)
- oauth_identities (if Google OAuth remains)

4. Add migration for storage metadata if desired:
- optional table to track file object ownership and signed URL issuance auditing

5. Keep RBAC tables and permissions:
- roles, permissions, role_permissions, user_role_assignments, user_permission_overrides
- enforce org scoping in app middleware/service guards

## 11) Prioritized Implementation Order (No Feature Breakage)

Phase 0 - Safety and observability
1. Freeze current API contract snapshots and add integration tests around auth, events, chat, uploads.
2. Add feature flag DEPLOYMENT_TARGET and provider resolver skeleton.

Phase 1 - Non-invasive abstraction
3. Introduce platform interfaces and cloud provider wrappers that call existing Supabase logic.
4. Refactor controllers/services to consume provider interfaces with no behavior changes.

Phase 2 - Database decoupling
5. Introduce DbProvider repository methods for key domains (auth, users, events, chat, notifications).
6. Move direct .from() calls behind repositories incrementally.

Phase 3 - Storage migration
7. Implement MinIO storage provider.
8. Migrate chat and event attachment flows to StorageProvider.
9. Validate signed URL and file size/mime checks parity.

Phase 4 - Auth migration
10. Implement selfhosted auth provider (JWT + refresh token store) or Keycloak adapter.
11. Migrate middleware and session endpoints.
12. Keep cloud auth provider available until parity validated.

Phase 5 - Realtime migration
13. Implement websocket realtime provider for chat/events.
14. Switch subscriptions and broadcast paths behind RealtimeProvider.

Phase 6 - Cutover and cleanup
15. Run full regression, soak test queue and auth refresh behavior.
16. Cut production to selfhosted target.
17. Decommission direct Supabase-only paths and remove dead env vars.

## 12) Risk Register and Mitigations

High risks:
- RLS/JWT claim assumptions tied to auth.jwt() and auth.uid().
- Direct frontend Supabase usage that bypasses backend abstraction.
- Realtime parity for chat/events under load.
- Auth session rotation parity and multi-device logout behavior.

Mitigations:
- Keep dual provider mode until all endpoint and UI flows pass parity tests.
- Add contract tests for login, OTP, Google, uploads, events lifecycle, notifications.
- Deploy canary with shadow traffic for selfhosted stack.

## 13) Quick Start Checklist (When You Decide to Start)

1. Create provider interfaces and cloud wrappers first.
2. Add DEPLOYMENT_TARGET and wire provider resolver.
3. Containerize Postgres and MinIO locally with docker compose.
4. Migrate one vertical slice end-to-end:
   - auth me endpoint
   - event list endpoint
   - chat file upload endpoint
5. Expand slice-by-slice until Supabase direct calls are fully isolated.

---

This document is the implementation blueprint for migration planning and execution.
