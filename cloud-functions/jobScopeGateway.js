const { membershipContains, normalizedText } = require('./ownerOnboardingBootstrapGateway');
const { canonicalJobScopeSnapshot, scopeHash, scopeSummary } = require('./jobScopeControl');

const ORIGINS = new Set(['https://servicesos.netlify.app','http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5174','http://localhost:5174']);
class JobScopeError extends Error { constructor(message, code = 'invalid_request', status = 400) { super(message); this.code = code; this.status = status; } }
const fail = (message, code, status) => { throw new JobScopeError(message, code, status); };

function parseRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Invalid request');
  const action = body.action;
  const shapes = { owner_get: ['action','bookingId'], owner_request: ['action','bookingId'], customer_list: ['action'], customer_approve: ['action','bookingId','version','affirmativeAcceptance'] };
  if (!shapes[action] || Object.keys(body).sort().join('|') !== shapes[action].sort().join('|')) fail('Invalid request');
  if (action !== 'customer_list') {
    if (typeof body.bookingId !== 'string' || !body.bookingId.trim() || body.bookingId.length > 128 || body.bookingId.includes('/')) fail('Invalid request');
  }
  if (action === 'customer_approve' && (!Number.isInteger(body.version) || body.version < 1 || body.affirmativeAcceptance !== true)) fail('Approval is incomplete.', 'approval_incomplete', 422);
  return { ...body, bookingId: body.bookingId?.trim() };
}

async function identityContext(admin, identity) {
  const uid = normalizedText(identity?.uid);
  if (!uid) fail('Authentication required', 'unauthenticated', 401);
  const profileSnap = await admin.firestore().collection('users').doc(uid).get();
  if (!profileSnap.exists) fail('Access unavailable', 'forbidden', 403);
  const profile = profileSnap.data() || {};
  const tenantId = normalizedText(profile.tenantId);
  if (!tenantId || tenantId === 'DEFAULT' || profile.status !== 'active') fail('Access unavailable', 'forbidden', 403);
  const tenantSnap = await admin.firestore().collection('tenants').doc(tenantId).get();
  if (!tenantSnap.exists) fail('Access unavailable', 'forbidden', 403);
  return { uid, profile, tenantId, tenant: tenantSnap.data() || {} };
}

function requireOwner(context) {
  if (context.profile.role !== 'admin' || !membershipContains(context.tenant.adminUsers, context.uid)) fail('Access unavailable', 'forbidden', 403);
}

async function customerRecord(admin, context) {
  if (context.profile.role !== 'customer') fail('Access unavailable', 'forbidden', 403);
  const snap = await admin.firestore().collection('tenants').doc(context.tenantId).collection('customers').where('authUid','==',context.uid).limit(2).get();
  if (snap.docs.length !== 1) fail('Customer account unavailable', 'forbidden', 403);
  const data = snap.docs[0].data() || {};
  if (data.isArchived === true || ['archived','disabled','inactive'].includes(data.status)) fail('Customer account unavailable', 'forbidden', 403);
  return { id: snap.docs[0].id };
}

function versionProjection(record) {
  return { version: record.version, state: record.state, snapshot: record.snapshot, scopeHash: record.scopeHash, approvedAt: record.approvedAt || null };
}

async function ownerGet({ admin, context, bookingId }) {
  requireOwner(context);
  const ref = admin.firestore().collection('tenants').doc(context.tenantId).collection('bookings').doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) fail('Booking unavailable', 'booking_unavailable', 404);
  const booking = snap.data() || {}; const snapshot = canonicalJobScopeSnapshot(bookingId, booking); const hash = scopeHash(snapshot);
  return { success: true, scope: { ...scopeSummary(booking.jobScopeControl, hash), snapshot, scopeHash: hash } };
}

async function ownerRequest({ admin, context, bookingId }) {
  requireOwner(context); const db = admin.firestore(); const ref = db.collection('tenants').doc(context.tenantId).collection('bookings').doc(bookingId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref); if (!snap.exists) fail('Booking unavailable','booking_unavailable',404);
    const booking = snap.data() || {}; const snapshot = canonicalJobScopeSnapshot(bookingId, booking); const hash = scopeHash(snapshot); const control = booking.jobScopeControl || {};
    if (control.state === 'awaiting_approval' && control.latestScopeHash === hash) {
      const existing = await tx.get(ref.collection('jobScopeVersions').doc(`v${control.latestVersion}`));
      return { success: true, scope: versionProjection(existing.data()) };
    }
    const version = Number(control.latestVersion || 0) + 1; const record = { version, state: 'awaiting_approval', snapshot, scopeHash: hash, requestedAt: new Date().toISOString(), requestedByUid: context.uid };
    tx.create(ref.collection('jobScopeVersions').doc(`v${version}`), record);
    tx.update(ref, { jobScopeControl: { ...control, state: 'awaiting_approval', latestVersion: version, latestScopeHash: hash, approvedVersion: control.approvedVersion || null, approvedScopeHash: control.approvedScopeHash || null, approvedAt: control.approvedAt || null } });
    return { success: true, scope: versionProjection(record) };
  });
}

async function customerList({ admin, context }) {
  const customer = await customerRecord(admin, context); const bookings = await admin.firestore().collection('tenants').doc(context.tenantId).collection('bookings').where('customerId','==',customer.id).limit(50).get();
  const scopes = [];
  for (const bookingSnap of bookings.docs) {
    const control = bookingSnap.data()?.jobScopeControl;
    if (!control?.latestVersion) continue;
    const versionSnap = await bookingSnap.ref.collection('jobScopeVersions').doc(`v${control.latestVersion}`).get();
    if (versionSnap.exists && ['awaiting_approval','approved'].includes(versionSnap.data().state)) scopes.push(versionProjection(versionSnap.data()));
  }
  return { success: true, scopes };
}

async function approveScopeRecord({ admin, context, bookingId, version, customer }) {
  const db = admin.firestore(); const ref = db.collection('tenants').doc(context.tenantId).collection('bookings').doc(bookingId); const versionRef = ref.collection('jobScopeVersions').doc(`v${version}`);
  return db.runTransaction(async tx => {
    const [bookingSnap, versionSnap] = await Promise.all([tx.get(ref), tx.get(versionRef)]);
    if (!bookingSnap.exists || bookingSnap.data()?.customerId !== customer.id || !versionSnap.exists) fail('Agreement unavailable','agreement_unavailable',404);
    const booking = bookingSnap.data() || {}; const record = versionSnap.data() || {};
    if (record.state === 'approved') return { success: true, scope: versionProjection(record) };
    if (record.state !== 'awaiting_approval' || booking.jobScopeControl?.latestVersion !== version || booking.jobScopeControl?.latestScopeHash !== record.scopeHash || scopeHash(canonicalJobScopeSnapshot(bookingId, booking)) !== record.scopeHash) fail('Agreement changed','agreement_changed',409);
    const approvedAt = new Date().toISOString(); const approved = { ...record, state: 'approved', approvedAt, approvedByCustomerUid: context.uid, affirmativeAcceptance: true };
    tx.update(versionRef, { state:'approved', approvedAt, approvedByCustomerUid:context.uid, affirmativeAcceptance:true });
    tx.update(ref, { jobScopeControl: { ...booking.jobScopeControl, state:'approved', approvedVersion:version, approvedScopeHash:record.scopeHash, approvedAt }, approvedJobScope: { version, scopeHash:record.scopeHash, approvedAt, snapshot:record.snapshot } });
    return { success:true, scope:versionProjection(approved) };
  });
}

async function customerApprove({ admin, context, bookingId, version }) {
  const customer = await customerRecord(admin, context);
  return approveScopeRecord({ admin, context, bookingId, version, customer });
}

function createJobScopeGatewayHandler({ admin }) { return async (req,res) => {
  const origin=req.headers?.origin; if(ORIGINS.has(origin)){res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin');} res.set('Access-Control-Allow-Methods','POST, OPTIONS');res.set('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS') return res.status(204).send(''); if(req.method!=='POST') return res.status(405).json({error:'Method not allowed',code:'method_not_allowed'});
  const header=req.headers?.authorization||req.headers?.Authorization||''; const token=header.startsWith('Bearer ')?header.slice(7).trim():''; if(!token)return res.status(401).json({error:'Authentication required',code:'unauthenticated'});
  try { const identity=await admin.auth().verifyIdToken(token); const context=await identityContext(admin,identity); const request=parseRequest(req.body); const args={admin,context,...request}; const handlers={owner_get:ownerGet,owner_request:ownerRequest,customer_list:customerList,customer_approve:customerApprove}; return res.status(200).json(await handlers[request.action](args)); }
  catch(error){ if(error instanceof JobScopeError)return res.status(error.status).json({error:error.message,code:error.code}); return res.status(500).json({error:'Service agreement is temporarily unavailable.',code:'scope_service_unavailable'}); }
}; }

module.exports={ JobScopeError, approveScopeRecord, canonicalJobScopeSnapshot, createJobScopeGatewayHandler, customerApprove, customerList, ownerGet, ownerRequest, parseRequest };
