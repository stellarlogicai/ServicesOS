import { auth } from '../firebase';
import { resolveOwnerOnboardingGatewayUrl } from './ownerOnboardingService';

export async function listOwnerSafetyAlerts({ user = auth.currentUser, fetchImpl = fetch } = {}) {
  if (!user || typeof user.getIdToken !== 'function') throw new Error('Safety alerts are unavailable.');
  let response;
  try {
    response = await fetchImpl(resolveOwnerOnboardingGatewayUrl(import.meta.env, 'ownerSafetyAlertsGateway'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch { throw new Error('Safety alerts are unavailable.'); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true || !Array.isArray(payload.alerts) || payload.alerts.length > 25) {
    throw new Error('Safety alerts are unavailable.');
  }
  return payload.alerts.map(value => {
    const location = value?.location;
    return {
      eventId: typeof value?.eventId === 'string' ? value.eventId.slice(0, 128) : '',
      employeeDisplayName: typeof value?.employeeDisplayName === 'string' ? value.employeeDisplayName.slice(0, 160) : '',
      createdAt: typeof value?.createdAt === 'string' && value.createdAt.length <= 40 &&
        !Number.isNaN(Date.parse(value.createdAt)) ? value.createdAt : null,
      bookingId: typeof value?.bookingId === 'string' ? value.bookingId.slice(0, 128) : null,
      location: location && Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90 &&
        Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180
        ? { latitude: location.latitude, longitude: location.longitude } : null,
    };
  }).filter(value => value.eventId);
}
