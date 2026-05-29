# Donation Coverage Map

The Donation Coverage Map is currently a frontend-only dashboard page at `/dashboard/coverage-map`.
It uses mock Bicol-area coverage data and does not call backend APIs, create database models, or persist changes.

## Mapbox token

The page uses the existing frontend environment variable:

```env
MAP_BOX_PUBLIC_TOKEN=your_mapbox_public_token
```

Mapbox renders in the browser, but this project normally exposes browser variables with `NEXT_PUBLIC_`.
To keep the requested variable name unchanged, the route reads `process.env.MAP_BOX_PUBLIC_TOKEN` in the server page and passes the value into the client map component.
If the token is missing, the page shows a development message instead of crashing.

## Mock data

Mock areas live in `unite-frontend-enterprise-prototype/lib/mock-coverage-data.ts`.
Each area includes location coordinates, target units, collected units, donor counts, successful donations, deferred donors, upcoming event count, last campaign date, event type, priority blood types, and coverage status.

## Status color logic

- Green: `reached_goal`
- Yellow: `near_goal`
- Red: `below_goal`
- Gray: `no_activity`
- Blue accent: areas with upcoming campaigns

## Future backend integration

Replace the mock data source with an API-backed coverage summary once backend endpoints exist.
The current component boundaries are intended to support that swap by keeping map rendering, filters, summary cards, details, and list presentation separate from the data source.
