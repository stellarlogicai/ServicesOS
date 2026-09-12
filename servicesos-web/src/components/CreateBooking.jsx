import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getCustomers } from '../core/customers/customerService';
import { createExistingCustomerBooking } from '../services/existingCustomerBookingService';
import BookingIntakeFields from './BookingIntakeFields';
import { emptyCommercialDetails } from './bookingIntakeModel';

const initialForm = () => ({
  bookingType: '', serviceType: '', date: '', startTime: '', agreedPrice: '', notes: '',
  commercialDetails: emptyCommercialDetails(),
});

export default function CreateBooking({ onCreated }) {
  const { tenantId, user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submissionRef = useRef(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    const result = await getCustomers(tenantId);
    const active = result.success ? result.data.filter(customer => customer?.isArchived !== true) : [];
    setCustomers(active);
    setError(result.success ? '' : 'Customers could not be loaded. Try again.');
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) loadCustomers(); });
    return () => { active = false; };
  }, [loadCustomers]);

  const updateField = event => {
    const { name, value } = event.target;
    setError('');
    if (name.startsWith('commercialDetails.')) {
      const key = name.split('.')[1];
      setForm(current => ({ ...current, commercialDetails: { ...current.commercialDetails, [key]: value } }));
    } else {
      setForm(current => ({ ...current, [name]: value }));
    }
  };

  const submit = async event => {
    event.preventDefault();
    if (submissionRef.current) return;
    if (!customerId) { setError('Choose a saved customer.'); return; }
    submissionRef.current = true;
    setSaving(true);
    const result = await createExistingCustomerBooking({ tenantId, customerId, bookingInput: form, createdBy: user?.uid });
    if (result.success) onCreated?.(result.data);
    else setError(result.message || 'Booking could not be created.');
    setSaving(false);
    submissionRef.current = false;
  };

  return (
    <section className="v1-page create-booking-page" aria-labelledby="create-booking-title">
      <header className="v1-page-header"><div><h1 className="v1-page-title" id="create-booking-title">Create Booking</h1><p className="v1-page-subtitle">Schedule residential or commercial work for a saved customer.</p></div></header>
      <form className="create-booking-form" onSubmit={submit}>
        <section className="create-booking-section">
          <h2>Customer</h2>
          <label className="create-booking-field" htmlFor="create-booking-customer"><span>Saved customer *</span>
            <select id="create-booking-customer" value={customerId} onChange={event => setCustomerId(event.target.value)} disabled={loading} required>
              <option value="">{loading ? 'Loading customers...' : 'Choose a customer'}</option>
              {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name || customer.email || 'Customer'}</option>)}
            </select>
          </label>
          {!loading && customers.length === 0 && <p>No active customers are available. Add a customer first.</p>}
        </section>
        <BookingIntakeFields form={form} onChange={updateField} idPrefix="create-booking" />
        {error && <div className="customers-form-alert" role="alert">{error}</div>}
        <div className="create-booking-actions"><button className="v1-button v1-button-primary" type="submit" disabled={saving || loading}>{saving ? 'Creating booking...' : 'Create booking'}</button></div>
      </form>
    </section>
  );
}
