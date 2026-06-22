// src/services/housecallProMigrationService.js
/**
 * Housecall Pro Migration Service
 * Migrates customers, appointments, invoices, and recurring services from Housecall Pro
 */

import { collection, addDoc, doc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Parse Housecall Pro CSV for customers
 * @param {string} csvContent - CSV content from Housecall Pro
 * @returns {Array} Parsed customer data
 */
export function parseHousecallProCustomersCSV(csvContent) {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  const customers = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const customer = {};
    
    headers.forEach((header, index) => {
      customer[header] = values[index] || '';
    });
    
    // Map Housecall Pro fields to our schema
    customers.push({
      name: customer['Customer Name'] || customer['Name'] || '',
      email: customer['Email'] || '',
      phone: customer['Phone'] || customer['Mobile'] || '',
      address: customer['Address'] || customer['Billing Address'] || '',
      city: customer['City'] || '',
      state: customer['State'] || '',
      zip: customer['Zip'] || customer['Postal Code'] || '',
      notes: customer['Notes'] || customer['Comments'] || '',
      housecallProId: customer['Customer ID'] || customer['Id'] || '',
      createdAt: new Date().toISOString()
    });
  }
  
  return customers;
}

/**
 * Parse Housecall Pro CSV for appointments
 * @param {string} csvContent - CSV content from Housecall Pro
 * @returns {Array} Parsed appointment data
 */
export function parseHousecallProAppointmentsCSV(csvContent) {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  const appointments = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const appointment = {};
    
    headers.forEach((header, index) => {
      appointment[header] = values[index] || '';
    });
    
    // Map Housecall Pro fields to our schema
    appointments.push({
      eventName: appointment['Service'] || appointment['Job Type'] || '',
      customerName: appointment['Customer Name'] || appointment['Customer'] || '',
      customerEmail: appointment['Email'] || '',
      customerPhone: appointment['Phone'] || '',
      startDate: appointment['Date'] || appointment['Start Date'] || '',
      startTime: appointment['Start Time'] || '',
      endDate: appointment['End Date'] || '',
      endTime: appointment['End Time'] || '',
      duration: appointment['Duration'] || '',
      status: appointment['Status'] || 'scheduled',
      location: appointment['Address'] || appointment['Location'] || '',
      notes: appointment['Notes'] || appointment['Description'] || '',
      housecallProId: appointment['Appointment ID'] || appointment['Id'] || '',
      createdAt: new Date().toISOString()
    });
  }
  
  return appointments;
}

/**
 * Parse Housecall Pro CSV for invoices
 * @param {string} csvContent - CSV content from Housecall Pro
 * @returns {Array} Parsed invoice data
 */
export function parseHousecallProInvoicesCSV(csvContent) {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  const invoices = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const invoice = {};
    
    headers.forEach((header, index) => {
      invoice[header] = values[index] || '';
    });
    
    // Map Housecall Pro fields to our schema
    invoices.push({
      invoiceNumber: invoice['Invoice #'] || invoice['Number'] || '',
      customerName: invoice['Customer Name'] || invoice['Customer'] || '',
      date: invoice['Date'] || invoice['Invoice Date'] || new Date().toISOString().split('T')[0],
      dueDate: invoice['Due Date'] || '',
      amount: parseFloat(invoice['Amount'] || invoice['Total'] || 0),
      balance: parseFloat(invoice['Balance'] || invoice['Balance Due'] || 0),
      status: invoice['Status'] || (parseFloat(invoice['Balance'] || 0) > 0 ? 'pending' : 'paid'),
      housecallProId: invoice['Invoice ID'] || invoice['Id'] || '',
      notes: invoice['Notes'] || invoice['Memo'] || '',
      createdAt: new Date().toISOString()
    });
  }
  
  return invoices;
}

/**
 * Parse Housecall Pro CSV for recurring services
 * @param {string} csvContent - CSV content from Housecall Pro
 * @returns {Array} Parsed recurring service data
 */
export function parseHousecallProRecurringCSV(csvContent) {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  const recurringServices = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const recurring = {};
    
    headers.forEach((header, index) => {
      recurring[header] = values[index] || '';
    });
    
    // Map Housecall Pro fields to our schema
    recurringServices.push({
      customerName: recurring['Customer Name'] || recurring['Customer'] || '',
      serviceName: recurring['Service'] || recurring['Job Type'] || '',
      frequency: recurring['Frequency'] || recurring['Schedule'] || 'monthly',
      amount: parseFloat(recurring['Amount'] || recurring['Price'] || 0),
      startDate: recurring['Start Date'] || new Date().toISOString().split('T')[0],
      nextDate: recurring['Next Date'] || '',
      status: recurring['Status'] || 'active',
      housecallProId: recurring['Recurring ID'] || recurring['Id'] || '',
      notes: recurring['Notes'] || recurring['Memo'] || '',
      createdAt: new Date().toISOString()
    });
  }
  
  return recurringServices;
}

/**
 * Import customers from Housecall Pro
 * @param {string} tenantId - Tenant ID
 * @param {Array} customers - Parsed customer data
 * @param {string} duplicateHandling - How to handle duplicates (skip, merge, replace)
 * @returns {Promise<Object>} Import results
 */
export async function importHousecallProCustomers(tenantId, customers, duplicateHandling = 'skip') {
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  
  let imported = 0;
  let skipped = 0;
  let merged = 0;
  let replaced = 0;
  let errors = [];
  
  for (const customer of customers) {
    try {
      // Check for existing customer by housecallProId or email
      let existingDoc = null;
      
      if (customer.housecallProId) {
        const q = query(customersRef, where('housecallProId', '==', customer.housecallProId));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          existingDoc = querySnap.docs[0];
        }
      }
      
      if (!existingDoc && customer.email) {
        const q = query(customersRef, where('email', '==', customer.email));
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
            ...customer,
            housecallProId: customer.housecallProId || existingDoc.data().housecallProId
          }, { merge: true });
          merged++;
        } else if (duplicateHandling === 'replace') {
          await setDoc(doc(customersRef, existingDoc.id), customer);
          replaced++;
        }
      } else {
        await addDoc(customersRef, customer);
        imported++;
      }
    } catch (error) {
      errors.push({ customer: customer.name, error: error.message });
    }
  }
  
  return {
    total: customers.length,
    imported,
    skipped,
    merged,
    replaced,
    errors
  };
}

/**
 * Import appointments from Housecall Pro
 * @param {string} tenantId - Tenant ID
 * @param {Array} appointments - Parsed appointment data
 * @param {string} duplicateHandling - How to handle duplicates (skip, merge, replace)
 * @returns {Promise<Object>} Import results
 */
export async function importHousecallProAppointments(tenantId, appointments, duplicateHandling = 'skip') {
  const appointmentsRef = collection(db, 'tenants', tenantId, 'appointments');
  
  let imported = 0;
  let skipped = 0;
  let merged = 0;
  let replaced = 0;
  let errors = [];
  
  for (const appointment of appointments) {
    try {
      // Check for existing appointment by housecallProId
      let existingDoc = null;
      
      if (appointment.housecallProId) {
        const q = query(appointmentsRef, where('housecallProId', '==', appointment.housecallProId));
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
            ...appointment,
            housecallProId: appointment.housecallProId || existingDoc.data().housecallProId
          }, { merge: true });
          merged++;
        } else if (duplicateHandling === 'replace') {
          await setDoc(doc(appointmentsRef, existingDoc.id), appointment);
          replaced++;
        }
      } else {
        await addDoc(appointmentsRef, appointment);
        imported++;
      }
    } catch (error) {
      errors.push({ appointment: appointment.eventName, error: error.message });
    }
  }
  
  return {
    total: appointments.length,
    imported,
    skipped,
    merged,
    replaced,
    errors
  };
}

/**
 * Import invoices from Housecall Pro
 * @param {string} tenantId - Tenant ID
 * @param {Array} invoices - Parsed invoice data
 * @param {string} duplicateHandling - How to handle duplicates (skip, merge, replace)
 * @returns {Promise<Object>} Import results
 */
export async function importHousecallProInvoices(tenantId, invoices, duplicateHandling = 'skip') {
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  
  let imported = 0;
  let skipped = 0;
  let merged = 0;
  let replaced = 0;
  let errors = [];
  
  for (const invoice of invoices) {
    try {
      // Check for existing invoice by housecallProId or invoiceNumber
      let existingDoc = null;
      
      if (invoice.housecallProId) {
        const q = query(invoicesRef, where('housecallProId', '==', invoice.housecallProId));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          existingDoc = querySnap.docs[0];
        }
      }
      
      if (!existingDoc && invoice.invoiceNumber) {
        const q = query(invoicesRef, where('invoiceNumber', '==', invoice.invoiceNumber));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          existingDoc = querySnap.docs[0];
        }
      }
      
      if (existingDoc) {
        if (duplicateHandling === 'skip') {
          skipped++;
        } else if (duplicateHandling === 'merge') {
          await setDoc(doc(invoicesRef, existingDoc.id), {
            ...existingDoc.data(),
            ...invoice,
            housecallProId: invoice.housecallProId || existingDoc.data().housecallProId
          }, { merge: true });
          merged++;
        } else if (duplicateHandling === 'replace') {
          await setDoc(doc(invoicesRef, existingDoc.id), invoice);
          replaced++;
        }
      } else {
        await addDoc(invoicesRef, invoice);
        imported++;
      }
    } catch (error) {
      errors.push({ invoice: invoice.invoiceNumber, error: error.message });
    }
  }
  
  return {
    total: invoices.length,
    imported,
    skipped,
    merged,
    replaced,
    errors
  };
}

/**
 * Import recurring services from Housecall Pro
 * @param {string} tenantId - Tenant ID
 * @param {Array} recurringServices - Parsed recurring service data
 * @param {string} duplicateHandling - How to handle duplicates (skip, merge, replace)
 * @returns {Promise<Object>} Import results
 */
export async function importHousecallProRecurring(tenantId, recurringServices, duplicateHandling = 'skip') {
  const recurringRef = collection(db, 'tenants', tenantId, 'recurring_services');
  
  let imported = 0;
  let skipped = 0;
  let merged = 0;
  let replaced = 0;
  let errors = [];
  
  for (const recurring of recurringServices) {
    try {
      // Check for existing recurring service by housecallProId
      let existingDoc = null;
      
      if (recurring.housecallProId) {
        const q = query(recurringRef, where('housecallProId', '==', recurring.housecallProId));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          existingDoc = querySnap.docs[0];
        }
      }
      
      if (existingDoc) {
        if (duplicateHandling === 'skip') {
          skipped++;
        } else if (duplicateHandling === 'merge') {
          await setDoc(doc(recurringRef, existingDoc.id), {
            ...existingDoc.data(),
            ...recurring,
            housecallProId: recurring.housecallProId || existingDoc.data().housecallProId
          }, { merge: true });
          merged++;
        } else if (duplicateHandling === 'replace') {
          await setDoc(doc(recurringRef, existingDoc.id), recurring);
          replaced++;
        }
      } else {
        await addDoc(recurringRef, recurring);
        imported++;
      }
    } catch (error) {
      errors.push({ service: recurring.serviceName, error: error.message });
    }
  }
  
  return {
    total: recurringServices.length,
    imported,
    skipped,
    merged,
    replaced,
    errors
  };
}
