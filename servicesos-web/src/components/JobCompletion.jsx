// src/components/JobCompletion.jsx
import { useState, useRef, useEffect } from 'react';
import { doc, updateDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export default function JobCompletion({ jobData, onComplete, onCancel }) {
  const [formData, setFormData] = useState({
    actualHours: '',
    crewSize: '1',
    finalPrice: '',
    tip: '',
    customerRating: '',
    wouldRecommend: null,
    roomTimes: {},
    notes: ''
  });

  const [afterPhotos, setAfterPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  // Signature capture state
  const [signature, setSignature] = useState(null);
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  // Signature pad handlers
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
    }
  }, []);

  const handleAfterPhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploadedPhotos = [];
      
      for (const file of files) {
        const photoId = `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const storageRef = ref(storage, `tenants/${jobData.tenantId}/photos/${photoId}`);
        
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        
        uploadedPhotos.push({
          id: photoId,
          url,
          type: 'after',
          room: 'general', // Could be enhanced with room selection
          timestamp: new Date().toISOString()
        });
      }
      
      setAfterPhotos(prev => [...prev, ...uploadedPhotos]);
      showMessage('success', 'After photos uploaded successfully');
    } catch (error) {
      console.error('Error uploading photos:', error);
      showMessage('error', 'Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const handleRoomTimeChange = (room, minutes) => {
    setFormData(prev => ({
      ...prev,
      roomTimes: {
        ...prev.roomTimes,
        [room]: parseInt(minutes) || 0
      }
    }));
  };

  const handleSubmit = async () => {
    if (!formData.actualHours || !formData.finalPrice) {
      showMessage('error', 'Actual hours and final price are required');
      return;
    }

    try {
      // Update job with actual results
      const jobRef = doc(db, 'tenants', jobData.tenantId, 'jobs', jobData.jobId);
      const updateData = {
        actualHours: parseFloat(formData.actualHours),
        crewSize: parseInt(formData.crewSize),
        finalPrice: parseFloat(formData.finalPrice),
        tip: formData.tip ? parseFloat(formData.tip) : 0,
        status: 'completed',
        completedAt: serverTimestamp(),
        roomTimes: formData.roomTimes,
        notes: formData.notes
      };

      // Save signature if captured
      if (signature) {
        const signatureId = `signature_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const signatureRef = ref(storage, `tenants/${jobData.tenantId}/signatures/${signatureId}`);
        
        // Convert data URL to blob
        const response = await fetch(signature);
        const blob = await response.blob();
        await uploadBytes(signatureRef, blob);
        const signatureUrl = await getDownloadURL(signatureRef);
        
        updateData.customerSignature = signatureUrl;
      }

      await updateDoc(jobRef, updateData);

      // Save after photos
      for (const photo of afterPhotos) {
        await addDoc(collection(db, 'tenants', jobData.tenantId, 'photos'), {
          ...photo,
          jobId: jobData.jobId,
          tenantId: jobData.tenantId,
          createdAt: serverTimestamp()
        });
      }

      // Save customer review if provided
      if (formData.customerRating) {
        await addDoc(collection(db, 'tenants', jobData.tenantId, 'customer_reviews'), {
          jobId: jobData.jobId,
          tenantId: jobData.tenantId,
          customerId: jobData.customerId,
          rating: parseInt(formData.customerRating),
          wouldRecommend: formData.wouldRecommend,
          createdAt: serverTimestamp()
        });
      }

      // Create AI learning data
      const predictionError = parseFloat(formData.actualHours) - jobData.estimatedHours;
      await addDoc(collection(db, 'tenants', jobData.tenantId, 'ai_learning_data'), {
        jobId: jobData.jobId,
        tenantId: jobData.tenantId,
        beforePhotos: jobData.beforePhotos || [],
        afterPhotos: afterPhotos.map(p => p.url),
        predictedHours: jobData.estimatedHours,
        actualHours: parseFloat(formData.actualHours),
        predictionError,
        aiAnalysis: jobData.aiAnalysis,
        roomTimes: formData.roomTimes,
        createdAt: serverTimestamp()
      });

      showMessage('success', 'Job completed successfully');
      onComplete();
    } catch (error) {
      console.error('Error completing job:', error);
      showMessage('error', 'Failed to complete job');
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          Job Completion
        </h2>
        <p style={{ fontSize: 16, color: '#64748b', margin: 0 }}>
          Record actual job results for AI training
        </p>
      </div>

      {/* Message Banner */}
      {message.text && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 24,
          background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: message.type === 'success' ? '1px solid #bbf7d0' : '1px solid #fecaca',
          color: message.type === 'success' ? '#166534' : '#991b1b'
        }}>
          {message.text}
        </div>
      )}

      {/* Job Summary */}
      <div style={{
        padding: '16px',
        background: '#f0f9ff',
        borderRadius: 8,
        border: '1px solid #bae6fd',
        marginBottom: 24
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0c4a6e', margin: '0 0 8px' }}>
          Job Summary
        </h3>
        <div style={{ fontSize: 13, color: '#0c4a6e' }}>
          <div><strong>Estimated Hours:</strong> {jobData.estimatedHours}</div>
          <div><strong>Estimated Price:</strong> ${jobData.estimatedPriceLow} - ${jobData.estimatedPriceHigh}</div>
          <div><strong>Cleaning Type:</strong> {jobData.cleaningType}</div>
        </div>
      </div>

      {/* Actual Results */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        marginBottom: 24
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
          Actual Results
        </h3>
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              Actual Hours Worked *
            </label>
            <input
              type="number"
              step="0.25"
              value={formData.actualHours}
              onChange={(e) => setFormData({ ...formData, actualHours: e.target.value })}
              placeholder="e.g., 7.5"
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
              Crew Size
            </label>
            <select
              value={formData.crewSize}
              onChange={(e) => setFormData({ ...formData, crewSize: e.target.value })}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: 6
              }}
            >
              <option value="1">1 person</option>
              <option value="2">2 people</option>
              <option value="3">3 people</option>
              <option value="4">4+ people</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              Final Invoice Amount *
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.finalPrice}
              onChange={(e) => setFormData({ ...formData, finalPrice: e.target.value })}
              placeholder="e.g., 495.00"
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
              Tip Received
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.tip}
              onChange={(e) => setFormData({ ...formData, tip: e.target.value })}
              placeholder="e.g., 50.00"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: 6
              }}
            />
          </div>
        </div>
      </div>

      {/* Room-Level Time Tracking */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        marginBottom: 24
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
          Room-Level Time Tracking (Optional)
        </h3>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
          Track actual time spent in each room for AI training
        </p>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {['kitchen', 'master_bath', 'guest_bath', 'living_room', 'bedroom', 'garage'].map(room => (
            <div key={room}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                {room.replace('_', ' ').toUpperCase()}
              </label>
              <input
                type="number"
                step="5"
                placeholder="minutes"
                value={formData.roomTimes[room] || ''}
                onChange={(e) => handleRoomTimeChange(room, e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 13
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* After Photos */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        marginBottom: 24
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
          After Photos
        </h3>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
          Upload photos after cleaning is complete
        </p>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleAfterPhotoUpload}
          disabled={uploading}
          style={{
            width: '100%',
            padding: '10px',
            border: '1px dashed #d1d5db',
            borderRadius: 6,
            background: '#f9fafb'
          }}
        />
        {uploading && <p style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>Uploading...</p>}
        {afterPhotos.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
              {afterPhotos.length} photo(s) uploaded
            </p>
          </div>
        )}
      </div>

      {/* Customer Satisfaction */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        marginBottom: 24
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
          Customer Satisfaction (Optional)
        </h3>
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              Rating (1-5)
            </label>
            <select
              value={formData.customerRating}
              onChange={(e) => setFormData({ ...formData, customerRating: e.target.value })}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: 6
              }}
            >
              <option value="">Select rating</option>
              <option value="5">5 - Excellent</option>
              <option value="4">4 - Very Good</option>
              <option value="3">3 - Good</option>
              <option value="2">2 - Fair</option>
              <option value="1">1 - Poor</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              Would Recommend?
            </label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="radio"
                  name="recommend"
                  checked={formData.wouldRecommend === true}
                  onChange={() => setFormData({ ...formData, wouldRecommend: true })}
                />
                <span>Yes</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="radio"
                  name="recommend"
                  checked={formData.wouldRecommend === false}
                  onChange={() => setFormData({ ...formData, wouldRecommend: false })}
                />
                <span>No</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Job Notes */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        marginBottom: 24
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
          Job Notes (Optional)
        </h3>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Add any notes about this job (special requests, issues, etc.)"
          rows={4}
          style={{
            width: '100%',
            padding: '10px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14,
            fontFamily: 'inherit',
            resize: 'vertical'
          }}
        />
      </div>

      {/* Customer Signature */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        marginBottom: 24
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
          Customer Signature (Optional)
        </h3>
        <div style={{ marginBottom: 16 }}>
          <canvas
            ref={canvasRef}
            width={400}
            height={150}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            style={{
              border: '1px solid #d1d5db',
              borderRadius: 6,
              background: '#fff',
              cursor: 'crosshair',
              touchAction: 'none'
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={clearSignature}
            type="button"
            style={{
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
          {signature && (
            <span style={{ fontSize: 13, color: '#10b981', display: 'flex', alignItems: 'center' }}>
              ✓ Signature captured
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '12px 24px',
            background: 'white',
            color: '#0f172a',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          style={{
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Complete Job
        </button>
      </div>
    </div>
  );
}
