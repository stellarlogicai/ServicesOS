/**
 * Seed Data System
 * 
 * Rules from FutureProofing.md:
 * - Seed data helps new developers get started quickly
 * - Provides demo data for testing and wife beta
 * - Creates consistent test environments
 * 
 * Benefits:
 * - New Developer: git clone → seed database → app works
 * - Wife Beta: Need Test Customer → Already Exists
 * - Testing: Need 100 fake customers → Run Seeder
 */

import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { addSchemaVersion } from '../schemas/schemaVersioning';
import { successResponse, errorResponse } from '../api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../logging/errorLoggingStandard';

/**
 * Seed a new tenant with demo data
 * @param {string} tenantId - The tenant ID
 * @param {string} moduleName - The module name (e.g., 'cleaning')
 * @returns {Promise<object>} - Standardized API response
 */
export async function seedTenant(tenantId, moduleName = 'cleaning') {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Create demo customers
    await seedDemoCustomers(tenantId);
    
    // Create demo employees
    await seedDemoEmployees(tenantId);
    
    // Create demo jobs
    await seedDemoJobs(tenantId);
    
    // Create demo leads
    await seedDemoLeads(tenantId);
    
    // Create demo estimates
    await seedDemoEstimates(tenantId);

    return successResponse({ tenantId, moduleName }, 'Tenant seeded successfully');
  } catch (error) {
    logError({
      message: 'Failed to seed tenant',
      module: 'shared',
      feature: 'seedData',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to seed tenant', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Seed demo customers
 * @param {string} tenantId - The tenant ID
 */
async function seedDemoCustomers(tenantId) {
  const demoCustomers = [
    {
      name: 'Sarah Johnson',
      email: 'sarah.johnson@example.com',
      phone: '555-0101',
      address: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
      notes: 'Prefers morning appointments, has a small dog'
    },
    {
      name: 'Michael Chen',
      email: 'michael.chen@example.com',
      phone: '555-0102',
      address: '456 Oak Ave',
      city: 'Springfield',
      state: 'IL',
      zip: '62702',
      notes: 'Regular customer, every other week'
    },
    {
      name: 'Emily Davis',
      email: 'emily.davis@example.com',
      phone: '555-0103',
      address: '789 Pine Rd',
      city: 'Springfield',
      state: 'IL',
      zip: '62703',
      notes: 'Allergic to certain cleaning products'
    },
    {
      name: 'Robert Wilson',
      email: 'robert.wilson@example.com',
      phone: '555-0104',
      address: '321 Elm St',
      city: 'Springfield',
      state: 'IL',
      zip: '62704',
      notes: 'Has a gate code: 1234'
    },
    {
      name: 'Jessica Brown',
      email: 'jessica.brown@example.com',
      phone: '555-0105',
      address: '654 Maple Dr',
      city: 'Springfield',
      state: 'IL',
      zip: '62705',
      notes: 'First-time customer, deep clean requested'
    }
  ];

  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  
  for (const customer of demoCustomers) {
    const customerWithVersion = addSchemaVersion(customer, 'CUSTOMER');
    await addDoc(customersRef, {
      ...customerWithVersion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
}

/**
 * Seed demo employees
 * @param {string} tenantId - The tenant ID
 */
async function seedDemoEmployees(tenantId) {
  const demoEmployees = [
    {
      name: 'Alex Thompson',
      email: 'alex.thompson@example.com',
      phone: '555-0201',
      role: 'cleaner',
      hourlyRate: 18.50,
      status: 'active',
      hireDate: '2024-01-15'
    },
    {
      name: 'Maria Garcia',
      email: 'maria.garcia@example.com',
      phone: '555-0202',
      role: 'cleaner',
      hourlyRate: 17.75,
      status: 'active',
      hireDate: '2024-02-01'
    },
    {
      name: 'James Miller',
      email: 'james.miller@example.com',
      phone: '555-0203',
      role: 'supervisor',
      hourlyRate: 22.00,
      status: 'active',
      hireDate: '2023-11-01'
    }
  ];

  const employeesRef = collection(db, 'tenants', tenantId, 'employees');
  
  for (const employee of demoEmployees) {
    const employeeWithVersion = addSchemaVersion(employee, 'EMPLOYEE');
    await addDoc(employeesRef, {
      ...employeeWithVersion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
}

/**
 * Seed demo jobs
 * @param {string} tenantId - The tenant ID
 */
async function seedDemoJobs(tenantId) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const formatDate = (date) => date.toISOString().split('T')[0];

  const demoJobs = [
    {
      customerId: 'demo_customer_1',
      date: formatDate(today),
      startTime: '09:00',
      endTime: '12:00',
      status: 'scheduled',
      serviceType: 'standard_clean',
      assignedEmployeeId: 'demo_employee_1',
      notes: 'Regular weekly cleaning'
    },
    {
      customerId: 'demo_customer_2',
      date: formatDate(tomorrow),
      startTime: '10:00',
      endTime: '14:00',
      status: 'scheduled',
      serviceType: 'deep_clean',
      assignedEmployeeId: 'demo_employee_2',
      notes: 'First deep clean for this customer'
    },
    {
      customerId: 'demo_customer_3',
      date: formatDate(today),
      startTime: '13:00',
      endTime: '16:00',
      status: 'in_progress',
      serviceType: 'standard_clean',
      assignedEmployeeId: 'demo_employee_1',
      notes: 'Customer allergic to certain products'
    }
  ];

  const jobsRef = collection(db, 'tenants', tenantId, 'bookings');
  
  for (const job of demoJobs) {
    const jobWithVersion = addSchemaVersion(job, 'JOB');
    await addDoc(jobsRef, {
      ...jobWithVersion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
}

/**
 * Seed demo leads
 * @param {string} tenantId - The tenant ID
 */
async function seedDemoLeads(tenantId) {
  const demoLeads = [
    {
      name: 'David Martinez',
      email: 'david.martinez@example.com',
      phone: '555-0301',
      address: '987 Cedar Ln',
      city: 'Springfield',
      state: 'IL',
      zip: '62706',
      status: 'new',
      source: 'website',
      notes: 'Interested in weekly cleaning service'
    },
    {
      name: 'Amanda White',
      email: 'amanda.white@example.com',
      phone: '555-0302',
      address: '246 Birch Way',
      city: 'Springfield',
      state: 'IL',
      zip: '62707',
      status: 'contacted',
      source: 'referral',
      notes: 'Referred by Sarah Johnson'
    }
  ];

  const leadsRef = collection(db, 'tenants', tenantId, 'leads');
  
  for (const lead of demoLeads) {
    const leadWithVersion = addSchemaVersion(lead, 'LEAD');
    await addDoc(leadsRef, {
      ...leadWithVersion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
}

/**
 * Seed demo estimates
 * @param {string} tenantId - The tenant ID
 */
async function seedDemoEstimates(tenantId) {
  const demoEstimates = [
    {
      customerId: 'demo_customer_4',
      status: 'sent',
      totalAmount: 185.00,
      bedrooms: 3,
      bathrooms: 2,
      squareFootage: 1800,
      serviceType: 'standard_clean',
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      customerId: 'demo_customer_5',
      status: 'accepted',
      totalAmount: 320.00,
      bedrooms: 4,
      bathrooms: 3,
      squareFootage: 2500,
      serviceType: 'deep_clean',
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  const estimatesRef = collection(db, 'tenants', tenantId, 'quotes');
  
  for (const estimate of demoEstimates) {
    const estimateWithVersion = addSchemaVersion(estimate, 'ESTIMATE');
    await addDoc(estimatesRef, {
      ...estimateWithVersion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
}

/**
 * Clear all seed data for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function clearSeedData(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // TODO: Implement deletion of seed data
    // This would require identifying which documents were created by seeding
    // and deleting them selectively
    
    return successResponse({ tenantId }, 'Seed data cleared (not yet implemented)');
  } catch (error) {
    logError({
      message: 'Failed to clear seed data',
      module: 'shared',
      feature: 'seedData',
      severity: SEVERITY.MEDIUM,
      tenantId,
      error
    });
    return errorResponse('Failed to clear seed data', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}
