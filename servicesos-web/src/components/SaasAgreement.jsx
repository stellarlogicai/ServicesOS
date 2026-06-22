// src/components/SaasAgreement.jsx
import { useState, useEffect, useRef } from 'react';
import { createSaaSContract } from '../services/contractService';

export default function SaasAgreement({ tenantData, onSigned, onCancel }) {
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
    }
  }, []);

  const startDrawing = (e) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    setSignature(canvas.toDataURL());
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignature(null);
  };

  const handleSubmit = async () => {
    if (!agreed || !signature) {
      setError('Please agree to the terms and provide your signature');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const contractId = await createSaaSContract(
        tenantData.tenantId,
        tenantData.companyName,
        tenantData.adminEmail,
        tenantData.adminName,
        signature
      );

      onSigned(contractId);
    } catch (err) {
      console.error('Error saving SaaS agreement:', err);
      setError('Failed to save agreement. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px' }}>
      <div style={{
        background: 'white',
        padding: '32px',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 24, textAlign: 'center' }}>
          SaaS Terms of Service Agreement
        </h2>

        <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>
            Company Information
          </h3>
          <div style={{ marginBottom: 16, padding: 16, background: '#f9fafb', borderRadius: 8 }}>
            <p style={{ margin: '0 0 8px' }}><strong>Company Name:</strong> {tenantData.companyName}</p>
            <p style={{ margin: '0 0 8px' }}><strong>Admin Name:</strong> {tenantData.adminName}</p>
            <p style={{ margin: 0 }}><strong>Email:</strong> {tenantData.adminEmail}</p>
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>
            Terms of Service
          </h3>
          <ol style={{ marginBottom: 16, paddingLeft: 20 }}>
            <li style={{ marginBottom: 8 }}>
              <strong>Service Description:</strong> The platform provides AI-powered cleaning business management tools including quote generation, scheduling, CRM, payment processing, and customer management features.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Subscription Fees:</strong> Monthly subscription fees are charged based on the selected tier (Starter, Professional, Enterprise). Fees are billed in advance on a monthly basis.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Transaction Fees:</strong> A transaction fee applies to each payment processed through the platform. This fee covers payment processing and platform usage.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Auto-Renewal:</strong> Subscriptions automatically renew each month unless cancelled with at least 30 days notice.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Cancellation:</strong> You may cancel your subscription at any time with 30 days notice. Upon cancellation, you will retain access until the end of your current billing period.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Data Ownership:</strong> You retain ownership of all customer data, quotes, and business information stored in the platform. Upon request, data can be exported.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Service Availability:</strong> While we strive for 99.9% uptime, we do not guarantee uninterrupted service. We are not liable for any losses due to service interruptions.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Acceptable Use:</strong> You agree to use the platform only for legitimate business purposes and not for any illegal activities.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Support:</strong> Support is available via email during business hours. Premium tiers may receive priority support.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Updates:</strong> We may update the platform features and these terms. Material changes will be communicated 30 days in advance.
            </li>
          </ol>

          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>
            Billing Authorization
          </h3>
          <p style={{ marginBottom: 16 }}>
            By signing below, you authorize the platform to charge your selected payment method for monthly subscription fees and transaction fees. You agree to keep payment information current and understand that failure to pay may result in service suspension.
          </p>

          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>
            Agreement
          </h3>
          <p style={{ marginBottom: 16 }}>
            By signing below, I acknowledge that I have read, understood, and agree to the Terms of Service and authorize the billing arrangements as outlined above. I understand that this agreement is binding and governs my use of the platform.
          </p>
        </div>

        {/* Signature Section */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            Authorized Signature *
          </label>
          <canvas
            ref={canvasRef}
            width={500}
            height={150}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            style={{
              border: '2px solid #d1d5db',
              borderRadius: 8,
              background: '#fff',
              cursor: 'crosshair',
              touchAction: 'none',
              width: '100%',
              maxWidth: 500
            }}
          />
          <button
            onClick={clearSignature}
            type="button"
            style={{
              marginTop: 8,
              padding: '8px 16px',
              background: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            Clear Signature
          </button>
        </div>

        {/* Agreement Checkbox */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span style={{ fontSize: 14, color: '#374151' }}>
              I have read and agree to the Terms of Service and authorize the billing arrangements
            </span>
          </label>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 16,
            background: '#fef2f2',
            border: '1px solid #ef4444',
            color: '#991b1b',
            fontSize: 14
          }}>
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: '12px 24px',
              background: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !agreed || !signature}
            style={{
              padding: '12px 24px',
              background: loading || !agreed || !signature ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading || !agreed || !signature ? 'not-allowed' : 'pointer',
              opacity: loading || !agreed || !signature ? 0.6 : 1
            }}
          >
            {loading ? 'Signing...' : 'Sign & Accept'}
          </button>
        </div>
      </div>
    </div>
  );
}
