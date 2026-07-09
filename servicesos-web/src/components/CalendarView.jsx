import { useCallback, useEffect, useMemo, useState } from 'react';
import { getJobs } from '../core/scheduling/schedulingService';
import { useAuth } from '../contexts/AuthContext';
import {
  bookingAddress,
  bookingCustomerName,
  bookingPaymentStatus,
  bookingServiceType,
  bookingStatus,
} from './bookingDisplay';
import './CalendarView.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(value) {
  return String(value).padStart(2, '0');
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function bookingTime(booking = {}) {
  if (booking.scheduledAt) {
    const scheduledAt = typeof booking.scheduledAt?.toDate === 'function'
      ? booking.scheduledAt.toDate()
      : new Date(booking.scheduledAt);
    if (!Number.isNaN(scheduledAt.getTime())) {
      return scheduledAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
  }
  return booking.startTime || booking.time || booking.appointmentTime || 'Time not set';
}

function bookingCalendarDateKey(booking = {}) {
  if (booking.scheduledAt) {
    const scheduledAt = typeof booking.scheduledAt?.toDate === 'function'
      ? booking.scheduledAt.toDate()
      : new Date(booking.scheduledAt);
    if (!Number.isNaN(scheduledAt.getTime())) return dateKey(scheduledAt);
  }

  const storedDate = booking.date || booking.appointmentDate;
  return typeof storedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(storedDate)
    ? storedDate
    : '';
}

function monthCells(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const leadingBlanks = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return [
    ...Array.from({ length: leadingBlanks }, (_, index) => ({ key: `before-${index}` })),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const date = new Date(year, month, index + 1);
      return { key: dateKey(date), date, day: index + 1 };
    }),
  ];
}

function DayBookings({ selectedDate, bookings, onClose }) {
  const displayDate = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="v1-modal-overlay" onClick={onClose}>
      <section className="v1-modal calendar-day-modal" role="dialog" aria-modal="true" aria-labelledby="selected-day-title" onClick={event => event.stopPropagation()}>
        <header className="calendar-day-modal-header">
          <div>
            <h2 id="selected-day-title">{displayDate}</h2>
            <p>{bookings.length} {bookings.length === 1 ? 'booking' : 'bookings'} scheduled</p>
          </div>
          <button type="button" className="v1-button v1-button-secondary" onClick={onClose}>Close</button>
        </header>
      {bookings.length === 0 ? (
        <div className="v1-empty-state" style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#475569' }}>No bookings scheduled</div>
          <div style={{ fontSize: 14 }}>New jobs appear here after they are created in Bookings.</div>
        </div>
      ) : (
        <div className="calendar-day-bookings">
          {bookings.map((booking, index) => (
            <article className="calendar-booking-card" key={booking.id || `${bookingCalendarDateKey(booking)}-${index}`}>
              <div className="calendar-booking-heading">
                <div>
                  <h3>{bookingCustomerName(booking)}</h3>
                  <p>{bookingServiceType(booking)}</p>
                </div>
                <div className="calendar-schedule-badges">
                  <span className="v1-pill">{bookingStatus(booking)}</span>
                  <span className="v1-pill v1-pill-payment">{bookingPaymentStatus(booking)}</span>
                </div>
              </div>
              <dl>
                <dt>Time</dt><dd>{bookingTime(booking)}</dd>
                <dt>Address</dt><dd>{bookingAddress(booking)}</dd>
              </dl>
            </article>
          ))}
        </div>
      )}
      </section>
    </div>
  );
}

export default function CalendarView() {
  const { tenantId } = useAuth();
  const today = useMemo(() => new Date(), []);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [dayDialogOpen, setDayDialogOpen] = useState(false);

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
    return () => { isActive = false; };
  }, [loadBookings]);

  useEffect(() => {
    if (!dayDialogOpen) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape') setDayDialogOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [dayDialogOpen]);

  const bookingsByDate = useMemo(() => {
    const grouped = new Map();
    bookings.forEach(booking => {
      const key = bookingCalendarDateKey(booking);
      if (!key) return;
      const existing = grouped.get(key) || [];
      existing.push(booking);
      grouped.set(key, existing);
    });
    return grouped;
  }, [bookings]);

  const cells = useMemo(() => monthCells(visibleMonth), [visibleMonth]);
  const selectedBookings = bookingsByDate.get(dateKey(selectedDate)) || [];
  const monthHeading = visibleMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const changeMonth = offset => {
    const nextMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
    setVisibleMonth(nextMonth);
    setSelectedDate(nextMonth);
    setDayDialogOpen(false);
  };

  return (
    <section className="v1-page calendar-page" aria-labelledby="calendar-title">
      <header className="calendar-page-header" style={{ marginBottom: 32 }}>
        <div>
          <h1 className="v1-page-title" id="calendar-title">Calendar</h1>
          <p className="v1-page-subtitle">Read-only schedule view. Change bookings and payment details from Bookings.</p>
        </div>
      </header>

      {loading && <p role="status">Loading calendar...</p>}

      {!loading && error && (
        <div role="alert" className="calendar-error" style={{ padding: 16, border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 8, color: '#991b1b' }}>
          <p>{error}</p>
          {tenantId && <button type="button" onClick={loadBookings} style={{ marginTop: 10, padding: '8px 12px', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Try again</button>}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="calendar-month-toolbar">
            <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous Month">Previous Month</button>
            <h2 aria-live="polite">{monthHeading}</h2>
            <button type="button" onClick={() => changeMonth(1)} aria-label="Next Month">Next Month</button>
          </div>

          <div className="calendar-grid-wrap">
            <div className="calendar-grid" aria-label={`${monthHeading} month calendar`}>
              {WEEKDAYS.map(day => <div className="calendar-weekday" key={day}>{day}</div>)}
              {cells.map(cell => {
                if (!cell.date) return <div className="calendar-day calendar-day-blank" aria-hidden="true" key={cell.key} />;
                const dayBookings = bookingsByDate.get(cell.key) || [];
                const selected = cell.key === dateKey(selectedDate);
                const label = `${cell.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}, ${dayBookings.length} ${dayBookings.length === 1 ? 'booking' : 'bookings'}`;
                return (
                  <button
                    type="button"
                    className={`calendar-day${selected ? ' calendar-day-selected' : ''}`}
                    aria-label={`Select ${label}`}
                    aria-pressed={selected}
                    key={cell.key}
                    onClick={() => {
                      setSelectedDate(cell.date);
                      setDayDialogOpen(true);
                    }}
                  >
                    <span className="calendar-day-number">{cell.day}</span>
                    {dayBookings.length > 0 && (
                      <>
                        <span className="calendar-booking-count">{dayBookings.length} {dayBookings.length === 1 ? 'booking' : 'bookings'}</span>
                        {dayBookings.slice(0, 2).map((booking, index) => (
                          <span className="calendar-booking-chip" key={booking.id || `${cell.key}-${index}`}>
                            {bookingCustomerName(booking)}
                          </span>
                        ))}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {dayDialogOpen && <DayBookings selectedDate={selectedDate} bookings={selectedBookings} onClose={() => setDayDialogOpen(false)} />}
        </>
      )}
    </section>
  );
}
