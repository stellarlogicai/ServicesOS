/**
 * Schema Versioning System
 * 
 * Rules from FutureProofing.md:
 * - Every document should include schemaVersion field
 * - Old documents should still work with new versions
 * - Migration scripts handle version upgrades
 */

export const SCHEMA_VERSIONS = {
  CUSTOMER: 1,
  LEAD: 1,
  ESTIMATE: 1,
  CONTRACT: 1,
  JOB: 1,
  EMPLOYEE: 1,
  PAYMENT: 1,
  PHOTO: 1,
  REVIEW: 1,
  TRAINING: 1,
  MESSAGE: 1,
  TIME_ENTRY: 1,
  NOTIFICATION: 1,
  TENANT: 1,
  USER: 1
};

/**
 * Add schema version to a document
 * @param {object} doc - The document to version
 * @param {string} schemaType - The schema type (e.g., 'CUSTOMER')
 * @returns {object} - Document with schemaVersion added
 */
export function addSchemaVersion(doc, schemaType) {
  return {
    ...doc,
    schemaVersion: SCHEMA_VERSIONS[schemaType] || 1
  };
}

/**
 * Get the current schema version for a type
 * @param {string} schemaType - The schema type
 * @returns {number} - Current version number
 */
export function getSchemaVersion(schemaType) {
  return SCHEMA_VERSIONS[schemaType] || 1;
}

/**
 * Check if a document needs migration
 * @param {object} doc - The document to check
 * @param {string} schemaType - The expected schema type
 * @returns {boolean} - True if migration is needed
 */
export function needsMigration(doc, schemaType) {
  const currentVersion = SCHEMA_VERSIONS[schemaType] || 1;
  const docVersion = doc.schemaVersion || 1;
  return docVersion < currentVersion;
}

/**
 * Validate schema version exists
 * @param {string} schemaType - The schema type to validate
 * @returns {boolean} - True if schema type is valid
 */
export function isValidSchemaType(schemaType) {
  return Object.prototype.hasOwnProperty.call(SCHEMA_VERSIONS, schemaType);
}
