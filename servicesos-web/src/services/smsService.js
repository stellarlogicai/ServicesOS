/**
 * smsService.js
 * Twilio SMS Auto-Quote delivery service.
 *
 * SETUP:
 *   1. npm install twilio
 *   2. Add to your .env file:
 *        VITE_TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *        VITE_TWILIO_AUTH_TOKEN=your_auth_token_here
 *        VITE_TWILIO_PHONE_NUMBER=+1XXXXXXXXXX    ← your Twilio number
 *        VITE_BUSINESS_NAME="Sparkle Clean Pro"
 *        VITE_BOOKING_URL=https://yourdomain.com/book
 *   3. In production, call sendQuoteSMS() from your backend route —
 *      never expose Twilio credentials to the browser.
 *
 * USAGE (Node.js / serverless function):
 *   import { sendQuoteSMS, sendBookingConfirmationSMS, sendReminderSMS } from './smsService.js';
 *   await sendQuoteSMS(lead, estimate);
 */

// ─── Node / serverless environment only ───────────────────────────────────────
// The Twilio client is initialised lazily so the file can be imported in
// browser-only environments without crashing (just don't call the send fns).
let _twilioClient = null;

function getTwilioClient() {
  if (_twilioClient) return _twilioClient;

  // Twilio is a server-side package only.
  // This file is for Node.js/serverless environments.
  // Use smsClientService.js for browser environments.
  if (typeof window !== 'undefined') {
    console.warn('SMS service requires Node.js environment. Use smsClientService for browser.');
    return null;
  }

  try {
    // eslint-disable-next-line no-undef
    const twilio = require('twilio');
    _twilioClient = twilio(
      window.REACT_APP_TWILIO_ACCOUNT_SID,
      window.REACT_APP_TWILIO_AUTH_TOKEN
    );
    return _twilioClient;
  } catch (error) {
    console.error('Failed to initialize Twilio client:', error);
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalise a phone number to E.164 format (+1XXXXXXXXXX for US numbers).
 * Strips spaces, dashes, parentheses, and dots.
 */
export function normalisePhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`; // international — pass through
}

/**
 * Build the human-readable frequency label.
 */
function frequencyLabel(frequency) {
  const map = {
    'one-time': 'one-time visit',
    'weekly':   'weekly recurring',
    'bi-weekly':'bi-weekly recurring',
    'monthly':  'monthly recurring',
  };
  return map[frequency] || frequency;
}

/**
 * Build the service-type label.
 */
function serviceLabel(cleaningType) {
  const map = {
    standard:     'Standard Clean',
    deep:         'Deep Clean',
    moveout:      'Move-In / Move-Out Clean',
    construction: 'Post-Construction Clean',
  };
  return map[cleaningType] || cleaningType;
}

// ─── Message templates ────────────────────────────────────────────────────────

/**
 * Short quote SMS (≤160 chars where possible, always <320 chars).
 * Sent immediately after intake form submission.
 */
export function buildQuoteMessage(lead, estimate) {
  const businessName = window.REACT_APP_BUSINESS_NAME || 'Cleaning Pro';
  const bookingUrl   = window.REACT_APP_BOOKING_URL || 'https://yourdomain.com/book';
  const priceLine    = `$${estimate.priceLow}–$${estimate.priceHigh}`;
  const service      = serviceLabel(lead.cleaningType);
  const freq         = frequencyLabel(lead.frequency);

  return (
    `Hi ${lead.fullName.split(' ')[0]}! 👋 ${businessName} here.\n\n` +
    `Your instant quote:\n` +
    `📋 ${service} (${freq})\n` +
    `⏱ ~${estimate.appointmentDuration} hrs\n` +
    `💰 ${priceLine}\n\n` +
    `Ready to book? ${bookingUrl}\n` +
    `Reply STOP to opt out.`
  );
}

/**
 * Booking-confirmation SMS — sent when admin converts a lead to a booked job.
 */
export function buildConfirmationMessage(lead, booking) {
  const businessName = window.REACT_APP_BUSINESS_NAME || 'Cleaning Pro';
  const date = new Date(booking.scheduledAt).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const time = new Date(booking.scheduledAt).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  });

  return (
    `✅ Booking confirmed! ${businessName}\n\n` +
    `Hi ${lead.fullName.split(' ')[0]}, you're all set!\n` +
    `📅 ${date} at ${time}\n` +
    `📍 ${lead.address}\n` +
    `💰 ${booking.agreedPrice ? `$${booking.agreedPrice}` : 'Price as quoted'}\n\n` +
    `Questions? Reply to this message.\n` +
    `Reply STOP to opt out.`
  );
}

/**
 * 24-hour reminder SMS.
 */
export function buildReminderMessage(lead, booking) {
  const businessName = window.REACT_APP_BUSINESS_NAME || 'Cleaning Pro';
  const time = new Date(booking.scheduledAt).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  });

  return (
    `⏰ Reminder: ${businessName} is coming tomorrow!\n\n` +
    `Hi ${lead.fullName.split(' ')[0]}, your cleaning is scheduled for ${time}.\n` +
    `📍 ${lead.address}\n\n` +
    `Please ensure access to the property. See you then! 🏠✨`
  );
}

// ─── Send functions (Node / serverless only) ──────────────────────────────────

/**
 * Send an instant quote SMS right after the intake form is submitted.
 *
 * @param {object} lead     - Form data object (fullName, phone, cleaningType, …)
 * @param {object} estimate - Calculated estimate (priceLow, priceHigh, appointmentDuration)
 * @returns {Promise<{success: boolean, sid?: string, error?: string}>}
 */
export async function sendQuoteSMS(lead, estimate) {
  try {
    const client = getTwilioClient();
    const to     = normalisePhone(lead.phone);
    const body   = buildQuoteMessage(lead, estimate);

    const message = await client.messages.create({
      body,
      from: window.REACT_APP_TWILIO_PHONE_NUMBER,
      to,
    });

    console.log(`[SMS] Quote sent to ${to} | SID: ${message.sid}`);
    return { success: true, sid: message.sid };

  } catch (err) {
    console.error('[SMS] sendQuoteSMS failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send a booking-confirmation SMS when a lead is converted to a booked job.
 *
 * @param {object} lead    - Lead / form data
 * @param {object} booking - Booking record (scheduledAt ISO string, agreedPrice)
 * @returns {Promise<{success: boolean, sid?: string, error?: string}>}
 */
export async function sendBookingConfirmationSMS(lead, booking) {
  try {
    const client = getTwilioClient();
    const to     = normalisePhone(lead.phone);
    const body   = buildConfirmationMessage(lead, booking);

    const message = await client.messages.create({
      body,
      from: window.REACT_APP_TWILIO_PHONE_NUMBER,
      to,
    });

    console.log(`[SMS] Confirmation sent to ${to} | SID: ${message.sid}`);
    return { success: true, sid: message.sid };

  } catch (err) {
    console.error('[SMS] sendBookingConfirmationSMS failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send a 24-hour appointment reminder SMS.
 *
 * @param {object} lead    - Lead / form data
 * @param {object} booking - Booking record (scheduledAt ISO string)
 * @returns {Promise<{success: boolean, sid?: string, error?: string}>}
 */
export async function sendReminderSMS(lead, booking) {
  try {
    const client = getTwilioClient();
    const to     = normalisePhone(lead.phone);
    const body   = buildReminderMessage(lead, booking);

    const message = await client.messages.create({
      body,
      from: window.REACT_APP_TWILIO_PHONE_NUMBER,
      to,
    });

    console.log(`[SMS] Reminder sent to ${to} | SID: ${message.sid}`);
    return { success: true, sid: message.sid };

  } catch (err) {
    console.error('[SMS] sendReminderSMS failed:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Browser-safe preview helper ─────────────────────────────────────────────
// Use this in your React admin dashboard to preview what the SMS will say
// before sending — no server call needed.

/**
 * Preview all three message types without sending anything.
 * Safe to call in the browser.
 *
 * @param {object} lead
 * @param {object} estimate
 * @param {object} [booking]
 * @returns {{ quote: string, confirmation: string, reminder: string }}
 */
export function previewMessages(lead, estimate, booking = null) {
  const fakebooking = booking || {
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    agreedPrice: estimate.priceLow,
  };

  return {
    quote:        buildQuoteMessage(lead, estimate),
    confirmation: buildConfirmationMessage(lead, fakebooking),
    reminder:     buildReminderMessage(lead, fakebooking),
  };
}
