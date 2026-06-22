// src/services/smsClientService.js
/**
 * Client-side SMS service wrapper
 * This provides a client-side interface that calls backend SMS functions
 * For security, actual SMS sending happens on the server
 */

import { previewMessages } from './smsService';

/**
 * Send SMS quote via backend API
 * @param {Object} lead - Customer lead data
 * @param {Object} estimate - Price estimate
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendQuoteSMSClient(lead, estimate) {
  try {
    // In production, this would call your backend API
    // const response = await fetch('/api/send-sms', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ lead, estimate, type: 'quote' })
    // });
    // const result = await response.json();
    // return result;

    // For now, just log and return success
    console.log('[SMS Client] Quote SMS would be sent to:', lead.phone);
    console.log('[SMS Client] Message:', previewMessages(lead, estimate).quote);
    
    return { success: true };
  } catch (error) {
    console.error('[SMS Client] Error sending quote SMS:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send booking confirmation SMS via backend API
 * @param {Object} lead - Customer lead data
 * @param {Object} booking - Booking details
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendBookingConfirmationSMSClient(lead, booking) {
  try {
    // In production, this would call your backend API
    console.log('[SMS Client] Confirmation SMS would be sent to:', lead.phone);
    console.log('[SMS Client] Message:', previewMessages(lead, null, booking).confirmation);
    
    return { success: true };
  } catch (error) {
    console.error('[SMS Client] Error sending confirmation SMS:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send reminder SMS via backend API
 * @param {Object} lead - Customer lead data
 * @param {Object} booking - Booking details
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendReminderSMSClient(lead, booking) {
  try {
    // In production, this would call your backend API
    console.log('[SMS Client] Reminder SMS would be sent to:', lead.phone);
    console.log('[SMS Client] Message:', previewMessages(lead, null, booking).reminder);
    
    return { success: true };
  } catch (error) {
    console.error('[SMS Client] Error sending reminder SMS:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Preview SMS messages without sending
 * @param {Object} lead - Customer lead data
 * @param {Object} estimate - Price estimate
 * @param {Object} booking - Booking details (optional)
 * @returns {Object} Preview of all message types
 */
export function previewSMSMessages(lead, estimate, booking = null) {
  return previewMessages(lead, estimate, booking);
}
