// src/core/migrations/moduleIsolationTests.js
/**
 * Module Isolation Tests
 * 
 * This system verifies that modules don't have unintended dependencies on each other,
 * ensuring the vertical architecture remains clean and maintainable.
 */

import { readFileSync } from 'fs';

// Define module boundaries - what modules can import from where
const MODULE_BOUNDARIES = {
  // Core modules can import from shared utilities
  'core': {
    allowedImports: ['shared', 'firebase'],
    disallowedImports: ['modules', 'components', 'pages']
  },
  
  // Vertical modules can import from core and shared, but not from other vertical modules
  'modules': {
    allowedImports: ['core', 'shared', 'firebase'],
    disallowedImports: ['modules', 'components', 'pages']
  },
  
  // Components can import from core, modules, and shared
  'components': {
    allowedImports: ['core', 'modules', 'shared', 'firebase', 'contexts'],
    disallowedImports: ['pages']
  },
  
  // Pages can import from anywhere except other pages
  'pages': {
    allowedImports: ['core', 'modules', 'components', 'shared', 'firebase', 'contexts'],
    disallowedImports: ['pages']
  },
  
  // Shared utilities should be independent
  'shared': {
    allowedImports: [],
    disallowedImports: ['core', 'modules', 'components', 'pages']
  },
  
  // Contexts can import from shared and firebase only
  'contexts': {
    allowedImports: ['shared', 'firebase'],
    disallowedImports: ['core', 'modules', 'components', 'pages']
  }
};

/**
 * Parse import statements from a file
 * @param {string} filePath - Path to the file
 * @returns {Array} Array of import paths
 */
function parseImports(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const importRegex = /from ['"]([^'"]+)['"]/g;
    const imports = [];
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    return imports;
  } catch {
    return [];
  }
}

/**
 * Determine which module a file belongs to based on its path
 * @param {string} filePath - Path to the file
 * @returns {string|null} Module name or null if not in a module
 */
function getModuleFromPath(filePath) {
  const parts = filePath.split(/[/\\]/);
  const srcIndex = parts.indexOf('src');
  
  if (srcIndex === -1 || srcIndex + 1 >= parts.length) {
    return null;
  }
  
  return parts[srcIndex + 1];
}

/**
 * Normalize an import path to determine which module it refers to
 * @param {string} importPath - The import path
 * @returns {string|null} Module name or null if external
 */
function getModuleFromImport(importPath) {
  // External packages (node_modules)
  if (importPath.startsWith('.') || importPath.startsWith('/')) {
    // Relative or absolute path - extract module
    const parts = importPath.split(/[/\\]/);
    // Remove leading dots and slashes
    const cleanParts = parts.filter(p => p && p !== '.' && p !== '..');
    
    if (cleanParts.length > 0) {
      return cleanParts[0];
    }
  }
  
  // External package
  return null;
}

/**
 * Check if an import violates module boundaries
 * @param {string} sourceModule - The module doing the importing
 * @param {string} targetModule - The module being imported
 * @returns {Object} Result with violation status and message
 */
function checkImportViolation(sourceModule, targetModule) {
  if (!sourceModule || !targetModule) {
    return { violation: false, message: '' };
  }
  
  const boundaries = MODULE_BOUNDARIES[sourceModule];
  if (!boundaries) {
    return { violation: false, message: '' };
  }
  
  // Check if target is in disallowed imports
  if (boundaries.disallowedImports.includes(targetModule)) {
    return {
      violation: true,
      message: `${sourceModule} cannot import from ${targetModule}`
    };
  }
  
  // Check if target is in allowed imports
  if (boundaries.allowedImports.length > 0 && !boundaries.allowedImports.includes(targetModule)) {
    return {
      violation: true,
      message: `${sourceModule} can only import from: ${boundaries.allowedImports.join(', ')}`
    };
  }
  
  return { violation: false, message: '' };
}

/**
 * Test a single file for module isolation violations
 * @param {string} filePath - Path to the file
 * @returns {Object} Test result
 */
export function testFileModuleIsolation(filePath) {
  const sourceModule = getModuleFromPath(filePath);
  if (!sourceModule) {
    return {
      file: filePath,
      module: 'external',
      violations: [],
      passed: true
    };
  }
  
  const imports = parseImports(filePath);
  const violations = [];
  
  for (const importPath of imports) {
    const targetModule = getModuleFromImport(importPath);
    const check = checkImportViolation(sourceModule, targetModule);
    
    if (check.violation) {
      violations.push({
        import: importPath,
        message: check.message
      });
    }
  }
  
  return {
    file: filePath,
    module: sourceModule,
    violations,
    passed: violations.length === 0
  };
}

/**
 * Test all files in a directory for module isolation
 * @param {string} directory - Directory to test
 * @param {Object} options - Test options
 * @returns {Object} Test results
 */
export function testDirectoryModuleIsolation(directory) {
  // This would need a proper file system walker
  // For now, return a placeholder result
  return {
    directory,
    filesTested: 0,
    passed: 0,
    failed: 0,
    violations: [],
    message: 'File system walker not implemented - use testFileModuleIsolation for individual files'
  };
}

/**
 * Run module isolation tests on specific critical paths
 * @returns {Object} Test results
 */
export function runCriticalModuleIsolationTests() {
  // Placeholder for actual implementation
  // This would walk the directory and test each file
  
  return {
    total: 0,
    passed: 0,
    failed: 0,
    violations: [],
    message: 'Critical module isolation tests - implement file system walker for full functionality'
  };
}

/**
 * Verify that core services don't depend on vertical modules
 * @returns {Object} Test result
 */
export function verifyCoreModuleIndependence() {
  // Core services should only depend on shared utilities and firebase
  const coreServices = [
    'src/core/customers/customerService.js',
    'src/core/employees/employeeService.js',
    'src/core/scheduling/schedulingService.js',
    'src/core/contracts/contractService.js',
    'src/core/photos/photoService.js',
    'src/core/reviews/reviewService.js',
    'src/core/training/trainingService.js',
    'src/core/messaging/messagingService.js',
    'src/core/time-tracking/timeTrackingService.js',
    'src/core/notifications/notificationService.js',
    'src/core/dashboard/dashboardService.js',
    'src/core/permissions/permissionService.js'
  ];
  
  const results = [];
  
  for (const servicePath of coreServices) {
    const result = testFileModuleIsolation(servicePath);
    results.push(result);
  }
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  return {
    total: results.length,
    passed,
    failed,
    results,
    success: failed === 0
  };
}

/**
 * Verify that vertical modules don't depend on each other
 * @returns {Object} Test result
 */
export function verifyVerticalModuleIndependence() {
  const cleaningModule = [
    'src/modules/cleaning/roomTemplates/roomTemplateService.js',
    'src/modules/cleaning/petProfiles/petProfileService.js',
    'src/modules/cleaning/checklists/checklistService.js',
    'src/modules/cleaning/supplies/supplyService.js',
    'src/modules/cleaning/services/cleaningServiceService.js'
  ];
  
  const results = [];
  
  for (const servicePath of cleaningModule) {
    const result = testFileModuleIsolation(servicePath);
    results.push(result);
  }
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  return {
    total: results.length,
    passed,
    failed,
    results,
    success: failed === 0
  };
}

/**
 * Run all module isolation tests
 * @returns {Object} Overall test results
 */
export function runAllModuleIsolationTests() {
  const coreTest = verifyCoreModuleIndependence();
  const verticalTest = verifyVerticalModuleIndependence();
  
  const totalPassed = coreTest.passed + verticalTest.passed;
  const totalFailed = coreTest.failed + verticalTest.failed;
  const totalTests = coreTest.total + verticalTest.total;
  
  return {
    overall: {
      total: totalTests,
      passed: totalPassed,
      failed: totalFailed,
      success: totalFailed === 0
    },
    core: coreTest,
    vertical: verticalTest
  };
}
