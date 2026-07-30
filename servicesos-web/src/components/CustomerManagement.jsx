// src/components/CustomerManagement.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { getCustomers, createCustomer, updateCustomer, archiveCustomer } from '../core/customers/customerService';
import {
  createExistingCustomerBooking,
  mapExistingCustomerToEstimatePrefill,
} from '../services/existingCustomerBookingService';
import { useAuth } from '../contexts/AuthContext';
import { formatLocalDateInputValue } from '../utils/dateOnly';
import {
  getCustomerPortalQuoteRequests,
  updateCustomerPortalQuoteRequestStatus
} from '../services/customerPortalQuoteRequestService';
import './CustomerManagement.css';

const DUPLICATE_CUSTOMER_MESSAGE = 'Possible duplicate customer found. A customer with this email or phone already exists. Please review the existing customer before creating another record.';

export default function CustomerManagement({ onCreateEstimate, onBookingCreated }) {
  const { currentTenant, user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [customerRequests, setCustomerRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [bookingCustomer, setBookingCustomer] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    notes: ''
  });
  const activeCustomers = customers.filter(customer => customer?.isArchived !== true);

  // Load customers
  const loadCustomers = useCallback(async () => {
    if (!currentTenant?.id) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setLoadError('');
    try {
      const [customerResult, requestResult] = await Promise.all([
        getCustomers(currentTenant.id),
        getCustomerPortalQuoteRequests(currentTenant.id)
      ]);
      if (customerResult.success) {
        setCustomers(customerResult.data);
        setCustomerRequests(requestResult.success ? requestResult.data : []);
      } else {
        setCustomers([]);
        setCustomerRequests([]);
        setLoadError(customerResult.message || 'Unable to load customers.');
      }
    } catch (error) {
      console.error('Error loading customers:', error);
      setCustomers([]);
      setCustomerRequests([]);
      setLoadError('Unable to load customers. Check your access and try again.');
    } finally {
      setLoading(false);
    }
  }, [currentTenant]);

  useEffect(() => {
    let isActive = true;

    Promise.resolve().then(() => {
      if (isActive) {
        loadCustomers();
      }
    });

    return () => {
      isActive = false;
    };
  }, [loadCustomers]);

  const handleInputChange = (e) => {
    setFormError('');
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!currentTenant?.id) {
      alert('No tenant selected');
      return;
    }

    const duplicate = findDuplicateCustomer(activeCustomers, formData, editingCustomer?.id);
    if (duplicate) {
      setFormError(DUPLICATE_CUSTOMER_MESSAGE);
      return;
    }

    try {
      let result;
      setSaving(true);
      
      if (editingCustomer) {
        // Update existing customer
        result = await updateCustomer(currentTenant.id, editingCustomer.id, formData);
      } else {
        // Create new customer
        result = await createCustomer(currentTenant.id, formData);
      }
      
      if (result.success) {
        setShowModal(false);
        setEditingCustomer(null);
        setFormError('');
        setFormData({
          name: '', email: '', phone: '', address: '',
          city: '', state: '', zip: '', notes: ''
        });
        loadCustomers();
      } else {
        alert('Error saving customer: ' + result.message);
      }
    } catch (error) {
      console.error('Error saving customer:', error);
      alert('Error saving customer: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setFormError('');
    setFormData({
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      city: customer.city || '',
      state: customer.state || '',
      zip: customer.zip || '',
      notes: customer.notes || ''
    });
    setShowModal(true);
  };

  const handleArchive = async (customerId) => {
    if (!currentTenant?.id) return;

    const confirmed = window.confirm(
      'Archive this customer?\n\nThis will hide the customer from the active customer list. Existing bookings, payments, and history will be preserved.\n\nThis cannot be undone here.'
    );
    if (!confirmed) return;

    try {
      const result = await archiveCustomer(currentTenant.id, customerId, {
        archivedByUid: user?.uid || null,
        archiveReason: 'Owner/admin archived customer from active list.'
      });
      if (result.success) {
        setCustomers(current => current.map(customer =>
          customer.id === customerId
            ? { ...customer, ...(result.data || {}), isArchived: true }
            : customer
        ));
        alert(result.message || 'Customer archived. Existing bookings, payments, and history were preserved.');
      } else {
        alert(result.message || 'Customer could not be archived. Please try again.');
      }
    } catch (error) {
      console.error('Error archiving customer:', error);
      alert('Error archiving customer: ' + error.message);
    }
  };

  const isActiveCustomer = customer => Boolean(
    customer?.id &&
    customer.isArchived !== true &&
    activeCustomers.some(activeCustomer => activeCustomer.id === customer.id)
  );

  const handleCreateEstimate = customer => {
    if (!isActiveCustomer(customer)) {
      window.alert('This customer is no longer active. Refresh Customers and try again.');
      return;
    }
    onCreateEstimate?.({ ...customer, ...mapExistingCustomerToEstimatePrefill(customer) });
  };

  const handleOpenBooking = customer => {
    if (!isActiveCustomer(customer)) {
      window.alert('This customer is no longer active. Refresh Customers and try again.');
      return;
    }
    setSelectedCustomer(null);
    setBookingCustomer(customer);
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

  const updateRequestStatus = async (requestId, requestStatus) => {
    if (!currentTenant?.id) return;
    const result = await updateCustomerPortalQuoteRequestStatus(currentTenant.id, requestId, requestStatus);
    if (result.success) {
      await loadCustomers();
    } else {
      alert(result.error || result.message || 'Unable to update customer request.');
    }
  };

  const filteredCustomers = activeCustomers.filter(customer => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      customer.name?.toLowerCase().includes(searchLower) ||
      customer.email?.toLowerCase().includes(searchLower) ||
      customer.phone?.includes(searchTerm) ||
      customer.address?.toLowerCase().includes(searchLower) ||
      customer.city?.toLowerCase().includes(searchLower) ||
      customer.state?.toLowerCase().includes(searchLower) ||
      customer.zip?.includes(searchTerm)
    );
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ color: '#64748b' }}>Loading customers...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!currentTenant?.id) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div style={{ textAlign: 'center', padding: '32px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏢</div>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>No Tenant Selected</h2>
          <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
            As a super-admin, you need to select a tenant to manage customers.
          </p>
          <p style={{ fontSize: '14px', color: '#64748b' }}>
            Go to Tenant Management to select a tenant, or switch to an admin account.
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" style={{ maxWidth: '720px', margin: '48px auto', padding: '24px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '20px', color: '#991b1b' }}>Customers could not be loaded</h2>
        <p style={{ margin: '0 0 16px', color: '#7f1d1d' }}>{loadError}</p>
        <button
          onClick={loadCustomers}
          style={{ padding: '10px 16px', background: '#b91c1c', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="v1-page customers-page">
      <div className="v1-page-header customers-page-header" style={{ marginBottom: 32 }}>
        <div>
          <h1 className="v1-page-title">
            Customers
          </h1>
          <p className="v1-page-subtitle">Customer contact records and quote requests that need owner follow-up.</p>
        </div>
        <button
          className="v1-button v1-button-primary customers-add-button"
          onClick={() => {
            setEditingCustomer(null);
            setFormError('');
            setFormData({
              name: '', email: '', phone: '', address: '',
              city: '', state: '', zip: '', notes: ''
            });
            setShowModal(true);
          }}
        >
          + Add Customer
        </button>
      </div>

      {/* Search */}
      <section className="v1-card customers-requests-panel" style={{ marginBottom: 24 }}>
        <div className="customers-section-header">
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#374151' }}>Customer requests</h2>
          <span className="v1-pill">{customerRequests.filter(request => request.requestStatus !== 'archived').length} active</span>
        </div>
        {customerRequests.filter(request => request.requestStatus !== 'archived').length === 0 ? (
          <p className="customers-muted" style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>No new customer requests. Quote requests submitted from the customer flow will appear here for follow-up.</p>
        ) : customerRequests.filter(request => request.requestStatus !== 'archived').map(request => {
          const customer = request.customerSnapshot || request.formData || {};
          const details = request.requestSnapshot || {};
          return (
            <article key={request.id} className="customers-request-card">
              <div className="customers-request-topline">
                <div>
                  <h3>{customer.fullName || customer.name || 'Unknown customer'}</h3>
                  <p>{[customer.email, customer.phone].filter(Boolean).join(' · ') || 'Contact information not provided'}</p>
                </div>
                <span className="v1-pill v1-pill-payment">{request.requestStatus || 'new'}</span>
              </div>
              <dl className="customers-request-details">
                <dt>Service</dt><dd>{details.cleaningType || request.formData?.cleaningType || 'Not specified'}</dd>
                <dt>Notes</dt><dd>{details.specialRequests || details.customerNotes || request.formData?.specialRequests || 'None provided'}</dd>
                <dt>Preferred date</dt><dd>{details.preferredDate || request.appointmentRequest?.preferredDate || 'Not specified'}</dd>
              </dl>
              <div className="customers-request-meta">Source: customer portal · Created: {request.createdAt ? new Date(request.createdAt).toLocaleString() : 'Unknown'}</div>
              <div className="customers-card-actions">
                <button className="v1-button v1-button-secondary" type="button" onClick={() => updateRequestStatus(request.id, 'contacted')} disabled={request.requestStatus === 'contacted'}>Mark contacted</button>
                <button className="v1-button v1-button-secondary" type="button" onClick={() => updateRequestStatus(request.id, 'archived')}>Archive</button>
              </div>
            </article>
          );
        })}
      </section>

      <div className="customers-toolbar">
        <input
          className="customers-search"
          type="text"
          placeholder="Search customers by name, email, phone, or address..."
          value={searchTerm}
          onChange={handleSearch}
        />
      </div>

      {/* Customer List */}
      <div className="v1-card customers-list-card">
        {filteredCustomers.length === 0 ? (
          <div className="v1-empty-state customers-empty-state">
            <div className="customers-empty-icon">👥</div>
            <div>No customers found</div>
            <p>Add a customer manually, or approve quote requests as they come in.</p>
          </div>
        ) : (
          <table className="customers-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map(customer => (
                <tr key={customer.id}>
                  <td data-label="Name" className="customers-name-cell">
                    {customer.name}
                  </td>
                  <td data-label="Email">
                    {customer.email}
                  </td>
                  <td data-label="Phone">
                    {customer.phone}
                  </td>
                  <td data-label="Address">
                    {customer.address && (
                      <>
                        {customer.address}
                        {customer.city && `, ${customer.city}`}
                        {customer.state && `, ${customer.state}`}
                        {customer.zip && ` ${customer.zip}`}
                      </>
                    )}
                  </td>
                  <td data-label="Actions">
                    <div className="customers-row-actions">
                    <button
                      className="v1-button v1-button-secondary"
                      type="button"
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      View customer
                    </button>
                    <button
                      className="v1-button v1-button-primary"
                      type="button"
                      onClick={() => handleCreateEstimate(customer)}
                    >
                      Create Estimate
                    </button>
                    <button
                      className="v1-button v1-button-secondary"
                      type="button"
                      onClick={() => handleOpenBooking(customer)}
                    >
                      Book New Job
                    </button>
                    <button
                      className="v1-button v1-button-secondary"
                      type="button"
                      onClick={() => handleEdit(customer)}
                    >
                      Edit
                    </button>
                    <button
                      className="v1-button customers-archive-button"
                      type="button"
                      onClick={() => handleArchive(customer.id)}
                    >
                      Archive customer
                    </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="v1-modal-overlay customers-modal-overlay">
          <div className="v1-modal customers-modal">
            <div className="customers-modal-header">
              <div>
                <p>{editingCustomer ? 'Update customer record' : 'Create customer record'}</p>
                <h2>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</h2>
              </div>
            </div>
            
            <form className="customers-form" onSubmit={handleSubmit}>
              {formError && (
                <div className="customers-form-alert" role="alert">
                  <div>{formError}</div>
                  {findDuplicateCustomer(activeCustomers, formData, editingCustomer?.id) && (
                    <div className="customers-form-alert-detail">
                      Existing customer: {findDuplicateCustomer(activeCustomers, formData, editingCustomer?.id).name || 'Unnamed customer'}
                    </div>
                  )}
                </div>
              )}

              <div className="customers-form-field">
                <label>
                  Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="customers-form-field">
                <label>
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                />
              </div>

              <div className="customers-form-field">
                <label>
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                />
              </div>

              <div className="customers-form-field">
                <label>
                  Address
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                />
              </div>

              <div className="customers-form-row">
                <div className="customers-form-field">
                  <label>
                    City
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="customers-form-field">
                  <label>
                    State
                  </label>
                  <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div className="customers-form-field">
                <label>
                  ZIP Code
                </label>
                <input
                  type="text"
                  name="zip"
                  value={formData.zip}
                  onChange={handleInputChange}
                />
              </div>

              <div className="customers-form-field">
                <label>
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows={3}
                />
              </div>

              <div className="customers-modal-actions">
                <button
                  className="v1-button v1-button-secondary"
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingCustomer(null);
                    setFormError('');
                    setFormData({
                      name: '', email: '', phone: '', address: '',
                      city: '', state: '', zip: '', notes: ''
                    });
                  }}
                >
                  Cancel
                </button>
                <button
                  className="v1-button v1-button-primary"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : editingCustomer ? 'Update Customer' : 'Add Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedCustomer && (
        <CustomerDetailPanel
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
          onCreateEstimate={() => handleCreateEstimate(selectedCustomer)}
          onBookNewJob={() => handleOpenBooking(selectedCustomer)}
          onEdit={() => {
            setSelectedCustomer(null);
            handleEdit(selectedCustomer);
          }}
        />
      )}

      {bookingCustomer && (
        <ExistingCustomerBookingModal
          customer={bookingCustomer}
          tenantId={currentTenant.id}
          createdBy={user?.uid}
          onClose={() => setBookingCustomer(null)}
          onCreated={() => {
            setBookingCustomer(null);
            onBookingCreated?.();
          }}
        />
      )}
    </div>
  );
}

function SavedProperty({ customer }) {
  const property = [customer?.address, customer?.city, customer?.state, customer?.zip].filter(Boolean).join(', ');
  return <>{property || 'No saved property address'}</>;
}

function CustomerDetailPanel({ customer, onClose, onCreateEstimate, onBookNewJob, onEdit }) {
  return (
    <div className="v1-modal-overlay customers-modal-overlay" role="presentation" onClick={onClose}>
      <section className="v1-modal customers-detail-panel" role="dialog" aria-modal="true" aria-labelledby="customer-detail-title" onClick={event => event.stopPropagation()}>
        <div className="customers-modal-header">
          <div>
            <p>Saved customer record</p>
            <h2 id="customer-detail-title">{customer.name || 'Customer'}</h2>
          </div>
          <button className="customers-close-button" type="button" aria-label="Close customer details" onClick={onClose}>×</button>
        </div>
        <dl className="customers-detail-list">
          <dt>Email</dt><dd>{customer.email || 'Not provided'}</dd>
          <dt>Phone</dt><dd>{customer.phone || 'Not provided'}</dd>
          <dt>Saved property</dt><dd><SavedProperty customer={customer} /></dd>
          {customer.notes && <><dt>Notes</dt><dd>{customer.notes}</dd></>}
        </dl>
        <div className="customers-detail-actions">
          <button className="v1-button v1-button-primary" type="button" onClick={onCreateEstimate}>Create Estimate</button>
          <button className="v1-button v1-button-secondary" type="button" onClick={onBookNewJob}>Book New Job</button>
          <button className="v1-button v1-button-secondary" type="button" onClick={onEdit}>Edit Customer</button>
          <button className="v1-button v1-button-secondary" type="button" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}

function ExistingCustomerBookingModal({ customer, tenantId, createdBy, onClose, onCreated }) {
  const [form, setForm] = useState({ serviceType: '', date: '', startTime: '', agreedPrice: '', notes: '' });
  const [error, setError] = useState('');
  const [savingBooking, setSavingBooking] = useState(false);
  const submissionRef = useRef(false);

  const updateField = event => {
    setError('');
    setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async event => {
    event.preventDefault();
    if (submissionRef.current) return;
    submissionRef.current = true;
    setSavingBooking(true);
    setError('');
    try {
      const result = await createExistingCustomerBooking({
        tenantId,
        customerId: customer.id,
        bookingInput: form,
        createdBy,
      });
      if (!result.success) {
        setError(result.message || 'Booking could not be created.');
        return;
      }
      onCreated(result.data);
    } catch (bookingError) {
      console.error('Existing customer booking failed:', bookingError);
      setError('Booking could not be created. Check your connection and try again.');
    } finally {
      setSavingBooking(false);
      submissionRef.current = false;
    }
  };

  return (
    <div className="v1-modal-overlay customers-modal-overlay" role="presentation" onClick={savingBooking ? undefined : onClose}>
      <section className="v1-modal customers-modal customers-booking-modal" role="dialog" aria-modal="true" aria-labelledby="existing-customer-booking-title" onClick={event => event.stopPropagation()}>
        <div className="customers-modal-header">
          <div>
            <p>New job for saved customer</p>
            <h2 id="existing-customer-booking-title">Book New Job</h2>
          </div>
        </div>
        <div className="customers-booking-saved-data">
          <strong>{customer.name || 'Customer'}</strong>
          <span>{customer.email || 'No email'} · {customer.phone || 'No phone'}</span>
          <span><strong>Saved property:</strong> <SavedProperty customer={customer} /></span>
        </div>
        <form className="customers-form" onSubmit={handleSubmit}>
          <div className="customers-form-field">
            <label htmlFor="existing-customer-service-type">Service type or job title *</label>
            <input id="existing-customer-service-type" name="serviceType" value={form.serviceType} onChange={updateField} required />
          </div>
          <div className="customers-booking-date-time">
            <div className="customers-form-field">
              <label htmlFor="existing-customer-booking-date">Scheduled date *</label>
              <input id="existing-customer-booking-date" className="booking-date-time-field" type="date" name="date" min={formatLocalDateInputValue()} value={form.date} onChange={updateField} required />
            </div>
            <div className="customers-form-field">
              <label htmlFor="existing-customer-booking-time">Scheduled time *</label>
              <input id="existing-customer-booking-time" className="booking-date-time-field" type="time" name="startTime" value={form.startTime} onChange={updateField} required />
            </div>
          </div>
          <div className="customers-form-field">
            <label htmlFor="existing-customer-approved-price">Approved price ($) *</label>
            <input id="existing-customer-approved-price" type="number" name="agreedPrice" min="0.01" step="0.01" value={form.agreedPrice} onChange={updateField} required />
          </div>
          <div className="customers-form-field">
            <label htmlFor="existing-customer-booking-notes">Service scope and notes</label>
            <textarea id="existing-customer-booking-notes" name="notes" rows={3} value={form.notes} onChange={updateField} />
          </div>
          {error && <div className="customers-form-alert" role="alert">{error}</div>}
          <div className="customers-modal-actions">
            <button className="v1-button v1-button-secondary" type="button" onClick={onClose} disabled={savingBooking}>Cancel</button>
            <button className="v1-button v1-button-primary" type="submit" disabled={savingBooking}>
              {savingBooking ? 'Creating booking...' : 'Create booking'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function normalizeCustomerEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeCustomerPhone(value) {
  if (typeof value !== 'string') return '';
  const digits = value.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function findDuplicateCustomer(customers, proposedCustomer, currentCustomerId) {
  const proposedEmail = normalizeCustomerEmail(proposedCustomer?.email);
  const proposedPhone = normalizeCustomerPhone(proposedCustomer?.phone);

  if (!proposedEmail && !proposedPhone) return null;

  return customers.find(customer => {
    if (!customer || customer.id === currentCustomerId) return false;

    const existingEmail = normalizeCustomerEmail(customer.email);
    const existingPhone = normalizeCustomerPhone(customer.phone);

    return (
      (proposedEmail && existingEmail && proposedEmail === existingEmail) ||
      (proposedPhone && existingPhone && proposedPhone === existingPhone)
    );
  }) || null;
}
