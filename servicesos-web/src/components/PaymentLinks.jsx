// src/components/PaymentLinks.jsx
import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { createCheckoutSession, redirectToCheckout } from '../services/stripeService';

export default function PaymentLinks({ tenantId }) {
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const loadLeads = useCallback(async () => {
    if (!tenantId) return;
    try {
      const leadsRef = collection(db, 'tenants', tenantId, 'leads');
      const q = query(leadsRef, where('status', 'in', ['scheduled', 'estimate_sent', 'follow_up']), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const leadsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLeads(leadsData);
    } catch (error) {
      console.error('Error loading leads:', error);
    }
  }, [tenantId]);

  useEffect(() => {
    let isActive = true;

    Promise.resolve().then(() => {
      if (isActive) {
        loadLeads();
      }
    });

    return () => {
      isActive = false;
    };
  }, [loadLeads]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const handleCreatePaymentLink = async () => {
    if (!selectedLead || !amount) {
      showMessage('error', 'Please select a lead and enter an amount');
      return;
    }

    setLoading(true);
    try {
      const estimate = {
        priceLow: parseFloat(amount),
        priceHigh: parseFloat(amount)
      };

      const formData = {
        email: selectedLead.email,
        firstName: selectedLead.firstName,
        lastName: selectedLead.lastName,
        address: selectedLead.address,
        leadId: selectedLead.id
      };

      const session = await createCheckoutSession(estimate, formData, 100, tenantId);
      
      // Save payment link to Firestore
      await addDoc(collection(db, 'tenants', tenantId, 'payment_links'), {
        leadId: selectedLead.id,
        sessionId: session.sessionId,
        amount: session.amount,
        description: description || 'Payment for cleaning service',
        status: 'pending',
        createdAt: serverTimestamp()
      });

      // Redirect to Stripe Checkout
      await redirectToCheckout(session.sessionId);
    } catch (error) {
      console.error('Error creating payment link:', error);
      showMessage('error', 'Failed to create payment link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          Payment Links & Invoices
        </h2>
        <p style={{ fontSize: 16, color: '#64748b', margin: 0 }}>
          Create payment links for customers to pay deposits or remaining balances
        </p>
      </div>

      {/* Message Banner */}
      {message.text && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 24,
          background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${message.type === 'success' ? '#22c55e' : '#ef4444'}`,
          color: message.type === 'success' ? '#166534' : '#991b1b'
        }}>
          {message.text}
        </div>
      )}

      {/* Create Payment Link */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        marginBottom: 24
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
          Create Payment Link
        </h3>
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              Select Lead *
            </label>
            <select
              value={selectedLead?.id || ''}
              onChange={(e) => {
                const lead = leads.find(l => l.id === e.target.value);
                setSelectedLead(lead || null);
                if (lead) {
                  // Auto-fill amount from estimate if available
                  if (lead.estimate?.priceLow) {
                    setAmount(lead.estimate.priceLow);
                  }
                }
              }}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: 6
              }}
            >
              <option value="">Select a lead...</option>
              {leads.map(lead => (
                <option key={lead.id} value={lead.id}>
                  {lead.firstName} {lead.lastName} - {lead.address} - ${lead.estimate?.priceLow || 'No estimate'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              Amount ($) *
            </label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g., 250.00"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: 6
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Deposit for cleaning service"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: 6
              }}
            />
          </div>

          <button
            onClick={handleCreatePaymentLink}
            disabled={loading}
            style={{
              padding: '12px 24px',
              background: loading ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? 'Creating...' : 'Create Payment Link'}
          </button>
        </div>
      </div>

      {/* Recent Payment Links */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: 12,
        border: '1px solid #e2e8f0'
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
          Recent Payment Links
        </h3>
        {leads.length === 0 ? (
          <p style={{ fontSize: 14, color: '#64748b' }}>No leads available for payment links</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {leads.slice(0, 5).map(lead => (
              <div
                key={lead.id}
                style={{
                  padding: '16px',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  background: '#f9fafb'
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  {lead.firstName} {lead.lastName}
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
                  {lead.address}
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
                  Email: {lead.email}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: 12,
                    background: lead.status === 'paid' ? '#f0fdf4' : '#fef3c7',
                    color: lead.status === 'paid' ? '#166534' : '#92400e',
                    fontSize: 12,
                    fontWeight: 600
                  }}>
                    {lead.status}
                  </span>
                  {lead.estimate && (
                    <span style={{ fontSize: 13, color: '#374151' }}>
                      Estimate: ${lead.estimate.priceLow} - ${lead.estimate.priceHigh}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
