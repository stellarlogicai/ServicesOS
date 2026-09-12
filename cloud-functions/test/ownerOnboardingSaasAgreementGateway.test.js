const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { test } = require('node:test');
const agreement = require('../ownerSaasAgreement');
const { createOwnerOnboardingSaasAgreementGatewayHandler, processAgreement } = require('../ownerOnboardingSaasAgreementGateway');

function fixture({ user = {}, tenant = {}, contract, identity = {}, tokenError = false } = {}) {
  const state = {
    'users/owner-a': { role: 'admin', status: 'active', tenantId: 'tenant-a', email: 'owner@example.test', ...user },
    'tenants/tenant-a': { onboardingSchemaVersion: 1, onboardingOwnerUid: 'owner-a', onboardingState: 'agreement_required', status: 'onboarding', adminUsers: ['owner-a'], users: ['owner-a'], ...tenant },
  };
  if (contract) state[`tenants/tenant-a/contracts/${agreement.CONTRACT_ID}`] = contract;
  const writes = [];
  const ref = path => ({ path, collection: name => ref(`${path}/${name}`), doc: id => ref(`${path}/${id}`) });
  const admin = {
    auth: () => ({ verifyIdToken: async () => { if (tokenError) throw new Error('invalid'); return { uid: 'owner-a', email: 'token@example.test', ...identity }; } }),
    firestore: () => ({ collection: name => ref(name), runTransaction: async callback => callback({
      get: async documentRef => ({ exists: state[documentRef.path] !== undefined, data: () => state[documentRef.path] }),
      create: (documentRef, value) => { if (state[documentRef.path]) throw new Error('exists'); state[documentRef.path] = structuredClone(value); writes.push({ type: 'create', path: documentRef.path, value }); },
      update: (documentRef, value) => { state[documentRef.path] = { ...state[documentRef.path], ...structuredClone(value) }; writes.push({ type: 'update', path: documentRef.path, value }); },
    }) }),
  };
  admin.firestore.FieldValue = { serverTimestamp: () => 'server-time' };
  return { admin, state, writes };
}

const request = { signerName: ' Owner Name ', affirmativeAcceptance: true, agreementId: agreement.AGREEMENT_ID, termsHash: agreement.termsHash };
const acceptedRecord = (overrides = {}) => ({
  agreementType: agreement.AGREEMENT_TYPE, agreementVersion: agreement.AGREEMENT_ID,
  agreementVersionDate: agreement.AGREEMENT_VERSION_DATE, tenantId: 'tenant-a',
  acceptedByUid: 'owner-a', acceptedByEmail: 'owner@example.test', signerName: 'Owner Name',
  acceptedAt: 'original-time', affirmativeAcceptance: true, status: 'accepted',
  termsSnapshot: agreement.termsMarkdown, termsHash: agreement.termsHash, termsFormat: 'markdown', createdAt: 'original-time', ...overrides,
});

test('canonical agreement identity, bytes, acceptance language, and known hash are frozen', () => {
  assert.equal(agreement.AGREEMENT_ID, 'servicesos-saas-v1');
  assert.equal(agreement.AGREEMENT_VERSION_DATE, '2026-09-12');
  assert.equal(agreement.AGREEMENT_VERSION_DATE_LABEL, 'September 12, 2026');
  assert.equal(agreement.termsHash, agreement.EXPECTED_TERMS_HASH);
  assert.equal(crypto.createHash('sha256').update(Buffer.from(agreement.termsMarkdown, 'utf8')).digest('hex'), agreement.EXPECTED_TERMS_HASH);
  assert.notEqual(crypto.createHash('sha256').update(`${agreement.termsMarkdown}x`).digest('hex'), agreement.EXPECTED_TERMS_HASH);
  assert.ok(agreement.termsMarkdown.includes(agreement.ACCEPTANCE_LANGUAGE));
});

test('GET returns only canonical presentation from the server source', async () => {
  const source = fixture();
  const result = await processAgreement({ admin: source.admin, identity: { uid: 'owner-a' }, method: 'GET' });
  assert.equal(result.agreement.termsMarkdown, agreement.termsMarkdown);
  assert.equal(result.agreement.termsHash, agreement.termsHash);
  assert.deepEqual(Object.keys(result.agreement).sort(), ['acceptanceLanguage','accepted','agreementId','agreementType','agreementVersionDate','agreementVersionDateLabel','onboardingState','tenantId','termsFormat','termsHash','termsMarkdown'].sort());
  assert.equal(source.writes.length, 0);
});

test('POST creates one immutable record and atomically advances only to billing_required', async () => {
  const source = fixture();
  const result = await processAgreement({ admin: source.admin, identity: { uid: 'owner-a' }, method: 'POST', body: request });
  const record = source.state[`tenants/tenant-a/contracts/${agreement.CONTRACT_ID}`];
  assert.equal(record.signerName, 'Owner Name');
  assert.equal(record.acceptedByEmail, 'owner@example.test');
  assert.equal(record.termsSnapshot, agreement.termsMarkdown);
  assert.equal(record.termsHash, agreement.termsHash);
  assert.equal(record.acceptedAt, 'server-time');
  assert.equal(source.state['tenants/tenant-a'].onboardingState, 'billing_required');
  assert.equal(source.state['tenants/tenant-a'].status, 'onboarding');
  assert.equal(result.agreement.accepted, true);
  assert.deepEqual(source.writes.map(write => write.type), ['create', 'update']);
});

test('accepted retry is idempotent and never overwrites evidence', async () => {
  const original = acceptedRecord();
  const source = fixture({ tenant: { onboardingState: 'billing_required' }, contract: original });
  const result = await processAgreement({ admin: source.admin, identity: { uid: 'owner-a' }, method: 'POST', body: request });
  assert.equal(result.agreement.onboardingState, 'billing_required');
  assert.deepEqual(source.state[`tenants/tenant-a/contracts/${agreement.CONTRACT_ID}`], original);
  assert.equal(source.writes.length, 0);
});

test('false acceptance, malformed signer, altered version/hash, and injected evidence are rejected', async () => {
  for (const body of [
    { ...request, affirmativeAcceptance: false }, { ...request, signerName: '' },
    { ...request, agreementId: 'other' }, { ...request, termsHash: 'altered' },
    { ...request, tenantId: 'tenant-b' }, { ...request, acceptedByEmail: 'spoof@example.test' },
    { ...request, acceptedAt: 'client-time' }, { ...request, onboardingState: 'active' },
  ]) {
    const source = fixture();
    await assert.rejects(processAgreement({ admin: source.admin, identity: { uid: 'owner-a' }, method: 'POST', body }));
    assert.equal(source.writes.length, 0);
  }
});

test('employee, cross-owner, missing membership, legacy, active, and conflicting evidence fail closed', async () => {
  const sources = [
    fixture({ user: { role: 'employee' } }), fixture({ tenant: { onboardingOwnerUid: 'owner-b' } }),
    fixture({ tenant: { adminUsers: ['owner-b'] } }), fixture({ tenant: { onboardingSchemaVersion: undefined } }),
    fixture({ tenant: { onboardingState: 'active', status: 'active' } }),
    fixture({ tenant: { onboardingState: 'billing_required' }, contract: acceptedRecord({ termsHash: 'conflict' }) }),
  ];
  for (const source of sources) {
    await assert.rejects(processAgreement({ admin: source.admin, identity: { uid: 'owner-a' }, method: 'POST', body: request }), error => error.code === 'agreement_conflict');
    assert.equal(source.writes.length, 0);
  }
});

test('handler requires auth and controlled methods', async () => {
  const call = async ({ source = fixture(), method = 'GET', headers = {} } = {}) => {
    const res = { statusCode: null, body: null, set() { return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
    await createOwnerOnboardingSaasAgreementGatewayHandler({ admin: source.admin })({ method, headers, body: request }, res);
    return res;
  };
  assert.equal((await call({})).statusCode, 401);
  assert.equal((await call({ source: fixture({ tokenError: true }), headers: { authorization: 'Bearer invalid' } })).statusCode, 401);
  assert.equal((await call({ method: 'DELETE', headers: { authorization: 'Bearer valid' } })).statusCode, 405);
});
