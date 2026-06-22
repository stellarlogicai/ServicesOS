// src/components/CRMDashboard.jsx
import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, orderBy, limit, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

export default function CRMDashboard({ tenantId }) {
  const [metrics, setMetrics] = useState({
    newLeads: 0,
    scheduled: 0,
    completed: 0,
    revenue: 0
  });
  const [recentLeads, setRecentLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadDashboardData = useCallback(async () => {
    if (!tenantId) return;

    try {
      setLoading(true);
      
      // Get leads collection
      const leadsRef = collection(db, 'tenants', tenantId, 'leads');
      
      // Count by status
      const newLeadsQuery = query(leadsRef, where('status', '==', 'new'));
      const newLeadsSnapshot = await getDocs(newLeadsQuery);
      
      const scheduledQuery = query(leadsRef, where('status', '==', 'scheduled'));
      const scheduledSnapshot = await getDocs(scheduledQuery);
      
      const completedQuery = query(leadsRef, where('status', '==', 'completed'));
      const completedSnapshot = await getDocs(completedQuery);
      
      // Calculate revenue from completed jobs
      let totalRevenue = 0;
      completedSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.finalPrice) {
          totalRevenue += data.finalPrice;
        } else if (data.estimate?.priceHigh) {
          totalRevenue += data.estimate.priceHigh;
        }
      });
      
      // Get recent leads
      const recentQuery = query(
        leadsRef,
        orderBy('createdAt', 'desc'),
        limit(5)
      );
      const recentSnapshot = await getDocs(recentQuery);
      const recentLeadsData = recentSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setMetrics({
        newLeads: newLeadsSnapshot.size,
        scheduled: scheduledSnapshot.size,
        completed: completedSnapshot.size,
        revenue: totalRevenue
      });
      
      setRecentLeads(recentLeadsData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    let isActive = true;

    Promise.resolve().then(() => {
      if (isActive) {
        loadDashboardData();
      }
    });

    return () => {
      isActive = false;
    };
  }, [loadDashboardData]);

  const getStatusColor = (status) => {
    const colors = {
      new: '#3b82f6',
      estimate_sent: '#f59e0b',
      follow_up: '#8b5cf6',
      scheduled: '#10b981',
      completed: '#6b7280',
      paid: '#059669'
    };
    return colors[status] || '#6b7280';
  };

  const updateLeadStatus = async (leadId, newStatus) => {
    try {
      await updateDoc(doc(db, 'tenants', tenantId, 'leads', leadId), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      loadDashboardData(); // Refresh data
    } catch (error) {
      console.error('Error updating lead status:', error);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#64748b' }}>Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          CRM Dashboard
        </h1>
        <p style={{ fontSize: 16, color: '#64748b', margin: 0 }}>
          Track leads, jobs, and revenue
        </p>
      </div>

      {/* Metrics Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
        gap: 24, 
        marginBottom: 32 
      }}>
        <MetricCard
          title="New Leads"
          value={metrics.newLeads}
          color="#3b82f6"
          icon="📋"
        />
        <MetricCard
          title="Scheduled"
          value={metrics.scheduled}
          color="#10b981"
          icon="📅"
        />
        <MetricCard
          title="Completed"
          value={metrics.completed}
          color="#6b7280"
          icon="✅"
        />
        <MetricCard
          title="Revenue"
          value={formatCurrency(metrics.revenue)}
          color="#059669"
          icon="💰"
        />
      </div>

      {/* Recent Leads */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: 12,
        border: '1px solid #e2e8f0'
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
          Recent Leads
        </h3>
        
        {recentLeads.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
            No leads yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recentLeads.map(lead => (
              <div
                key={lead.id}
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
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                    {lead.customer?.name || 'Unknown'}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b' }}>
                    {lead.customer?.address || 'No address'}
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                  <select
                    value={lead.status || 'new'}
                    onChange={(e) => updateLeadStatus(lead.id, e.target.value)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'white',
                      background: getStatusColor(lead.status),
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="new">NEW</option>
                    <option value="estimate_sent">ESTIMATE SENT</option>
                    <option value="follow_up">FOLLOW UP</option>
                    <option value="scheduled">SCHEDULED</option>
                    <option value="completed">COMPLETED</option>
                    <option value="paid">PAID</option>
                  </select>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {lead.estimate?.priceLow && lead.estimate?.priceHigh
                      ? `${formatCurrency(lead.estimate.priceLow)} - ${formatCurrency(lead.estimate.priceHigh)}`
                      : 'No estimate'
                    }
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

function MetricCard({ title, value, color, icon }) {
  return (
    <div style={{
      background: 'white',
      padding: '24px',
      borderRadius: 12,
      border: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 32 }}>{icon}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>
          {title}
        </div>
      </div>
      <div style={{ fontSize: 36, fontWeight: 700, color }}>
        {value}
      </div>
    </div>
  );
}
