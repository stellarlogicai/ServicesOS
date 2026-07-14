import { useCallback, useEffect, useState } from 'react';
import {
  createConnectedAccount,
  generateOnboardingLink,
  getConnectedAccountStatus,
} from '../services/stripeService';

export default function StripeConnectOnboarding({
  tenantId,
  initialBusinessEmail = '',
  initialBusinessName = '',
}) {
  const [accountStatus, setAccountStatus] = useState(null);
  const [businessEmail, setBusinessEmail] = useState(initialBusinessEmail);
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const connected = Boolean(accountStatus?.connected);
  const chargesEnabled = accountStatus?.chargesEnabled === true;
  const payoutsEnabled = accountStatus?.payoutsEnabled === true;
  const statusKnown = accountStatus !== null;
  const fullyReady = connected && chargesEnabled && payoutsEnabled;

  const refreshStatus = useCallback(async () => {
    if (!tenantId) {
      setError('Stripe Connect setup needs an active tenant.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      setAccountStatus(await getConnectedAccountStatus(tenantId));
    } catch {
      setError('Stripe Connect status could not be refreshed.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      if (!active) return;
      await refreshStatus();
    });
    return () => { active = false; };
  }, [refreshStatus]);

  const continueOnboarding = async () => {
    setWorking(true);
    setError('');
    try {
      const data = await generateOnboardingLink({
        tenantId,
        returnUrl: window.location.href,
        refreshUrl: window.location.href,
      });
      window.open(data.url, '_self', 'noopener,noreferrer');
    } catch {
      setError('Stripe onboarding could not be opened. Try again or refresh Stripe status.');
    } finally {
      setWorking(false);
    }
  };

  const startOnboarding = async event => {
    event.preventDefault();
    if (!businessEmail) {
      setError('Business email is required for Stripe Connect setup.');
      return;
    }

    setWorking(true);
    setError('');
    try {
      await createConnectedAccount({ tenantId, businessEmail, businessName });
      await continueOnboarding();
    } catch (err) {
      setError(err.message || 'Stripe Connect account could not be created. Try again or refresh Stripe status.');
      setWorking(false);
    }
  };

  const statusText = !statusKnown
    ? 'Stripe status unknown'
    : fullyReady
      ? 'Connected'
      : connected
        ? 'Stripe setup is incomplete. Resume setup before sending online payment links from Bookings.'
        : 'Stripe is not connected.';

  return (
    <section className="v1-card" aria-labelledby="stripe-connect-title" style={{ display: 'grid', gap: 14 }}>
      <div>
        <h2 className="v1-section-title" id="stripe-connect-title" style={{ marginBottom: 4 }}>Stripe Connect setup</h2>
        <p className="v1-muted" style={{ margin: 0 }}>
          Connect Stripe so customers can pay online from booking payment links. Payment links stay disabled until payments are active.
        </p>
      </div>

      {loading && <p role="status" className="v1-muted" style={{ margin: 0 }}>Checking Stripe Connect status...</p>}

      {!loading && (
        <>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span>Online payments active</span>
              <strong>{chargesEnabled ? 'Ready' : 'Not ready'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span>Payouts active</span>
              <strong>{payoutsEnabled ? 'Ready' : 'Not ready'}</strong>
            </div>
            <p role="status" className="v1-muted" style={{ margin: 0 }}>{statusText}</p>
          </div>

          {error && <div role="alert" style={{ color: '#b91c1c' }}>{error}</div>}

          {statusKnown && !connected && (
            <form onSubmit={startOnboarding} style={{ display: 'grid', gap: 10 }}>
              <label>
                Stripe account email
                <input
                  type="email"
                  value={businessEmail}
                  onChange={event => setBusinessEmail(event.target.value)}
                  required
                  style={{ width: '100%', boxSizing: 'border-box', padding: 10, border: '1px solid #cbd5e1', borderRadius: 8 }}
                />
              </label>
              <label>
                Stripe account business name
                <input
                  value={businessName}
                  onChange={event => setBusinessName(event.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: 10, border: '1px solid #cbd5e1', borderRadius: 8 }}
                />
              </label>
              <button className="v1-button v1-button-primary" type="submit" disabled={working}>
                {working ? 'Opening Stripe...' : 'Connect Stripe'}
              </button>
              <p className="v1-muted" style={{ margin: 0 }}>
                Stripe will ask for business details. Return here and refresh status when setup is complete.
              </p>
            </form>
          )}

          {connected && !fullyReady && (
            <button className="v1-button v1-button-primary" type="button" onClick={continueOnboarding} disabled={working}>
              {working ? 'Opening Stripe...' : 'Resume Stripe setup'}
            </button>
          )}

          <button className="v1-button v1-button-secondary" type="button" onClick={refreshStatus} disabled={working}>
            Refresh Stripe status
          </button>
        </>
      )}
    </section>
  );
}
