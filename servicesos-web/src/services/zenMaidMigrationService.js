// src/services/zenMaidMigrationService.js
/**
 * ZenMaid Migration Service
 * Migrates clients, schedules, and employees from ZenMaid
 */

import { collection, addDoc, doc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Parse ZenMaid CSV for clients
 * @param {string} csvContent - CSV content from ZenMaid
 * @returns {Array} Parsed client data
 */
export function parseZenMaidClientsCSV(csvContent) {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  const clients = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const client = {};
    
    headers.forEach((header, index) => {
      client[header] = values[index] || '';
    });
    
    // Map ZenMaid fields to our schema
    clients.push({
      name: client['Client Name'] || client['Name'] || '',
      email: client['Email'] || '',
      phone: client['Phone'] || client['Mobile'] || '',
      address: client['Address'] || client['Billing Address'] || '',
      city: client['City'] || '',
      state: client['State'] || '',
      zip: client['Zip'] || client['Postal Code'] || '',
      notes: client['Notes'] || client['Comments'] || '',
      zenMaidId: client['Client ID'] || client['Id'] || '',
      createdAt: new Date().toISOString()
    });
  }
  
  return clients;
}

/**
 * Parse ZenMaid CSV for schedules
 * @param {string} csvContent - CSV content from ZenMaid
 * @returns {Array} Parsed schedule data
 */
export function parseZenMaidSchedulesCSV(csvContent) {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  const schedules = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const schedule = {};
    
    headers.forEach((header, index) => {
      schedule[header] = values[index] || '';
    });
    
    // Map ZenMaid fields to our schema
    schedules.push({
      eventName: schedule['Service'] || schedule['Job Type'] || '',
      customerName: schedule['Client Name'] || schedule['Customer'] || '',
      customerEmail: schedule['Email'] || '',
      customerPhone: schedule['Phone'] || '',
      startDate: schedule['Date'] || schedule['Start Date'] || '',
      startTime: schedule['Start Time'] || '',
      endDate: schedule['End Date'] || '',
      endTime: schedule['End Time'] || '',
      duration: schedule['Duration'] || '',
      status: schedule['Status'] || 'scheduled',
      location: schedule['Address'] || schedule['Location'] || '',
      notes: schedule['Notes'] || schedule['Description'] || '',
      zenMaidId: schedule['Schedule ID'] || schedule['Id'] || '',
      createdAt: new Date().toISOString()
    });
  }
  
  return schedules;
}

/**
 * Parse ZenMaid CSV for employees
 * @param {string} csvContent - CSV content from ZenMaid
 * @returns {Array} Parsed employee data
 */
export function parseZenMaidEmployeesCSV(csvContent) {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  const employees = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const employee = {};
    
    headers.forEach((header, index) => {
      employee[header] = values[index] || '';
    });
    
    // Map ZenMaid fields to our schema
    employees.push({
      name: employee['Employee Name'] || employee['Name'] || '',
      email: employee['Email'] || '',
      phone: employee['Phone'] || employee['Mobile'] || '',
      hourlyRate: parseFloat(employee['Hourly Rate'] || employee['Rate'] || 0),
      availability: employee['Availability'] || 'available',
      homeAddress: employee['Home Address'] || employee['Address'] || '',
      serviceRadius: parseFloat(employee['Service Radius'] || employee['Radius'] || 0),
      maxDailyHours: parseFloat(employee['Max Daily Hours'] || employee['Max Hours'] || 8),
      notes: employee['Notes'] || employee['Comments'] || '',
      zenMaidId: employee['Employee ID'] || employee['Id'] || '',
      createdAt: new Date().toISOString()
    });
  }
  
  return employees;
}

/**
 * Import clients from ZenMaid
 * @param {string} tenantId - Tenant ID
 * @param {Array} clients - Parsed client data
 * @param {string} duplicateHandling - How to handle duplicates (skip, merge, replace)
 * @returns {Promise<Object>} Import results
 */
export async function importZenMaidClients(tenantId, clients, duplicateHandling = 'skip') {
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  
  let imported = 0;
  let skipped = 0;
  let merged = 0;
  let replaced = 0;
  let errors = [];
  
  for (const client of clients) {
    try {
      // Check for existing customer by zenMaidId or email
      let existingDoc = null;
      
      if (client.zenMaidId) {
        const q = query(customersRef, where('zenMaidId', '==', client.zenMaidId));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          existingDoc = querySnap.docs[0];
        }
      }
      
      if (!existingDoc && client.email) {
        const q = query(customersRef, where('email', '==', client.email));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          existingDoc = querySnap.docs[0];
        }
      }
      
      if (existingDoc) {
        if (duplicateHandling === 'skip') {
          skipped++;
        } else if (duplicateHandling === 'merge') {
          await setDoc(doc(customersRef, existingDoc.id), {
            ...existingDoc.data(),
            ...client,
            zenMaidId: client.zenMaidId || existingDoc.data().zenMaidId
          }, { merge: true });
          merged++;
        } else if (duplicateHandling === 'replace') {
          await setDoc(doc(customersRef, existingDoc.id), client);
          replaced++;
        }
      } else {
        await addDoc(customersRef, client);
        imported++;
      }
    } catch (error) {
      errors.push({ client: client.name, error: error.message });
    }
  }
  
  return {
    total: clients.length,
    imported,
    skipped,
    merged,
    replaced,
    errors
  };
}

/**
 * Import schedules from ZenMaid
 * @param {string} tenantId - Tenant ID
 * @param {Array} schedules - Parsed schedule data
 * @param {string} duplicateHandling - How to handle duplicates (skip, merge, replace)
 * @returns {Promise<Object>} Import results
 */
export async function importZenMaidSchedules(tenantId, schedules, duplicateHandling = 'skip') {
  const appointmentsRef = collection(db, 'tenants', tenantId, 'appointments');
  
  let imported = 0;
  let skipped = 0;
  let merged = 0;
  let replaced = 0;
  let errors = [];
  
  for (const schedule of schedules) {
    try {
      // Check for existing appointment by zenMaidId
      let existingDoc = null;
      
      if (schedule.zenMaidId) {
        const q = query(appointmentsRef, where('zenMaidId', '==', schedule.zenMaidId));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          existingDoc = querySnap.docs[0];
        }
      }
      
      if (existingDoc) {
        if (duplicateHandling === 'skip') {
          skipped++;
        } else if (duplicateHandling === 'merge') {
          await setDoc(doc(appointmentsRef, existingDoc.id), {
            ...existingDoc.data(),
            ...schedule,
            zenMaidId: schedule.zenMaidId || existingDoc.data().zenMaidId
          }, { merge: true });
          merged++;
        } else if (duplicateHandling === 'replace') {
          await setDoc(doc(appointmentsRef, existingDoc.id), schedule);
          replaced++;
        }
      } else {
        await addDoc(appointmentsRef, schedule);
        imported++;
      }
    } catch (error) {
      errors.push({ schedule: schedule.eventName, error: error.message });
    }
  }
  
  return {
    total: schedules.length,
    imported,
    skipped,
    merged,
    replaced,
    errors
  };
}

/**
 * Import employees from ZenMaid
 * @param {string} tenantId - Tenant ID
 * @param {Array} employees - Parsed employee data
 * @param {string} duplicateHandling - How to handle duplicates (skip, merge, replace)
 * @returns {Promise<Object>} Import results
 */
export async function importZenMaidEmployees(tenantId, employees, duplicateHandling = 'skip') {
  const employeesRef = collection(db, 'tenants', tenantId, 'employees');
  
  let imported = 0;
  let skipped = 0;
  let merged = 0;
  let replaced = 0;
  let errors = [];
  
  for (const employee of employees) {
    try {
      // Check for existing employee by zenMaidId or email
      let existingDoc = null;
      
      if (employee.zenMaidId) {
        const q = query(employeesRef, where('zenMaidId', '==', employee.zenMaidId));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          existingDoc = querySnap.docs[0];
        }
      }
      
      if (!existingDoc && employee.email) {
        const q = query(employeesRef, where('email', '==', employee.email));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          existingDoc = querySnap.docs[0];
        }
      }
      
      if (existingDoc) {
        if (duplicateHandling === 'skip') {
          skipped++;
        } else if (duplicateHandling === 'merge') {
          await setDoc(doc(employeesRef, existingDoc.id), {
            ...existingDoc.data(),
            ...employee,
            zenMaidId: employee.zenMaidId || existingDoc.data().zenMaidId
          }, { merge: true });
          merged++;
        } else if (duplicateHandling === 'replace') {
          await setDoc(doc(employeesRef, existingDoc.id), employee);
          replaced++;
        }
      } else {
        await addDoc(employeesRef, employee);
        imported++;
      }
    } catch (error) {
      errors.push({ employee: employee.name, error: error.message });
    }
  }
  
  return {
    total: employees.length,
    imported,
    skipped,
    merged,
    replaced,
    errors
  };
}
