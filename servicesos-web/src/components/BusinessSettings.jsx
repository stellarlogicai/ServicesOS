import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  BUSINESS_DAYS,
  getBusinessSettings,
  saveBusinessSettings,
} from '../services/businessSettingsService';
import StripeConnectOnboarding from './StripeConnectOnboarding';

const emptyForm = {
  businessName: '',
  businessPhone: '',
  businessEmail: '',
  serviceArea: '',
  availability: { availableDays: [] },
};

export default function BusinessSettings() {
  const { currentTenant } = useAuth();
  const tenantId = typeof currentTenant === 'string' ? currentTenant : currentTenant?.id;
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    if (!tenantId) {
      setError('Business settings could not be loaded. Your tenant is unavailable.');
      setLoading(false);
      return;
    }
    try {
      setForm(await getBusinessSettings(tenantId));
    } catch {
      setError('Business settings could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => active && load());
    return () => { active = false; };
  }, [load]);

  const updateText = event => {
    const { name, value } = event.target;
    setForm(current => ({ ...current, [name]: value }));
    setSuccess('');
  };

  const toggleDay = day => {
    setForm(current => {
      const selected = current.availability.availableDays;
      return {
        ...current,
        availability: {
          availableDays: selected.includes(day)
            ? selected.filter(value => value !== day)
            : [...selected, day],
        },
      };
    });
    setSuccess('');
  };

  const save = async event => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (form.availability.availableDays.length === 0) {
      setError('Select at least one available day.');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveBusinessSettings(tenantId, form);
      setForm(saved);
      setSuccess('Business settings saved.');
    } catch {
      setError('Business settings could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const fieldStyle = { width: '100%', boxSizing: 'border-box', padding: 10, border: '1px solid #cbd5e1', borderRadius: 8 };

  return (
    <section className="v1-page business-settings-page" style={{ maxWidth: 820 }} aria-labelledby="business-settings-title">
      <div className="v1-page-header">
        <h1 className="v1-page-title" id="business-settings-title">Business Settings</h1>
        <p className="v1-page-subtitle">Set the business contact details, working days, and Stripe readiness for online booking payments.</p>
      </div>
      {loading && <p role="status">Loading business settings...</p>}
      {!loading && error && <div role="alert" style={{ color: '#b91c1c', marginBottom: 16 }}>{error}</div>}
      {!loading && error && tenantId && <button type="button" onClick={load}>Try again</button>}
      {!loading && !error && (
        <div style={{ display: 'grid', gap: 18 }}>
          <form className="v1-card business-settings-form" onSubmit={save} style={{ display: 'grid', gap: 18 }}>
            <label>Business name<input name="businessName" value={form.businessName} onChange={updateText} style={fieldStyle} /></label>
            <label>Business phone<input name="businessPhone" value={form.businessPhone} onChange={updateText} style={fieldStyle} /></label>
            <label>Business email<input name="businessEmail" type="email" value={form.businessEmail} onChange={updateText} style={fieldStyle} /></label>
            <label>Service area<input name="serviceArea" value={form.serviceArea} onChange={updateText} style={fieldStyle} /></label>
            <fieldset style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: 16 }}>
              <legend>Available working days</legend>
              <p className="v1-muted" style={{ margin: '0 0 12px' }}>
                These days are used when checking whether a booking can be scheduled.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                {BUSINESS_DAYS.map(day => (
                  <label key={day} style={{ textTransform: 'capitalize' }}>
                    <input
                      type="checkbox"
                      checked={form.availability.availableDays.includes(day)}
                      onChange={() => toggleDay(day)}
                    />{' '}{day.charAt(0).toUpperCase() + day.slice(1)}
                  </label>
                ))}
              </div>
            </fieldset>
            {error && <div role="alert" style={{ color: '#b91c1c' }}>{error}</div>}
            {success && <div role="status" style={{ color: '#15803d' }}>{success}</div>}
            <button className="v1-button v1-button-primary" type="submit" disabled={saving || form.availability.availableDays.length === 0}>
              {saving ? 'Saving…' : 'Save Business Settings'}
            </button>
          </form>

          <StripeConnectOnboarding tenantId={tenantId} />
        </div>
      )}
    </section>
  );
}
