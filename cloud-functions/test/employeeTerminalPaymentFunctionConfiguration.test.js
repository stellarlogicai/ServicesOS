const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

test('employee Terminal payment gateway is bounded and receives only the Stripe secret', () => {
  const match = source.match(/exports\.employeeTerminalPaymentGateway\s*=\s*functions\.runWith\(\{([\s\S]*?)\}\)\.https\.onRequest/);
  assert.ok(match);
  assert.match(match[1], /minInstances:\s*0/);
  assert.match(match[1], /maxInstances:\s*3/);
  assert.match(match[1], /secrets:\s*\[stripeSecretKey\]/);
  assert.doesNotMatch(match[1], /growthAIProviderApiKey|ownerSubscriptionWebhookSecret/);
});
