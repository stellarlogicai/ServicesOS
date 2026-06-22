/**
 * Feature Registry
 * Centralized feature flags for ServicesOS
 * 
 * Rules from FutureProofing.md:
 * - Never use hardcoded conditions like if(cleaning), if(admin), if(beta)
 * - Always use featureEnabled('FEATURE_NAME')
 * - This allows modules to be enabled/disabled without breaking Core
 * 
 * Module-based approach:
 * - Each vertical module has its own feature set
 * - Core features are shared across all modules
 * - UI adapts based on active module and its features
 */

export const MODULES = {
  cleaning: {
    name: "Cleaning",
    enabled: true,
    features: [
      "customers",
      "leads",
      "estimates",
      "contracts",
      "scheduling",
      "employees",
      "payments",
      "photos",
      "reviews",
      "training",
      "messaging",
      "timeTracking",
      "notifications",
      "dashboard",
      "permissions",
      // Cleaning-specific features
      "roomTemplates",
      "petProfiles",
      "cleaningChecklists",
      "chemicalSafety",
      "accessNotes",
      "beforeAfterPhotos"
    ]
  },
  windowCleaning: {
    name: "Window Cleaning",
    enabled: false,
    features: [
      "customers",
      "leads",
      "estimates",
      "contracts",
      "scheduling",
      "employees",
      "payments",
      "photos",
      "reviews",
      "training",
      "messaging",
      "timeTracking",
      "notifications",
      "dashboard",
      "permissions",
      // Window cleaning-specific features
      "windowTypes",
      "ladderTracking",
      "secondStoryFlag",
      "weatherDelays"
    ]
  },
  lawnCare: {
    name: "Lawn Care",
    enabled: false,
    features: [
      "customers",
      "leads",
      "estimates",
      "contracts",
      "scheduling",
      "employees",
      "payments",
      "photos",
      "reviews",
      "training",
      "messaging",
      "timeTracking",
      "notifications",
      "dashboard",
      "permissions",
      // Lawn care-specific features
      "yardSize",
      "mowingFrequency",
      "fertilizerOptions",
      "fenceAndGateNotes",
      "seasonalScheduling",
      "weatherAwareness"
    ]
  },
  carpetCleaning: {
    name: "Carpet Cleaning",
    enabled: false,
    features: [
      "customers",
      "leads",
      "estimates",
      "contracts",
      "scheduling",
      "employees",
      "payments",
      "photos",
      "reviews",
      "training",
      "messaging",
      "timeTracking",
      "notifications",
      "dashboard",
      "permissions",
      // Carpet cleaning-specific features
      "roomCount",
      "stainTreatment",
      "petOdorTreatment",
      "equipmentTracking",
      "dryTimeNotes"
    ]
  },
  pressureWashing: {
    name: "Pressure Washing",
    enabled: false,
    features: [
      "customers",
      "leads",
      "estimates",
      "contracts",
      "scheduling",
      "employees",
      "payments",
      "photos",
      "reviews",
      "training",
      "messaging",
      "timeTracking",
      "notifications",
      "dashboard",
      "permissions",
      // Pressure washing-specific features
      "surfaceTypes",
      "psiRequirements",
      "chemicalSelection",
      "weatherConstraints"
    ]
  },
  junkRemoval: {
    name: "Junk Removal",
    enabled: false,
    features: [
      "customers",
      "leads",
      "estimates",
      "contracts",
      "scheduling",
      "employees",
      "payments",
      "photos",
      "reviews",
      "training",
      "messaging",
      "timeTracking",
      "notifications",
      "dashboard",
      "permissions",
      // Junk removal-specific features
      "truckSize",
      "itemPhotos",
      "heavyItemWarnings",
      "dumpFeeEstimates",
      "crewSize"
    ]
  },
  handyman: {
    name: "Handyman",
    enabled: false,
    features: [
      "customers",
      "leads",
      "estimates",
      "contracts",
      "scheduling",
      "employees",
      "payments",
      "photos",
      "reviews",
      "training",
      "messaging",
      "timeTracking",
      "notifications",
      "dashboard",
      "permissions",
      // Handyman-specific features
      "skillCategories",
      "toolRequirements",
      "materialEstimates",
      "projectTypes"
    ]
  },
  snowRemoval: {
    name: "Snow Removal",
    enabled: false,
    features: [
      "customers",
      "leads",
      "estimates",
      "contracts",
      "scheduling",
      "employees",
      "payments",
      "photos",
      "reviews",
      "training",
      "messaging",
      "timeTracking",
      "notifications",
      "dashboard",
      "permissions",
      // Snow removal-specific features
      "snowDepthTracking",
      "priorityRoutes",
      "saltUsage",
      "equipmentTracking",
      "weatherAlerts"
    ]
  }
};

export const AI_FEATURES = {
  AI_PHOTO_ESTIMATE: true,
  AI_CREDIT_SYSTEM: true,
  AI_MODEL_TRAINING: true,
  AI_ASSISTANT: false
};

export const PAYMENT_FEATURES = {
  STRIPE_CONNECT: true,
  TAP_TO_PAY: false,
  DEPOSIT_PAYMENTS: true,
  FINAL_PAYMENTS: true
};

export const ADVANCED_FEATURES = {
  ROUTE_OPTIMIZATION: true,
  DATA_EXPORT: true,
  BACKUP_PANEL: true,
  MIGRATION_CENTER: true,
  INCIDENT_REPORTING: true,
  INSURANCE_TRACKING: true,
  RECURRING_SERVICES: true
};

/**
 * Get active module for a tenant
 * @returns {object|null} - Active module configuration
 */
export function getActiveModule() {
  // TODO: Implement tenant-specific module selection
  // For now, return cleaning as default
  return MODULES.cleaning;
}

/**
 * Check if a module is enabled
 * @param {string} moduleName - The module name
 * @returns {boolean} - Whether the module is enabled
 */
export function moduleEnabled(moduleName) {
  const module = MODULES[moduleName];
  return module ? module.enabled : false;
}

/**
 * Check if a feature is enabled for the active module
 * @param {string} featureName - The feature name
 * @param {string} tenantId - The tenant ID (optional)
 * @returns {boolean} - Whether the feature is enabled
 */
export function featureEnabled(featureName, tenantId = null) {
  const activeModule = getActiveModule(tenantId);
  if (!activeModule) return false;
  
  return activeModule.features.includes(featureName);
}

/**
 * Get all enabled features for a module
 * @param {string} moduleName - The module name
 * @returns {string[]} - Array of enabled feature names
 */
export function getModuleFeatures(moduleName) {
  const module = MODULES[moduleName];
  return module ? module.features : [];
}

/**
 * Get all enabled modules
 * @returns {object[]} - Array of enabled module configurations
 */
export function getEnabledModules() {
  return Object.values(MODULES).filter(module => module.enabled);
}

/**
 * Enable a module at runtime
 * @param {string} moduleName 
 * @param {boolean} enabled 
 */
export function setModuleEnabled(moduleName, enabled) {
  if (Object.prototype.hasOwnProperty.call(MODULES, moduleName)) {
    MODULES[moduleName].enabled = enabled;
  } else {
    console.warn(`Module ${moduleName} does not exist in registry`);
  }
}

/**
 * Enable a feature at runtime (for testing or admin overrides)
 * @param {string} moduleName 
 * @param {string} featureName 
 * @param {boolean} enabled 
 */
export function setModuleFeature(moduleName, featureName, enabled) {
  if (Object.prototype.hasOwnProperty.call(MODULES, moduleName)) {
    const module = MODULES[moduleName];
    if (enabled && !module.features.includes(featureName)) {
      module.features.push(featureName);
    } else if (!enabled) {
      module.features = module.features.filter(f => f !== featureName);
    }
  } else {
    console.warn(`Module ${moduleName} does not exist in registry`);
  }
}

/**
 * Check if AI feature is enabled
 * @param {string} featureName - The AI feature name
 * @returns {boolean} - Whether the AI feature is enabled
 */
export function aiFeatureEnabled(featureName) {
  return AI_FEATURES[featureName] === true;
}

/**
 * Check if payment feature is enabled
 * @param {string} featureName - The payment feature name
 * @returns {boolean} - Whether the payment feature is enabled
 */
export function paymentFeatureEnabled(featureName) {
  return PAYMENT_FEATURES[featureName] === true;
}

/**
 * Check if advanced feature is enabled
 * @param {string} featureName - The advanced feature name
 * @returns {boolean} - Whether the advanced feature is enabled
 */
export function advancedFeatureEnabled(featureName) {
  return ADVANCED_FEATURES[featureName] === true;
}
