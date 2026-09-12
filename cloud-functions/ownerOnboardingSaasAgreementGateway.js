const {
  ACCEPTANCE_LANGUAGE, AGREEMENT_ID, AGREEMENT_TYPE, AGREEMENT_VERSION_DATE,
  AGREEMENT_VERSION_DATE_LABEL, CONTRACT_ID, termsHash, termsMarkdown,
} = require('./ownerSaasAgreement');
const { membershipContains, normalizedText } = require('./ownerOnboardingBootstrapGateway');
const { firestoreServerTimestamp } = require('./firebaseAdminCompat');

const ALLOWED_ORIGINS = new Set(['https://servicesos.netlify.app', 'http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:5174', 'http://localhost:5174']);
class AgreementError extends Error {
  constructor(message, { code = 'agreement_conflict', status = 409 } = {}) {
    super(message); this.name = 'AgreementError'; this.code = code; this.status = status;
  }
}
const conflict = () => { throw new AgreementError('SaaS agreement is unavailable.'); };

function presentation({ tenantId, accepted = false }) {
  return { success: true, agreement: {
    agreementType: AGREEMENT_TYPE, agreementId: AGREEMENT_ID,
    agreementVersionDate: AGREEMENT_VERSION_DATE,
    agreementVersionDateLabel: AGREEMENT_VERSION_DATE_LABEL,
    termsMarkdown, termsHash, termsFormat: 'markdown', acceptanceLanguage: ACCEPTANCE_LANGUAGE,
    accepted, onboardingState: accepted ? 'billing_required' : 'agreement_required', tenantId,
  } };
}

function acceptanceMatches(record, { tenantId, uid, email }) {
  return record?.agreementType === AGREEMENT_TYPE && record.agreementVersion === AGREEMENT_ID &&
    record.agreementVersionDate === AGREEMENT_VERSION_DATE && record.tenantId === tenantId &&
    record.acceptedByUid === uid && record.acceptedByEmail === email &&
    record.affirmativeAcceptance === true && record.status === 'accepted' &&
    record.termsSnapshot === termsMarkdown && record.termsHash === termsHash && record.termsFormat === 'markdown';
}

function validateAcceptance(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
    Object.keys(body).some(key => !['signerName', 'affirmativeAcceptance', 'agreementId', 'termsHash'].includes(key))) {
    throw new AgreementError('Invalid agreement acceptance request.', { code: 'invalid_request', status: 400 });
  }
  const signerName = normalizedText(body.signerName);
  if (!signerName || signerName.length > 160 || body.affirmativeAcceptance !== true ||
    body.agreementId !== AGREEMENT_ID || body.termsHash !== termsHash) {
    throw new AgreementError('Agreement acceptance is incomplete or stale.', { code: 'validation_failed', status: 422 });
  }
  return signerName;
}

async function processAgreement({ admin, identity, method, body }) {
  const uid = normalizedText(identity?.uid);
  if (!uid || uid === 'DEFAULT') conflict();
  const signerName = method === 'POST' ? validateAcceptance(body) : null;
  const db = admin.firestore();
  const userRef = db.collection('users').doc(uid);
  return db.runTransaction(async transaction => {
    const userSnapshot = await transaction.get(userRef);
    if (!userSnapshot.exists) conflict();
    const profile = userSnapshot.data() || {};
    const tenantId = normalizedText(profile.tenantId);
    const email = normalizedText(profile.email) || normalizedText(identity.email);
    if (profile.role !== 'admin' || profile.status !== 'active' || !tenantId || tenantId === 'DEFAULT' || !email) conflict();
    const tenantRef = db.collection('tenants').doc(tenantId);
    const tenantSnapshot = await transaction.get(tenantRef);
    if (!tenantSnapshot.exists) conflict();
    const tenant = tenantSnapshot.data() || {};
    if (tenant.onboardingSchemaVersion !== 1 || tenant.status !== 'onboarding' ||
      tenant.onboardingOwnerUid !== uid || !membershipContains(tenant.adminUsers, uid)) conflict();
    const contractRef = tenantRef.collection('contracts').doc(CONTRACT_ID);
    const contractSnapshot = await transaction.get(contractRef);
    const existing = contractSnapshot.exists ? contractSnapshot.data() : null;
    if (tenant.onboardingState === 'billing_required') {
      if (!existing || !acceptanceMatches(existing, { tenantId, uid, email })) conflict();
      return presentation({ tenantId, accepted: true });
    }
    if (tenant.onboardingState !== 'agreement_required' || existing) conflict();
    if (method === 'GET') return presentation({ tenantId });
    const timestamp = firestoreServerTimestamp(admin);
    transaction.create(contractRef, {
      agreementType: AGREEMENT_TYPE, agreementVersion: AGREEMENT_ID,
      agreementVersionDate: AGREEMENT_VERSION_DATE, tenantId,
      acceptedByUid: uid, acceptedByEmail: email, signerName,
      acceptedAt: timestamp, affirmativeAcceptance: true, status: 'accepted',
      termsSnapshot: termsMarkdown, termsHash, termsFormat: 'markdown', createdAt: timestamp,
    });
    transaction.update(tenantRef, { onboardingState: 'billing_required', updatedAt: timestamp });
    return presentation({ tenantId, accepted: true });
  });
}

function applyCors(req, res) {
  const origin = req.headers?.origin;
  if (ALLOWED_ORIGINS.has(origin)) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); }
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function createOwnerOnboardingSaasAgreementGatewayHandler({ admin }) {
  return async (req, res) => {
    applyCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' });
    const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' });
    let identity;
    try { identity = await admin.auth().verifyIdToken(token); }
    catch { return res.status(401).json({ error: 'Invalid authentication token', code: 'unauthenticated' }); }
    try { return res.status(200).json(await processAgreement({ admin, identity, method: req.method, body: req.body })); }
    catch (error) {
      if (error instanceof AgreementError) return res.status(error.status).json({ error: error.message, code: error.code });
      return res.status(500).json({ error: 'SaaS agreement is temporarily unavailable.', code: 'agreement_failed' });
    }
  };
}

module.exports = { AgreementError, acceptanceMatches, createOwnerOnboardingSaasAgreementGatewayHandler, presentation, processAgreement, validateAcceptance };
