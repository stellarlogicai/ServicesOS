// src/components/ServiceAgreement.jsx
import { useState, useEffect, useRef } from 'react';
import { createServiceContract } from '../services/contractService';
import { generateServiceAgreementBlob } from '../services/pdfService';
import { sendServiceAgreementEmail } from '../services/emailService';

export default function ServiceAgreement({ tenantId, lead, estimate, onSigned, onCancel }) {
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
      // Create contract using service
      const contractId = await createServiceContract(tenantId, lead, estimate, signature);

      // Generate PDF and send email
      try {
        const contractData = {
          signed: true,
          signedAt: new Date().toISOString(),
          signatureUrl: null, // Will be set by service
          agreementTerms: {
            depositAmount: Math.round(estimate.priceLow * 0.25)
          }
        };
        const pdfBlob = await generateServiceAgreementBlob(lead, estimate, contractData);
        await sendServiceAgreementEmail(lead, estimate, contractData, pdfBlob);
      } catch (emailError) {
        console.error('Failed to send agreement email:', emailError);
        // Don't fail the whole process if email fails
      }

      onSigned(contractId);
    } catch (err) {
      console.error('Error saving agreement:', err);
      setError('Failed to save agreement. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const depositAmount = Math.round(estimate.priceLow * 0.25);

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
          Service Agreement
        </h2>

        {/* Agreement Content */}
        <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>
            Service Details
          </h3>
          <div style={{ marginBottom: 16, padding: 16, background: '#f9fafb', borderRadius: 8 }}>
            <p style={{ margin: '0 0 8px' }}><strong>Customer:</strong> {lead.firstName} {lead.lastName}</p>
            <p style={{ margin: '0 0 8px' }}><strong>Address:</strong> {lead.address}</p>
            <p style={{ margin: '0 0 8px' }}><strong>Email:</strong> {lead.email}</p>
            <p style={{ margin: '0 0 8px' }}><strong>Phone:</strong> {lead.phone || 'Not provided'}</p>
            <p style={{ margin: '0 0 8px' }}><strong>Estimated Price:</strong> ${estimate.priceLow} - ${estimate.priceHigh}</p>
            <p style={{ margin: 0 }}><strong>Deposit Required:</strong> ${depositAmount}</p>
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>
            Scope of Work
          </h3>
          <ul style={{ marginBottom: 16, paddingLeft: 20 }}>
            {estimate.rooms.map((room, idx) => (
              <li key={idx}>
                {room.type} x {room.quantity}
              </li>
            ))}
            {estimate.extras && estimate.extras.length > 0 && (
              <>
                <li style={{ fontWeight: 600, marginTop: 8 }}>Additional Services:</li>
                {estimate.extras.map((extra, idx) => (
                  <li key={idx}>{extra.name} - ${extra.price}</li>
                ))}
              </>
            )}
          </ul>

          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>
            Terms and Conditions
          </h3>
          <ol style={{ marginBottom: 16, paddingLeft: 20 }}>
            <li style={{ marginBottom: 8 }}>
              <strong>Estimate Accuracy:</strong> Estimates are based on information provided and photos submitted. 
              Prices may be adjusted if property conditions differ significantly from what was represented.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Deposit:</strong> A {Math.round((depositAmount / estimate.priceLow) * 100)}% deposit (${depositAmount}) 
              is required to secure the booking. This deposit is non-refundable if cancelled less than 24 hours before the scheduled service.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Cancellation Policy:</strong> Cancellations must be made at least 24 hours before the scheduled service time. 
              Late cancellations will forfeit the deposit.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Access:</strong> Customer must provide safe access to the property. 
              If access is not available at the scheduled time, the full service fee may be charged.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Liability:</strong> Company is not responsible for pre-existing damage to property or belongings. 
              Customer should secure valuables prior to service.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Payment:</strong> Remaining balance is due upon completion of service. 
              Payment can be made via credit card, cash, or check.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>Satisfaction:</strong> Customer satisfaction is our priority. 
              Any concerns should be reported within 24 hours of service completion.
            </li>
          </ol>

          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>
            Agreement
          </h3>
          <p style={{ marginBottom: 16 }}>
            By signing below, I acknowledge that I have read, understood, and agree to the terms and conditions 
            outlined above. I understand that this estimate is based on the information provided and may be adjusted 
            if actual conditions differ. I agree to pay the deposit and remaining balance as specified.
          </p>
        </div>

        {/* Signature Section */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            Customer Signature *
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
              I have read and agree to the terms and conditions of this Service Agreement
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
