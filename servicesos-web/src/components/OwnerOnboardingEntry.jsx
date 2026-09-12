import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const STEP_COPY = {
  business_profile_required: {
    title: 'Set up your business profile',
    detail: 'Your ServicesOS business account is ready for its basic business information.',
    next: 'Business profile setup is the next step.',
  },
  agreement_required: {
    title: 'SaaS Agreement required',
    detail: 'Your business profile is ready. Agreement review is the next required step.',
    next: 'Agreement acceptance is not available in this setup step yet.',
  },
  billing_required: {
    title: 'Billing setup required',
    detail: 'Your agreement step is complete. Billing setup is the next required step.',
    next: 'Billing activation is not available in this setup step yet.',
  },
};

const fieldStyle = {
  width: '100%', boxSizing: 'border-box', padding: 10,
  border: '1px solid #cbd5e1', borderRadius: 6,
};

function BusinessProfileForm({ onboarding, onSubmit }) {
  const [form, setForm] = useState(() => ({
    businessName: onboarding.businessName || '',
    businessEmail: onboarding.businessEmail || '',
    businessPhone: onboarding.businessPhone || '',
    businessAddress: onboarding.businessAddress || '',
    timezone: onboarding.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const update = event => {
    const { name, value } = event.target;
    setForm(current => ({ ...current, [name]: value }));
    setError('');
  };

  const submit = async event => {
    event.preventDefault();
    if (submitting) return;
    const normalized = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]));
    if (Object.values(normalized).some(value => !value)) {
      setError('Complete all required business profile fields.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.businessEmail)) {
      setError('Enter a valid business email address.');
      return;
    }
    setSubmitting(true);
    setError('');
    try { await onSubmit(normalized); }
    catch { setError('Your business profile could not be saved. Try again.'); }
    finally { setSubmitting(false); }
  };

  return (
    <div>
      <h1 style={{ margin: '0 0 10px', fontSize: 24 }}>Set up your business profile</h1>
      <p style={{ color: '#475569' }}>Enter the business details ServicesOS will use for your workspace.</p>
      <form aria-label="Business profile setup" onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        {[
          ['businessName', 'Business Name', 'text', 160],
          ['businessEmail', 'Business Email', 'email', 254],
          ['businessPhone', 'Business Phone', 'tel', 40],
          ['businessAddress', 'Business Address', 'text', 500],
          ['timezone', 'Timezone', 'text', 100],
        ].map(([name, label, type, maxLength]) => (
          <label key={name} style={{ display: 'grid', gap: 6, color: '#334155', fontSize: 13, fontWeight: 600 }}>
            {label}
            <input
              name={name}
              type={type}
              value={form[name]}
              onChange={update}
              maxLength={maxLength}
              required
              disabled={submitting}
              style={fieldStyle}
            />
          </label>
        ))}
        {error ? <p role="alert" style={{ margin: 0, color: '#991b1b' }}>{error}</p> : null}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving business profile…' : 'Continue to agreement'}
        </button>
      </form>
    </div>
  );
}

export default function OwnerOnboardingEntry() {
  const {
    bootstrapOwner,
    completeOwnerBusinessProfile,
    ownerBootstrapCandidate,
    ownerOnboarding,
  } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(ownerBootstrapCandidate === true);
  const requestRef = useRef(0);

  const runBootstrap = async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError('');
    try {
      await bootstrapOwner();
    } catch {
      if (requestId === requestRef.current) {
        setError('ServicesOS could not set up your business account. Try again.');
      }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!ownerBootstrapCandidate) return undefined;
    const requestId = ++requestRef.current;
    bootstrapOwner()
      .catch(() => {
        if (requestId === requestRef.current) {
          setError('ServicesOS could not set up your business account. Try again.');
        }
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false);
      });
    return () => { requestRef.current += 1; };
    // Bootstrap only when auth identifies a new candidate; retry is user-controlled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerBootstrapCandidate]);

  const copy = STEP_COPY[ownerOnboarding?.onboardingState];
  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', display: 'grid', placeItems: 'center', padding: 24 }}>
      <section style={{ width: '100%', maxWidth: 520, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 32 }}>
        <p style={{ margin: '0 0 8px', color: '#475569', fontSize: 13 }}>ServicesOS business setup</p>
        {loading ? (
          <div role="status" aria-live="polite">
            <h1 style={{ margin: '0 0 10px', fontSize: 24 }}>Preparing your business account</h1>
            <p style={{ margin: 0, color: '#475569' }}>Verifying your secure owner workspace…</p>
          </div>
        ) : error ? (
          <div role="alert">
            <h1 style={{ margin: '0 0 10px', fontSize: 24 }}>Business setup is unavailable</h1>
            <p style={{ color: '#475569' }}>{error}</p>
            <button type="button" onClick={runBootstrap}>Try again</button>
          </div>
        ) : ownerOnboarding?.onboardingState === 'business_profile_required' ? (
          <BusinessProfileForm onboarding={ownerOnboarding} onSubmit={completeOwnerBusinessProfile} />
        ) : copy ? (
          <div>
            <h1 style={{ margin: '0 0 10px', fontSize: 24 }}>{copy.title}</h1>
            <p style={{ color: '#475569' }}>{copy.detail}</p>
            <p role="status" style={{ color: '#334155', fontWeight: 600 }}>{copy.next}</p>
          </div>
        ) : (
          <div role="alert">
            <h1 style={{ margin: '0 0 10px', fontSize: 24 }}>Business setup is unavailable</h1>
            <p style={{ margin: 0, color: '#475569' }}>ServicesOS could not verify the next setup step.</p>
          </div>
        )}
      </section>
    </main>
  );
}
