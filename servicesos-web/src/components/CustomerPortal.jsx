// src/components/CustomerPortal.jsx
import { useState, useEffect } from 'react';
import { getQuotes } from '../services/crmService';
import { downloadQuotePDF } from '../services/pdfService';

function getStoredAppointments() {
  try {
    const stored = localStorage.getItem('customer_appointments');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export default function CustomerPortal() {
  const [activeTab, setActiveTab] = useState('quotes');
  const [quotes, setQuotes] = useState([]);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [appointments, setAppointments] = useState(() => getStoredAppointments());
  const [message, setMessage] = useState({ type: '', text: '' });

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

    getQuotes().then((quotes) => {
      if (isMounted) {
        setQuotes(quotes || []);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

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

    const appointment = {
      id: `apt_${Date.now()}`,
      quoteId: bookingForm.quoteId,
      customerName: quote.formData.fullName || 'Customer',
      customerEmail: quote.formData.email || '',
      customerPhone: quote.formData.phone || '',
      customerAddress: quote.formData.address || '',
      serviceType: quote.formData.cleaningType || 'Standard',
      bedrooms: quote.formData.bedrooms || 0,
      bathrooms: quote.formData.bathrooms || 0,
      preferredDate: bookingForm.preferredDate,
      preferredTime: bookingForm.preferredTime,
      notes: bookingForm.notes,
      frequency: quote.formData.frequency || 'one-time',
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #e2e8f0' }}>
        {['quotes', 'booking', 'appointments'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 24px',
              background: activeTab === tab ? 'white' : 'transparent',
              color: activeTab === tab ? '#3b82f6' : '#64748b',
              border: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
              borderBottom: activeTab === tab ? '2px solid white' : '2px solid #e2e8f0',
              borderRadius: '8px 8px 0 0',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: activeTab === tab ? -2 : 0
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1).replace('-', ' ')}
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
                <p style={{ fontSize: 14 }}>Complete the intake form to receive your first quote</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                {quotes.map(quote => (
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
                        {quote.formData.fullName || 'Customer'}
                      </div>
                      <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>
                        {quote.formData.cleaningType || 'Standard'} Cleaning · {quote.formData.bedrooms || 0} bed, {quote.formData.bathrooms || 0} bath
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#3b82f6' }}>
                        ${quote.estimate?.priceLow || 0} - ${quote.estimate?.priceHigh || 0}
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                        Created: {new Date(quote.createdAt).toLocaleDateString()}
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
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                <div><strong>Name:</strong> {selectedQuote.formData.fullName || 'N/A'}</div>
                <div><strong>Email:</strong> {selectedQuote.formData.email || 'N/A'}</div>
                <div><strong>Phone:</strong> {selectedQuote.formData.phone || 'N/A'}</div>
                <div><strong>Address:</strong> {selectedQuote.formData.address || 'N/A'}</div>
              </div>
            </div>

            {/* Service Details */}
            <div style={{ marginBottom: 24, padding: '20px', background: '#f8fafc', borderRadius: 8 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>
                Service Details
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: 14, color: '#64748b' }}>
                <div><strong>Type:</strong> {selectedQuote.formData.cleaningType || 'Standard'}</div>
                <div><strong>Bedrooms:</strong> {selectedQuote.formData.bedrooms || 0}</div>
                <div><strong>Bathrooms:</strong> {selectedQuote.formData.bathrooms || 0}</div>
                <div><strong>Square Feet:</strong> {selectedQuote.formData.squareFootage || 'N/A'}</div>
                <div><strong>Frequency:</strong> {selectedQuote.formData.frequency || 'One-time'}</div>
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
                ${selectedQuote.estimate?.priceLow || 0} - ${selectedQuote.estimate?.priceHigh || 0}
              </div>
              <div style={{ fontSize: 14, color: '#1e40af', marginTop: 8 }}>
                Estimated Duration: {selectedQuote.estimate?.duration || 'N/A'}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12 }}>
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
