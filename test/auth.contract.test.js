require('ts-node/register/transpile-only');

const test = require('node:test');
const assert = require('node:assert/strict');

const { createAuthMiddleware } = require('../src/middelware/auth.middleware.ts');
const {
  requireActiveUser,
  requireOrgScope,
  requireRole,
} = require('../src/middelware/authorization.middleware.ts');

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

function createReq(overrides = {}) {
  return {
    method: 'GET',
    originalUrl: '/api/v1/test',
    url: '/api/v1/test',
    headers: {},
    ...overrides,
  };
}

test('Missing token -> 401 MISSING_TOKEN', async () => {
  const req = createReq();
  const res = createMockRes();
  const middleware = createAuthMiddleware(async () => ({ id: 'should-not-run' }));

  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.error?.code, 'MISSING_TOKEN');
});

test('Invalid token -> 401 UNAUTHORIZED', async () => {
  const req = createReq({
    headers: { authorization: 'Bearer invalid-token' },
  });
  const res = createMockRes();
  const middleware = createAuthMiddleware(async () => null);

  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.error?.code, 'UNAUTHORIZED');
});

test('Authenticated no org scope -> 403 FORBIDDEN_ORG_SCOPE_REQUIRED', () => {
  const req = createReq({
    user: {
      id: 'u-1',
      role: { type: 'coordinator', permissions: [] },
      is_active: true,
    },
  });
  const res = createMockRes();

  let nextCalled = false;
  requireOrgScope(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.error?.code, 'FORBIDDEN_ORG_SCOPE_REQUIRED');
});

test('Authenticated active user with scope -> 200 (middleware pass)', async () => {
  const req = createReq({
    headers: { authorization: 'Bearer valid-token' },
  });
  const res = createMockRes();
  const middleware = createAuthMiddleware(async () => ({
    id: 'u-1',
    auth_id: 'auth-u-1',
    org_id: 'org-1',
    is_active: true,
    role: { type: 'staff', permissions: ['events.read'] },
  }));

  let authNext = false;
  await middleware(req, res, () => {
    authNext = true;
  });

  assert.equal(authNext, true);
  assert.equal(res.statusCode, 200);

  let activeNext = false;
  requireActiveUser(req, res, () => {
    activeNext = true;
  });
  assert.equal(activeNext, true);

  let orgNext = false;
  requireOrgScope(req, res, () => {
    orgNext = true;
  });
  assert.equal(orgNext, true);
});

test('Role guard rejects authenticated user with wrong role', () => {
  const req = createReq({
    user: {
      id: 'u-1',
      org_id: 'org-1',
      role: { type: 'viewer', permissions: [] },
      is_active: true,
    },
  });
  const res = createMockRes();

  let nextCalled = false;
  requireRole('admin', 'super_admin')(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.error?.code, 'FORBIDDEN');
});

test('Role guard accepts canonical role from auth middleware', () => {
  const req = createReq({
    user: {
      id: 'u-1',
      org_id: 'org-1',
      canonical_role: 'admin',
      role: { type: 'org_admin', permissions: [] },
      is_active: true,
    },
  });
  const res = createMockRes();

  let nextCalled = false;
  requireRole('admin')(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});
