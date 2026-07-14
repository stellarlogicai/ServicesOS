// src/components/TenantManagement.jsx
import { useState, useEffect, useCallback } from 'react';
import {
  createTenant,
  cancelTenantSubscription,
  getTenantSubscription,
  updateTenantSubscription
} from '../services/tenantService';
import { loadV1SmokeTenants } from '../services/v1SmokeEmulatorService';
import { useAuth } from '../contexts/AuthContext';

export default function TenantManagement() {
  const { switchTenant } = useAuth();
  const [activeTab, setActiveTab] = useState('list');
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });

  // New tenant form
  const [tenantForm, setTenantForm] = useState({
    name: '',
    contactEmail: '',
    contactPhone: '',
    subscriptionTier: 'free'
  });

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const loadTenants = useCallback(async () => {
    try {
      const smokeTenants = await loadV1SmokeTenants({
        enabled: import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true',
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID
      });

      if (smokeTenants) {
        setTenants(smokeTenants);
        return;
      }

      // In production, query Firebase for all tenants
      // For now, use placeholder data
      const storedTenants = JSON.parse(localStorage.getItem('saas_tenants') || '[]');
      setTenants(storedTenants);
    } catch (error) {
      console.error('Error loading tenants:', error);
      showMessage('error', 'Failed to load tenants');
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    Promise.resolve().then(() => {
      if (isActive) {
        loadTenants();
      }
    });

    return () => {
      isActive = false;
    };
  }, [loadTenants]);

  const handleCreateTenant = async () => {
    if (!tenantForm.name || !tenantForm.contactEmail) {
      showMessage('error', 'Name and contact email are required');
      return;
    }

    try {
      const newTenant = await createTenant({
        businessName: tenantForm.name,
        businessEmail: tenantForm.contactEmail,
        businessPhone: tenantForm.contactPhone,
        subscriptionTier: tenantForm.subscriptionTier
      });

      const updatedTenants = [...tenants, newTenant];
      setTenants(updatedTenants);
      localStorage.setItem('saas_tenants', JSON.stringify(updatedTenants));

      setTenantForm({
        name: '',
        contactEmail: '',
        contactPhone: '',
        subscriptionTier: 'free'
      });

      showMessage('success', 'Tenant created successfully');
      setActiveTab('list');
    } catch (error) {
      console.error('Error creating tenant:', error);
      showMessage('error', error.message || 'Failed to create tenant');
    }
  };

  const handleDeleteTenant = (tenantId) => {
    if (window.confirm('Are you sure you want to delete this tenant? This will delete all their data.')) {
      const updatedTenants = tenants.filter(t => t.id !== tenantId);
      setTenants(updatedTenants);
      localStorage.setItem('saas_tenants', JSON.stringify(updatedTenants));
      showMessage('success', 'Tenant deleted');
    }
  };

  const handleSelectTenant = async (tenant) => {
    // Use the AuthContext's switchTenant function to properly set the current tenant
    const result = await switchTenant(tenant.id);
    if (!result?.success) {
      showMessage('error', result?.error || 'Tenant could not be selected');
      return;
    }
    setSelectedTenant(tenant);
    showMessage('success', `Selected ${tenant.businessName}`);
  };

  const handleViewTenant = async (tenant) => {
    try {
      const subscription = await getTenantSubscription(tenant.id);
      setSelectedTenant({ ...tenant, subscription });
      setActiveTab('details');
    } catch (error) {
      console.error('Error loading subscription:', error);
      setSelectedTenant(tenant);
      setActiveTab('details');
    }
  };

  const handleUpgradeSubscription = async (tier) => {
    if (!selectedTenant) return;

    try {
      // Call the update subscription function
      const updatedTenant = await updateTenantSubscription(selectedTenant.id, tier);
      
      if (updatedTenant.checkoutUrl) {
        // Redirect to Stripe checkout
        window.location.href = updatedTenant.checkoutUrl;
      } else {
        // Update local state with the updated tenant data
        setSelectedTenant(updatedTenant);
        
        // Also update the tenant in the tenants list
        const updatedTenants = tenants.map(t => 
          t.id === updatedTenant.id ? updatedTenant : t
        );
        setTenants(updatedTenants);
        localStorage.setItem('saas_tenants', JSON.stringify(updatedTenants));
        
        showMessage('success', 'Subscription updated successfully');
      }
    } catch (error) {
      console.error('Error upgrading subscription:', error);
      showMessage('error', error.message || 'Failed to upgrade subscription');
    }
  };

  const handleCancelSubscription = async () => {
    if (!selectedTenant) return;

    if (!window.confirm('Are you sure you want to cancel this subscription? This will take effect at the end of the billing period.')) {
      return;
    }

    try {
      await cancelTenantSubscription(selectedTenant.id);
      showMessage('success', 'Subscription cancelled successfully');
      handleViewTenant(selectedTenant);
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      showMessage('error', error.message || 'Failed to cancel subscription');
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          Tenant Management
        </h1>
        <p style={{ fontSize: 16, color: '#64748b', margin: 0 }}>
          Manage tenants and their subscription tiers
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #e2e8f0' }}>
        {['list', 'create'].map(tab => (
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

      {/* List Tab */}
      {activeTab === 'list' && (
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: 12,
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', margin: 0 }}>
              All Tenants ({tenants.length})
            </h3>
            <button
              onClick={() => setActiveTab('create')}
              style={{
                padding: '10px 20px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              + New Tenant
            </button>
          </div>

          {tenants.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🏢</div>
              <p>No tenants yet</p>
              <p style={{ fontSize: 14 }}>Create your first tenant to get started</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {tenants.map(tenant => (
                <div
                  key={tenant.id}
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
                      {tenant.businessName || 'No Business Name'}
                    </div>
                    <div style={{ fontSize: 14, color: '#64748b' }}>
                      {tenant.subscriptionTier || 'free'} tier · {tenant.businessEmail || 'No Email'}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                      Created: {(() => {
                        if (!tenant.createdAt) return 'N/A';
                        try {
                          // Handle Firestore Timestamp object
                          if (typeof tenant.createdAt === 'object' && tenant.createdAt.toDate) {
                            return tenant.createdAt.toDate().toLocaleDateString();
                          }
                          // Handle serialized Firestore timestamp (seconds/nanoseconds)
                          if (typeof tenant.createdAt === 'object' && tenant.createdAt.seconds) {
                            return new Date(tenant.createdAt.seconds * 1000).toLocaleDateString();
                          }
                          // Handle string or number timestamp
                          return new Date(tenant.createdAt).toLocaleDateString();
                        } catch {
                          return 'Invalid Date';
                        }
                      })()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleSelectTenant(tenant)}
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
                      Select
                    </button>
                    <button
                      onClick={() => handleViewTenant(tenant)}
                      style={{
                        padding: '8px 16px',
                        background: 'white',
                        color: '#0f172a',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Manage
                    </button>
                    <button
                      onClick={() => handleDeleteTenant(tenant.id)}
                      style={{
                        padding: '8px 16px',
                        background: '#fef2f2',
                        color: '#991b1b',
                        border: '1px solid #fecaca',
                        borderRadius: 6,
                        fontSize: 12,
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
      )}

      {/* Create Tab */}
      {activeTab === 'create' && (
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: 12,
          border: '1px solid #e2e8f0'
        }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
            Create New Tenant
          </h3>
          <div style={{ display: 'grid', gap: 16, maxWidth: 600 }}>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                Company Name *
              </label>
              <input
                type="text"
                value={tenantForm.name}
                onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })}
                placeholder="e.g., ABC Cleaning Services"
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
                Contact Email *
              </label>
              <input
                type="email"
                value={tenantForm.contactEmail}
                onChange={(e) => setTenantForm({ ...tenantForm, contactEmail: e.target.value })}
                placeholder="admin@example.com"
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
                Contact Phone
              </label>
              <input
                type="tel"
                value={tenantForm.contactPhone}
                onChange={(e) => setTenantForm({ ...tenantForm, contactPhone: e.target.value })}
                placeholder="(555) 123-4567"
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
                Subscription Tier
              </label>
              <select
                value={tenantForm.subscriptionTier}
                onChange={(e) => setTenantForm({ ...tenantForm, subscriptionTier: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6
                }}
              >
                <option value="free">Free ($0 + 3% fee)</option>
                <option value="pro">Pro ($99/mo + 1% fee)</option>
                <option value="enterprise">Enterprise ($299/mo + 0.5% fee)</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button
                onClick={handleCreateTenant}
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
                Create Tenant
              </button>
              <button
                onClick={() => setActiveTab('list')}
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
            </div>
          </div>
        </div>
      )}

      {/* Tenant Details Modal */}
      {selectedTenant && activeTab === 'details' && (
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
            maxWidth: 600,
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Tenant Details
              </h3>
              <button
                onClick={() => {
                  setSelectedTenant(null);
                  setActiveTab('list');
                }}
                style={{
                  padding: '8px 16px',
                  background: '#f1f5f9',
                  color: '#64748b',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gap: 16, marginBottom: 24 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>
                  Business Name
                </label>
                <div style={{ fontSize: 16, color: '#0f172a' }}>{selectedTenant.businessName || 'N/A'}</div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>
                  Business Email
                </label>
                <div style={{ fontSize: 16, color: '#0f172a' }}>{selectedTenant.businessEmail || 'N/A'}</div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>
                  Business Phone
                </label>
                <div style={{ fontSize: 16, color: '#0f172a' }}>{selectedTenant.businessPhone || 'N/A'}</div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>
                  Business Address
                </label>
                <div style={{ fontSize: 16, color: '#0f172a' }}>{selectedTenant.businessAddress || 'N/A'}</div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>
                  Subscription Tier
                </label>
                <div style={{ fontSize: 16, color: '#0f172a', fontWeight: 600 }}>
                  {selectedTenant.subscriptionTier || 'free'}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>
                  Status
                </label>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: 4,
                  background: selectedTenant.status === 'active' ? '#dcfce7' : '#fef3c7',
                  color: selectedTenant.status === 'active' ? '#166534' : '#92400e',
                  fontSize: 14,
                  fontWeight: 600
                }}>
                  {selectedTenant.status || 'active'}
                </span>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>
                  Created
                </label>
                <div style={{ fontSize: 14, color: '#64748b' }}>
                  {selectedTenant.createdAt ? 
                    (selectedTenant.createdAt.toDate ? selectedTenant.createdAt.toDate().toLocaleString() : new Date(selectedTenant.createdAt).toLocaleString()) 
                    : 'N/A'}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, display: 'block' }}>
                  Last Updated
                </label>
                <div style={{ fontSize: 14, color: '#64748b' }}>
                  {selectedTenant.updatedAt ? 
                    (selectedTenant.updatedAt.toDate ? selectedTenant.updatedAt.toDate().toLocaleString() : new Date(selectedTenant.updatedAt).toLocaleString()) 
                    : 'N/A'}
                </div>
              </div>
            </div>

            {/* Subscription Management */}
            <div style={{
              padding: '16px',
              background: '#f8fafc',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              marginBottom: 24
            }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: '0 0 12px' }}>
                Subscription Management
              </h4>
              <div style={{ display: 'grid', gap: 8 }}>
                <button
                  onClick={() => handleUpgradeSubscription('free')}
                  disabled={selectedTenant.subscriptionTier === 'free'}
                  style={{
                    padding: '10px 16px',
                    background: selectedTenant.subscriptionTier === 'free' ? '#e2e8f0' : 'white',
                    color: selectedTenant.subscriptionTier === 'free' ? '#94a3b8' : '#0f172a',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: selectedTenant.subscriptionTier === 'free' ? 'not-allowed' : 'pointer'
                  }}
                >
                  Free Tier (No monthly fee + 2% transaction fee + 2.9% card fee)
                </button>
                <button
                  onClick={() => handleUpgradeSubscription('pro')}
                  disabled={selectedTenant.subscriptionTier === 'pro'}
                  style={{
                    padding: '10px 16px',
                    background: selectedTenant.subscriptionTier === 'pro' ? '#e2e8f0' : 'white',
                    color: selectedTenant.subscriptionTier === 'pro' ? '#94a3b8' : '#0f172a',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: selectedTenant.subscriptionTier === 'pro' ? 'not-allowed' : 'pointer'
                  }}
                >
                  Pro Tier ($99/mo + 1% transaction fee + 2.5% card fee)
                </button>
                <button
                  onClick={() => handleUpgradeSubscription('enterprise')}
                  disabled={selectedTenant.subscriptionTier === 'enterprise'}
                  style={{
                    padding: '10px 16px',
                    background: selectedTenant.subscriptionTier === 'enterprise' ? '#e2e8f0' : 'white',
                    color: selectedTenant.subscriptionTier === 'enterprise' ? '#94a3b8' : '#0f172a',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: selectedTenant.subscriptionTier === 'enterprise' ? 'not-allowed' : 'pointer'
                  }}
                >
                  Enterprise Tier ($299/mo + 0.5% transaction fee + 2.2% card fee)
                </button>
                {selectedTenant.subscriptionTier !== 'free' && (
                  <button
                    onClick={handleCancelSubscription}
                    style={{
                      padding: '10px 16px',
                      background: '#fef2f2',
                      color: '#991b1b',
                      border: '1px solid #fecaca',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel Subscription
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => {
                  setSelectedTenant(null);
                  setActiveTab('list');
                }}
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
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
