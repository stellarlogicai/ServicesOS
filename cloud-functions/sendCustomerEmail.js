/**
 * sendCustomerEmail.js
 * Server-side email sending function using Resend API.
 * 
 * SECURITY:
 * - RESEND_API_KEY must be set server-side only (not VITE_RESEND_*)
 * - Validates auth token and tenant access
 * - Controls sender/from address server-side
 * - Validates emailType against allowlist
 * - Customer emails are recipients only, never senders
 * 
 * Email type allowlist:
 * - quote
 * - booking_confirmation
 * - payment_confirmation
 * - follow_up
 * - appointment_reminder
 * - service_agreement
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });

// Email type allowlist
const ALLOWED_EMAIL_TYPES = [
  'quote',
  'booking_confirmation',
  'payment_confirmation',
  'follow_up',
  'appointment_reminder',
  'service_agreement'
];

// Server-controlled sender address
const DEFAULT_SENDER_EMAIL = functions.config().email?.sender_email || 'notifications@servicesos.com';
const DEFAULT_SENDER_NAME = functions.config().email?.sender_name || 'ServicesOS';

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate email type against allowlist
 */
function isValidEmailType(emailType) {
  return ALLOWED_EMAIL_TYPES.includes(emailType);
}

/**
 * Create sendCustomerEmail handler
 */
function createSendCustomerEmailHandler({ admin, cors }) {
  return async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      cors(req, res, () => res.status(204).send(''));
      return;
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Check for RESEND_API_KEY
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error('[sendCustomerEmail] RESEND_API_KEY not configured');
      return res.status(503).json({ 
        error: 'Email service not configured',
        status: 'not_configured'
      });
    }

    // Verify auth token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      console.error('[sendCustomerEmail] Auth verification failed:', error);
      return res.status(401).json({ error: 'Invalid auth token' });
    }

    // Validate required fields
    const { tenantId, recipientEmail, subject, html, emailType, relatedEntityId, replyToBusinessEmail } = req.body;

    if (!recipientEmail || !isValidEmail(recipientEmail)) {
      return res.status(400).json({ error: 'Invalid recipient email' });
    }

    if (!subject || typeof subject !== 'string') {
      return res.status(400).json({ error: 'Subject is required' });
    }

    if (!html && !req.body.text) {
      return res.status(400).json({ error: 'HTML or text body is required' });
    }

    if (!emailType || !isValidEmailType(emailType)) {
      return res.status(400).json({ error: 'Invalid email type' });
    }

    // Validate tenant access if tenantId provided
    if (tenantId) {
      try {
        const tenantDoc = await admin.firestore().collection('tenants').doc(tenantId).get();
        if (!tenantDoc.exists) {
          return res.status(403).json({ error: 'Tenant not found' });
        }

        // Check if user has access to this tenant
        const userTenantId = decodedToken.tenantId;
        if (userTenantId && userTenantId !== tenantId) {
          return res.status(403).json({ error: 'Access denied to tenant' });
        }
      } catch (error) {
        console.error('[sendCustomerEmail] Tenant validation failed:', error);
        return res.status(500).json({ error: 'Tenant validation failed' });
      }
    }

    // Build email payload with server-controlled sender
    const emailPayload = {
      from: `${DEFAULT_SENDER_NAME} <${DEFAULT_SENDER_EMAIL}>`,
      to: [recipientEmail],
      subject,
      html: html || req.body.text,
    };

    // Add reply_to if provided and valid (business email only)
    if (replyToBusinessEmail && isValidEmail(replyToBusinessEmail)) {
      emailPayload.reply_to = replyToBusinessEmail;
    }

    // Add attachments if provided
    if (req.body.attachments && Array.isArray(req.body.attachments)) {
      emailPayload.attachments = req.body.attachments;
    }

    try {
      // Send email via Resend API
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`
        },
        body: JSON.stringify(emailPayload)
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[sendCustomerEmail] Resend API error:', data);
        return res.status(500).json({ error: 'Failed to send email' });
      }

      // Log email send event (optional - if safe pattern exists)
      // Skipping for now to avoid schema changes

      console.log(`[sendCustomerEmail] Email sent successfully: ${emailType} to ${recipientEmail}`);
      return res.json({ 
        success: true, 
        id: data.id,
        emailType,
        recipientEmail
      });

    } catch (error) {
      console.error('[sendCustomerEmail] Send failed:', error);
      return res.status(500).json({ error: 'Failed to send email' });
    }
  };
}

/**
 * Export the handler factory
 */
module.exports = { createSendCustomerEmailHandler };
