// src/services/googleCalendarImportService.js
/**
 * Google Calendar Import Service
 * Imports events from Google Calendar via ICS, API, or CSV
 */

import { collection, addDoc, doc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Parse ICS file for calendar events
 * @param {string} icsContent - ICS file content
 * @returns {Array} Parsed event data
 */
export function parseICSFile(icsContent) {
  const events = [];
  const lines = icsContent.split('\n');
  
  let currentEvent = null;
  let inEvent = false;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (trimmedLine === 'BEGIN:VEVENT') {
      inEvent = true;
      currentEvent = {
        googleCalendarId: '',
        title: '',
        description: '',
        startDate: '',
        startTime: '',
        endDate: '',
        endTime: '',
        location: '',
        attendees: [],
        status: 'scheduled',
        createdAt: new Date().toISOString()
      };
    } else if (trimmedLine === 'END:VEVENT') {
      if (currentEvent) {
        events.push(currentEvent);
      }
      inEvent = false;
      currentEvent = null;
    } else if (inEvent && currentEvent) {
      const [key, ...valueParts] = trimmedLine.split(':');
      const value = valueParts.join(':').trim();
      
      if (key === 'UID') {
        currentEvent.googleCalendarId = value;
      } else if (key === 'SUMMARY') {
        currentEvent.title = value;
      } else if (key === 'DESCRIPTION') {
        currentEvent.description = value;
      } else if (key === 'DTSTART') {
        const dateStr = value.replace(/T/g, ' ').replace(/Z/g, '');
        currentEvent.startDate = dateStr.split(' ')[0] || '';
        currentEvent.startTime = dateStr.split(' ')[1] || '';
      } else if (key === 'DTEND') {
        const dateStr = value.replace(/T/g, ' ').replace(/Z/g, '');
        currentEvent.endDate = dateStr.split(' ')[0] || '';
        currentEvent.endTime = dateStr.split(' ')[1] || '';
      } else if (key === 'LOCATION') {
        currentEvent.location = value;
      } else if (key === 'ATTENDEE') {
        const emailMatch = value.match(/mailto:([^;]+)/);
        if (emailMatch) {
          currentEvent.attendees.push(emailMatch[1]);
        }
      } else if (key === 'STATUS') {
        currentEvent.status = value.toLowerCase();
      }
    }
  }
  
  return events;
}

/**
 * Parse Google Calendar CSV export
 * @param {string} csvContent - CSV content from Google Calendar
 * @returns {Array} Parsed event data
 */
export function parseGoogleCalendarCSV(csvContent) {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  const events = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const event = {};
    
    headers.forEach((header, index) => {
      event[header] = values[index] || '';
    });
    
    // Map Google Calendar fields to our schema
    events.push({
      googleCalendarId: event['Event ID'] || event['UID'] || '',
      title: event['Title'] || event['Subject'] || event['Summary'] || '',
      description: event['Description'] || event['Notes'] || '',
      startDate: event['Start Date'] || event['Start'] || '',
      startTime: event['Start Time'] || '',
      endDate: event['End Date'] || event['End'] || '',
      endTime: event['End Time'] || '',
      location: event['Location'] || event['Where'] || '',
      attendees: event['Attendees'] ? event['Attendees'].split(';') : [],
      status: event['Status'] || 'scheduled',
      createdAt: new Date().toISOString()
    });
  }
  
  return events;
}

/**
 * Import Google Calendar events
 * @param {string} tenantId - Tenant ID
 * @param {Array} events - Parsed event data
 * @param {string} duplicateHandling - How to handle duplicates (skip, merge, replace)
 * @returns {Promise<Object>} Import results
 */
export async function importGoogleCalendarEvents(tenantId, events, duplicateHandling = 'skip') {
  const appointmentsRef = collection(db, 'tenants', tenantId, 'appointments');
  
  let imported = 0;
  let skipped = 0;
  let merged = 0;
  let replaced = 0;
  let errors = [];
  
  for (const event of events) {
    try {
      // Check for existing event by googleCalendarId
      let existingDoc = null;
      
      if (event.googleCalendarId) {
        const q = query(appointmentsRef, where('googleCalendarId', '==', event.googleCalendarId));
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
            ...event,
            googleCalendarId: event.googleCalendarId || existingDoc.data().googleCalendarId
          }, { merge: true });
          merged++;
        } else if (duplicateHandling === 'replace') {
          await setDoc(doc(appointmentsRef, existingDoc.id), event);
          replaced++;
        }
      } else {
        await addDoc(appointmentsRef, event);
        imported++;
      }
    } catch (error) {
      errors.push({ event: event.title, error: error.message });
    }
  }
  
  return {
    total: events.length,
    imported,
    skipped,
    merged,
    replaced,
    errors
  };
}

/**
 * Extract customer information from calendar events
 * @param {Array} events - Calendar events
 * @returns {Array} Extracted customer data
 */
export function extractCustomersFromEvents(events) {
  const customersMap = new Map();
  
  for (const event of events) {
    if (event.attendees && event.attendees.length > 0) {
      for (const attendee of event.attendees) {
        if (attendee.includes('@')) {
          const email = attendee.trim();
          if (!customersMap.has(email)) {
            customersMap.set(email, {
              name: event.title || '',
              email: email,
              phone: '',
              firstAppointmentDate: event.startDate,
              lastAppointmentDate: event.startDate,
              totalAppointments: 1,
              googleCalendarId: event.googleCalendarId,
              notes: event.description || '',
              createdAt: new Date().toISOString()
            });
          } else {
            const customer = customersMap.get(email);
            customer.totalAppointments++;
            if (event.startDate > customer.lastAppointmentDate) {
              customer.lastAppointmentDate = event.startDate;
            }
          }
        }
      }
    }
  }
  
  return Array.from(customersMap.values());
}

/**
 * Import customers extracted from calendar events
 * @param {string} tenantId - Tenant ID
 * @param {Array} customers - Extracted customer data
 * @param {string} duplicateHandling - How to handle duplicates (skip, merge, replace)
 * @returns {Promise<Object>} Import results
 */
export async function importCustomersFromEvents(tenantId, customers, duplicateHandling = 'skip') {
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  
  let imported = 0;
  let skipped = 0;
  let merged = 0;
  let replaced = 0;
  let errors = [];
  
  for (const customer of customers) {
    try {
      // Check for existing customer by email
      let existingDoc = null;
      
      if (customer.email) {
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
            totalAppointments: existingDoc.data().totalAppointments + customer.totalAppointments
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
