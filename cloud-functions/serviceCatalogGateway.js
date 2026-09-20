const { membershipContains, normalizedText } = require('./ownerOnboardingBootstrapGateway');

const ORIGINS = new Set(['https://servicesos.netlify.app','http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5174','http://localhost:5174']);
const MAX_ITEMS = 50;
const SERVICE_TYPES = new Set(['standard', 'deep', 'moveout', 'construction']);
const LIMITS = { name: 100, priceCents: 10000000, durationMinutes: 1440 };

class ServiceCatalogError extends Error {
  constructor(message, code = 'invalid_request', status = 400) { super(message); this.code = code; this.status = status; }
}
const fail = (message, code, status) => { throw new ServiceCatalogError(message, code, status); };
const exactShape = (body, fields) => body && typeof body === 'object' && !Array.isArray(body) &&
  Object.keys(body).sort().join('|') === fields.slice().sort().join('|');

function serviceValues(body) {
  const name = normalizedText(body.name);
  const serviceType = normalizedText(body.serviceType);
  if (!name || name.length > LIMITS.name || !SERVICE_TYPES.has(serviceType) ||
      typeof body.active !== 'boolean' || !Number.isInteger(body.priceCents) ||
      body.priceCents < 1 || body.priceCents > LIMITS.priceCents ||
      !Number.isInteger(body.durationMinutes) || body.durationMinutes < 1 ||
      body.durationMinutes > LIMITS.durationMinutes) fail('Check the service details.', 'validation_failed', 422);
  return { name, serviceType, active: body.active, priceCents: body.priceCents, durationMinutes: body.durationMinutes };
}

function parseRequest(body) {
  const action = body?.action;
  const values = ['action','name','serviceType','active','priceCents','durationMinutes'];
  const shapes = { owner_list:['action'], owner_create:values, owner_update:[...values,'serviceId'] };
  if (!shapes[action] || !exactShape(body, shapes[action])) fail('Invalid service catalog request.');
  const request = { action };
  if (action !== 'owner_list') Object.assign(request, serviceValues(body));
  if (action === 'owner_update') {
    const serviceId = normalizedText(body.serviceId);
    if (!serviceId || serviceId.length > 128 || serviceId.includes('/')) fail('Invalid service catalog request.');
    request.serviceId = serviceId;
  }
  return request;
}

async function ownerContext(admin, uid) {
  uid = normalizedText(uid);
  if (!uid) fail('Authentication required.', 'unauthenticated', 401);
  const db = admin.firestore();
  const profileSnap = await db.collection('users').doc(uid).get();
  if (!profileSnap.exists) fail('Access unavailable.', 'forbidden', 403);
  const profile = profileSnap.data() || {};
  const tenantId = normalizedText(profile.tenantId);
  if (profile.role !== 'admin' || profile.status !== 'active' || !tenantId || tenantId === 'DEFAULT') fail('Access unavailable.', 'forbidden', 403);
  const tenantSnap = await db.collection('tenants').doc(tenantId).get();
  const tenant = tenantSnap.exists ? tenantSnap.data() || {} : {};
  if (!tenantSnap.exists || !membershipContains(tenant.adminUsers, uid)) fail('Access unavailable.', 'forbidden', 403);
  return { uid, tenantId };
}

const project = (id, value) => ({ id, name:value.name, serviceType:value.serviceType, active:value.active === true, priceCents:value.priceCents, durationMinutes:value.durationMinutes });
const catalog = (admin, tenantId) => admin.firestore().collection('tenants').doc(tenantId).collection('serviceCatalog');

async function listOwner({ admin, context }) {
  const snap = await catalog(admin, context.tenantId).limit(MAX_ITEMS).get();
  return { success:true, services:snap.docs.map(doc=>project(doc.id,doc.data()||{})).sort((a,b)=>a.name.localeCompare(b.name)) };
}

async function createOwner({ admin, context, request }) {
  const existing = await catalog(admin, context.tenantId).limit(MAX_ITEMS).get();
  if (existing.docs.length >= MAX_ITEMS) fail('The service catalog limit has been reached.', 'catalog_limit', 409);
  const ref = catalog(admin, context.tenantId).doc();
  const now = new Date().toISOString();
  const record = { ...serviceValues(request), createdAt:now, updatedAt:now, createdByUid:context.uid, updatedByUid:context.uid };
  await ref.create(record);
  return { success:true, service:project(ref.id,record) };
}

async function updateOwner({ admin, context, request }) {
  const ref = catalog(admin, context.tenantId).doc(request.serviceId);
  const snap = await ref.get();
  if (!snap.exists) fail('Service unavailable.', 'service_unavailable', 404);
  const patch = { ...serviceValues(request), updatedAt:new Date().toISOString(), updatedByUid:context.uid };
  await ref.update(patch);
  return { success:true, service:project(ref.id,{...snap.data(),...patch}) };
}

function createServiceCatalogGatewayHandler({ admin }) { return async (req,res) => {
  const origin=req.headers?.origin; if(ORIGINS.has(origin)){res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin');}
  res.set('Access-Control-Allow-Methods','POST, OPTIONS'); res.set('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS') return res.status(204).send('');
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed',code:'method_not_allowed'});
  const header=req.headers?.authorization||req.headers?.Authorization||''; const token=header.startsWith('Bearer ')?header.slice(7).trim():'';
  if(!token)return res.status(401).json({error:'Authentication required',code:'unauthenticated'});
  let identity; try{identity=await admin.auth().verifyIdToken(token);}catch{return res.status(401).json({error:'Authentication required',code:'unauthenticated'});}
  try {
    const request=parseRequest(req.body); const context=await ownerContext(admin,identity.uid); const args={admin,context,request};
    const handlers={owner_list:listOwner,owner_create:createOwner,owner_update:updateOwner};
    return res.status(200).json(await handlers[request.action](args));
  } catch(error) {
    if(error instanceof ServiceCatalogError) return res.status(error.status).json({error:'Service catalog access unavailable.',code:error.code});
    return res.status(500).json({error:'Service catalog is temporarily unavailable.',code:'catalog_unavailable'});
  }
}; }

module.exports={ LIMITS, MAX_ITEMS, SERVICE_TYPES, ServiceCatalogError, createServiceCatalogGatewayHandler, parseRequest };
