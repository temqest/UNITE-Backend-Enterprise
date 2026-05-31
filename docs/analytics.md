# Operations Analytics

This document describes the design and current implementation state of the UNITE Operations Analytics page.

## Purpose
The Analytics page gives a high-level operational view of the organization's:
- Event progress and completion
- Blood collection performance vs goals
- Inventory health and alerts
- Donation coverage area performance
- Staff activity and performance tracking
- Operational insights that require attention

## Current Status (v2 - Backend Integrated)
The Analytics page is now powered by real backend data. It uses a single endpoint to fetch aggregated data and distributes it throughout the frontend via React Context.

### Backend Implementation
- **Route:** `GET /api/v1/analytics/dashboard`
- **Location:** `src/api/v1/routes/analytics/analytics.routes.ts`
- **Controller:** `src/api/v1/controllers/analytics/analytics.controller.ts`
- **Service:** `src/services/analytics/analytics.service.ts`
- **Validator:** `src/api/v1/validators/analytics/analytics.validator.ts`
- **Permissions:** Gated under `events.read` authorization and requires an active organization scope (`org_id`).

### Frontend Implementation
- **Route:** `/dashboard/analytics`
- **Main Page:** `app/dashboard/analytics/page.tsx`
- **State Management:** Data is fetched via `getAnalyticsDashboard` (`lib/api.ts`) and provided to all child components via `AnalyticsContext.Provider`.
- **Components (`components/analytics/`):**
  - `AnalyticsHeader` & `AnalyticsFilters`
  - `AnalyticsSummaryCards`
  - **Tabs:** Overview, Events, Inventory, Coverage, Staff, Insights
  - `AnalyticsChartCard` (Reusable wrapper for chart visualizations)
- **Chart Components (`components/analytics/charts/`):**
  - Powered by **Recharts** (`AnalyticsBarChart`, `AnalyticsDonutChart`, `AnalyticsLineChart`, `AnalyticsHorizontalBarChart`).

### Data Structure Returned
The `/dashboard` endpoint returns a composite JSON structure:
- `summary`: Top-level KPIs (Total events, collected units, goal achievement).
- `events`: Event distribution, statuses, and performance over time.
- `inventory`: Current stock levels vs minimum thresholds, Code Red status.
- `coverage`: Event completion and unit collection progress mapped to geographic areas.
- `staff`: Staff event completion rates and collection contributions.
- `insights`: Actionable, prioritized recommendations based on aggregated data.

## Known Limitations & Future Work
- **Historical Code Red Tracking**: True historical snapshots are not currently available in the schema. Current Code Red logic generates simulated ongoing alerts based on current inventory dropping below minimum thresholds. A snapshot system (e.g., daily cron jobs recording stock levels) is required for accurate historical reporting.
- **Performance Tuning**: As the event dataset grows, complex joins may require materialized views in Supabase. We have implemented frontend TTL caching (via `cachedApiResponse` and `api-cache.ts`) and backend in-memory cache in the controller with 60s TTL to prevent burst querying. Backend service queries are parallelized with `Promise.all` for speed.
- **Dedicated Permissions**: If a dedicated `analytics.read` scope is added to the RBAC system, the route definition in `analytics.routes.ts` should be updated.
