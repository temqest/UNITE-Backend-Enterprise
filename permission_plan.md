Current auth touchpoints to verify first:

Campaign logout trigger logic: page.tsx:195
Bearer token source: api.ts:15
Auth middleware response path: auth.middleware.ts:31
Role model currently implemented: auth.types.ts:15
What this means right now

Fix and validate login session flow end-to-end.
Confirm your super admin user has a valid users row and org assignment where required.
Only after that, roll out full RBAC.
Detailed Permission And Access Plan

Phase 0: Stabilize Authentication Baseline (Must Pass First)

Define auth success criteria:
Logged-in user keeps session across route changes.
Protected API returns 401 only for missing or invalid token.
Authenticated but disallowed actions return 403.
Add an auth diagnostics endpoint:
GET /api/v1/auth/me returns user id, role, org_id, active flag, and resolved permissions count.
Add structured auth logs:
Log request id, user id, role, org id, endpoint, decision allow or deny, and reason code.
Add contract tests:
Missing token -> 401 MISSING_TOKEN.
Invalid token -> 401 UNAUTHORIZED.
Authenticated no org scope -> 403 FORBIDDEN_ORG_SCOPE_REQUIRED.
Authenticated active user with scope -> 200.
Phase 1: Canonical Role Model

Freeze role hierarchy:
super_admin
admin
coordinator
stakeholder
donor
viewer
Map current roles to canonical roles for migration:
org_admin -> admin
staff -> coordinator or stakeholder based on current assignments
Define role intent:
super_admin: cross-org governance and platform operations
admin: organization-wide administration
coordinator: operational owner for campaign execution
stakeholder: collaborator with limited management actions
donor: participation-focused self-service role
viewer: read-only visibility role
Phase 2: Permission Taxonomy

Adopt permission naming standard:
resource.action
Examples: events.read, events.create, events.approve, users.invite, reports.export
Group by domains:
organization
users
campaigns and events
chat and communications
inventory
documents
reports and analytics
system settings
Define decision rules:
Deny by default.
Explicit allow required.
Super admin can be wildcard only during transition, then move to explicit grant set.
Phase 3: RBAC Data Model

Create tables:
roles
permissions
role_permissions
user_role_assignments
optional user_permission_overrides
Add scope columns where needed:
org scope
optional geographic scope
optional feature scope
Seed initial role and permission records.
Build migration scripts:
Backfill existing users with mapped roles.
Validate no user remains unmapped.
Phase 4: Authorization Middleware Stack

Keep middleware split by concern:
authenticate middleware
requireActiveUser middleware
requireOrgScope middleware
authorize(permission) middleware
Route-level guards:
Every protected endpoint declares at least one permission requirement.
Standard error codes:
401 for authentication failures
403 for authorization failures
423 optional for pending approval or disabled states
Phase 5: Feature Permission Matrix

super_admin
Full access to all orgs, users, approvals, settings, exports, audit.
admin
Full access within own org, including users, campaigns, approvals, settings, reports.
coordinator
Create and manage campaigns and events, assign stakeholders, track operations, no org-level settings.
stakeholder
Update assigned campaign details, submit operational updates, limited approvals based on assignment.
donor
View public and allowed campaigns, register participation, manage own profile and history.
viewer
Read-only dashboards and campaign visibility with no write actions.
Phase 6: Rollout Strategy

Sprint 1:
Auth baseline and /auth/me endpoint
RBAC schema and seed data
Permission engine service and middleware
Sprint 2:
Secure high-risk modules first:
users
organization settings
campaign approvals
Sprint 3:
Secure remaining modules:
chat
inventory
reports
docs
Sprint 4:
Frontend gate integration:
Hide unavailable actions from UI
Keep backend as final source of truth
Sprint 5:
Audit and hardening:
Permission coverage tests
Access regression tests
Audit log review dashboards
Phase 7: Testing And Governance

Automated tests:
Role x endpoint matrix tests
Negative tests for privilege escalation
Cross-org isolation tests
Operational controls:
Audit trail for denied and granted privileged actions
Emergency role revoke and session invalidate flow
Documentation:
Permission catalog
Role responsibilities
Onboarding and offboarding checklist
Recommended immediate next execution order for your repo

Confirm auth is stable for your super admin account using auth diagnostics.
Add canonical roles and migration mapping.
Implement permission middleware and apply to campaign and users endpoints first.
Add frontend feature gating once backend checks are complete.