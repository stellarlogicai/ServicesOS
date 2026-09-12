const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { before, test } = require('node:test');
let gateway;
before(() => {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  process.env.GCLOUD_PROJECT = 'demo-servicesos-v1-smoke-local';
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-servicesos-v1-smoke-local' });
  ({ ownerOnboardingBillingGateway: gateway } = require('../index'));
});
test('owner billing gateway is bounded and explicitly receives only the Stripe secret', () => {
  assert.equal(gateway.__endpoint.minInstances, 0);
  assert.equal(gateway.__endpoint.maxInstances, 3);
  assert.deepEqual(gateway.__endpoint.secretEnvironmentVariables, [{ key: 'STRIPE_SECRET_KEY' }]);
});
test('unsafe legacy subscription webhook is no longer exported', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  assert.doesNotMatch(indexSource, /exports\.subscriptionWebhook\s*=/);
});
