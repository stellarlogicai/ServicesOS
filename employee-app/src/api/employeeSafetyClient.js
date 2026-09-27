const { buildEmployeeFunctionUrl } = require('./employeeSessionClient');
const SAFETY_REQUEST_TIMEOUT_MS = 12_000;

class EmployeeSafetyClientError extends Error {
  constructor(code, { status = 0, retryable = false } = {}) {
    super(code);
    this.name = 'EmployeeSafetyClientError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function clientError(code, options) {
  return new EmployeeSafetyClientError(code, options);
}

function isRetryableSafetyError(error) {
  return error instanceof EmployeeSafetyClientError && error.retryable === true;
}

function withTransportTimeout(promise, milliseconds = SAFETY_REQUEST_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(clientError('safety_timeout', { retryable: true })), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

function createEmployeeSafetyClient({ auth, runtimeConfig, fetchImpl }) {
  return async function sendSafetyAlert({ eventId, bookingId, location }) {
    const user = auth.currentUser;
    if (!user || typeof user.getIdToken !== 'function') throw clientError('unauthenticated');
    if (typeof eventId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(eventId)) throw clientError('invalid_request');
    if (typeof bookingId !== 'string' || !bookingId || bookingId.length > 128 || bookingId.includes('/')) {
      throw clientError('invalid_request');
    }
    const body = { eventId, bookingId, ...(location ? { location } : {}) };
    let token;
    try {
      token = await user.getIdToken();
    } catch {
      throw clientError('unauthenticated');
    }
    let response;
    try {
      response = await withTransportTimeout(fetchImpl(buildEmployeeFunctionUrl(runtimeConfig, 'employeeSafetyGateway'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }));
    } catch (error) {
      if (isRetryableSafetyError(error)) throw error;
      throw clientError('safety_unavailable', { retryable: true });
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success !== true || payload.eventId !== eventId || payload.status !== 'sent') {
      const status = Number.isInteger(response.status) ? response.status : 0;
      const code = typeof payload.code === 'string' ? payload.code : 'safety_unavailable';
      throw clientError(code, { status, retryable: status === 408 || status === 429 || status >= 500 });
    }
    return { eventId, createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : null, status: 'sent' };
  };
}

module.exports = {
  EmployeeSafetyClientError,
  SAFETY_REQUEST_TIMEOUT_MS,
  createEmployeeSafetyClient,
  isRetryableSafetyError,
  withTransportTimeout,
};
