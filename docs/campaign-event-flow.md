# Campaign and Event Flow

## Overview

The campaign and event module now centers on two event creation paths:

1. `Manual Create`
2. `Plot from Calendar`

In v1 there is still no dedicated `campaigns` table. Campaign-facing messaging stays on `events.extra_data`, which keeps the current architecture intact while still letting the UI present campaign-oriented planning workflows.

## Event Model

### Statuses

Primary event workflow now uses:

- `draft`
- `plotted`
- `needs_details`
- `scheduled`
- `published`
- `ongoing`
- `completed`
- `cancelled`

`setup_status` remains available as a detail-completion helper:

- `needs_details`
- `pending_setup`
- `complete`

### Creation Methods

- `manual`
- `plotting_calendar`

### Public Visibility

Public donor/public listings only surface events that are:

- `status = 'published'`
- `setup_status = 'complete'`
- `visibility = 'public'` or `is_public = true`

Draft, plotted, needs-details, scheduled-only, and cancelled events stay internal.

## Plotting Calendars

`plotting_calendars` define controlled calendar windows where authenticated org users can reserve event dates and time slots through an appointment-style month/week calendar.

Each plotting calendar stores:

- title and description
- allowed event types
- default per-date and per-slot capacity limits
- access type and allow-lists
- optional expiry
- status

Actual day and slot availability is stored in:

- `plotting_calendar_days`
  - one row per configured date
  - status: `open`, `unavailable`, or `fully_booked`
  - optional per-day capacity override
- `plotting_calendar_time_slots`
  - one row per available slot on a configured day
  - status: `open`, `unavailable`, or `fully_booked`
  - optional per-slot capacity override

The legacy `allowed_dates` and `allowed_time_slots` fields remain synchronized as summary metadata, but interactive scheduling uses the normalized day and slot rows.

Statuses are `active`, `closed`, `expired`, and `archived`.

In v1, plotting requires authenticated users.

## Backend Endpoints

### Events

- `POST /api/v1/events/manual`
- `POST /api/v1/events/quick-create`
- `POST /api/v1/events`
- `GET /api/v1/events`
- `GET /api/v1/events/public`
- `PATCH /api/v1/events/:id/complete-details`
- `PATCH /api/v1/events/:id/status`
- `PATCH /api/v1/events/:id/publish`
- `PATCH /api/v1/events/:id`
- `DELETE /api/v1/events/:id`

Deprecated review-flow endpoints remain only as `410 Gone` responses:

- `POST /api/v1/events/:id/approve`
- `POST /api/v1/events/:id/reject`
- `POST /api/v1/events/:id/reschedule`

### Plotting Calendars

- `GET /api/v1/plotting-calendars`
- `GET /api/v1/plotting-calendars/:id`
- `POST /api/v1/plotting-calendars`
- `PATCH /api/v1/plotting-calendars/:id`
- `DELETE /api/v1/plotting-calendars/:id`
- `GET /api/v1/plotting-calendars/:id/availability?from=&to=`
- `PUT /api/v1/plotting-calendars/:id/availability`
- `GET /api/v1/plotting-calendars/:id/available-slots`
- `POST /api/v1/plotting-calendars/:id/plot-event`

## Frontend Pages

- `/dashboard/campaign`
  - main internal event planning page
  - manual create
  - complete details
  - publish/cancel
- `/dashboard/calendar`
  - internal event calendar with event status colors and source badges
- `/dashboard/plotting-calendars`
  - FullCalendar month/week availability management
  - admin day status and slot editing
  - coworker slot reservation and plotted event creation

## Permissions

Service logic now normalizes both canonical and legacy permission names.

Canonical event permissions:

- `events.read`
- `events.create`
- `events.update`
- `events.approve`
- `events.delete`

Legacy aliases such as `create_events`, `manage_events`, `edit_events`, `view_events`, and `approve_events` are still accepted in service-level checks and RLS helper usage.

## Upgrade Path

If the product later needs real multi-event campaigns, introduce a dedicated `campaigns` table and move shared public messaging there. The current v1 design keeps that migration straightforward because campaign-facing fields are already grouped inside event metadata rather than scattered across unrelated tables.
