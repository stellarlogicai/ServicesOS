const assert = require('node:assert/strict');
const { before, test } = require('node:test');

let employeeJobPacketGateway;

before(() => {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  process.env.GCLOUD_PROJECT = 'demo-servicesos-v1-smoke-local';
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-servicesos-v1-smoke-local' });
  ({ employeeJobPacketGateway } = require('../index'));
});

test('employeeJobPacketGateway keeps zero warm instances', () => {
  assert.equal(employeeJobPacketGateway.__endpoint.minInstances, 0);
});

test('employeeJobPacketGateway limits scaling to three instances', () => {
  assert.equal(employeeJobPacketGateway.__endpoint.maxInstances, 3);
});

test('employeeJobPacketGateway does not bind secrets', () => {
  assert.deepEqual(employeeJobPacketGateway.__endpoint.secretEnvironmentVariables || [], []);
});
