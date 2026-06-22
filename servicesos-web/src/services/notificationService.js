// services/notificationService.js

export function sendEmail({ to, subject, data }) {
  console.log("EMAIL:", { to, subject, data });
  // Replace with SendGrid / Resend / Postmark later
}

export function sendSMS({ to, message }) {
  console.log("SMS:", { to, message });
  // Replace with Twilio later
}