// src/components/PropertyConditionChecklist.jsx
import { useState, useRef } from 'react';
import { doc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export default function PropertyConditionChecklist({ tenantId, booking, onComplete, onCancel }) {
  const [conditions, setConditions] = useState({
    floors: { condition: 'good', notes: '', photo: null },
    walls: { condition: 'good', notes: '', photo: null },
    furniture: { condition: 'good', notes: '', photo: null },
    windows: { condition: 'good', notes: '', photo: null },
    bathroom: { condition: 'good', notes: '', photo: null },
    kitchen: { condition: 'good', notes: '', photo: null },
    electronics: { condition: 'good', notes: '', photo: null },
    valuables: { condition: 'good', notes: '', photo: null },
  });
  
  const [customerSignature, setCustomerSignature] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customerPresent, setCustomerPresent] = useState(true);
  const [customerName, setCustomerName] = useState('');

  const handleConditionChange = (area, field, value) => {
    setConditions(prev => ({
      ...prev,
      [area]: { ...prev[area], [field]: value }
    }));
  };

  const handlePhotoUpload = async (area, file) => {
    try {
      const photoId = `condition_${area}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const photoRef = ref(storage, `tenants/${tenantId}/property_conditions/${photoId}`);
      
      // Add metadata with timestamp and location
      const metadata = {
        customMetadata: {
          timestamp: new Date().toISOString(),
          area,
          bookingId: booking.id
        }
      };
      
      await uploadBytes(photoRef, file, metadata);
      const photoUrl = await getDownloadURL(photoRef);
      
      handleConditionChange(area, 'photo', photoUrl);
    } catch (err) {
      console.error('Error uploading photo:', err);
      setError('Failed to upload photo');
    }
  };

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
    setCustomerSignature(canvas.toDataURL());
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setCustomerSignature(null);
  };

  const handleSubmit = async () => {
    if (!customerSignature) {
      setError('Customer signature is required');
      return;
    }

    if (customerPresent && !customerName) {
      setError('Customer name is required when customer is present');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Upload signature
      const signatureId = `condition_signature_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const signatureRef = ref(storage, `tenants/${tenantId}/signatures/${signatureId}`);
      const response = await fetch(customerSignature);
      const blob = await response.blob();
      await uploadBytes(signatureRef, blob);
      const signatureUrl = await getDownloadURL(signatureRef);

      // Save condition report
      const conditionReport = {
        companyId: tenantId,
        bookingId: booking.id,
        customerId: booking.customerId,
        customerName: customerName || 'Customer not present',
        customerPresent,
        conditions,
        customerSignatureUrl: signatureUrl,
        signedAt: serverTimestamp(),
        employeeId: booking.assignedEmployees?.[0] || 'unknown',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'tenants', tenantId, 'property_conditions'), conditionReport);

      // Update booking with condition report reference
      await updateDoc(doc(db, 'tenants', tenantId, 'bookings', booking.id), {
        conditionReportCompleted: true,
        conditionReportSignedAt: serverTimestamp()
      });

      onComplete();
    } catch (err) {
      console.error('Error saving condition report:', err);
      setError('Failed to save condition report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const conditionOptions = [
    { value: 'excellent', label: 'Excellent - No issues' },
    { value: 'good', label: 'Good - Minor wear' },
    { value: 'fair', label: 'Fair - Noticeable wear/damage' },
    { value: 'poor', label: 'Poor - Significant damage' },
    { value: 'n/a', label: 'Not applicable' }
  ];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
      <div style={{
        background: 'white',
        padding: '32px',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 8, textAlign: 'center' }}>
          Property Condition Checklist
        </h2>
        <p style={{ fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 24 }}>
          Document property condition BEFORE cleaning begins to protect both parties
        </p>

        {/* Customer Presence */}
        <div style={{ marginBottom: 24, padding: 16, background: '#f0fdf4', borderRadius: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={customerPresent}
              onChange={(e) => setCustomerPresent(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#166534' }}>
              Customer is present for inspection
            </span>
          </label>
          
          {customerPresent && (
            <div style={{ marginTop: 12 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                Customer Name *
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter customer's full name"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14
                }}
              />
            </div>
          )}
        </div>

        {/* Condition Checklist */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
            Area Condition Assessment
          </h3>

          {Object.entries(conditions).map(([area, data]) => (
            <div key={area} style={{ marginBottom: 20, padding: 16, background: '#f9fafb', borderRadius: 8 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 12, textTransform: 'capitalize' }}>
                {area.replace('_', ' ')}
              </h4>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                  Condition *
                </label>
                <select
                  value={data.condition}
                  onChange={(e) => handleConditionChange(area, 'condition', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14
                  }}
                >
                  {conditionOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                  Notes (if any issues)
                </label>
                <textarea
                  value={data.notes}
                  onChange={(e) => handleConditionChange(area, 'notes', e.target.value)}
                  placeholder="Describe any pre-existing damage, stains, scratches, etc."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    resize: 'vertical'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                  Photo (recommended for areas with issues)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files[0]) {
                      handlePhotoUpload(area, e.target.files[0]);
                    }
                  }}
                  style={{ fontSize: 14 }}
                />
                {data.photo && (
                  <div style={{ marginTop: 8 }}>
                    <img
                      src={data.photo}
                      alt={`${area} condition`}
                      style={{ maxWidth: 200, maxHeight: 150, borderRadius: 4 }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <div style={{ marginBottom: 24, padding: 16, background: '#fef3c7', borderRadius: 8, border: '1px solid #f59e0b' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
            <strong>Important:</strong> This checklist documents the condition of the property BEFORE cleaning begins. 
            Any damage or issues noted here are pre-existing and not the responsibility of the cleaning service. 
            Customer acknowledges that by signing below.
          </p>
        </div>

        {/* Customer Signature */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            {customerPresent ? 'Customer Signature *' : 'Employee Signature (if customer not present) *'}
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
            disabled={loading || !customerSignature}
            style={{
              padding: '12px 24px',
              background: loading || !customerSignature ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading || !customerSignature ? 'not-allowed' : 'pointer',
              opacity: loading || !customerSignature ? 0.6 : 1
            }}
          >
            {loading ? 'Saving...' : 'Save & Start Cleaning'}
          </button>
        </div>
      </div>
    </div>
  );
}
