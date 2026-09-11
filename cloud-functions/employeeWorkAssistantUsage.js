const crypto = require('node:crypto');
const { FieldValue } = require('firebase-admin/firestore');
const { localDateKey } = require('./employeeJobPacketProjection');

const EMPLOYEE_DAILY_LIMIT = 20;
const TENANT_DAILY_LIMIT = 100;
const EMPLOYEE_CONCURRENCY_LIMIT = 1;
const TENANT_CONCURRENCY_LIMIT = 3;
const IN_FLIGHT_LEASE_MS = 60_000;

class EmployeeWorkAssistantUsageError extends Error {
  constructor(message, { code = 'usage_unavailable', status = 409 } = {}) {
    super(message);
    this.name = 'EmployeeWorkAssistantUsageError';
    this.code = code;
    this.status = status;
  }
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function serverTimestamp(admin) {
  return admin.firestore?.FieldValue?.serverTimestamp?.() || FieldValue.serverTimestamp();
}

function activeLeases(value, nowMs) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, expiresAt]) => (
    /^[a-f0-9]{64}$/.test(key) && typeof expiresAt === 'string' && Date.parse(expiresAt) > nowMs
  )));
}

function usageCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function usageRefs(db, employee, dateKey, requestKey) {
  const dayRef = db.collection('tenants').doc(employee.tenantId)
    .collection('employeeWorkAssistantUsage').doc(dateKey);
  return {
    dayRef,
    employeeRef: dayRef.collection('employees').doc(hash(employee.uid)),
    requestRef: dayRef.collection('requests').doc(requestKey),
  };
}

function requestFingerprint(employee, request) {
  return hash(JSON.stringify({
    uid: employee.uid,
    bookingId: request.bookingId,
    question: request.question,
    checklistItemId: request.checklistItemId || null,
  }));
}

async function reserveEmployeeWorkAssistantUsage({ admin, employee, request, now = new Date() }) {
  const db = admin.firestore();
  const dateKey = localDateKey(now, employee.tenantTimeZone);
  if (!dateKey) throw new EmployeeWorkAssistantUsageError('Usage state is unavailable.', { status: 503 });
  const requestKey = hash(`${employee.uid}:${request.requestId}`);
  const fingerprint = requestFingerprint(employee, request);
  const refs = usageRefs(db, employee, dateKey, requestKey);
  const nowMs = now.getTime();
  const leaseExpiresAt = new Date(nowMs + IN_FLIGHT_LEASE_MS).toISOString();
  const attemptId = crypto.randomUUID();

  return db.runTransaction(async transaction => {
    const [daySnapshot, employeeSnapshot, requestSnapshot] = await Promise.all([
      transaction.get(refs.dayRef),
      transaction.get(refs.employeeRef),
      transaction.get(refs.requestRef),
    ]);
    const existingRequest = requestSnapshot.exists ? requestSnapshot.data() || {} : null;
    if (existingRequest && existingRequest.requestFingerprint !== fingerprint) {
      throw new EmployeeWorkAssistantUsageError('This request ID was already used.', {
        code: 'idempotency_conflict', status: 409,
      });
    }
    if (existingRequest?.status === 'succeeded') {
      return { kind: 'succeeded', requestId: request.requestId };
    }
    if (existingRequest?.status === 'in_flight' && Date.parse(existingRequest.leaseExpiresAt) > nowMs) {
      throw new EmployeeWorkAssistantUsageError('This request is already processing.', {
        code: 'request_in_progress', status: 409,
      });
    }

    const day = daySnapshot.exists ? daySnapshot.data() || {} : {};
    const employeeDay = employeeSnapshot.exists ? employeeSnapshot.data() || {} : {};
    const dayLeases = activeLeases(day.inFlight, nowMs);
    const employeeLeases = activeLeases(employeeDay.inFlight, nowMs);
    let tenantUsed = usageCount(day.providerRequests);
    let employeeUsed = usageCount(employeeDay.providerRequests);

    // A stale attempt with the same request did not complete and may be retried once
    // its lease expires without consuming a second allowance unit.
    if (existingRequest?.status === 'in_flight') {
      tenantUsed = Math.max(0, tenantUsed - 1);
      employeeUsed = Math.max(0, employeeUsed - 1);
    }
    if (employeeUsed >= EMPLOYEE_DAILY_LIMIT || tenantUsed >= TENANT_DAILY_LIMIT) {
      throw new EmployeeWorkAssistantUsageError('AI explanation allowance is temporarily unavailable.', {
        code: 'usage_limit', status: 429,
      });
    }
    if (Object.keys(employeeLeases).length >= EMPLOYEE_CONCURRENCY_LIMIT ||
        Object.keys(dayLeases).length >= TENANT_CONCURRENCY_LIMIT) {
      throw new EmployeeWorkAssistantUsageError('AI explanation is already processing.', {
        code: 'concurrency_limit', status: 429,
      });
    }

    dayLeases[requestKey] = leaseExpiresAt;
    employeeLeases[requestKey] = leaseExpiresAt;
    transaction.set(refs.dayRef, {
      schemaVersion: 1,
      dateKey,
      providerRequests: tenantUsed + 1,
      inFlight: dayLeases,
      updatedAt: serverTimestamp(admin),
    }, { merge: true });
    transaction.set(refs.employeeRef, {
      schemaVersion: 1,
      employeeUidHash: hash(employee.uid),
      dateKey,
      providerRequests: employeeUsed + 1,
      inFlight: employeeLeases,
      updatedAt: serverTimestamp(admin),
    }, { merge: true });
    transaction.set(refs.requestRef, {
      schemaVersion: 1,
      requestIdHash: requestKey,
      requestFingerprint: fingerprint,
      status: 'in_flight',
      attemptId,
      leaseExpiresAt,
      failureCode: null,
      updatedAt: serverTimestamp(admin),
    }, { merge: true });
    return { kind: 'reserved', ...refs, requestKey, attemptId, dateKey };
  });
}

async function settleEmployeeWorkAssistantUsage({ admin, reservation, succeeded, failureCode = null }) {
  if (reservation?.kind !== 'reserved') return;
  const db = admin.firestore();
  await db.runTransaction(async transaction => {
    const [daySnapshot, employeeSnapshot, requestSnapshot] = await Promise.all([
      transaction.get(reservation.dayRef),
      transaction.get(reservation.employeeRef),
      transaction.get(reservation.requestRef),
    ]);
    if (!requestSnapshot.exists || requestSnapshot.data()?.attemptId !== reservation.attemptId ||
        requestSnapshot.data()?.status !== 'in_flight') return;
    const day = daySnapshot.exists ? daySnapshot.data() || {} : {};
    const employeeDay = employeeSnapshot.exists ? employeeSnapshot.data() || {} : {};
    const dayLeases = { ...(day.inFlight || {}) };
    const employeeLeases = { ...(employeeDay.inFlight || {}) };
    delete dayLeases[reservation.requestKey];
    delete employeeLeases[reservation.requestKey];
    transaction.set(reservation.dayRef, {
      providerRequests: Math.max(0, usageCount(day.providerRequests) - (succeeded ? 0 : 1)),
      inFlight: dayLeases,
      updatedAt: serverTimestamp(admin),
    }, { merge: true });
    transaction.set(reservation.employeeRef, {
      providerRequests: Math.max(0, usageCount(employeeDay.providerRequests) - (succeeded ? 0 : 1)),
      inFlight: employeeLeases,
      updatedAt: serverTimestamp(admin),
    }, { merge: true });
    transaction.set(reservation.requestRef, {
      status: succeeded ? 'succeeded' : 'failed',
      leaseExpiresAt: null,
      failureCode: succeeded ? null : String(failureCode || 'provider_error').slice(0, 64),
      updatedAt: serverTimestamp(admin),
    }, { merge: true });
  });
}

module.exports = {
  EMPLOYEE_CONCURRENCY_LIMIT,
  EMPLOYEE_DAILY_LIMIT,
  EmployeeWorkAssistantUsageError,
  serverTimestamp,
  TENANT_CONCURRENCY_LIMIT,
  TENANT_DAILY_LIMIT,
  reserveEmployeeWorkAssistantUsage,
  settleEmployeeWorkAssistantUsage,
};
