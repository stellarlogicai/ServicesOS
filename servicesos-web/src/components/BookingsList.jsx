import { useCallback, useEffect, useState } from 'react';
import { getJobs, updateBookingAdminFields } from '../core/scheduling/schedulingService';
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
  const [isEditingBooking, setIsEditingBooking] = useState(false);
  const [editForm, setEditForm] = useState({ date: '', startTime: '', notes: '' });
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

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

  const openBookingDetails = (booking) => {
    setSelectedBooking(booking);
    setIsEditingBooking(false);
    setEditError('');
    setSuccessMessage('');
  };

  const closeBookingDetails = () => {
    setSelectedBooking(null);
    setIsEditingBooking(false);
    setEditError('');
    setSuccessMessage('');
  };

  const startBookingEdit = () => {
    setEditForm({
      date: bookingDateInputValue(selectedBooking),
      startTime: bookingStartTimeInputValue(selectedBooking),
      notes: bookingNotes(selectedBooking) === 'No notes provided' ? '' : bookingNotes(selectedBooking),
    });
    setEditError('');
    setSuccessMessage('');
    setIsEditingBooking(true);
  };

  const cancelBookingEdit = () => {
    setIsEditingBooking(false);
    setEditError('');
  };

  const updateEditField = (event) => {
    const { name, value } = event.target;
    setEditForm(current => ({ ...current, [name]: value }));
  };

  const saveBookingEdit = async (event) => {
    event.preventDefault();
    if (!selectedBooking?.id) {
      setEditError('Booking could not be updated. Please close and try again.');
      return;
    }

    setSavingEdit(true);
    setEditError('');
    setSuccessMessage('');

    const form = event.currentTarget;
    const submittedDate = form.elements.date.value;
    const submittedStartTime = form.elements.startTime.value;
    const submittedNotes = form.elements.notes.value.trim();
    const patch = {
      date: submittedDate,
      startTime: submittedStartTime,
      endTime: endTimeForBookingEdit(selectedBooking, submittedStartTime),
      notes: submittedNotes,
    };

    const result = await updateBookingAdminFields(tenantId, selectedBooking.id, patch);
    if (!result.success) {
      setSavingEdit(false);
      setEditError(result.message || 'Booking could not be updated. Please check the fields and try again.');
      return;
    }

    await loadBookings();
    setSelectedBooking(current => current ? { ...current, ...result.data } : current);
    setSavingEdit(false);
    setIsEditingBooking(false);
    setSuccessMessage('Booking date and notes updated.');
  };

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
                onClick={() => openBookingDetails(booking)}
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
                onClick={closeBookingDetails}
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

            {successMessage && (
              <div role="status" style={{ marginTop: 18, padding: 12, border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 8, color: '#166534' }}>
                {successMessage}
              </div>
            )}

            {!isEditingBooking && (
              <button
                type="button"
                onClick={startBookingEdit}
                style={{
                  marginTop: 20,
                  border: '1px solid #2563eb',
                  background: '#2563eb',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '9px 14px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Edit Date &amp; Notes
              </button>
            )}

            {isEditingBooking && (
              <form onSubmit={saveBookingEdit} aria-label="Edit booking date and notes" style={{ marginTop: 22, padding: 16, border: '1px solid #dbeafe', background: '#eff6ff', borderRadius: 10 }}>
                <h3 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: 18 }}>Edit Date &amp; Notes</h3>

                <label style={{ display: 'block', marginBottom: 12, color: '#0f172a', fontWeight: 600 }}>
                  Date
                  <input
                    name="date"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{4}-\d{2}-\d{2}"
                    placeholder="YYYY-MM-DD"
                    value={editForm.date}
                    onChange={updateEditField}
                    required
                    style={{ display: 'block', width: '100%', marginTop: 6, padding: 9, border: '1px solid #cbd5e1', borderRadius: 8 }}
                  />
                </label>

                <label style={{ display: 'block', marginBottom: 12, color: '#0f172a', fontWeight: 600 }}>
                  Start time
                  <input
                    name="startTime"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{2}:\d{2}"
                    placeholder="HH:mm"
                    value={editForm.startTime}
                    onChange={updateEditField}
                    required
                    style={{ display: 'block', width: '100%', marginTop: 6, padding: 9, border: '1px solid #cbd5e1', borderRadius: 8 }}
                  />
                </label>

                <label style={{ display: 'block', marginBottom: 12, color: '#0f172a', fontWeight: 600 }}>
                  Notes
                  <textarea
                    name="notes"
                    value={editForm.notes}
                    onChange={updateEditField}
                    rows={5}
                    maxLength={1000}
                    style={{ display: 'block', width: '100%', marginTop: 6, padding: 9, border: '1px solid #cbd5e1', borderRadius: 8 }}
                  />
                </label>

                {editError && (
                  <div role="alert" style={{ marginBottom: 12, padding: 10, border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 8, color: '#991b1b' }}>
                    {editError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    style={{
                      border: '1px solid #2563eb',
                      background: savingEdit ? '#93c5fd' : '#2563eb',
                      color: '#fff',
                      borderRadius: 8,
                      padding: '9px 14px',
                      fontWeight: 700,
                      cursor: savingEdit ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {savingEdit ? 'Saving…' : 'Save changes'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelBookingEdit}
                    disabled={savingEdit}
                    style={{
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      color: '#0f172a',
                      borderRadius: 8,
                      padding: '9px 14px',
                      fontWeight: 700,
                      cursor: savingEdit ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function toDate(value) {
  if (!value) return null;
  const converted = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(converted.getTime()) ? null : converted;
}

function padTime(value) {
  return String(value).padStart(2, '0');
}

function timeToMinutes(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToTime(value) {
  const normalized = ((value % 1440) + 1440) % 1440;
  return `${padTime(Math.floor(normalized / 60))}:${padTime(normalized % 60)}`;
}

function bookingDateInputValue(booking = {}) {
  const scheduledAt = toDate(booking.scheduledAt);
  if (scheduledAt) {
    return `${scheduledAt.getFullYear()}-${padTime(scheduledAt.getMonth() + 1)}-${padTime(scheduledAt.getDate())}`;
  }
  return typeof booking.date === 'string' ? booking.date : '';
}

function bookingStartTimeInputValue(booking = {}) {
  const scheduledAt = toDate(booking.scheduledAt);
  if (scheduledAt) {
    return `${padTime(scheduledAt.getHours())}:${padTime(scheduledAt.getMinutes())}`;
  }
  return typeof booking.startTime === 'string' ? booking.startTime : '';
}

function bookingDurationMinutes(booking = {}) {
  const startMinutes = timeToMinutes(booking.startTime);
  const endMinutes = timeToMinutes(booking.endTime);
  if (startMinutes === null || endMinutes === null) return 120;
  const duration = endMinutes - startMinutes;
  return duration > 0 ? duration : 120;
}

function endTimeForBookingEdit(booking, startTime) {
  const startMinutes = timeToMinutes(startTime);
  if (startMinutes === null) return '';
  return minutesToTime(startMinutes + bookingDurationMinutes(booking));
}

function DetailItem({ label, value }) {
  return (
    <div>
      <dt style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</dt>
      <dd style={{ margin: '6px 0 0', color: '#0f172a' }}>{value}</dd>
    </div>
  );
}
