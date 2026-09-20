const crypto = require('node:crypto');
const { sendThroughResend } = require('./sendCustomerEmail');
const { membershipContains, normalizedText } = require('./ownerOnboardingBootstrapGateway');

const ORIGINS = new Set(['https://servicesos.netlify.app','http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5174','http://localhost:5174']);
const WORKFORCE_MODES = new Set(['owner_only', 'employees']);
const MAX_EMPLOYEES = 100;
const ACTIVATION_RESEND_LIMIT = 5;
const ACTIVATION_RESEND_COOLDOWN_MS = 5 * 60 * 1000;
const LIMITS = Object.freeze({ name: 100, email: 320, phone: 40 });

class EmployeeTeamError extends Error {
  constructor(message, code = 'invalid_request', status = 400) { super(message); this.code = code; this.status = status; }
}
const fail = (message, code, status) => { throw new EmployeeTeamError(message, code, status); };
const exists = snap => typeof snap?.exists === 'function' ? snap.exists() : snap?.exists === true;
const data = snap => exists(snap) ? snap.data() || {} : null;
const exact = (body, keys) => Boolean(body && typeof body === 'object' && !Array.isArray(body) &&
  Object.keys(body).sort().join('|') === keys.slice().sort().join('|'));
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= LIMITS.email;

function parseRequest(body) {
  const action = body?.action;
  if (action === 'owner_list' && exact(body, ['action'])) return { action };
  if (action === 'owner_set_workforce_mode' && exact(body, ['action','workforceMode']) && WORKFORCE_MODES.has(body.workforceMode)) {
    return { action, workforceMode: body.workforceMode };
  }
  if (action === 'owner_provision' && exact(body, ['action','name','email','phone'])) {
    const name = normalizedText(body.name);
    const email = (normalizedText(body.email) || '').toLowerCase();
    const phone = normalizedText(body.phone) || '';
    if (!name || name.length > LIMITS.name || !validEmail(email) || phone.length > LIMITS.phone) fail('Check the employee details.', 'validation_failed', 422);
    return { action, name, email, phone };
  }
  if (action === 'owner_resend_activation' && exact(body, ['action','email'])) {
    const email = (normalizedText(body.email) || '').toLowerCase();
    if (!validEmail(email)) fail('Invalid employee request.');
    return { action, email };
  }
  fail('Invalid employee request.');
}

async function ownerContext(admin, uid) {
  uid = normalizedText(uid);
  if (!uid) fail('Authentication required.', 'unauthenticated', 401);
  const db = admin.firestore();
  const profileSnap = await db.collection('users').doc(uid).get();
  const profile = data(profileSnap);
  const tenantId = normalizedText(profile?.tenantId);
  if (!profile || profile.role !== 'admin' || profile.status !== 'active' || !tenantId || tenantId === 'DEFAULT') fail('Access unavailable.', 'forbidden', 403);
  const tenantRef = db.collection('tenants').doc(tenantId);
  const tenantSnap = await tenantRef.get();
  const tenant = data(tenantSnap);
  if (!tenant || !membershipContains(tenant.adminUsers, uid)) fail('Access unavailable.', 'forbidden', 403);
  return { uid, tenantId, tenant, tenantRef };
}

function addMembership(membership, uid) {
  if (Array.isArray(membership)) return membership.includes(uid) ? membership : [...membership, uid];
  if (membership && typeof membership === 'object') return { ...membership, [uid]: true };
  return [uid];
}

function projectEmployee(uid, value) {
  return { uid, name: normalizedText(value.name) || '', email: (normalizedText(value.email) || '').toLowerCase(), phone: normalizedText(value.phone) || '', status: value.status === 'active' ? 'active' : 'inactive', activationStatus: normalizedText(value.activationStatus) || 'pending' };
}

async function assertCanonicalCollisionSafe({ admin, context, authUser, request }) {
  const db = admin.firestore();
  const userSnap = await db.collection('users').doc(authUser.uid).get();
  const employeeSnap = await context.tenantRef.collection('employees').doc(authUser.uid).get();
  const profile = data(userSnap);
  const employee = data(employeeSnap);
  if (!profile && !employee) fail('This account cannot be provisioned automatically.', 'canonical_account_conflict', 409);
  if (!profile || !employee || profile.role !== 'employee' || profile.status !== 'active' || profile.tenantId !== context.tenantId ||
      !membershipContains(context.tenant.users, authUser.uid) || (normalizedText(profile.email) || '').toLowerCase() !== request.email ||
      (normalizedText(employee.email) || '').toLowerCase() !== request.email) {
    fail('This account cannot be provisioned automatically.', 'canonical_account_conflict', 409);
  }
  return projectEmployee(authUser.uid, employee);
}

async function createCanonicalEmployee({ admin, context, authUser, request }) {
  const db = admin.firestore();
  const userRef = db.collection('users').doc(authUser.uid);
  const employeeRef = context.tenantRef.collection('employees').doc(authUser.uid);
  const now = new Date().toISOString();
  await db.runTransaction(async transaction => {
    const [tenantSnap, userSnap, employeeSnap] = await Promise.all([transaction.get(context.tenantRef), transaction.get(userRef), transaction.get(employeeRef)]);
    const tenant = data(tenantSnap);
    if (!tenant || data(userSnap) || data(employeeSnap)) fail('This account cannot be provisioned automatically.', 'canonical_account_conflict', 409);
    transaction.create(userRef, { email: request.email, displayName: request.name, role: 'employee', status: 'active', tenantId: context.tenantId, createdAt: now, createdByUid: context.uid, updatedAt: now, updatedByUid: context.uid });
    transaction.create(employeeRef, { schemaVersion: 1, authUid: authUser.uid, name: request.name, email: request.email, phone: request.phone, status: 'active', activationStatus: 'pending', activationEmailDay: null, activationEmailCount: 0, activationEmailLastAttemptAt: null, activationEmailLastSentAt: null, createdAt: now, createdByUid: context.uid, updatedAt: now, updatedByUid: context.uid });
    transaction.update(context.tenantRef, { users: addMembership(tenant.users, authUser.uid), workforceMode: 'employees', updatedAt: now, updatedByUid: context.uid });
  });
  return projectEmployee(authUser.uid, { name:request.name,email:request.email,phone:request.phone,status:'active',activationStatus:'pending' });
}

async function reserveActivationAttempt({ admin, context, employee, now }) {
  const ref = context.tenantRef.collection('employees').doc(employee.uid);
  const day = now.toISOString().slice(0,10);
  return admin.firestore().runTransaction(async transaction => {
    const snap = await transaction.get(ref); const current = data(snap);
    if (!current || (normalizedText(current.email) || '').toLowerCase() !== employee.email) fail('Employee unavailable.', 'employee_unavailable', 404);
    const last = Date.parse(current.activationEmailLastAttemptAt || '');
    if (Number.isFinite(last) && now.getTime() - last < ACTIVATION_RESEND_COOLDOWN_MS) fail('Activation email was sent recently.', 'activation_rate_limited', 429);
    const count = current.activationEmailDay === day ? Number(current.activationEmailCount || 0) : 0;
    if (count >= ACTIVATION_RESEND_LIMIT) fail('Activation email limit reached.', 'activation_rate_limited', 429);
    const attemptId = crypto.randomUUID();
    transaction.update(ref, { activationStatus:'sending', activationEmailDay:day, activationEmailCount:count+1, activationEmailLastAttemptAt:now.toISOString(), activationEmailAttemptId:attemptId, updatedAt:now.toISOString(), updatedByUid:context.uid });
    return { attemptId, ref };
  });
}

async function sendActivation({ admin, context, employee, sendActivationEmail, now = new Date() }) {
  const reservation = await reserveActivationAttempt({ admin, context, employee, now });
  try {
    const actionLink = await admin.auth().generatePasswordResetLink(employee.email);
    await sendActivationEmail({ email:employee.email, name:employee.name, actionLink, operationId:reservation.attemptId });
    await reservation.ref.update({ activationStatus:'email_sent', activationEmailLastSentAt:new Date().toISOString(), updatedAt:new Date().toISOString(), updatedByUid:context.uid });
    return { ...employee, activationStatus:'email_sent' };
  } catch (error) {
    await reservation.ref.update({ activationStatus:'delivery_failed', updatedAt:new Date().toISOString(), updatedByUid:context.uid }).catch(()=>{});
    fail('Employee activation email could not be sent.', 'activation_delivery_failed', 503);
  }
}

function createResendActivationSender({ apiKey, fetchImpl = global.fetch, providerEnabled = false, senderEmail='notifications@servicesos.com', senderName='ServicesOS' }) {
  return async ({ email, name, actionLink, operationId }) => {
    const enabled = typeof providerEnabled === 'function' ? providerEnabled() === true : providerEnabled === true;
    const key = normalizedText(typeof apiKey === 'function' ? apiKey() : apiKey);
    if (!enabled || !key || typeof fetchImpl !== 'function') throw new Error('activation provider disabled');
    const payload = { from:`${senderName} <${senderEmail}>`, to:[email], subject:'Set up your ServicesOS employee account', text:`Hello ${name},\n\nSet up your ServicesOS employee password using this one-time link:\n${actionLink}\n\nIf you were not expecting this invitation, ignore this email.` };
    const { response, body } = await sendThroughResend({ apiKey:key, fetchImpl, operationId, payload });
    if (!response.ok || typeof body?.id !== 'string' || !body.id.trim()) throw new Error('activation delivery failed');
  };
}

async function provision({ admin, context, request, sendActivationEmail }) {
  const duplicate = await context.tenantRef.collection('employees').where('email', '==', request.email).limit(2).get();
  if (duplicate.docs.length > 0) {
    const authUser = await admin.auth().getUserByEmail(request.email).catch(()=>null);
    if (!authUser || duplicate.docs.length !== 1 || duplicate.docs[0].id !== authUser.uid) fail('This account cannot be provisioned automatically.', 'canonical_account_conflict', 409);
  }
  const existingEmployees = await context.tenantRef.collection('employees').limit(MAX_EMPLOYEES + 1).get();
  if (duplicate.docs.length === 0 && existingEmployees.docs.length >= MAX_EMPLOYEES) fail('Employee limit reached.', 'employee_limit', 409);
  let authUser; let created = false;
  try { authUser = await admin.auth().getUserByEmail(request.email); }
  catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
    try { authUser = await admin.auth().createUser({ email:request.email, displayName:request.name, disabled:false }); created = true; }
    catch (createError) {
      if (createError?.code !== 'auth/email-already-exists') throw createError;
      authUser = await admin.auth().getUserByEmail(request.email);
    }
  }
  let employee;
  try { employee = created ? await createCanonicalEmployee({ admin,context,authUser,request }) : await assertCanonicalCollisionSafe({ admin,context,authUser,request }); }
  catch (error) { if (created) await admin.auth().deleteUser(authUser.uid).catch(()=>{}); throw error; }
  if (!created) return { success:true, employee, reused:true };
  const delivered = await sendActivation({ admin,context,employee,sendActivationEmail });
  return { success:true, employee:delivered, reused:false };
}

async function list({ admin, context }) {
  const snap = await context.tenantRef.collection('employees').limit(MAX_EMPLOYEES).get();
  const candidates = await Promise.all(snap.docs.map(async employeeDoc => {
    const employee = employeeDoc.data() || {};
    const profileSnap = await admin.firestore().collection('users').doc(employeeDoc.id).get();
    const profile = data(profileSnap);
    if (!profile || profile.role !== 'employee' || profile.status !== 'active' || profile.tenantId !== context.tenantId ||
        !membershipContains(context.tenant.users, employeeDoc.id) || employee.authUid !== employeeDoc.id ||
        (normalizedText(profile.email) || '').toLowerCase() !== (normalizedText(employee.email) || '').toLowerCase()) return null;
    return projectEmployee(employeeDoc.id, employee);
  }));
  return { success:true, workforceMode:WORKFORCE_MODES.has(context.tenant.workforceMode)?context.tenant.workforceMode:null, employees:candidates.filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name)) };
}

function createEmployeeTeamGatewayHandler({ admin, sendActivationEmail }) { return async (req,res) => {
  const origin=req.headers?.origin;if(ORIGINS.has(origin)){res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin');}res.set('Access-Control-Allow-Methods','POST, OPTIONS');res.set('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS')return res.status(204).send('');if(req.method!=='POST')return res.status(405).json({error:'Method not allowed',code:'method_not_allowed'});
  const header=req.headers?.authorization||req.headers?.Authorization||'';const token=header.startsWith('Bearer ')?header.slice(7).trim():'';if(!token)return res.status(401).json({error:'Authentication required',code:'unauthenticated'});
  let identity;try{identity=await admin.auth().verifyIdToken(token);}catch{return res.status(401).json({error:'Authentication required',code:'unauthenticated'});}
  try{const request=parseRequest(req.body);const context=await ownerContext(admin,identity.uid);
    if(request.action==='owner_list')return res.status(200).json(await list({admin,context}));
    if(request.action==='owner_set_workforce_mode'){const now=new Date().toISOString();await context.tenantRef.update({workforceMode:request.workforceMode,updatedAt:now,updatedByUid:context.uid});return res.status(200).json({success:true,workforceMode:request.workforceMode});}
    if(request.action==='owner_provision')return res.status(200).json(await provision({admin,context,request,sendActivationEmail}));
    const authUser=await admin.auth().getUserByEmail(request.email).catch(()=>null);if(!authUser)fail('Employee unavailable.','employee_unavailable',404);const employee=await assertCanonicalCollisionSafe({admin,context,authUser,request:{email:request.email}});return res.status(200).json({success:true,employee:await sendActivation({admin,context,employee,sendActivationEmail}),reused:true});
  }catch(error){if(error instanceof EmployeeTeamError)return res.status(error.status).json({error:error.message,code:error.code});return res.status(500).json({error:'Employee team service is temporarily unavailable.',code:'team_unavailable'});}
};}

module.exports={ ACTIVATION_RESEND_LIMIT, EmployeeTeamError, LIMITS, MAX_EMPLOYEES, WORKFORCE_MODES, addMembership, createEmployeeTeamGatewayHandler, createResendActivationSender, parseRequest, projectEmployee };
