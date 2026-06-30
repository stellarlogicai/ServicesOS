import { useCallback, useEffect, useMemo, useState } from 'react';
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

function bookingSortValue(booking) {
  const date = booking?.date || booking?.appointmentDate || '';
  const time = booking?.startTime || booking?.time || booking?.appointmentTime || '';
  return `${date}T${time}`;
}

export default function CalendarView() {
  const { tenantId } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError('');

    if (!tenantId) {
      setBookings([]);
      setError('Calendar could not be loaded. Your tenant is unavailable.');
      setLoading(false);
      return;
    }

    try {
      const result = await getJobs(tenantId);
      if (!result.success) {
        setBookings([]);
        setError('Calendar could not be loaded. Please try again.');
        return;
      }
      setBookings(Array.isArray(result.data) ? result.data : []);
    } catch {
      setBookings([]);
      setError('Calendar could not be loaded. Please try again.');
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

  const orderedBookings = useMemo(
    () => [...bookings].sort((left, right) => bookingSortValue(left).localeCompare(bookingSortValue(right))),
    [bookings],
  );

  return (
    <section style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }} aria-labelledby="calendar-title">
      <header style={{ marginBottom: 24 }}>
        <h1 id="calendar-title" style={{ margin: '0 0 8px', color: '#0f172a' }}>Calendar</h1>
        <p style={{ margin: 0, color: '#64748b' }}>Read-only booking calendar</p>
      </header>

      {loading && <p role="status">Loading calendar...</p>}

      {!loading && error && (
        <div role="alert" style={{ padding: 16, border: '1px solid #fecaca', borderRadius: 8, background: '#fef2f2' }}>
          <p style={{ margin: '0 0 12px' }}>{error}</p>
          {tenantId && <button type="button" onClick={loadBookings}>Try again</button>}
        </div>
      )}

      {!loading && !error && orderedBookings.length === 0 && (
        <p>No bookings to display.</p>
      )}

      {!loading && !error && orderedBookings.length > 0 && (
        <div aria-label="Booking calendar" style={{ display: 'grid', gap: 12 }}>
          {orderedBookings.map((booking, index) => (
            <article
              key={booking.id || `${bookingSortValue(booking)}-${index}`}
              style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: '0 0 4px', fontSize: 18, color: '#0f172a' }}>
                    {bookingCustomerName(booking)}
                  </h2>
                  <p style={{ margin: 0, color: '#475569' }}>{bookingServiceType(booking)}</p>
                </div>
                <strong>{bookingStatus(booking)}</strong>
              </div>
              <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 12px', margin: '16px 0 0' }}>
                <dt>Schedule</dt><dd style={{ margin: 0 }}>{bookingSchedule(booking)}</dd>
                <dt>Address</dt><dd style={{ margin: 0 }}>{bookingAddress(booking)}</dd>
                <dt>Price</dt><dd style={{ margin: 0 }}>{bookingPrice(booking)}</dd>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
