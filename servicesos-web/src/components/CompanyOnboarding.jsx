// src/pages/CompanyOnboarding.jsx
/**
 * New company sign-up flow.
 * Creates the Firestore tenant doc first, then the Firebase Auth user,
 * so the user doc always has a valid tenantId on first load.
 *
 * Steps:
 *  1  Business details
 *  2  Admin account credentials
 *  3  Plan selection (Stripe subscription created after)
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTenant } from '../services/tenantService';
import { useAuth } from '../contexts/AuthContext';

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$49',
    period: '/mo',
    description: 'Perfect for solo operators',
    features: ['Up to 50 quotes/month', 'AI photo analysis', 'SMS + email quotes', 'Basic dashboard'],
    highlight: false,
  },
  {
    id: 'professional',
    name: 'Professional',
    price: '$99',
    period: '/mo',
    description: 'For growing cleaning businesses',
    features: ['Unlimited quotes', 'Advanced analytics', 'Staff scheduling', 'Customer portal', 'Custom branding'],
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$249',
    period: '/mo',
    description: 'Multi-location + franchise ready',
    features: ['Everything in Pro', 'Multi-location', 'Franchise management', 'White-label', 'Priority support'],
    highlight: false,
  },
];

function StepDots({ step, total }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 32 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i + 1 === step ? 24 : 8,
            height: 8,
            borderRadius: 4,
            background: i + 1 <= step ? '#1d4ed8' : '#e5e7eb',
            transition: 'all 0.2s',
          }}
        />
      ))}
    </div>
  );
}

function Field({ label, required, error, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {error && <p style={{ fontSize: 12, color: '#ef4444', margin: '4px 0 0' }}>{error}</p>}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
};

export default function CompanyOnboarding() {
  const navigate = useNavigate();
  const { signup } = useAuth();

  const [step, setStep]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const [business, setBusiness] = useState({
    businessName: '',
    businessEmail: '',
    businessPhone: '',
    businessAddress: '',
  });

  const [account, setAccount] = useState({
    adminEmail: '',
    password: '',
    confirmPassword: '',
    displayName: '',
  });

  const [selectedPlan, setSelectedPlan] = useState('professional');

  // ── Validation ──────────────────────────────────────────────────────────
  const [fieldErrors, setFieldErrors] = useState({});

  const validateStep1 = () => {
    const errs = {};
    if (!business.businessName.trim())  errs.businessName  = 'Required';
    if (!business.businessEmail.trim()) errs.businessEmail = 'Required';
    if (!business.businessPhone.trim()) errs.businessPhone = 'Required';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep2 = () => {
    const errs = {};
    if (!account.displayName.trim())  errs.displayName  = 'Required';
    if (!account.adminEmail.trim())   errs.adminEmail   = 'Required';
    if (account.password.length < 6) errs.password      = 'Minimum 6 characters';
    if (account.password !== account.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit (step 3) ─────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      // 1. Create tenant doc in Firestore
      const tenant = await createTenant({
        businessName:    business.businessName,
        businessEmail:   business.businessEmail,
        businessPhone:   business.businessPhone,
        businessAddress: business.businessAddress,
        subscriptionTier: selectedPlan,
      });

      // 2. Create Firebase Auth user + Firestore user doc
      const signupResult = await signup(
        account.adminEmail,
        account.password,
        tenant.id,
        'admin'
      );

      if (!signupResult.success) {
        throw new Error(signupResult.error);
      }

      // 3. If paid plan, redirect to Stripe checkout
      //    (your stripeService handles this)
      if (selectedPlan !== 'free') {
        navigate('/onboarding/payment', {
          state: { tenantId: tenant.id, plan: selectedPlan },
        });
      } else {
        navigate('/dashboard');
      }

    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const cardStyle = {
    maxWidth: 520,
    margin: '0 auto',
    background: '#fff',
    borderRadius: 16,
    padding: '40px 40px',
    boxShadow: '0 4px 32px rgba(0,0,0,0.08)',
    fontFamily: 'system-ui, sans-serif',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', padding: '32px 16px' }}>
      <div style={{ width: '100%' }}>

        {/* Logo / header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, background: '#1d4ed8', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 12px' }}>🧹</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>CleanOps</h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '4px 0 0' }}>Set up your cleaning business platform</p>
        </div>

        <div style={cardStyle}>
          <StepDots step={step} total={3} />

          {/* ── Step 1: Business details ────────────────────────────────── */}
          {step === 1 && (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>Business information</h2>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px' }}>Tell us about your cleaning company</p>

              <Field label="Business name" required error={fieldErrors.businessName}>
                <input
                  style={inputStyle}
                  placeholder="Sparkle Clean KC"
                  value={business.businessName}
                  onChange={e => setBusiness(p => ({ ...p, businessName: e.target.value }))}
                />
              </Field>

              <Field label="Business email" required error={fieldErrors.businessEmail}>
                <input
                  style={inputStyle}
                  type="email"
                  placeholder="hello@yourcompany.com"
                  value={business.businessEmail}
                  onChange={e => setBusiness(p => ({ ...p, businessEmail: e.target.value }))}
                />
              </Field>

              <Field label="Business phone" required error={fieldErrors.businessPhone}>
                <input
                  style={inputStyle}
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={business.businessPhone}
                  onChange={e => setBusiness(p => ({ ...p, businessPhone: e.target.value }))}
                />
              </Field>

              <Field label="Business address">
                <input
                  style={inputStyle}
                  placeholder="123 Main St, Kansas City, MO"
                  value={business.businessAddress}
                  onChange={e => setBusiness(p => ({ ...p, businessAddress: e.target.value }))}
                />
              </Field>

              <button
                onClick={() => { if (validateStep1()) setStep(2); }}
                style={{ width: '100%', padding: '12px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 8 }}
              >
                Continue →
              </button>

              <p style={{ textAlign: 'center', fontSize: 13, color: '#6b7280', marginTop: 16, marginBottom: 0 }}>
                Already have an account?{' '}
                <a href="/login" style={{ color: '#1d4ed8', textDecoration: 'none', fontWeight: 500 }}>Sign in</a>
              </p>
            </>
          )}

          {/* ── Step 2: Admin account ───────────────────────────────────── */}
          {step === 2 && (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>Create your admin account</h2>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px' }}>This will be the owner account for {business.businessName}</p>

              <Field label="Your full name" required error={fieldErrors.displayName}>
                <input
                  style={inputStyle}
                  placeholder="Jane Smith"
                  value={account.displayName}
                  onChange={e => setAccount(p => ({ ...p, displayName: e.target.value }))}
                />
              </Field>

              <Field label="Admin email" required error={fieldErrors.adminEmail}>
                <input
                  style={inputStyle}
                  type="email"
                  placeholder="you@yourcompany.com"
                  value={account.adminEmail}
                  onChange={e => setAccount(p => ({ ...p, adminEmail: e.target.value }))}
                />
              </Field>

              <Field label="Password" required error={fieldErrors.password}>
                <input
                  style={inputStyle}
                  type="password"
                  placeholder="Minimum 6 characters"
                  value={account.password}
                  onChange={e => setAccount(p => ({ ...p, password: e.target.value }))}
                />
              </Field>

              <Field label="Confirm password" required error={fieldErrors.confirmPassword}>
                <input
                  style={inputStyle}
                  type="password"
                  placeholder="Repeat your password"
                  value={account.confirmPassword}
                  onChange={e => setAccount(p => ({ ...p, confirmPassword: e.target.value }))}
                />
              </Field>

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button onClick={() => setStep(1)} style={{ flex: 1, padding: '12px', background: 'transparent', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>
                  ← Back
                </button>
                <button onClick={() => { if (validateStep2()) setStep(3); }} style={{ flex: 2, padding: '12px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                  Continue →
                </button>
              </div>
            </>
          )}

          {/* ── Step 3: Plan selection ──────────────────────────────────── */}
          {step === 3 && (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>Choose your plan</h2>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px' }}>Start free for 14 days, cancel anytime</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                {PLANS.map(plan => (
                  <div
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan.id)}
                    style={{
                      padding: '16px 18px',
                      border: `2px solid ${selectedPlan === plan.id ? '#1d4ed8' : '#e5e7eb'}`,
                      borderRadius: 10,
                      cursor: 'pointer',
                      background: selectedPlan === plan.id ? '#eff6ff' : '#fff',
                      position: 'relative',
                      transition: 'all 0.15s',
                    }}
                  >
                    {plan.highlight && (
                      <span style={{ position: 'absolute', top: -10, right: 16, fontSize: 11, fontWeight: 600, background: '#1d4ed8', color: '#fff', padding: '2px 10px', borderRadius: 20 }}>
                        Most popular
                      </span>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div>
                        <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{plan.name}</span>
                        <span style={{ fontSize: 13, color: '#6b7280', marginLeft: 8 }}>{plan.description}</span>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: selectedPlan === plan.id ? '#1d4ed8' : '#111827' }}>{plan.price}</span>
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>{plan.period}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                      {plan.features.map(f => (
                        <span key={f} style={{ fontSize: 12, color: selectedPlan === plan.id ? '#1d4ed8' : '#6b7280' }}>✓ {f}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {error && (
                <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 14, marginBottom: 16 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setStep(2)} style={{ flex: 1, padding: '12px', background: 'transparent', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>
                  ← Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  style={{ flex: 2, padding: '12px', background: loading ? '#93c5fd' : '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}
                >
                  {loading ? 'Setting up your account…' : 'Start 14-day free trial →'}
                </button>
              </div>

              <p style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginTop: 12, marginBottom: 0 }}>
                No credit card required for the free trial. Cancel anytime.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
