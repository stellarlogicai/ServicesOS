// src/components/CustomerManagement.jsx
import { useState, useEffect, useCallback } from 'react';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer } from '../core/customers/customerService';
import { useAuth } from '../contexts/AuthContext';

const DUPLICATE_CUSTOMER_MESSAGE = 'Possible duplicate customer found. A customer with this email or phone already exists. Please review the existing customer before creating another record.';

export default function CustomerManagement() {
  const { currentTenant } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    notes: ''
  });

  // Load customers
  const loadCustomers = useCallback(async () => {
    if (!currentTenant?.id) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setLoadError('');
    try {
      const result = await getCustomers(currentTenant.id);
      if (result.success) {
        setCustomers(result.data);
      } else {
        setCustomers([]);
        setLoadError(result.message || 'Unable to load customers.');
      }
    } catch (error) {
      console.error('Error loading customers:', error);
      setCustomers([]);
      setLoadError('Unable to load customers. Check your access and try again.');
    } finally {
      setLoading(false);
    }
  }, [currentTenant]);

  useEffect(() => {
    let isActive = true;

    Promise.resolve().then(() => {
      if (isActive) {
        loadCustomers();
      }
    });

    return () => {
      isActive = false;
    };
  }, [loadCustomers]);

  const handleInputChange = (e) => {
    setFormError('');
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!currentTenant?.id) {
      alert('No tenant selected');
      return;
    }

    const duplicate = findDuplicateCustomer(customers, formData, editingCustomer?.id);
    if (duplicate) {
      setFormError(DUPLICATE_CUSTOMER_MESSAGE);
      return;
    }

    try {
      let result;
      setSaving(true);
      
      if (editingCustomer) {
        // Update existing customer
        result = await updateCustomer(currentTenant.id, editingCustomer.id, formData);
      } else {
        // Create new customer
        result = await createCustomer(currentTenant.id, formData);
      }
      
      if (result.success) {
        setShowModal(false);
        setEditingCustomer(null);
        setFormError('');
        setFormData({
          name: '', email: '', phone: '', address: '',
          city: '', state: '', zip: '', notes: ''
        });
        loadCustomers();
      } else {
        alert('Error saving customer: ' + result.message);
      }
    } catch (error) {
      console.error('Error saving customer:', error);
      alert('Error saving customer: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setFormError('');
    setFormData({
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      city: customer.city || '',
      state: customer.state || '',
      zip: customer.zip || '',
      notes: customer.notes || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (customerId) => {
    if (!currentTenant?.id) return;

    try {
      const result = await deleteCustomer(currentTenant.id, customerId);
      if (result.success) {
        loadCustomers();
      } else {
        alert(result.message || 'Customer deletion is currently unavailable.');
      }
    } catch (error) {
      console.error('Error deleting customer:', error);
      alert('Error deleting customer: ' + error.message);
    }
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

  const filteredCustomers = customers.filter(customer => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      customer.name?.toLowerCase().includes(searchLower) ||
      customer.email?.toLowerCase().includes(searchLower) ||
      customer.phone?.includes(searchTerm) ||
      customer.address?.toLowerCase().includes(searchLower) ||
      customer.city?.toLowerCase().includes(searchLower) ||
      customer.state?.toLowerCase().includes(searchLower) ||
      customer.zip?.includes(searchTerm)
    );
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ color: '#64748b' }}>Loading customers...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!currentTenant?.id) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div style={{ textAlign: 'center', padding: '32px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏢</div>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>No Tenant Selected</h2>
          <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
            As a super-admin, you need to select a tenant to manage customers.
          </p>
          <p style={{ fontSize: '14px', color: '#64748b' }}>
            Go to Tenant Management to select a tenant, or switch to an admin account.
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" style={{ maxWidth: '720px', margin: '48px auto', padding: '24px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '20px', color: '#991b1b' }}>Customers could not be loaded</h2>
        <p style={{ margin: '0 0 16px', color: '#7f1d1d' }}>{loadError}</p>
        <button
          onClick={loadCustomers}
          style={{ padding: '10px 16px', background: '#b91c1c', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', margin: 0 }}>
          Customer Management
        </h1>
        <button
          onClick={() => {
            setEditingCustomer(null);
            setFormError('');
            setFormData({
              name: '', email: '', phone: '', address: '',
              city: '', state: '', zip: '', notes: ''
            });
            setShowModal(true);
          }}
          style={{
            padding: '10px 20px',
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}
        >
          + Add Customer
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '24px' }}>
        <input
          type="text"
          placeholder="Search customers by name, email, or phone..."
          value={searchTerm}
          onChange={handleSearch}
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            fontSize: '14px',
            outline: 'none',
            transition: 'border-color 0.2s'
          }}
          onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
          onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
        />
      </div>

      {/* Customer List */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        {filteredCustomers.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
            <div style={{ fontSize: '16px', marginBottom: '8px' }}>No customers found</div>
            <div style={{ fontSize: '14px' }}>Add your first customer to get started</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5' }}>Name</th>
                <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5' }}>Email</th>
                <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5' }}>Phone</th>
                <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5' }}>Address</th>
                <th style={{ padding: '16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map(customer => (
                <tr key={customer.id} style={{ borderBottom: '1px solid #f1f5f9', '&:hover': { background: '#f8fafc' } }}>
                  <td style={{ padding: '16px', fontSize: '14px', fontWeight: '500', color: '#1e293b' }}>
                    {customer.name}
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#64748b' }}>
                    {customer.email}
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#64748b' }}>
                    {customer.phone}
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px', color: '#64748b' }}>
                    {customer.address && (
                      <>
                        {customer.address}
                        {customer.city && `, ${customer.city}`}
                        {customer.state && `, ${customer.state}`}
                        {customer.zip && ` ${customer.zip}`}
                      </>
                    )}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    <button
                      onClick={() => handleEdit(customer)}
                      style={{
                        padding: '6px 12px',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        marginRight: '8px'
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(customer.id)}
                      style={{
                        padding: '6px 12px',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '32px', maxWidth: '500px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '24px' }}>
              {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
            </h2>
            
            <form onSubmit={handleSubmit}>
              {formError && (
                <div role="alert" style={{ marginBottom: '16px', padding: '12px', border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', borderRadius: '8px', fontSize: '14px' }}>
                  <div>{formError}</div>
                  {findDuplicateCustomer(customers, formData, editingCustomer?.id) && (
                    <div style={{ marginTop: '8px' }}>
                      Existing customer: {findDuplicateCustomer(customers, formData, editingCustomer?.id).name || 'Unnamed customer'}
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                  Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                  Address
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                    City
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                    State
                  </label>
                  <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleInputChange}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                  ZIP Code
                </label>
                <input
                  type="text"
                  name="zip"
                  value={formData.zip}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '14px',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingCustomer(null);
                    setFormError('');
                    setFormData({
                      name: '', email: '', phone: '', address: '',
                      city: '', state: '', zip: '', notes: ''
                    });
                  }}
                  style={{
                    padding: '10px 20px',
                    background: '#e2e8f0',
                    color: '#475569',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '10px 20px',
                    background: saving ? '#93c5fd' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                >
                  {saving ? 'Saving...' : editingCustomer ? 'Update Customer' : 'Add Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeCustomerEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeCustomerPhone(value) {
  if (typeof value !== 'string') return '';
  const digits = value.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function findDuplicateCustomer(customers, proposedCustomer, currentCustomerId) {
  const proposedEmail = normalizeCustomerEmail(proposedCustomer?.email);
  const proposedPhone = normalizeCustomerPhone(proposedCustomer?.phone);

  if (!proposedEmail && !proposedPhone) return null;

  return customers.find(customer => {
    if (!customer || customer.id === currentCustomerId) return false;

    const existingEmail = normalizeCustomerEmail(customer.email);
    const existingPhone = normalizeCustomerPhone(customer.phone);

    return (
      (proposedEmail && existingEmail && proposedEmail === existingEmail) ||
      (proposedPhone && existingPhone && proposedPhone === existingPhone)
    );
  }) || null;
}
