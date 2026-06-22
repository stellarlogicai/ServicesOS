// src/components/PaymentForm.jsx
import { useState } from 'react';
import { calculateDepositAmount, formatAmount, createPaymentIntent } from '../services/stripeService';

export default function PaymentForm({ estimate, formData, onPaymentComplete, onCancel }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const depositAmount = calculateDepositAmount(estimate.priceLow, estimate.priceHigh, 25);
  const [cardDetails, setCardDetails] = useState({
    cardNumber: '',
    expiry: '',
    cvc: '',
    name: ''
  });

  const handleInputChange = (field, value) => {
    setCardDetails(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  const formatCardNumber = (value) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    if (parts.length) {
      return parts.join(' ');
    } else {
      return v;
    }
  };

  const formatExpiry = (value) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4);
    }
    return v;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Create payment intent
      const { amount } = await createPaymentIntent(estimate, formData, 25);
      
      // In production, you would use Stripe Elements here
      // For now, simulate payment processing
      console.log('[Payment] Processing payment for:', formatAmount(amount));
      
      // Simulate payment delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Call completion callback
      onPaymentComplete({
        success: true,
        amount,
        paymentId: 'pay_' + Date.now()
      });
    } catch (err) {
      setError('Payment processing failed. Please try again.');
      console.error('[Payment] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      maxWidth: 500,
      margin: '0 auto',
      padding: '32px',
      background: 'white',
      borderRadius: 16,
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
    }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          Secure Payment
        </h2>
        <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
          Complete your booking with a 25% deposit
        </p>
      </div>

      {/* Price Summary */}
      <div style={{
        padding: '16px',
        background: '#f8fafc',
        borderRadius: 8,
        marginBottom: 24,
        border: '1px solid #e2e8f0'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 14, color: '#64748b' }}>Estimated Total:</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
            ${estimate.priceLow} - ${estimate.priceHigh}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 14, color: '#64748b' }}>Deposit (25%):</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#3b82f6' }}>
            {formatAmount(depositAmount)}
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
          Remaining balance due upon completion of service
        </div>
      </div>

      {/* Payment Form */}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
            Cardholder Name
          </label>
          <input
            type="text"
            value={cardDetails.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            placeholder="Name on card"
            required
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14,
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
            Card Number
          </label>
          <input
            type="text"
            value={cardDetails.cardNumber}
            onChange={(e) => handleInputChange('cardNumber', formatCardNumber(e.target.value))}
            placeholder="1234 5678 9012 3456"
            maxLength={19}
            required
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14,
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
              Expiry Date
            </label>
            <input
              type="text"
              value={cardDetails.expiry}
              onChange={(e) => handleInputChange('expiry', formatExpiry(e.target.value))}
              placeholder="MM/YY"
              maxLength={5}
              required
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
              CVC
            </label>
            <input
              type="text"
              value={cardDetails.cvc}
              onChange={(e) => handleInputChange('cvc', e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="123"
              maxLength={4}
              required
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {error && (
          <div style={{
            padding: '12px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            fontSize: 14,
            color: '#991b1b',
            marginBottom: 16
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              flex: 1,
              padding: '12px',
              background: 'white',
              color: '#0f172a',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={loading}
            style={{
              flex: 2,
              padding: '12px',
              background: loading ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Processing...' : `Pay ${formatAmount(depositAmount)}`}
          </button>
        </div>
      </form>

      {/* Security Note */}
      <div style={{
        marginTop: 24,
        padding: '12px',
        background: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: 8,
        fontSize: 12,
        color: '#166534',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
        <span style={{ fontSize: 16 }}>🔒</span>
        <span>Your payment information is secure and encrypted</span>
      </div>
    </div>
  );
}
