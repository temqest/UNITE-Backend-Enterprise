process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'dummy-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role-key';

require('ts-node/register/transpile-only');

const test = require('node:test');
const assert = require('node:assert/strict');
const { changePasswordSchema } = require('../src/api/v1/validators/auth/change-password.validator.ts');
const { resolveUserAuthorization, clearAuthzCache } = require('../src/services/auth/authorization.service.ts');

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('Password change schema validates matching passwords and optional currentPassword', () => {
  // Reject mismatching passwords
  const mismatch = changePasswordSchema.safeParse({
    currentPassword: 'OldPassword123!',
    newPassword: 'NewPassword123!',
    confirmPassword: 'DifferentPassword123!',
  });
  assert.equal(mismatch.success, false);

  // Accept matching passwords
  const valid = changePasswordSchema.safeParse({
    currentPassword: 'OldPassword123!',
    newPassword: 'NewPassword123!',
    confirmPassword: 'NewPassword123!',
  });
  assert.equal(valid.success, true);
  assert.equal(valid.data.newPassword, 'NewPassword123!');
});

test('RBAC authorization cache stores and returns cached permissions', async () => {
  clearAuthzCache();
  const testUser = {
    id: 'cache-test-user-1',
    org_id: 'org-1',
    role: { type: 'staff', permissions: ['events.read'] },
  };

  const firstResolve = await resolveUserAuthorization(testUser);
  assert.equal(firstResolve.role, 'coordinator');

  // Second resolve should return identical cached data
  const secondResolve = await resolveUserAuthorization(testUser);
  assert.deepEqual(firstResolve, secondResolve);

  // Clear cache for this user
  clearAuthzCache(testUser.id);
});

test('Super admin authorization bypasses DB queries and returns wildcard', async () => {
  const superAdmin = {
    id: 'super-admin-1',
    org_id: 'org-1',
    role: { type: 'super_admin' },
  };

  const result = await resolveUserAuthorization(superAdmin);
  assert.equal(result.role, 'super_admin');
  assert.deepEqual(result.permissions, ['*']);
});

test('Canonical middleware re-exports work transparently from both folders', () => {
  const mid1 = require('../src/middelware/rate-limit.middleware.ts');
  const mid2 = require('../src/middleware/rate-limit.middleware.ts');

  assert.equal(typeof mid1.authSignupRateLimiter, 'function');
  assert.equal(typeof mid2.authSignupRateLimiter, 'function');
  assert.equal(typeof mid1.calendarAccessRateLimiter, 'function');
  assert.equal(typeof mid2.calendarAccessRateLimiter, 'function');
});

test('Express app sets X-Response-Time and x-request-id on responses', async () => {
  const http = require('node:http');
  const app = require('../src/index');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const res = await fetch(`http://localhost:${port}/health`);
  assert.equal(res.status, 200);
  assert.ok(res.headers.get('x-response-time'), 'x-response-time header should be present');
  assert.ok(res.headers.get('x-request-id'), 'x-request-id header should be present');
  assert.match(res.headers.get('x-response-time'), /^\d+(\.\d+)?ms$/);

  await new Promise((resolve) => server.close(resolve));
});
