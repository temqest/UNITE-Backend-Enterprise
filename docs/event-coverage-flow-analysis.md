# Event and Coverage Area Flow Analysis

## 1. Purpose
This document explores the current and ideal relationship between events, plotting calendar reservations, and coverage areas in the UNITE system. Currently, events and coverage areas operate somewhat independently. The goals of this analysis are to:
- Understand the relationship between events and coverage areas
- Avoid disconnected manual numbers (e.g., target vs actual collected units)
- Make the coverage map reflect real event outcomes automatically
- Prepare for a proper backend/frontend solution so that future implementations can design the best data flow.

## 2. Current Project Context
- **Campaign Management:** Uses the `events` table (no `campaigns` table in v1). Campaign details are stored in `events.extra_data`.
- **Plotting Calendar:** Admins define schedules in `plotting_calendars`. Users can reserve time, creating an event with `status: plotted` and `setup_status: needs_details`.
- **My Events:** Users manage their assigned events and enter results here.
- **Event Calendar:** A dashboard view (`/dashboard/calendar`) showing event statuses.
- **Coverage Map:** A visual dashboard (`/dashboard/coverage-map`) that shows geographic boundaries based on coverage areas assigned to an organization.
- **Coverage Area:** Managed in `/api/v1/coverage-areas`. Currently stores manually updated counts for `collected_units`, `donor_count`, `successful_donations`, `deferred_donors`, `upcoming_events_count`.
- **Event results:** `events` table contains `actual_collected_bags`, `actual_donors`, `wastage_units`. They are updated when an event is completed.
- **Inventory:** `blood_inventory` stores actual physical bags. (Needs verification on whether event completion directly adds to inventory yet).

## 3. Relevant Frontend Files
**Campaign Management page:**
`unite-frontend-enterprise-prototype/app/dashboard/campaign/page.tsx`

**Manual event create modal:**
`unite-frontend-enterprise-prototype/components/campaign/modals/ManualEventCreateModal.tsx`

**Complete event details modal:**
`unite-frontend-enterprise-prototype/components/campaign/modals/CompleteEventDetailsModal.tsx`

**My Events page:**
`unite-frontend-enterprise-prototype/app/dashboard/my-events/page.tsx`

**My Event detail page:**
`unite-frontend-enterprise-prototype/app/dashboard/my-events/[eventId]/page.tsx`

**Event result update UI:**
Likely within `unite-frontend-enterprise-prototype/app/dashboard/my-events/[eventId]/page.tsx` or related modal. (Needs verification)

**Plotting Calendar page:**
`unite-frontend-enterprise-prototype/app/dashboard/plotting-calendars/page.tsx`

**Public plotting calendar page:**
Needs verification, likely inside `unite-frontend-enterprise-prototype/app/dashboard/plotting-calendars/page.tsx` or a separate `share` route under `app/plotting-calendar/share/[token]/page.tsx`.

**Coverage Map page:**
`unite-frontend-enterprise-prototype/app/dashboard/coverage-map/page.tsx`

**Coverage Area management modals:**
`unite-frontend-enterprise-prototype/components/coverage-map/ManageCoverageAreasModal.tsx` (Needs verification)

**API client functions:**
`unite-frontend-enterprise-prototype/lib/api.ts`

## 4. Relevant Backend Files
- **Event routes:** `src/api/v1/routes/events/events.routes.ts`
- **Event controllers:** `src/api/v1/controllers/events/`
- **Event services:** `src/services/events/event.service.ts`
- **Event validators:** `src/api/v1/validators/events.validator.ts` (Needs verification)
- **Event schema/model:** `src/models/events/schema.sql`
- **Plotting calendar routes:** `src/api/v1/routes/plotting-calendars/plotting-calendars.routes.ts`
- **Plotting calendar controller:** `src/api/v1/controllers/events/plotting-calendar.controller.ts`
- **Plotting calendar service:** `src/services/events/plotting-calendar.service.ts`
- **Coverage area routes:** `src/api/v1/routes/coverage-areas/coverage-areas.routes.ts`
- **Coverage area service:** `src/services/coverage-areas/coverage-areas.service.ts` (Needs verification)
- **Coverage area schema/model:** `src/models/coverage_areas/schema.sql`
- **Inventory routes:** `src/api/v1/routes/inventory/inventory.routes.ts`

## 5. Current Database Entities
### `events`
- **Path:** `src/models/events/schema.sql`
- **Purpose:** Stores manual events, plotted events, campaigns.
- **Important fields:** `id`, `org_id`, `status`, `setup_status`, `plotting_calendar_id`, `type`, `event_date`, `extra_data`, `actual_collected_bags`, `actual_donors`, `wastage_units`.
- **Relations:** Belongs to `organizations`, `plotting_calendars`. Has `event_participants`, `event_staff`.

### `plotting_calendars`
- **Path:** `src/models/events/schema.sql`
- **Purpose:** Defines schedules/windows where events can be booked.
- **Important fields:** `id`, `org_id`, `access_type`, `status`.

### `plotting_calendar_days` & `plotting_calendar_time_slots`
- **Path:** `src/models/events/schema.sql`
- **Purpose:** Represent specific day and slot availability.

### `organization_coverage_areas`
- **Path:** `src/models/coverage_areas/schema.sql`
- **Purpose:** Represents geographic areas a blood center covers.
- **Important fields:** `id`, `org_id`, `area_name`, `psgc_code`, `target_units`, `target_donors`, `collected_units`, `donor_count`.
- **Relations:** Belongs to `organizations`.

### `event_participants`
- **Path:** `src/models/events/schema.sql`
- **Purpose:** Tracks donors or users who join an event.
- **Important fields:** `participant_type`, `participant_user_id`, `participant_donor_id`, `status` (applied, confirmed, participated, donated, no_show).

## 6. Current Event Lifecycle
- **draft:** Newly created, incomplete.
- **plotted:** Created from a plotting calendar reservation.
- **needs_details:** Setup is incomplete (e.g., missing host org, exact location).
- **scheduled:** Fully detailed and approved, but not yet public.
- **published:** Visible to public/donors (if `is_public` = true).
- **ongoing:** Event is currently happening.
- **completed:** Event finished, actual results have been entered.
- **cancelled:** Event cancelled.

**Manual creation:** Users fill out the `ManualEventCreateModal`.
**Plotted creation:** Users select a slot on the Plotting Calendar; backend generates an event with `status: plotted`.
**Completion:** Staff updates the event to `completed`, entering `actual_collected_bags`, `actual_donors`, etc.

## 7. Plotting Calendar to Event Flow
### Internal plotting
- Select plotting calendar from `/dashboard/plotting-calendars`.
- Choose available date from day grid.
- Choose flexible time or fixed slot.
- Submit reservation.
- Backend (`POST /api/v1/plotting-calendars/:id/plot-event`) creates an event in the DB with `status: plotted`, `setup_status: needs_details`, `creation_method: plotting_calendar`.

### Public share-link plotting
- Visitor opens `share_token` link.
- Picks date/time.
- Unauthenticated payload is sent.
- Backend creates event with limited fields. Staff must review and complete details later.

**Currently Missing:** There is no field linking the plotting calendar reservation (the created event) to a specific Coverage Area. The event only has free-text `address` and `extra_data`.

## 8. Coverage Area Current Flow
- Areas are created in `/dashboard/coverage-map` settings.
- Linked to geographic boundaries via `psgc_code`.
- `target_units` and `target_donors` are manually set.
- **Gap:** `collected_units`, `donor_count`, `successful_donations`, `deferred_donors`, `upcoming_events_count` exist as integer columns in the table and are manually typed/updated via forms.
- The coverage map colors the geographic boundaries based on `collected_units / target_units`.

## 9. Missing Connection Between Events and Coverage Areas
- **Does an event currently reference a coverage area ID?** No.
- **Does an event only store address text?** Yes.
- **Is there a `coverage_area_id` field?** No, not in the `events` schema.
- **Does plotting calendar reservation know the coverage area?** No.
- **Does completing an event update a coverage area?** No.
- **Does the coverage map calculate progress from event results?** No, it uses the hardcoded/manually updated `collected_units` field in `organization_coverage_areas`.
- **Are collected units duplicated?** Yes. Completed events store `actual_collected_bags`, and coverage areas store their own `collected_units`.

## 10. Recommended Data Flow
**Core Principle:** 
Coverage Area should define the target and geographic identity.
Events should define actual activity.
Event Results should drive actual collected data.
Coverage Map should aggregate event results by coverage area.

**Suggested Flow:**
1. **Admin creates Coverage Area:** Sets geographic bounds (PSGC), `target_units`, and `target_donors`.
2. **Event is created:** When created (manually or plotted), the form includes a Coverage Area selector. The backend stores `coverage_area_id` on the event.
3. **Event is completed:** Staff enters `actual_collected_bags`, `actual_donors`, etc.
4. **Coverage Map rendering:** The backend calculates `collected_units` for a coverage area by summing `actual_collected_bags` for all `completed` events belonging to that area. The frontend map reflects this real data.

## 11. Recommended Backend Model Changes
**`organization_coverage_areas` changes:**
- Keep `target_units`, `target_donors` as manual fields.
- Treat `collected_units`, `donor_count`, `successful_donations`, `deferred_donors`, `upcoming_events_count` as computed fields returned by a service/view, OR remove them from the table entirely and calculate on the fly via a `GET /api/v1/coverage-areas/:id/performance` endpoint.
- Alternatively, add a `coverage_area_adjustments` table for historical manual data that can't be tied to an event.

**`events` changes:**
- Add `coverage_area_id UUID REFERENCES public.organization_coverage_areas(id) ON DELETE SET NULL`.

## 12. Recommended API Design
- `PATCH /api/v1/events/:id/coverage-area`: Link an event to a coverage area.
- `PATCH /api/v1/events/:id/results`: Existing completion logic, but must ensure data is valid for coverage aggregation.
- `GET /api/v1/coverage-areas/map-data`: Modified to join with events and return aggregated `collected_units`, `upcoming_events_count`, etc.
- `GET /api/v1/coverage-areas/:id/events`: List events associated with a specific coverage area.
- *(Optional)* `POST /api/v1/coverage-areas/:id/adjustments`: For correcting historical data without creating fake events.

## 13. Recommended Frontend Changes
- **Event Create/Edit Modals:** Add a `<Select>` dropdown to choose the `coverage_area_id`.
- **Plotting Public Reservation:** Allow public users to select a coverage area (or the staff assigns it later in the Complete Details step).
- **Complete Event Details Modal:** Make Coverage Area a required field before publishing.
- **Event Results Form:** Directly updates the `actual_collected_bags` on the event.
- **Coverage Map:** Ensure the map consumes the newly aggregated backend values instead of relying on manually typed figures in the Area settings.
- **Coverage Area Form:** Disable manual editing of `collected_units` and `donor_count`.

## 14. Manual Updates vs Automatic Updates
**Recommendation: Automatic Updates**
Targets (`target_units`, `target_donors`) should be freely editable in the Coverage Area settings.
Actuals (`collected_units`, etc.) should ONLY come from completed event results.
Direct manual editing of collected units on Coverage Areas should be disabled.
If corrections are needed for past records (before the system was used), a dedicated "Manual Adjustments" table/feature should be built.

**Formula:**
`Final collected units = sum(completed event collected units for area) + manual adjustments (if any)`

## 15. Data Integrity Rules
- Events should belong to at most one coverage area.
- Completed events must have result data to affect the map.
- Archived coverage areas should not be assigned to new events.
- If a coverage area is deleted, existing events should set `coverage_area_id` to NULL (or block deletion if events exist).
- Only `status: completed` events add to the `collected_units`.
- Events in `draft`, `plotted`, or `scheduled` state only increment the `upcoming_events_count`.

## 16. Edge Cases
- **Event has no coverage area yet:** Should be excluded from the map's aggregates.
- **Event spans multiple areas:** The current schema implies 1 event = 1 area. If it spans multiple, staff should pick the primary area.
- **Public user enters unknown address:** The event enters `needs_details` state. A staff member assigns the coverage area manually during the Complete Details step.
- **Cancelled events:** Should be excluded from all coverage aggregates (both completed and upcoming).
- **Partial event result data:** `actual_collected_bags` should default to 0 if null.

## 17. Proposed Implementation Plan
*(Do not implement this yet, for reference only)*
- **Phase 1:** Audit current code and DB.
- **Phase 2:** Run migration to add `coverage_area_id` to `events`.
- **Phase 3:** Update event frontend forms (manual create, complete details) to select coverage area.
- **Phase 4:** Update backend APIs to handle the new field.
- **Phase 5:** Create an aggregate coverage map service on the backend to sum event results.
- **Phase 6:** Remove manual collected fields from the Coverage Area forms and replace them with read-only calculated values.
- **Phase 7:** Add optional manual adjustment feature if requested by product.

## 18. Files That Will Likely Need Changes Later
**Frontend:**
- `unite-frontend-enterprise-prototype/components/campaign/modals/ManualEventCreateModal.tsx`
- `unite-frontend-enterprise-prototype/components/campaign/modals/CompleteEventDetailsModal.tsx`
- `unite-frontend-enterprise-prototype/app/dashboard/my-events/[eventId]/page.tsx`
- `unite-frontend-enterprise-prototype/app/dashboard/coverage-map/page.tsx`
- `unite-frontend-enterprise-prototype/components/coverage-map/CoverageMapPageClient.tsx`
- `unite-frontend-enterprise-prototype/lib/api.ts`

**Backend:**
- `src/models/events/schema.sql` (to add column)
- `src/models/coverage_areas/schema.sql` (to remove manual stat columns or document them as cached aggregates)
- `src/api/v1/validators/events.validator.ts`
- `src/services/events/event.service.ts`
- `src/services/coverage-areas/coverage-areas.service.ts`

## 19. Open Questions
- Should one event belong to exactly one coverage area? (Recommended: Yes).
- Should public users choose coverage area directly on plotting forms, or enter address and staff assigns it later? (Recommended: Staff assigns later).
- Should only `completed` events count toward `collected_units`? (Yes).
- Should inventory updates be fully automated upon event completion? (Product decision needed).

## 20. Final Recommendation
**Coverage Area** should own the regional targets and geographic identity.
**Events** should own the schedule and activity.
**Event Results** should own the actual collection data.
The **Coverage Map** should compute its progress by aggregating completed event results mapped to each coverage area.
Manual override of collected units directly on the Coverage Area should be removed in favor of strict event-based aggregation to ensure data integrity.
