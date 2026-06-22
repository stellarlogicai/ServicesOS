// src/components/StaffScheduling.jsx
import { useState, useEffect, useCallback } from 'react';
import { getEmployees, createEmployee, updateEmployee, deleteEmployee } from '../core/employees/employeeService';
import { getJobsByDate, createJob, updateJobStatus } from '../core/scheduling/schedulingService';

export default function StaffScheduling({ tenantId }) {
  const [activeTab, setActiveTab] = useState('shifts');
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Shift form state
  const [shiftForm, setShiftForm] = useState({
    employeeId: '',
    date: selectedDate,
    startTime: '09:00',
    endTime: '12:00',
    address: '',
    jobId: ''
  });

  // Employee form state
  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'employee',
    status: 'active',
    hourlyRate: '',
    hireDate: new Date().toISOString().split('T')[0]
  });
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);

  const loadEmployees = useCallback(async () => {
    if (!tenantId) return;
    try {
      const result = await getEmployees(tenantId);
      if (result.success) {
        setEmployees(result.data);
      } else {
        console.error('Error loading employees:', result.message);
      }
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  }, [tenantId]);

  const loadShifts = useCallback(async () => {
    if (!tenantId) return;
    try {
      const result = await getJobsByDate(tenantId, selectedDate);
      if (result.success) {
        setShifts(result.data);
      } else {
        console.error('Error loading shifts:', result.message);
      }
    } catch (error) {
      console.error('Error loading shifts:', error);
    }
  }, [tenantId, selectedDate]);

  useEffect(() => {
    let isActive = true;

    Promise.resolve().then(() => {
      if (isActive) {
        loadEmployees();
        loadShifts();
      }
    });

    return () => {
      isActive = false;
    };
  }, [loadEmployees, loadShifts]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  // Shift handlers
  const handleCreateShift = async () => {
    if (!shiftForm.employeeId || !shiftForm.address) {
      showMessage('error', 'Employee and address are required');
      return;
    }
    try {
      const result = await createJob(tenantId, {
        ...shiftForm,
        status: 'scheduled'
      });
      if (result.success) {
        setShiftForm({ ...shiftForm, jobId: '' });
        loadShifts();
        showMessage('success', 'Shift created successfully');
      } else {
        showMessage('error', 'Failed to create shift: ' + result.message);
      }
    } catch (error) {
      console.error('Error creating shift:', error);
      showMessage('error', 'Failed to create shift');
    }
  };

  // Employee handlers
  const handleAddEmployee = () => {
    setEmployeeForm({
      name: '',
      email: '',
      phone: '',
      role: 'employee',
      status: 'active',
      hourlyRate: '',
      hireDate: new Date().toISOString().split('T')[0]
    });
    setEditingEmployee(null);
    setShowEmployeeModal(true);
  };

  const handleEditEmployee = (employee) => {
    setEmployeeForm({
      name: employee.name || '',
      email: employee.email || '',
      phone: employee.phone || '',
      role: employee.role || 'employee',
      status: employee.status || 'active',
      hourlyRate: employee.hourlyRate || '',
      hireDate: employee.hireDate || new Date().toISOString().split('T')[0]
    });
    setEditingEmployee(employee);
    setShowEmployeeModal(true);
  };

  const handleSaveEmployee = async () => {
    if (!employeeForm.name) {
      showMessage('error', 'Name is required');
      return;
    }

    try {
      let result;
      if (editingEmployee) {
        result = await updateEmployee(tenantId, editingEmployee.id, employeeForm);
        if (result.success) {
          showMessage('success', 'Employee updated successfully');
        } else {
          showMessage('error', 'Failed to update employee: ' + result.message);
        }
      } else {
        result = await createEmployee(tenantId, employeeForm);
        if (result.success) {
          showMessage('success', 'Employee added successfully');
        } else {
          showMessage('error', 'Failed to add employee: ' + result.message);
        }
      }
      if (result.success) {
        setShowEmployeeModal(false);
        loadEmployees();
      }
    } catch (error) {
      console.error('Error saving employee:', error);
      showMessage('error', 'Failed to save employee');
    }
  };

  const handleDeleteEmployee = async (employeeId) => {
    if (!confirm('Are you sure you want to delete this employee?')) return;

    try {
      const result = await deleteEmployee(tenantId, employeeId);
      if (result.success) {
        showMessage('success', 'Employee deleted successfully');
        loadEmployees();
      } else {
        showMessage('error', 'Failed to delete employee: ' + result.message);
      }
    } catch (error) {
      console.error('Error deleting employee:', error);
      showMessage('error', 'Failed to delete employee');
    }
  };

  const handleCheckIn = async (shiftId) => {
    try {
      const result = await updateJobStatus(tenantId, shiftId, 'in_progress');
      if (result.success) {
        loadShifts();
        showMessage('success', 'Checked in successfully');
      } else {
        showMessage('error', 'Failed to check in: ' + result.message);
      }
    } catch (error) {
      console.error('Error checking in:', error);
      showMessage('error', 'Failed to check in');
    }
  };

  const handleCheckOut = async (shiftId) => {
    try {
      const result = await updateJobStatus(tenantId, shiftId, 'completed');
      if (result.success) {
        loadShifts();
        showMessage('success', 'Checked out successfully');
      } else {
        showMessage('error', 'Failed to check out: ' + result.message);
      }
    } catch (error) {
      console.error('Error checking out:', error);
      showMessage('error', 'Failed to check out');
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          Staff Scheduling
        </h1>
        <p style={{ fontSize: 16, color: '#64748b', margin: 0 }}>
          Schedule employees to jobs
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

      {/* Date Selector */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
          Select Date:
        </label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14
          }}
        />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #e2e8f0' }}>
        {['shifts', 'employees'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 24px',
              background: activeTab === tab ? 'white' : 'transparent',
              color: activeTab === tab ? '#3b82f6' : '#64748b',
              border: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
              borderBottom: activeTab === tab ? '2px solid white' : '2px solid #e2e8f0',
              borderRadius: '8px 8px 0 0',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: activeTab === tab ? -2 : 0
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Shifts Tab */}
      {activeTab === 'shifts' && (
        <div>
          {/* Create Shift Form */}
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            marginBottom: 24
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
              Schedule New Job
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <select
                value={shiftForm.employeeId}
                onChange={(e) => setShiftForm({ ...shiftForm, employeeId: e.target.value })}
                style={{ padding: '10px', border: '1px solid #d1d5db', borderRadius: 6 }}
              >
                <option value="">Select Employee</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
              <input
                type="time"
                value={shiftForm.startTime}
                onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                style={{ padding: '10px', border: '1px solid #d1d5db', borderRadius: 6 }}
              />
              <input
                type="time"
                value={shiftForm.endTime}
                onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                style={{ padding: '10px', border: '1px solid #d1d5db', borderRadius: 6 }}
              />
              <input
                placeholder="Job Address"
                value={shiftForm.address}
                onChange={(e) => setShiftForm({ ...shiftForm, address: e.target.value })}
                style={{ padding: '10px', border: '1px solid #d1d5db', borderRadius: 6 }}
              />
              <input
                placeholder="Job ID (optional)"
                value={shiftForm.jobId}
                onChange={(e) => setShiftForm({ ...shiftForm, jobId: e.target.value })}
                style={{ padding: '10px', border: '1px solid #d1d5db', borderRadius: 6 }}
              />
              <button
                onClick={handleCreateShift}
                style={{
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Schedule Job
              </button>
            </div>
          </div>

          {/* Shifts List */}
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: 12,
            border: '1px solid #e2e8f0'
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
              Scheduled Jobs for {selectedDate} ({shifts.length})
            </h3>
            {shifts.length === 0 ? (
              <p style={{ color: '#64748b' }}>No jobs scheduled for this date</p>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {shifts.map(shift => {
                  const employee = employees.find(e => e.id === shift.employeeId);
                  return (
                    <div
                      key={shift.id}
                      style={{
                        padding: '16px',
                        background: '#f8fafc',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>
                          {employee?.name || 'Unknown Employee'}
                        </div>
                        <div style={{ fontSize: 14, color: '#64748b' }}>
                          {shift.startTime} - {shift.endTime} · {shift.address}
                        </div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                          Status: <span style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: shift.status === 'completed' ? '#dcfce7' : 
                                       shift.status === 'in_progress' ? '#fef3c7' : '#e2e8f0',
                            color: shift.status === 'completed' ? '#166534' : 
                                   shift.status === 'in_progress' ? '#92400e' : '#64748b'
                          }}>
                            {shift.status}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {shift.status === 'scheduled' && (
                          <button
                            onClick={() => handleCheckIn(shift.id)}
                            style={{
                              padding: '8px 16px',
                              background: '#dcfce7',
                              color: '#166534',
                              border: '1px solid #bbf7d0',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Check In
                          </button>
                        )}
                        {shift.status === 'in_progress' && (
                          <button
                            onClick={() => handleCheckOut(shift.id)}
                            style={{
                              padding: '8px 16px',
                              background: '#dbeafe',
                              color: '#1e40af',
                              border: '1px solid #bfdbfe',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Check Out
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Employees Tab */}
      {activeTab === 'employees' && (
        <div>
          {/* Add Employee Button */}
          <div style={{ marginBottom: 24 }}>
            <button
              onClick={handleAddEmployee}
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
              + Add Employee
            </button>
          </div>

          {/* Employees List */}
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: 12,
            border: '1px solid #e2e8f0'
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
              Employees ({employees.length})
            </h3>
            {employees.length === 0 ? (
              <p style={{ color: '#64748b' }}>No employees added yet</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Name</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Email</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Phone</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Role</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(employee => (
                    <tr key={employee.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px', fontSize: 14, color: '#0f172a', fontWeight: 500 }}>{employee.name}</td>
                      <td style={{ padding: '12px', fontSize: 14, color: '#64748b' }}>{employee.email || '-'}</td>
                      <td style={{ padding: '12px', fontSize: 14, color: '#64748b' }}>{employee.phone || '-'}</td>
                      <td style={{ padding: '12px', fontSize: 14, color: '#64748b' }}>{employee.role || 'employee'}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: 4,
                          background: employee.status === 'active' ? '#dcfce7' : '#f1f5f9',
                          color: employee.status === 'active' ? '#166534' : '#64748b',
                          fontSize: 12,
                          fontWeight: 600
                        }}>
                          {employee.status || 'active'}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <button
                          onClick={() => handleEditEmployee(employee)}
                          style={{
                            padding: '6px 12px',
                            background: 'white',
                            color: '#0f172a',
                            border: '1px solid #d1d5db',
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            marginRight: 8
                          }}
                        >
                          Edit
                        </button>
                        {employee.status === 'active' && (
                          <button
                            onClick={() => handleDeleteEmployee(employee.id)}
                            style={{
                              padding: '6px 12px',
                              background: '#fef2f2',
                              color: '#991b1b',
                              border: '1px solid #fecaca',
                              borderRadius: 4,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Employee Modal */}
          {showEmployeeModal && (
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
                padding: '32px',
                borderRadius: 12,
                width: '100%',
                maxWidth: '500px',
                maxHeight: '90vh',
                overflowY: 'auto'
              }}>
                <h3 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 24 }}>
                  {editingEmployee ? 'Edit Employee' : 'Add Employee'}
                </h3>
                <div style={{ display: 'grid', gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
                      Name *
                    </label>
                    <input
                      type="text"
                      value={employeeForm.name}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 14
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
                      Email
                    </label>
                    <input
                      type="email"
                      value={employeeForm.email}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 14
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={employeeForm.phone}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 14
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
                      Role
                    </label>
                    <select
                      value={employeeForm.role}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, role: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 14
                      }}
                    >
                      <option value="employee">Employee</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="manager">Manager</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
                      Hourly Rate ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={employeeForm.hourlyRate}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, hourlyRate: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 14
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
                      Hire Date
                    </label>
                    <input
                      type="date"
                      value={employeeForm.hireDate}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, hireDate: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 14
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <button
                      onClick={handleSaveEmployee}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {editingEmployee ? 'Update' : 'Add'} Employee
                    </button>
                    <button
                      onClick={() => setShowEmployeeModal(false)}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: 'white',
                        color: '#64748b',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
