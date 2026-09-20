const ORIGINS = new Set([
  'https://servicesos.netlify.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
]);
const MODES = new Set(['default', 'custom']);
const COLOR_KEYS = ['primary', 'primaryDark', 'accent', 'background'];
const MAX_TEXT = 120;
const MAX_URL = 2048;
const DEFAULT_BRANDING = Object.freeze({
  colors: { primary: '#3b82f6', primaryDark: '#1d4ed8', accent: '#f59e0b', background: '#f8fafc' },
  logo: { emoji: 'S' },
  assets: { logo: '' },
  theme: { borderRadius: 10 },
});

function normalizedText(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function membershipContains(membership, uid) {
  if (Array.isArray(membership)) return membership.includes(uid);
  return Boolean(membership && typeof membership === 'object' && Object.hasOwn(membership, uid) && membership[uid]);
}

class BrandingGatewayError extends Error {
  constructor(message, code = 'invalid_request', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const fail = (message, code, status) => {
  throw new BrandingGatewayError(message, code, status);
};

function exactShape(value, fields) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join('|') === fields.slice().sort().join('|');
}

function boundedText(value, maximum = MAX_TEXT) {
  const text = normalizedText(value);
  if (text === null || text.length > maximum) fail('Check the branding details.', 'validation_failed', 422);
  return text;
}

function color(value) {
  const text = boundedText(value, 7);
  if (!/^#[0-9a-fA-F]{6}$/.test(text)) fail('Check the branding details.', 'validation_failed', 422);
  return text.toLowerCase();
}

function assetUrl(value, tenantId) {
  if (value === '') return '';
  const text = boundedText(value, MAX_URL);
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    fail('Check the branding details.', 'validation_failed', 422);
  }
  const local = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  const firebaseStorageHost = parsed.hostname === 'firebasestorage.googleapis.com';
  if ((!firebaseStorageHost && !local) || (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:'))) {
    fail('Check the branding details.', 'validation_failed', 422);
  }
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(parsed.pathname);
  } catch {
    fail('Check the branding details.', 'validation_failed', 422);
  }
  const objectPath = `/o/tenants/${tenantId}/branding/`;
  const fileName = decodedPath.startsWith('/v0/b/') && decodedPath.includes(objectPath)
    ? decodedPath.slice(decodedPath.indexOf(objectPath) + objectPath.length)
    : '';
  if (!/^logo_[A-Za-z0-9_-]{16,128}\.(jpg|png|webp|gif)$/.test(fileName) ||
      decodedPath !== `${decodedPath.slice(0, decodedPath.indexOf(objectPath))}${objectPath}${fileName}`) {
    fail('Check the branding details.', 'validation_failed', 422);
  }
  return text;
}

function brandingValues(value, tenantId) {
  if (!exactShape(value, ['mode', 'colors', 'logo', 'assets', 'theme']) || !MODES.has(value.mode)) {
    fail('Invalid branding request.');
  }
  if (!exactShape(value.colors, COLOR_KEYS) || !exactShape(value.logo, ['emoji']) ||
      !exactShape(value.assets, ['logo']) || !exactShape(value.theme, ['borderRadius'])) {
    fail('Invalid branding request.');
  }
  const colors = Object.fromEntries(COLOR_KEYS.map(key => [key, color(value.colors[key])]));
  const emoji = boundedText(value.logo.emoji, 16);
  const logo = assetUrl(value.assets.logo, tenantId);
  if (!Number.isInteger(value.theme.borderRadius) || value.theme.borderRadius < 4 || value.theme.borderRadius > 20) {
    fail('Check the branding details.', 'validation_failed', 422);
  }
  return {
    mode: value.mode,
    colors,
    logo: { emoji },
    assets: { logo },
    theme: { borderRadius: value.theme.borderRadius },
  };
}

function isValidCustomBrandingState(value, tenantId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.mode === 'default') return true;
  if (value.mode !== undefined && value.mode !== 'custom') return false;
  if (value.colors !== undefined && (!value.colors || typeof value.colors !== 'object' || Array.isArray(value.colors))) return false;
  if (value.logo !== undefined && (!value.logo || typeof value.logo !== 'object' || Array.isArray(value.logo))) return false;
  if (value.assets !== undefined && (!value.assets || typeof value.assets !== 'object' || Array.isArray(value.assets))) return false;
  if (value.theme !== undefined && (!value.theme || typeof value.theme !== 'object' || Array.isArray(value.theme))) return false;
  const candidate = {
    mode: 'custom',
    colors: { ...DEFAULT_BRANDING.colors, ...(value.colors || {}) },
    logo: { ...DEFAULT_BRANDING.logo, ...(value.logo || {}) },
    assets: { ...DEFAULT_BRANDING.assets, ...(value.assets || {}) },
    theme: { ...DEFAULT_BRANDING.theme, ...(value.theme || {}) },
  };
  try {
    brandingValues(candidate, tenantId);
    return true;
  } catch {
    return false;
  }
}

function parseRequest(body) {
  const action = body?.action;
  const fields = action === 'get' ? ['action', 'tenantId'] : ['action', 'tenantId', 'branding'];
  if (!['get', 'update'].includes(action) || !exactShape(body, fields)) fail('Invalid branding request.');
  const tenantId = boundedText(body.tenantId, 128);
  if (tenantId === 'DEFAULT' || tenantId.includes('/')) fail('Invalid branding request.');
  return { action, tenantId, branding: body.branding };
}

async function authorizedContext(admin, uidValue, requestedTenantId) {
  const uid = normalizedText(uidValue);
  if (!uid) fail('Authentication required.', 'unauthenticated', 401);
  const db = admin.firestore();
  const profileSnapshot = await db.collection('users').doc(uid).get();
  if (!profileSnapshot.exists) fail('Branding access unavailable.', 'forbidden', 403);
  const profile = profileSnapshot.data() || {};
  if (profile.status !== 'active') fail('Branding access unavailable.', 'forbidden', 403);

  const tenantSnapshot = await db.collection('tenants').doc(requestedTenantId).get();
  if (!tenantSnapshot.exists) fail('Branding access unavailable.', 'forbidden', 403);
  if (profile.role === 'super-admin') return { uid, tenantId: requestedTenantId };
  const tenant = tenantSnapshot.data() || {};
  if (profile.role !== 'admin' || normalizedText(profile.tenantId) !== requestedTenantId ||
      !membershipContains(tenant.adminUsers, uid)) {
    fail('Branding access unavailable.', 'forbidden', 403);
  }
  return { uid, tenantId: requestedTenantId };
}

function projectBranding(value, exists, tenantId) {
  const source = value || {};
  const ready = !exists || source.mode === 'default' || isValidCustomBrandingState(source, tenantId);
  const result = {
    mode: exists && source.mode === 'default' ? 'default' : (exists ? 'custom' : 'default'),
    colors: {},
    logo: {},
    assets: {},
    theme: {},
    ready,
  };
  if (!ready) return result;
  for (const key of COLOR_KEYS) if (typeof source.colors?.[key] === 'string') result.colors[key] = source.colors[key];
  if (typeof source.logo?.emoji === 'string') result.logo.emoji = source.logo.emoji;
  if (typeof source.assets?.logo === 'string') {
    try { result.assets.logo = assetUrl(source.assets.logo, tenantId); } catch { result.assets.logo = ''; }
  }
  if (Number.isInteger(source.theme?.borderRadius)) result.theme.borderRadius = source.theme.borderRadius;
  return result;
}

async function handleRequest({ admin, context, request }) {
  const ref = admin.firestore().collection('tenants').doc(context.tenantId).collection('branding').doc('config');
  const snapshot = await ref.get();
  if (request.action === 'get') {
    return { success: true, branding: projectBranding(snapshot.exists ? snapshot.data() : null, snapshot.exists, context.tenantId) };
  }
  const branding = brandingValues(request.branding, context.tenantId);
  const now = new Date().toISOString();
  await ref.set({ ...branding, updatedAt: now, updatedByUid: context.uid }, { merge: true });
  return { success: true, branding: { ...branding, ready: true } };
}

function createBrandingGatewayHandler({ admin }) {
  return async (req, res) => {
    const origin = req.headers?.origin;
    if (ORIGINS.has(origin)) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); }
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' });
    const header = req.headers?.authorization || req.headers?.Authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' });
    let identity;
    try { identity = await admin.auth().verifyIdToken(token); } catch {
      return res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' });
    }
    try {
      const request = parseRequest(req.body);
      const context = await authorizedContext(admin, identity.uid, request.tenantId);
      return res.status(200).json(await handleRequest({ admin, context, request }));
    } catch (error) {
      if (error instanceof BrandingGatewayError) {
        return res.status(error.status).json({ error: 'Branding access unavailable.', code: error.code });
      }
      return res.status(500).json({ error: 'Branding is temporarily unavailable.', code: 'branding_unavailable' });
    }
  };
}

module.exports = {
  BrandingGatewayError,
  COLOR_KEYS,
  authorizedContext,
  brandingValues,
  createBrandingGatewayHandler,
  isValidCustomBrandingState,
  parseRequest,
  projectBranding,
};
