import { useCallback, useEffect, useState } from 'react';
import { getJobs } from '../core/scheduling/schedulingService';
import { useAuth } from '../contexts/AuthContext';
import {
  bookingAddress,
  bookingCustomerEmail,
  bookingCustomerName,
  bookingCustomerPhone,
  bookingNotes,
  bookingPrice,
  bookingReference,
  bookingSchedule,
  bookingServiceType,
  bookingStatus,
} from './bookingDisplay';

export default function BookingsList() {
  const { tenantId } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);

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
        setSelectedBooking(null);
      } else {
        setBookings([]);
        setSelectedBooking(null);
        setError('Bookings could not be loaded. Please try again.');
      }
    } catch {
      setBookings([]);
      setSelectedBooking(null);
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
              <button
                type="button"
                onClick={() => setSelectedBooking(booking)}
                style={{
                  marginTop: 16,
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#0f172a',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                View Details
              </button>
            </article>
          ))}
        </div>
      )}

      {selectedBooking && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-detail-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.42)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 50
          }}
        >
          <div style={{ width: 'min(680px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 12, boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
              <div>
                <p style={{ margin: '0 0 6px', color: '#64748b', fontSize: 13 }}>Booking details</p>
                <h2 id="booking-detail-title" style={{ margin: 0, color: '#0f172a', fontSize: 24 }}>{bookingCustomerName(selectedBooking)}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                aria-label="Close booking details"
                style={{
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  borderRadius: 8,
                  padding: '7px 10px',
                  cursor: 'pointer',
                  color: '#0f172a'
                }}
              >
                Close
              </button>
            </div>

            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, margin: '22px 0 0' }}>
              <DetailItem label="Customer email" value={bookingCustomerEmail(selectedBooking)} />
              <DetailItem label="Customer phone" value={bookingCustomerPhone(selectedBooking)} />
              <DetailItem label="Service" value={bookingServiceType(selectedBooking)} />
              <DetailItem label="Status" value={bookingStatus(selectedBooking)} />
              <DetailItem label="Scheduled" value={bookingSchedule(selectedBooking)} />
              <DetailItem label="Address" value={bookingAddress(selectedBooking)} />
              <DetailItem label="Price" value={bookingPrice(selectedBooking)} />
              <DetailItem label="Reference" value={bookingReference(selectedBooking) || 'Reference not provided'} />
            </dl>

            <div style={{ marginTop: 18 }}>
              <dt style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Notes</dt>
              <dd style={{ margin: '6px 0 0', color: '#0f172a', whiteSpace: 'pre-wrap' }}>{bookingNotes(selectedBooking)}</dd>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div>
      <dt style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</dt>
      <dd style={{ margin: '6px 0 0', color: '#0f172a' }}>{value}</dd>
    </div>
  );
}
