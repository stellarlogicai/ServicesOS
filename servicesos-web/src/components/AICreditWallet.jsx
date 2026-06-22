// src/components/AICreditWallet.jsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  getRemainingCredits, 
  getCreditHistory, 
  getAllCreditCosts,
  getTierCredits 
} from '../services/aiUsageEngineService';

export default function AICreditWallet() {
  const { currentTenant } = useAuth();
  const [credits, setCredits] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [creditCosts] = useState(() => getAllCreditCosts());
  const [tierCredits] = useState(() => getTierCredits());

  const loadCredits = useCallback(async () => {
    if (!currentTenant) return;
    
    setLoading(true);
    try {
      const creditData = await getRemainingCredits(currentTenant.id);
      setCredits(creditData);
      
      const historyData = await getCreditHistory(currentTenant.id, 10);
      setHistory(historyData);
    } catch (error) {
      console.error('Error loading credits:', error);
    } finally {
      setLoading(false);
    }
  }, [currentTenant]);

  useEffect(() => {
    let isActive = true;

    Promise.resolve().then(() => {
      if (isActive) {
        loadCredits();
      }
    });

    return () => {
      isActive = false;
    };
  }, [loadCredits]);

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#64748b' }}>Loading credits...</div>
      </div>
    );
  }

  if (!credits) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#64748b' }}>Unable to load credits</div>
      </div>
    );
  }

  const creditPercentage = credits.monthlyIncludedCredits > 0 
    ? ((credits.creditsRemaining / (credits.monthlyIncludedCredits + credits.purchasedCredits)) * 100).toFixed(1)
    : 0;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          AI Credit Wallet
        </h2>
        <p style={{ fontSize: 16, color: '#64748b', margin: 0 }}>
          Manage your AI credits for photo analysis, estimates, and more
        </p>
      </div>

      {/* Credit Overview Card */}
      <div style={{
        background: 'white',
        padding: '32px',
        borderRadius: 16,
        border: '1px solid #e2e8f0',
        marginBottom: 24,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>Credits Remaining</div>
            <div style={{ fontSize: 48, fontWeight: 700, color: '#3b82f6' }}>
              {credits.creditsRemaining}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>Total Used</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#64748b' }}>
              {credits.totalCreditsUsed}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ 
            height: '12px', 
            background: '#e2e8f0', 
            borderRadius: '6px', 
            overflow: 'hidden',
            marginBottom: 8
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(creditPercentage, 100)}%`,
              background: creditPercentage > 20 
                ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
                : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              borderRadius: '6px',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {creditPercentage}% of available credits used
          </div>
        </div>

        {/* Credit Breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div style={{ padding: '16px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Monthly Included</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#374151' }}>
              {credits.monthlyIncludedCredits}
            </div>
          </div>
          <div style={{ padding: '16px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Purchased</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#374151' }}>
              {credits.purchasedCredits}
            </div>
          </div>
          <div style={{ padding: '16px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Total Available</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#374151' }}>
              {credits.monthlyIncludedCredits + credits.purchasedCredits}
            </div>
          </div>
        </div>
      </div>

      {/* Credit Costs Reference */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        marginBottom: 24
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
          Credit Costs
        </h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {Object.entries(creditCosts).map(([operation, cost]) => (
            <div key={operation} style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              padding: '12px', 
              background: '#f9fafb', 
              borderRadius: 6,
              border: '1px solid #e5e7eb'
            }}>
              <span style={{ fontSize: 14, color: '#374151', textTransform: 'capitalize' }}>
                {operation.replace(/_/g, ' ')}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#3b82f6' }}>
                {cost} credit{cost !== 1 ? 's' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tier Information */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        marginBottom: 24
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
          Subscription Tiers
        </h3>
        <div style={{ display: 'grid', gap: 12 }}>
          {Object.entries(tierCredits).map(([tier, credits]) => (
            <div key={tier} style={{ 
              padding: '16px', 
              background: tier === 'free' ? '#f9fafb' : '#eff6ff', 
              borderRadius: 8,
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                {tier.charAt(0).toUpperCase() + tier.slice(1)} Tier
              </div>
              <div style={{ fontSize: 14, color: '#64748b' }}>
                {credits} included credits/month
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent History */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: 12,
        border: '1px solid #e2e8f0'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', margin: 0 }}>
            Recent Activity
          </h3>
          <button
            onClick={() => setShowHistory(!showHistory)}
            style={{
              padding: '8px 16px',
              background: '#f9fafb',
              color: '#374151',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {showHistory ? 'Hide' : 'Show'} History
          </button>
        </div>

        {showHistory && (
          <div style={{ marginTop: 16 }}>
            {history.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                No recent activity
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.map((item, index) => (
                  <div key={index} style={{ 
                    padding: '12px', 
                    background: '#f9fafb', 
                    borderRadius: 6,
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#374151', textTransform: 'capitalize' }}>
                        {item.operationType?.replace(/_/g, ' ') || 'Unknown'}
                      </span>
                      <span style={{ 
                        fontSize: 14, 
                        fontWeight: 600, 
                        color: item.creditsAdded ? '#22c55e' : '#ef4444' 
                      }}>
                        {item.creditsAdded ? '+' : '-'}{item.creditsAdded || item.creditsDeducted || 0}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {new Date(item.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info Box */}
      <div style={{
        marginTop: 24,
        padding: '16px',
        borderRadius: 8,
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        color: '#1e40af',
        fontSize: 13
      }}>
        <strong>💡 Tip:</strong> Credits reset at the start of each billing cycle. Purchased credits roll over and never expire. Upgrade your subscription tier to get more included credits each month.
      </div>
    </div>
  );
}
