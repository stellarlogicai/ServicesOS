// src/components/EmployeeManagement.jsx
import { useState, useEffect, useCallback } from 'react';
import { getEmployees, createEmployee, updateEmployee, deleteEmployee } from '../core/employees/employeeService';

export default function EmployeeManagement({ tenantId }) {
  const [view, setView] = useState('directory'); // directory, profile, time-tracking, payroll
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    hourlyRate: '',
    role: 'cleaner',
    availability: 'full-time',
    status: 'active',
    homeAddress: '',
    serviceRadius: '25',
    maxDailyHours: '8',
    emergencyContact: '',
    emergencyPhone: '',
    startDate: ''
  });
  const [message, setMessage] = useState({ type: '', text: '' });

  const filteredEmployees = employees.filter(employee => {
    const matchesSearch = searchTerm === '' || 
      employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (employee.role && employee.role.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (employee.phone && employee.phone.includes(searchTerm));
    
    const matchesStatus = filterStatus === 'all' || employee.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  });

  const getQuickStats = () => {
    const activeToday = employees.filter(e => e.status === 'active').length;
    const total = employees.length;
    
    return {
      total,
      activeToday,
      clockedIn: 0, // Would need time tracking data
      openPTO: 0 // Would need PTO requests
    };
  };

  const handleViewProfile = (employee) => {
    setSelectedEmployee(employee);
    setView('profile');
  };

  const handleBackToDirectory = () => {
    setSelectedEmployee(null);
    setView('directory');
  };

  const loadEmployees = useCallback(async () => {
    if (!tenantId) return;

    try {
      setLoading(true);
      const result = await getEmployees(tenantId);
      if (result.success) {
        setEmployees(result.data);
      } else {
        console.error('Error loading employees:', result.message);
      }
    } catch (error) {
      console.error('Error loading employees:', error);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

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

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.hourlyRate) {
      showMessage('error', 'Name and hourly rate are required');
      return;
    }

    try {
      const employeeData = {
        ...formData,
        hourlyRate: parseFloat(formData.hourlyRate),
        serviceRadius: parseFloat(formData.serviceRadius),
        maxDailyHours: parseFloat(formData.maxDailyHours)
      };
      
      let result;
      if (editingEmployee) {
        result = await updateEmployee(tenantId, editingEmployee.id, employeeData);
        if (result.success) {
          showMessage('success', 'Employee updated successfully');
        } else {
          showMessage('error', 'Failed to update employee: ' + result.message);
        }
      } else {
        result = await createEmployee(tenantId, employeeData);
        if (result.success) {
          showMessage('success', 'Employee added successfully');
        } else {
          showMessage('error', 'Failed to add employee: ' + result.message);
        }
      }
      
      if (result.success) {
        setShowForm(false);
        setEditingEmployee(null);
        setFormData({
          name: '',
          phone: '',
          email: '',
          hourlyRate: '',
          role: 'cleaner',
          availability: 'full-time',
          status: 'active',
          homeAddress: '',
          serviceRadius: '25',
          maxDailyHours: '8',
          emergencyContact: '',
          emergencyPhone: '',
          startDate: ''
        });
        loadEmployees();
      }
    } catch (error) {
      console.error('Error saving employee:', error);
      showMessage('error', 'Failed to save employee');
    }
  };

  const handleEdit = (employee) => {
    setEditingEmployee(employee);
    setFormData({
      name: employee.name,
      phone: employee.phone || '',
      email: employee.email || '',
      hourlyRate: employee.hourlyRate,
      role: employee.role || 'cleaner',
      availability: employee.availability || 'full-time',
      status: employee.status || 'active',
      homeAddress: employee.homeAddress || '',
      serviceRadius: employee.serviceRadius?.toString() || '25',
      maxDailyHours: employee.maxDailyHours?.toString() || '8',
      emergencyContact: employee.emergencyContact || '',
      emergencyPhone: employee.emergencyPhone || '',
      startDate: employee.startDate || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (employeeId) => {
    if (!window.confirm('Are you sure you want to delete this employee?')) return;

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

  const handleCancel = () => {
    setShowForm(false);
    setEditingEmployee(null);
    setFormData({
      name: '',
      phone: '',
      email: '',
      hourlyRate: '',
      role: 'cleaner',
      availability: 'full-time',
      status: 'active',
      homeAddress: '',
      serviceRadius: '25',
      maxDailyHours: '8',
      emergencyContact: '',
      emergencyPhone: '',
      startDate: ''
    });
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#64748b' }}>Loading employees...</div>
      </div>
    );
  }

  const stats = getQuickStats();

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      {view === 'directory' && (
        <>
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
              Employees ({stats.total})
            </h1>
            <p style={{ fontSize: 16, color: '#64748b', margin: 0 }}>
              Manage your cleaning team
            </p>
          </div>

          {/* Quick Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            <div style={{
              padding: 20,
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              borderRadius: 12,
              color: 'white'
            }}>
              <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 4 }}>Total Employees</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.total}</div>
            </div>
            <div style={{
              padding: 20,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              borderRadius: 12,
              color: 'white'
            }}>
              <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 4 }}>Active Today</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.activeToday}</div>
            </div>
            <div style={{
              padding: 20,
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              borderRadius: 12,
              color: 'white'
            }}>
              <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 4 }}>Clocked In</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.clockedIn}</div>
            </div>
            <div style={{
              padding: 20,
              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
              borderRadius: 12,
              color: 'white'
            }}>
              <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 4 }}>Open PTO Requests</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.openPTO}</div>
            </div>
          </div>

          {/* Search and Filter */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
            <input
              type="text"
              placeholder="Search by name, role, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                padding: '12px 16px',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: 14
              }}
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{
                padding: '12px 16px',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: 14
              }}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button
              onClick={() => setShowForm(true)}
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
              Add Employee
            </button>
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

          {/* Employees List */}
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: 12,
            border: '1px solid #e2e8f0'
          }}>
            {filteredEmployees.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                No employees found. Click "Add Employee" to get started.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                {filteredEmployees.map(employee => (
                  <div
                    key={employee.id}
                    style={{
                      padding: '20px',
                      background: '#f9fafb',
                      borderRadius: 12,
                      border: '1px solid #e5e7eb',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <div style={{
                          width: 48,
                          height: 48,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 20,
                          fontWeight: 700
                        }}>
                          {employee.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>
                            {employee.name}
                          </div>
                          <div style={{ fontSize: 14, color: '#64748b' }}>
                            {employee.role || 'Cleaner'}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: '#64748b', marginLeft: 60 }}>
                        {employee.phone && `${employee.phone} • `}
                        ${employee.hourlyRate}/hr • {employee.availability}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{
                        padding: '6px 12px',
                        borderRadius: 12,
                        background: employee.status === 'active' ? '#f0fdf4' : '#fef2f2',
                        color: employee.status === 'active' ? '#166534' : '#991b1b',
                        fontSize: 12,
                        fontWeight: 600
                      }}>
                        {employee.status}
                      </span>
                      <button
                        onClick={() => handleViewProfile(employee)}
                        style={{
                          padding: '8px 16px',
                          background: '#6366f1',
                          color: 'white',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleEdit(employee)}
                        style={{
                          padding: '8px 16px',
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(employee.id)}
                        style={{
                          padding: '8px 16px',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {view === 'profile' && selectedEmployee && (
        <div>
          <button
            onClick={handleBackToDirectory}
            style={{
              padding: '8px 16px',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              marginBottom: 16,
              cursor: 'pointer'
            }}
          >
            ← Back to Directory
          </button>
          <div style={{
            background: 'white',
            padding: 32,
            borderRadius: 12,
            border: '1px solid #e2e8f0'
          }}>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0f172a', marginBottom: 24 }}>
              {selectedEmployee.name}
            </h1>
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>Role</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>
                  {selectedEmployee.role || 'Cleaner'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>Phone</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>
                  {selectedEmployee.phone || 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>Email</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>
                  {selectedEmployee.email || 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>Hourly Rate</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>
                  ${selectedEmployee.hourlyRate}/hr
                </div>
              </div>
              <div>
                <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>Status</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>
                  {selectedEmployee.status}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Employee Form Modal */}
      {showForm && (
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
            maxWidth: 500,
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 24 }}>
              {editingEmployee ? 'Edit Employee' : 'Add Employee'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                    Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="John Smith"
                    required
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
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="417-555-1234"
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
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="john@example.com"
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
                    Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #d1d5db',
                      borderRadius: 6
                    }}
                  >
                    <option value="cleaner">Cleaner</option>
                    <option value="crew-lead">Crew Lead</option>
                    <option value="manager">Manager</option>
                    <option value="dispatcher">Dispatcher</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                    Hourly Rate ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.hourlyRate}
                    onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                    placeholder="15.00"
                    required
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
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
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
                    Emergency Contact
                  </label>
                  <input
                    type="text"
                    value={formData.emergencyContact}
                    onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                    placeholder="Jane Smith"
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
                    Emergency Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.emergencyPhone}
                    onChange={(e) => setFormData({ ...formData, emergencyPhone: e.target.value })}
                    placeholder="417-555-9999"
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
                    Availability
                  </label>
                  <select
                    value={formData.availability}
                    onChange={(e) => setFormData({ ...formData, availability: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #d1d5db',
                      borderRadius: 6
                    }}
                  >
                    <option value="full-time">Full-time</option>
                    <option value="part-time">Part-time</option>
                    <option value="weekends">Weekends only</option>
                    <option value="flexible">Flexible</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #d1d5db',
                      borderRadius: 6
                    }}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                    Home Address
                  </label>
                  <input
                    type="text"
                    value={formData.homeAddress}
                    onChange={(e) => setFormData({ ...formData, homeAddress: e.target.value })}
                    placeholder="123 Main St, City, State"
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
                    Service Radius (miles)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="100"
                    value={formData.serviceRadius}
                    onChange={(e) => setFormData({ ...formData, serviceRadius: e.target.value })}
                    placeholder="25"
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
                    Max Daily Hours
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="12"
                    value={formData.maxDailyHours}
                    onChange={(e) => setFormData({ ...formData, maxDailyHours: e.target.value })}
                    placeholder="8"
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #d1d5db',
                      borderRadius: 6
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleCancel}
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
                  type="submit"
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
                  {editingEmployee ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Employees List */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: 12,
        border: '1px solid #e2e8f0'
      }}>
        {employees.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
            No employees yet. Click "Add Employee" to get started.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {employees.map(employee => (
              <div
                key={employee.id}
                style={{
                  padding: '16px',
                  background: '#f9fafb',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>
                    {employee.name}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                    {employee.phone && `${employee.phone} • `}
                    ${employee.hourlyRate}/hr • {employee.availability}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleEdit(employee)}
                    style={{
                      padding: '8px 16px',
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(employee.id)}
                    style={{
                      padding: '8px 16px',
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
