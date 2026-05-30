# Donation Coverage Map

The Donation Coverage Map is a dashboard page at `/dashboard/coverage-map`.
It integrates backend data with local static GeoJSON geometries for performance.

## Mapbox token

The page uses the existing frontend environment variable:

```env
MAP_BOX_PUBLIC_TOKEN=your_mapbox_public_token
```

Mapbox renders in the browser, but this project normally exposes browser variables with `NEXT_PUBLIC_`.
To keep the requested variable name unchanged, the route reads `process.env.MAP_BOX_PUBLIC_TOKEN` in the server page and passes the value into the client map component.
If the token is missing, the page shows a development message instead of crashing.

## Backend Data & Geometry Merging

Coverage areas are fetched from `/api/v1/coverage-areas`.
The `organization_coverage_areas` database table supports standard CRUD operations and stores operational statistics (targets, collected units, upcoming events).

To optimize network performance, we do not require the backend to return massive nationwide GeoJSON in every response. Instead:
1. The frontend fetches the user's organizational coverage areas.
2. It attempts to match these records against the local `mockCoverageAreas` (acting as a static GeoJSON boundary lookup file) by `area_name`.
3. If a match is found, the local `geometry` is attached to the area before rendering. Otherwise, it uses the `geometry` field from the backend if it was provided.

## Status color logic

- Green: `goal_reached`
- Yellow: `near_goal`
- Red: `below_goal`
- Gray: `no_activity`
- Blue accent: areas with upcoming campaigns

## Future improvements

- Implement a full boundary selection tool in the `ManageCoverageAreasModal` so admins can click a shape on a map to add it to their coverage area without typing names manually.
- Store official PSGC codes during selection to make matching more robust than name-based string comparison.
