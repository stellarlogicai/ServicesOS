// src/services/rebookingService.js
/**
 * Automated Rebooking Service
 * Handles automatic rebooking after completed cleaning with email + SMS
 */

import { collection, doc, getDoc, getDocs, query, where, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { generateJobFromRecurring } from './recurringService';

/**
 * Trigger rebooking after job completion
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Completed job ID
 * @returns {Promise<Object>} Rebooking result
 */
export async function triggerRebooking(tenantId, jobId) {
  try {
    // Get the completed job
    const jobRef = doc(db, 'tenants', tenantId, 'bookings', jobId);
    const jobSnap = await getDoc(jobRef);
    
    if (!jobSnap.exists()) {
      return { success: false, error: 'Job not found' };
    }
    
    const job = { id: jobSnap.id, ...jobSnap.data() };
    
    // Check if job has a recurring service
    if (!job.recurringServiceId) {
      return { success: false, error: 'Job is not part of a recurring service' };
    }
    
    // Get the recurring service
    const recurringRef = doc(db, 'tenants', tenantId, 'recurring_services', job.recurringServiceId);
    const recurringSnap = await getDoc(recurringRef);
    
    if (!recurringSnap.exists()) {
      return { success: false, error: 'Recurring service not found' };
    }
    
    const recurringService = { id: recurringSnap.id, ...recurringSnap.data() };
    
    // Check if recurring service is still active
    if (recurringService.status !== 'active') {
      return { success: false, error: 'Recurring service is not active' };
    }
    
    // Generate the next job from recurring service
    const newJobRef = await generateJobFromRecurring(tenantId, recurringService);
    
    // Send rebooking confirmation
    await sendRebookingConfirmation(tenantId, job, recurringService, newJobRef.id);
    
    return {
      success: true,
      newJobId: newJobRef.id,
      nextServiceDate: recurringService.nextServiceDate
    };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Send rebooking confirmation to customer
 * @param {string} tenantId - Tenant ID
 * @param {object} completedJob - Completed job
 * @param {object} recurringService - Recurring service
 * @param {string} newJobId - New job ID
 * @returns {Promise<void>}
 */
async function sendRebookingConfirmation(tenantId, completedJob, recurringService, newJobId) {
  // Get tenant settings for rebooking preferences
  const tenantRef = doc(db, 'tenants', tenantId);
  const tenantSnap = await getDoc(tenantRef);
  
  if (!tenantSnap.exists()) return;
  
  const tenant = tenantSnap.data();
  const settings = tenant.settings || {};
  const rebookingSettings = settings.rebooking || {
    enabled: true,
    sendEmail: true,
    sendSMS: false,
    advanceDays: 7
  };
  
  if (!rebookingSettings.enabled) return;
  
  // Get customer info
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  const customerQuery = query(customersRef, where('name', '==', completedJob.customerName));
  const customerSnap = await getDocs(customerQuery);
  
  let customer = { email: '', phone: '' };
  if (!customerSnap.empty) {
    customer = customerSnap.docs[0].data();
  }
  
  const message = {
    customerName: completedJob.customerName,
    completedDate: completedJob.date,
    nextServiceDate: recurringService.nextServiceDate,
    nextServiceTime: recurringService.preferredTime,
    companyName: tenant.companyName || 'Your Cleaning Service'
  };
  
  // Send email if enabled
  if (rebookingSettings.sendEmail && customer.email) {
    await sendRebookingEmail(tenantId, customer.email, message);
  }
  
  // Send SMS if enabled
  if (rebookingSettings.sendSMS && customer.phone) {
    await sendRebookingSMS(tenantId, customer.phone, message);
  }
  
  // Log the rebooking
  const rebookingLogRef = collection(db, 'tenants', tenantId, 'rebooking_logs');
  await addDoc(rebookingLogRef, {
    jobId: completedJob.id,
    newJobId,
    customerId: completedJob.customerId,
    customerName: completedJob.customerName,
    recurringServiceId: recurringService.id,
    nextServiceDate: recurringService.nextServiceDate,
    emailSent: rebookingSettings.sendEmail && !!customer.email,
    smsSent: rebookingSettings.sendSMS && !!customer.phone,
    createdAt: new Date().toISOString()
  });
}

/**
 * Send rebooking email
 * @param {string} tenantId - Tenant ID
 * @param {string} email - Customer email
 * @param {object} message - Message data
 * @returns {Promise<void>}
 */
async function sendRebookingEmail(tenantId, email, message) {
  // This would integrate with your email service
  // For now, we'll create an email record in Firestore
  const emailsRef = collection(db, 'tenants', tenantId, 'emails');
  
  await addDoc(emailsRef, {
    to: email,
    subject: `Your Next Cleaning is Scheduled for ${message.nextServiceDate}`,
    template: 'rebooking_confirmation',
    data: message,
    status: 'pending',
    createdAt: new Date().toISOString()
  });
}

/**
 * Send rebooking SMS
 * @param {string} tenantId - Tenant ID
 * @param {string} phone - Customer phone
 * @param {object} message - Message data
 * @returns {Promise<void>}
 */
async function sendRebookingSMS(tenantId, phone, message) {
  // This would integrate with Twilio or your SMS service
  // For now, we'll create an SMS record in Firestore
  const smsRef = collection(db, 'tenants', tenantId, 'sms');
  
  await addDoc(smsRef, {
    to: phone,
    message: `Hi ${message.customerName}, your next cleaning with ${message.companyName} is scheduled for ${message.nextServiceDate} at ${message.nextServiceTime}. Reply YES to confirm or call us to reschedule.`,
    status: 'pending',
    createdAt: new Date().toISOString()
  });
}

/**
 * Check for upcoming rebookings and send reminders
 * @param {string} tenantId - Tenant ID
 * @param {number} daysInAdvance - Days in advance to send reminders (default 3)
 * @returns {Promise<number>} Number of reminders sent
 */
export async function sendRebookingReminders(tenantId, daysInAdvance = 3) {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysInAdvance);
  const targetDateStr = targetDate.toISOString().split('T')[0];
  
  // Get jobs scheduled for that date that are part of recurring services
  const bookingsRef = collection(db, 'tenants', tenantId, 'bookings');
  const q = query(
    bookingsRef,
    where('date', '==', targetDateStr),
    where('recurringServiceId', '!=', null)
  );
  
  const snapshot = await getDocs(q);
  let remindersSent = 0;
  
  for (const doc of snapshot.docs) {
    const job = { id: doc.id, ...doc.data() };
    
    // Get customer info
    const customersRef = collection(db, 'tenants', tenantId, 'customers');
    const customerQuery = query(customersRef, where('name', '==', job.customerName));
    const customerSnap = await getDocs(customerQuery);
    
    let customer = { email: '', phone: '' };
    if (!customerSnap.empty) {
      customer = customerSnap.docs[0].data();
    }
    
    // Get tenant settings
    const tenantRef = doc(db, 'tenants', tenantId);
    const tenantSnap = await getDoc(tenantRef);
    
    if (tenantSnap.exists()) {
      const tenant = tenantSnap.data();
      const settings = tenant.settings || {};
      const reminderSettings = settings.reminders || {
        enabled: true,
        sendEmail: true,
        sendSMS: false
      };
      
      if (reminderSettings.enabled) {
        const message = {
          customerName: job.customerName,
          serviceDate: job.date,
          serviceTime: job.startTime,
          companyName: tenant.companyName || 'Your Cleaning Service'
        };
        
        if (reminderSettings.sendEmail && customer.email) {
          await sendReminderEmail(tenantId, customer.email, message);
          remindersSent++;
        }
        
        if (reminderSettings.sendSMS && customer.phone) {
          await sendReminderSMS(tenantId, customer.phone, message);
          remindersSent++;
        }
      }
    }
  }
  
  return remindersSent;
}

/**
 * Send reminder email
 * @param {string} tenantId - Tenant ID
 * @param {string} email - Customer email
 * @param {object} message - Message data
 * @returns {Promise<void>}
 */
async function sendReminderEmail(tenantId, email, message) {
  const emailsRef = collection(db, 'tenants', tenantId, 'emails');
  
  await addDoc(emailsRef, {
    to: email,
    subject: `Reminder: Your Cleaning is on ${message.serviceDate}`,
    template: 'appointment_reminder',
    data: message,
    status: 'pending',
    createdAt: new Date().toISOString()
  });
}

/**
 * Send reminder SMS
 * @param {string} tenantId - Tenant ID
 * @param {string} phone - Customer phone
 * @param {object} message - Message data
 * @returns {Promise<void>}
 */
async function sendReminderSMS(tenantId, phone, message) {
  const smsRef = collection(db, 'tenants', tenantId, 'sms');
  
  await addDoc(smsRef, {
    to: phone,
    message: `Reminder: Your cleaning with ${message.companyName} is on ${message.serviceDate} at ${message.serviceTime}. See you then!`,
    status: 'pending',
    createdAt: new Date().toISOString()
  });
}

/**
 * Get rebooking statistics
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Rebooking statistics
 */
export async function getRebookingStatistics(tenantId, startDate, endDate) {
  const logsRef = collection(db, 'tenants', tenantId, 'rebooking_logs');
  
  // Get logs in date range
  const logsSnap = await getDocs(logsRef);
  const logs = logsSnap.docs
    .map(doc => doc.data())
    .filter(log => log.createdAt >= startDate && log.createdAt <= endDate);
  
  const totalRebookings = logs.length;
  const emailSent = logs.filter(log => log.emailSent).length;
  const smsSent = logs.filter(log => log.smsSent).length;
  
  // Calculate retention rate
  const uniqueCustomers = new Set(logs.map(log => log.customerId)).size;
  
  return {
    totalRebookings,
    emailSent,
    smsSent,
    uniqueCustomers,
    retentionRate: uniqueCustomers > 0 ? (totalRebookings / uniqueCustomers) * 100 : 0
  };
}

/**
 * Update rebooking settings for tenant
 * @param {string} tenantId - Tenant ID
 * @param {object} settings - Rebooking settings
 * @returns {Promise<void>}
 */
export async function updateRebookingSettings(tenantId, settings) {
  const tenantRef = doc(db, 'tenants', tenantId);
  
  await updateDoc(tenantRef, {
    'settings.rebooking': {
      enabled: settings.enabled !== undefined ? settings.enabled : true,
      sendEmail: settings.sendEmail !== undefined ? settings.sendEmail : true,
      sendSMS: settings.sendSMS !== undefined ? settings.sendSMS : false,
      advanceDays: settings.advanceDays || 7
    },
    'settings.reminders': {
      enabled: settings.remindersEnabled !== undefined ? settings.remindersEnabled : true,
      sendEmail: settings.reminderEmail !== undefined ? settings.reminderEmail : true,
      sendSMS: settings.reminderSMS !== undefined ? settings.reminderSMS : false
    }
  });
}

/**
 * Get rebooking settings for tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Rebooking settings
 */
export async function getRebookingSettings(tenantId) {
  const tenantRef = doc(db, 'tenants', tenantId);
  const tenantSnap = await getDoc(tenantRef);
  
  if (!tenantSnap.exists()) {
    return {
      enabled: true,
      sendEmail: true,
      sendSMS: false,
      advanceDays: 7,
      remindersEnabled: true,
      reminderEmail: true,
      reminderSMS: false
    };
  }
  
  const tenant = tenantSnap.data();
  const settings = tenant.settings || {};
  
  return {
    enabled: settings.rebooking?.enabled ?? true,
    sendEmail: settings.rebooking?.sendEmail ?? true,
    sendSMS: settings.rebooking?.sendSMS ?? false,
    advanceDays: settings.rebooking?.advanceDays ?? 7,
    remindersEnabled: settings.reminders?.enabled ?? true,
    reminderEmail: settings.reminders?.sendEmail ?? true,
    reminderSMS: settings.reminders?.sendSMS ?? false
  };
}
