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
import './CalendarView.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(value) {
  return String(value).padStart(2, '0');
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

function DayBookings({ selectedDate, bookings }) {
  const displayDate = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <section className="calendar-day-panel" aria-labelledby="selected-day-title">
      <h2 id="selected-day-title">{displayDate}</h2>
      {bookings.length === 0 ? (
        <p>No bookings scheduled for this day.</p>
      ) : (
        <div className="calendar-day-bookings">
          {bookings.map((booking, index) => (
            <article className="calendar-booking-card" key={booking.id || `${bookingCalendarDateKey(booking)}-${index}`}>
              <div className="calendar-booking-heading">
                <div>
                  <h3>{bookingCustomerName(booking)}</h3>
                  <p>{bookingServiceType(booking)}</p>
                </div>
                <strong>{bookingStatus(booking)}</strong>
              </div>
              <dl>
                <dt>Schedule</dt><dd>{bookingSchedule(booking)}</dd>
                <dt>Address</dt><dd>{bookingAddress(booking)}</dd>
                <dt>Price</dt><dd>{bookingPrice(booking)}</dd>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
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
  };

  return (
    <section className="calendar-page" aria-labelledby="calendar-title">
      <header className="calendar-page-header">
        <div>
          <h1 id="calendar-title">Calendar</h1>
          <p>Read-only booking calendar</p>
        </div>
      </header>

      {loading && <p role="status">Loading calendar...</p>}

      {!loading && error && (
        <div role="alert" className="calendar-error">
          <p>{error}</p>
          {tenantId && <button type="button" onClick={loadBookings}>Try again</button>}
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
                    onClick={() => setSelectedDate(cell.date)}
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

          <DayBookings selectedDate={selectedDate} bookings={selectedBookings} />
        </>
      )}
    </section>
  );
}
