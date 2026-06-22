// src/services/quickBooksCSVImportService.js
/**
 * QuickBooks CSV Import Service
 * Imports customers, invoices, payments, and recurring services from QuickBooks CSV exports
 */

import { collection, addDoc, doc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Parse QuickBooks CSV for customers
 * @param {string} csvContent - CSV content from QuickBooks
 * @returns {Array} Parsed customer data
 */
export function parseQuickBooksCustomersCSV(csvContent) {
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
    
    // Map QuickBooks fields to our schema
    customers.push({
      name: customer['Customer'] || customer['Name'] || '',
      email: customer['Email'] || '',
      phone: customer['Phone'] || customer['Mobile'] || '',
      address: customer['Billing Address'] || '',
      city: customer['City'] || '',
      state: customer['State'] || '',
      zip: customer['Zip'] || customer['Postal Code'] || '',
      notes: customer['Notes'] || '',
      quickBooksId: customer['Customer ID'] || customer['Id'] || '',
      createdAt: new Date().toISOString()
    });
  }
  
  return customers;
}

/**
 * Parse QuickBooks CSV for invoices
 * @param {string} csvContent - CSV content from QuickBooks
 * @returns {Array} Parsed invoice data
 */
export function parseQuickBooksInvoicesCSV(csvContent) {
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
    
    // Map QuickBooks fields to our schema
    invoices.push({
      invoiceNumber: invoice['Invoice #'] || invoice['Num'] || '',
      customerName: invoice['Customer'] || invoice['Name'] || '',
      date: invoice['Date'] || invoice['Invoice Date'] || new Date().toISOString().split('T')[0],
      dueDate: invoice['Due Date'] || '',
      amount: parseFloat(invoice['Amount'] || invoice['Total'] || 0),
      balance: parseFloat(invoice['Balance'] || invoice['Balance Due'] || 0),
      status: invoice['Status'] || (parseFloat(invoice['Balance'] || 0) > 0 ? 'pending' : 'paid'),
      quickBooksId: invoice['Invoice ID'] || invoice['Id'] || '',
      lineItems: invoice['Line Items'] || '',
      notes: invoice['Memo'] || invoice['Notes'] || '',
      createdAt: new Date().toISOString()
    });
  }
  
  return invoices;
}

/**
 * Parse QuickBooks CSV for payments
 * @param {string} csvContent - CSV content from QuickBooks
 * @returns {Array} Parsed payment data
 */
export function parseQuickBooksPaymentsCSV(csvContent) {
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
    
    // Map QuickBooks fields to our schema
    payments.push({
      paymentNumber: payment['Payment #'] || payment['Num'] || '',
      customerName: payment['Customer'] || payment['Name'] || '',
      date: payment['Date'] || payment['Payment Date'] || new Date().toISOString().split('T')[0],
      amount: parseFloat(payment['Amount'] || payment['Total'] || 0),
      method: payment['Payment Method'] || payment['Type'] || '',
      reference: payment['Reference #'] || payment['RefNumber'] || '',
      invoiceNumber: payment['Invoice #'] || payment['Invoice Number'] || '',
      quickBooksId: payment['Payment ID'] || payment['Id'] || '',
      notes: payment['Memo'] || payment['Notes'] || '',
      createdAt: new Date().toISOString()
    });
  }
  
  return payments;
}

/**
 * Parse QuickBooks CSV for recurring services
 * @param {string} csvContent - CSV content from QuickBooks
 * @returns {Array} Parsed recurring service data
 */
export function parseQuickBooksRecurringCSV(csvContent) {
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
    
    // Map QuickBooks fields to our schema
    recurringServices.push({
      customerName: recurring['Customer'] || recurring['Name'] || '',
      serviceName: recurring['Service'] || recurring['Item'] || '',
      frequency: recurring['Frequency'] || recurring['Schedule'] || 'monthly',
      amount: parseFloat(recurring['Amount'] || recurring['Price'] || 0),
      startDate: recurring['Start Date'] || new Date().toISOString().split('T')[0],
      nextDate: recurring['Next Date'] || '',
      status: recurring['Status'] || 'active',
      quickBooksId: recurring['Recurring ID'] || recurring['Id'] || '',
      notes: recurring['Memo'] || recurring['Notes'] || '',
      createdAt: new Date().toISOString()
    });
  }
  
  return recurringServices;
}

/**
 * Import customers from QuickBooks CSV
 * @param {string} tenantId - Tenant ID
 * @param {Array} customers - Parsed customer data
 * @param {string} duplicateHandling - How to handle duplicates (skip, merge, replace)
 * @returns {Promise<Object>} Import results
 */
export async function importQuickBooksCustomers(tenantId, customers, duplicateHandling = 'skip') {
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  
  let imported = 0;
  let skipped = 0;
  let merged = 0;
  let replaced = 0;
  let errors = [];
  
  for (const customer of customers) {
    try {
      // Check for existing customer by quickBooksId or email
      let existingDoc = null;
      
      if (customer.quickBooksId) {
        const q = query(customersRef, where('quickBooksId', '==', customer.quickBooksId));
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
            quickBooksId: customer.quickBooksId || existingDoc.data().quickBooksId
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
 * Import invoices from QuickBooks CSV
 * @param {string} tenantId - Tenant ID
 * @param {Array} invoices - Parsed invoice data
 * @param {string} duplicateHandling - How to handle duplicates (skip, merge, replace)
 * @returns {Promise<Object>} Import results
 */
export async function importQuickBooksInvoices(tenantId, invoices, duplicateHandling = 'skip') {
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  
  let imported = 0;
  let skipped = 0;
  let merged = 0;
  let replaced = 0;
  let errors = [];
  
  for (const invoice of invoices) {
    try {
      // Check for existing invoice by invoiceNumber or quickBooksId
      let existingDoc = null;
      
      if (invoice.quickBooksId) {
        const q = query(invoicesRef, where('quickBooksId', '==', invoice.quickBooksId));
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
            quickBooksId: invoice.quickBooksId || existingDoc.data().quickBooksId
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
 * Import payments from QuickBooks CSV
 * @param {string} tenantId - Tenant ID
 * @param {Array} payments - Parsed payment data
 * @param {string} duplicateHandling - How to handle duplicates (skip, merge, replace)
 * @returns {Promise<Object>} Import results
 */
export async function importQuickBooksPayments(tenantId, payments, duplicateHandling = 'skip') {
  const paymentsRef = collection(db, 'tenants', tenantId, 'payments');
  
  let imported = 0;
  let skipped = 0;
  let merged = 0;
  let replaced = 0;
  let errors = [];
  
  for (const payment of payments) {
    try {
      // Check for existing payment by paymentNumber or quickBooksId
      let existingDoc = null;
      
      if (payment.quickBooksId) {
        const q = query(paymentsRef, where('quickBooksId', '==', payment.quickBooksId));
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
            quickBooksId: payment.quickBooksId || existingDoc.data().quickBooksId
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

/**
 * Import recurring services from QuickBooks CSV
 * @param {string} tenantId - Tenant ID
 * @param {Array} recurringServices - Parsed recurring service data
 * @param {string} duplicateHandling - How to handle duplicates (skip, merge, replace)
 * @returns {Promise<Object>} Import results
 */
export async function importQuickBooksRecurring(tenantId, recurringServices, duplicateHandling = 'skip') {
  const recurringRef = collection(db, 'tenants', tenantId, 'recurring_services');
  
  let imported = 0;
  let skipped = 0;
  let merged = 0;
  let replaced = 0;
  let errors = [];
  
  for (const recurring of recurringServices) {
    try {
      // Check for existing recurring service by quickBooksId
      let existingDoc = null;
      
      if (recurring.quickBooksId) {
        const q = query(recurringRef, where('quickBooksId', '==', recurring.quickBooksId));
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
            quickBooksId: recurring.quickBooksId || existingDoc.data().quickBooksId
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
