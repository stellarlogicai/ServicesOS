// src/components/IncidentReport.jsx
import { useState } from 'react';
import { doc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { ref } from 'firebase/storage';
import { storage } from '../firebase';
import { uploadPhotoWithMetadata } from '../utils/photoMetadata';

export default function IncidentReport({ tenantId, booking, onSubmit, onCancel }) {
  const [incidentType, setIncidentType] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [photos, setPhotos] = useState([]);
  const [witnesses, setWitnesses] = useState([{ name: '', phone: '', statement: '' }]);
  const [employeeStatement, setEmployeeStatement] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const incidentTypes = [
    { value: 'property_damage', label: 'Property Damage' },
    { value: 'item_damage', label: 'Item Damage' },
    { value: 'item_missing', label: 'Item Missing/Theft' },
    { value: 'accident', label: 'Accident/Injury' },
    { value: 'other', label: 'Other' }
  ];

  const handleAddWitness = () => {
    setWitnesses([...witnesses, { name: '', phone: '', statement: '' }]);
  };

  const handleWitnessChange = (index, field, value) => {
    const updated = [...witnesses];
    updated[index][field] = value;
    setWitnesses(updated);
  };

  const handleRemoveWitness = (index) => {
    setWitnesses(witnesses.filter((_, i) => i !== index));
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    try {
      const uploadPromises = files.map(async (file) => {
        const photoId = `incident_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const photoRef = ref(storage, `tenants/${tenantId}/incidents/${photoId}`);
        const url = await uploadPhotoWithMetadata(photoRef, file, {
          incidentType,
          bookingId: booking.id
        });
        return { url, fileName: file.name };
      });

      const uploadedPhotos = await Promise.all(uploadPromises);
      setPhotos([...photos, ...uploadedPhotos]);
    } catch (err) {
      console.error('Error uploading photos:', err);
      setError('Failed to upload photos');
    }
  };

  const handleRemovePhoto = (index) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!incidentType || !description) {
      setError('Incident type and description are required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const incidentData = {
        companyId: tenantId,
        bookingId: booking.id,
        customerId: booking.customerId,
        incidentType,
        description,
        location,
        estimatedValue: estimatedValue ? parseFloat(estimatedValue) : null,
        photos,
        witnesses: witnesses.filter(w => w.name || w.statement),
        employeeStatement,
        reportedBy: booking.assignedEmployees?.[0] || 'unknown',
        reportedAt: serverTimestamp(),
        status: 'open',
        severity: incidentType === 'accident' || incidentType === 'item_missing' ? 'high' : 'medium',
        createdAt: serverTimestamp()
      };

      const incidentRef = await addDoc(collection(db, 'tenants', tenantId, 'incidents'), incidentData);

      // Update booking with incident reference
      await updateDoc(doc(db, 'tenants', tenantId, 'bookings', booking.id), {
        hasIncident: true,
        incidentIds: [incidentRef.id]
      });

      onSubmit(incidentRef.id);
    } catch (err) {
      console.error('Error submitting incident report:', err);
      setError('Failed to submit incident report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
          Incident Report
        </h2>
        <p style={{ fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 24 }}>
          Report any damage, missing items, accidents, or other incidents
        </p>

        {/* Incident Type */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            Incident Type *
          </label>
          <select
            value={incidentType}
            onChange={(e) => setIncidentType(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14
            }}
          >
            <option value="">Select incident type</option>
            {incidentTypes.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            Description *
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what happened in detail"
            rows={4}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              resize: 'vertical'
            }}
          />
        </div>

        {/* Location */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            Location
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g., Living room, Kitchen, Master bathroom"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14
            }}
          />
        </div>

        {/* Estimated Value */}
        {(incidentType === 'property_damage' || incidentType === 'item_damage' || incidentType === 'item_missing') && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              Estimated Value ($)
            </label>
            <input
              type="number"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              placeholder="0.00"
              step="0.01"
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

        {/* Photos */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            Photos (with timestamp & location)
          </label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoUpload}
            style={{ fontSize: 14 }}
          />
          {photos.length > 0 && (
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
              {photos.map((photo, idx) => (
                <div key={idx} style={{ position: 'relative' }}>
                  <img
                    src={photo.url}
                    alt={`Incident photo ${idx + 1}`}
                    style={{ width: '100%', borderRadius: 4 }}
                  />
                  <button
                    onClick={() => handleRemovePhoto(idx)}
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '50%',
                      width: 24,
                      height: 24,
                      cursor: 'pointer',
                      fontSize: 12
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Witnesses */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            Witnesses (if any)
          </label>
          {witnesses.map((witness, idx) => (
            <div key={idx} style={{ marginBottom: 12, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  type="text"
                  placeholder="Witness name"
                  value={witness.name}
                  onChange={(e) => handleWitnessChange(idx, 'name', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14
                  }}
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={witness.phone}
                  onChange={(e) => handleWitnessChange(idx, 'phone', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14
                  }}
                />
                {witnesses.length > 1 && (
                  <button
                    onClick={() => handleRemoveWitness(idx)}
                    style={{
                      padding: '8px 12px',
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <textarea
                placeholder="Witness statement"
                value={witness.statement}
                onChange={(e) => handleWitnessChange(idx, 'statement', e.target.value)}
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
          ))}
          <button
            onClick={handleAddWitness}
            type="button"
            style={{
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            + Add Witness
          </button>
        </div>

        {/* Employee Statement */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            Your Statement
          </label>
          <textarea
            value={employeeStatement}
            onChange={(e) => setEmployeeStatement(e.target.value)}
            placeholder="Provide your account of what happened"
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              resize: 'vertical'
            }}
          />
        </div>

        {/* Warning */}
        <div style={{ marginBottom: 24, padding: 16, background: '#fef3c7', borderRadius: 8, border: '1px solid #f59e0b' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
            <strong>Important:</strong> This incident report will be logged and may be used for insurance claims or legal purposes. 
            Ensure all information is accurate and complete. False reports may have consequences.
          </p>
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
            disabled={loading || !incidentType || !description}
            style={{
              padding: '12px 24px',
              background: loading || !incidentType || !description ? '#94a3b8' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading || !incidentType || !description ? 'not-allowed' : 'pointer',
              opacity: loading || !incidentType || !description ? 0.6 : 1
            }}
          >
            {loading ? 'Submitting...' : 'Submit Incident Report'}
          </button>
        </div>
      </div>
    </div>
  );
}
