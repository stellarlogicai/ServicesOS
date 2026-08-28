const assert = require('node:assert/strict');
const { before, describe, test } = require('node:test');

const providerSecretName = 'GROWTHAI_PROVIDER_API_KEY';
const providerParameterNames = [
  providerSecretName,
  'GROWTHAI_PROVIDER_BASE_URL',
  'GROWTHAI_PROVIDER_MODEL',
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
  test('declares one secret and two durable non-secret Firebase parameters', () => {
    const specs = declaredParams
      .filter(({ name }) => providerParameterNames.includes(name))
      .map((param) => param.toSpec())
      .sort((left, right) => left.name.localeCompare(right.name));

    assert.deepEqual(specs, [
      { name: 'GROWTHAI_PROVIDER_API_KEY', type: 'secret' },
      { name: 'GROWTHAI_PROVIDER_BASE_URL', type: 'string' },
      { name: 'GROWTHAI_PROVIDER_MODEL', type: 'string' },
    ]);
  });

  test('binds the provider secret only to provider-backed GrowthAI Functions', () => {
    assert.deepEqual(endpointSecretNames(functionsEntry.generateGrowthAIContent), [providerSecretName]);
    assert.deepEqual(endpointSecretNames(functionsEntry.routeGrowthAIConversation), [providerSecretName]);
    assert.deepEqual(endpointSecretNames(functionsEntry.getGrowthAICreditBalance), []);
  });
});
