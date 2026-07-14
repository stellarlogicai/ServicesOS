// src/contexts/AuthContext.jsx
/**
 * Auth + Tenant Context
 *
 * Adds full multi-tenant awareness on top of your existing Firebase auth.
 *
 * FIRESTORE USER DOC STRUCTURE (users/{uid}):
 * {
 *   role:        'customer' | 'employee' | 'admin' | 'super-admin'
 *   tenantId:    'tenant_abc123'   ← null for super-admin (spans all tenants)
 *   email:       string
 *   displayName: string
 *   createdAt:   timestamp
 *   status:      'active' | 'suspended'
 * }
 *
 * FIRESTORE TENANT DOC (tenants/{tenantId}) — already handled by tenantService.js
 */

import { useContext, useState, useEffect, useCallback, useRef } from 'react';
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
import { completeUserOnboarding } from '../services/onboardingService';
import { AuthContext } from './AuthContextValue';
import { normalizeTenantId, resolveActiveTenantId } from './activeTenant';

// ─── Permission map ───────────────────────────────────────────────────────────
// Scoped per role. Super-admin gets everything.
const ROLE_PERMISSIONS = {
  customer: [
    'view_own_quotes',
    'create_quotes',
    'view_own_bookings',
    'upload_photos',
  ],
  employee: [
    'access_field_mode',
    'complete_jobs',
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
    'access_field_mode',
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
    'access_field_mode',
  ],
};

const RECOGNIZED_ROLES = new Set(['customer', 'employee', 'admin', 'super-admin']);
const DISABLED_STATUSES = new Set(['suspended', 'inactive', 'disabled']);
const PROFILE_NOT_CONFIGURED_MESSAGE = 'Your ServicesOS account profile is not configured. Contact your business administrator.';
const PROFILE_ACCESS_DENIED_MESSAGE = 'Your ServicesOS account is not active. Contact your business administrator.';
const PROFILE_ROLE_INVALID_MESSAGE = 'Your ServicesOS account role is not supported. Contact your business administrator.';
const EMPLOYEE_PROFILE_INVALID_MESSAGE = 'Your employee account is not fully configured. Contact your business administrator.';

function profileAccessError(profile) {
  if (!profile) return PROFILE_NOT_CONFIGURED_MESSAGE;
  if (!RECOGNIZED_ROLES.has(profile.role)) return PROFILE_ROLE_INVALID_MESSAGE;
  if (DISABLED_STATUSES.has(profile.status)) return PROFILE_ACCESS_DENIED_MESSAGE;
  if (profile.role === 'employee') {
    const tenantId = typeof profile.tenantId === 'string' ? profile.tenantId.trim() : '';
    if (profile.status !== 'active' || !tenantId) return EMPLOYEE_PROFILE_INVALID_MESSAGE;
  }
  return '';
}

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null);   // Firebase user
  const [userProfile, setUserProfile] = useState(null);   // Firestore user doc
  const [currentTenant, setCurrentTenant] = useState(null); // Full tenant object
  const [loading, setLoading]         = useState(true);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [accessError, setAccessError] = useState('');
  const tenantLoadRequestRef = useRef(0);

  // ── Load tenant helper ────────────────────────────────────────────────────
  const loadTenant = useCallback(async (tenantId, userRole) => {
    const requestId = ++tenantLoadRequestRef.current;
    const normalizedTenantId = normalizeTenantId(tenantId);

    // Invalidate the previous tenant before starting a switch so tenant-scoped
    // pages unmount instead of showing stale records while the next tenant loads.
    setCurrentTenant(null);
    clearCurrentTenantId();

    if (!normalizedTenantId) {
      setTenantLoading(false);
      return { success: true, tenant: null };
    }

    setTenantLoading(true);
    try {
      // Customers and employees need only tenantId scoping, not the full tenant document.
      // This also keeps tenant business/payment configuration out of employee context.
      if (userRole === 'customer' || userRole === 'employee') {
        if (requestId !== tenantLoadRequestRef.current) {
          return { success: false, error: 'Tenant selection changed.' };
        }
        setCurrentTenantId(normalizedTenantId);
        return { success: true, tenant: null };
      }

      const tenant = await getTenant(normalizedTenantId);
      if (requestId !== tenantLoadRequestRef.current) {
        return { success: false, error: 'Tenant selection changed.' };
      }
      if (normalizeTenantId(tenant?.id) !== normalizedTenantId) {
        throw new Error('Loaded tenant does not match the requested tenant.');
      }

      setCurrentTenant(tenant);
      setCurrentTenantId(normalizedTenantId);
      return { success: true, tenant };
    } catch (err) {
      if (requestId === tenantLoadRequestRef.current) {
        console.error('[Auth] Failed to load tenant:', err);
        setCurrentTenant(null);
        clearCurrentTenantId();
      }
      return { success: false, error: 'Tenant could not be loaded.' };
    } finally {
      if (requestId === tenantLoadRequestRef.current) {
        setTenantLoading(false);
      }
    }
  }, []);

  // ── Firebase auth state listener ──────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        tenantLoadRequestRef.current += 1;
        setUser(null);
        setUserProfile(null);
        setCurrentTenant(null);
        clearCurrentTenantId();
        setLoading(false);
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userSnap.exists()) {
          const profile = { uid: firebaseUser.uid, ...userSnap.data() };
          const deniedMessage = profileAccessError(profile);
          if (deniedMessage) {
            setAccessError(deniedMessage);
            setUser(null);
            setUserProfile(null);
            setCurrentTenant(null);
            setTenantLoading(false);
            clearCurrentTenantId();
            setLoading(false);
            await firebaseSignOut(auth);
            return;
          }

          setAccessError('');
          setUser(firebaseUser);
          setUserProfile(profile);

          // Load their tenant (super-admins may have tenantId = null)
          await loadTenant(profile.tenantId || null, profile.role);
        } else {
          setAccessError(PROFILE_NOT_CONFIGURED_MESSAGE);
          setUser(null);
          setUserProfile(null);
          setCurrentTenant(null);
          setTenantLoading(false);
          clearCurrentTenantId();
          setLoading(false);
          await firebaseSignOut(auth);
        }
      } catch (err) {
        console.error('[Auth] Error loading user profile:', err);
        setAccessError('ServicesOS could not verify your account profile. Please try again.');
        setUser(null);
        setUserProfile(null);
        setCurrentTenant(null);
        setTenantLoading(false);
        clearCurrentTenantId();
        try {
          await firebaseSignOut(auth);
        } catch (signOutError) {
          console.error('[Auth] Failed to end session after profile load error:', signOutError);
        }
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [loadTenant]);

  // ── Auth actions ──────────────────────────────────────────────────────────

  const login = async (email, password) => {
    try {
      setAccessError('');
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
    if (!tenantId) {
      return {
        success: false,
        error: 'A valid business invitation is required before creating an account.'
      };
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      // Write the user profile so onAuthStateChanged can load it
      await setDoc(doc(db, 'users', cred.user.uid), {
        email,
        role,
        tenantId,
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
      setAccessError('');
      const cred = await signInWithPopup(auth, googleProvider);
      const uid  = cred.user.uid;

      // Check if user doc exists; create it if not (first-time Google sign-in)
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (!userSnap.exists()) {
        if (!tenantId) {
          await firebaseSignOut(auth);
          return {
            success: false,
            error: 'A valid business invitation is required before creating an account.'
          };
        }

        await setDoc(doc(db, 'users', uid), {
          email: cred.user.email,
          displayName: cred.user.displayName || '',
          role: 'customer',
          tenantId,
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
      tenantLoadRequestRef.current += 1;
      setUser(null);
      setUserProfile(null);
      setCurrentTenant(null);
      setTenantLoading(false);
      setAccessError('');
      clearCurrentTenantId();
      setLoading(false);
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

  const completeOnboarding = async () => {
    if (!user?.uid) {
      throw new Error('Authenticated user is unavailable.');
    }

    await completeUserOnboarding(user.uid);
    setUserProfile(profile => ({
      ...profile,
      onboardingCompleted: true,
      onboardingProgress: 100
    }));
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
    return loadTenant(tenantId, 'super-admin');
  };

  // ── Role + permission helpers ─────────────────────────────────────────────

  const role = userProfile?.role || 'customer';
  const activeTenantId = resolveActiveTenantId({
    role,
    profileTenantId: userProfile?.tenantId,
    currentTenant,
  });

  const isAdmin      = () => role === 'admin' || role === 'super-admin';
  const isSuperAdmin = () => role === 'super-admin';
  const isCustomer   = () => role === 'customer';
  const isEmployee   = () => role === 'employee';
  const canAccessFieldMode = () => isEmployee() || isAdmin();
  const canAccessAdminArea = () => isAdmin();

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
      // Canonical tenant scope for every tenant-scoped read/write.
      activeTenantId,
      tenantId: activeTenantId,

      // Loading states
      loading,
      tenantLoading,
      accessError,

      // Auth actions
      login,
      signup,
      loginWithGoogle,
      logout,
      resetPassword,
      completeOnboarding,

      // Tenant actions
      switchTenant,        // super-admin only
      reloadTenant: () => loadTenant(activeTenantId, role),

      // Role helpers
      role,
      isAdmin,
      isSuperAdmin,
      isCustomer,
      isEmployee,

      // Permission helpers
      hasPermission,
      belongsToTenant,
      canAccessDashboard,
      canAccessFieldMode,
      canAccessAdminArea,
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
