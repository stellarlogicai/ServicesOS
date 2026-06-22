// src/components/CalendarView.jsx
import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

export default function CalendarView({ tenantId }) {
  const [view, setView] = useState('month'); // 'day', 'week', 'month'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedBooking, setSelectedBooking] = useState(null);

  const loadBookings = useCallback(async () => {
    if (!tenantId) return;
    
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    try {
      const bookingsRef = collection(db, 'tenants', tenantId, 'bookings');
      const q = query(
        bookingsRef,
        where('date', '>=', startOfMonth.toISOString().split('T')[0]),
        where('date', '<=', endOfMonth.toISOString().split('T')[0]),
        orderBy('date'),
        orderBy('startTime')
      );
      
      const snapshot = await getDocs(q);
      const bookingsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBookings(bookingsData);
    } catch (error) {
      console.error('Error loading bookings:', error);
    }
  }, [tenantId, currentDate]);

  const loadEmployees = useCallback(async () => {
    if (!tenantId) return;
    try {
      const employeesRef = collection(db, 'tenants', tenantId, 'employees');
      const q = query(employeesRef, where('status', '==', 'active'), orderBy('name'));
      const snapshot = await getDocs(q);
      const employeesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEmployees(employeesData);
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  }, [tenantId]);

  useEffect(() => {
    let isActive = true;

    Promise.resolve().then(() => {
      if (isActive) {
        loadBookings();
        loadEmployees();
      }
    });

    return () => {
      isActive = false;
    };
  }, [loadBookings, loadEmployees]);

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    const days = [];
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    // Add days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const getBookingsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return bookings.filter(booking => booking.date === dateStr);
  };

  const getEmployeeName = (employeeId) => {
    const employee = employees.find(e => e.id === employeeId);
    return employee?.name || 'Unknown';
  };

  const navigateMonth = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + direction);
    setCurrentDate(newDate);
  };

  const getStatusColor = (status) => {
    const colors = {
      scheduled: '#3b82f6',
      in_progress: '#f59e0b',
      completed: '#10b981',
      cancelled: '#ef4444'
    };
    return colors[status] || '#6b7280';
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          Calendar
        </h1>
        <p style={{ fontSize: 16, color: '#64748b', margin: 0 }}>
          View and manage scheduled jobs
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => navigateMonth(-1)}
            style={{
              padding: '8px 16px',
              background: 'white',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            ← Previous
          </button>
          <span style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', minWidth: 200, textAlign: 'center' }}>
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button
            onClick={() => navigateMonth(1)}
            style={{
              padding: '8px 16px',
              background: 'white',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            Next →
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            style={{
              padding: '8px 16px',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            Today
          </button>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {['day', 'week', 'month'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '8px 16px',
                background: view === v ? '#3b82f6' : 'white',
                color: view === v ? 'white' : '#374151',
                border: view === v ? '1px solid #3b82f6' : '1px solid #d1d5db',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: view === v ? 600 : 400
              }}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Month View */}
      {view === 'month' && (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {/* Day Headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f9fafb', borderBottom: '1px solid #e2e8f0' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} style={{ padding: '12px', textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#6b7280' }}>
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {getDaysInMonth(currentDate).map((date, index) => {
              if (!date) {
                return <div key={index} style={{ minHeight: 120, border: '1px solid #f3f4f6', background: '#fafafa' }} />;
              }

              const dayBookings = getBookingsForDate(date);
              const isToday = date.toDateString() === new Date().toDateString();

              return (
                <div
                  key={index}
                  style={{
                    minHeight: 120,
                    border: '1px solid #e2e8f0',
                    padding: 8,
                    cursor: 'pointer',
                    background: isToday ? '#eff6ff' : 'white'
                  }}
                  onClick={() => {
                    if (dayBookings.length > 0) {
                      setSelectedBooking({ date, bookings: dayBookings });
                    }
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: isToday ? '#2563eb' : '#374151', marginBottom: 8 }}>
                    {date.getDate()}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {dayBookings.slice(0, 3).map(booking => (
                      <div
                        key={booking.id}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          background: getStatusColor(booking.status) + '20',
                          borderLeft: `3px solid ${getStatusColor(booking.status)}`,
                          fontSize: 11,
                          color: '#374151',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {booking.startTime} {getEmployeeName(booking.employeeId)}
                      </div>
                    ))}
                    {dayBookings.length > 3 && (
                      <div style={{ fontSize: 11, color: '#6b7280' }}>
                        +{dayBookings.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Day View */}
      {view === 'day' && (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
            {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {getBookingsForDate(currentDate).length === 0 ? (
              <p style={{ color: '#6b7280', textAlign: 'center', padding: 40 }}>No jobs scheduled for this day</p>
            ) : (
              getBookingsForDate(currentDate).map(booking => (
                <div
                  key={booking.id}
                  style={{
                    padding: '16px',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    borderLeft: `4px solid ${getStatusColor(booking.status)}`,
                    background: '#f9fafb'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>
                        {booking.startTime} - {booking.endTime}
                      </div>
                      <div style={{ fontSize: 14, color: '#64748b' }}>
                        {getEmployeeName(booking.employeeId)} · {booking.address}
                      </div>
                    </div>
                    <div>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: 12,
                        background: getStatusColor(booking.status) + '20',
                        color: getStatusColor(booking.status),
                        fontSize: 12,
                        fontWeight: 600
                      }}>
                        {booking.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Week View */}
      {view === 'week' && (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
            Week of {currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
            {Array.from({ length: 7 }, (_, i) => {
              const date = new Date(currentDate);
              date.setDate(date.getDate() - date.getDay() + i);
              const dayBookings = getBookingsForDate(date);
              const isToday = date.toDateString() === new Date().toDateString();

              return (
                <div
                  key={i}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: 12,
                    minHeight: 200,
                    background: isToday ? '#eff6ff' : 'white'
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: isToday ? '#2563eb' : '#374151', marginBottom: 8 }}>
                    {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {dayBookings.map(booking => (
                      <div
                        key={booking.id}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 4,
                          background: getStatusColor(booking.status) + '20',
                          borderLeft: `3px solid ${getStatusColor(booking.status)}`,
                          fontSize: 11,
                          color: '#374151'
                        }}
                      >
                        {booking.startTime} {getEmployeeName(booking.employeeId)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Booking Detail Modal */}
      {selectedBooking && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: 12,
            padding: 24,
            maxWidth: 500,
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', margin: 0 }}>
                {selectedBooking.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h2>
              <button
                onClick={() => setSelectedBooking(null)}
                style={{
                  padding: '8px 12px',
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 16
                }}
              >
                ×
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {selectedBooking.bookings.map(booking => (
                <div
                  key={booking.id}
                  style={{
                    padding: '12px',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    background: '#f9fafb'
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
                    {booking.startTime} - {booking.endTime}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>
                    {getEmployeeName(booking.employeeId)}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>
                    {booking.address}
                  </div>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: getStatusColor(booking.status) + '20',
                    color: getStatusColor(booking.status),
                    fontSize: 11,
                    fontWeight: 600
                  }}>
                    {booking.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
