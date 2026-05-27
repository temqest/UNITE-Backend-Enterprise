# UNITE Authentication Architecture

## Overview

UNITE uses a hybrid Supabase authentication model:

- Supabase Auth verifies passwords, Google OAuth sessions, access JWTs, and refresh-token rotation.
- The Express backend owns the application session facade with an httpOnly refresh cookie.
- The Next.js frontend keeps only the short-lived access token and safe user object in memory.
- App-specific authorization comes from the `users` profile, organization scope, RBAC tables, and permission overrides.

This keeps refresh tokens out of localStorage/sessionStorage while preserving the existing Supabase Auth, signup, OTP, Google, donor, staff, admin, and password flows.

## Backend Endpoints

- `POST /api/v1/auth/login`: validates email/password with Supabase Auth, creates an app refresh-session row, sets the httpOnly refresh cookie, and returns `{ user, organization, accessToken, redirectTo }`.
- `POST /api/v1/auth/refresh`: reads the refresh cookie, validates the app refresh session, refreshes with Supabase Auth, rotates the stored refresh-token hash, resets the cookie, and returns a fresh access token plus safe session data.
- `GET /api/v1/auth/me`: validates the bearer access token and returns the current safe user/session data.
- `POST /api/v1/auth/logout`: revokes the app refresh session if present and clears the refresh cookie. It does not require a still-valid access token.
- Existing signup, Google, OTP, forgot-password, and change-password endpoints remain in place.

## Token And Cookie Strategy

- Access tokens are Supabase JWTs and should be short lived. Configure this in Supabase Auth settings; use `ACCESS_TOKEN_EXPIRES_IN=15m` as the documented target.
- Refresh tokens are Supabase refresh tokens stored only in an httpOnly cookie named by `AUTH_REFRESH_COOKIE_NAME`.
- The backend stores only a SHA-256 hash of the active refresh token in `public.app_refresh_sessions`.
- Refresh tokens rotate on every successful `/auth/refresh`.
- Logout revokes the app session row and clears the browser cookie.

Cookie defaults:

- `httpOnly: true`
- `secure: true` in production
- `sameSite: lax`
- `path: /api/v1/auth`
- `maxAge`: `SESSION_MAX_AGE_DAYS`, default `7`

## Frontend Flow

- `AuthProvider` is mounted in `app/layout-root.tsx`.
- On app startup or hard refresh, the provider calls `/auth/refresh` once.
- If refresh succeeds, the app stores the returned safe session and access token in memory.
- If refresh fails, auth state becomes `unauthenticated`.
- Normal dashboard tab/page navigation reads cached provider state and does not call `/auth/me` or `/auth/refresh` repeatedly.
- `lib/api.ts` attaches the in-memory access token to protected requests, uses `credentials: "include"`, refreshes once after a 401, retries once, then emits a single session-expired event.

Auth state names:

- `authStatus`: `loading`, `authenticated`, or `unauthenticated`
- `currentUser`
- `isAuthenticated`
- `isInitialAuthCheckComplete`
- `accessToken`

## Route Protection

- Public pages stay public: landing, donor events, auth pages, signup/OTP/Google/password flows, and organization lookup.
- Dashboard routes are wrapped by `app/dashboard/layout.tsx`.
- Donor dashboard is wrapped by `app/donor/dashboard/layout.tsx`.
- Unauthenticated users are redirected to login with `next`.
- Authenticated users opening login pages are redirected to their dashboard.
- Authenticated users without role/permission access see `/unauthorized`, not login.

## Roles And Permissions

Backend authorization is centralized:

- `authMiddleware` validates bearer access tokens.
- `requireActiveUser` blocks inactive users.
- `requireOrgScope` requires organization context.
- `requireRole(...roles)` checks canonical roles.
- `authorize(permission)` resolves RBAC tables and user permission overrides.

Frontend helpers live in `lib/permissions.ts`:

- `hasRole`
- `hasPermission`
- `hasAnyPermission`
- `canAccess`

## Environment Variables

Backend:

```bash
SESSION_MAX_AGE_DAYS=7
AUTH_REFRESH_COOKIE_NAME=unite_refresh_token
AUTH_COOKIE_SAME_SITE=lax
ACCESS_TOKEN_EXPIRES_IN=15m
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:6900
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

Supabase-managed access token lifetime must be applied in the Supabase Auth dashboard. The Express app documents `ACCESS_TOKEN_EXPIRES_IN` but does not sign Supabase JWTs itself.

Frontend:

```bash
NEXT_PUBLIC_BACKEND_BASE_URL=http://localhost:6900
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Never expose Supabase service-role or secret keys through `NEXT_PUBLIC_` variables.

## Troubleshooting

- Repeated redirects usually mean `/auth/refresh` is failing or cookies are blocked. Check `credentials: "include"`, CORS origins, cookie SameSite, and backend URL.
- A 401 followed by one `/auth/refresh` is expected when the access token expires.
- More than one refresh for a single failing request indicates duplicate API client paths or multiple app roots.
- If refresh works locally but not in production, confirm HTTPS and `secure` cookie behavior.
- If the refresh-session table is inaccessible to the backend, confirm service-role grants and Supabase Data API exposure settings.

## Known Limitations

- Supabase Auth controls the true JWT expiry and refresh-token rotation policy.
- The app refresh-session table adds reviewable logout/max-age enforcement but does not replace Supabase `auth.sessions`.
- Google OAuth still briefly exposes provider-issued Supabase tokens to frontend JavaScript during the OAuth callback because the existing app uses client-side Supabase OAuth. The backend immediately moves the refresh token into the httpOnly cookie after exchange/completion.
