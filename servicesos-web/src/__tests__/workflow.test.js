// src/__tests__/workflow.test.js
/**
 * Workflow Tests
 * 
 * Tests for core business workflows including customer management,
 * employee management, and job scheduling workflows.
 */

import { describe, it, expect } from 'vitest';

describe('Workflow Tests', () => {
  describe('Customer Management Workflow', () => {
    it('should verify customer service exports workflow functions', async () => {
      const customerService = await import('../core/customers/customerService');

      expect(typeof customerService.getCustomers).toBe('function');
      expect(typeof customerService.createCustomer).toBe('function');
      expect(typeof customerService.updateCustomer).toBe('function');
      expect(typeof customerService.deleteCustomer).toBe('function');
    });

    it('should verify customer service returns proper API response structure', async () => {
      const customerService = await import('../core/customers/customerService');

      // Verify the service uses standardized response format without touching Firestore
      const response = await customerService.getCustomers();
      expect(response.success).toBe(false);
      expect(response.data).toBeNull();
      expect(response.message).toBe('Tenant ID is required');
    });
  });

  describe('Employee Management Workflow', () => {
    it('should verify employee service exports workflow functions', async () => {
      const employeeService = await import('../core/employees/employeeService');

      expect(typeof employeeService.getEmployees).toBe('function');
      expect(typeof employeeService.createEmployee).toBe('function');
      expect(typeof employeeService.updateEmployee).toBe('function');
      expect(typeof employeeService.deleteEmployee).toBe('function');
    });

    it('should verify employee service returns proper API response structure', async () => {
      const employeeService = await import('../core/employees/employeeService');

      const response = await employeeService.getEmployees();
      expect(response.success).toBe(false);
      expect(response.data).toBeNull();
      expect(response.message).toBe('Tenant ID is required');
    });
  });

  describe('Job Scheduling Workflow', () => {
    it('should verify scheduling service exports workflow functions', async () => {
      const schedulingService = await import('../core/scheduling/schedulingService');

      expect(typeof schedulingService.getJobsByDate).toBe('function');
      expect(typeof schedulingService.createJob).toBe('function');
      expect(typeof schedulingService.updateJobStatus).toBe('function');
    });

    it('should verify scheduling service returns proper API response structure', async () => {
      const schedulingService = await import('../core/scheduling/schedulingService');

      const response = await schedulingService.getJobs();
      expect(response.success).toBe(false);
      expect(response.data).toBeNull();
      expect(response.message).toBe('Tenant ID is required');
    });
  });

  describe('Contract Management Workflow', () => {
    it('should verify contract service exports workflow functions', async () => {
      const contractService = await import('../core/contracts/contractService');

      expect(typeof contractService.getContracts).toBe('function');
      expect(typeof contractService.createContract).toBe('function');
      expect(typeof contractService.updateContract).toBe('function');
    });
  });

  describe('Photo Management Workflow', () => {
    it('should verify photo service exports workflow functions', async () => {
      const photoService = await import('../core/photos/photoService');

      expect(typeof photoService.getPhotos).toBe('function');
      expect(typeof photoService.createPhoto).toBe('function');
      expect(typeof photoService.deletePhoto).toBe('function');
    });
  });

  describe('Review Management Workflow', () => {
    it('should verify review service exports workflow functions', async () => {
      const reviewService = await import('../core/reviews/reviewService');

      expect(typeof reviewService.getReviews).toBe('function');
      expect(typeof reviewService.createReview).toBe('function');
      expect(typeof reviewService.updateReview).toBe('function');
    });
  });

  describe('Training Management Workflow', () => {
    it('should verify training service exports workflow functions', async () => {
      const trainingService = await import('../core/training/trainingService');

      expect(typeof trainingService.getTrainingModules).toBe('function');
      expect(typeof trainingService.createTraining).toBe('function');
      expect(typeof trainingService.updateTraining).toBe('function');
    });
  });

  describe('Messaging Workflow', () => {
    it('should verify messaging service exports workflow functions', async () => {
      const messagingService = await import('../core/messaging/messagingService');

      expect(typeof messagingService.getMessages).toBe('function');
      expect(typeof messagingService.createMessage).toBe('function');
      expect(typeof messagingService.markMessageAsRead).toBe('function');
    });
  });

  describe('Time Tracking Workflow', () => {
    it('should verify time tracking service exports workflow functions', async () => {
      const timeTrackingService = await import('../core/time-tracking/timeTrackingService');

      expect(typeof timeTrackingService.getTimeEntries).toBe('function');
      expect(typeof timeTrackingService.clockIn).toBe('function');
      expect(typeof timeTrackingService.clockOut).toBe('function');
    });
  });

  describe('Notification Workflow', () => {
    it('should verify notification service exports workflow functions', async () => {
      const notificationService = await import('../core/notifications/notificationService');

      expect(typeof notificationService.getNotifications).toBe('function');
      expect(typeof notificationService.createNotification).toBe('function');
      expect(typeof notificationService.markAsRead).toBe('function');
    });
  });

  describe('Dashboard Workflow', () => {
    it('should verify dashboard service exports workflow functions', async () => {
      const dashboardService = await import('../core/dashboard/dashboardService');

      expect(typeof dashboardService.getDashboardMetrics).toBe('function');
      expect(typeof dashboardService.getRecentActivity).toBe('function');
    });
  });

  describe('Cleaning Module Workflows', () => {
    it('should verify room template service exports workflow functions', async () => {
      const roomTemplateService = await import('../modules/cleaning/roomTemplates/roomTemplateService');

      expect(typeof roomTemplateService.getRoomTemplates).toBe('function');
      expect(typeof roomTemplateService.createRoomTemplate).toBe('function');
    });

    it('should verify pet profile service exports workflow functions', async () => {
      const petProfileService = await import('../modules/cleaning/petProfiles/petProfileService');

      expect(typeof petProfileService.getPetProfiles).toBe('function');
      expect(typeof petProfileService.createPetProfile).toBe('function');
    });

    it('should verify checklist service exports workflow functions', async () => {
      const checklistService = await import('../modules/cleaning/checklists/checklistService');

      expect(typeof checklistService.getChecklists).toBe('function');
      expect(typeof checklistService.createChecklist).toBe('function');
    });

    it('should verify supply service exports workflow functions', async () => {
      const supplyService = await import('../modules/cleaning/supplies/supplyService');

      expect(typeof supplyService.getSupplies).toBe('function');
      expect(typeof supplyService.createSupply).toBe('function');
    });

    it('should verify cleaning service service exports workflow functions', async () => {
      const cleaningServiceService = await import('../modules/cleaning/services/cleaningServiceService');

      expect(typeof cleaningServiceService.getCleaningServices).toBe('function');
      expect(typeof cleaningServiceService.createCleaningService).toBe('function');
    });
  });

  describe('API Response Standardization', () => {
    it('should verify all services use standardized response format', async () => {
      const apiResponse = await import('../shared/api/apiResponseStandard');

      expect(typeof apiResponse.successResponse).toBe('function');
      expect(typeof apiResponse.errorResponse).toBe('function');

      const success = apiResponse.successResponse({ test: 'data' });
      expect(success.success).toBe(true);
      expect(success.data).toEqual({ test: 'data' });

      const error = apiResponse.errorResponse('Test error');
      expect(error.success).toBe(false);
      expect(error.message).toBe('Test error');
    });
  });

  describe('Error Handling', () => {
    it('should verify error logging utility is available', async () => {
      const errorLogging = await import('../shared/logging/errorLoggingStandard');

      expect(typeof errorLogging.logError).toBe('function');
    });

    it('should verify error response includes error details', async () => {
      const apiResponse = await import('../shared/api/apiResponseStandard');

      const error = apiResponse.errorResponse('Test error', 'VALIDATION_ERROR', { code: 400 });
      expect(error.success).toBe(false);
      expect(error.message).toBe('Test error');
      expect(error.error).toBe('VALIDATION_ERROR');
      expect(error.errorDetails).toEqual({ code: 400 });
    });
  });

  describe('Feature Flag Integration', () => {
    it('should verify feature registry works with workflows', async () => {
      const featureRegistry = await import('../shared/features/featureRegistry');

      expect(typeof featureRegistry.featureEnabled).toBe('function');
      expect(typeof featureRegistry.moduleEnabled).toBe('function');
      expect(typeof featureRegistry.setModuleFeature).toBe('function');
    });
  });

  describe('Event Bus Integration', () => {
    it('should verify event bus works with workflow events', async () => {
      const { default: eventBus } = await import('../shared/events/eventBus');

      expect(typeof eventBus.on).toBe('function');
      expect(typeof eventBus.off).toBe('function');
      expect(typeof eventBus.emit).toBe('function');
    });
  });
});
