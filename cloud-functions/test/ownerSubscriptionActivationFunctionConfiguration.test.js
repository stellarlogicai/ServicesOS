const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { before, test } = require('node:test');

let webhook;
before(() => {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  process.env.GCLOUD_PROJECT = 'demo-servicesos-v1-smoke-local';
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-servicesos-v1-smoke-local' });
  ({ ownerSubscriptionActivationWebhook: webhook } = require('../index'));
});

test('owner activation webhook is bounded and receives only required Stripe secrets', () => {
  assert.equal(webhook.__endpoint.minInstances, 0);
  assert.equal(webhook.__endpoint.maxInstances, 3);
  assert.deepEqual(webhook.__endpoint.secretEnvironmentVariables, [
    { key: 'STRIPE_SECRET_KEY' },
    { key: 'STRIPE_OWNER_SUBSCRIPTION_WEBHOOK_SECRET' },
  ]);
});

test('legacy subscription webhook stays retired and booking/Connect exports remain present', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  assert.doesNotMatch(source, /^exports\.subscriptionWebhook\s*=/m);
  for (const name of ['stripeWebhook', 'createConnectedAccount', 'generateOnboardingLink', 'getConnectedAccountStatus']) {
    assert.match(source, new RegExp(`^exports\\.${name}\\s*=`, 'm'));
  }
});

test('owner onboarding client has no activation write path', () => {
  const webFiles = [
    path.join(__dirname, '..', '..', 'servicesos-web', 'src', 'services', 'ownerBillingService.js'),
    path.join(__dirname, '..', '..', 'servicesos-web', 'src', 'components', 'OwnerOnboardingEntry.jsx'),
  ];
  const source = webFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /\b(?:updateDoc|setDoc)\b/);
  assert.doesNotMatch(source, /(?:status|onboardingState)\s*:\s*['"]active['"]/);
});
