// src/services/csvImportService.js
/**
 * CSV Import Service
 * Handles CSV parsing, validation, column mapping, and data import
 */

import { collection, doc, addDoc, updateDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// Import types
export const IMPORT_TYPES = {
  CUSTOMERS: 'customers',
  JOBS: 'jobs',
  EMPLOYEES: 'employees',
  INVOICES: 'invoices',
  RECURRING_SERVICES: 'recurring_services'
};

/**
 * Parse CSV file
 * @param {File} file - CSV file
 * @returns {Promise<Array>} Parsed rows
 */
export async function parseCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const rows = parseCSVText(text);
        resolve(rows);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Parse CSV text
 * @param {string} text - CSV text
 * @returns {Array} Parsed rows
 */
function parseCSVText(text) {
  const lines = text.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    return [];
  }
  
  // Parse headers
  const headers = parseCSVLine(lines[0]);
  
  // Parse data rows
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((header, index) => {
        row[header.trim()] = values[index] ? values[index].trim() : '';
      });
      data.push(row);
    }
  }
  
  return data;
}

/**
 * Parse a single CSV line handling quoted values
 * @param {string} line - CSV line
 * @returns {Array} Parsed values
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current);
  
  return values;
}

/**
 * Detect columns from CSV data
 * @param {Array} data - Parsed CSV data
 * @param {string} importType - Type of import
 * @returns {Object} Detected columns and suggested mappings
 */
export function detectColumns(data, importType) {
  if (!data || data.length === 0) {
    return { columns: [], mappings: {} };
  }
  
  const columns = Object.keys(data[0]);
  const mappings = suggestColumnMappings(columns, importType);
  
  return { columns, mappings };
}

/**
 * Suggest column mappings based on import type
 * @param {Array} columns - CSV columns
 * @param {string} importType - Type of import
 * @returns {Object} Suggested mappings
 */
function suggestColumnMappings(columns, importType) {
  const columnLower = columns.map(c => c.toLowerCase());
  const mappings = {};
  
  const fieldPatterns = {
    [IMPORT_TYPES.CUSTOMERS]: {
      name: ['name', 'customer', 'client', 'customer name', 'full name'],
      email: ['email', 'email address', 'e-mail'],
      phone: ['phone', 'phone number', 'telephone', 'mobile', 'cell'],
      address: ['address', 'street', 'street address', 'location'],
      notes: ['notes', 'comments', 'remarks', 'special instructions']
    },
    [IMPORT_TYPES.EMPLOYEES]: {
      name: ['name', 'employee', 'employee name', 'full name'],
      email: ['email', 'email address', 'e-mail'],
      phone: ['phone', 'phone number', 'telephone', 'mobile', 'cell'],
      hourlyRate: ['hourly rate', 'rate', 'pay rate', 'wage'],
      availability: ['availability', 'schedule', 'hours']
    },
    [IMPORT_TYPES.JOBS]: {
      customerName: ['customer', 'customer name', 'client', 'client name'],
      date: ['date', 'service date', 'appointment date'],
      startTime: ['time', 'start time', 'appointment time'],
      estimatedHours: ['hours', 'estimated hours', 'duration'],
      price: ['price', 'amount', 'total', 'cost'],
      status: ['status', 'job status']
    },
    [IMPORT_TYPES.INVOICES]: {
      customerName: ['customer', 'customer name', 'client', 'client name'],
      invoiceNumber: ['invoice', 'invoice #', 'invoice number'],
      invoiceDate: ['date', 'invoice date'],
      amount: ['amount', 'total', 'balance', 'price'],
      status: ['status', 'invoice status'],
      dueDate: ['due date', 'payment due']
    },
    [IMPORT_TYPES.RECURRING_SERVICES]: {
      customerName: ['customer', 'customer name', 'client', 'client name'],
      scheduleType: ['schedule', 'frequency', 'type'],
      dayOfWeek: ['day', 'day of week'],
      preferredTime: ['time', 'preferred time', 'start time'],
      price: ['price', 'amount', 'total']
    }
  };
  
  const patterns = fieldPatterns[importType] || {};
  
  for (const [field, patternsList] of Object.entries(patterns)) {
    for (let i = 0; i < columnLower.length; i++) {
      const column = columnLower[i];
      if (patternsList.some(pattern => column.includes(pattern))) {
        mappings[field] = columns[i];
        break;
      }
    }
  }
  
  return mappings;
}

/**
 * Validate import data
 * @param {Array} data - Parsed CSV data
 * @param {string} importType - Type of import
 * @param {Object} mappings - Column mappings
 * @returns {Object} Validation results
 */
export function validateImportData(data, importType, mappings) {
  const results = {
    valid: [],
    invalid: [],
    duplicates: [],
    errors: []
  };
  
  if (!data || data.length === 0) {
    results.errors.push('No data found in CSV file');
    return results;
  }
  
  // Validate each row
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const mappedRow = mapRow(row, mappings);
    const validation = validateRow(mappedRow, importType);
    
    if (validation.valid) {
      results.valid.push({ index: i, data: mappedRow });
    } else {
      results.invalid.push({
        index: i,
        data: mappedRow,
        errors: validation.errors
      });
    }
  }
  
  return results;
}

/**
 * Map row using column mappings
 * @param {Object} row - Original row
 * @param {Object} mappings - Column mappings
 * @returns {Object} Mapped row
 */
function mapRow(row, mappings) {
  const mapped = {};
  
  for (const [field, csvColumn] of Object.entries(mappings)) {
    if (csvColumn && row[csvColumn] !== undefined) {
      mapped[field] = row[csvColumn];
    }
  }
  
  return mapped;
}

/**
 * Validate a single row
 * @param {Object} row - Mapped row
 * @param {string} importType - Type of import
 * @returns {Object} Validation result
 */
function validateRow(row, importType) {
  const errors = [];
  
  switch (importType) {
    case IMPORT_TYPES.CUSTOMERS:
      if (!row.name) errors.push('Name is required');
      if (!row.email && !row.phone) errors.push('Email or phone is required');
      break;
      
    case IMPORT_TYPES.EMPLOYEES:
      if (!row.name) errors.push('Name is required');
      if (!row.phone) errors.push('Phone is required');
      break;
      
    case IMPORT_TYPES.JOBS:
      if (!row.customerName) errors.push('Customer name is required');
      if (!row.date) errors.push('Date is required');
      break;
      
    case IMPORT_TYPES.INVOICES:
      if (!row.customerName) errors.push('Customer name is required');
      if (!row.amount) errors.push('Amount is required');
      break;
      
    case IMPORT_TYPES.RECURRING_SERVICES:
      if (!row.customerName) errors.push('Customer name is required');
      if (!row.scheduleType) errors.push('Schedule type is required');
      break;
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Check for duplicates in existing data
 * @param {string} tenantId - Tenant ID
 * @param {Array} validRows - Valid rows to check
 * @param {string} importType - Type of import
 * @returns {Promise<Object>} Duplicate check results
 */
export async function checkDuplicates(tenantId, validRows, importType) {
  const duplicates = [];
  
  for (const row of validRows) {
    let isDuplicate = false;
    let existingId = null;
    
    switch (importType) {
      case IMPORT_TYPES.CUSTOMERS:
        existingId = await findDuplicateCustomer(tenantId, row.data);
        isDuplicate = !!existingId;
        break;
        
      case IMPORT_TYPES.EMPLOYEES:
        existingId = await findDuplicateEmployee(tenantId, row.data);
        isDuplicate = !!existingId;
        break;
        
      case IMPORT_TYPES.INVOICES:
        existingId = await findDuplicateInvoice(tenantId, row.data);
        isDuplicate = !!existingId;
        break;
    }
    
    if (isDuplicate) {
      duplicates.push({
        index: row.index,
        data: row.data,
        existingId
      });
    }
  }
  
  return duplicates;
}

/**
 * Find duplicate customer
 * @param {string} tenantId - Tenant ID
 * @param {Object} data - Customer data
 * @returns {Promise<string|null>} Existing customer ID or null
 */
async function findDuplicateCustomer(tenantId, data) {
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  
  // Check by email
  if (data.email) {
    const q = query(customersRef, where('email', '==', data.email));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) return snapshot.docs[0].id;
  }
  
  // Check by phone
  if (data.phone) {
    const q = query(customersRef, where('phone', '==', data.phone));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) return snapshot.docs[0].id;
  }
  
  // Check by name
  if (data.name) {
    const q = query(customersRef, where('name', '==', data.name));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) return snapshot.docs[0].id;
  }
  
  return null;
}

/**
 * Find duplicate employee
 * @param {string} tenantId - Tenant ID
 * @param {Object} data - Employee data
 * @returns {Promise<string|null>} Existing employee ID or null
 */
async function findDuplicateEmployee(tenantId, data) {
  const employeesRef = collection(db, 'tenants', tenantId, 'employees');
  
  // Check by email
  if (data.email) {
    const q = query(employeesRef, where('email', '==', data.email));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) return snapshot.docs[0].id;
  }
  
  // Check by phone
  if (data.phone) {
    const q = query(employeesRef, where('phone', '==', data.phone));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) return snapshot.docs[0].id;
  }
  
  // Check by name
  if (data.name) {
    const q = query(employeesRef, where('name', '==', data.name));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) return snapshot.docs[0].id;
  }
  
  return null;
}

/**
 * Find duplicate invoice
 * @param {string} tenantId - Tenant ID
 * @param {Object} data - Invoice data
 * @returns {Promise<string|null>} Existing invoice ID or null
 */
async function findDuplicateInvoice(tenantId, data) {
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  
  // Check by invoice number
  if (data.invoiceNumber) {
    const q = query(invoicesRef, where('invoiceNumber', '==', data.invoiceNumber));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) return snapshot.docs[0].id;
  }
  
  return null;
}

/**
 * Import data to Firestore
 * @param {string} tenantId - Tenant ID
 * @param {Array} rows - Valid rows to import
 * @param {string} importType - Type of import
 * @param {Object} options - Import options (skipDuplicates, mergeDuplicates)
 * @returns {Promise<Object>} Import results
 */
export async function importData(tenantId, rows, importType, options = {}) {
  const results = {
    imported: 0,
    skipped: 0,
    merged: 0,
    errors: []
  };
  
  for (const row of rows) {
    try {
      const existingId = row.existingId;
      
      // Skip if duplicate and skip option is set
      if (existingId && options.skipDuplicates) {
        results.skipped++;
        continue;
      }
      
      // Merge if duplicate and merge option is set
      if (existingId && options.mergeDuplicates) {
        await mergeRecord(tenantId, existingId, row.data, importType);
        results.merged++;
        continue;
      }
      
      // Import new record
      await createRecord(tenantId, row.data, importType);
      results.imported++;
      
    } catch (error) {
      results.errors.push({
        index: row.index,
        error: error.message
      });
    }
  }
  
  return results;
}

/**
 * Create a new record
 * @param {string} tenantId - Tenant ID
 * @param {Object} data - Record data
 * @param {string} importType - Type of import
 * @returns {Promise<void>}
 */
async function createRecord(tenantId, data, importType) {
  let collectionName;
  let recordData;
  
  switch (importType) {
    case IMPORT_TYPES.CUSTOMERS:
      collectionName = 'customers';
      recordData = {
        name: data.name,
        email: data.email || '',
        phone: data.phone || '',
        address: data.address || '',
        notes: data.notes || '',
        createdAt: new Date().toISOString()
      };
      break;
      
    case IMPORT_TYPES.EMPLOYEES:
      collectionName = 'employees';
      recordData = {
        name: data.name,
        email: data.email || '',
        phone: data.phone || '',
        hourlyRate: parseFloat(data.hourlyRate) || 0,
        availability: data.availability || 'full-time',
        status: 'active',
        createdAt: new Date().toISOString()
      };
      break;
      
    case IMPORT_TYPES.JOBS:
      collectionName = 'bookings';
      recordData = {
        customerName: data.customerName,
        date: data.date,
        startTime: data.startTime || '09:00',
        estimatedHours: parseFloat(data.estimatedHours) || 2,
        price: parseFloat(data.price) || 0,
        status: data.status || 'scheduled',
        createdAt: new Date().toISOString()
      };
      break;
      
    case IMPORT_TYPES.INVOICES:
      collectionName = 'invoices';
      recordData = {
        customerName: data.customerName,
        invoiceNumber: data.invoiceNumber || '',
        invoiceDate: data.invoiceDate || new Date().toISOString().split('T')[0],
        total: parseFloat(data.amount) || 0,
        status: data.status || 'sent',
        dueDate: data.dueDate || '',
        createdAt: new Date().toISOString()
      };
      break;
      
    case IMPORT_TYPES.RECURRING_SERVICES:
      collectionName = 'recurring_services';
      recordData = {
        customerName: data.customerName,
        scheduleType: data.scheduleType || 'weekly',
        dayOfWeek: parseInt(data.dayOfWeek) || 1,
        preferredTime: data.preferredTime || '09:00',
        price: parseFloat(data.price) || 0,
        status: 'active',
        createdAt: new Date().toISOString()
      };
      break;
  }
  
  const ref = collection(db, 'tenants', tenantId, collectionName);
  await addDoc(ref, recordData);
}

/**
 * Merge existing record
 * @param {string} tenantId - Tenant ID
 * @param {string} existingId - Existing record ID
 * @param {Object} data - New data
 * @param {string} importType - Type of import
 * @returns {Promise<void>}
 */
async function mergeRecord(tenantId, existingId, data, importType) {
  let collectionName;
  let updateData;
  
  switch (importType) {
    case IMPORT_TYPES.CUSTOMERS:
      collectionName = 'customers';
      updateData = {
        email: data.email || undefined,
        phone: data.phone || undefined,
        address: data.address || undefined,
        notes: data.notes || undefined,
        updatedAt: new Date().toISOString()
      };
      break;
      
    case IMPORT_TYPES.EMPLOYEES:
      collectionName = 'employees';
      updateData = {
        email: data.email || undefined,
        phone: data.phone || undefined,
        hourlyRate: data.hourlyRate ? parseFloat(data.hourlyRate) : undefined,
        availability: data.availability || undefined,
        updatedAt: new Date().toISOString()
      };
      break;
  }
  
  // Remove undefined values
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) delete updateData[key];
  });
  
  if (Object.keys(updateData).length > 0) {
    const ref = doc(db, 'tenants', tenantId, collectionName, existingId);
    await updateDoc(ref, updateData);
  }
}
