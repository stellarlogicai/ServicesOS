import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  BUSINESS_DAYS,
  getBusinessSettings,
  saveBusinessSettings,
} from '../services/businessSettingsService';

const emptyForm = {
  businessName: '',
  businessPhone: '',
  businessEmail: '',
  serviceArea: '',
  businessAddress: '',
  websiteUrl: '',
  facebookUrl: '',
  defaultServiceNotes: '',
  availability: { availableDays: [] },
  stripeConnection: {
    label: 'Unknown',
    detail: 'Stripe status is unavailable.',
    stripeAccountId: '',
    chargesEnabled: false,
    payoutsEnabled: false,
    status: 'unknown',
  },
};

export default function BusinessSettings() {
  const { currentTenant, user } = useAuth();
  const tenantId = typeof currentTenant === 'string' ? currentTenant : currentTenant?.id;
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setError('');
    setSuccess('');
    if (!tenantId) {
      setLoadError('Business settings could not be loaded. Your tenant is unavailable.');
      setLoading(false);
      return;
    }
    try {
      setForm(await getBusinessSettings(tenantId));
    } catch {
      setLoadError('Business settings could not be loaded. Please try again.');
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
    const normalizedName = form.businessName.trim();
    const normalizedEmail = form.businessEmail.trim();
    if (!normalizedName) {
      setError('Business name is required.');
      return;
    }
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid business email address.');
      return;
    }
    if (form.availability.availableDays.length === 0) {
      setError('Select at least one available day.');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveBusinessSettings(tenantId, form, { updatedByUid: user?.uid });
      setForm(current => ({ ...current, ...saved }));
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
      <div className="v1-page-header" style={{ marginBottom: 32 }}>
        <h1 className="v1-page-title" id="business-settings-title">Business Settings</h1>
        <p className="v1-page-subtitle">Set the business details used for owner/admin records and customer-facing copy where available.</p>
      </div>
      {loading && <p role="status">Loading business settings...</p>}
      {!loading && loadError && <div role="alert" style={{ color: '#b91c1c', marginBottom: 16 }}>{loadError}</div>}
      {!loading && loadError && tenantId && <button type="button" onClick={load}>Try again</button>}
      {!loading && !loadError && (
        <div style={{ display: 'grid', gap: 24 }}>
          <form className="v1-card business-settings-form" aria-label="Business settings form" onSubmit={save} style={{ display: 'grid', gap: 20, padding: 24 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Basic business details</div>
              <p className="v1-muted" style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                These details are used for owner/admin records and customer-facing copy where available.
              </p>
            </div>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Business name *</div>
              <input name="businessName" value={form.businessName} onChange={updateText} required style={fieldStyle} />
            </label>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Business phone</div>
              <input name="businessPhone" value={form.businessPhone} onChange={updateText} style={fieldStyle} />
            </label>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Business email</div>
              <input name="businessEmail" type="email" value={form.businessEmail} onChange={updateText} style={fieldStyle} />
            </label>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Service area</div>
              <input name="serviceArea" value={form.serviceArea} onChange={updateText} style={fieldStyle} />
            </label>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Business address <span style={{ color: '#64748b' }}>(optional)</span></div>
              <input name="businessAddress" value={form.businessAddress} onChange={updateText} style={fieldStyle} />
            </label>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Website link <span style={{ color: '#64748b' }}>(optional)</span></div>
              <input name="websiteUrl" value={form.websiteUrl} onChange={updateText} style={fieldStyle} />
            </label>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Facebook link <span style={{ color: '#64748b' }}>(optional)</span></div>
              <input name="facebookUrl" value={form.facebookUrl} onChange={updateText} style={fieldStyle} />
            </label>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Default service notes <span style={{ color: '#64748b' }}>(optional)</span></div>
              <textarea name="defaultServiceNotes" value={form.defaultServiceNotes} onChange={updateText} rows={4} style={{ ...fieldStyle, resize: 'vertical' }} />
            </label>
            
            <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8, marginTop: 8 }}>Availability</div>
            <fieldset style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: 20 }}>
              <legend style={{ fontSize: 14, fontWeight: 600, color: '#374151', padding: '0 8px' }}>Available working days</legend>
              <p className="v1-muted" style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                These days are used when checking whether a booking can be scheduled.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
                {BUSINESS_DAYS.map(day => (
                  <label key={day} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#374151' }}>
                    <input
                      type="checkbox"
                      checked={form.availability.availableDays.includes(day)}
                      onChange={() => toggleDay(day)}
                      style={{ width: 18, height: 18 }}
                    />
                    {day.charAt(0).toUpperCase() + day.slice(1)}
                  </label>
                ))}
              </div>
            </fieldset>
            
            {error && <div role="alert" style={{ marginTop: 16, padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 14 }}>{error}</div>}
            {success && <div role="status" style={{ marginTop: 16, padding: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#166534', fontSize: 14 }}>{success}</div>}
            <button className="v1-button v1-button-primary" type="submit" disabled={saving || form.availability.availableDays.length === 0} style={{ marginTop: 8 }}>
              {saving ? 'Saving…' : 'Save Business Settings'}
            </button>
          </form>

          <section className="v1-card" aria-labelledby="stripe-status-title" style={{ padding: 24 }}>
            <h2 id="stripe-status-title" style={{ margin: '0 0 8px', color: '#0f172a', fontSize: 18 }}>Stripe connection status</h2>
            <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>
              This is read-only payment connection visibility. Stripe setup and payment confirmation are handled separately.
            </p>
            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, margin: 0 }}>
              <ReadOnlyDetail label="Status" value={form.stripeConnection?.label || 'Unknown'} />
              <ReadOnlyDetail label="Details" value={form.stripeConnection?.detail || 'Stripe status is unavailable.'} />
              <ReadOnlyDetail label="Connected account" value={form.stripeConnection?.stripeAccountId || 'Not connected'} />
              <ReadOnlyDetail label="Online payments active" value={form.stripeConnection?.chargesEnabled ? 'Ready' : 'Not ready'} />
              <ReadOnlyDetail label="Payouts active" value={form.stripeConnection?.payoutsEnabled ? 'Ready' : 'Not ready'} />
              <ReadOnlyDetail label="Backend status" value={form.stripeConnection?.status || 'Unknown'} />
            </dl>
          </section>
        </div>
      )}
    </section>
  );
}

function ReadOnlyDetail({ label, value }) {
  return (
    <div>
      <dt style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</dt>
      <dd style={{ margin: '6px 0 0', color: '#0f172a' }}>{value}</dd>
    </div>
  );
}
