const crypto = require('node:crypto');

const PLATFORM_EMAIL_DAILY_LIMIT = 75;
const TENANT_EMAIL_DAILY_LIMIT = 50;
const ACTOR_EMAIL_HOURLY_LIMIT = 20;
const EMAIL_PROVIDER_TIMEOUT_MS = 15_000;
const EMAIL_PROVIDER_SAFE_RETRY_MS = 23 * 60 * 60 * 1000;
const MAX_PDF_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_PDF_ATTACHMENT_BASE64_LENGTH = 4 * Math.ceil(MAX_PDF_ATTACHMENT_BYTES / 3);

const ALLOWED_EMAIL_TYPES = Object.freeze([
  'quote',
  'booking_confirmation',
  'payment_confirmation',
  'follow_up',
  'appointment_reminder',
  'service_agreement',
]);
const ALLOWED_REQUEST_KEYS = Object.freeze([
  'tenantId', 'emailType', 'recipientEmail', 'subject', 'relatedEntityId',
  'idempotencyKey', 'html', 'text', 'attachments',
]);

class CustomerEmailError extends Error {
  constructor(message, { code = 'email_failed', status = 400 } = {}) {
    super(message);
    this.name = 'CustomerEmailError';
    this.code = code;
    this.status = status;
  }
}

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength + 1) : '';
}

function requiredIdentifier(value, label, maxLength) {
  const normalized = cleanString(value, maxLength);
  if (!normalized || normalized.length > maxLength || normalized.includes('/')) {
    throw new CustomerEmailError(`${label} is invalid.`, { code: 'invalid_request' });
  }
  return normalized;
}

function exactRequestKeys(body) {
  return Boolean(body && typeof body === 'object' && !Array.isArray(body) &&
    Object.keys(body).every(key => ALLOWED_REQUEST_KEYS.includes(key)));
}

function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function decodePdfAttachment(attachments, emailType) {
  if (attachments == null) return null;
  if (emailType !== 'service_agreement' || !Array.isArray(attachments) || attachments.length !== 1) {
    throw new CustomerEmailError('Attachments are allowed only for one service-agreement PDF.', { code: 'invalid_request' });
  }
  const attachment = attachments[0];
  if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment) ||
      Object.keys(attachment).some(key => !['filename', 'content', 'type'].includes(key)) ||
      typeof attachment.filename !== 'string' || typeof attachment.content !== 'string' ||
      attachment.type !== 'application/pdf') {
    throw new CustomerEmailError('The service-agreement attachment is invalid.', { code: 'invalid_request' });
  }
  const filename = attachment.filename.trim();
  if (!filename || filename.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.pdf$/i.test(filename)) {
    throw new CustomerEmailError('The service-agreement PDF filename is invalid.', { code: 'invalid_request' });
  }
  const content = attachment.content;
  if (!content || content.length > MAX_PDF_ATTACHMENT_BASE64_LENGTH || content.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) {
    throw new CustomerEmailError('The service-agreement PDF content is invalid.', { code: 'invalid_request' });
  }
  const decoded = Buffer.from(content, 'base64');
  if (!decoded.length || decoded.length > MAX_PDF_ATTACHMENT_BYTES ||
      decoded.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new CustomerEmailError('The service-agreement PDF content is invalid.', { code: 'invalid_request' });
  }
  return {
    filename,
    content,
    type: 'application/pdf',
    contentHash: crypto.createHash('sha256').update(decoded).digest('hex'),
    sizeBytes: decoded.length,
  };
}

function normalizeCustomerEmailRequest(body = {}) {
  if (!exactRequestKeys(body)) {
    throw new CustomerEmailError('The email request is invalid.', { code: 'invalid_request' });
  }
  const tenantId = requiredIdentifier(body.tenantId, 'Tenant', 128);
  if (tenantId === 'DEFAULT') {
    throw new CustomerEmailError('The email request is invalid.', { code: 'invalid_request' });
  }
  const emailType = cleanString(body.emailType, 64);
  if (!ALLOWED_EMAIL_TYPES.includes(emailType)) {
    throw new CustomerEmailError('The email type is invalid.', { code: 'invalid_request' });
  }
  const recipientEmail = cleanString(body.recipientEmail, 320).toLowerCase();
  if (!isValidEmail(recipientEmail)) {
    throw new CustomerEmailError('The recipient email is invalid.', { code: 'invalid_request' });
  }
  const subject = cleanString(body.subject, 200);
  if (!subject || subject.length > 200) {
    throw new CustomerEmailError('The email subject is invalid.', { code: 'invalid_request' });
  }
  const relatedEntityId = requiredIdentifier(body.relatedEntityId, 'Related record', 256);
  const idempotencyKey = requiredIdentifier(body.idempotencyKey, 'Idempotency key', 128);
  const hasHtml = typeof body.html === 'string' && body.html.trim().length > 0;
  const hasText = typeof body.text === 'string' && body.text.trim().length > 0;
  if (hasHtml === hasText) {
    throw new CustomerEmailError('Provide exactly one email body format.', { code: 'invalid_request' });
  }
  const html = hasHtml ? body.html.trim() : null;
  const text = hasText ? body.text.trim() : null;
  if ((html && html.length > 100_000) || (text && text.length > 50_000)) {
    throw new CustomerEmailError('The email body is too large.', { code: 'invalid_request' });
  }
  const attachment = decodePdfAttachment(body.attachments, emailType);
  return {
    tenantId,
    emailType,
    recipientEmail,
    subject,
    relatedEntityId,
    idempotencyKey,
    ...(html ? { html } : { text }),
    ...(attachment ? { attachment } : {}),
  };
}

function membershipIncludes(membership, uid) {
  if (Array.isArray(membership)) return membership.includes(uid);
  return Boolean(membership && typeof membership === 'object' && membership[uid]);
}

function snapshotExists(snapshot) {
  return typeof snapshot?.exists === 'function' ? snapshot.exists() : snapshot?.exists === true;
}

function snapshotData(snapshot) {
  return snapshotExists(snapshot) ? snapshot.data() || {} : null;
}

async function verifyCustomerEmailActor({ db, tenantId, uid }) {
  const profileRef = db.collection('users').doc(uid);
  const tenantRef = db.collection('tenants').doc(tenantId);
  const [profileSnapshot, tenantSnapshot] = await Promise.all([profileRef.get(), tenantRef.get()]);
  const profile = snapshotData(profileSnapshot);
  const tenant = snapshotData(tenantSnapshot);
  if (!profile || profile.status !== 'active' || !tenant) {
    throw new CustomerEmailError('Email sending is unavailable for this account.', { code: 'forbidden', status: 403 });
  }
  if (profile.role === 'super-admin') return { tenant, tenantRef };
  if (profile.role !== 'admin' || profile.tenantId !== tenantId || !membershipIncludes(tenant.adminUsers, uid)) {
    throw new CustomerEmailError('Email sending is unavailable for this account.', { code: 'forbidden', status: 403 });
  }
  return { tenant, tenantRef };
}

function resolveTenantReplyTo(tenant = {}) {
  const candidate = cleanString(tenant.businessSettings?.businessEmail, 320) || cleanString(tenant.businessEmail, 320);
  return isValidEmail(candidate) ? candidate.toLowerCase() : null;
}

function hashValue(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function emailOperationId({ tenantId, uid, idempotencyKey }) {
  return hashValue(`${tenantId}\n${uid}\n${idempotencyKey}`);
}

function emailRequestHash({ request, replyTo, senderEmail = null, senderName = null, uid }) {
  const material = {
    tenantId: request.tenantId,
    uid,
    emailType: request.emailType,
    recipientEmail: request.recipientEmail,
    subject: request.subject,
    bodyType: request.html ? 'html' : 'text',
    bodyHash: hashValue(request.html || request.text),
    relatedEntityId: request.relatedEntityId,
    replyTo: replyTo || null,
    senderEmail,
    senderName,
    attachment: request.attachment ? {
      filename: request.attachment.filename,
      type: request.attachment.type,
      sizeBytes: request.attachment.sizeBytes,
      contentHash: request.attachment.contentHash,
    } : null,
  };
  return hashValue(JSON.stringify(material));
}

function utcUsageKeys(now, uid) {
  const iso = now.toISOString();
  return {
    dayKey: iso.slice(0, 10),
    hourKey: iso.slice(0, 13),
    actorHourId: `${iso.slice(0, 13).replace(/[:T]/g, '-')}-${hashValue(uid).slice(0, 24)}`,
  };
}

function serverTimestamp(admin) {
  return admin.firestore.FieldValue.serverTimestamp();
}

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const millis = new Date(value).getTime();
    return Number.isFinite(millis) ? millis : null;
  }
  return null;
}

function usageCount(snapshot) {
  if (!snapshotExists(snapshot)) return 0;
  const count = snapshot.data()?.count;
  if (!Number.isInteger(count) || count < 0) {
    throw new CustomerEmailError('Email quota state is unavailable.', { code: 'quota_state_invalid', status: 409 });
  }
  return count;
}

function emailReferences(db, { tenantId, uid, operationId, now }) {
  const tenantRef = db.collection('tenants').doc(tenantId);
  const { dayKey, hourKey, actorHourId } = utcUsageKeys(now, uid);
  return {
    operationRef: tenantRef.collection('emailSendLedger').doc(operationId),
    platformUsageRef: db.collection('platformEmailUsage').doc(dayKey),
    tenantUsageRef: tenantRef.collection('emailSendUsage').doc(dayKey),
    actorUsageRef: tenantRef.collection('emailSendActorUsage').doc(actorHourId),
    dayKey,
    hourKey,
  };
}

async function reserveCustomerEmail({ admin, request, uid, requestHash, now }) {
  const db = admin.firestore();
  const operationId = emailOperationId({ tenantId: request.tenantId, uid, idempotencyKey: request.idempotencyKey });
  const refs = emailReferences(db, { tenantId: request.tenantId, uid, operationId, now });
  return db.runTransaction(async transaction => {
    const [operationSnapshot, platformSnapshot, tenantSnapshot, actorSnapshot] = await Promise.all([
      transaction.get(refs.operationRef), transaction.get(refs.platformUsageRef),
      transaction.get(refs.tenantUsageRef), transaction.get(refs.actorUsageRef),
    ]);
    const existing = snapshotData(operationSnapshot);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new CustomerEmailError('This email idempotency key was already used for different content.', {
          code: 'idempotency_conflict', status: 409,
        });
      }
      if (existing.status === 'sent') {
        return { kind: 'sent', operationId, providerRequestId: existing.providerRequestId || null };
      }
      if (existing.status === 'failed') {
        throw new CustomerEmailError('This failed email attempt is closed. Start a new deliberate send.', {
          code: 'retry_with_new_key', status: 409,
        });
      }
      if (existing.status !== 'reserved') {
        throw new CustomerEmailError('The email operation state is unavailable.', { code: 'quota_state_invalid', status: 409 });
      }
      const reservedAtMillis = timestampMillis(existing.reservedAt);
      if (reservedAtMillis == null || now.getTime() - reservedAtMillis >= EMAIL_PROVIDER_SAFE_RETRY_MS) {
        throw new CustomerEmailError('This email retry window has expired. Start a new deliberate send.', {
          code: 'retry_window_expired', status: 409,
        });
      }
      return { kind: 'retry', operationId };
    }

    const platformCount = usageCount(platformSnapshot);
    const tenantCount = usageCount(tenantSnapshot);
    const actorCount = usageCount(actorSnapshot);
    if (platformCount >= PLATFORM_EMAIL_DAILY_LIMIT || tenantCount >= TENANT_EMAIL_DAILY_LIMIT ||
        actorCount >= ACTOR_EMAIL_HOURLY_LIMIT) {
      throw new CustomerEmailError('The email sending limit has been reached. Try again later.', {
        code: 'quota_exceeded', status: 429,
      });
    }
    const timestamp = serverTimestamp(admin);
    transaction.create(refs.operationRef, {
      schemaVersion: 1, tenantId: request.tenantId, uid, emailType: request.emailType,
      relatedEntityId: request.relatedEntityId, requestHash, status: 'reserved', reservedAt: timestamp,
      sentAt: null, failedAt: null, providerRequestId: null, providerErrorCode: null,
    });
    transaction.set(refs.platformUsageRef, {
      schemaVersion: 1, dayKey: refs.dayKey, count: platformCount + 1, updatedAt: timestamp,
    });
    transaction.set(refs.tenantUsageRef, {
      schemaVersion: 1, tenantId: request.tenantId, dayKey: refs.dayKey, count: tenantCount + 1, updatedAt: timestamp,
    });
    transaction.set(refs.actorUsageRef, {
      schemaVersion: 1, tenantId: request.tenantId, hourKey: refs.hourKey, count: actorCount + 1, updatedAt: timestamp,
    });
    return { kind: 'reserved', operationId };
  });
}

async function finalizeCustomerEmail({ admin, operationRef, requestHash, providerRequestId }) {
  return admin.firestore().runTransaction(async transaction => {
    const snapshot = await transaction.get(operationRef);
    const operation = snapshotData(snapshot);
    if (!operation || operation.requestHash !== requestHash) {
      throw new CustomerEmailError('The email operation state is unavailable.', { code: 'quota_state_invalid', status: 409 });
    }
    if (operation.status === 'sent') return operation.providerRequestId || providerRequestId;
    if (operation.status !== 'reserved') {
      throw new CustomerEmailError('The email operation state is unavailable.', { code: 'quota_state_invalid', status: 409 });
    }
    transaction.update(operationRef, {
      status: 'sent', sentAt: serverTimestamp(admin), providerRequestId, providerErrorCode: null,
    });
    return providerRequestId;
  });
}

async function failCustomerEmail({ admin, operationRef, requestHash, providerErrorCode }) {
  await admin.firestore().runTransaction(async transaction => {
    const snapshot = await transaction.get(operationRef);
    const operation = snapshotData(snapshot);
    if (!operation || operation.requestHash !== requestHash || operation.status !== 'reserved') return;
    transaction.update(operationRef, {
      status: 'failed', failedAt: serverTimestamp(admin), providerErrorCode,
    });
  });
}

function providerEnabledValue(providerEnabled) {
  try {
    if (typeof providerEnabled === 'function') return providerEnabled() === true;
    if (typeof providerEnabled?.value === 'function') return providerEnabled.value() === true;
    return providerEnabled === true;
  } catch {
    return false;
  }
}

function providerIdempotencyKey(operationId) {
  return `servicesos-${operationId}`;
}

function isConcurrentIdempotencyResponse(response, payload) {
  const code = String(payload?.name || payload?.code || payload?.error || '').toLowerCase();
  return response.status === 409 && code.includes('concurrent') && code.includes('idempot');
}

function isDefinitiveProviderRejection(response) {
  return response.status >= 400 && response.status < 500 && ![408, 409].includes(response.status);
}

async function sendThroughResend({ apiKey, fetchImpl, operationId, payload, timeoutMs = EMAIL_PROVIDER_TIMEOUT_MS }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': providerIdempotencyKey(operationId),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    return { body, response };
  } catch {
    throw new CustomerEmailError('Email delivery could not be confirmed. Retry this same email attempt.', {
      code: 'send_uncertain', status: 503,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function responseError(res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = cleanString(error?.code, 64) || 'email_failed';
  const message = status >= 500 && !(error instanceof CustomerEmailError)
    ? 'Email sending is temporarily unavailable.'
    : error.message;
  return res.status(status).json({ error: message, code });
}

function createSendCustomerEmailHandler({
  admin,
  apiKey = () => process.env.RESEND_API_KEY,
  cors,
  fetchImpl = global.fetch,
  now = () => new Date(),
  providerEnabled = false,
  providerTimeoutMs = EMAIL_PROVIDER_TIMEOUT_MS,
  senderEmail = 'notifications@servicesos.com',
  senderName = 'ServicesOS',
} = {}) {
  const handleRequest = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' });

    const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' });
    }
    let uid;
    try {
      uid = (await admin.auth().verifyIdToken(authHeader.slice('Bearer '.length).trim())).uid;
    } catch {
      return res.status(401).json({ error: 'Invalid authentication token', code: 'unauthenticated' });
    }

    try {
      const request = normalizeCustomerEmailRequest(req.body);
      const { tenant } = await verifyCustomerEmailActor({ db: admin.firestore(), tenantId: request.tenantId, uid });
      if (!providerEnabledValue(providerEnabled)) {
        throw new CustomerEmailError('Customer email sending is currently disabled.', { code: 'email_disabled', status: 503 });
      }
      const resolvedApiKey = cleanString(typeof apiKey === 'function' ? apiKey() : apiKey, 2_048);
      if (!resolvedApiKey || typeof fetchImpl !== 'function') {
        throw new CustomerEmailError('Customer email sending is not configured.', { code: 'email_disabled', status: 503 });
      }

      const replyTo = resolveTenantReplyTo(tenant);
      const requestHash = emailRequestHash({ request, replyTo, senderEmail, senderName, uid });
      const currentTime = now();
      const reservation = await reserveCustomerEmail({ admin, request, uid, requestHash, now: currentTime });
      if (reservation.kind === 'sent') {
        return res.status(200).json({
          success: true, reused: true, status: 'already_sent', id: reservation.providerRequestId,
          emailType: request.emailType,
        });
      }

      const db = admin.firestore();
      const refs = emailReferences(db, {
        tenantId: request.tenantId, uid, operationId: reservation.operationId, now: currentTime,
      });
      const providerPayload = {
        from: `${senderName} <${senderEmail}>`,
        to: [request.recipientEmail],
        subject: request.subject,
        ...(request.html ? { html: request.html } : { text: request.text }),
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(request.attachment ? {
          attachments: [{
            filename: request.attachment.filename,
            content: request.attachment.content,
          }],
        } : {}),
      };
      const { response, body } = await sendThroughResend({
        apiKey: resolvedApiKey, fetchImpl, operationId: reservation.operationId, payload: providerPayload,
        timeoutMs: providerTimeoutMs,
      });
      if (response.ok && typeof body?.id === 'string' && body.id.trim()) {
        const providerRequestId = cleanString(body.id, 256);
        const finalizedId = await finalizeCustomerEmail({
          admin, operationRef: refs.operationRef, requestHash, providerRequestId,
        });
        return res.status(200).json({
          success: true, reused: reservation.kind === 'retry', status: 'sent', id: finalizedId,
          emailType: request.emailType,
        });
      }
      if (isDefinitiveProviderRejection(response)) {
        await failCustomerEmail({
          admin, operationRef: refs.operationRef, requestHash,
          providerErrorCode: `provider_http_${response.status}`,
        });
        throw new CustomerEmailError('The email provider rejected this attempt.', { code: 'provider_failed', status: 502 });
      }
      const concurrent = isConcurrentIdempotencyResponse(response, body);
      throw new CustomerEmailError(
        concurrent
          ? 'This email attempt is still being processed. Retry the same attempt shortly.'
          : 'Email delivery could not be confirmed. Retry this same email attempt.',
        { code: 'send_uncertain', status: 503 },
      );
    } catch (error) {
      return responseError(res, error);
    }
  };
  return (req, res) => {
    if (req.method === 'OPTIONS') {
      return cors(req, res, () => res.status(204).send(''));
    }
    return new Promise((resolve, reject) => {
      cors(req, res, () => {
        Promise.resolve(handleRequest(req, res)).then(resolve, reject);
      });
    });
  };
}

module.exports = {
  ACTOR_EMAIL_HOURLY_LIMIT,
  EMAIL_PROVIDER_SAFE_RETRY_MS,
  EMAIL_PROVIDER_TIMEOUT_MS,
  MAX_PDF_ATTACHMENT_BYTES,
  MAX_PDF_ATTACHMENT_BASE64_LENGTH,
  PLATFORM_EMAIL_DAILY_LIMIT,
  TENANT_EMAIL_DAILY_LIMIT,
  CustomerEmailError,
  createSendCustomerEmailHandler,
  decodePdfAttachment,
  emailReferences,
  emailOperationId,
  emailRequestHash,
  normalizeCustomerEmailRequest,
  providerIdempotencyKey,
  reserveCustomerEmail,
  resolveTenantReplyTo,
  sendThroughResend,
  utcUsageKeys,
  verifyCustomerEmailActor,
};
