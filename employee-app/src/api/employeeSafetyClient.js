const { buildEmployeeFunctionUrl } = require('./employeeSessionClient');

function createEmployeeSafetyClient({ auth, runtimeConfig, fetchImpl }) {
  return async function sendSafetyAlert({ eventId, bookingId, location }) {
    const user = auth.currentUser;
    if (!user || typeof user.getIdToken !== 'function') throw new Error('unauthenticated');
    if (typeof eventId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(eventId)) throw new Error('invalid_request');
    if (typeof bookingId !== 'string' || !bookingId || bookingId.length > 128 || bookingId.includes('/')) {
      throw new Error('invalid_request');
    }
    const body = { eventId, bookingId, ...(location ? { location } : {}) };
    let response;
    try {
      response = await fetchImpl(buildEmployeeFunctionUrl(runtimeConfig, 'employeeSafetyGateway'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch { throw new Error('safety_unavailable'); }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success !== true || payload.eventId !== eventId || payload.status !== 'sent') {
      const error = new Error('safety_unavailable');
      error.code = typeof payload.code === 'string' ? payload.code : 'safety_unavailable';
      error.status = response.status;
      throw error;
    }
    return { eventId, createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : null, status: 'sent' };
  };
}

module.exports = { createEmployeeSafetyClient };
