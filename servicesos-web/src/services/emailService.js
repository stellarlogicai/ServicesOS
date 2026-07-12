/**
 * emailService.js
 * Automated quote + booking email delivery service.
 *
 * SECURITY: Email sending is now server-side only through cloud-functions.
 * Resend API keys must NEVER be exposed to the browser (VITE_RESEND_* variables).
 *
 * Current status: Frontend calls cloud function sendCustomerEmail.
 * - HTML builders remain in frontend for template generation
 * - Send functions call server-side cloud function with auth token
 * - Cloud function validates auth, tenant access, and controls sender/from address
 * - No browser-side Resend API calls
 *
 * Server-side requirements:
 * - RESEND_API_KEY must be set in cloud-functions environment
 * - Cloud function validates emailType against allowlist
 * - Cloud function controls sender/from address server-side
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { auth } from '../firebase';

async function getAuthToken() {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch (error) {
    console.error('[EMAIL] Error getting auth token:', error);
    return null;
  }
}

function serviceLabel(cleaningType) {
  return {
    standard:     'Standard Clean',
    deep:         'Deep Clean',
    moveout:      'Move-In / Move-Out Clean',
    construction: 'Post-Construction Clean',
  }[cleaningType] || cleaningType;
}

function frequencyLabel(frequency) {
  return {
    weekly:  'Weekly',
    biweekly: 'Every 2 Weeks',
    monthly: 'Monthly',
    onetime: 'One-Time',
  }[frequency] || frequency;
}

function conditionLabel(condition) {
  return {
    light:    'Light',
    moderate: 'Moderate',
    heavy:    'Heavy',
  }[condition] || condition;
}

function getFirstName(lead) {
  if (lead.firstName) return lead.firstName;
  if (lead.fullName) return lead.fullName.split(' ')[0];
  return 'Customer';
}

// ─── HTML Builders ─────────────────────────────────────────────────────────────

/**
 * Generate a fully-styled HTML quote email.
 * Works in all major email clients (tables, inline CSS).
 */
export function buildQuoteEmailHTML(lead, estimate) {
  const biz     = import.meta.env.VITE_BUSINESS_NAME || 'Cleaning Pro';
  const bizPhone= import.meta.env.VITE_BUSINESS_PHONE || '';
  const bookUrl = import.meta.env.VITE_BOOKING_URL    || '#';
  const firstName = getFirstName(lead);

  const breakdown = [
    ['Service type',    serviceLabel(lead.cleaningType)],
    ['Frequency',       frequencyLabel(lead.frequency || 'onetime')],
    ['Property',        `${lead.bedrooms || 0} bed / ${lead.bathrooms || 0} bath — ${Number(lead.squareFootage || 0).toLocaleString()} sq ft`],
    ['Condition',       conditionLabel(lead.condition || 'moderate')],
    ['Labor hours',     `${estimate.laborHours} hours`],
    ['Appointment time',`~${estimate.appointmentDuration || Math.round(estimate.laborHours * 60)} hours`],
  ];

  const rows = breakdown.map(([label, value]) => `
    <tr>
      <td style="padding:10px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6;width:40%">${label}</td>
      <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #f3f4f6;font-weight:500">${value}</td>
    </tr>`).join('');

  const aiNote = estimate.aiEnhanced
    ? `<tr><td colspan="2" style="padding:10px 16px;font-size:13px;color:#7c3aed;background:#faf5ff;border-bottom:1px solid #f3f4f6">✨ AI photo analysis was used to determine the condition assessment</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your cleaning estimate</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb">
    <tr>
      <td style="padding:40px 20px">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
          <tr>
            <td style="padding:32px 32px 24px;border-bottom:1px solid #f3f4f6">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#111827">Your cleaning estimate</h1>
              <p style="margin:8px 0 0;font-size:16px;color:#6b7280">Hi ${firstName}, here's your personalized quote.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px">
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
                ${rows}
                ${aiNote}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;background:#f9fafb;border-top:1px solid #f3f4f6">
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">
                <tr>
                  <td style="font-size:20px;font-weight:700;color:#111827">Estimated total</td>
                  <td style="font-size:24px;font-weight:700;color:#059669;text-align:right">$${estimate.priceLow} – $${estimate.priceHigh}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;text-align:center">
              <a href="${bookUrl}" style="display:inline-block;padding:12px 24px;background:#059669;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">Book Now</a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:13px;color:#6b7280;text-align:center">
              <p style="margin:0 0 8px">${biz} • ${bizPhone}</p>
              <p style="margin:0">This estimate is valid for 30 days.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Alias for Dashboard compatibility
export const previewQuoteEmailHTML = buildQuoteEmailHTML;

/**
 * Generate a booking-confirmation email.
 */
export function buildConfirmationEmailHTML(lead, booking) {
  const biz      = import.meta.env.VITE_BUSINESS_NAME || 'Cleaning Pro';
  const bizPhone = import.meta.env.VITE_BUSINESS_PHONE || '';
  const firstName= getFirstName(lead);
  const date     = new Date(booking.scheduledAt).toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const time     = new Date(booking.scheduledAt).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmed</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb">
    <tr>
      <td style="padding:40px 20px">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
          <tr>
            <td style="padding:32px 32px 24px;border-bottom:1px solid #f3f4f6">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#059669">Booking Confirmed ✅</h1>
              <p style="margin:8px 0 0;font-size:16px;color:#6b7280">Hi ${firstName}, your cleaning is scheduled.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px">
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
                <tr>
                  <td style="padding:10px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6;width:40%">Date</td>
                  <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #f3f4f6;font-weight:500">${date}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6">Time</td>
                  <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #f3f4f6;font-weight:500">${time}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6">Agreed price</td>
                  <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #f3f4f6;font-weight:500">$${booking.agreedPrice}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;text-align:center">
              <a href="${import.meta.env.VITE_BOOKING_URL || '#'}" style="display:inline-block;padding:12px 24px;background:#059669;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">View Booking</a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:13px;color:#6b7280;text-align:center">
              <p style="margin:0 0 8px">${biz} • ${bizPhone}</p>
              <p style="margin:0">Need to reschedule? Contact us at least 24 hours in advance.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Send Functions ───────────────────────────────────────────────────────────

/**
 * Send a quote email to a lead.
 *
 * @param {object} lead    - CRM lead
 * @param {object} estimate - Calculated estimate
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function sendQuoteEmail(lead, estimate) {
  try {
    const functionsUrl = import.meta.env.VITE_FUNCTIONS_URL;
    if (!functionsUrl) {
      console.log('[EMAIL] Skipping email (no FUNCTIONS_URL configured)');
      return { success: false, status: 'not_configured', message: 'Email sending is not configured yet.' };
    }

    const html = buildQuoteEmailHTML(lead, estimate);
    const response = await fetch(`${functionsUrl}/sendCustomerEmail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAuthToken()}`
      },
      body: JSON.stringify({
        emailType: 'quote',
        recipientEmail: lead.email,
        subject: `Your cleaning estimate: $${estimate.priceLow}–$${estimate.priceHigh}`,
        html,
        relatedEntityId: lead.id
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to send email');

    console.log(`[EMAIL] Quote sent to ${lead.email} via cloud function`);
    return { success: true, id: data.id };

  } catch (err) {
    console.error('[EMAIL] sendQuoteEmail failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Generate a payment confirmation email.
 */
export function buildPaymentConfirmationHTML(lead, payment) {
  const biz      = import.meta.env.VITE_BUSINESS_NAME || 'Cleaning Pro';
  const bizPhone = import.meta.env.VITE_BUSINESS_PHONE || '';
  const firstName= getFirstName(lead);
  const amount   = (payment.amount / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const date     = new Date(payment.createdAt || Date.now()).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
  
  // Format preferred appointment date
  const preferredDate = lead.preferredDate ? new Date(lead.preferredDate).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' }) : 'Not specified';
  const timeSlot = {
    morning: 'Morning (8AM - 12PM)',
    afternoon: 'Afternoon (12PM - 5PM)',
    evening: 'Evening (5PM - 8PM)'
  }[lead.preferredTime] || 'Not specified';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Confirmation</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb">
    <tr>
      <td style="padding:40px 20px">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
          <tr>
            <td style="padding:32px 32px 24px;border-bottom:1px solid #f3f4f6">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#059669">Payment Confirmed ✅</h1>
              <p style="margin:8px 0 0;font-size:16px;color:#6b7280">Hi ${firstName}, your payment has been processed.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px">
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
                <tr>
                  <td style="padding:10px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6;width:40%">Payment type</td>
                  <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #f3f4f6;font-weight:500">${payment.type || 'Deposit'}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6">Amount</td>
                  <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #f3f4f6;font-weight:500">${amount}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6">Date</td>
                  <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #f3f4f6;font-weight:500">${date}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6">Payment ID</td>
                  <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #f3f4f6;font-weight:500">${payment.paymentId || 'N/A'}</td>
                </tr>
                ${payment.remainingBalance ? `
                <tr>
                  <td style="padding:10px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6">Remaining balance</td>
                  <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #f3f4f6;font-weight:500">${(payment.remainingBalance / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                </tr>` : ''}
              </table>
            </td>
          </tr>
          ${lead.preferredDate ? `
          <tr>
            <td style="padding:24px 32px;background:#f0fdf4;border-top:1px solid #f3f4f6">
              <h3 style="margin:0 0 12px;font-size:16px;font-weight:600;color:#166534">📅 Scheduled Appointment</h3>
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
                <tr>
                  <td style="padding:8px 16px;font-size:14px;color:#6b7280;width:40%">Preferred Date</td>
                  <td style="padding:8px 16px;font-size:14px;color:#111827;font-weight:500">${preferredDate}</td>
                </tr>
                <tr>
                  <td style="padding:8px 16px;font-size:14px;color:#6b7280">Preferred Time</td>
                  <td style="padding:8px 16px;font-size:14px;color:#111827;font-weight:500">${timeSlot}</td>
                </tr>
              </table>
            </td>
          </tr>` : ''}
          <tr>
            <td style="padding:32px;text-align:center">
              <a href="${import.meta.env.VITE_BOOKING_URL || '#'}" style="display:inline-block;padding:12px 24px;background:#059669;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;margin-right:8px">View Booking</a>
              ${payment.remainingBalance ? `<a href="${import.meta.env.VITE_BOOKING_URL || '#'}?pay=remaining" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">Pay Remaining Balance</a>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:13px;color:#6b7280;text-align:center">
              <p style="margin:0 0 8px">${biz} • ${bizPhone}</p>
              <p style="margin:0">Questions? Contact us anytime.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send a payment confirmation email.
 *
 * @param {object} lead    - CRM lead
 * @param {object} payment - Payment details (amount, type, paymentId, remainingBalance)
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function sendPaymentConfirmationEmail(lead, payment) {
  try {
    const functionsUrl = import.meta.env.VITE_FUNCTIONS_URL;
    if (!functionsUrl) {
      console.log('[EMAIL] Skipping email (no FUNCTIONS_URL configured)');
      return { success: false, status: 'not_configured', message: 'Email sending is not configured yet.' };
    }

    const html = buildPaymentConfirmationHTML(lead, payment);
    const response = await fetch(`${functionsUrl}/sendCustomerEmail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAuthToken()}`
      },
      body: JSON.stringify({
        emailType: 'payment_confirmation',
        recipientEmail: lead.email,
        subject: `Payment Confirmed: ${payment.type || 'Deposit'}`,
        html,
        relatedEntityId: payment.paymentId
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to send email');

    console.log(`[EMAIL] Payment confirmation sent to ${lead.email} via cloud function`);
    return { success: true, id: data.id };

  } catch (err) {
    console.error('[EMAIL] sendPaymentConfirmationEmail failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send a booking-confirmation email when admin converts a lead to a booked job.
 *
 * @param {object} lead    - CRM lead
 * @param {object} booking - Booking record (scheduledAt, agreedPrice)
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function sendBookingConfirmationEmail(lead, booking) {
  try {
    const functionsUrl = import.meta.env.VITE_FUNCTIONS_URL;
    if (!functionsUrl) {
      console.log('[EMAIL] Skipping email (no FUNCTIONS_URL configured)');
      return { success: false, status: 'not_configured', message: 'Email sending is not configured yet.' };
    }

    const html = buildConfirmationEmailHTML(lead, booking);
    const date = new Date(booking.scheduledAt).toLocaleDateString('en-US', { month:'long', day:'numeric' });
    const response = await fetch(`${functionsUrl}/sendCustomerEmail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAuthToken()}`
      },
      body: JSON.stringify({
        emailType: 'booking_confirmation',
        recipientEmail: lead.email,
        subject: `Booking Confirmed: ${date}`,
        html,
        relatedEntityId: booking.id
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to send email');

    console.log(`[EMAIL] Confirmation sent to ${lead.email} via cloud function`);
    return { success: true, id: data.id };

  } catch (err) {
    console.error('[EMAIL] sendBookingConfirmationEmail failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Generate a follow-up email for leads that haven't responded.
 */
export function buildFollowUpEmailHTML(lead, estimate) {
  const biz      = import.meta.env.VITE_BUSINESS_NAME || 'Cleaning Pro';
  const bizPhone = import.meta.env.VITE_BUSINESS_PHONE || '';
  const firstName= getFirstName(lead);
  const amount   = `$${estimate.priceLow} – $${estimate.priceHigh}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Following Up on Your Cleaning Estimate</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb">
    <tr>
      <td style="padding:40px 20px">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
          <tr>
            <td style="padding:32px 32px 24px;border-bottom:1px solid #f3f4f6">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#111827">Following Up</h1>
              <p style="margin:8px 0 0;font-size:16px;color:#6b7280">Hi ${firstName}, checking in on your cleaning estimate.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px">
              <p style="margin:0 0 16px;font-size:16px;color:#374151">We sent you an estimate of <strong>${amount}</strong> for your ${serviceLabel(lead.cleaningType)} service. Have you had a chance to review it?</p>
              <p style="margin:0 0 16px;font-size:16px;color:#374151">We'd love to earn your business! If you have any questions or are ready to book, just reply to this email or give us a call.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;text-align:center">
              <a href="${import.meta.env.VITE_BOOKING_URL || '#'}" style="display:inline-block;padding:12px 24px;background:#059669;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">Book Now</a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:13px;color:#6b7280;text-align:center">
              <p style="margin:0 0 8px">${biz} • ${bizPhone}</p>
              <p style="margin:0">This estimate is valid for 30 days.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send a follow-up email to a lead.
 *
 * @param {object} lead    - CRM lead
 * @param {object} estimate - Calculated estimate
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function sendFollowUpEmail(lead, estimate) {
  try {
    const functionsUrl = import.meta.env.VITE_FUNCTIONS_URL;
    if (!functionsUrl) {
      console.log('[EMAIL] Skipping email (no FUNCTIONS_URL configured)');
      return { success: false, status: 'not_configured', message: 'Email sending is not configured yet.' };
    }

    const html = buildFollowUpEmailHTML(lead, estimate);
    const response = await fetch(`${functionsUrl}/sendCustomerEmail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAuthToken()}`
      },
      body: JSON.stringify({
        emailType: 'follow_up',
        recipientEmail: lead.email,
        subject: `Following up on your cleaning estimate`,
        html,
        relatedEntityId: lead.id
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to send email');

    console.log(`[EMAIL] Follow-up sent to ${lead.email} via cloud function`);
    return { success: true, id: data.id };

  } catch (err) {
    console.error('[EMAIL] sendFollowUpEmail failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Generate a reminder email for upcoming appointments.
 */
export function buildAppointmentReminderHTML(lead, booking) {
  const biz      = import.meta.env.VITE_BUSINESS_NAME || 'Cleaning Pro';
  const bizPhone = import.meta.env.VITE_BUSINESS_PHONE || '';
  const firstName= getFirstName(lead);
  const date     = new Date(booking.scheduledAt).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
  const time     = new Date(booking.scheduledAt).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appointment Reminder</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb">
    <tr>
      <td style="padding:40px 20px">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
          <tr>
            <td style="padding:32px 32px 24px;border-bottom:1px solid #f3f4f6">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#3b82f6">📅 Appointment Reminder</h1>
              <p style="margin:8px 0 0;font-size:16px;color:#6b7280">Hi ${firstName}, your cleaning is coming up soon!</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px">
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
                <tr>
                  <td style="padding:10px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6;width:40%">Date</td>
                  <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #f3f4f6;font-weight:500">${date}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6">Time</td>
                  <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #f3f4f6;font-weight:500">${time}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6">Address</td>
                  <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #f3f4f6;font-weight:500">${lead.address || 'Your address'}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;background:#eff6ff;border-top:1px solid #f3f4f6">
              <p style="margin:0;font-size:14px;color:#1e40af">💡 Please ensure someone is available at the property during the scheduled time.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:13px;color:#6b7280;text-align:center">
              <p style="margin:0 0 8px">${biz} • ${bizPhone}</p>
              <p style="margin:0">Need to reschedule? Contact us at least 24 hours in advance.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send an appointment reminder email.
 *
 * @param {object} lead    - CRM lead
 * @param {object} booking - Booking record (scheduledAt)
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function sendAppointmentReminderEmail(lead, booking) {
  try {
    const functionsUrl = import.meta.env.VITE_FUNCTIONS_URL;
    if (!functionsUrl) {
      console.log('[EMAIL] Skipping email (no FUNCTIONS_URL configured)');
      return { success: false, status: 'not_configured', message: 'Email sending is not configured yet.' };
    }

    const html = buildAppointmentReminderHTML(lead, booking);
    const response = await fetch(`${functionsUrl}/sendCustomerEmail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAuthToken()}`
      },
      body: JSON.stringify({
        emailType: 'appointment_reminder',
        recipientEmail: lead.email,
        subject: `Appointment Reminder: ${new Date(booking.scheduledAt).toLocaleDateString('en-US', { month:'long', day:'numeric' })}`,
        html,
        relatedEntityId: booking.id
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to send email');

    console.log(`[EMAIL] Reminder sent to ${lead.email} via cloud function`);
    return { success: true, id: data.id };

  } catch (err) {
    console.error('[EMAIL] sendAppointmentReminderEmail failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Generate a service agreement email HTML.
 */
export function buildServiceAgreementHTML(lead, estimate, contract) {
  const biz      = import.meta.env.VITE_BUSINESS_NAME || 'Cleaning Pro';
  const bizPhone = import.meta.env.VITE_BUSINESS_PHONE || '';
  const firstName= getFirstName(lead);
  const deposit  = contract.agreementTerms?.depositAmount || Math.round(estimate.priceLow * 0.25);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Service Agreement Signed</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb">
    <tr>
      <td style="padding:40px 20px">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
          <tr>
            <td style="padding:32px 32px 24px;border-bottom:1px solid #f3f4f6">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#059669">Service Agreement Signed ✅</h1>
              <p style="margin:8px 0 0;font-size:16px;color:#6b7280">Hi ${firstName}, your service agreement has been signed.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px">
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
                <tr>
                  <td style="padding:10px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6;width:40%">Service Address</td>
                  <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #f3f4f6;font-weight:500">${lead.address}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6">Estimated Price</td>
                  <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #f3f4f6;font-weight:500">$${estimate.priceLow} - $${estimate.priceHigh}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6">Deposit Required</td>
                  <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #f3f4f6;font-weight:500">$${deposit}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6">Signed On</td>
                  <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #f3f4f6;font-weight:500">${contract.signedAt ? new Date(contract.signedAt).toLocaleString() : 'N/A'}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;background:#f0fdf4;border-top:1px solid #f3f4f6">
              <p style="margin:0;font-size:14px;color:#166534">📄 A copy of your signed service agreement is attached to this email for your records.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;text-align:center">
              <a href="${import.meta.env.VITE_BOOKING_URL || '#'}" style="display:inline-block;padding:12px 24px;background:#059669;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">Pay Deposit</a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:13px;color:#6b7280;text-align:center">
              <p style="margin:0 0 8px">${biz} • ${bizPhone}</p>
              <p style="margin:0">Thank you for choosing us!</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send a service agreement email with PDF attachment.
 *
 * @param {object} lead    - CRM lead
 * @param {object} estimate - Estimate data
 * @param {object} contract - Contract data
 * @param {Blob} pdfBlob   - PDF blob of the signed agreement
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function sendServiceAgreementEmail(lead, estimate, contract, pdfBlob) {
  try {
    const functionsUrl = import.meta.env.VITE_FUNCTIONS_URL;
    if (!functionsUrl) {
      console.log('[EMAIL] Skipping email (no FUNCTIONS_URL configured)');
      return { success: false, status: 'not_configured', message: 'Email sending is not configured yet.' };
    }

    const html = buildServiceAgreementHTML(lead, estimate, contract);
    
    // Convert blob to base64 for attachment
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    const response = await fetch(`${functionsUrl}/sendCustomerEmail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAuthToken()}`
      },
      body: JSON.stringify({
        emailType: 'service_agreement',
        recipientEmail: lead.email,
        subject: 'Service Agreement Signed',
        html,
        relatedEntityId: contract.id,
        attachments: [
          {
            filename: `Service_Agreement_${lead.lastName}_${Date.now()}.pdf`,
            content: base64,
            type: 'application/pdf'
          }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to send email');

    console.log(`[EMAIL] Service agreement sent to ${lead.email} via cloud function`);
    return { success: true, id: data.id };

  } catch (err) {
    console.error('[EMAIL] sendServiceAgreementEmail failed:', err.message);
    return { success: false, error: err.message };
  }
}
