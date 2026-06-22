// src/components/EmployeeMobileApp.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, getDocs, orderBy, updateDoc, doc, addDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export default function EmployeeMobileApp({ tenantId, employeeId }) {
  const [view, setView] = useState('home'); // home, route, job, start-day
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobStarted, setJobStarted] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [arrivalTime, setArrivalTime] = useState(null);
  const [afterPhotos, setAfterPhotos] = useState([]);
  const [signature, setSignature] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [dayStarted, setDayStarted] = useState(false);
  const [clockInTime, setClockInTime] = useState(null);
  const [confirmedEquipment, setConfirmedEquipment] = useState([]);
  const [employeeName, setEmployeeName] = useState('');
  const [checklistItems, setChecklistItems] = useState([
    { id: 1, area: 'Kitchen', items: ['Counters', 'Sink', 'Appliances', 'Floor'], completed: [] },
    { id: 2, area: 'Bathroom', items: ['Sink', 'Toilet', 'Shower/Tub', 'Mirror', 'Floor'], completed: [] },
    { id: 3, area: 'Living Room', items: ['Dust surfaces', 'Vacuum', 'Windows'], completed: [] },
    { id: 4, area: 'Bedroom', items: ['Dust surfaces', 'Vacuum', 'Make bed'], completed: [] }
  ]);
  const [customerNotes, setCustomerNotes] = useState('');
  const [issueReported, setIssueReported] = useState(false);
  const [issueType, setIssueType] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const loadTodayJobs = useCallback(async () => {
    if (!tenantId || !employeeId) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const bookingsRef = collection(db, 'tenants', tenantId, 'bookings');
      const q = query(
        bookingsRef,
        where('employeeId', '==', employeeId),
        where('date', '==', today),
        orderBy('startTime')
      );
      const snapshot = await getDocs(q);
      const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setJobs(jobsData);
      
      // Load employee info
      const employeeRef = doc(db, 'tenants', tenantId, 'employees', employeeId);
      const employeeSnap = await getDoc(employeeRef);
      if (employeeSnap.exists()) {
        setEmployeeName(employeeSnap.data().name || '');
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
      setMessage({ type: 'error', text: 'Failed to load jobs' });
    }
  }, [tenantId, employeeId]);

  useEffect(() => {
    let isActive = true;

    Promise.resolve().then(() => {
      if (isActive) {
        loadTodayJobs();
      }
    });

    return () => {
      isActive = false;
    };
  }, [loadTodayJobs]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const calculateRouteMetrics = () => {
    if (jobs.length === 0) return { totalTime: '0h 0m', earnings: 0 };
    
    let totalMinutes = 0;
    let earnings = 0;
    
    jobs.forEach(job => {
      if (job.startTime && job.endTime) {
        const [startH, startM] = job.startTime.split(':').map(Number);
        const [endH, endM] = job.endTime.split(':').map(Number);
        const duration = (endH * 60 + endM) - (startH * 60 + startM);
        totalMinutes += duration;
      }
      if (job.price) {
        earnings += job.price;
      }
    });
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    return {
      totalTime: `${hours}h ${minutes}m`,
      earnings: earnings
    };
  };

  const handleStartDay = () => {
    setView('start-day');
  };

  const handleClockIn = async () => {
    setClockInTime(new Date());
    setDayStarted(true);
    showMessage('success', 'Clocked in successfully');
  };

  const handleConfirmEquipment = (equipId) => {
    if (confirmedEquipment.includes(equipId)) {
      setConfirmedEquipment(prev => prev.filter(id => id !== equipId));
    } else {
      setConfirmedEquipment(prev => [...prev, equipId]);
    }
  };

  const handleCompleteStartDay = () => {
    setView('home');
    showMessage('success', 'Day started successfully');
  };

  const handleViewRoute = () => {
    setView('route');
  };

  const handleStartJob = () => {
    setJobStarted(true);
    setStartTime(new Date());
    showMessage('success', 'Job started');
  };

  const handleCompleteJob = async () => {
    if (!selectedJob || !signature) {
      showMessage('error', 'Please complete signature before finishing');
      return;
    }

    setLoading(true);
    try {
      const signatureId = `signature_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const signatureRef = ref(storage, `tenants/${tenantId}/signatures/${signatureId}`);
      const response = await fetch(signature);
      const blob = await response.blob();
      await uploadBytes(signatureRef, blob);
      const signatureUrl = await getDownloadURL(signatureRef);

      const bookingRef = doc(db, 'tenants', tenantId, 'bookings', selectedJob.id);
      await updateDoc(bookingRef, {
        status: 'completed',
        completedAt: serverTimestamp(),
        customerSignature: signatureUrl,
        actualStartTime: startTime?.toISOString(),
        actualEndTime: new Date().toISOString(),
        arrivalTime: arrivalTime?.toISOString(),
        checklistCompleted: checklistItems,
        customerNotes,
        issueReported,
        issueType: issueReported ? issueType : null,
        issueDescription: issueReported ? issueDescription : null
      });

      for (const photo of afterPhotos) {
        await addDoc(collection(db, 'tenants', tenantId, 'photos'), {
          ...photo,
          bookingId: selectedJob.id,
          tenantId,
          createdAt: serverTimestamp()
        });
      }

      showMessage('success', 'Job completed successfully');
      setSelectedJob(null);
      setJobStarted(false);
      setStartTime(null);
      setArrivalTime(null);
      setAfterPhotos([]);
      setSignature(null);
      setChecklistItems([
        { id: 1, area: 'Kitchen', items: ['Counters', 'Sink', 'Appliances', 'Floor'], completed: [] },
        { id: 2, area: 'Bathroom', items: ['Sink', 'Toilet', 'Shower/Tub', 'Mirror', 'Floor'], completed: [] },
        { id: 3, area: 'Living Room', items: ['Dust surfaces', 'Vacuum', 'Windows'], completed: [] },
        { id: 4, area: 'Bedroom', items: ['Dust surfaces', 'Vacuum', 'Make bed'], completed: [] }
      ]);
      setCustomerNotes('');
      setIssueReported(false);
      setIssueType('');
      setIssueDescription('');
      loadTodayJobs();
      setView('home');
    } catch (error) {
      console.error('Error completing job:', error);
      showMessage('error', 'Failed to complete job');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setLoading(true);
    try {
      const uploadedPhotos = [];
      
      for (const file of files) {
        const photoId = `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const storageRef = ref(storage, `tenants/${tenantId}/photos/${photoId}`);
        
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        
        uploadedPhotos.push({
          id: photoId,
          url,
          type: 'after',
          timestamp: new Date().toISOString()
        });
      }
      
      setAfterPhotos(prev => [...prev, ...uploadedPhotos]);
      showMessage('success', 'Photos uploaded');
    } catch (error) {
      console.error('Error uploading photos:', error);
      showMessage('error', 'Failed to upload photos');
    } finally {
      setLoading(false);
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

  // Render Home Screen
  if (view === 'home') {
    const metrics = calculateRouteMetrics();
    
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
            {getGreeting()}, {employeeName.split(' ')[0]}
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
            Today's Jobs: {jobs.length}
          </p>
        </div>

        {/* Message Banner */}
        {message.text && (
          <div style={{
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 16,
            background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${message.type === 'success' ? '#22c55e' : '#ef4444'}`,
            color: message.type === 'success' ? '#166534' : '#991b1b'
          }}>
            {message.text}
          </div>
        )}

        {/* Metrics Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <div style={{
            padding: 16,
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            borderRadius: 12,
            color: 'white'
          }}>
            <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 4 }}>Total Route Time</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{metrics.totalTime}</div>
          </div>
          <div style={{
            padding: 16,
            background: 'linear-gradient(135deg, #10b981, #059669)',
            borderRadius: 12,
            color: 'white'
          }}>
            <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 4 }}>Expected Earnings</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>${metrics.earnings}</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'grid', gap: 12, marginBottom: 24 }}>
          {!dayStarted ? (
            <button
              onClick={handleStartDay}
              style={{
                padding: '16px',
                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                color: 'white',
                border: 'none',
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Start Day
            </button>
          ) : (
            <div style={{
              padding: 16,
              background: '#f0fdf4',
              border: '1px solid #22c55e',
              borderRadius: 12,
              color: '#166534',
              textAlign: 'center',
              fontSize: 16,
              fontWeight: 600
            }}>
              ✓ Day Started at {clockInTime?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          
          <button
            onClick={handleViewRoute}
            style={{
              padding: '16px',
              background: 'white',
              color: '#0f172a',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            View Route
          </button>
          
          <button
            onClick={() => showMessage('info', 'Messages coming soon')}
            style={{
              padding: '16px',
              background: 'white',
              color: '#0f172a',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Messages
          </button>
        </div>

        {/* Today's Jobs */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
            Today's Jobs
          </h2>
          
          {jobs.length === 0 ? (
            <div style={{
              padding: 40,
              textAlign: 'center',
              background: 'white',
              borderRadius: 12,
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
              <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
                No jobs scheduled for today
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {jobs.map((job, index) => (
                <div
                  key={job.id}
                  onClick={() => {
                    setSelectedJob(job);
                    setView('job');
                  }}
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    background: 'white',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                      fontWeight: 700
                    }}>
                      {index + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
                        {job.startTime} - {job.endTime}
                      </div>
                      <div style={{ fontSize: 14, color: '#64748b' }}>
                        {job.address}
                      </div>
                    </div>
                    <div style={{
                      padding: '4px 12px',
                      borderRadius: 12,
                      background: job.status === 'completed' ? '#f0fdf4' : '#fef3c7',
                      color: job.status === 'completed' ? '#166534' : '#92400e',
                      fontSize: 12,
                      fontWeight: 600
                    }}>
                      {job.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render Start Day Workflow
  if (view === 'start-day') {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        <button
          onClick={() => setView('home')}
          style={{
            padding: '8px 16px',
            background: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            marginBottom: 16,
            cursor: 'pointer'
          }}
        >
          ← Back
        </button>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
            Start Your Day
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
            Clock in and confirm your equipment
          </p>
        </div>

        {!clockInTime ? (
          <button
            onClick={handleClockIn}
            style={{
              width: '100%',
              padding: '20px',
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              color: 'white',
              border: 'none',
              borderRadius: 12,
              fontSize: 18,
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: 24
            }}
          >
            Clock In
          </button>
        ) : (
          <div style={{
            padding: 20,
            background: '#f0fdf4',
            border: '1px solid #22c55e',
            borderRadius: 12,
            color: '#166534',
            textAlign: 'center',
            fontSize: 16,
            fontWeight: 600,
            marginBottom: 24
          }}>
            ✓ Clocked in at {clockInTime?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
            Today's Equipment
          </h2>
          
          <div style={{ display: 'grid', gap: 12 }}>
            {['Vacuum #12', 'Supply Kit #4', 'Extractor #2', 'Microfiber Cloths', 'Cleaning Solutions'].map((item, index) => (
              <div
                key={index}
                onClick={() => handleConfirmEquipment(index)}
                style={{
                  padding: 16,
                  borderRadius: 12,
                  border: confirmedEquipment.includes(index) ? '2px solid #22c55e' : '1px solid #e2e8f0',
                  background: confirmedEquipment.includes(index) ? '#f0fdf4' : 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12
                }}
              >
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  border: confirmedEquipment.includes(index) ? '2px solid #22c55e' : '2px solid #d1d5db',
                  background: confirmedEquipment.includes(index) ? '#22c55e' : 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: confirmedEquipment.includes(index) ? 'white' : '#64748b'
                }}>
                  {confirmedEquipment.includes(index) ? '✓' : ''}
                </div>
                <span style={{ fontSize: 16, color: '#0f172a' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleCompleteStartDay}
          disabled={!clockInTime || confirmedEquipment.length === 0}
          style={{
            width: '100%',
            padding: '20px',
            background: !clockInTime || confirmedEquipment.length === 0 ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #059669)',
            color: 'white',
            border: 'none',
            borderRadius: 12,
            fontSize: 18,
            fontWeight: 600,
            cursor: !clockInTime || confirmedEquipment.length === 0 ? 'not-allowed' : 'pointer',
            opacity: !clockInTime || confirmedEquipment.length === 0 ? 0.6 : 1
          }}
        >
          Confirm & Start Day
        </button>
      </div>
    );
  }

  // Render Route View
  if (view === 'route') {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        <button
          onClick={() => setView('home')}
          style={{
            padding: '8px 16px',
            background: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            marginBottom: 16,
            cursor: 'pointer'
          }}
        >
          ← Back
        </button>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
            Today's Route
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
            {jobs.length} jobs scheduled
          </p>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {jobs.map((job, index) => (
            <div
              key={job.id}
              onClick={() => {
                setSelectedJob(job);
                setView('job');
              }}
              style={{
                padding: 16,
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                background: 'white',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  fontWeight: 700
                }}>
                  {index + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
                    {job.startTime} - {job.endTime}
                  </div>
                  <div style={{ fontSize: 14, color: '#64748b' }}>
                    {job.address}
                  </div>
                </div>
                <div style={{
                  padding: '4px 12px',
                  borderRadius: 12,
                  background: job.status === 'completed' ? '#f0fdf4' : '#fef3c7',
                  color: job.status === 'completed' ? '#166534' : '#92400e',
                  fontSize: 12,
                  fontWeight: 600
                }}>
                  {job.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Render Job Detail View
  if (view === 'job' && selectedJob) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        <button
          onClick={() => {
            setSelectedJob(null);
            setView('home');
          }}
          style={{
            padding: '8px 16px',
            background: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            marginBottom: 16,
            cursor: 'pointer'
          }}
        >
          ← Back
        </button>

        <div style={{
          background: 'white',
          padding: 24,
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          marginBottom: 16
        }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
            {selectedJob.address}
          </h1>
          <div style={{ fontSize: 16, color: '#64748b', marginBottom: 16 }}>
            {selectedJob.startTime} - {selectedJob.endTime}
          </div>
          
          <div style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: selectedJob.status === 'completed' ? '#f0fdf4' : '#fef3c7',
            color: selectedJob.status === 'completed' ? '#166534' : '#92400e',
            fontSize: 14,
            fontWeight: 600,
            display: 'inline-block',
            marginBottom: 24
          }}>
            Status: {selectedJob.status}
          </div>

          {!jobStarted ? (
            <button
              onClick={handleStartJob}
              disabled={selectedJob.status === 'completed'}
              style={{
                width: '100%',
                padding: '20px',
                background: selectedJob.status === 'completed' ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                color: 'white',
                border: 'none',
                borderRadius: 12,
                fontSize: 18,
                fontWeight: 600,
                cursor: selectedJob.status === 'completed' ? 'not-allowed' : 'pointer',
                opacity: selectedJob.status === 'completed' ? 0.6 : 1
              }}
            >
              {selectedJob.status === 'completed' ? 'Already Completed' : 'Start Job'}
            </button>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  After Photos
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px dashed #d1d5db',
                    borderRadius: 8,
                    background: '#f9fafb'
                  }}
                />
                {afterPhotos.length > 0 && (
                  <p style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>
                    {afterPhotos.length} photo(s) uploaded
                  </p>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Customer Signature *
                </label>
                <canvas
                  ref={canvasRef}
                  width={300}
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
                    touchAction: 'none'
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

              <button
                onClick={handleCompleteJob}
                disabled={loading || !signature}
                style={{
                  width: '100%',
                  padding: '20px',
                  background: loading || !signature ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 12,
                  fontSize: 18,
                  fontWeight: 600,
                  cursor: loading || !signature ? 'not-allowed' : 'pointer',
                  opacity: loading || !signature ? 0.6 : 1
                }}
              >
                {loading ? 'Completing...' : 'Complete Job'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
