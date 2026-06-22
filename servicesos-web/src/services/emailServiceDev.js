/**
 * emailService.js
 * Automated quote + booking email delivery service.
 *
 * Uses Resend (https://resend.com) — the simplest modern email API for React/Node apps.
 * Swap the send function for Nodemailer / SendGrid if you prefer.
 *
 * SETUP:
 *   1. npm install resend
 *   2. Add to your .env file:
 *        RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *        EMAIL_FROM=quotes@yourdomain.com
 *        BUSINESS_NAME="Sparkle Clean Pro"
 *        BUSINESS_PHONE="(555) 123-4567"
 *        BOOKING_URL=https://yourdomain.com/book
 *   3. Call from a server-side route / serverless function — never expose API keys to the browser.
 *
 * USAGE:
 *   import { sendQuoteEmail, sendBookingConfirmationEmail } from './emailService.js';
 *   await sendQuoteEmail(lead, estimate);
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    const biz = import.meta.env.VITE_BUSINESS_NAME || 'Cleaning Pro';
    const from = import.meta.env.VITE_EMAIL_FROM || `quotes@yourdomain.com`;

    // Skip email in development mode (browser-to-API calls blocked by CORS)
    // Email should be sent from backend (Firebase Functions) in production
    if (import.meta.env.DEV) {
      console.log('[EMAIL] Skipping email in development mode (CORS protection)');
      console.log('[EMAIL] Email would be sent to:', lead.email);
      console.log('[EMAIL] Estimate: $', estimate.priceLow, '-', estimate.priceHigh);
      return { success: true, id: 'dev-skipped' };
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: `${biz} <${from}>`,
        to: [lead.email],
        subject: `Your cleaning estimate: $${estimate.priceLow}–$${estimate.priceHigh}`,
        html: buildQuoteEmailHTML(lead, estimate),
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to send email');

    console.log(`[EMAIL] Quote sent to ${lead.email} | ID: ${data.id}`);
    return { success: true, id: data.id };

  } catch (err) {
    console.error('[EMAIL] sendQuoteEmail failed:', err.message);
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
    const biz  = import.meta.env.VITE_BUSINESS_NAME || 'Cleaning Pro';
    const from = import.meta.env.VITE_EMAIL_FROM || `quotes@yourdomain.com`;
    const date = new Date(booking.scheduledAt).toLocaleDateString('en-US', { month:'long', day:'numeric' });

    // Skip email in development mode (browser-to-API calls blocked by CORS)
    if (import.meta.env.DEV) {
      console.log('[EMAIL] Skipping email in development mode (CORS protection)');
      return { success: true, id: 'dev-skipped' };
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: `${biz} <${from}>`,
        to: [lead.email],
        subject: `Booking Confirmed: ${date}`,
        html: buildConfirmationEmailHTML(lead, booking),
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to send email');

    console.log(`[EMAIL] Confirmation sent to ${lead.email} | ID: ${data.id}`);
    return { success: true, id: data.id };

  } catch (err) {
    console.error('[EMAIL] sendBookingConfirmationEmail failed:', err.message);
    return { success: false, error: err.message };
  }
}
