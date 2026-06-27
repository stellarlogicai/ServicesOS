// src/__tests__/smoke.test.js
/**
 * Smoke Tests
 * 
 * Basic tests to verify core functionality works correctly.
 * These tests verify that the application can start and basic services are accessible.
 */

import { describe, it, expect } from 'vitest';

describe('Smoke Tests', () => {
  it('should verify core services can be imported', async () => {
    // Verify core services can be imported without errors
    await Promise.all([
      import('../core/customers/customerService'),
      import('../core/employees/employeeService'),
      import('../core/scheduling/schedulingService'),
      import('../core/contracts/contractService'),
      import('../core/photos/photoService'),
      import('../core/reviews/reviewService'),
      import('../core/training/trainingService'),
      import('../core/messaging/messagingService'),
      import('../core/time-tracking/timeTrackingService'),
      import('../core/notifications/notificationService'),
      import('../core/dashboard/dashboardService'),
      import('../core/permissions/permissionService'),
    ]);
  });

  it('should verify cleaning module services can be imported', async () => {
    // Verify cleaning module services can be imported without errors
    await Promise.all([
      import('../modules/cleaning/roomTemplates/roomTemplateService'),
      import('../modules/cleaning/petProfiles/petProfileService'),
      import('../modules/cleaning/checklists/checklistService'),
      import('../modules/cleaning/supplies/supplyService'),
      import('../modules/cleaning/services/cleaningServiceService'),
    ]);
  });

  it('should verify shared utilities can be imported', async () => {
    // Verify shared utilities can be imported without errors
    await Promise.all([
      import('../shared/logging/errorLoggingStandard'),
      import('../shared/api/apiResponseStandard'),
      import('../shared/features/featureRegistry'),
      import('../shared/events/eventBus'),
    ]);
  });

  it('should verify migration system can be imported', async () => {
    // Verify migration system can be imported without errors
    await Promise.all([
      import('../core/migrations/migrationRunner'),
      import('../core/migrations/moduleIsolationTests'),
    ]);
  });

  it('should verify React components can be imported', async () => {
    // Verify key React components can be imported without errors
    await Promise.all([
      import('../components/CustomerManagement'),
      import('../components/StaffScheduling'),
      import('../components/EmployeeManagement'),
    ]);
  });

  it('should verify schema version constants are defined', async () => {
    // Verify that schema version constants are centralized and available
    const schemaVersioning = await import('../shared/schemas/schemaVersioning');

    expect(schemaVersioning.SCHEMA_VERSIONS.CUSTOMER).toBeDefined();
    expect(schemaVersioning.SCHEMA_VERSIONS.EMPLOYEE).toBeDefined();
    expect(schemaVersioning.SCHEMA_VERSIONS.JOB).toBeDefined();
    expect(typeof schemaVersioning.getSchemaVersion).toBe('function');
  });

  it('should verify service functions are exported', async () => {
    // Verify that core services export expected functions
    const customerService = await import('../core/customers/customerService');
    const employeeService = await import('../core/employees/employeeService');
    const schedulingService = await import('../core/scheduling/schedulingService');

    // Customer service functions
    expect(typeof customerService.getCustomers).toBe('function');
    expect(typeof customerService.createCustomer).toBe('function');
    expect(typeof customerService.updateCustomer).toBe('function');
    expect(typeof customerService.deleteCustomer).toBe('function');

    // Employee service functions
    expect(typeof employeeService.getEmployees).toBe('function');
    expect(typeof employeeService.createEmployee).toBe('function');
    expect(typeof employeeService.updateEmployee).toBe('function');
    expect(typeof employeeService.deleteEmployee).toBe('function');

    // Scheduling service functions
    expect(typeof schedulingService.getJobsByDate).toBe('function');
    expect(typeof schedulingService.createJob).toBe('function');
    expect(typeof schedulingService.updateJobStatus).toBe('function');
  });

  it('should verify API response utilities work', async () => {
    // Verify API response utility functions
    const { successResponse, errorResponse } = await import('../shared/api/apiResponseStandard');

    const success = successResponse({ data: 'test' });
    expect(success.success).toBe(true);
    expect(success.data).toEqual({ data: 'test' });

    const error = errorResponse('Test error');
    expect(error.success).toBe(false);
    expect(error.message).toBe('Test error');
  });

  it('should verify feature registry works', async () => {
    // Verify feature registry can be imported and used
    const { featureEnabled, moduleEnabled, setModuleFeature } = await import('../shared/features/featureRegistry');

    expect(typeof featureEnabled).toBe('function');
    expect(typeof moduleEnabled).toBe('function');
    expect(typeof setModuleFeature).toBe('function');
  });

  it('should verify event bus works', async () => {
    // Verify event bus can be imported and used
    const { default: eventBus } = await import('../shared/events/eventBus');

    expect(typeof eventBus.on).toBe('function');
    expect(typeof eventBus.off).toBe('function');
    expect(typeof eventBus.emit).toBe('function');
  });
});
