# UNITE Backend Enterprise

Multi-tenant blood bank operations API (Express + Supabase) with an enterprise Next.js frontend prototype in `unite-frontend-enterprise-prototype/`.

## Documentation

| Document | Description |
|----------|-------------|
| **[docs/AI_PROJECT_GUIDE.md](docs/AI_PROJECT_GUIDE.md)** | Central navigation guide for AI assistants and developers (frontend + backend paths, features, APIs, env vars) |
| [docs/auth.md](docs/auth.md) | Authentication and session architecture |
| [docs/campaign-event-flow.md](docs/campaign-event-flow.md) | Events, plotting calendars, statuses |
| [docs/coverage-map.md](docs/coverage-map.md) | Donation coverage map (mock frontend) |
| [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) | Backend architecture deep dive |

## Quick start

**Backend** (default port `6900`):

```bash
cp env-copy.txt .env   # fill in Supabase and other values
npm install
npm run dev
```

**Frontend** (separate folder, default port `3000`):

```bash
cd unite-frontend-enterprise-prototype
npm install
# set NEXT_PUBLIC_BACKEND_BASE_URL=http://localhost:6900
npm run dev
```

For AI/developer navigation, see **[docs/AI_PROJECT_GUIDE.md](docs/AI_PROJECT_GUIDE.md)**.
