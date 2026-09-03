const assert = require('node:assert/strict');
const { before, test } = require('node:test');

let employeeFieldExecutionGateway;

before(() => {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  process.env.GCLOUD_PROJECT = 'demo-servicesos-v1-smoke-local';
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-servicesos-v1-smoke-local' });
  ({ employeeFieldExecutionGateway } = require('../index'));
});

test('employeeFieldExecutionGateway keeps zero warm instances', () => {
  assert.equal(employeeFieldExecutionGateway.__endpoint.minInstances, 0);
});

test('employeeFieldExecutionGateway limits scaling to three instances', () => {
  assert.equal(employeeFieldExecutionGateway.__endpoint.maxInstances, 3);
});

test('employeeFieldExecutionGateway does not bind secrets', () => {
  assert.deepEqual(employeeFieldExecutionGateway.__endpoint.secretEnvironmentVariables || [], []);
});
