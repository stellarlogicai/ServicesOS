const assert = require('node:assert/strict');
const { before, describe, test } = require('node:test');

let functionsEntry;
let declaredParams;

before(() => {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  process.env.GCLOUD_PROJECT = 'demo-servicesos-v1-smoke-local';
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-servicesos-v1-smoke-local' });
  ({ declaredParams } = require('firebase-functions/params'));
  functionsEntry = require('../index');
});

describe('sendCustomerEmail Function configuration', () => {
  test('declares the fail-closed provider switch', () => {
    const spec = declaredParams.find(param => param.name === 'CUSTOMER_EMAIL_PROVIDER_ENABLED')?.toSpec();
    assert.deepEqual(spec, { name: 'CUSTOMER_EMAIL_PROVIDER_ENABLED', type: 'boolean', default: false });
  });

  test('caps only the email endpoint at three instances with no warm instances', () => {
    assert.equal(functionsEntry.sendCustomerEmail.__endpoint.maxInstances, 3);
    assert.equal(functionsEntry.sendCustomerEmail.__endpoint.minInstances, 0);
  });
});
