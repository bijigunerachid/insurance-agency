import { vi } from 'vitest';

export function jsonResponse(status, body) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Asked by every page: a new installation, with no agency set, unless a test says otherwise. */
const DEFAULT_ROUTES = {
  'GET /api/agency/brand': () => [200, { name: null, tagline: null, logo: false, icon: false }],
  // One insurer or none: no workspace cards (the cards have their own tests).
  'GET /api/workspaces': () => [200, { items: [] }],
};

/**
 * Replaces fetch with a router: routes['GET /api/auth/me'] = (init) => [status, body] or a
 * Promise rejection. Unknown routes fail the test loudly.
 */
export function mockApi(routes) {
  const fetchMock = vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`;
    const handler = routes[key] ?? DEFAULT_ROUTES[key];
    if (!handler) throw new Error(`Unexpected request ${key}`);
    const [status, body] = await handler(init);
    return jsonResponse(status, body);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function me({
  stage = 'ACTIVE',
  role = 'ADMIN',
  permissions,
  twoFactorEnabled = true,
} = {}) {
  const defaults = {
    ADMIN: [
      'audit.read',
      'customers.archive',
      'customers.assign',
      'customers.identity',
      'customers.read',
      'customers.write',
      'system.health',
      'users.manage',
      'users.read',
    ],
    AGENT: [],
  };
  return {
    authenticated: true,
    stage,
    csrfToken: 'csrf-test-token',
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      username: 'karim.admin',
      displayName: 'Karim Test',
      role: { code: role, name: role === 'ADMIN' ? 'Administrateur' : 'Agent' },
      twoFactorEnabled,
      permissions: stage === 'ACTIVE' ? (permissions ?? defaults[role]) : [],
    },
  };
}

export const unauthenticated = [401, { error: { code: 'UNAUTHENTICATED', requestId: 'r-1' } }];

/** /api/auth/me answer when nobody is signed in. */
export const anonymous = [200, { authenticated: false }];
