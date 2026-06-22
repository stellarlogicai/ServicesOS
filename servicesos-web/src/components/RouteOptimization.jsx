// src/components/RouteOptimization.jsx
import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, orderBy, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Estimate travel time based on distance (assuming 30mph average in city)
 */
function estimateTravelTime(distance) {
  const avgSpeed = 30; // mph
  return (distance / avgSpeed) * 60; // minutes
}

/**
 * Nearest Neighbor algorithm for route optimization
 */
function optimizeRoute(jobs, startLocation) {
  if (!jobs || jobs.length === 0) return [];

  const unvisited = [...jobs];
  const optimized = [];
  let currentLocation = startLocation;

  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    unvisited.forEach((job, index) => {
      if (job.latitude && job.longitude) {
        const distance = calculateDistance(
          currentLocation.latitude,
          currentLocation.longitude,
          job.latitude,
          job.longitude
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      }
    });

    const nearestJob = unvisited.splice(nearestIndex, 1)[0];
    nearestJob.distanceFromPrevious = nearestDistance;
    nearestJob.estimatedTravelTime = estimateTravelTime(nearestDistance);
    optimized.push(nearestJob);
    currentLocation = { latitude: nearestJob.latitude, longitude: nearestJob.longitude };
  }

  return optimized;
}

/**
 * Calculate total route metrics
 */
function calculateRouteMetrics(optimizedJobs, startLocation) {
  let totalDistance = 0;
  let totalTravelTime = 0;

  optimizedJobs.forEach((job) => {
    totalDistance += job.distanceFromPrevious || 0;
    totalTravelTime += job.estimatedTravelTime || 0;
  });

  // Add return trip to start
  if (optimizedJobs.length > 0) {
    const lastJob = optimizedJobs[optimizedJobs.length - 1];
    const returnDistance = calculateDistance(
      lastJob.latitude,
      lastJob.longitude,
      startLocation.latitude,
      startLocation.longitude
    );
    totalDistance += returnDistance;
    totalTravelTime += estimateTravelTime(returnDistance);
  }

  // Calculate fuel cost (assuming $3.50/gallon, 25 mpg)
  const fuelCost = (totalDistance / 25) * 3.50;

  return {
    totalDistance: totalDistance.toFixed(1),
    totalTravelTime: Math.round(totalTravelTime),
    fuelCost: fuelCost.toFixed(2),
    jobsCount: optimizedJobs.length
  };
}

export default function RouteOptimization({ tenantId }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [optimizedRoute, setOptimizedRoute] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [startLocation, setStartLocation] = useState({ latitude: 40.7128, longitude: -74.0060 }); // Default to NYC

  const handleOptimize = useCallback((jobsToOptimize = jobs) => {
    if (!jobsToOptimize || jobsToOptimize.length === 0) {
      setMessage({ type: 'error', text: 'No jobs to optimize' });
      return;
    }

    // Filter jobs with coordinates
    const jobsWithCoords = jobsToOptimize.filter(job => job.latitude && job.longitude);
    
    if (jobsWithCoords.length === 0) {
      setMessage({ type: 'error', text: 'Jobs need latitude/longitude coordinates for route optimization' });
      return;
    }

    const optimized = optimizeRoute(jobsWithCoords, startLocation);
    setOptimizedRoute(optimized);
    
    const routeMetrics = calculateRouteMetrics(optimized, startLocation);
    setMetrics(routeMetrics);
    
    setMessage({ type: 'success', text: `Route optimized for ${optimized.length} jobs` });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  }, [jobs, startLocation]);

  const loadEmployees = useCallback(async () => {
    if (!tenantId) return;
    
    try {
      const employeesRef = collection(db, 'tenants', tenantId, 'employees');
      const q = query(employeesRef, where('status', '==', 'active'));
      const snapshot = await getDocs(q);
      const employeesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEmployees(employeesData);
      
      // Set first employee as default
      if (employeesData.length > 0) {
        setSelectedEmployee(employeesData[0]);
      }
    } catch (error) {
      console.error('Error loading employees:', error);
      setMessage({ type: 'error', text: 'Failed to load employees' });
    }
  }, [tenantId]);

  const loadJobs = useCallback(async () => {
    if (!tenantId || !selectedEmployee) return;
    
    setLoading(true);
    try {
      const bookingsRef = collection(db, 'tenants', tenantId, 'bookings');
      const q = query(
        bookingsRef,
        where('employeeId', '==', selectedEmployee.id),
        where('date', '==', selectedDate),
        orderBy('startTime')
      );
      const snapshot = await getDocs(q);
      const jobsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setJobs(jobsData);
      
      // Auto-optimize when jobs load
      if (jobsData.length > 0) {
        handleOptimize(jobsData);
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
      setMessage({ type: 'error', text: 'Failed to load jobs' });
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedEmployee, selectedDate, handleOptimize]);

  useEffect(() => {
    let isActive = true;

    Promise.resolve().then(() => {
      if (isActive) {
        loadEmployees();
      }
    });

    return () => {
      isActive = false;
    };
  }, [loadEmployees]);

  useEffect(() => {
    let isActive = true;

    Promise.resolve().then(() => {
      if (isActive && selectedEmployee) {
        loadJobs();
      }
    });

    return () => {
      isActive = false;
    };
  }, [loadJobs, selectedEmployee, selectedDate]);

  const handleApplyRoute = async () => {
    if (!tenantId || optimizedRoute.length === 0) return;

    setLoading(true);
    try {
      // Update jobs with optimized order
      const updates = optimizedRoute.map((job, index) => {
        const jobRef = doc(db, 'tenants', tenantId, 'bookings', job.id);
        return updateDoc(jobRef, {
          routeOrder: index + 1,
          estimatedTravelTime: job.estimatedTravelTime,
          distanceFromPrevious: job.distanceFromPrevious
        });
      });

      await Promise.all(updates);
      setMessage({ type: 'success', text: 'Optimized route applied successfully' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error applying route:', error);
      setMessage({ type: 'error', text: 'Failed to apply route' });
    } finally {
      setLoading(false);
    }
  };

  const handleResetRoute = async () => {
    if (!tenantId || jobs.length === 0) return;

    setLoading(true);
    try {
      const updates = jobs.map(job => {
        const jobRef = doc(db, 'tenants', tenantId, 'bookings', job.id);
        return updateDoc(jobRef, {
          routeOrder: null,
          estimatedTravelTime: null,
          distanceFromPrevious: null
        });
      });

      await Promise.all(updates);
      setOptimizedRoute([]);
      setMetrics(null);
      setMessage({ type: 'success', text: 'Route reset to original order' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error resetting route:', error);
      setMessage({ type: 'error', text: 'Failed to reset route' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          🗺️ Route Optimization
        </h2>
        <p style={{ fontSize: 16, color: '#64748b', margin: 0 }}>
          Optimize employee routes to minimize travel time and fuel costs
        </p>
      </div>

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

      {/* Controls */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 24,
        padding: 20,
        background: 'white',
        borderRadius: 12,
        border: '1px solid #e2e8f0'
      }}>
        <div>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            Employee
          </label>
          <select
            value={selectedEmployee?.id || ''}
            onChange={(e) => {
              const employee = employees.find(emp => emp.id === e.target.value);
              setSelectedEmployee(employee);
            }}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14
            }}
          >
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            Start Latitude
          </label>
          <input
            type="number"
            step="0.0001"
            value={startLocation.latitude}
            onChange={(e) => setStartLocation({ ...startLocation, latitude: parseFloat(e.target.value) })}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            Start Longitude
          </label>
          <input
            type="number"
            step="0.0001"
            value={startLocation.longitude}
            onChange={(e) => setStartLocation({ ...startLocation, longitude: parseFloat(e.target.value) })}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14
            }}
          />
        </div>
      </div>

      {/* Metrics */}
      {metrics && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24
        }}>
          <div style={{
            padding: 20,
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            borderRadius: 12,
            color: 'white'
          }}>
            <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 4 }}>Total Distance</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{metrics.totalDistance} mi</div>
          </div>
          <div style={{
            padding: 20,
            background: 'linear-gradient(135deg, #10b981, #059669)',
            borderRadius: 12,
            color: 'white'
          }}>
            <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 4 }}>Travel Time</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{metrics.totalTravelTime} min</div>
          </div>
          <div style={{
            padding: 20,
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            borderRadius: 12,
            color: 'white'
          }}>
            <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 4 }}>Fuel Cost</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>${metrics.fuelCost}</div>
          </div>
          <div style={{
            padding: 20,
            background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
            borderRadius: 12,
            color: 'white'
          }}>
            <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 4 }}>Jobs</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{metrics.jobsCount}</div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{
        display: 'flex',
        gap: 12,
        marginBottom: 24
      }}>
        <button
          onClick={() => handleOptimize()}
          disabled={loading || jobs.length === 0}
          style={{
            padding: '12px 24px',
            background: loading || jobs.length === 0 ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: loading || jobs.length === 0 ? 'not-allowed' : 'pointer',
            opacity: loading || jobs.length === 0 ? 0.6 : 1
          }}
        >
          {loading ? 'Optimizing...' : 'Optimize Route'}
        </button>
        
        {optimizedRoute.length > 0 && (
          <>
            <button
              onClick={handleApplyRoute}
              disabled={loading}
              style={{
                padding: '12px 24px',
                background: loading ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #059669)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? 'Applying...' : 'Apply Route'}
            </button>
            
            <button
              onClick={handleResetRoute}
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
              Reset
            </button>
          </>
        )}
      </div>

      {/* Route Display */}
      {optimizedRoute.length > 0 ? (
        <div style={{
          background: 'white',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc'
          }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#0f172a' }}>
              Optimized Route
            </h3>
          </div>
          
          <div style={{ padding: 20 }}>
            {optimizedRoute.map((job, index) => (
              <div
                key={job.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '16px',
                  marginBottom: index < optimizedRoute.length - 1 ? 12 : 0,
                  background: '#f8fafc',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0'
                }}
              >
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
                    {job.address}
                  </div>
                  <div style={{ fontSize: 14, color: '#64748b' }}>
                    {job.startTime} - {job.endTime}
                  </div>
                </div>
                
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>
                    {job.distanceFromPrevious.toFixed(1)} mi
                  </div>
                  <div style={{ fontSize: 14, color: '#64748b' }}>
                    {Math.round(job.estimatedTravelTime)} min travel
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : jobs.length > 0 ? (
        <div style={{
          padding: 40,
          textAlign: 'center',
          background: 'white',
          borderRadius: 12,
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🗺️</div>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
            {jobs.length} Jobs Loaded
          </h3>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
            Click "Optimize Route" to calculate the most efficient route
          </p>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>
            Note: Jobs need latitude/longitude coordinates for optimization
          </div>
        </div>
      ) : (
        <div style={{
          padding: 40,
          textAlign: 'center',
          background: 'white',
          borderRadius: 12,
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
            No Jobs Scheduled
          </h3>
          <p style={{ fontSize: 14, color: '#64748b' }}>
            Select a date and employee to view and optimize routes
          </p>
        </div>
      )}
    </div>
  );
}
