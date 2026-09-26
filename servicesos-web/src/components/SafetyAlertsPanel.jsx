import { useEffect, useState } from 'react';
import { listOwnerSafetyAlerts } from '../services/ownerSafetyAlertsService';

export default function SafetyAlertsPanel({ tenantId }) {
  const [state, setState] = useState({ loading: true, alerts: [], error: false });

  async function load(active = () => true) {
    setState({ loading: true, alerts: [], error: false });
    try {
      const alerts = await listOwnerSafetyAlerts();
      if (active()) setState({ loading: false, alerts, error: false });
    } catch {
      if (active()) setState({ loading: false, alerts: [], error: true });
    }
  }

  useEffect(() => {
    if (!tenantId) return undefined;
    let active = true;
    listOwnerSafetyAlerts().then(alerts => {
      if (active) setState({ loading: false, alerts, error: false });
    }).catch(() => {
      if (active) setState({ loading: false, alerts: [], error: true });
    });
    return () => { active = false; };
  }, [tenantId]);

  return (
    <section aria-label="Safety alerts" style={{ padding: '16px 0', borderBottom: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>Safety alerts</h2>
        <button type="button" onClick={() => load()} disabled={state.loading}>Refresh</button>
      </div>
      {state.loading ? <p>Loading safety alerts...</p> : null}
      {state.error ? <p role="status">Safety alerts could not be loaded. Try again.</p> : null}
      {!state.loading && !state.error && state.alerts.length === 0 ? <p>No recent safety alerts.</p> : null}
      {state.alerts.length > 0 ? (
        <ul style={{ paddingLeft: 20 }}>
          {state.alerts.map(alert => (
            <li key={alert.eventId} style={{ marginTop: 8 }}>
              <strong>{alert.employeeDisplayName || 'Employee'}</strong>
              {' · '}{alert.createdAt ? new Date(alert.createdAt).toLocaleString() : 'Time unavailable'}
              {alert.bookingId ? ` · Job ${alert.bookingId}` : null}
              {alert.location && Number.isFinite(alert.location.latitude) && Math.abs(alert.location.latitude) <= 90 &&
                Number.isFinite(alert.location.longitude) && Math.abs(alert.location.longitude) <= 180 ? (
                <> {' · '}<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${alert.location.latitude},${alert.location.longitude}`)}`}
                  target="_blank" rel="noopener noreferrer">Open location</a></>
              ) : ' · Location unavailable'}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
