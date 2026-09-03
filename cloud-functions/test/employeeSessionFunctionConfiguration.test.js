const assert = require('node:assert/strict');
const { before, test } = require('node:test');

let employeeSessionGateway;

before(() => {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  process.env.GCLOUD_PROJECT = 'demo-servicesos-v1-smoke-local';
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-servicesos-v1-smoke-local' });
  ({ employeeSessionGateway } = require('../index'));
});

test('employeeSessionGateway keeps zero warm instances', () => {
  assert.equal(employeeSessionGateway.__endpoint.minInstances, 0);
});

test('employeeSessionGateway limits scaling to three instances', () => {
  assert.equal(employeeSessionGateway.__endpoint.maxInstances, 3);
});
