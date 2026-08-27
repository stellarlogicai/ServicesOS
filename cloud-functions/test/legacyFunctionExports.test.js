const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const functionsEntry = fs.readFileSync(path.join(repoRoot, 'cloud-functions', 'index.js'), 'utf8');

const retiredExports = [
  'analyzeImage',
  'trainModel',
  'createPaymentIntent',
  'createCheckoutSession',
  'confirmPayment',
  'createStripeCustomer',
  'createSubscription',
  'updateSubscription',
  'cancelSubscription',
  'getSubscription',
  'getEmployeeJobs',
  'getEmployeeJob',
  'employeeCheckIn',
  'employeeCheckOut',
  'uploadJobPhotos',
  'uploadSignature',
  'recordEmployeePayment',
];

const canonicalExports = [
  'generateGrowthAIContent',
  'routeGrowthAIConversation',
  'createBookingCheckoutSession',
  'stripeWebhook',
  'subscriptionWebhook',
  'createConnectedAccount',
  'generateOnboardingLink',
  'getConnectedAccountStatus',
  'sendCustomerEmail',
];

function listActiveWebSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') return [];
      return listActiveWebSourceFiles(entryPath);
    }
    if (!/\.(?:js|jsx)$/.test(entry.name)) return [];
    if (entryPath.endsWith(path.join('services', 'stripeService.js'))) return [];
    return [entryPath];
  });
}

test('retired legacy handlers are absent from the deployable entrypoint', () => {
  for (const name of retiredExports) {
    assert.doesNotMatch(functionsEntry, new RegExp(`^exports\\.${name}\\s*=`, 'm'), name);
  }
});

test('canonical booking, Connect, GrowthAI, email, and webhook handlers remain exported', () => {
  for (const name of canonicalExports) {
    assert.match(functionsEntry, new RegExp(`^exports\\.${name}\\s*=`, 'm'), name);
  }
});

test('active web source has no caller or URL reference to retired Functions', () => {
  const activeWebSource = listActiveWebSourceFiles(path.join(repoRoot, 'servicesos-web', 'src'))
    .map((filePath) => fs.readFileSync(filePath, 'utf8'))
    .join('\n');

  for (const name of retiredExports) {
    assert.doesNotMatch(activeWebSource, new RegExp(`\\b${name}\\b`), name);
  }
});

test('the active booking payment caller uses the canonical checkout Function', () => {
  const bookingsList = fs.readFileSync(
    path.join(repoRoot, 'servicesos-web', 'src', 'components', 'BookingsList.jsx'),
    'utf8',
  );

  assert.match(bookingsList, /createBookingCheckoutSession/);
});
