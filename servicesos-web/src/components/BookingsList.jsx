import { useCallback, useEffect, useState } from 'react';
import { getJobs } from '../core/scheduling/schedulingService';
import { useAuth } from '../contexts/AuthContext';
import {
  bookingAddress,
  bookingCustomerName,
  bookingPrice,
  bookingSchedule,
  bookingServiceType,
  bookingStatus,
} from './bookingDisplay';

export default function BookingsList() {
  const { tenantId } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError('');

    if (!tenantId) {
      setBookings([]);
      setError('Bookings could not be loaded. Your tenant is unavailable.');
      setLoading(false);
      return;
    }

    try {
      const result = await getJobs(tenantId);
      if (result.success) {
        setBookings(Array.isArray(result.data) ? result.data : []);
      } else {
        setBookings([]);
        setError('Bookings could not be loaded. Please try again.');
      }
    } catch {
      setBookings([]);
      setError('Bookings could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    let isActive = true;
    Promise.resolve().then(() => {
      if (isActive) loadBookings();
    });
    return () => {
      isActive = false;
    };
  }, [loadBookings]);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 0' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: 28 }}>Bookings</h1>
        <p style={{ margin: 0, color: '#64748b' }}>View confirmed jobs for your business.</p>
      </div>

      {loading && <p role="status">Loading bookings…</p>}

      {!loading && error && (
        <div role="alert" style={{ padding: 16, border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 8, color: '#991b1b' }}>
          <div>{error}</div>
          <button type="button" onClick={loadBookings} style={{ marginTop: 10 }}>Retry</button>
        </div>
      )}

      {!loading && !error && bookings.length === 0 && (
        <div style={{ padding: 24, border: '1px solid #e2e8f0', borderRadius: 8, color: '#475569' }}>
          No bookings yet. Approved quote requests will appear here.
        </div>
      )}

      {!loading && !error && bookings.length > 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          {bookings.map((booking, index) => (
            <article key={booking?.id || `booking-${index}`} style={{ padding: 18, border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: '0 0 6px', fontSize: 18, color: '#0f172a' }}>{bookingCustomerName(booking)}</h2>
                  <div style={{ color: '#475569' }}>{bookingServiceType(booking)}</div>
                </div>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>{bookingStatus(booking)}</div>
              </div>
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, margin: '16px 0 0' }}>
                <div><dt style={{ color: '#64748b', fontSize: 12 }}>Scheduled</dt><dd style={{ margin: '4px 0 0' }}>{bookingSchedule(booking)}</dd></div>
                <div><dt style={{ color: '#64748b', fontSize: 12 }}>Address</dt><dd style={{ margin: '4px 0 0' }}>{bookingAddress(booking)}</dd></div>
                <div><dt style={{ color: '#64748b', fontSize: 12 }}>Price</dt><dd style={{ margin: '4px 0 0' }}>{bookingPrice(booking)}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
