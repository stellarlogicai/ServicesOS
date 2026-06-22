// src/components/ProtectedRoute.jsx
/**
 * Route guard that checks auth, role, permissions, and tenant access.
 *
 * Usage examples:
 *
 *   // Any logged-in user
 *   <ProtectedRoute><Dashboard /></ProtectedRoute>
 *
 *   // Admin or super-admin only
 *   <ProtectedRoute requireAdmin><AdminPanel /></ProtectedRoute>
 *
 *   // Super-admin only
 *   <ProtectedRoute requireSuperAdmin><TenantManager /></ProtectedRoute>
 *
 *   // Specific permission
 *   <ProtectedRoute requirePermission="manage_bookings"><Bookings /></ProtectedRoute>
 *
 *   // Specific tenant (e.g. customer portal scoped to their company)
 *   <ProtectedRoute requireTenant={tenantId}><CustomerPortal /></ProtectedRoute>
 *
 *   // Feature flag from subscription tier
 *   <ProtectedRoute requireFeature="advancedAnalytics"><AnalyticsPage /></ProtectedRoute>
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({
  children,

  // Minimum role gates
  requireAdmin      = false,
  requireSuperAdmin = false,

  // Fine-grained permission gate (from ROLE_PERMISSIONS map)
  requirePermission = null,

  // Tenant isolation — user must belong to this tenantId
  requireTenant     = null,

  // Subscription feature flag
  requireFeature    = null,

  // Where to redirect on auth failure (default: login page)
  redirectTo        = '/login',

  // Custom "no access" component instead of redirect
  fallback          = null,
}) {
  const {
    user,
    loading,
    tenantLoading,
    isAdmin,
    isSuperAdmin,
    hasPermission,
    belongsToTenant,
    tenantFeatureEnabled,
  } = useAuth();

  const location = useLocation();

  // ── Wait for Firebase to resolve ─────────────────────────────────────────
  if (loading || tenantLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        color: '#6b7280',
        fontSize: 14,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 32,
            height: 32,
            border: '3px solid #e5e7eb',
            borderTopColor: '#1d4ed8',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 12px',
          }} />
          Loading…
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ── Not logged in ─────────────────────────────────────────────────────────
  if (!user) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // ── Super-admin gate ──────────────────────────────────────────────────────
  if (requireSuperAdmin && !isSuperAdmin()) {
    return fallback ?? <AccessDenied reason="Super-admin access required." />;
  }

  // ── Admin gate ────────────────────────────────────────────────────────────
  if (requireAdmin && !isAdmin()) {
    return fallback ?? <AccessDenied reason="Admin access required." />;
  }

  // ── Permission gate ───────────────────────────────────────────────────────
  if (requirePermission && !hasPermission(requirePermission)) {
    return fallback ?? <AccessDenied reason={`Missing permission: ${requirePermission}`} />;
  }

  // ── Tenant isolation gate ─────────────────────────────────────────────────
  if (requireTenant && !belongsToTenant(requireTenant)) {
    return fallback ?? <AccessDenied reason="You don't have access to this company's data." />;
  }

  // ── Feature flag gate ─────────────────────────────────────────────────────
  if (requireFeature && !tenantFeatureEnabled(requireFeature)) {
    return fallback ?? <UpgradeRequired feature={requireFeature} />;
  }

  // ── All checks passed ─────────────────────────────────────────────────────
  return children;
}

// ─── Access denied fallback UI ────────────────────────────────────────────────
function AccessDenied({ reason }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      fontFamily: 'system-ui, sans-serif',
      padding: 24,
    }}>
      <div style={{
        textAlign: 'center',
        maxWidth: 360,
        padding: '40px 32px',
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 16,
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: '0 0 8px' }}>
          Access denied
        </h2>
        <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px', lineHeight: 1.6 }}>
          {reason}
        </p>
        <button
          onClick={() => window.history.back()}
          style={{
            padding: '10px 24px',
            background: '#1d4ed8',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Go back
        </button>
      </div>
    </div>
  );
}

// ─── Feature upgrade prompt ───────────────────────────────────────────────────
function UpgradeRequired({ feature }) {
  const featureLabels = {
    advancedAnalytics:   'Advanced Analytics',
    aiPhotoAnalysis:     'AI Photo Analysis',
    smsNotifications:    'SMS Notifications',
    customerPortal:      'Customer Portal',
    multiLocation:       'Multi-Location',
    staffScheduling:     'Staff Scheduling',
    stripePayments:      'Online Payments',
    customBranding:      'Custom Branding',
    franchiseManagement: 'Franchise Management',
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      fontFamily: 'system-ui, sans-serif',
      padding: 24,
    }}>
      <div style={{
        textAlign: 'center',
        maxWidth: 380,
        padding: '40px 32px',
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 16,
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚡</div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: '0 0 8px' }}>
          Upgrade required
        </h2>
        <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 6px', lineHeight: 1.6 }}>
          <strong>{featureLabels[feature] || feature}</strong> is not included in your current plan.
        </p>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 24px' }}>
          Upgrade your subscription to unlock this feature.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            onClick={() => window.history.back()}
            style={{ padding: '10px 20px', background: 'transparent', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
          >
            Go back
          </button>
          <button
            onClick={() => window.location.href = '/settings/billing'}
            style={{ padding: '10px 20px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
          >
            View plans
          </button>
        </div>
      </div>
    </div>
  );
}
