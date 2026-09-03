const assert = require('node:assert/strict');
const { before, describe, test } = require('node:test');

const providerSecretName = 'GROWTHAI_PROVIDER_API_KEY';
const providerParameterNames = [
  providerSecretName,
  'GROWTHAI_PROVIDER_BASE_URL',
  'GROWTHAI_PROVIDER_ENABLED',
  'GROWTHAI_PROVIDER_MODEL',
];
const deployableFunctionNames = [
  'createBookingCheckoutSession',
  'createConnectedAccount',
  'fieldPhotoUploadGateway',
  'generateGrowthAIContent',
  'generateOnboardingLink',
  'getConnectedAccountStatus',
  'getGrowthAICreditBalance',
  'routeGrowthAIConversation',
  'sendCustomerEmail',
  'stripeWebhook',
  'subscriptionWebhook',
];

let functionsEntry;
let declaredParams;

before(() => {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  process.env.GCLOUD_PROJECT = 'demo-servicesos-v1-smoke-local';
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-servicesos-v1-smoke-local' });
  ({ declaredParams } = require('firebase-functions/params'));
  functionsEntry = require('../index');
});

function endpointSecretNames(exportedFunction) {
  return (exportedFunction.__endpoint?.secretEnvironmentVariables || []).map(({ key }) => key);
}

describe('GrowthAI Function provider configuration', () => {
  test('declares the provider secret, durable configuration, and fail-closed switch', () => {
    const specs = declaredParams
      .filter(({ name }) => providerParameterNames.includes(name))
      .map((param) => param.toSpec())
      .sort((left, right) => left.name.localeCompare(right.name));

    assert.deepEqual(specs, [
      { name: 'GROWTHAI_PROVIDER_API_KEY', type: 'secret' },
      { name: 'GROWTHAI_PROVIDER_BASE_URL', type: 'string' },
      { default: false, name: 'GROWTHAI_PROVIDER_ENABLED', type: 'boolean' },
      { name: 'GROWTHAI_PROVIDER_MODEL', type: 'string' },
    ]);
  });

  test('binds the provider secret only to provider-backed GrowthAI Functions', () => {
    assert.deepEqual(endpointSecretNames(functionsEntry.generateGrowthAIContent), [providerSecretName]);
    assert.deepEqual(endpointSecretNames(functionsEntry.routeGrowthAIConversation), [providerSecretName]);
    assert.deepEqual(endpointSecretNames(functionsEntry.getGrowthAICreditBalance), []);
  });

  test('caps every deployable Function at zero warm and three maximum instances', () => {
    assert.deepEqual(Object.keys(functionsEntry).sort(), deployableFunctionNames.slice().sort());
    for (const functionName of deployableFunctionNames) {
      assert.equal(functionsEntry[functionName].__endpoint.minInstances, 0, functionName);
      assert.equal(functionsEntry[functionName].__endpoint.maxInstances, 3, functionName);
    }
  });

  test('preserves the public Stripe webhook invoker and provider-independent endpoints', () => {
    assert.deepEqual(functionsEntry.stripeWebhook.__endpoint.httpsTrigger.invoker, ['public']);
    assert.deepEqual(endpointSecretNames(functionsEntry.fieldPhotoUploadGateway), []);
    assert.deepEqual(endpointSecretNames(functionsEntry.sendCustomerEmail), []);
    assert.deepEqual(endpointSecretNames(functionsEntry.getGrowthAICreditBalance), []);
  });
});
