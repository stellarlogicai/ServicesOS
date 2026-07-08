import { useCallback, useEffect, useMemo, useState } from 'react';
import { getJobs } from '../core/scheduling/schedulingService';
import { useAuth } from '../contexts/AuthContext';
import {
  bookingAddress,
  bookingCustomerName,
  bookingCustomerPhone,
  bookingNotes,
  bookingPaymentStatus,
  bookingSchedule,
  bookingServiceType,
  bookingStatus,
} from './bookingDisplay';
import './FieldMode.css';

function pad(value) {
  return String(value).padStart(2, '0');
}

function localDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function bookingDateKey(booking = {}) {
  if (booking.scheduledAt) {
    const scheduled = typeof booking.scheduledAt?.toDate === 'function'
      ? booking.scheduledAt.toDate()
      : new Date(booking.scheduledAt);
    if (!Number.isNaN(scheduled.getTime())) return localDateKey(scheduled);
  }
  const stored = booking.date || booking.appointmentDate;
  return typeof stored === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(stored) ? stored : '';
}

function sortValue(booking) {
  return `${bookingDateKey(booking)}T${booking.startTime || booking.time || booking.appointmentTime || '23:59'}`;
}

function shouldUseMapsFallback() {
  if (window.__SERVICESOS_ALLOW_MAPS_AUTO_OPEN__ === true) return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '';
}

function JobCard({ booking, onOpen }) {
  return (
    <article className="v1-card field-job-card">
      <div className="field-job-card-header">
        <div>
          <div className="field-job-time">{bookingSchedule(booking)}</div>
          <h2>{bookingCustomerName(booking)}</h2>
          <p>{bookingServiceType(booking)}</p>
        </div>
        <div className="field-job-badges">
          <span className="v1-pill">{bookingStatus(booking)}</span>
          <span className="v1-pill v1-pill-payment">{bookingPaymentStatus(booking)}</span>
        </div>
      </div>
      <div className="field-job-address">{bookingAddress(booking)}</div>
      <button className="v1-button v1-button-secondary" type="button" onClick={() => onOpen(booking)}>Open job packet</button>
    </article>
  );
}

function JobPacket({ booking, onClose }) {
  const [actionMessage, setActionMessage] = useState('');
  const phone = bookingCustomerPhone(booking);
  const address = bookingAddress(booking);
  const hasPhone = phone !== 'Phone not provided';
  const hasAddress = address !== 'Address not provided';
  const mapsUrl = hasAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '';
  const defaultActionMessage = 'Maps opens in a new tab/window where supported. Calls require a phone-capable device.';
  const mapsFallbackMessage = 'Maps could not open automatically. Copy the address and open it in your maps app.';
  const callFallbackMessage = 'If nothing opened, your device/browser may not support phone calls from this page.';
  const displayedActionMessage = actionMessage || defaultActionMessage;
  const handleCallCustomer = event => {
    event.stopPropagation();
    setActionMessage(callFallbackMessage);
  };
  const openMapsInNewTab = event => {
    event.preventDefault();
    event.stopPropagation();
    setActionMessage('');
    if (shouldUseMapsFallback()) {
      setActionMessage(mapsFallbackMessage);
      return;
    }
    const opened = window.open(mapsUrl, '_blank', 'noopener,noreferrer');
    if (opened === null) {
      setActionMessage(mapsFallbackMessage);
    }
  };
  const copyAddress = async event => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      setActionMessage('Address copied.');
    } catch {
      setActionMessage(mapsFallbackMessage);
    }
  };

  return (
    <div className="v1-modal-overlay" onClick={onClose}>
      <section className="v1-modal field-job-packet" role="dialog" aria-modal="true" aria-labelledby="field-job-title" onClick={event => event.stopPropagation()}>
        <header className="field-job-packet-header">
          <div>
            <p>Read-only job packet</p>
            <h2 id="field-job-title">{bookingCustomerName(booking)}</h2>
          </div>
          <button className="v1-button v1-button-secondary" type="button" onClick={onClose}>Close</button>
        </header>
        <div className="field-job-badges">
          <span className="v1-pill">{bookingStatus(booking)}</span>
          <span className="v1-pill v1-pill-payment">{bookingPaymentStatus(booking)}</span>
        </div>
        <dl className="field-job-details">
          <dt>Schedule</dt><dd>{bookingSchedule(booking)}</dd>
          <dt>Service</dt><dd>{bookingServiceType(booking)}</dd>
          <dt>Address</dt><dd>{address}</dd>
          <dt>Notes</dt><dd>{bookingNotes(booking)}</dd>
          <dt>Phone</dt><dd>{phone}</dd>
        </dl>
        <section className="field-job-actions" aria-labelledby="field-job-actions-title">
          <h3 id="field-job-actions-title">Field actions</h3>
          <div className="field-job-action-buttons">
            {hasPhone ? <a className="v1-button v1-button-primary" href={`tel:${phone}`} onClick={handleCallCustomer}>Call customer</a> : <span className="field-job-unavailable">Call unavailable</span>}
            {hasAddress ? (
              <>
                <button className="v1-button v1-button-secondary" type="button" onClick={openMapsInNewTab}>Open in maps</button>
                <button className="v1-button v1-button-secondary" type="button" onClick={copyAddress}>Copy address</button>
              </>
            ) : <span className="field-job-unavailable">Maps unavailable</span>}
          </div>
          <div className="field-job-action-status" role="status">{displayedActionMessage}</div>
        </section>
      </section>
    </div>
  );
}

export default function FieldMode() {
  const { tenantId } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    if (!tenantId) {
      setBookings([]);
      setError('Field Mode could not be loaded. Your tenant is unavailable.');
      setLoading(false);
      return;
    }
    try {
      const result = await getJobs(tenantId);
      if (!result.success) throw new Error('load-failed');
      setBookings(Array.isArray(result.data) ? result.data : []);
    } catch {
      setBookings([]);
      setError('Field Mode could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => active && load());
    return () => { active = false; };
  }, [load]);

  const grouped = useMemo(() => {
    const today = localDateKey(new Date());
    const ordered = [...bookings].filter(booking => bookingDateKey(booking) >= today).sort((a, b) => sortValue(a).localeCompare(sortValue(b)));
    return {
      today: ordered.filter(booking => bookingDateKey(booking) === today),
      upcoming: ordered.filter(booking => bookingDateKey(booking) > today),
    };
  }, [bookings]);

  return (
    <section className="v1-page field-mode-page" aria-labelledby="field-mode-title">
      <div className="v1-page-header">
        <h1 className="v1-page-title" id="field-mode-title">Field Mode</h1>
        <p className="v1-page-subtitle">Read-only job packets for today and upcoming work. Use Bookings to change jobs or payment details.</p>
      </div>
      {loading && <p role="status">Loading Field Mode…</p>}
      {!loading && error && <div className="v1-empty-state" role="alert">{error}{tenantId && <><br /><button className="v1-button v1-button-secondary" type="button" onClick={load}>Try again</button></>}</div>}
      {!loading && !error && (
        <div className="field-mode-sections">
          <section aria-labelledby="today-jobs-title">
            <h2 id="today-jobs-title">Today</h2>
            {grouped.today.length ? grouped.today.map((booking, index) => <JobCard booking={booking} onOpen={setSelectedBooking} key={booking.id || `today-${index}`} />) : <div className="v1-empty-state">No jobs scheduled for today. Upcoming job packets will appear below.</div>}
          </section>
          <section aria-labelledby="upcoming-jobs-title">
            <h2 id="upcoming-jobs-title">Upcoming</h2>
            {grouped.upcoming.length ? grouped.upcoming.map((booking, index) => <JobCard booking={booking} onOpen={setSelectedBooking} key={booking.id || `upcoming-${index}`} />) : <div className="v1-empty-state">No upcoming jobs scheduled. Approved bookings will show here for field reference.</div>}
          </section>
        </div>
      )}
      {selectedBooking && <JobPacket booking={selectedBooking} onClose={() => setSelectedBooking(null)} />}
    </section>
  );
}
