const assert = require('node:assert/strict');
const { before, test } = require('node:test');

let employeeTeamGateway;
before(() => {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  process.env.GCLOUD_PROJECT = 'demo-servicesos-v1-smoke-local';
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-servicesos-v1-smoke-local' });
  ({ employeeTeamGateway } = require('../index'));
});

test('employeeTeamGateway keeps zero warm instances', () => assert.equal(employeeTeamGateway.__endpoint.minInstances, 0));
test('employeeTeamGateway limits scaling to three instances', () => assert.equal(employeeTeamGateway.__endpoint.maxInstances, 3));
