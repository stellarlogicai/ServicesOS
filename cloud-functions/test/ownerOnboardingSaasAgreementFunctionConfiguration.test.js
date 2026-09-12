const assert = require('node:assert/strict');
const { before, test } = require('node:test');
let gateway;
before(() => {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  process.env.GCLOUD_PROJECT = 'demo-servicesos-v1-smoke-local';
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-servicesos-v1-smoke-local' });
  ({ ownerOnboardingSaasAgreementGateway: gateway } = require('../index'));
});
test('SaaS agreement gateway is bounded and receives no secrets', () => {
  assert.equal(gateway.__endpoint.minInstances, 0); assert.equal(gateway.__endpoint.maxInstances, 3);
  assert.deepEqual(gateway.__endpoint.secretEnvironmentVariables || [], []);
});
