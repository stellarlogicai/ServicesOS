const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('job scope gateway is bounded and has no provider secret access', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  const match = source.match(/exports\.jobScopeGateway\s*=\s*functions\.runWith\(([^)]*)\)/s);
  assert.ok(match);
  assert.match(match[1], /minInstances:\s*0/);
  assert.match(match[1], /maxInstances:\s*3/);
  assert.doesNotMatch(match[1], /secrets/);
});
