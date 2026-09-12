const assert = require('node:assert/strict');
const { before, test } = require('node:test');

let ownerOnboardingBootstrapGateway;

before(() => {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  process.env.GCLOUD_PROJECT = 'demo-servicesos-v1-smoke-local';
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-servicesos-v1-smoke-local' });
  ({ ownerOnboardingBootstrapGateway } = require('../index'));
});

test('owner onboarding bootstrap gateway stays within V1 runtime bounds', () => {
  assert.equal(ownerOnboardingBootstrapGateway.__endpoint.minInstances, 0);
  assert.equal(ownerOnboardingBootstrapGateway.__endpoint.maxInstances, 3);
  assert.deepEqual(ownerOnboardingBootstrapGateway.__endpoint.secretEnvironmentVariables || [], []);
});
