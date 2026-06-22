// src/components/AICreditPurchase.jsx
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { purchaseCredits, getRemainingCredits } from '../services/aiUsageEngineService';

const CREDIT_PACKS = [
  { id: 'small', credits: 100, price: 10, description: 'Good for occasional use' },
  { id: 'medium', credits: 500, price: 40, description: 'Best value for regular users' },
  { id: 'large', credits: 1500, price: 99, description: 'For power users and teams' },
  { id: 'enterprise', credits: 5000, price: 299, description: 'Enterprise scale operations' }
];

export default function AICreditPurchase() {
  const { currentTenant } = useAuth();
  const [selectedPack, setSelectedPack] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [currentCredits, setCurrentCredits] = useState(null);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const loadCredits = async () => {
    if (!currentTenant) return;
    try {
      const data = await getRemainingCredits(currentTenant.id);
      setCurrentCredits(data);
    } catch (error) {
      console.error('Error loading credits:', error);
    }
  };

  const handlePurchase = async (pack) => {
    if (!currentTenant) {
      showMessage('error', 'You must be logged in to purchase credits');
      return;
    }

    setPurchasing(true);
    setSelectedPack(pack);

    try {
      // In production, this would integrate with Stripe or another payment processor
      // For now, we'll simulate the purchase
      await new Promise(resolve => setTimeout(resolve, 1500));

      await purchaseCredits(currentTenant.id, pack.credits, 'credit_card', {
        packId: pack.id,
        amount: pack.price
      });

      showMessage('success', `Successfully purchased ${pack.credits} credits!`);
      loadCredits();
    } catch (error) {
      console.error('Purchase error:', error);
      showMessage('error', 'Failed to purchase credits. Please try again.');
    } finally {
      setPurchasing(false);
      setSelectedPack(null);
    }
  };

  useState(() => {
    loadCredits();
  }, [currentTenant]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          Purchase AI Credits
        </h2>
        <p style={{ fontSize: 16, color: '#64748b', margin: 0 }}>
          Buy credit packs to power your AI features. Credits never expire.
        </p>
      </div>

      {/* Current Credits Display */}
      {currentCredits && (
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          marginBottom: 24
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>Current Balance</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: '#3b82f6' }}>
                {currentCredits.creditsRemaining}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>Total Used</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#64748b' }}>
                {currentCredits.totalCreditsUsed}
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Credit Packs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        {CREDIT_PACKS.map(pack => (
          <div
            key={pack.id}
            onClick={() => !purchasing && handlePurchase(pack)}
            style={{
              background: 'white',
              padding: '24px',
              borderRadius: 12,
              border: '2px solid',
              borderColor: selectedPack?.id === pack.id ? '#3b82f6' : '#e2e8f0',
              cursor: purchasing ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: purchasing && selectedPack?.id !== pack.id ? 0.5 : 1
            }}
          >
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>
              {pack.id.charAt(0).toUpperCase() + pack.id.slice(1)}
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
              {pack.credits}
            </div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>Credits</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#3b82f6', marginBottom: 8 }}>
              ${pack.price}
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              {pack.description}
            </div>
            <button
              disabled={purchasing}
              style={{
                width: '100%',
                padding: '10px',
                background: purchasing && selectedPack?.id === pack.id 
                  ? '#94a3b8' 
                  : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: purchasing ? 'not-allowed' : 'pointer',
                opacity: purchasing ? 0.6 : 1
              }}
            >
              {purchasing && selectedPack?.id === pack.id ? 'Processing...' : 'Purchase'}
            </button>
          </div>
        ))}
      </div>

      {/* Info Box */}
      <div style={{
        padding: '16px',
        borderRadius: 8,
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        color: '#1e40af',
        fontSize: 13
      }}>
        <strong>💡 Info:</strong> Credits are used for AI-powered features like photo analysis, estimate generation, and model training. Credits never expire and can be used across all AI features in the platform.
      </div>

      {/* Pricing Details */}
      <div style={{
        marginTop: 24,
        padding: '20px',
        borderRadius: 12,
        background: 'white',
        border: '1px solid #e2e8f0'
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
          Credit Usage Examples
        </h3>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#f9fafb', borderRadius: 6 }}>
            <span style={{ fontSize: 14, color: '#374151' }}>Photo Analysis</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#3b82f6' }}>1 credit</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#f9fafb', borderRadius: 6 }}>
            <span style={{ fontSize: 14, color: '#374151' }}>Estimate Generation</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#3b82f6' }}>5 credits</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#f9fafb', borderRadius: 6 }}>
            <span style={{ fontSize: 14, color: '#374151' }}>Room Detection</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#3b82f6' }}>2 credits</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#f9fafb', borderRadius: 6 }}>
            <span style={{ fontSize: 14, color: '#374151' }}>Quality Control</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#3b82f6' }}>3 credits</span>
          </div>
        </div>
      </div>
    </div>
  );
}
