// src/components/InsuranceTracking.jsx
import { useState, useEffect, useCallback } from 'react';
import { getInsurance, saveInsurance, checkInsuranceExpiration } from '../services/insuranceService';

export default function InsuranceTracking({ tenantId }) {
  const [insurance, setInsurance] = useState({
    provider: '',
    policyNumber: '',
    coverageAmount: '',
    expirationDate: '',
    certificateUrl: ''
  });
  const [expirationStatus, setExpirationStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const loadInsurance = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getInsurance(tenantId);
      if (data) {
        setInsurance(data);
      }
      const status = await checkInsuranceExpiration(tenantId);
      setExpirationStatus(status);
    } catch (error) {
      console.error('Error loading insurance:', error);
      setMessage({ type: 'error', text: 'Failed to load insurance information' });
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    let isActive = true;

    Promise.resolve().then(() => {
      if (isActive) {
        loadInsurance();
      }
    });

    return () => {
      isActive = false;
    };
  }, [loadInsurance]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      await saveInsurance(tenantId, insurance);
      const status = await checkInsuranceExpiration(tenantId);
      setExpirationStatus(status);
      setMessage({ type: 'success', text: 'Insurance information saved successfully!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving insurance:', error);
      setMessage({ type: 'error', text: 'Failed to save insurance information' });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setInsurance(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#64748b' }}>Loading insurance information...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
      <div style={{
        background: 'white',
        padding: '32px',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
          Insurance Tracking
        </h2>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
          Manage your business insurance information
        </p>

        {/* Expiration Warning */}
        {expirationStatus && (expirationStatus.isExpiring || expirationStatus.isExpired) && (
          <div style={{
            padding: '16px',
            borderRadius: 8,
            marginBottom: 24,
            background: expirationStatus.isExpired ? '#fef2f2' : '#fef3c7',
            border: expirationStatus.isExpired ? '1px solid #ef4444' : '1px solid #f59e0b',
            color: expirationStatus.isExpired ? '#991b1b' : '#92400e',
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <span style={{ fontSize: 24 }}>
              {expirationStatus.isExpired ? '⚠️' : '📅'}
            </span>
            <div>
              <strong style={{ display: 'block', marginBottom: 4 }}>
                {expirationStatus.isExpired 
                  ? 'Insurance Expired!' 
                  : `Insurance Expiring in ${expirationStatus.daysUntilExpiration} Days`
                }
              </strong>
              <span style={{ fontSize: 13 }}>
                {expirationStatus.isExpired 
                  ? 'Please renew your insurance immediately.' 
                  : 'Please renew your insurance before it expires.'
                }
              </span>
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
            border: message.type === 'success' ? '1px solid #bbf7d0' : '1px solid #fecaca',
            color: message.type === 'success' ? '#166534' : '#991b1b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>{message.text}</span>
            <button
              onClick={() => setMessage({ type: '', text: '' })}
              style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'inherit' }}
            >
              ✕
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                Insurance Provider *
              </label>
              <input
                type="text"
                value={insurance.provider}
                onChange={(e) => handleChange('provider', e.target.value)}
                placeholder="e.g., State Farm, Allstate, Progressive"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                Policy Number *
              </label>
              <input
                type="text"
                value={insurance.policyNumber}
                onChange={(e) => handleChange('policyNumber', e.target.value)}
                placeholder="e.g., POL-123456789"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                Coverage Amount ($) *
              </label>
              <input
                type="number"
                value={insurance.coverageAmount}
                onChange={(e) => handleChange('coverageAmount', e.target.value)}
                placeholder="e.g., 1000000"
                required
                min="0"
                step="1000"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                Expiration Date *
              </label>
              <input
                type="date"
                value={insurance.expirationDate}
                onChange={(e) => handleChange('expirationDate', e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14
                }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                Certificate of Insurance URL
              </label>
              <input
                type="url"
                value={insurance.certificateUrl}
                onChange={(e) => handleChange('certificateUrl', e.target.value)}
                placeholder="https://..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14
                }}
              />
            </div>
          </div>

          <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '12px 24px',
                background: saving ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1
              }}
            >
              {saving ? 'Saving...' : 'Save Insurance Information'}
            </button>
          </div>
        </form>

        {/* Current Status */}
        {expirationStatus && !expirationStatus.isExpiring && !expirationStatus.isExpired && (
          <div style={{
            marginTop: 24,
            padding: '16px',
            borderRadius: 8,
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#166534',
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <span style={{ fontSize: 24 }}>✅</span>
            <div>
              <strong style={{ display: 'block', marginBottom: 4 }}>
                Insurance Active
              </strong>
              <span style={{ fontSize: 13 }}>
                Your insurance is valid and expires in {expirationStatus.daysUntilExpiration} days
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
