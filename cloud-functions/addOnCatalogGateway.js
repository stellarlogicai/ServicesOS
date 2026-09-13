const { membershipContains, normalizedText } = require('./ownerOnboardingBootstrapGateway');
const { verifyCanonicalEmployee } = require('./employeeAuthorization');

const ORIGINS = new Set(['https://servicesos.netlify.app','http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5174','http://localhost:5174']);
const MAX_ITEMS = 100;
const LIMITS = { label: 100, description: 300, priceCents: 10000000, durationMinutes: 1440 };

class AddOnCatalogError extends Error {
  constructor(message, code = 'invalid_request', status = 400) { super(message); this.code = code; this.status = status; }
}
const fail = (message, code, status) => { throw new AddOnCatalogError(message, code, status); };

function exactShape(body, fields) {
  return body && typeof body === 'object' && !Array.isArray(body) &&
    Object.keys(body).sort().join('|') === fields.slice().sort().join('|');
}

function catalogValues(body) {
  const label = normalizedText(body.label);
  const description = normalizedText(body.description);
  if (!label || label.length > LIMITS.label || description.length > LIMITS.description ||
      typeof body.active !== 'boolean' || !Number.isInteger(body.priceCents) ||
      body.priceCents < 0 || body.priceCents > LIMITS.priceCents ||
      !Number.isInteger(body.durationMinutes) || body.durationMinutes < 1 ||
      body.durationMinutes > LIMITS.durationMinutes) fail('Check the add-on details.', 'validation_failed', 422);
  return { label, description, active: body.active, priceCents: body.priceCents, durationMinutes: body.durationMinutes };
}

function parseRequest(body) {
  const action = body?.action;
  const valueFields = ['action','label','description','active','priceCents','durationMinutes'];
  const shapes = {
    owner_list: ['action'], employee_list_active: ['action'],
    owner_create: valueFields,
    owner_update: [...valueFields, 'addOnId'],
  };
  if (!shapes[action] || !exactShape(body, shapes[action])) fail('Invalid catalog request.');
  const result = { action };
  if (action === 'owner_create' || action === 'owner_update') Object.assign(result, catalogValues(body));
  if (action === 'owner_update') {
    const addOnId = normalizedText(body.addOnId);
    if (!addOnId || addOnId.length > 128 || addOnId.includes('/')) fail('Invalid catalog request.');
    result.addOnId = addOnId;
  }
  return result;
}

async function identityContext(admin, identity) {
  const uid = normalizedText(identity?.uid);
  if (!uid) fail('Authentication required.', 'unauthenticated', 401);
  const db = admin.firestore();
  const profileSnap = await db.collection('users').doc(uid).get();
  if (!profileSnap.exists) fail('Access unavailable.', 'forbidden', 403);
  const profile = profileSnap.data() || {};
  const tenantId = normalizedText(profile.tenantId);
  if (!tenantId || tenantId === 'DEFAULT' || profile.status !== 'active') fail('Access unavailable.', 'forbidden', 403);
  const tenantSnap = await db.collection('tenants').doc(tenantId).get();
  if (!tenantSnap.exists) fail('Access unavailable.', 'forbidden', 403);
  return { uid, tenantId, profile, tenant: tenantSnap.data() || {} };
}

function requireOwner(context) {
  if (context.profile.role !== 'admin' || !membershipContains(context.tenant.adminUsers, context.uid))
    fail('Access unavailable.', 'forbidden', 403);
}

const ownerProjection = (id, value) => ({ id, label:value.label, description:value.description || '', active:value.active === true, priceCents:value.priceCents, durationMinutes:value.durationMinutes });
const employeeProjection = (id, value) => ({ id, label:value.label, priceCents:value.priceCents, durationMinutes:value.durationMinutes });

async function listOwner({ admin, context }) {
  requireOwner(context);
  const snap = await admin.firestore().collection('tenants').doc(context.tenantId).collection('addOnCatalog').limit(MAX_ITEMS).get();
  return { success:true, addOns:snap.docs.map(doc => ownerProjection(doc.id, doc.data() || {})).sort((a,b)=>a.label.localeCompare(b.label)) };
}

async function createOwner({ admin, context, request }) {
  requireOwner(context);
  const ref = admin.firestore().collection('tenants').doc(context.tenantId).collection('addOnCatalog').doc();
  const now = new Date().toISOString();
  const record = { label:request.label, description:request.description, active:request.active, priceCents:request.priceCents, durationMinutes:request.durationMinutes, createdAt:now, updatedAt:now, createdByUid:context.uid, updatedByUid:context.uid };
  await ref.create(record);
  return { success:true, addOn:ownerProjection(ref.id, record) };
}

async function updateOwner({ admin, context, request }) {
  requireOwner(context);
  const ref = admin.firestore().collection('tenants').doc(context.tenantId).collection('addOnCatalog').doc(request.addOnId);
  const snap = await ref.get();
  if (!snap.exists) fail('Add-on unavailable.', 'addon_unavailable', 404);
  const patch = { label:request.label, description:request.description, active:request.active, priceCents:request.priceCents, durationMinutes:request.durationMinutes, updatedAt:new Date().toISOString(), updatedByUid:context.uid };
  await ref.update(patch);
  return { success:true, addOn:ownerProjection(ref.id, { ...snap.data(), ...patch }) };
}

async function listEmployee({ admin, identity }) {
  const employee = await verifyCanonicalEmployee({ admin, uid: identity.uid });
  const snap = await admin.firestore().collection('tenants').doc(employee.tenantId).collection('addOnCatalog').where('active','==',true).limit(MAX_ITEMS).get();
  const addOns = snap.docs.map(doc => employeeProjection(doc.id, doc.data() || {}))
    .filter(item => item.label && Number.isInteger(item.priceCents) && Number.isInteger(item.durationMinutes))
    .sort((a,b)=>a.label.localeCompare(b.label));
  return { success:true, addOns };
}

function createAddOnCatalogGatewayHandler({ admin }) { return async (req,res) => {
  const origin=req.headers?.origin; if(ORIGINS.has(origin)){res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin');}
  res.set('Access-Control-Allow-Methods','POST, OPTIONS'); res.set('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS') return res.status(204).send('');
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed',code:'method_not_allowed'});
  const header=req.headers?.authorization||req.headers?.Authorization||''; const token=header.startsWith('Bearer ')?header.slice(7).trim():'';
  if(!token)return res.status(401).json({error:'Authentication required',code:'unauthenticated'});
  let identity;
  try { identity=await admin.auth().verifyIdToken(token); }
  catch { return res.status(401).json({error:'Authentication required',code:'unauthenticated'}); }
  try {
    const request=parseRequest(req.body);
    if(request.action==='employee_list_active') return res.status(200).json(await listEmployee({admin,identity}));
    const context=await identityContext(admin,identity); const args={admin,context,request};
    const handlers={owner_list:listOwner,owner_create:createOwner,owner_update:updateOwner};
    return res.status(200).json(await handlers[request.action](args));
  } catch(error) {
    if(error instanceof AddOnCatalogError || error?.name==='EmployeeAuthorizationError') return res.status(error.status || 403).json({error:'Catalog access unavailable.',code:error.code || 'forbidden'});
    return res.status(500).json({error:'Add-on catalog is temporarily unavailable.',code:'catalog_unavailable'});
  }
}; }

module.exports={ AddOnCatalogError, LIMITS, createAddOnCatalogGatewayHandler, parseRequest };
