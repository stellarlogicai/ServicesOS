// src/contexts/AuthContext.jsx
/**
 * Auth + Tenant Context
 *
 * Adds full multi-tenant awareness on top of your existing Firebase auth.
 *
 * FIRESTORE USER DOC STRUCTURE (users/{uid}):
 * {
 *   role:        'customer' | 'admin' | 'super-admin'
 *   tenantId:    'tenant_abc123'   ← null for super-admin (spans all tenants)
 *   email:       string
 *   displayName: string
 *   createdAt:   timestamp
 *   status:      'active' | 'suspended'
 * }
 *
 * FIRESTORE TENANT DOC (tenants/{tenantId}) — already handled by tenantService.js
 */

import { useContext, useState, useEffect, useCallback } from 'react';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase';
import { setCurrentTenantId, clearCurrentTenantId } from '../services/multiTenantService';
import { getTenant } from '../services/tenantService';
import { AuthContext } from './AuthContextValue';

// ─── Permission map ───────────────────────────────────────────────────────────
// Scoped per role. Super-admin gets everything.
const ROLE_PERMISSIONS = {
  customer: [
    'view_own_quotes',
    'create_quotes',
    'view_own_bookings',
    'upload_photos',
  ],
  admin: [
    'view_own_quotes',
    'create_quotes',
    'view_own_bookings',
    'upload_photos',
    'view_all_leads',
    'manage_bookings',
    'view_analytics',
    'manage_staff',
    'complete_jobs',
    'send_quotes',
    'manage_settings',
  ],
  'super-admin': [
    // gets every permission, plus cross-tenant ones
    'view_own_quotes',
    'create_quotes',
    'view_own_bookings',
    'upload_photos',
    'view_all_leads',
    'manage_bookings',
    'view_analytics',
    'manage_staff',
    'complete_jobs',
    'send_quotes',
    'manage_settings',
    'manage_tenants',
    'switch_tenants',
    'view_all_tenants',
    'manage_subscriptions',
    'manage_users',
    'view_all_data',
  ],
};

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null);   // Firebase user
  const [userProfile, setUserProfile] = useState(null);   // Firestore user doc
  const [currentTenant, setCurrentTenant] = useState(null); // Full tenant object
  const [loading, setLoading]         = useState(true);
  const [tenantLoading, setTenantLoading] = useState(false);

  // ── Load tenant helper ────────────────────────────────────────────────────
  const loadTenant = useCallback(async (tenantId, userRole) => {
    if (!tenantId) {
      setCurrentTenant(null);
      clearCurrentTenantId();
      return;
    }

    setTenantLoading(true);
    try {
      // Customers only need tenantId for scoping, not the full tenant document
      // This avoids permission errors since customers are not in tenants/{tenantId}.users
      if (userRole === 'customer') {
        setCurrentTenantId(tenantId);
        setCurrentTenant(null); // Customers don't need full tenant object
      } else {
        const tenant = await getTenant(tenantId);
        setCurrentTenant(tenant);
        // Wire into multiTenantService so all data calls are scoped automatically
        setCurrentTenantId(tenantId);
      }
    } catch (err) {
      console.error('[Auth] Failed to load tenant:', err);
      setCurrentTenant(null);
    } finally {
      setTenantLoading(false);
    }
  }, []);

  // ── Firebase auth state listener ──────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setUserProfile(null);
        setCurrentTenant(null);
        clearCurrentTenantId();
        setLoading(false);
        return;
      }

      setUser(firebaseUser);

      try {
        const userSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userSnap.exists()) {
          const profile = { uid: firebaseUser.uid, ...userSnap.data() };
          setUserProfile(profile);

          // Suspended accounts get signed out immediately
          if (profile.status === 'suspended') {
            await firebaseSignOut(auth);
            return;
          }

          // Load their tenant (super-admins may have tenantId = null)
          await loadTenant(profile.tenantId || null, profile.role);
        } else {
          // User doc doesn't exist yet (e.g. first Google sign-in)
          setUserProfile({ uid: firebaseUser.uid, role: 'customer', tenantId: null });
        }
      } catch (err) {
        console.error('[Auth] Error loading user profile:', err);
        setUserProfile({ uid: firebaseUser.uid, role: 'customer', tenantId: null });
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [loadTenant]);

  // ── Auth actions ──────────────────────────────────────────────────────────

  const login = async (email, password) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return { success: true, user: cred.user };
    } catch (err) {
      return { success: false, error: _friendlyError(err.code) };
    }
  };

  /**
   * Sign up a new company admin.
   * Creates both the Firebase user and the Firestore user doc.
   *
   * @param {string} email
   * @param {string} password
   * @param {string} tenantId   — pass the tenantId after createTenant() resolves
   * @param {string} [role]     — defaults to 'admin'
   */
  const signup = async (email, password, tenantId, role = 'admin') => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      // Write the user profile so onAuthStateChanged can load it
      await setDoc(doc(db, 'users', cred.user.uid), {
        email,
        role,
        tenantId: tenantId || null,
        displayName: '',
        status: 'active',
        createdAt: serverTimestamp(),
      });

      return { success: true, user: cred.user };
    } catch (err) {
      return { success: false, error: _friendlyError(err.code) };
    }
  };

  const loginWithGoogle = async (tenantId = null) => {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const uid  = cred.user.uid;

      // Check if user doc exists; create it if not (first-time Google sign-in)
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (!userSnap.exists()) {
        await setDoc(doc(db, 'users', uid), {
          email: cred.user.email,
          displayName: cred.user.displayName || '',
          role: 'customer',
          tenantId: tenantId || null,
          status: 'active',
          createdAt: serverTimestamp(),
        });
      }

      return { success: true, user: cred.user };
    } catch (err) {
      return { success: false, error: _friendlyError(err.code) };
    }
  };

  const logout = async () => {
    try {
      await firebaseSignOut(auth);
      clearCurrentTenantId();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const resetPassword = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (err) {
      return { success: false, error: _friendlyError(err.code) };
    }
  };

  // ── Tenant switching (super-admin only) ───────────────────────────────────

  /**
   * Let a super-admin view/manage a specific tenant's data.
   * Pass null to go back to the global super-admin view.
   */
  const switchTenant = async (tenantId) => {
    if (!isSuperAdmin()) {
      console.warn('[Auth] switchTenant: only super-admins can switch tenants');
      return { success: false, error: 'Insufficient permissions' };
    }
    await loadTenant(tenantId);
    return { success: true };
  };

  // ── Role + permission helpers ─────────────────────────────────────────────

  const role = userProfile?.role || 'customer';

  const isAdmin      = () => role === 'admin' || role === 'super-admin';
  const isSuperAdmin = () => role === 'super-admin';
  const isCustomer   = () => role === 'customer';

  /**
   * Check a single permission string against the user's role.
   */
  const hasPermission = (permission) =>
    ROLE_PERMISSIONS[role]?.includes(permission) ?? false;

  /**
   * Check that the user belongs to the given tenantId
   * (super-admins always pass).
   */
  const belongsToTenant = (tenantId) =>
    isSuperAdmin() || userProfile?.tenantId === tenantId;

  /**
   * Convenience: true if the user can access ANY admin-level route.
   */
  const canAccessDashboard = () => isAdmin();

  // ── Tenant feature gating ─────────────────────────────────────────────────

  /**
   * Check if the current tenant's subscription includes a feature.
   * Falls back to false if tenant isn't loaded.
   */
  const tenantFeatureEnabled = (featureKey) => {
    if (!currentTenant) return false;
    // tenantService stores features under settings or via SUBSCRIPTION_TIERS
    return currentTenant.settings?.features?.[featureKey] ?? false;
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <AuthContext.Provider value={{
      // Firebase user
      user,
      // Full Firestore profile  { uid, role, tenantId, email, displayName, status }
      userProfile,
      // Current company tenant  (full tenantService doc)
      currentTenant,
      tenantId: userProfile?.tenantId || null,

      // Loading states
      loading,
      tenantLoading,

      // Auth actions
      login,
      signup,
      loginWithGoogle,
      logout,
      resetPassword,

      // Tenant actions
      switchTenant,        // super-admin only
      reloadTenant: () => loadTenant(userProfile?.tenantId, userProfile?.role),

      // Role helpers
      role,
      isAdmin,
      isSuperAdmin,
      isCustomer,

      // Permission helpers
      hasPermission,
      belongsToTenant,
      canAccessDashboard,
      tenantFeatureEnabled,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

// ─── Friendly Firebase error messages ────────────────────────────────────────
function _friendlyError(code) {
  const map = {
    'auth/user-not-found':       'No account found with that email.',
    'auth/wrong-password':       'Incorrect password.',
    'auth/email-already-in-use': 'An account with that email already exists.',
    'auth/weak-password':        'Password must be at least 6 characters.',
    'auth/invalid-email':        'Please enter a valid email address.',
    'auth/too-many-requests':    'Too many attempts. Please try again later.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return map[code] || 'An error occurred. Please try again.';
}
