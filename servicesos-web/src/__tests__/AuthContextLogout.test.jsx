// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { name: 'test-auth' },
  authStateChanged: null,
  clearCurrentTenantId: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  firebaseSignOut: vi.fn(),
  getDoc: vi.fn(),
  getTenant: vi.fn(),
  setCurrentTenantId: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: mocks.createUserWithEmailAndPassword,
  onAuthStateChanged: vi.fn((_auth, callback) => {
    mocks.authStateChanged = callback;
    return vi.fn();
  }),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: mocks.firebaseSignOut,
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...parts) => parts.join('/')),
  getDoc: mocks.getDoc,
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock('../firebase', () => ({
  auth: mocks.auth,
  db: { name: 'test-db' },
  googleProvider: {},
}));

vi.mock('../services/multiTenantService', () => ({
  clearCurrentTenantId: mocks.clearCurrentTenantId,
  setCurrentTenantId: mocks.setCurrentTenantId,
}));

vi.mock('../services/tenantService', () => ({
  getTenant: mocks.getTenant,
}));

vi.mock('../services/onboardingService', () => ({
  completeUserOnboarding: vi.fn(),
}));

import { AuthProvider, useAuth } from '../contexts/AuthContext';

function AuthStateProbe() {
  const { currentTenant, loading, logout, role, tenantId, user } = useAuth();

  if (loading) return <div>Loading auth</div>;
  if (!user) return <div>Login state</div>;

  return (
    <div>
      <div>Tenant dashboard: {currentTenant?.businessName}</div>
      <div>Profile role: {role}</div>
      <div>Tenant ID: {tenantId || 'none'}</div>
      <button onClick={logout}>Sign out</button>
    </div>
  );
}

function SignupGuardProbe() {
  const { loading, signup } = useAuth();
  if (loading) return <div>Loading auth</div>;
  return <button onClick={() => signup('customer@example.com', 'password', null, 'customer')}>Try orphan signup</button>;
}

describe('AuthContext logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authStateChanged = null;
    mocks.firebaseSignOut.mockResolvedValue(undefined);
    mocks.getDoc.mockResolvedValue({
      data: () => ({
        onboardingCompleted: true,
        role: 'admin',
        status: 'active',
        tenantId: 'tenant-a',
      }),
      exists: () => true,
    });
    mocks.getTenant.mockResolvedValue({
      businessName: 'Tenant A',
      id: 'tenant-a',
      onboardingCompleted: true,
    });
  });

  it('clears the authenticated tenant immediately after Firebase sign-out resolves', async () => {
    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>
    );

    await act(async () => {
      await mocks.authStateChanged({ email: 'owner@example.com', uid: 'admin-a' });
    });

    expect(await screen.findByText('Tenant dashboard: Tenant A')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(mocks.firebaseSignOut).toHaveBeenCalledWith(mocks.auth));
    expect(await screen.findByText('Login state')).toBeInTheDocument();
    expect(screen.queryByText('Tenant dashboard: Tenant A')).not.toBeInTheDocument();
    expect(mocks.clearCurrentTenantId).toHaveBeenCalled();
  });

  it('rejects signup without a tenant before creating a Firebase user', async () => {
    render(<AuthProvider><SignupGuardProbe /></AuthProvider>);
    await act(async () => {
      await mocks.authStateChanged(null);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Try orphan signup' }));
    await waitFor(() => expect(mocks.createUserWithEmailAndPassword).not.toHaveBeenCalled());
  });

  it('does not route an authenticated admin as customer when profile loading fails', async () => {
    mocks.getDoc.mockRejectedValueOnce(new Error('network unavailable'));

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>
    );

    await act(async () => {
      await mocks.authStateChanged({ email: 'owner@example.com', uid: 'admin-a' });
    });

    expect(mocks.firebaseSignOut).toHaveBeenCalledWith(mocks.auth);
    expect(await screen.findByText('Login state')).toBeInTheDocument();
    expect(screen.queryByText('Profile role: customer')).not.toBeInTheDocument();
    expect(screen.queryByText('Tenant dashboard: Tenant A')).not.toBeInTheDocument();
    expect(mocks.getTenant).not.toHaveBeenCalled();
    expect(mocks.clearCurrentTenantId).toHaveBeenCalled();
  });

  it('restores the correct admin profile on login after a transient profile failure', async () => {
    mocks.getDoc.mockRejectedValueOnce(new Error('network unavailable'));

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>
    );

    await act(async () => {
      await mocks.authStateChanged({ email: 'owner@example.com', uid: 'admin-a' });
    });
    expect(await screen.findByText('Login state')).toBeInTheDocument();

    await act(async () => {
      await mocks.authStateChanged({ email: 'owner@example.com', uid: 'admin-a' });
    });

    expect(await screen.findByText('Tenant dashboard: Tenant A')).toBeInTheDocument();
    expect(screen.getByText('Profile role: admin')).toBeInTheDocument();
    expect(screen.getByText('Tenant ID: tenant-a')).toBeInTheDocument();
    expect(screen.queryByText('Profile role: customer')).not.toBeInTheDocument();
  });

  it('preserves the intentional customer fallback only when the user document does not exist', async () => {
    mocks.getDoc.mockResolvedValueOnce({ exists: () => false });

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>
    );

    await act(async () => {
      await mocks.authStateChanged({ email: 'customer@example.com', uid: 'customer-new' });
    });

    expect(await screen.findByText('Profile role: customer')).toBeInTheDocument();
    expect(screen.getByText('Tenant ID: none')).toBeInTheDocument();
    expect(mocks.firebaseSignOut).not.toHaveBeenCalled();
  });
});
