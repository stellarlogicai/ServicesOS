const { readFile } = require('node:fs/promises');
const path = require('node:path');

const FUNCTIONS_DIR = path.resolve(__dirname, '..');
const REPO_DIR = path.resolve(FUNCTIONS_DIR, '..');

const normalizeLineEndings = value => value.replace(/\r\n/g, '\n');

async function assertFilesMatch(deployFile, mirrorFile) {
  const [deploySource, mirrorSource] = await Promise.all([
    readFile(deployFile, 'utf8'),
    readFile(mirrorFile, 'utf8'),
  ]);

  if (normalizeLineEndings(deploySource) !== normalizeLineEndings(mirrorSource)) {
    throw new Error(
      `Rules mirror mismatch: ${path.relative(REPO_DIR, deployFile)} differs from ${path.relative(REPO_DIR, mirrorFile)}`
    );
  }
}

async function verifyRulesParity() {
  const firebaseConfig = JSON.parse(
    await readFile(path.join(FUNCTIONS_DIR, 'firebase.json'), 'utf8')
  );

  if (firebaseConfig.firestore?.rules !== 'firestore.rules') {
    throw new Error('firebase.json must use cloud-functions/firestore.rules as the Firestore deploy source.');
  }
  if (firebaseConfig.storage?.rules !== 'storage.rules') {
    throw new Error('firebase.json must use cloud-functions/storage.rules as the Storage deploy source.');
  }

  await Promise.all([
    assertFilesMatch(
      path.join(FUNCTIONS_DIR, 'firestore.rules'),
      path.join(REPO_DIR, 'shared', 'firestore.rules')
    ),
    assertFilesMatch(
      path.join(FUNCTIONS_DIR, 'storage.rules'),
      path.join(REPO_DIR, 'shared', 'storage.rules')
    ),
  ]);
}

if (require.main === module) {
  verifyRulesParity()
    .then(() => console.log('Firebase rule sources and shared mirrors are in parity.'))
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  assertFilesMatch,
  normalizeLineEndings,
  verifyRulesParity,
};
