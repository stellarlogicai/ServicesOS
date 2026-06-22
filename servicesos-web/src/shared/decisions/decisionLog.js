/**
 * Decision Log System
 * 
 * Rules from FutureProofing.md:
 * - Document WHY decisions were made
 * - Include alternatives and consequences
 * - Help future developers understand architecture
 * - Prevent "why is it like this?" questions
 * 
 * Example format:
 * Decision:
 * ServicesOS uses Core + Modules
 * 
 * Date:
 * 2026-06-16
 * 
 * Reason:
 * Future vertical expansion.
 * 
 * Alternatives:
 * Separate codebases.
 * 
 * Rejected because:
 * Too much duplication.
 * 
 * Impact:
 * Every future module inherits core systems.
 */


const DECISIONS = [];

/**
 * Log a decision
 * @param {object} decision - The decision object
 * @param {string} decision.title - Decision title
 * @param {string} decision.reason - Why this decision was made
 * @param {string[]} decision.alternatives - Alternative approaches considered
 * @param {string} decision.rejectionReason - Why alternatives were rejected
 * @param {string} decision.impact - Impact of this decision
 * @param {string[]} decision.relatedFiles - Related files
 * @param {string} decision.author - Decision author
 */
export function logDecision(decision) {
  const decisionEntry = {
    id: `decision_${Date.now()}`,
    timestamp: new Date().toISOString(),
    ...decision
  };
  
  DECISIONS.push(decisionEntry);
  
  // In development, log to console
  if (import.meta.env?.MODE === 'development' || !import.meta.env?.PROD) {
    console.log('[Decision Log]', decisionEntry);
  }
  
  return decisionEntry;
}

/**
 * Get all decisions
 * @returns {object[]} - Array of all decisions
 */
export function getDecisions() {
  return [...DECISIONS];
}

/**
 * Get decisions by category
 * @param {string} category - The category to filter by
 * @returns {object[]} - Array of filtered decisions
 */
export function getDecisionsByCategory(category) {
  return DECISIONS.filter(decision => 
    decision.category?.toLowerCase() === category.toLowerCase()
  );
}

/**
 * Get recent decisions
 * @param {number} limit - Number of recent decisions to return
 * @returns {object[]} - Array of recent decisions
 */
export function getRecentDecisions(limit = 10) {
  return [...DECISIONS]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
}

/**
 * Search decisions
 * @param {string} searchTerm - The search term
 * @returns {object[]} - Array of matching decisions
 */
export function searchDecisions(searchTerm) {
  const term = searchTerm.toLowerCase();
  return DECISIONS.filter(decision =>
    decision.title?.toLowerCase().includes(term) ||
    decision.reason?.toLowerCase().includes(term) ||
    decision.impact?.toLowerCase().includes(term)
  );
}

// Pre-populate with key architectural decisions
logDecision({
  title: 'ServicesOS uses Core + Modules Architecture',
  category: 'Architecture',
  reason: 'Future vertical expansion. Need to support cleaning, window cleaning, lawn care, etc. without rewriting the platform.',
  alternatives: [
    'Separate codebases for each industry',
    'Monolithic application with if/else statements',
    'Plugin system with dynamic loading'
  ],
  rejectionReason: 'Separate codebases = too much duplication. Monolithic = unmaintainable. Plugins = too complex for MVP.',
  impact: 'Every future module inherits core systems (customers, scheduling, payments, etc.). New verticals can be added by creating module configuration.',
  relatedFiles: [
    'src/modules/cleaning/module.config.js',
    'src/shared/features/featureRegistry.js',
    'src/core/'
  ],
  author: 'Jamie'
});

logDecision({
  title: 'Event-Driven Updates Instead of Direct Dependencies',
  category: 'Architecture',
  reason: 'Prevent feature dependencies. Features should not know about each other.',
  alternatives: [
    'Direct function calls between features',
    'Shared state management',
    'Callback chains'
  ],
  rejectionReason: 'Direct calls create tight coupling. Shared state becomes unmaintainable. Callback chains are hard to debug.',
  impact: 'Features emit events and subscribe to events they care about. Adding new features (like loyalty system) just requires listening to existing events.',
  relatedFiles: [
    'src/shared/events/eventBus.js'
  ],
  author: 'Jamie'
});

logDecision({
  title: 'Schema Versioning for All Documents',
  category: 'Data',
  reason: 'Future-proof data structure changes. Need to support old and new schemas simultaneously.',
  alternatives: [
    'Break all old data on schema changes',
    'Manual data migration for each change',
    'Multiple versions of code running simultaneously'
  ],
  rejectionReason: 'Breaking data = customer loss. Manual migration = error-prone. Multiple code versions = impossible to maintain.',
  impact: 'Old customers continue working while new customers get new schema. Migration scripts handle gradual upgrades.',
  relatedFiles: [
    'src/shared/schemas/schemaVersioning.js'
  ],
  author: 'Jamie'
});

logDecision({
  title: 'Feature Registry Instead of Hardcoded Conditions',
  category: 'Architecture',
  reason: 'Enable/disable features without code changes. Support module-specific features.',
  alternatives: [
    'if (cleaning) showCleaningFields()',
    'if (admin) showAdminPanel()',
    'if (beta) showBetaFeatures()'
  ],
  rejectionReason: 'Hardcoded conditions = spaghetti code. Impossible to add new modules without touching everything.',
  impact: 'UI adapts based on active module and its features. New modules can be added by registering them in the feature registry.',
  relatedFiles: [
    'src/shared/features/featureRegistry.js'
  ],
  author: 'Jamie'
});

logDecision({
  title: 'Standardized API Responses',
  category: 'API',
  reason: 'Predictable error handling and data responses across all services.',
  alternatives: [
    'Each service returns different format',
    'Throw errors directly',
    'Return null on failure'
  ],
  rejectionReason: 'Inconsistent formats = hard to debug. Throwing errors = crashes UI. Returning null = no error information.',
  impact: 'All services return { success, data, message, error }. UI can handle responses consistently. Easier logging and debugging.',
  relatedFiles: [
    'src/shared/api/apiResponseStandard.js'
  ],
  author: 'Jamie'
});

logDecision({
  title: 'Standardized Error Logging',
  category: 'Logging',
  reason: 'Structured error data for debugging and analytics. Future error dashboard.',
  alternatives: [
    'console.error everywhere',
    'Different error formats per module',
    'No error tracking'
  ],
  rejectionReason: 'Inconsistent logging = impossible to debug. No tracking = no visibility into issues.',
  impact: 'All errors include timestamp, tenantId, userId, module, feature, severity, message, stack. Future dashboard can show top errors by module.',
  relatedFiles: [
    'src/shared/logging/errorLoggingStandard.js'
  ],
  author: 'Jamie'
});

logDecision({
  title: 'Seed Data System for Testing and Onboarding',
  category: 'Testing',
  reason: 'Quick setup for new developers and wife beta. Consistent test environments.',
  alternatives: [
    'Manual data entry for each test',
    'No demo data',
    'External seed scripts'
  ],
  rejectionReason: 'Manual entry = slow and error-prone. No demo data = hard to test. External scripts = not integrated.',
  impact: 'New developers can seed database with one command. Wife beta has test data ready. Testing can create 100 fake customers instantly.',
  relatedFiles: [
    'src/shared/seed/seedData.js'
  ],
  author: 'Jamie'
});

logDecision({
  title: 'Cleaning as First Vertical Module',
  category: 'Business',
  reason: 'Wife owns cleaning business. Provides real beta testing. Fastest path to revenue.',
  alternatives: [
    'Start with lawn care',
    'Start with window cleaning',
    'Build generic platform first'
  ],
  rejectionReason: 'No real customer for other verticals. Generic platform = no validation. Wife business = immediate revenue.',
  impact: 'Cleaning validates the platform architecture. Other verticals can reuse proven patterns. Revenue starts flowing immediately.',
  relatedFiles: [
    'src/modules/cleaning/',
    'Planning/ServicesOS/ServicesOS Vertical Architecture.md'
  ],
  author: 'Jamie'
});

logDecision({
  title: 'Firebase as Primary Database',
  category: 'Infrastructure',
  reason: 'Real-time sync, built-in auth, scalable, good free tier, familiar with ecosystem.',
  alternatives: [
    'PostgreSQL with custom backend',
    'MongoDB with custom backend',
    'Supabase',
    'AWS DynamoDB'
  ],
  rejectionReason: 'Custom backend = more development time. Other options = less familiar or more expensive.',
  impact: 'Fast development with real-time features. Built-in authentication. Scalable to thousands of tenants. Good free tier for MVP.',
  relatedFiles: [
    'src/firebase.js',
    'cloud-functions/firestore.rules'
  ],
  author: 'Jamie'
});

export default {
  logDecision,
  getDecisions,
  getDecisionsByCategory,
  getRecentDecisions,
  searchDecisions
};
