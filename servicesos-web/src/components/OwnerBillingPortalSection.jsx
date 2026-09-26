import { useState } from 'react';
import { openOwnerBillingPortal } from '../services/ownerBillingPortalService';

export default function OwnerBillingPortalSection({ user, openPortal = openOwnerBillingPortal, redirect = url => window.location.assign(url) }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const open = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const url = await openPortal({ user });
      redirect(url);
    } catch {
      setError('Billing management could not be opened. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-labelledby="owner-billing-title">
      <h2 id="owner-billing-title" style={{ fontSize: 18, margin: '0 0 12px' }}>ServicesOS billing</h2>
      <button className="v1-button" type="button" disabled={loading} onClick={open}>
        {loading ? 'Opening billing…' : 'Manage billing'}
      </button>
      {error && <p role="alert" style={{ color: '#991b1b' }}>{error}</p>}
    </section>
  );
}
