import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ServiceCatalogSettings from './ServiceCatalogSettings';
import CompanySettings from './CompanySettings';
import EmployeeManagement from './EmployeeManagement';
import StripeConnectOnboarding from './StripeConnectOnboarding';
import { setWorkforceMode } from '../services/employeeTeamService';
import { BUSINESS_DAYS, getBusinessSettings, saveBusinessSettings } from '../services/businessSettingsService';

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

function OperationalSetupPending({ onboarding }) {
  const completedCount = onboarding.operationalProgress?.completedSteps?.length || 0;
  const nextStep = onboarding.operationalProgress?.nextStep;
  return (
    <div>
      <h1 style={{ margin: '0 0 10px', fontSize: 24 }}>Continue setting up ServicesOS</h1>
      <p style={{ color: '#475569' }}>
        Your subscription is active. Your business setup is still in progress.
      </p>
      <p role="status" style={{ color: '#334155', fontWeight: 600 }}>
        {completedCount} setup steps complete. {nextStep === 'team_setup' ? 'Team setup is next.' : 'Continue the next required setup step.'}
      </p>
      <p style={{ margin: 0, color: '#64748b' }}>
        Your progress is saved. You can safely return here later.
      </p>
    </div>
  );
}

function ServicesPricingStep({ refresh }) {
  return <div><h1 style={{ margin: '0 0 10px', fontSize: 24 }}>Services and pricing</h1><p style={{ color: '#475569' }}>Configure at least one active service before continuing.</p><ServiceCatalogSettings onSaved={refresh} /></div>;
}

function AvailabilityStep({ refresh, tenantId }) {
  const [days,setDays]=useState([]); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  useEffect(()=>{let active=true;getBusinessSettings(tenantId).then(value=>{if(active)setDays(value.availability.availableDays);}).catch(()=>{if(active)setError('Availability could not be loaded. Try again.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[tenantId]);
  const toggle=day=>setDays(current=>current.includes(day)?current.filter(value=>value!==day):[...current,day]);
  const save=async()=>{if(!days.length){setError('Select at least one available day.');return;}setSaving(true);setError('');try{const current=await getBusinessSettings(tenantId);await saveBusinessSettings(tenantId,{...current,availability:{availableDays:days}});await refresh();}catch{setError('Availability could not be saved. Try again.');}finally{setSaving(false);}};
  return <div><h1 style={{ margin: '0 0 10px', fontSize: 24 }}>Availability</h1><p style={{ color: '#475569' }}>Choose at least one working day for current V1 booking behavior.</p>{loading?<p role="status">Loading availability...</p>:<><fieldset><legend>Available working days</legend>{BUSINESS_DAYS.map(day=><label key={day} style={{display:'block',margin:'8px 0'}}><input type="checkbox" checked={days.includes(day)} onChange={()=>toggle(day)} disabled={saving}/>{day}</label>)}</fieldset>{error&&<p role="alert">{error}</p>}<button type="button" onClick={save} disabled={saving||!days.length}>{saving?'Saving...':'Save availability'}</button></>}</div>;
}

function BrandingStep({ refresh }) {
  return <div>
    <h1 style={{ margin: '0 0 10px', fontSize: 24 }}>Branding</h1>
    <p style={{ color: '#475569' }}>Your saved custom branding needs attention. You can restore the ServicesOS default or save supported optional branding.</p>
    <CompanySettings onBrandingSaved={refresh} />
  </div>;
}

function TeamSetupStep({ onboarding, refresh }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const chooseMode = async workforceMode => {
    if (saving) return;
    setSaving(true); setError('');
    try { await setWorkforceMode(workforceMode); await refresh(); }
    catch { setError('Team setup could not be saved. Try again.'); }
    finally { setSaving(false); }
  };
  if (onboarding.teamSetupComplete) return <div><h1 style={{ margin: '0 0 10px', fontSize: 24 }}>Team setup complete</h1><p role="status">Your team setup is complete. The next setup stage will be available here later.</p></div>;
  if (onboarding.workforceMode === 'employees') return <div><h1 style={{ margin: '0 0 10px', fontSize: 24 }}>Set up your team</h1><p style={{ color: '#475569' }}>Add at least one active employee to continue.</p>{error && <p role="alert">{error}</p>}<EmployeeManagement onChanged={refresh} /></div>;
  return <div><h1 style={{ margin: '0 0 10px', fontSize: 24 }}>Set up your team</h1><p style={{ color: '#475569' }}>Choose whether you work alone or with employees.</p>{error && <p role="alert">{error}</p>}<div style={{ display: 'flex', gap: 10 }}><button type="button" onClick={() => chooseMode('owner_only')} disabled={saving}>I work alone</button><button type="button" onClick={() => chooseMode('employees')} disabled={saving}>I have employees</button></div></div>;
}

function StripeConnectStep({ onboarding, refresh }) {
  return <div>
    <h1 style={{ margin: '0 0 10px', fontSize: 24 }}>Connect customer payments</h1>
    <p style={{ color: '#475569' }}>Connect Stripe before ServicesOS can activate online customer payments.</p>
    {onboarding.stripeConnectStatus === 'unavailable' ? (
      <p role="alert" style={{ color: '#991b1b' }}>Stripe status could not be verified. Refresh status and try again.</p>
    ) : null}
    <StripeConnectOnboarding
      tenantId={onboarding.tenantId}
      initialBusinessEmail={onboarding.businessEmail || ''}
      initialBusinessName={onboarding.businessName || ''}
      onStatusConfirmed={refresh}
    />
    <p style={{ color: '#64748b' }}>You can leave and return later. Stripe setup remains required until ServicesOS verifies it is ready.</p>
  </div>;
}

function FinalAcceptanceStep({ onboarding, finish, refresh }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const items = [
    ['Services and pricing', onboarding.servicesPricingComplete],
    ['Availability', onboarding.availabilityComplete],
    ['Branding', onboarding.brandingComplete],
    ['Team', onboarding.teamSetupComplete],
    ['Stripe Connect', onboarding.stripeConnectComplete],
    ['SaaS subscription', onboarding.billingEntitlement === 'active'],
  ];
  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await finish();
    } catch (failure) {
      try {
        await refresh();
      } catch {
        setError('Setup could not be refreshed. Review the current setup and try again.');
        return;
      }
      if (failure?.blockingStage === 'subscription_billing') {
        setError('Your SaaS subscription needs attention before setup can be finished.');
      } else if (failure?.blockingStage === 'stripe_connect') {
        setError('Stripe Connect readiness changed. Review payment setup and try again.');
      } else {
        setError('Setup requirements changed or could not be verified. Review the current setup and try again.');
      }
    } finally {
      setSaving(false);
    }
  };
  return <div>
    <h1 style={{ margin: '0 0 10px', fontSize: 24 }}>Final setup review</h1>
    <p style={{ color: '#475569' }}>Review your setup before activating your ServicesOS workspace.</p>
    <ul aria-label="Setup readiness" style={{ paddingLeft: 20, lineHeight: 1.9 }}>
      {items.map(([label, ready]) => <li key={label}>{label}: {ready ? 'Ready' : 'Needs attention'}</li>)}
    </ul>
    {error && <p role="alert" style={{ color: '#991b1b' }}>{error}</p>}
    <button type="button" onClick={submit} disabled={saving}>
      {saving ? 'Verifying setup...' : 'Finish setup'}
    </button>
  </div>;
}

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

function AgreementStep({ loadAgreement, acceptAgreement }) {
  const [agreement, setAgreement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signerName, setSignerName] = useState('');
  const [affirmed, setAffirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const requestRef = useRef(0);

  const load = async () => {
    const requestId = ++requestRef.current;
    setLoading(true); setError('');
    try { const result = await loadAgreement(); if (requestId === requestRef.current) setAgreement(result); }
    catch { if (requestId === requestRef.current) setError('The SaaS agreement could not be loaded. Try again.'); }
    finally { if (requestId === requestRef.current) setLoading(false); }
  };
  useEffect(() => {
    const requestId = ++requestRef.current;
    loadAgreement()
      .then(result => { if (requestId === requestRef.current) setAgreement(result); })
      .catch(() => { if (requestId === requestRef.current) setError('The SaaS agreement could not be loaded. Try again.'); })
      .finally(() => { if (requestId === requestRef.current) setLoading(false); });
    return () => { requestRef.current += 1; };
  }, [loadAgreement]);

  const submit = async event => {
    event.preventDefault();
    const normalizedName = signerName.trim();
    if (!agreement || !normalizedName || normalizedName.length > 160 || !affirmed || submitting) return;
    setSubmitting(true); setError('');
    try { await acceptAgreement({ signerName: normalizedName, agreementId: agreement.agreementId, termsHash: agreement.termsHash }); }
    catch { setError('The agreement could not be accepted. Try again.'); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div role="status"><h1 style={{ fontSize: 24 }}>Loading SaaS Agreement</h1></div>;
  if (error && !agreement) return <div role="alert"><h1 style={{ fontSize: 24 }}>SaaS Agreement unavailable</h1><p>{error}</p><button type="button" onClick={load}>Try again</button></div>;
  if (!agreement) return null;
  return (
    <div>
      <h1 style={{ fontSize: 24 }}>ServicesOS Software-as-a-Service Agreement</h1>
      <p><strong>ServicesOS SaaS V1</strong> <code>{agreement.agreementId}</code></p>
      <pre aria-label="ServicesOS SaaS agreement terms" style={{ whiteSpace: 'pre-wrap', overflowY: 'auto', maxHeight: 440, padding: 16, border: '1px solid #cbd5e1', fontFamily: 'inherit', lineHeight: 1.55 }}>{agreement.termsMarkdown}</pre>
      <form aria-label="SaaS agreement acceptance" onSubmit={submit} style={{ display: 'grid', gap: 14, marginTop: 18 }}>
        <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>Typed signer name
          <input aria-label="Typed signer name" value={signerName} onChange={event => setSignerName(event.target.value)} maxLength={160} disabled={submitting} style={fieldStyle} />
        </label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={affirmed} onChange={event => setAffirmed(event.target.checked)} disabled={submitting} />
          <span>{agreement.acceptanceLanguage}</span>
        </label>
        {error ? <p role="alert" style={{ color: '#991b1b' }}>{error}</p> : null}
        <button type="submit" disabled={!signerName.trim() || !affirmed || submitting}>{submitting ? 'Accepting Agreement…' : 'Accept Agreement & Continue'}</button>
      </form>
    </div>
  );
}

export function BillingStep({ startCheckout, redirectToCheckout = url => window.location.assign(url) }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [billingInterval, setBillingInterval] = useState('monthly');
  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const checkout = await startCheckout(billingInterval);
      redirectToCheckout(checkout.checkoutUrl);
    } catch {
      setError('Secure checkout could not be opened. Try again.');
      setSubmitting(false);
    }
  };
  return (
    <div>
      <h1 style={{ margin: '0 0 10px', fontSize: 24 }}>ServicesOS subscription</h1>
      <p style={{ color: '#475569' }}>Complete secure billing setup to activate your business account.</p>
      <fieldset disabled={submitting} style={{ border: 0, padding: 0, margin: '22px 0' }}>
        <legend style={{ fontWeight: 700, marginBottom: 10 }}>Choose billing interval</legend>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <input type="radio" name="billingInterval" value="monthly" checked={billingInterval === 'monthly'} onChange={() => setBillingInterval('monthly')} />
          <span>Monthly - $100/month</span>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="radio" name="billingInterval" value="annual" checked={billingInterval === 'annual'} onChange={() => setBillingInterval('annual')} />
          <span>Annual - $1,000/year</span>
        </label>
      </fieldset>
      <p>No trial.</p>
      {error ? <p role="alert" style={{ color: '#991b1b' }}>{error}</p> : null}
      <button type="button" disabled={submitting} onClick={submit}>
        {submitting ? 'Opening Secure Checkout…' : 'Continue to Secure Checkout'}
      </button>
    </div>
  );
}

export default function OwnerOnboardingEntry() {
  const {
    bootstrapOwner,
    completeOwnerBusinessProfile,
    loadOwnerAgreement,
    acceptOwnerAgreement,
    startOwnerSubscriptionCheckout,
    ownerBootstrapCandidate,
    ownerOnboarding,
    refreshOwnerOnboarding,
    finishOwnerOperationalSetup,
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

  useEffect(() => {
    if (ownerBootstrapCandidate || typeof refreshOwnerOnboarding !== 'function' || ownerOnboarding?.onboardingState !== 'operational_setup_required' || typeof ownerOnboarding.servicesPricingComplete === 'boolean') return undefined;
    Promise.resolve(refreshOwnerOnboarding()).catch(() => setError('ServicesOS could not verify setup progress. Try again.'));
    return undefined;
  }, [ownerBootstrapCandidate, ownerOnboarding?.onboardingState, ownerOnboarding?.servicesPricingComplete, refreshOwnerOnboarding]);

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
        ) : ownerOnboarding?.onboardingState === 'agreement_required' ? (
          <AgreementStep loadAgreement={loadOwnerAgreement} acceptAgreement={acceptOwnerAgreement} />
        ) : ownerOnboarding?.onboardingState === 'billing_required' ? (
          <BillingStep startCheckout={startOwnerSubscriptionCheckout} />
        ) : ownerOnboarding?.onboardingState === 'operational_setup_required' ? (
          typeof ownerOnboarding.servicesPricingComplete === 'boolean' && ownerOnboarding.operationalProgress?.nextStep === 'services_pricing' ? <ServicesPricingStep refresh={refreshOwnerOnboarding} /> : typeof ownerOnboarding.servicesPricingComplete === 'boolean' && ownerOnboarding.operationalProgress?.nextStep === 'availability' ? <AvailabilityStep tenantId={ownerOnboarding.tenantId} refresh={refreshOwnerOnboarding} /> : typeof ownerOnboarding.brandingComplete === 'boolean' && ownerOnboarding.operationalProgress?.nextStep === 'branding' ? <BrandingStep refresh={refreshOwnerOnboarding} /> : ownerOnboarding.operationalProgress?.nextStep === 'team_setup' ? <TeamSetupStep onboarding={ownerOnboarding} refresh={refreshOwnerOnboarding} /> : ownerOnboarding.operationalProgress?.nextStep === 'stripe_connect' ? <StripeConnectStep onboarding={ownerOnboarding} refresh={refreshOwnerOnboarding} /> : ownerOnboarding.operationalProgress?.nextStep === 'final_acceptance' ? <FinalAcceptanceStep onboarding={ownerOnboarding} finish={finishOwnerOperationalSetup} refresh={refreshOwnerOnboarding} /> : <OperationalSetupPending onboarding={ownerOnboarding} />
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
