const assert = require('node:assert/strict');
const { before, describe, test } = require('node:test');

let functionsEntry;

before(() => {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  process.env.GCLOUD_PROJECT = 'demo-servicesos-v1-smoke-local';
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-servicesos-v1-smoke-local' });
  functionsEntry = require('../index');
});

function assertBounded(name) {
  assert.equal(functionsEntry[name].__endpoint.minInstances, 0, name);
  assert.equal(functionsEntry[name].__endpoint.maxInstances, 3, name);
}

describe('selective Function deployment guardrails', () => {
  test('preserves bounded non-Stripe API and provider gateways', () => {
    for (const name of [
      'ownerOnboardingBootstrapGateway',
      'ownerOnboardingBusinessProfileGateway',
      'ownerOnboardingSaasAgreementGateway',
      'ownerOnboardingFinalizeGateway',
      'employeeSessionGateway',
      'employeeJobPacketGateway',
      'employeeFieldExecutionGateway',
      'generateGrowthAIContent',
      'getGrowthAICreditBalance',
      'routeGrowthAIConversation',
      'employeeWorkAssistantGateway',
      'fieldPhotoUploadGateway',
      'jobScopeGateway',
      'addOnCatalogGateway',
      'extraWorkGateway',
      'sendCustomerEmail',
    ]) {
      assertBounded(name);
    }
  });

  test('preserves the newer bounded Stripe owner onboarding paths', () => {
    assertBounded('ownerOnboardingBillingGateway');
    assertBounded('ownerSubscriptionActivationWebhook');
  });

  test('keeps legacy and canonical Stripe paths intentionally uncapped', () => {
    for (const name of [
      'createBookingCheckoutSession',
      'stripeWebhook',
      'createConnectedAccount',
      'generateOnboardingLink',
      'getConnectedAccountStatus',
    ]) {
      assert.notEqual(functionsEntry[name].__endpoint.minInstances, 0, name);
      assert.notEqual(functionsEntry[name].__endpoint.maxInstances, 3, name);
    }
  });

  test('preserves the public booking Stripe webhook invoker', () => {
    assert.deepEqual(functionsEntry.stripeWebhook.__endpoint.httpsTrigger.invoker, ['public']);
  });
});
