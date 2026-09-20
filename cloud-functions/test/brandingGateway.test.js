const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  brandingValues,
  createBrandingGatewayHandler,
  parseRequest,
  projectBranding,
} = require('../brandingGateway');

const validBranding = {
  mode: 'custom',
  colors: { primary: '#123456', primaryDark: '#102030', accent: '#abcdef', background: '#ffffff' },
  logo: { emoji: 'S' },
  assets: { logo: 'https://firebasestorage.googleapis.com/v0/b/demo/o/tenants%2Ftenant-a%2Fbranding%2Flogo_abcdefghijklmnop.png' },
  theme: { borderRadius: 10 },
};

function fixture({ uid = 'admin-a', profile = {}, tenant = {}, branding } = {}) {
  const data = new Map([
    ['users/admin-a', { role: 'admin', status: 'active', tenantId: 'tenant-a' }],
    ['users/admin-b', { role: 'admin', status: 'active', tenantId: 'tenant-b' }],
    ['users/employee-a', { role: 'employee', status: 'active', tenantId: 'tenant-a' }],
    ['users/customer-a', { role: 'customer', status: 'active', tenantId: 'tenant-a' }],
    ['users/super-admin', { role: 'super-admin', status: 'active' }],
    ['tenants/tenant-a', { adminUsers: ['admin-a'], users: ['admin-a', 'employee-a'] }],
    ['tenants/tenant-b', { adminUsers: ['admin-b'], users: ['admin-b'] }],
  ]);
  data.set(`users/${uid}`, { ...(data.get(`users/${uid}`) || {}), ...profile });
  data.set('tenants/tenant-a', { ...data.get('tenants/tenant-a'), ...tenant });
  if (branding) data.set('tenants/tenant-a/branding/config', branding);
  class Ref {
    constructor(value) { this.path = value; }
    doc(id) { return new Ref(`${this.path}/${id}`); }
    collection(name) { return new Ref(`${this.path}/${name}`); }
    async get() { return { exists: data.has(this.path), data: () => data.get(this.path) }; }
    async set(value, options) {
      data.set(this.path, options?.merge ? { ...(data.get(this.path) || {}), ...structuredClone(value) } : structuredClone(value));
    }
  }
  return { data, admin: { auth: () => ({ verifyIdToken: async () => ({ uid }) }), firestore: () => ({ collection: name => new Ref(name) }) } };
}

function response() {
  return { statusCode: 0, body: null, set() { return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
}

async function call(source, body, headers = { authorization: 'Bearer fake' }) {
  const res = response();
  await createBrandingGatewayHandler({ admin: source.admin })({ method: 'POST', headers, body }, res);
  return res;
}

test('authorized tenant admin reads default branding and updates canonical branding', async () => {
  const source = fixture();
  const initial = await call(source, { action: 'get', tenantId: 'tenant-a' });
  assert.deepEqual(initial.body.branding, { mode: 'default', colors: {}, logo: {}, assets: {}, theme: {}, ready: true });
  const updated = await call(source, { action: 'update', tenantId: 'tenant-a', branding: validBranding });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.body.branding.ready, true);
  const stored = source.data.get('tenants/tenant-a/branding/config');
  assert.equal(stored.updatedByUid, 'admin-a');
  assert.equal(typeof stored.updatedAt, 'string');
});

test('super-admin remains supported for an explicit existing tenant', async () => {
  const result = await call(fixture({ uid: 'super-admin' }), { action: 'get', tenantId: 'tenant-b' });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.branding.mode, 'default');
});

test('wrong tenant, non-admin roles, inactive admin, and unauthenticated callers are denied', async () => {
  assert.equal((await call(fixture(), { action: 'get', tenantId: 'tenant-b' })).statusCode, 403);
  assert.equal((await call(fixture({ uid: 'employee-a' }), { action: 'get', tenantId: 'tenant-a' })).statusCode, 403);
  assert.equal((await call(fixture({ uid: 'customer-a' }), { action: 'get', tenantId: 'tenant-a' })).statusCode, 403);
  assert.equal((await call(fixture({ profile: { status: 'inactive' } }), { action: 'get', tenantId: 'tenant-a' })).statusCode, 403);
  assert.equal((await call(fixture(), { action: 'get', tenantId: 'tenant-a' }, {})).statusCode, 401);
});

test('strict request rejects forged actors, timestamps, unknown fields, and unsafe values', () => {
  for (const field of ['uid', 'role', 'updatedAt', 'updatedByUid']) {
    assert.throws(() => parseRequest({ action: 'get', tenantId: 'tenant-a', [field]: 'forged' }));
  }
  assert.throws(() => brandingValues({ ...validBranding, unknown: true }, 'tenant-a'));
  assert.throws(() => brandingValues({ ...validBranding, colors: { ...validBranding.colors, primary: 'red' } }, 'tenant-a'));
  assert.throws(() => brandingValues({ ...validBranding, assets: { logo: validBranding.assets.logo.replace('tenant-a', 'tenant-b') } }, 'tenant-a'));
  assert.throws(() => brandingValues({ ...validBranding, assets: { logo: 'https://attacker.example/v0/b/demo/o/tenants%2Ftenant-a%2Fbranding%2Flogo_abcdefghijklmnop.png' } }, 'tenant-a'));
  assert.throws(() => brandingValues({ ...validBranding, assets: { logo: 'https://firebasestorage.googleapis.com/extra/v0/b/demo/o/tenants%2Ftenant-a%2Fbranding%2Flogo_abcdefghijklmnop.png' } }, 'tenant-a'));
  assert.throws(() => brandingValues({ ...validBranding, theme: { borderRadius: 100 } }, 'tenant-a'));
});

test('default and valid custom branding are ready without requiring optional logo customization', () => {
  assert.equal(projectBranding(null, false, 'tenant-a').ready, true);
  const noLogo = brandingValues({ ...validBranding, mode: 'default', assets: { logo: '' } }, 'tenant-a');
  assert.equal(projectBranding(noLogo, true, 'tenant-a').ready, true);
});

test('malformed custom branding is not ready while compatible omitted optional values remain ready', () => {
  assert.equal(projectBranding({ mode: 'custom', colors: { primary: 'red' } }, true, 'tenant-a').ready, false);
  assert.equal(projectBranding({ mode: 'custom' }, true, 'tenant-a').ready, true);
});

test('legacy branding projects only canonical allowlisted values', () => {
  const projected = projectBranding({ ...validBranding, customCSS: 'private', integrations: { webhookUrl: 'private' } }, true, 'tenant-a');
  assert.deepEqual(Object.keys(projected).sort(), ['assets', 'colors', 'logo', 'mode', 'ready', 'theme']);
  assert.equal(projected.mode, 'custom');
});

test('deployed branding gateway is bounded and secret-free', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  assert.match(source, /exports\.brandingGateway = functions\.runWith\(\{ minInstances: 0, maxInstances: 3 \}\)/);
  assert.doesNotMatch(source, /exports\.brandingGateway[\s\S]{0,100}secrets:/);
});
