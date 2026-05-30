# AI Project Guide

Central navigation document for AI assistants, developers, and new chat sessions working on **UNITE Backend Enterprise** and its enterprise frontend prototype.

**Related feature docs (prefer linking over duplicating):**

| Topic | Path |
|-------|------|
| Auth (hybrid Supabase + httpOnly refresh) | [docs/auth.md](./auth.md) |
| Campaign & event flow (statuses, plotting) | [docs/campaign-event-flow.md](./campaign-event-flow.md) |
| Donation coverage map | [docs/coverage-map.md](./coverage-map.md) |
| Event & Coverage Flow Analysis | [docs/event-coverage-flow-analysis.md](./event-coverage-flow-analysis.md) |
| Backend architecture (deeper backend detail) | [../BACKEND_ARCHITECTURE.md](../BACKEND_ARCHITECTURE.md) |
| Token lifetime notes | [../TOKEN_CONFIGURATION.md](../TOKEN_CONFIGURATION.md) |
| RBAC / permissions planning | [../permission_plan.md](../permission_plan.md) |

---

## 1. Project Overview

**UNITE** is a multi-tenant **blood bank / chapter operations** platform. Organizations manage staff, blood drives and related events, inventory, geographic coverage, donor-facing listings, and internal workflows.

| Area | Location | Role |
|------|----------|------|
| **Backend API** | Repository root (`src/`) | Express + Supabase (Postgres, Auth, Storage, Realtime) |
| **Enterprise frontend** | `unite-frontend-enterprise-prototype/` | Next.js App Router dashboard and donor flows |

**Important repo note:** The frontend folder is listed in root `.gitignore` (`unite-frontend-enterprise-prototype/`). It exists on disk alongside the backend but may not appear in git history for this repository. Paths below are filesystem paths relative to the repo root.

**Major modules (as implemented):**

- Authentication & RBAC (Supabase Auth + app refresh sessions)
- Organization & staff (users) management
- Event lifecycle (manual create, plotting calendar, publish, participants)
- Plotting calendars (appointment-style scheduling windows)
- Blood inventory dashboard & transactions
- Donation coverage map (backend data + frontend GeoJSON boundaries)
- Donor signup / public events / donor dashboard
- Notifications, settings, geographic hierarchy
- Chat **services/models exist**; **no `/api/v1/chat` routes** are mounted in `v1.routes.ts` (Needs verification if chat is used elsewhere)

There is **no dedicated `campaigns` table** in v1. Campaign-oriented UI maps to the **`events`** table and `events.extra_data`.

---

## 2. Tech Stack

### Backend (repo root)

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 22 (`package.json`) |
| HTTP | Express 4 |
| Language | TypeScript (API modules) + JS entry (`src/server.js`, `src/index.js`) |
| Database / auth | Supabase (`@supabase/supabase-js`) — Postgres, Auth, Storage, Realtime |
| Validation | Zod 4 |
| Security | Helmet, CORS, `express-rate-limit`, bcrypt |
| Email | Nodemailer (Brevo SMTP in services) |

### Frontend (`unite-frontend-enterprise-prototype/`)

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router), React 19 |
| UI | HeroUI v3 (`@heroui/react`), Radix primitives, `class-variance-authority`, Lucide / Heroicons |
| Styling | Tailwind CSS v4 (`app/globals.css` `@theme`, no `tailwind.config.ts`) |
| Forms | `react-hook-form`, Zod, `@hookform/resolvers` |
| Calendar (plotting) | FullCalendar (`@fullcalendar/react`, daygrid, interaction, timegrid) |
| Maps (coverage) | `mapbox-gl` |
| Auth client | `@supabase/supabase-js` (OAuth) + custom backend session (`lib/auth-client.ts`) |

---

## 3. Repository / Folder Structure

```
UNITE-Backend-Enterprise/
├── src/                          # Backend source
│   ├── index.js                  # Express app, mounts /api/v1
│   ├── server.js                 # HTTP server
│   ├── api/v1/
│   │   ├── routes/               # Domain routers
│   │   ├── controllers/        # HTTP handlers
│   │   └── validators/           # Zod validators
│   ├── services/                 # Business logic
│   ├── models/                   # schema.sql, rls.sql, types.ts per domain
│   ├── middelware/               # Note: spelling "middelware" in repo
│   └── lib/                      # Supabase client, async-handler
├── migrations/                   # SQL migrations
├── docs/                         # Feature + this guide
├── test/                         # Node test runner tests
├── unite-frontend-enterprise-prototype/   # Next.js frontend (gitignored)
│   ├── app/                      # Routes & layouts
│   ├── components/               # UI by feature
│   ├── lib/                      # api.ts, auth, mock map data
│   ├── hooks/
│   ├── types/
│   └── public/
├── BACKEND_ARCHITECTURE.md
├── env-copy.txt                  # Env variable template (no secrets)
└── package.json
```

### Backend `src/models/` domains

| Folder | Tables / purpose |
|--------|------------------|
| `organizations/` | Tenant orgs |
| `users/` | App user profiles |
| `pending_signups/` | Pre-OTP signup staging |
| `organization_settings/` | Scheduling policies |
| `user_settings/` | Notification prefs |
| `events/` | Events, plotting calendars, staff, participants |
| `inventory/` | `blood_inventory`, transactions |
| `notifications/` | In-app notifications |
| `chat/` | Chats & messages (no v1 routes mounted) |
| `system_logs/` | Audit trail |
| `geographic/` | Provinces, districts, municipalities |

---

## 4. Frontend Navigation Map

**Shell:** `unite-frontend-enterprise-prototype/components/layout/AppShell.tsx`  
**Sidebar:** `components/layout/AppSidebar.tsx` (permission-filtered; collapsible **Events** group)  
**Auth wrapper:** `app/dashboard/layout.tsx` → `components/auth/protected-route.tsx`  
**Root auth:** `app/layout-root.tsx` → `components/auth/auth-provider.tsx`

### Route index

| Route | Page file | Purpose |
|-------|-----------|---------|
| `/` | `app/page.tsx` | Landing |
| `/login`, `/auth/login` | `app/auth/login/page.tsx` | Staff/org login |
| `/signup`, `/auth/signup` | `app/auth/signup/page.tsx` | Signup |
| `/auth/verify-otp` | `app/auth/verify-otp/page.tsx` | OTP verification |
| `/change-password`, `/auth/change-password` | `app/change-password/page.tsx` | Password change |
| `/auth/google/callback`, `/auth/google/complete` | `app/auth/google/*/page.tsx` | Google OAuth |
| `/unauthorized` | `app/unauthorized/page.tsx` | Permission denied |
| `/events` | `app/events/page.tsx` | Public events (Needs verification: donor vs staff) |
| `/dashboard` | `app/dashboard/page.tsx` | Main dashboard |
| `/dashboard/coverage-map` | `app/dashboard/coverage-map/page.tsx` | Donation coverage map |
| `/dashboard/campaign` | `app/dashboard/campaign/page.tsx` | Campaign / event management |
| `/dashboard/plotting-calendars` | `app/dashboard/plotting-calendars/page.tsx` | Plotting calendar admin + reserve |
| `/dashboard/my-events` | `app/dashboard/my-events/page.tsx` | My events list |
| `/dashboard/my-events/[eventId]` | `app/dashboard/my-events/[eventId]/page.tsx` | Event detail / participants |
| `/dashboard/calendar` | `app/dashboard/calendar/page.tsx` | Internal event calendar view with custom compact event pills and status/source summary badges |
| `/dashboard/inventory` | `app/dashboard/inventory/page.tsx` | Inventory management |
| `/dashboard/staff` | `app/dashboard/staff/page.tsx` | Staff management |
| `/dashboard/settings` | `app/dashboard/settings/page.tsx` | Org/user settings |
| `/donor/*` | `app/donor/**` | Donor landing, login, signup, events, dashboard |
| `/map-debug` | `app/map-debug/page.tsx` | Mapbox debug (env-gated) |

### Dashboard (`/dashboard`)

| Item | Path |
|------|------|
| Page | `app/dashboard/page.tsx` |
| API | `listEvents`, `getInventoryDashboard`, `listUsers` via `lib/api.ts` |
| Notes | Summary cards; links to events/inventory/staff based on permissions |

### Campaign Management (`/dashboard/campaign`)

| Item | Path |
|------|------|
| Page | `app/dashboard/campaign/page.tsx` |
| Components | `components/campaign/CampaignHeader.tsx`, `CampaignFilters.tsx`, `EventCard.tsx`, `EventCardActions.tsx`, `CampaignCalendar.tsx` |
| Modals | `components/campaign/modals/ManualEventCreateModal.tsx` (viewport-capped shell, scrollable body, sticky actions), `CompleteEventDetailsModal.tsx`, `ConfirmEventActionModal.tsx`, `EventDetailModal.tsx` (viewport-capped shell, scrollable body, sticky actions) |
| Types | `components/campaign/types.ts` |
| API | `manualCreateEvent`, `completeEventDetails`, `publishEvent`, `cancelEvent`, `updateEventStatus`, `listEvents`, etc. (`lib/api.ts`) |
| Backend | `POST /api/v1/events/manual`, `PATCH .../complete-details`, `PATCH .../publish`, `GET /api/v1/events` |

See [campaign-event-flow.md](./campaign-event-flow.md) for statuses and public visibility rules.

**Publish readiness rule:** the campaign publish flow only blocks on the core fields marked required in the modal: event title, hosting organization, event type, and event date. Optional details such as description, address extras, goals, staff, campaign messaging, and public notes should not prevent publishing.

### Plotting Calendar (`/dashboard/plotting-calendars`)

| Item | Path / detail |
|------|----------------|
| **Route** | `/dashboard/plotting-calendars` |
| **Page (entire UI)** | `app/dashboard/plotting-calendars/page.tsx` (~2,300 lines, `"use client"`) |
| **Separate component folder** | **None** — FullCalendar, wizards, and modals are inline in the page |
| **FullCalendar CSS** | `app/globals.css` (`.plotting-calendar-view .fc …`) |
| **API client** | `lib/api.ts` — `listPlottingCalendars`, `createPlottingCalendar`, `updatePlottingCalendar`, `deletePlottingCalendar`, `getPlottingCalendarAvailability`, `savePlottingCalendarAvailability`, `getPlottingCalendarAvailableSlots`, `plotEventFromCalendar` |

**Inline modals (same page file):**

| UI | Primitive | State / title |
|----|-----------|----------------|
| Create / edit calendar | `SetupShell` | `calendarFormOpen`, `editingCalendar` — "Create Plotting Calendar" / "Edit Plotting Calendar" |
| Edit day availability | `ModalShell` | `dayEditorOpen` — "Availability: {date}" |
| Reserve slot / time | `ModalShell` | `plotOpen` — "Reserve Event Slot" / "Quick Reservation"; buttons "Reserve Time" / "Reserve Slot" |

**Wizard steps:** Details → Dates → Date Settings → Review (`CALENDAR_WIZARD_STEPS`).

**Default access type (frontend form):** `organization_link` (`defaultCalendarForm.access_type` in page).

**Access modes (`ACCESS_TYPE_OPTIONS` on page):**

| `access_type` | Label (UI) |
|---------------|------------|
| `organization_link` | Organization access + link (**default**) |
| `org` | Organization access |
| `users` | Specific users |
| `organizations` | Specific organizations |
| `share_token` | Authenticated share link |

**Backend default:** `organization_link` (`plotting_calendars.access_type` default in `src/models/events/schema.sql`; create service uses `parsed.access_type ?? 'organization_link'`).

**Selected dates:** Stored on calendar as `allowed_dates` (JSON array); per-day rows in `plotting_calendar_days`. Month picker + FullCalendar day grid on page; helpers `formatDateKey`, `makeDateDraftsFromCalendar`, `getMonthCells`.

**Flexible time vs fixed slots:**

| Mode | Behavior |
|------|----------|
| `flexible` | Day uses `flexible_starts_at` / `flexible_ends_at` (default 08:00–17:00). Reservers pick start/end in reserve modal. |
| `slots` | Day has `plotting_calendar_time_slots` rows; reserve uses `plotForm.slot_id`. |

**Draft default mode:** `makeDateAvailabilityDraft()` — `"slots"` if calendar has `allowed_time_slots.length`, else `"flexible"`.

**Reservation flow (frontend):** `openPlotPanel` → `handlePlotEvent` → `plotEventFromCalendar(calendarId, payload)` → creates event with status `plotted` on backend.

**Calendar statuses:** `active`, `closed`, `expired`, `archived`  
**Day/slot statuses:** `open`, `unavailable`, `fully_booked`

**Do not change lightly:** Multi-step create wizard, access mode set, flexible/slots per-day logic, and inline modal primitives are tightly coupled in one file.

### My Events (`/dashboard/my-events`)

| Item | Path |
|------|------|
| List | `app/dashboard/my-events/page.tsx` |
| Detail | `app/dashboard/my-events/[eventId]/page.tsx` |
| API | `listMyEvents`, `getEventById`, `getMyEventStats`, `updateMyEventParticipantStatus`, `bulkUpdateMyEventParticipantStatus`, `updateEventResults` |
| Backend | `GET /api/v1/events/my-events`, `GET /api/v1/events/:id`, `GET /api/v1/events/:id/stats`, participant PATCH routes |

### Donation Coverage Map (`/dashboard/coverage-map`)

| Item | Path |
|------|------|
| Page (server) | `app/dashboard/coverage-map/page.tsx` — reads Mapbox token from env, passes to client |
| Client wrapper | `components/coverage-map/CoverageMapPageClient.tsx` |
| Map | `components/coverage-map/CoverageMap.tsx` |
| UI | `CoverageFilters.tsx`, `CoverageSummaryCards.tsx`, `CoverageStatusLegend.tsx`, `AreaDetailsPanel.tsx`, `AreaPerformanceList.tsx` |
| Data | `lib/coverage-map-data.ts`, `lib/mock-coverage-areas.ts`, `lib/mock-coverage-data.ts` |
| GeoJSON | `lib/data/geo/camarines-sur-coverage.json` |
| Map style | `components/coverage-map/mapbox-debug.ts` — `COVERAGE_MAP_STYLE_URL = "mapbox://styles/mapbox/streets-v12"` |
| Debug | `app/map-debug/page.tsx` |
| Backend | `/api/v1/coverage-areas` |

### Inventory Management (`/dashboard/inventory`)

| Item | Path |
|------|------|
| Page | `app/dashboard/inventory/page.tsx` (inline UI; HeroUI calendar/popover in places) |
| Components | `components/inventory/BatchUpdateModal.tsx` |
| API | `getInventoryDashboard`, `getInventoryBloodTypeDetail`, `recordInventoryTransaction`, `batchUpdateInventory`, `getInventoryTransactions` |
| Backend | `GET /api/v1/inventory/dashboard`, `GET /api/v1/inventory/blood-types/:bloodType`, `POST /api/v1/inventory/transactions`, `POST /api/v1/inventory/batch-update`, `GET /api/v1/inventory/transactions` |
| Permission | `inventory.read`, `inventory.update` |

### Staff Management (`/dashboard/staff`)

| Item | Path |
|------|------|
| Page | `app/dashboard/staff/page.tsx` |
| Table / modals | `components/staff/StaffTable.tsx`, `AddStaffModal.tsx`, `EditStaffModal.tsx`, `DeleteStaffModal.tsx`, `ReviewSignupModal.tsx` |
| API | `listUsers`, `createUser`, `updateUser`, `deleteUser`, `reviewPendingSignup` |
| Backend | `GET/POST/PATCH/DELETE /api/v1/users`, `POST /api/v1/users/approve-staff` |

### Auth

| Item | Path |
|------|------|
| Provider | `components/auth/auth-provider.tsx` |
| Protected routes | `components/auth/protected-route.tsx` |
| API | `lib/auth-client.ts`, `lib/auth-storage.ts` |
| Full flow | [docs/auth.md](./auth.md) |

Auth is **not** temporary — hybrid Supabase + httpOnly refresh cookie is the current production-oriented design.

---

## 5. Backend API Map

**Mount:** `src/api/v1/routes/v1.routes.ts` → `/api/v1`  
**Health:** `GET /health` in `src/index.js`  
**Default port:** `6900` (`env-copy.txt`)

### API surface summary

| Prefix | Route file | Notes |
|--------|------------|-------|
| `/auth` | `routes/auth/auth.routes.ts` | Login, refresh, me, logout, OTP, Google, password |
| `/users` | `routes/users/users.routes.ts` | Staff CRUD, signup, profile, approve-staff |
| `/events` | `routes/events/events.routes.ts` | Full event lifecycle; `POST /` rejects `creation_method: plotting_calendar` |
| `/plotting-calendars` | `routes/plotting-calendars/plotting-calendars.routes.ts` | Calendar CRUD, availability, plot-event |
| `/inventory` | `routes/inventory/inventory.routes.ts` | Dashboard, blood type detail, transactions |
| `/settings` | `routes/settings/settings.routes.ts` | Org + user settings |
| `/organizations` | `routes/organizations/organizations.routes.ts` | `GET /lookup` (public) |
| `/geographic` | `routes/geographic/geographic.routes.ts` | PH hierarchy CRUD + search |
| `/coverage-areas` | `routes/coverage-areas/coverage-areas.routes.ts` | Coverage areas CRUD |
| `/notifications` | `routes/notifications/notifications.routes.ts` | List, unread, mark read |
| `/donor` | `routes/donor/donor.routes.ts` | Donor signup, public events, profile |

### Events module

| Layer | Path |
|-------|------|
| Routes | `src/api/v1/routes/events/events.routes.ts` |
| Controllers | `src/api/v1/controllers/events/` (event + workflow controllers) |
| Service | `src/services/events/event.service.ts` |
| Model | `src/models/events/schema.sql`, `types.ts`, `rls.sql` |

| Method | Endpoint | Permission (typical) |
|--------|----------|----------------------|
| POST | `/events/manual` | `events.create` |
| POST | `/events/quick-create` | `events.create` |
| POST | `/events` | `events.create` (not plotting) |
| GET | `/events` | `events.read` |
| GET | `/events/my-events` | `events.read` |
| GET | `/events/public` | **Public** |
| GET | `/events/:id` | `events.read` |
| GET | `/events/:id/stats` | `events.read` |
| PATCH | `/events/:id/complete-details` | `events.update` |
| PATCH | `/events/:id/status` | `events.update` |
| PATCH | `/events/:id/publish` | `events.update` |
| PATCH | `/events/:id/cancel` | `events.update` |
| PATCH | `/events/:id/results` | `events.update` |
| DELETE | `/events/:id` | `events.update` |
| PATCH | `/events/:id/participants/...` | `events.update` |

Deprecated approve/reject/reschedule may return `410 Gone` — see [campaign-event-flow.md](./campaign-event-flow.md).

### Plotting calendars module

| Layer | Path |
|-------|------|
| Routes | `src/api/v1/routes/plotting-calendars/plotting-calendars.routes.ts` |
| Controller | `src/api/v1/controllers/events/plotting-calendar.controller.ts` |
| Service | `src/services/events/plotting-calendar.service.ts` |
| Model | `src/models/events/schema.sql` (`plotting_calendars`, `plotting_calendar_days`, `plotting_calendar_time_slots`) |

| Method | Endpoint | Permission |
|--------|----------|------------|
| GET | `/plotting-calendars` | `events.read` |
| GET | `/plotting-calendars/:id` | `events.read` |
| POST | `/plotting-calendars` | `events.create` |
| PATCH | `/plotting-calendars/:id` | `events.update` |
| DELETE | `/plotting-calendars/:id` | `events.delete` |
| GET | `/plotting-calendars/:id/availability?from=&to=` | `events.read` |
| PUT | `/plotting-calendars/:id/availability` | `events.update` |
| GET | `/plotting-calendars/:id/available-slots` | `events.read` |
| POST | `/plotting-calendars/share/:token/plot-event` | **Public** (via Share Token) |

**Plot-event behavior:** Creates `events` row with `status: plotted`, `setup_status: needs_details`, `creation_method: plotting_calendar`, `visibility: internal`, `is_public: false`. No separate `reservations` table.

**Access checks:** `hasCalendarAccess()` in `plotting-calendar.service.ts` — same org, `events.read` or staff role; managers bypass list restrictions; otherwise `access_type` + allow-lists.

**Share tokens:** Auto-generated for `share_token` and `organization_link` on create/update. Unauthenticated public plotting routes are available under `/api/v1/plotting-calendars/share/*`.

### Auth module

See [auth.md](./auth.md). Middleware: `src/middelware/auth.middleware.ts`, `authorization.middleware.ts`.

### Inventory module

| Layer | Path |
|-------|------|
| Routes | `src/api/v1/routes/inventory/inventory.routes.ts` |
| Model | `src/models/inventory/` |

### Users / staff module

| Layer | Path |
|-------|------|
| Routes | `src/api/v1/routes/users/users.routes.ts` |
| Model | `src/models/users/` |

All authenticated user routes use: `authMiddleware` → `requireActiveUser` → `requireOrgScope` → `authorize(permission)`.

---

## 6. Feature Map (quick reference)

| Feature | Frontend | Backend | Notes |
|---------|----------|---------|-------|
| Dashboard | `app/dashboard/page.tsx` | `GET /events`, `GET /inventory/dashboard`, `GET /users` | Permission-gated widgets |
| Campaign mgmt | `app/dashboard/campaign/**` | `/api/v1/events/*` | No `campaigns` table |
| Plotting calendar | `app/dashboard/plotting-calendars/page.tsx` | `/api/v1/plotting-calendars/*` | Single large page file |
| My events | `app/dashboard/my-events/**` | `/api/v1/events/my-events`, `/:id/stats` | |
| Event calendar | `app/dashboard/calendar/page.tsx` | `GET /api/v1/events` | Status colors / badges |
| Coverage map | `app/dashboard/coverage-map/**` | `/api/v1/coverage-areas/*` | Hybrid backend data + local GeoJSON |
| Inventory | `app/dashboard/inventory/page.tsx` | `/api/v1/inventory/*` | |
| Staff | `app/dashboard/staff/**` | `/api/v1/users/*` | |
| Settings | `app/dashboard/settings/page.tsx` | `/api/v1/settings/*` | |
| Donor portal | `app/donor/**` | `/api/v1/donor/*` | |
| Auth | `app/auth/**`, `components/auth/**` | `/api/v1/auth/*` | httpOnly refresh cookie |

---

## 7. Important Data Models / Entities

Models live under `src/models/<domain>/` with `schema.sql`, `rls.sql`, `types.ts`.

### Organization

| | |
|-|-|
| **Path** | `src/models/organizations/` |
| **Key fields** | `id`, `name`, `code`, `contact_email`, `is_active` |
| **Frontend** | Signup org lookup, session `organization` |
| **API** | `GET /api/v1/organizations/lookup` |

### User (staff profile)

| | |
|-|-|
| **Path** | `src/models/users/` |
| **Key fields** | `id`, `org_id`, `auth_id`, `email`, `role` (JSONB: `type`, `permissions`), `is_active` |
| **Frontend** | Staff page, auth session, permissions |
| **API** | `/api/v1/users`, `/api/v1/auth/me` |

### Event

| | |
|-|-|
| **Path** | `src/models/events/` — `events` table |
| **Key fields** | `status`, `setup_status`, `creation_method`, `plotting_calendar_id`, `type`, `event_date`, `start_time`, `end_time`, `extra_data`, `visibility`, `is_public` |
| **Statuses** | `draft`, `plotted`, `needs_details`, `scheduled`, `published`, `ongoing`, `completed`, `cancelled` |
| **Frontend** | Campaign, my-events, calendar, plotting reserve |
| **API** | `/api/v1/events/*` |

### PlottingCalendar (+ days + slots)

| | |
|-|-|
| **Path** | `src/models/events/schema.sql` |
| **Tables** | `plotting_calendars`, `plotting_calendar_days`, `plotting_calendar_time_slots` |
| **Key fields** | `access_type`, `allowed_dates`, `allowed_time_slots`, `max_events_per_date`, `availability_mode`, `flexible_starts_at`, `flexible_ends_at` |
| **Frontend** | Plotting calendars page |
| **API** | `/api/v1/plotting-calendars/*` |

### Blood inventory

| | |
|-|-|
| **Path** | `src/models/inventory/` |
| **Tables** | `blood_inventory`, `blood_inventory_transactions` |
| **Key fields** | `blood_type`, `quantity`, `min_threshold`, `expiry_date` |
| **Frontend** | Dashboard summary, inventory page |
| **API** | `/api/v1/inventory/*` |

### Pending signup

| | |
|-|-|
| **Path** | `src/models/pending_signups/` |
| **Purpose** | Staging until OTP completes |
| **Frontend** | `ReviewSignupModal` |

### Geographic (province / district / municipality)

| | |
|-|-|
| **Path** | `src/models/geographic/` |
| **Frontend** | `lib/geographic.ts`, `hooks/useGeographicOptions.ts` |
| **API** | `/api/v1/geographic/*` |

### Donor profile

| | |
|-|-|
| **Path** | Migrations / donor services (e.g. `migrations/20260403_add_donor_profiles_and_signup_flow.sql`) |
| **API** | `/api/v1/donor/*` |

### Entities **not** found as dedicated tables

- **Campaign** — use `events` + `extra_data`
- **Reservation** — plotting books via `POST .../plot-event` → `events`
- **BloodRequest** — not found in `src/models/` (TODO: confirm if planned only)

RBAC tables (`permissions`, `role_permissions`, etc.) are referenced in `authorization.service.ts` and migrations; not under `src/models/` as separate folders.

---

## 8. Environment Variables

**Templates:** `env-copy.txt` (backend), frontend `.env` (no `.env.example` in prototype — TODO: add example file).

Never commit real secrets. Do not document actual values here.

### Backend (representative)

| Variable | Purpose |
|----------|---------|
| `PORT` | API port (default `6900`) |
| `NODE_ENV` | Environment |
| `CORS_ALLOWED_ORIGINS` | CORS |
| `FRONTEND_URL`, `BACKEND_URL`, `APP_URL` | URLs for redirects / links |
| `SESSION_MAX_AGE_DAYS`, `AUTH_REFRESH_COOKIE_NAME`, `AUTH_COOKIE_SAME_SITE` | Refresh cookie |
| `ACCESS_TOKEN_EXPIRES_IN` | Documented target; Supabase dashboard controls JWT |
| `AUTH_*_RATE_LIMIT_*` | Login / OTP rate limits |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, etc. | Supabase |
| `BREVO_*`, `DEFAULT_EMAIL_FROM` | Email |
| `CHAT_*` | Chat storage limits |
| `NOTIFICATION_*` | Notification queue / rate limits |
| `GEOGRAPHIC_CACHE_TTL_MS` | Geographic cache |
| `DEFAULT_DONOR_ORG_CODE` | Donor default org |

### Frontend

| Variable | Client-side? | Purpose |
|----------|--------------|---------|
| `NEXT_PUBLIC_BACKEND_BASE_URL` | Yes | API base (should be `http://localhost:6900` in dev) |
| `BACKEND_BASE_URL` | Server fallback | Same |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase (required in `lib/supabase.ts`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `NEXT_PUBLIC_MAP_BOX_PUBLIC_TOKEN` | Yes | Mapbox (coverage map) |
| `MAP_BOX_PUBLIC_TOKEN` | Server read | Passed from server page to client map |
| `NEXT_PUBLIC_MAP_DEBUG` | Yes | Enables map debug route |
| `NEXT_PUBLIC_APP_URL` | Yes | Documented in auth.md |

**Mismatch note:** `lib/api.ts` falls back to `http://localhost:3000` if env vars are unset; backend default is `6900`. Set `NEXT_PUBLIC_BACKEND_BASE_URL=http://localhost:6900` locally.

---

## 9. Design System Notes

**UI Component Migration**: We are currently migrating away from heavy reliance on `HeroUI` (`@heroui/react`) towards native, shared React components stored in `unite-frontend-enterprise-prototype/components/ui/` (e.g., `dropdown.tsx`). 
- **Rule**: When building new features or refactoring, prefer creating/using simple shared components in `components/ui/` over introducing new HeroUI usage unless absolutely necessary for complex widget behavior.
- See `docs/ui-component-migration.md` for migration details.

| Topic | Convention |
|-------|------------|
| **Font** | Plus Jakarta Sans — `app/layout.tsx` (`public/fonts/PlusJakartaSans-Variable.ttf`), `--font-plus-jakarta-sans` |
| **Brand colors** | `--color-brand-red: #ed1010`, `--color-brand-blue: #0f4c81`, `--color-surface: #f3f4f6` in `app/globals.css` |
| **Buttons** | `components/ui/button.tsx` — CVA variants: `default` (brand-red), `secondary`, `ghost`, `outline`, `destructive`; `rounded-xl` |
| **Cards** | `components/ui/card.tsx` |
| **Dropdowns/Menus** | Use `AppDropdown` from `components/ui/dropdown.tsx` instead of HeroUI dropdowns. |
| **Modals** | Campaign/staff: dedicated modal components; plotting: inline `SetupShell` / `ModalShell` on plotting page |
| **Sidebar** | `AppSidebar.tsx` — active route `bg-brand-red`; Events subgroup |
| **Layout** | `AppShell` = topbar + sidebar + content; slate backgrounds |
| **Plotting calendar** | FullCalendar themed via `.plotting-calendar-view` in `globals.css` |

---

## 10. Coding Conventions

| Area | Pattern |
|------|---------|
| **Frontend API** | `lib/api.ts` — `request()` with `credentials: "include"`, Bearer token, `{ success, data, error }` shape |
| **Auth refresh** | Single retry on 401 via `authRefresh()` in `lib/api.ts` |
| **Caching** | `lib/api-cache.ts` + `cachedApiResponse` with TTLs per domain; `invalidateEventCaches()` etc. |
| **Permissions (UI)** | `lib/permissions.ts` — `hasPermission`, `hasAnyPermission`, `canAccess`; legacy alias normalization |
| **Backend handlers** | Controllers thin; logic in `src/services/**` |
| **Validation** | Zod in validators + services |
| **Errors** | API `{ success: false, error: { code, message } }` |
| **Loading (UI)** | Local `useState` loading flags on pages; use reusable skeleton components (`components/ui/skeleton.tsx`) to prevent layout shift; auth uses `authStatus: loading \| authenticated \| unauthenticated` |
| **Forms** | react-hook-form + Zod on auth/signup; plotting page uses controlled local state |
| **Naming** | kebab-case routes; `plotting-calendars` API segment; DB snake_case |

---

## 11. Known Current Decisions

- Plotting calendar UI is a **multi-step wizard** (Details → Dates → Date Settings → Review) in one page file.
- **Default access** is `organization_link` (frontend form + DB default).
- Per-day time can be **`flexible`** or **`slots`**; if no fixed slots configured, default draft mode is **flexible**.
- Plotting reservation creates an event with **`status: plotted`**, **`setup_status: needs_details`**, not a separate reservation entity.
- **`POST /api/v1/events`** must not use `creation_method: plotting_calendar`** — use `plot-event` endpoint.
- **No `campaigns` table** in v1; campaign UI uses events.
- **Donation coverage map** uses real backend data, merged with local mock GeoJSON boundaries for shapes.
- GeoJSON scope is **Camarines Sur** sample (`lib/data/geo/camarines-sur-coverage.json`), not nationwide.
- **Public events** require `published` + `setup_status: complete` + public visibility ([campaign-event-flow.md](./campaign-event-flow.md)).
- Frontend prototype folder is **gitignored** in this repo.
- **Chat** backend code exists; HTTP routes not mounted on v1 router.

---

## 12. Things Future AI Should Not Do

- Do not redesign the entire UI or sidebar unless explicitly asked.
- Do not change logo/branding unless asked.
- Do not replace the plotting calendar flow without reading this guide and `plotting-calendars/page.tsx`.
- Do not remove plotting **access modes** (`org`, `users`, `organizations`, `share_token`, `organization_link`).
- Do not collapse flexible/slots day modes without migration + API + UI alignment.
- Do not hardcode API keys or commit `.env` secrets.
- Do not expose Supabase **service role** or Mapbox secret tokens in `NEXT_PUBLIC_*`.
- Do not load huge nationwide GeoJSON when only regional boundaries are used.
- Do not add backend changes for **coverage-map-only** tasks.
- Do not route plotting creates through `POST /api/v1/events` with `plotting_calendar` creation method.
- Do not assume `localhost:3000` is the API — backend is **`6900`** by default.
- Do not delete `allowed_dates` / normalized day rows sync logic without checking service + migration constraints.

---

## 13. Common Debugging Notes

| Symptom | Where to look |
|---------|----------------|
| API 404 / connection refused | `NEXT_PUBLIC_BACKEND_BASE_URL` vs `PORT=6900`; `lib/api.ts` fallback `localhost:3000` |
| Auth redirect loops | [auth.md](./auth.md) — cookie `credentials: "include"`, CORS, `FRONTEND_URL` |
| 401 then recovery | Expected once per expired access token; repeated refresh = duplicate clients |
| Mapbox blank / error | `MAP_BOX_PUBLIC_TOKEN` or `NEXT_PUBLIC_MAP_BOX_PUBLIC_TOKEN`; server page passes token to client |
| Plotting date not selectable | `isPastDateKey`, day `status`, calendar `status`, `expires_at` |
| Reserve modal validation | `availability_mode` slots vs flexible; `validateDateAvailabilityDraft` on page |
| Sidebar item hidden | `AppSidebar` `requiredAnyPermissions`; user `role.permissions` |
| Permission denied on API | `authorize()` vs RLS; legacy permission aliases in `authorization.service.ts` |
| Event not public | `status`, `setup_status`, `visibility`, `is_public` rules |
| Staff list empty | `users.invite` permission on `GET /api/v1/users` |

---

## 14. Future TODOs

- [x] Backend API for **donation coverage map** (replace `lib/mock-coverage-areas.ts`)
- [ ] Real GeoJSON / boundary service integration (regional, not full country inline)
- [ ] Dedicated **`campaigns` table** if product requires multi-event campaigns ([campaign-event-flow.md](./campaign-event-flow.md))
- [ ] Mount **chat** routes if product needs in-app messaging over HTTP
- [ ] Frontend `.env.example` in prototype
- [ ] Align `lib/api.ts` default API URL with backend port `6900`
- [ ] Analytics / reporting endpoints (not found in v1 routes)
- [x] Unauthenticated share-link plotting route (if product requires link-only access without login)
- [ ] Track frontend in git or document deployment as separate repo (currently gitignored)

---

## How to use this guide (for AI & developers)

1. Start with **§6 Feature Map** or **§4 Frontend Navigation** to locate files.
2. Cross-check **§5 Backend API Map** for endpoints and permissions.
3. For plotting, auth, or campaigns, open the linked **docs/** files before editing behavior.
4. Search this file for a feature name (e.g. `plotting-calendars`, `coverage-map`).
5. Mark unknowns as **TODO** in code only after confirming in `src/` or `unite-frontend-enterprise-prototype/`.

When adding new features, update this file in the same PR as structural changes (new routes, models, or top-level pages).
