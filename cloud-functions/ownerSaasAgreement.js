const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const AGREEMENT_TYPE = 'servicesos_saas';
const AGREEMENT_ID = 'servicesos-saas-v1';
const AGREEMENT_VERSION_DATE = '2026-09-12';
const AGREEMENT_VERSION_DATE_LABEL = 'September 12, 2026';
const CONTRACT_ID = 'servicesos_saas_servicesos-saas-v1';
const ACCEPTANCE_LANGUAGE = 'I have read and agree to the ServicesOS Software-as-a-Service Agreement on behalf of my business, and I confirm that I am authorized to accept these terms.';
const EXPECTED_TERMS_HASH = 'b5215c604cf20cc4374433528db6c727a1201b3d450abe9d37a5a22abefcd174';
const sourcePath = path.join(__dirname, 'legal', 'ServicesOS_SaaS_Agreement_V1_Release_Candidate.md');
const sourceBytes = fs.readFileSync(sourcePath);
const termsHash = crypto.createHash('sha256').update(sourceBytes).digest('hex');
if (termsHash !== EXPECTED_TERMS_HASH) throw new Error('Canonical ServicesOS SaaS agreement integrity check failed.');
const termsMarkdown = sourceBytes.toString('utf8');

module.exports = {
  ACCEPTANCE_LANGUAGE,
  AGREEMENT_ID,
  AGREEMENT_TYPE,
  AGREEMENT_VERSION_DATE,
  AGREEMENT_VERSION_DATE_LABEL,
  CONTRACT_ID,
  EXPECTED_TERMS_HASH,
  termsHash,
  termsMarkdown,
};
