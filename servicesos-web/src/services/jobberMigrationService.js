// src/services/jobberMigrationService.js
/**
 * Jobber Migration Service
 * Migrates customers, jobs, invoices, and payments from Jobber
 */

import { collection, addDoc, doc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Parse Jobber CSV for customers
 * @param {string} csvContent - CSV content from Jobber
 * @returns {Array} Parsed customer data
 */
export function parseJobberCustomersCSV(csvContent) {
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
    
    // Map Jobber fields to our schema
    customers.push({
      name: customer['Client Name'] || customer['Name'] || '',
      email: customer['Email'] || '',
      phone: customer['Phone'] || customer['Mobile'] || '',
      address: customer['Address'] || customer['Billing Address'] || '',
      city: customer['City'] || '',
      state: customer['State'] || '',
      zip: customer['Zip'] || customer['Postal Code'] || '',
      notes: customer['Notes'] || customer['Comments'] || '',
      jobberId: customer['Client ID'] || customer['Id'] || '',
      createdAt: new Date().toISOString()
    });
  }
  
  return customers;
}

/**
 * Parse Jobber CSV for jobs
 * @param {string} csvContent - CSV content from Jobber
 * @returns {Array} Parsed job data
 */
export function parseJobberJobsCSV(csvContent) {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  const jobs = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const job = {};
    
    headers.forEach((header, index) => {
      job[header] = values[index] || '';
    });
    
    // Map Jobber fields to our schema
    jobs.push({
      jobId: job['Job ID'] || job['Id'] || '',
      customerName: job['Client Name'] || job['Customer'] || '',
      title: job['Title'] || job['Job Name'] || '',
      date: job['Date'] || job['Scheduled Date'] || new Date().toISOString().split('T')[0],
      startTime: job['Start Time'] || '',
      endTime: job['End Time'] || '',
      estimatedHours: parseFloat(job['Estimated Hours'] || job['Duration'] || 0),
      status: job['Status'] || 'scheduled',
      address: job['Address'] || job['Location'] || '',
      notes: job['Notes'] || job['Description'] || '',
      jobberId: job['Job ID'] || job['Id'] || '',
      createdAt: new Date().toISOString()
    });
  }
  
  return jobs;
}

/**
 * Parse Jobber CSV for invoices
 * @param {string} csvContent - CSV content from Jobber
 * @returns {Array} Parsed invoice data
 */
export function parseJobberInvoicesCSV(csvContent) {
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
    
    // Map Jobber fields to our schema
    invoices.push({
      invoiceNumber: invoice['Invoice #'] || invoice['Number'] || '',
      customerName: invoice['Client Name'] || invoice['Customer'] || '',
      date: invoice['Date'] || invoice['Invoice Date'] || new Date().toISOString().split('T')[0],
      dueDate: invoice['Due Date'] || '',
      amount: parseFloat(invoice['Amount'] || invoice['Total'] || 0),
      balance: parseFloat(invoice['Balance'] || invoice['Balance Due'] || 0),
      status: invoice['Status'] || (parseFloat(invoice['Balance'] || 0) > 0 ? 'pending' : 'paid'),
      jobberId: invoice['Invoice ID'] || invoice['Id'] || '',
      notes: invoice['Notes'] || invoice['Memo'] || '',
      createdAt: new Date().toISOString()
    });
  }
  
  return invoices;
}

/**
 * Parse Jobber CSV for payments
 * @param {string} csvContent - CSV content from Jobber
 * @returns {Array} Parsed payment data
 */
export function parseJobberPaymentsCSV(csvContent) {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  const payments = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const payment = {};
    
    headers.forEach((header, index) => {
      payment[header] = values[index] || '';
    });
    
    // Map Jobber fields to our schema
    payments.push({
      paymentNumber: payment['Payment #'] || payment['Number'] || '',
      customerName: payment['Client Name'] || payment['Customer'] || '',
      date: payment['Date'] || payment['Payment Date'] || new Date().toISOString().split('T')[0],
      amount: parseFloat(payment['Amount'] || payment['Total'] || 0),
      method: payment['Payment Method'] || payment['Type'] || '',
      reference: payment['Reference #'] || payment['RefNumber'] || '',
      invoiceNumber: payment['Invoice #'] || payment['Invoice Number'] || '',
      jobberId: payment['Payment ID'] || payment['Id'] || '',
      notes: payment['Notes'] || payment['Memo'] || '',
      createdAt: new Date().toISOString()
    });
  }
  
  return payments;
}

/**
 * Import customers from Jobber
 * @param {string} tenantId - Tenant ID
 * @param {Array} customers - Parsed customer data
 * @param {string} duplicateHandling - How to handle duplicates (skip, merge, replace)
 * @returns {Promise<Object>} Import results
 */
export async function importJobberCustomers(tenantId, customers, duplicateHandling = 'skip') {
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  
  let imported = 0;
  let skipped = 0;
  let merged = 0;
  let replaced = 0;
  let errors = [];
  
  for (const customer of customers) {
    try {
      // Check for existing customer by jobberId or email
      let existingDoc = null;
      
      if (customer.jobberId) {
        const q = query(customersRef, where('jobberId', '==', customer.jobberId));
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
            jobberId: customer.jobberId || existingDoc.data().jobberId
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
 * Import jobs from Jobber
 * @param {string} tenantId - Tenant ID
 * @param {Array} jobs - Parsed job data
 * @param {string} duplicateHandling - How to handle duplicates (skip, merge, replace)
 * @returns {Promise<Object>} Import results
 */
export async function importJobberJobs(tenantId, jobs, duplicateHandling = 'skip') {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  
  let imported = 0;
  let skipped = 0;
  let merged = 0;
  let replaced = 0;
  let errors = [];
  
  for (const job of jobs) {
    try {
      // Check for existing job by jobberId or jobId
      let existingDoc = null;
      
      if (job.jobberId) {
        const q = query(jobsRef, where('jobberId', '==', job.jobberId));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          existingDoc = querySnap.docs[0];
        }
      }
      
      if (!existingDoc && job.jobId) {
        const q = query(jobsRef, where('jobId', '==', job.jobId));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          existingDoc = querySnap.docs[0];
        }
      }
      
      if (existingDoc) {
        if (duplicateHandling === 'skip') {
          skipped++;
        } else if (duplicateHandling === 'merge') {
          await setDoc(doc(jobsRef, existingDoc.id), {
            ...existingDoc.data(),
            ...job,
            jobberId: job.jobberId || existingDoc.data().jobberId
          }, { merge: true });
          merged++;
        } else if (duplicateHandling === 'replace') {
          await setDoc(doc(jobsRef, existingDoc.id), job);
          replaced++;
        }
      } else {
        await addDoc(jobsRef, job);
        imported++;
      }
    } catch (error) {
      errors.push({ job: job.title, error: error.message });
    }
  }
  
  return {
    total: jobs.length,
    imported,
    skipped,
    merged,
    replaced,
    errors
  };
}

/**
 * Import invoices from Jobber
 * @param {string} tenantId - Tenant ID
 * @param {Array} invoices - Parsed invoice data
 * @param {string} duplicateHandling - How to handle duplicates (skip, merge, replace)
 * @returns {Promise<Object>} Import results
 */
export async function importJobberInvoices(tenantId, invoices, duplicateHandling = 'skip') {
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  
  let imported = 0;
  let skipped = 0;
  let merged = 0;
  let replaced = 0;
  let errors = [];
  
  for (const invoice of invoices) {
    try {
      // Check for existing invoice by jobberId or invoiceNumber
      let existingDoc = null;
      
      if (invoice.jobberId) {
        const q = query(invoicesRef, where('jobberId', '==', invoice.jobberId));
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
            jobberId: invoice.jobberId || existingDoc.data().jobberId
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
 * Import payments from Jobber
 * @param {string} tenantId - Tenant ID
 * @param {Array} payments - Parsed payment data
 * @param {string} duplicateHandling - How to handle duplicates (skip, merge, replace)
 * @returns {Promise<Object>} Import results
 */
export async function importJobberPayments(tenantId, payments, duplicateHandling = 'skip') {
  const paymentsRef = collection(db, 'tenants', tenantId, 'payments');
  
  let imported = 0;
  let skipped = 0;
  let merged = 0;
  let replaced = 0;
  let errors = [];
  
  for (const payment of payments) {
    try {
      // Check for existing payment by jobberId or paymentNumber
      let existingDoc = null;
      
      if (payment.jobberId) {
        const q = query(paymentsRef, where('jobberId', '==', payment.jobberId));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          existingDoc = querySnap.docs[0];
        }
      }
      
      if (!existingDoc && payment.paymentNumber) {
        const q = query(paymentsRef, where('paymentNumber', '==', payment.paymentNumber));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          existingDoc = querySnap.docs[0];
        }
      }
      
      if (existingDoc) {
        if (duplicateHandling === 'skip') {
          skipped++;
        } else if (duplicateHandling === 'merge') {
          await setDoc(doc(paymentsRef, existingDoc.id), {
            ...existingDoc.data(),
            ...payment,
            jobberId: payment.jobberId || existingDoc.data().jobberId
          }, { merge: true });
          merged++;
        } else if (duplicateHandling === 'replace') {
          await setDoc(doc(paymentsRef, existingDoc.id), payment);
          replaced++;
        }
      } else {
        await addDoc(paymentsRef, payment);
        imported++;
      }
    } catch (error) {
      errors.push({ payment: payment.paymentNumber, error: error.message });
    }
  }
  
  return {
    total: payments.length,
    imported,
    skipped,
    merged,
    replaced,
    errors
  };
}
