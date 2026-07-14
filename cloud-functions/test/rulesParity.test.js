const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const {
  assertFilesMatch,
  normalizeLineEndings,
  verifyRulesParity,
} = require('../scripts/verifyRulesParity');

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => (
    rm(directory, { recursive: true, force: true })
  )));
});

test('deploy-source rules match their shared mirrors and firebase.json uses them', async () => {
  await assert.doesNotReject(verifyRulesParity());
});

test('line-ending normalization preserves exact-content parity', () => {
  assert.equal(normalizeLineEndings('one\r\ntwo\r\n'), 'one\ntwo\n');
});

test('parity comparison rejects meaningful rule differences', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'servicesos-rules-'));
  temporaryDirectories.push(directory);
  const deployFile = path.join(directory, 'deploy.rules');
  const mirrorFile = path.join(directory, 'mirror.rules');
  await writeFile(deployFile, 'allow read: if true;\n');
  await writeFile(mirrorFile, 'allow read: if false;\n');

  await assert.rejects(
    assertFilesMatch(deployFile, mirrorFile),
    /Rules mirror mismatch/
  );
});
