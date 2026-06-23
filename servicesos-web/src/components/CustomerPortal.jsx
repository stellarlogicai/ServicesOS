// src/components/CustomerPortal.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getQuotes } from '../services/crmService';
import { downloadQuotePDF } from '../services/pdfService';
import {
  CUSTOMER_PORTAL_IDENTITY_STATUS,
  resolveCustomerPortalCustomer
} from '../services/customerPortalIdentityService';
import { buildCustomerPortalQuoteIntakeDraft } from '../services/customerPortalQuoteRequestMapper';
import { submitCustomerPortalQuoteRequest } from '../services/customerPortalQuoteRequestService';
import {
  getQuoteLeadDisplayData,
  getQuoteLeadPriceDisplay,
  getRoomSummary,
  isPendingOwnerReview
} from '../services/quoteLeadDisplay';
import './CustomerPortal.css';

const CUSTOMER_PORTAL_TABS = [
  { id: 'quotes', label: 'Quotes' },
  { id: 'request-quote', label: 'Request Quote' },
  { id: 'booking', label: 'Booking' },
  { id: 'appointments', label: 'Appointments' }
];

const DEFAULT_QUOTE_REQUEST_FORM = {
  cleaningType: 'standard',
  bedrooms: 3,
  bathrooms: 2,
  kitchenCount: 1,
  livingRoomCount: 1,
  diningRoomCount: 0,
  officeCount: 0,
  closetCount: 0,
  squareFootage: '',
  garage: false,
  basement: false,
  stairs: false,
  petCount: 0,
  petHairLevel: 'none',
  clutterLevel: 'normal',
  lastCleaned: '',
  serviceScope: {
    oven: false,
    fridge: false,
    windows: false,
    baseboards: false,
    cabinetsInside: false,
    laundryRoomCleaning: false
  },
  surfaceNotes: '',
  accessInstructions: '',
  preferredDate: '',
  preferredTime: '09:00',
  customerNotes: ''
};

const SERVICE_TYPE_OPTIONS = [
  { value: 'standard', label: 'Standard clean' },
  { value: 'deep', label: 'Deep clean' },
  { value: 'move-out', label: 'Move-out clean' },
  { value: 'recurring', label: 'Recurring clean' }
];

const PET_HAIR_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'heavy', label: 'Heavy' }
];

const CLUTTER_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'normal', label: 'Normal' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' }
];

const LAST_CLEANED_OPTIONS = [
  { value: '', label: 'Select last cleaned' },
  { value: 'this-week', label: 'This week' },
  { value: 'within-month', label: 'Within the last month' },
  { value: 'one-to-three-months', label: '1-3 months ago' },
  { value: 'three-plus-months', label: '3+ months ago' },
  { value: 'unknown', label: 'Not sure' }
];

const ROOM_FIELDS = [
  { name: 'bedrooms', label: 'Bedrooms' },
  { name: 'bathrooms', label: 'Bathrooms' },
  { name: 'kitchenCount', label: 'Kitchens' },
  { name: 'livingRoomCount', label: 'Living rooms' },
  { name: 'diningRoomCount', label: 'Dining rooms' },
  { name: 'officeCount', label: 'Offices' },
  { name: 'closetCount', label: 'Closets' }
];

const ADD_ON_FIELDS = [
  { name: 'oven', label: 'Inside oven' },
  { name: 'fridge', label: 'Inside fridge' },
  { name: 'windows', label: 'Windows' },
  { name: 'baseboards', label: 'Baseboards' },
  { name: 'cabinetsInside', label: 'Inside cabinets' },
  { name: 'laundryRoomCleaning', label: 'Laundry room' }
];

const getAddOnLabel = (fieldName) =>
  ADD_ON_FIELDS.find((field) => field.name === fieldName)?.label || fieldName;

const getTenantIdFromContext = (tenantId, currentTenant) =>
  tenantId || (typeof currentTenant === 'string' ? currentTenant : currentTenant?.id) || null;

const missingTenantQuoteRequestMessage =
  'Your customer account is not linked to a business yet, so saved quote requests are not enabled.';

const missingCustomerQuoteRequestMessage =
  'Your customer profile needs to be linked before saved quote requests can be enabled.';

function getStoredAppointments() {
  try {
    const stored = localStorage.getItem('customer_appointments');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export default function CustomerPortal() {
  const { user, userProfile, tenantId, currentTenant } = useAuth();
  const resolvedTenantId = getTenantIdFromContext(tenantId, currentTenant);
  const userUid = user?.uid || null;
  const userEmail = user?.email || null;
  const [activeTab, setActiveTab] = useState('quotes');
  const [quotes, setQuotes] = useState([]);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [appointments, setAppointments] = useState(() => getStoredAppointments());
  const [message, setMessage] = useState({ type: '', text: '' });
  const [quoteRequestForm, setQuoteRequestForm] = useState(DEFAULT_QUOTE_REQUEST_FORM);
  const [quoteRequestPreview, setQuoteRequestPreview] = useState(null);
  const [quoteRequestSubmitting, setQuoteRequestSubmitting] = useState(false);
  const [quoteRequestSubmittedLeadId, setQuoteRequestSubmittedLeadId] = useState(null);
  const [customerIdentity, setCustomerIdentity] = useState({
    status: 'idle',
    customer: null,
    matchMethod: null,
    message: ''
  });

  // Booking form state
  const [bookingForm, setBookingForm] = useState({
    quoteId: '',
    preferredDate: '',
    preferredTime: '09:00',
    notes: ''
  });

  const loadAppointments = () => {
    setAppointments(getStoredAppointments());
  };

  useEffect(() => {
    let isMounted = true;

    if (resolvedTenantId) {
      getQuotes(resolvedTenantId).then((quotes) => {
        if (isMounted) {
          setQuotes(quotes || []);
        }
      }).catch((error) => {
        console.error('[Customer Portal] Error loading quotes:', error);
        if (isMounted) {
          setQuotes([]);
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, [resolvedTenantId]);

  useEffect(() => {
    let isActive = true;

    Promise.resolve().then(async () => {
      if (!isActive) return;

      const result = await resolveCustomerPortalCustomer({
        tenantId: resolvedTenantId,
        user: userUid ? { uid: userUid, email: userEmail } : null
      });

      if (isActive) {
        setCustomerIdentity(result);
      }
    });

    return () => {
      isActive = false;
    };
  }, [resolvedTenantId, userUid, userEmail]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const handleViewQuote = (quote) => {
    setSelectedQuote(quote);
    setActiveTab('quote-details');
  };

  const handleDownloadPDF = () => {
    if (selectedQuote) {
      downloadQuotePDF(selectedQuote.formData, selectedQuote.aiAnalysis, selectedQuote.estimate);
      showMessage('success', 'PDF downloaded successfully');
    }
  };

  const handleBookAppointment = () => {
    if (!bookingForm.quoteId || !bookingForm.preferredDate) {
      showMessage('error', 'Please select a quote and preferred date');
      return;
    }

    const quote = quotes.find(q => q.id === bookingForm.quoteId);
    if (!quote) {
      showMessage('error', 'Quote not found');
      return;
    }
    const quoteDisplay = getQuoteLeadDisplayData(quote);

    const appointment = {
      id: `apt_${Date.now()}`,
      quoteId: bookingForm.quoteId,
      customerName: quoteDisplay.fullName,
      customerEmail: quoteDisplay.email,
      customerPhone: quoteDisplay.phone,
      customerAddress: quoteDisplay.address,
      serviceType: quoteDisplay.cleaningType || 'Standard',
      bedrooms: quoteDisplay.bedrooms || 0,
      bathrooms: quoteDisplay.bathrooms || 0,
      preferredDate: bookingForm.preferredDate,
      preferredTime: bookingForm.preferredTime,
      notes: bookingForm.notes,
      frequency: quoteDisplay.frequency,
      priceLow: quote.estimate?.priceLow || 0,
      priceHigh: quote.estimate?.priceHigh || 0,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    try {
      const stored = localStorage.getItem('customer_appointments');
      const existing = stored ? JSON.parse(stored) : [];
      existing.push(appointment);
      localStorage.setItem('customer_appointments', JSON.stringify(existing));
      loadAppointments();
      showMessage('success', 'Appointment request submitted! You will receive confirmation shortly.');
    } catch (error) {
      showMessage('error', 'Failed to save appointment');
      console.error('Error saving appointment:', error);
    }
    
    setBookingForm({
      quoteId: '',
      preferredDate: '',
      preferredTime: '09:00',
      notes: ''
    });
    setActiveTab('appointments');
  };

  const handleScheduleQuote = (quote) => {
    setBookingForm({
      quoteId: quote.id,
      preferredDate: '',
      preferredTime: '09:00',
      notes: ''
    });
    setActiveTab('booking');
  };

  const updateQuoteRequestField = (field, value) => {
    setQuoteRequestForm((currentForm) => ({
      ...currentForm,
      [field]: value
    }));
    setQuoteRequestPreview(null);
    setQuoteRequestSubmittedLeadId(null);
  };

  const updateQuoteRequestAddOn = (field, checked) => {
    setQuoteRequestForm((currentForm) => ({
      ...currentForm,
      serviceScope: {
        ...currentForm.serviceScope,
        [field]: checked
      }
    }));
    setQuoteRequestPreview(null);
    setQuoteRequestSubmittedLeadId(null);
  };

  const handlePreviewQuoteRequest = (event) => {
    event.preventDefault();

    const draft = buildCustomerPortalQuoteIntakeDraft({
      formData: {
        ...quoteRequestForm,
        pets: Number(quoteRequestForm.petCount) > 0,
        specialRequests: quoteRequestForm.customerNotes
      },
      sourceFormat: 'intake-form',
      tenantId: resolvedTenantId,
      customerId: customerIdentity.customer?.id || null,
      authUid: userUid,
      existingCustomer: customerIdentity.customer || {},
      submittedAt: new Date().toISOString()
    });

    setQuoteRequestPreview(draft);
    setQuoteRequestSubmittedLeadId(null);
    showMessage('success', 'Quote request preview created. Review it before submitting.');
  };

  const customerIdentityIsLinked = customerIdentity.status === CUSTOMER_PORTAL_IDENTITY_STATUS.FOUND;

  const getQuoteRequestSubmitBlockedReason = () => {
    if (!resolvedTenantId) {
      return missingTenantQuoteRequestMessage;
    }

    if (!userUid) {
      return 'Sign in before saved quote requests can be enabled.';
    }

    if (customerIdentity.status === 'idle') {
      return 'Customer profile link is still being checked.';
    }

    if (!customerIdentityIsLinked || !customerIdentity.customer?.id) {
      return customerIdentity.message || missingCustomerQuoteRequestMessage;
    }

    if (!quoteRequestPreview) {
      return 'Review the quote request draft before submitting.';
    }

    return '';
  };

  const quoteRequestSubmitBlockedReason = getQuoteRequestSubmitBlockedReason();
  const canSubmitQuoteRequest = Boolean(
    !quoteRequestSubmitting &&
      !quoteRequestSubmittedLeadId &&
      quoteRequestPreview &&
      !quoteRequestSubmitBlockedReason
  );

  const handleSubmitQuoteRequest = async () => {
    if (quoteRequestSubmitBlockedReason) {
      showMessage('error', quoteRequestSubmitBlockedReason);
      return;
    }

    setQuoteRequestSubmitting(true);

    try {
      const result = await submitCustomerPortalQuoteRequest({
        tenantId: resolvedTenantId,
        user: userUid ? { uid: userUid, email: userEmail } : null,
        customer: customerIdentity.customer,
        quoteIntakeDraft: quoteRequestPreview
      });

      if (result.success) {
        setQuoteRequestSubmittedLeadId(result.leadId);
        showMessage('success', 'Quote request submitted for owner review.');
        return;
      }

      showMessage('error', result.error || 'Quote request could not be submitted. Please try again.');
    } catch {
      showMessage('error', 'Quote request could not be submitted. Please try again.');
    } finally {
      setQuoteRequestSubmitting(false);
    }
  };

  const activePreviewAddOns = quoteRequestPreview
    ? Object.entries(quoteRequestPreview.quoteRequestDraft.requestSnapshot.serviceScope || {})
      .filter(([, enabled]) => enabled)
      .map(([fieldName]) => getAddOnLabel(fieldName))
    : [];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          Customer Portal
        </h1>
        <p style={{ fontSize: 16, color: '#64748b', margin: 0 }}>
          View your quotes, schedule appointments, and manage bookings
        </p>
      </div>

      {/* Message Banner */}
      {message.text && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 24,
          background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: message.type === 'success' ? '1px solid #bbf7d0' : '1px solid #fecaca',
          color: message.type === 'success' ? '#166534' : '#991b1b'
        }}>
          {message.text}
        </div>
      )}

      {customerIdentity.message && (
        <div
          className={`customer-identity-banner ${
            customerIdentityIsLinked ? 'customer-identity-banner--ready' : 'customer-identity-banner--blocked'
          }`}
        >
          <div>
            <strong>
              {customerIdentityIsLinked ? 'Customer identity resolved' : 'Saved quote requests not enabled'}
            </strong>
            <p>{customerIdentity.message}</p>
          </div>
          <dl>
            <div>
              <dt>Signed in as</dt>
              <dd>{userEmail || userProfile?.email || 'Unknown'}</dd>
            </div>
            <div>
              <dt>Business</dt>
              <dd>{currentTenant?.businessName || resolvedTenantId || 'Not linked'}</dd>
            </div>
            <div>
              <dt>Customer match</dt>
              <dd>{customerIdentity.matchMethod || 'Not linked'}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Tabs */}
      <div className="customer-portal-tabs" style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #e2e8f0' }}>
        {CUSTOMER_PORTAL_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 24px',
              background: activeTab === tab.id ? 'white' : 'transparent',
              color: activeTab === tab.id ? '#3b82f6' : '#64748b',
              border: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
              borderBottom: activeTab === tab.id ? '2px solid white' : '2px solid #e2e8f0',
              borderRadius: '8px 8px 0 0',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: activeTab === tab.id ? -2 : 0
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Quotes Tab */}
      {activeTab === 'quotes' && (
        <div>
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: 12,
            border: '1px solid #e2e8f0'
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
              Your Quotes ({quotes.length})
            </h3>
            {quotes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                <p>No quotes yet</p>
                <p style={{ fontSize: 14 }}>Start a quote request so the owner can review the cleaning details.</p>
                <button
                  onClick={() => setActiveTab('request-quote')}
                  style={{
                    marginTop: 16,
                    padding: '12px 24px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Request Quote
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                {quotes.map(quote => {
                  const quoteDisplay = getQuoteLeadDisplayData(quote);
                  const priceDisplay = getQuoteLeadPriceDisplay(quote);
                  const pendingOwnerReview = isPendingOwnerReview(quote);

                  return (
                    <div
                      key={quote.id}
                      style={{
                        padding: '20px',
                        background: '#f8fafc',
                        borderRadius: 12,
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
                          {quoteDisplay.fullName}
                        </div>
                        <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>
                          {quoteDisplay.cleaningType} Cleaning · {getRoomSummary(quoteDisplay)}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#3b82f6' }}>
                          {priceDisplay.text}
                        </div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                          Created: {quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : 'Unknown'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => handleViewQuote(quote)}
                          style={{
                            padding: '10px 20px',
                            background: 'white',
                            color: '#0f172a',
                            border: '1px solid #d1d5db',
                            borderRadius: 8,
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          View Details
                        </button>
                        {!pendingOwnerReview && (
                          <button
                            onClick={() => handleScheduleQuote(quote)}
                            style={{
                              padding: '10px 20px',
                              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                              color: 'white',
                              border: 'none',
                              borderRadius: 8,
                              fontSize: 14,
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Book Now
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Request Quote Tab */}
      {activeTab === 'request-quote' && (
        <div className="customer-portal-card">
          <div className="quote-request-header">
            <div>
              <h2>Request Quote</h2>
              <p>
                Share the cleaning details the owner needs to review scope, timing, and quote fit.
                Preview the request first, then submit it for owner review.
              </p>
            </div>
            <div className="quote-request-status">Preview only</div>
          </div>

          <div className="quote-request-note">
            <strong>Saved property profiles are planned.</strong> Returning customers should be able to reuse
            saved home details later and only update what changed. For now, this shell prepares the draft
            structure without storing it.
          </div>

          <form onSubmit={handlePreviewQuoteRequest} className="quote-request-form">
            <section className="quote-request-section" aria-labelledby="service-details-heading">
              <h3 id="service-details-heading">Service details</h3>
              <div className="quote-request-grid">
                <div>
                  <label htmlFor="quoteCleaningType">Service type</label>
                  <select
                    id="quoteCleaningType"
                    className="customer-portal-field"
                    value={quoteRequestForm.cleaningType}
                    onChange={(event) => updateQuoteRequestField('cleaningType', event.target.value)}
                  >
                    {SERVICE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="quoteSquareFootage">Approx square footage</label>
                  <input
                    id="quoteSquareFootage"
                    className="customer-portal-field"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={quoteRequestForm.squareFootage}
                    onChange={(event) => updateQuoteRequestField('squareFootage', event.target.value)}
                    placeholder="Example: 1600"
                  />
                </div>

                <div>
                  <label htmlFor="quoteLastCleaned">Last cleaned</label>
                  <select
                    id="quoteLastCleaned"
                    className="customer-portal-field"
                    value={quoteRequestForm.lastCleaned}
                    onChange={(event) => updateQuoteRequestField('lastCleaned', event.target.value)}
                  >
                    {LAST_CLEANED_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="quoteClutterLevel">Clutter level</label>
                  <select
                    id="quoteClutterLevel"
                    className="customer-portal-field"
                    value={quoteRequestForm.clutterLevel}
                    onChange={(event) => updateQuoteRequestField('clutterLevel', event.target.value)}
                  >
                    {CLUTTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className="quote-request-section" aria-labelledby="property-details-heading">
              <h3 id="property-details-heading">Property details</h3>
              <div className="quote-request-grid quote-request-grid--compact">
                {ROOM_FIELDS.map((field) => (
                  <div key={field.name}>
                    <label htmlFor={`quote-${field.name}`}>{field.label}</label>
                    <input
                      id={`quote-${field.name}`}
                      className="customer-portal-field"
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={quoteRequestForm[field.name]}
                      onChange={(event) => updateQuoteRequestField(field.name, event.target.value)}
                    />
                  </div>
                ))}
              </div>

              <div className="quote-request-checkbox-row" aria-label="Additional property areas">
                {[
                  { name: 'garage', label: 'Garage' },
                  { name: 'basement', label: 'Basement' },
                  { name: 'stairs', label: 'Stairs' }
                ].map((field) => (
                  <label key={field.name} className="quote-request-checkbox">
                    <input
                      type="checkbox"
                      checked={quoteRequestForm[field.name]}
                      onChange={(event) => updateQuoteRequestField(field.name, event.target.checked)}
                    />
                    <span>{field.label}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="quote-request-section" aria-labelledby="pets-addons-heading">
              <h3 id="pets-addons-heading">Pets and add-ons</h3>
              <div className="quote-request-grid">
                <div>
                  <label htmlFor="quotePetCount">Pets</label>
                  <input
                    id="quotePetCount"
                    className="customer-portal-field"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={quoteRequestForm.petCount}
                    onChange={(event) => updateQuoteRequestField('petCount', event.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="quotePetHairLevel">Pet hair level</label>
                  <select
                    id="quotePetHairLevel"
                    className="customer-portal-field"
                    value={quoteRequestForm.petHairLevel}
                    onChange={(event) => updateQuoteRequestField('petHairLevel', event.target.value)}
                  >
                    {PET_HAIR_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="quote-request-checkbox-row quote-request-checkbox-row--addons" aria-label="Requested add-ons">
                {ADD_ON_FIELDS.map((field) => (
                  <label key={field.name} className="quote-request-checkbox">
                    <input
                      type="checkbox"
                      checked={quoteRequestForm.serviceScope[field.name]}
                      onChange={(event) => updateQuoteRequestAddOn(field.name, event.target.checked)}
                    />
                    <span>{field.label}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="quote-request-section" aria-labelledby="notes-schedule-heading">
              <h3 id="notes-schedule-heading">Notes and preferred timing</h3>
              <div className="quote-request-grid">
                <div>
                  <label htmlFor="quotePreferredDate">Preferred date</label>
                  <input
                    id="quotePreferredDate"
                    className="customer-portal-field"
                    type="date"
                    value={quoteRequestForm.preferredDate}
                    onChange={(event) => updateQuoteRequestField('preferredDate', event.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="quotePreferredTime">Preferred time</label>
                  <select
                    id="quotePreferredTime"
                    className="customer-portal-field"
                    value={quoteRequestForm.preferredTime}
                    onChange={(event) => updateQuoteRequestField('preferredTime', event.target.value)}
                  >
                    <option value="08:00">8:00 AM</option>
                    <option value="09:00">9:00 AM</option>
                    <option value="10:00">10:00 AM</option>
                    <option value="11:00">11:00 AM</option>
                    <option value="12:00">12:00 PM</option>
                    <option value="13:00">1:00 PM</option>
                    <option value="14:00">2:00 PM</option>
                    <option value="15:00">3:00 PM</option>
                    <option value="16:00">4:00 PM</option>
                    <option value="17:00">5:00 PM</option>
                  </select>
                </div>
              </div>

              <div className="quote-request-stack">
                <div>
                  <label htmlFor="quoteSurfaceNotes">Special surfaces/materials</label>
                  <textarea
                    id="quoteSurfaceNotes"
                    className="customer-portal-field customer-portal-field--textarea"
                    rows={3}
                    value={quoteRequestForm.surfaceNotes}
                    onChange={(event) => updateQuoteRequestField('surfaceNotes', event.target.value)}
                    placeholder="Example: marble counter, hardwood floors, antique furniture"
                  />
                </div>

                <div>
                  <label htmlFor="quoteAccessInstructions">Access notes</label>
                  <textarea
                    id="quoteAccessInstructions"
                    className="customer-portal-field customer-portal-field--textarea"
                    rows={3}
                    value={quoteRequestForm.accessInstructions}
                    onChange={(event) => updateQuoteRequestField('accessInstructions', event.target.value)}
                    placeholder="Gate code, parking, pets in a room, or entry instructions"
                  />
                </div>

                <div>
                  <label htmlFor="quoteCustomerNotes">Customer notes</label>
                  <textarea
                    id="quoteCustomerNotes"
                    className="customer-portal-field customer-portal-field--textarea"
                    rows={4}
                    value={quoteRequestForm.customerNotes}
                    onChange={(event) => updateQuoteRequestField('customerNotes', event.target.value)}
                    placeholder="Anything the owner should know before preparing the quote"
                  />
                </div>
              </div>
            </section>

            <button type="submit" className="quote-request-submit">
              Review Quote Request Draft
            </button>
          </form>

          {quoteRequestPreview && (
            <section className="quote-request-preview" aria-labelledby="quote-preview-heading">
              <div className="quote-request-preview-header">
                <div>
                  <h3 id="quote-preview-heading">Quote request preview</h3>
                  <p>Review these details before sending the quote request to the owner.</p>
                </div>
                <span>
                  {quoteRequestSubmittedLeadId
                    ? 'Submitted'
                    : canSubmitQuoteRequest
                      ? 'Ready to submit'
                      : 'Submit blocked'}
                </span>
              </div>

              <div className="quote-preview-grid">
                <div>
                  <strong>Service</strong>
                  <p>{quoteRequestPreview.quoteRequestDraft.requestSnapshot.cleaningType}</p>
                </div>
                <div>
                  <strong>Rooms</strong>
                  <p>
                    {quoteRequestPreview.quoteRequestDraft.propertySnapshot.bedrooms} bed,{' '}
                    {quoteRequestPreview.quoteRequestDraft.propertySnapshot.bathrooms} bath,{' '}
                    {quoteRequestPreview.quoteRequestDraft.propertySnapshot.roomCounts.kitchens} kitchen
                  </p>
                </div>
                <div>
                  <strong>Condition</strong>
                  <p>
                    {quoteRequestPreview.quoteRequestDraft.requestSnapshot.clutterLevel} clutter, last cleaned{' '}
                    {quoteRequestPreview.quoteRequestDraft.requestSnapshot.lastCleaned || 'not specified'}
                  </p>
                </div>
                <div>
                  <strong>Pets</strong>
                  <p>
                    {quoteRequestPreview.quoteRequestDraft.propertySnapshot.household.petCount} pet(s), pet hair{' '}
                    {quoteRequestPreview.quoteRequestDraft.propertySnapshot.household.petHairLevel}
                  </p>
                </div>
                <div>
                  <strong>Preferred timing</strong>
                  <p>
                    {quoteRequestPreview.quoteRequestDraft.appointmentRequest.preferredDate || 'No date'} at{' '}
                    {quoteRequestPreview.quoteRequestDraft.appointmentRequest.preferredTime || 'no time'}
                  </p>
                </div>
                <div>
                  <strong>Add-ons</strong>
                  <p>{activePreviewAddOns.length ? activePreviewAddOns.join(', ') : 'None selected'}</p>
                </div>
              </div>

              <div className="quote-preview-notes">
                <strong>Notes preserved for later review</strong>
                <dl>
                  <div>
                    <dt>Special surfaces/materials</dt>
                    <dd>{quoteRequestPreview.quoteRequestDraft.requestSnapshot.rawInput.surfaceNotes || 'None provided'}</dd>
                  </div>
                  <div>
                    <dt>Access notes</dt>
                    <dd>{quoteRequestPreview.quoteRequestDraft.requestSnapshot.rawInput.accessInstructions || 'None provided'}</dd>
                  </div>
                  <div>
                    <dt>Customer notes</dt>
                    <dd>{quoteRequestPreview.quoteRequestDraft.requestSnapshot.specialRequests || 'None provided'}</dd>
                  </div>
                </dl>
              </div>

              <div className="quote-request-submit-panel">
                {quoteRequestSubmittedLeadId && (
                  <p className="quote-request-submit-status quote-request-submit-status--success">
                    Quote request submitted for owner review.
                  </p>
                )}
                {!quoteRequestSubmittedLeadId && quoteRequestSubmitBlockedReason && (
                  <p className="quote-request-submit-status quote-request-submit-status--blocked">
                    {quoteRequestSubmitBlockedReason}
                  </p>
                )}
                <button
                  type="button"
                  className="quote-request-submit"
                  disabled={!canSubmitQuoteRequest}
                  onClick={handleSubmitQuoteRequest}
                >
                  {quoteRequestSubmittedLeadId
                    ? 'Submitted for Owner Review'
                    : quoteRequestSubmitting
                      ? 'Submitting...'
                      : 'Submit Quote Request for Owner Review'}
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      {/* Quote Details Tab */}
      {activeTab === 'quote-details' && selectedQuote && (
        <div>
          <button
            onClick={() => setActiveTab('quotes')}
            style={{
              padding: '8px 16px',
              background: 'white',
              color: '#0f172a',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: 16
            }}
          >
            ← Back to Quotes
          </button>

          <div style={{
            background: 'white',
            padding: '32px',
            borderRadius: 12,
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                Quote Details
              </h2>
              <div style={{ fontSize: 14, color: '#64748b' }}>
                Quote ID: {selectedQuote.id} · Created: {new Date(selectedQuote.createdAt).toLocaleString()}
              </div>
            </div>

            {/* Customer Info */}
            <div style={{ marginBottom: 24, padding: '20px', background: '#f8fafc', borderRadius: 8 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>
                Customer Information
              </h3>
              <div style={{ display: 'grid', gap: 8, fontSize: 14, color: '#64748b' }}>
                <div><strong>Name:</strong> {getQuoteLeadDisplayData(selectedQuote).fullName}</div>
                <div><strong>Email:</strong> {getQuoteLeadDisplayData(selectedQuote).email || 'N/A'}</div>
                <div><strong>Phone:</strong> {getQuoteLeadDisplayData(selectedQuote).phone || 'N/A'}</div>
                <div><strong>Address:</strong> {getQuoteLeadDisplayData(selectedQuote).address || 'N/A'}</div>
              </div>
            </div>

            {/* Service Details */}
            <div style={{ marginBottom: 24, padding: '20px', background: '#f8fafc', borderRadius: 8 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>
                Service Details
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: 14, color: '#64748b' }}>
                <div><strong>Type:</strong> {getQuoteLeadDisplayData(selectedQuote).cleaningType}</div>
                <div><strong>Bedrooms:</strong> {getQuoteLeadDisplayData(selectedQuote).bedrooms ?? 'N/A'}</div>
                <div><strong>Bathrooms:</strong> {getQuoteLeadDisplayData(selectedQuote).bathrooms ?? 'N/A'}</div>
                <div><strong>Square Feet:</strong> {getQuoteLeadDisplayData(selectedQuote).squareFootage ?? 'N/A'}</div>
                <div><strong>Frequency:</strong> {getQuoteLeadDisplayData(selectedQuote).frequency}</div>
              </div>
            </div>

            {/* AI Analysis Summary */}
            {selectedQuote.aiAnalysis && (
              <div style={{ marginBottom: 24, padding: '20px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#166534', marginBottom: 12 }}>
                  AI Analysis Summary
                </h3>
                <div style={{ fontSize: 14, color: '#166534' }}>
                  <div><strong>Overall Condition:</strong> {selectedQuote.aiAnalysis.overallCondition || 'Moderate'}</div>
                  <div><strong>Confidence:</strong> {selectedQuote.aiAnalysis.confidence || 92}%</div>
                  {selectedQuote.aiAnalysis.recommendations && (
                    <div style={{ marginTop: 8 }}>
                      <strong>Recommendations:</strong>
                      <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
                        {selectedQuote.aiAnalysis.recommendations.map((rec, i) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Pricing */}
            <div style={{ marginBottom: 24, padding: '20px', background: '#dbeafe', borderRadius: 8, border: '1px solid #bfdbfe' }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1e40af', marginBottom: 12 }}>
                Estimated Price
              </h3>
              <div style={{ fontSize: 32, fontWeight: 700, color: '#1e40af' }}>
                {getQuoteLeadPriceDisplay(selectedQuote).text}
              </div>
              {!isPendingOwnerReview(selectedQuote) && (
                <div style={{ fontSize: 14, color: '#1e40af', marginTop: 8 }}>
                  Estimated Duration: {selectedQuote.estimate?.duration || 'N/A'}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12 }}>
              {!isPendingOwnerReview(selectedQuote) && (
                <button
                  onClick={handleDownloadPDF}
                  style={{
                    padding: '12px 24px',
                    background: 'white',
                    color: '#0f172a',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Download PDF
                </button>
              )}
              {!isPendingOwnerReview(selectedQuote) && (
                <button
                  onClick={() => handleScheduleQuote(selectedQuote)}
                  style={{
                    padding: '12px 24px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Book Appointment
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Booking Tab */}
      {activeTab === 'booking' && (
        <div>
          <button
            onClick={() => setActiveTab('quotes')}
            style={{
              padding: '8px 16px',
              background: 'white',
              color: '#0f172a',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: 16
            }}
          >
            ← Back to Quotes
          </button>

          <div style={{
            background: 'white',
            padding: '32px',
            borderRadius: 12,
            border: '1px solid #e2e8f0'
          }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
              Schedule Appointment
            </h2>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
              Select your preferred date and time for the cleaning service
            </p>

            <div style={{ display: 'grid', gap: 20, maxWidth: 500 }}>
              <div>
                <label htmlFor="preferredDate" style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Preferred Date *
                </label>
                <input
                  id="preferredDate"
                  className="customer-portal-field"
                  name="preferredDate"
                  type="date"
                  value={bookingForm.preferredDate}
                  onChange={(e) => setBookingForm({ ...bookingForm, preferredDate: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div>
                <label htmlFor="preferredTime" style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Preferred Time *
                </label>
                <select
                  id="preferredTime"
                  className="customer-portal-field"
                  name="preferredTime"
                  value={bookingForm.preferredTime}
                  onChange={(e) => setBookingForm({ ...bookingForm, preferredTime: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                >
                  <option value="08:00">8:00 AM</option>
                  <option value="09:00">9:00 AM</option>
                  <option value="10:00">10:00 AM</option>
                  <option value="11:00">11:00 AM</option>
                  <option value="12:00">12:00 PM</option>
                  <option value="13:00">1:00 PM</option>
                  <option value="14:00">2:00 PM</option>
                  <option value="15:00">3:00 PM</option>
                  <option value="16:00">4:00 PM</option>
                  <option value="17:00">5:00 PM</option>
                </select>
              </div>

              <div>
                <label htmlFor="notes" style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Special Notes (optional)
                </label>
                <textarea
                  id="notes"
                  className="customer-portal-field customer-portal-field--textarea"
                  name="notes"
                  value={bookingForm.notes}
                  onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })}
                  placeholder="Any special instructions or access information..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 14,
                    resize: 'vertical'
                  }}
                />
              </div>

              <button
                onClick={handleBookAppointment}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Submit Appointment Request
              </button>
            </div>

            <div style={{
              marginTop: 24,
              padding: '16px',
              background: '#f0f9ff',
              borderRadius: 8,
              border: '1px solid #bae6fd',
              fontSize: 14,
              color: '#0c4a6e'
            }}>
              <strong>📌 Note:</strong> You will receive a confirmation email once your appointment is reviewed and confirmed.
            </div>
          </div>
        </div>
      )}

      {/* Appointments Tab */}
      {activeTab === 'appointments' && (
        <div>
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: 12,
            border: '1px solid #e2e8f0'
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
              Your Appointments ({appointments.length})
            </h3>
            {appointments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
                <p>No scheduled appointments yet</p>
                <p style={{ fontSize: 14 }}>Complete the intake form to receive your first quote</p>
                <button
                  onClick={() => setActiveTab('quotes')}
                  style={{
                    marginTop: 16,
                    padding: '12px 24px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  View Quotes to Book
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                {appointments.map(appointment => (
                  <div
                    key={appointment.id}
                    style={{
                      padding: '20px',
                      background: '#f8fafc',
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
                        {appointment.serviceType || 'Standard'} Cleaning
                      </div>
                      <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>
                        {appointment.bedrooms || 0} bed, {appointment.bathrooms || 0} bath
                      </div>
                      <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>
                        📅 {new Date(appointment.preferredDate).toLocaleDateString()} at {appointment.preferredTime}
                      </div>
                      {appointment.frequency && appointment.frequency !== 'one-time' && (
                        <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>
                          🔄 {appointment.frequency.charAt(0).toUpperCase() + appointment.frequency.slice(1)} recurring
                        </div>
                      )}
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#3b82f6' }}>
                        ${appointment.priceLow || 0} - ${appointment.priceHigh || 0}
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                        Status: <span style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: appointment.status === 'confirmed' ? '#dcfce7' : '#fef3c7',
                          color: appointment.status === 'confirmed' ? '#166534' : '#92400e'
                        }}>
                          {appointment.status || 'Pending'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
