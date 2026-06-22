// src/services/calendlyCSVImportService.js
/**
 * Calendly CSV Import Service
 * Imports appointments and customers from Calendly CSV exports
 */

import { collection, addDoc, doc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Parse Calendly CSV for appointments
 * @param {string} csvContent - CSV content from Calendly
 * @returns {Array} Parsed appointment data
 */
export function parseCalendlyAppointmentsCSV(csvContent) {
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
    
    // Map Calendly fields to our schema
    appointments.push({
      eventName: appointment['Event Name'] || appointment['Event Type'] || '',
      customerName: appointment['Name'] || appointment['Invitee Name'] || '',
      customerEmail: appointment['Email'] || appointment['Invitee Email'] || '',
      customerPhone: appointment['Phone'] || appointment['Invitee Phone'] || '',
      startDate: appointment['Start Date'] || appointment['Start Time'] || '',
      startTime: appointment['Start Time'] || appointment['Start Date & Time'] || '',
      endDate: appointment['End Date'] || appointment['End Time'] || '',
      endTime: appointment['End Time'] || appointment['End Date & Time'] || '',
      duration: appointment['Duration'] || '',
      status: appointment['Status'] || 'scheduled',
      location: appointment['Location'] || '',
      notes: appointment['Questions & Answers'] || appointment['Notes'] || '',
      calendlyId: appointment['Event UUID'] || appointment['Event ID'] || '',
      createdAt: new Date().toISOString()
    });
  }
  
  return appointments;
}

/**
 * Parse Calendly CSV for customers
 * @param {string} csvContent - CSV content from Calendly
 * @returns {Array} Parsed customer data
 */
export function parseCalendlyCustomersCSV(csvContent) {
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
    
    // Map Calendly fields to our schema
    customers.push({
      name: customer['Name'] || customer['Invitee Name'] || '',
      email: customer['Email'] || customer['Invitee Email'] || '',
      phone: customer['Phone'] || customer['Invitee Phone'] || '',
      firstAppointmentDate: customer['First Appointment Date'] || '',
      lastAppointmentDate: customer['Last Appointment Date'] || '',
      totalAppointments: parseInt(customer['Total Appointments'] || '0'),
      calendlyId: customer['Invitee UUID'] || customer['Invitee ID'] || '',
      notes: customer['Questions & Answers'] || customer['Notes'] || '',
      createdAt: new Date().toISOString()
    });
  }
  
  return customers;
}

/**
 * Import appointments from Calendly CSV
 * @param {string} tenantId - Tenant ID
 * @param {Array} appointments - Parsed appointment data
 * @param {string} duplicateHandling - How to handle duplicates (skip, merge, replace)
 * @returns {Promise<Object>} Import results
 */
export async function importCalendlyAppointments(tenantId, appointments, duplicateHandling = 'skip') {
  const appointmentsRef = collection(db, 'tenants', tenantId, 'appointments');
  
  let imported = 0;
  let skipped = 0;
  let merged = 0;
  let replaced = 0;
  let errors = [];
  
  for (const appointment of appointments) {
    try {
      // Check for existing appointment by calendlyId
      let existingDoc = null;
      
      if (appointment.calendlyId) {
        const q = query(appointmentsRef, where('calendlyId', '==', appointment.calendlyId));
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
            calendlyId: appointment.calendlyId || existingDoc.data().calendlyId
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
 * Import customers from Calendly CSV
 * @param {string} tenantId - Tenant ID
 * @param {Array} customers - Parsed customer data
 * @param {string} duplicateHandling - How to handle duplicates (skip, merge, replace)
 * @returns {Promise<Object>} Import results
 */
export async function importCalendlyCustomers(tenantId, customers, duplicateHandling = 'skip') {
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  
  let imported = 0;
  let skipped = 0;
  let merged = 0;
  let replaced = 0;
  let errors = [];
  
  for (const customer of customers) {
    try {
      // Check for existing customer by calendlyId or email
      let existingDoc = null;
      
      if (customer.calendlyId) {
        const q = query(customersRef, where('calendlyId', '==', customer.calendlyId));
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
            calendlyId: customer.calendlyId || existingDoc.data().calendlyId
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
