import { useCallback, useEffect, useState } from 'react';
import {
  BOOKING_MANUAL_PAYMENT_STATUS_LABELS,
  BOOKING_PAYMENT_METHOD_LABELS,
  getJobs,
  updateBookingAdminFields,
  updateBookingManualPaymentStatus,
} from '../core/scheduling/schedulingService';
import { useAuth } from '../contexts/AuthContext';
import {
  bookingAddress,
  bookingAmountReceived,
  bookingCustomerEmail,
  bookingCustomerName,
  bookingCustomerPhone,
  bookingNotes,
  bookingPaymentMethod,
  bookingPaymentNote,
  bookingPaymentStatus,
  bookingPrice,
  bookingReference,
  bookingReceivedDate,
  bookingSchedule,
  bookingServiceType,
  bookingStatus,
  bookingStillOwed,
} from './bookingDisplay';
import { createBookingCheckoutSession } from '../services/stripeService';

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
  const [isEditingPaymentStatus, setIsEditingPaymentStatus] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    paymentStatus: 'not_paid',
    paymentMethod: '',
    amountReceived: '',
    receivedAt: '',
    paymentNote: '',
  });
  const [paymentStatusError, setPaymentStatusError] = useState('');
  const [savingPaymentStatus, setSavingPaymentStatus] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [stripeLinkState, setStripeLinkState] = useState({
    creating: false,
    url: '',
    error: '',
    copyMessage: '',
  });

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
    setIsEditingPaymentStatus(false);
    setEditError('');
    setPaymentStatusError('');
    setSuccessMessage('');
    setStripeLinkState({ creating: false, url: '', error: '', copyMessage: '' });
  };

  const closeBookingDetails = () => {
    setSelectedBooking(null);
    setIsEditingBooking(false);
    setIsEditingPaymentStatus(false);
    setEditError('');
    setPaymentStatusError('');
    setSuccessMessage('');
    setStripeLinkState({ creating: false, url: '', error: '', copyMessage: '' });
  };

  const startBookingEdit = () => {
    setEditForm({
      date: bookingDateInputValue(selectedBooking),
      startTime: bookingStartTimeInputValue(selectedBooking),
      notes: bookingNotes(selectedBooking) === 'No notes provided' ? '' : bookingNotes(selectedBooking),
    });
    setEditError('');
    setPaymentStatusError('');
    setSuccessMessage('');
    setIsEditingPaymentStatus(false);
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

  const startPaymentStatusEdit = () => {
    const currentStatus = typeof selectedBooking?.paymentStatus === 'string' &&
      BOOKING_MANUAL_PAYMENT_STATUS_LABELS[selectedBooking.paymentStatus]
      ? selectedBooking.paymentStatus
      : 'not_paid';
    setPaymentForm({
      paymentStatus: currentStatus,
      paymentMethod: typeof selectedBooking?.paymentMethod === 'string' ? selectedBooking.paymentMethod : '',
      amountReceived: selectedBooking?.amountReceived !== null && selectedBooking?.amountReceived !== undefined
        ? String(selectedBooking.amountReceived)
        : '',
      receivedAt: paymentDateInputValue(selectedBooking?.receivedAt),
      paymentNote: typeof selectedBooking?.paymentNote === 'string' ? selectedBooking.paymentNote : '',
    });
    setPaymentStatusError('');
    setEditError('');
    setSuccessMessage('');
    setIsEditingBooking(false);
    setIsEditingPaymentStatus(true);
  };

  const cancelPaymentStatusEdit = () => {
    setIsEditingPaymentStatus(false);
    setPaymentStatusError('');
  };

  const updatePaymentField = (event) => {
    const { name, value } = event.target;
    setPaymentForm(current => {
      const next = { ...current, [name]: value };
      if (name === 'paymentStatus') {
        if (isWaivedPaymentStatus(value) && next.amountReceived === '') {
          next.amountReceived = '0';
        } else if (isPaidPaymentStatus(value)) {
          if (next.amountReceived === '') {
            const agreedPrice = bookingAgreedPrice(selectedBooking);
            if (Number.isFinite(agreedPrice)) next.amountReceived = String(agreedPrice);
          }
          if (next.receivedAt === '') {
            next.receivedAt = todayDateInputValue();
          }
        }
      }
      return next;
    });
  };

  const savePaymentStatusEdit = async (event) => {
    event.preventDefault();
    if (!selectedBooking?.id) {
      setPaymentStatusError('Booking payment details could not be updated. Please close and try again.');
      return;
    }

    setSavingPaymentStatus(true);
    setPaymentStatusError('');
    setSuccessMessage('');

    const patch = buildPaymentDetailsPatch(paymentForm);
    if (!patch.success) {
      setSavingPaymentStatus(false);
      setPaymentStatusError(patch.message);
      return;
    }

    const result = await updateBookingManualPaymentStatus(
      tenantId,
      selectedBooking.id,
      patch.data
    );
    if (!result.success) {
      setSavingPaymentStatus(false);
      setPaymentStatusError(result.message || 'Booking payment details could not be updated. Please try again.');
      return;
    }

    await loadBookings();
    setSelectedBooking(current => current ? { ...current, ...result.data } : current);
    setSavingPaymentStatus(false);
    setIsEditingPaymentStatus(false);
    setSuccessMessage('Booking payment details updated.');
  };

  const createStripePaymentLink = async () => {
    if (!tenantId || !selectedBooking?.id) {
      setStripeLinkState({
        creating: false,
        url: '',
        error: 'Stripe payment link could not be created. You can still mark this booking paid another way.',
        copyMessage: '',
      });
      return;
    }

    setStripeLinkState(current => ({
      ...current,
      creating: true,
      error: '',
      copyMessage: '',
    }));

    try {
      const result = await createBookingCheckoutSession(tenantId, selectedBooking.id);
      setStripeLinkState({
        creating: false,
        url: result?.url || '',
        error: '',
        copyMessage: '',
      });
    } catch {
      setStripeLinkState({
        creating: false,
        url: '',
        error: 'Stripe payment link could not be created. You can still mark this booking paid another way.',
        copyMessage: '',
      });
    }
  };

  const copyStripePaymentLink = async () => {
    if (!stripeLinkState.url) return;

    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(stripeLinkState.url);
      setStripeLinkState(current => ({
        ...current,
        copyMessage: 'Payment link copied.',
        error: '',
      }));
    } catch {
      setStripeLinkState(current => ({
        ...current,
        copyMessage: 'Payment link could not be copied automatically. You can copy it from the field above.',
      }));
    }
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
    <div className="v1-page bookings-page">
      <div className="v1-page-header">
        <h1 className="v1-page-title">Bookings</h1>
        <p className="v1-page-subtitle">Your job management page. Update booked job details, send Stripe payment links, and record payments made another way.</p>
      </div>

      {loading && <p role="status">Loading bookings…</p>}

      {!loading && error && (
        <div role="alert" style={{ padding: 16, border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 8, color: '#991b1b' }}>
          <div>{error}</div>
          <button type="button" onClick={loadBookings} style={{ marginTop: 10 }}>Retry</button>
        </div>
      )}

      {!loading && !error && bookings.length === 0 && (
        <div className="v1-empty-state" style={{ padding: 48, textAlign: 'center', border: '1px solid #e2e8f0', borderRadius: 12, color: '#64748b' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#475569' }}>No bookings yet</div>
          <div style={{ fontSize: 14 }}>Approve a quote request or create a booking from an estimate to schedule the first job.</div>
        </div>
      )}

      {!loading && !error && bookings.length > 0 && (
        <div className="bookings-grid">
          {bookings.map((booking, index) => (
            <article className="v1-card booking-list-card" key={booking?.id || `booking-${index}`}>
              <div className="booking-list-main">
                <div className="booking-list-customer">
                  <h2 style={{ margin: '0 0 6px', fontSize: 18, color: '#0f172a' }}>{bookingCustomerName(booking)}</h2>
                  <div style={{ color: '#475569' }}>{bookingServiceType(booking)}</div>
                </div>
                <div className="booking-list-schedule">{bookingSchedule(booking)}</div>
                <div className="booking-list-address">{bookingAddress(booking)}</div>
                <div className="booking-list-price">{bookingPrice(booking)}</div>
                <div className="booking-list-badges">
                  <span className="v1-pill">{bookingStatus(booking)}</span>
                  <span className="v1-pill v1-pill-payment">{bookingPaymentStatus(booking)}</span>
                </div>
                <button type="button" className="v1-button v1-button-secondary" onClick={() => openBookingDetails(booking)}>View Details</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {selectedBooking && (
        <div
          className="v1-modal-overlay"
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
          <div className="v1-modal" style={{ width: 'min(680px, 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <p style={{ margin: '0 0 6px', color: '#64748b', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Booking details</p>
                <h2 id="booking-detail-title" style={{ margin: 0, color: '#0f172a', fontSize: 24, fontWeight: 700 }}>{bookingCustomerName(selectedBooking)}</h2>
                <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>
                  Use this detail view for job notes, schedule changes, and payment follow-up.
                </p>
              </div>
              <button
                type="button"
                onClick={closeBookingDetails}
                aria-label="Close booking details"
                style={{
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  borderRadius: 8,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  color: '#0f172a',
                  fontWeight: 600,
                  fontSize: 14
                }}
              >
                Close
              </button>
            </div>

            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, margin: '24px 0 0', padding: '20px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <DetailItem label="Customer email" value={bookingCustomerEmail(selectedBooking)} />
              <DetailItem label="Customer phone" value={bookingCustomerPhone(selectedBooking)} />
              <DetailItem label="Service" value={bookingServiceType(selectedBooking)} />
              <DetailItem label="Status" value={bookingStatus(selectedBooking)} />
              <DetailItem label="Scheduled" value={bookingSchedule(selectedBooking)} />
              <DetailItem label="Address" value={bookingAddress(selectedBooking)} />
              <DetailItem label="Job price" value={bookingPrice(selectedBooking)} />
              <DetailItem label="Reference" value={bookingReference(selectedBooking) || 'Reference not provided'} />
            </dl>

            <section style={{ marginTop: 24, padding: 20, border: '1px solid #ccfbf1', background: '#f0fdfa', borderRadius: 12 }}>
              <h3 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: 18, fontWeight: 600 }}>Payment details</h3>
              <p style={{ margin: '0 0 16px', color: '#0f766e', fontSize: 14, lineHeight: 1.5 }}>
                Stripe-paid bookings update after Stripe confirms payment. Manual payments are owner-entered records for cash, check, Venmo, Zelle, or another outside method.
              </p>
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, margin: 0 }}>
                <DetailItem label="Job price" value={bookingPrice(selectedBooking)} />
                <DetailItem label="Payment status" value={bookingPaymentStatus(selectedBooking)} />
                <DetailItem label="Payment method" value={bookingPaymentMethod(selectedBooking) || 'Not recorded'} />
                <DetailItem label="Amount received" value={bookingAmountReceived(selectedBooking) || 'Not recorded'} />
                <DetailItem label="Still owed" value={bookingStillOwed(selectedBooking)} />
                <DetailItem label="Received date" value={bookingReceivedDate(selectedBooking) || 'Not recorded'} />
                <DetailItem label="Payment note" value={bookingPaymentNote(selectedBooking) || 'No payment note'} />
              </dl>

              {!isEditingBooking && !isEditingPaymentStatus && (
                <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #99f6e4' }}>
                  <h4 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: 16 }}>Stripe payment link</h4>
                  <p style={{ margin: '0 0 12px', color: '#0f766e', fontSize: 13 }}>
                    Create a Stripe-hosted payment link for this booking. Creating the link does not mark the booking paid.
                  </p>
                  <button
                    type="button"
                    onClick={createStripePaymentLink}
                    disabled={stripeLinkState.creating}
                    style={{
                      border: '1px solid #0f766e',
                      background: stripeLinkState.creating ? '#5eead4' : '#0f766e',
                      color: '#fff',
                      borderRadius: 8,
                      padding: '9px 14px',
                      fontWeight: 700,
                      cursor: stripeLinkState.creating ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {stripeLinkState.creating ? 'Creating link…' : 'Create Stripe payment link'}
                  </button>

                  {stripeLinkState.error && (
                    <div role="alert" style={{ marginTop: 12, padding: 10, border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 8, color: '#991b1b' }}>
                      {stripeLinkState.error}
                    </div>
                  )}

                  {stripeLinkState.url && (
                    <div role="status" style={{ marginTop: 12, padding: 12, border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 8, color: '#166534' }}>
                      <p style={{ margin: '0 0 10px' }}>Payment link created. This booking will be marked paid after Stripe confirms payment.</p>
                      <label style={{ display: 'block', color: '#0f172a', fontWeight: 600 }}>
                        Payment link
                        <input
                          readOnly
                          value={stripeLinkState.url}
                          style={{ display: 'block', width: '100%', marginTop: 6, padding: 9, border: '1px solid #bbf7d0', borderRadius: 8 }}
                        />
                      </label>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                        <a
                          href={stripeLinkState.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            border: '1px solid #166534',
                            background: '#166534',
                            color: '#fff',
                            borderRadius: 8,
                            padding: '9px 14px',
                            fontWeight: 700,
                            textDecoration: 'none'
                          }}
                        >
                          Open payment link
                        </a>
                        <button
                          type="button"
                          onClick={copyStripePaymentLink}
                          style={{
                            border: '1px solid #bbf7d0',
                            background: '#fff',
                            color: '#0f172a',
                            borderRadius: 8,
                            padding: '9px 14px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Copy payment link
                        </button>
                      </div>
                      {stripeLinkState.copyMessage && (
                        <p style={{ margin: '10px 0 0', color: '#166534' }}>{stripeLinkState.copyMessage}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            <div style={{ marginTop: 18 }}>
              <dt style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Notes</dt>
              <dd style={{ margin: '6px 0 0', color: '#0f172a', whiteSpace: 'pre-wrap' }}>{bookingNotes(selectedBooking)}</dd>
            </div>

            {successMessage && (
              <div role="status" style={{ marginTop: 18, padding: 12, border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 8, color: '#166534' }}>
                {successMessage}
              </div>
            )}

            {!isEditingBooking && !isEditingPaymentStatus && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
                <button
                  type="button"
                  onClick={startBookingEdit}
                  style={{
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
                <button
                  type="button"
                  onClick={startPaymentStatusEdit}
                  style={{
                    border: '1px solid #0f766e',
                    background: '#0f766e',
                    color: '#fff',
                    borderRadius: 8,
                    padding: '9px 14px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Edit Payment Details
                </button>
              </div>
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

            {isEditingPaymentStatus && (
              <form noValidate onSubmit={savePaymentStatusEdit} aria-label="Edit booking payment details" style={{ marginTop: 22, padding: 16, border: '1px solid #ccfbf1', background: '#f0fdfa', borderRadius: 10 }}>
                <h3 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: 18 }}>Edit Payment Details</h3>
                <p style={{ margin: '0 0 14px', color: '#0f766e', fontSize: 13 }}>
                  Use this only for payments received outside ServicesOS. Stripe payments update automatically after Stripe confirms payment.
                </p>

                <label style={{ display: 'block', marginBottom: 12, color: '#0f172a', fontWeight: 600 }}>
                  Payment status
                  <select
                    name="paymentStatus"
                    value={paymentForm.paymentStatus}
                    onChange={updatePaymentField}
                    style={{ display: 'block', width: '100%', marginTop: 6, padding: 9, border: '1px solid #99f6e4', borderRadius: 8, background: '#fff' }}
                  >
                    {Object.entries(BOOKING_MANUAL_PAYMENT_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'block', marginBottom: 12, color: '#0f172a', fontWeight: 600 }}>
                  Payment method
                  <select
                    name="paymentMethod"
                    value={paymentForm.paymentMethod}
                    onChange={updatePaymentField}
                    style={{ display: 'block', width: '100%', marginTop: 6, padding: 9, border: '1px solid #99f6e4', borderRadius: 8, background: '#fff' }}
                  >
                    <option value="">Not recorded</option>
                    {Object.entries(BOOKING_PAYMENT_METHOD_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'block', marginBottom: 12, color: '#0f172a', fontWeight: 600 }}>
                  Amount received
                  <input
                    name="amountReceived"
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentForm.amountReceived}
                    onChange={updatePaymentField}
                    style={{ display: 'block', width: '100%', marginTop: 6, padding: 9, border: '1px solid #99f6e4', borderRadius: 8 }}
                  />
                </label>

                <label style={{ display: 'block', marginBottom: 12, color: '#0f172a', fontWeight: 600 }}>
                  Received date
                  <input
                    name="receivedAt"
                    type="date"
                    value={paymentForm.receivedAt}
                    onChange={updatePaymentField}
                    style={{ display: 'block', width: '100%', marginTop: 6, padding: 9, border: '1px solid #99f6e4', borderRadius: 8 }}
                  />
                </label>

                <label style={{ display: 'block', marginBottom: 12, color: '#0f172a', fontWeight: 600 }}>
                  Payment note
                  <textarea
                    name="paymentNote"
                    value={paymentForm.paymentNote}
                    onChange={updatePaymentField}
                    rows={3}
                    maxLength={500}
                    style={{ display: 'block', width: '100%', marginTop: 6, padding: 9, border: '1px solid #99f6e4', borderRadius: 8 }}
                  />
                </label>

                {paymentStatusError && (
                  <div role="alert" style={{ marginBottom: 12, padding: 10, border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 8, color: '#991b1b' }}>
                    {paymentStatusError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="submit"
                    disabled={savingPaymentStatus}
                    style={{
                      border: '1px solid #0f766e',
                      background: savingPaymentStatus ? '#5eead4' : '#0f766e',
                      color: '#fff',
                      borderRadius: 8,
                      padding: '9px 14px',
                      fontWeight: 700,
                      cursor: savingPaymentStatus ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {savingPaymentStatus ? 'Saving…' : 'Save payment details'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelPaymentStatusEdit}
                    disabled={savingPaymentStatus}
                    style={{
                      border: '1px solid #99f6e4',
                      background: '#fff',
                      color: '#0f172a',
                      borderRadius: 8,
                      padding: '9px 14px',
                      fontWeight: 700,
                      cursor: savingPaymentStatus ? 'not-allowed' : 'pointer'
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

function todayDateInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${padTime(now.getMonth() + 1)}-${padTime(now.getDate())}`;
}

function paymentDateInputValue(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = toDate(value);
  return date
    ? `${date.getFullYear()}-${padTime(date.getMonth() + 1)}-${padTime(date.getDate())}`
    : '';
}

function bookingAgreedPrice(booking = {}) {
  const agreedPrice = Number(booking.agreedPrice ?? booking.price);
  return Number.isFinite(agreedPrice) && agreedPrice >= 0 ? agreedPrice : null;
}

function isPaidPaymentStatus(status) {
  return [
    'deposit_paid',
    'paid_in_full',
    'paid_cash',
    'paid_check',
    'paid_external_app',
    'waived_family_discount',
  ].includes(status);
}

function isWaivedPaymentStatus(status) {
  return status === 'waived_family_discount';
}

function buildPaymentDetailsPatch(form) {
  const patch = { paymentStatus: form.paymentStatus };

  patch.paymentMethod = form.paymentMethod;
  if (form.amountReceived !== '') {
    const amountReceived = Number(form.amountReceived);
    if (!Number.isFinite(amountReceived) || amountReceived < 0) {
      return { success: false, message: 'Amount received must be a non-negative number.' };
    }
    patch.amountReceived = amountReceived;
  } else {
    patch.amountReceived = '';
  }
  patch.receivedAt = form.receivedAt;
  patch.paymentNote = form.paymentNote.trim();

  return { success: true, data: patch };
}

function DetailItem({ label, value }) {
  return (
    <div>
      <dt style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</dt>
      <dd style={{ margin: '6px 0 0', color: '#0f172a' }}>{value}</dd>
    </div>
  );
}
