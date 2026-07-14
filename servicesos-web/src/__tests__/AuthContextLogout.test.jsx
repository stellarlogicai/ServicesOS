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
  const {
    accessError,
    canAccessAdminArea,
    canAccessFieldMode,
    currentTenant,
    isEmployee,
    loading,
    logout,
    role,
    tenantId,
    user,
  } = useAuth();

  if (loading) return <div>Loading auth</div>;
  if (!user) return <div>Login state{accessError ? `: ${accessError}` : ''}</div>;

  return (
    <div>
      <div>Tenant dashboard: {currentTenant?.businessName}</div>
      <div>Profile role: {role}</div>
      <div>Tenant ID: {tenantId || 'none'}</div>
      <div>Employee role: {isEmployee() ? 'yes' : 'no'}</div>
      <div>Field Mode access: {canAccessFieldMode() ? 'yes' : 'no'}</div>
      <div>Admin area access: {canAccessAdminArea() ? 'yes' : 'no'}</div>
      <button onClick={logout}>Sign out</button>
    </div>
  );
}

function SignupGuardProbe() {
  const { loading, signup } = useAuth();
  if (loading) return <div>Loading auth</div>;
  return <button onClick={() => signup('customer@example.com', 'password', null, 'customer')}>Try orphan signup</button>;
}

function TenantSwitchProbe() {
  const { currentTenant, switchTenant, tenantId, tenantLoading } = useAuth();
  return (
    <div>
      <div>Selected tenant: {currentTenant?.businessName || 'none'}</div>
      <div>Active tenant ID: {tenantId || 'none'}</div>
      <div>Tenant loading: {tenantLoading ? 'yes' : 'no'}</div>
      <button type="button" onClick={() => switchTenant('tenant-a')}>Select Tenant A</button>
      <button type="button" onClick={() => switchTenant('tenant-b')}>Select Tenant B</button>
      <button type="button" onClick={() => switchTenant('DEFAULT')}>Select invalid tenant</button>
    </div>
  );
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
    expect(await screen.findByText(/^Login state/)).toBeInTheDocument();
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
    expect(await screen.findByText(/^Login state/)).toBeInTheDocument();
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
    expect(await screen.findByText(/^Login state/)).toBeInTheDocument();

    await act(async () => {
      await mocks.authStateChanged({ email: 'owner@example.com', uid: 'admin-a' });
    });

    expect(await screen.findByText('Tenant dashboard: Tenant A')).toBeInTheDocument();
    expect(screen.getByText('Profile role: admin')).toBeInTheDocument();
    expect(screen.getByText('Tenant ID: tenant-a')).toBeInTheDocument();
    expect(screen.queryByText('Profile role: customer')).not.toBeInTheDocument();
  });

  it('denies a signed-in user whose canonical profile does not exist', async () => {
    mocks.getDoc.mockResolvedValueOnce({ exists: () => false });

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>
    );

    await act(async () => {
      await mocks.authStateChanged({ email: 'customer@example.com', uid: 'customer-new' });
    });

    expect(await screen.findByText(/account profile is not configured/i)).toBeInTheDocument();
    expect(screen.queryByText('Profile role: customer')).not.toBeInTheDocument();
    expect(mocks.firebaseSignOut).toHaveBeenCalledWith(mocks.auth);
  });

  it('accepts an active tenant employee without loading the full tenant document', async () => {
    mocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ role: 'employee', status: 'active', tenantId: 'tenant-a' }),
    });

    render(<AuthProvider><AuthStateProbe /></AuthProvider>);
    await act(async () => {
      await mocks.authStateChanged({ email: 'employee@example.com', uid: 'employee-a' });
    });

    expect(await screen.findByText('Profile role: employee')).toBeInTheDocument();
    expect(screen.getByText('Tenant ID: tenant-a')).toBeInTheDocument();
    expect(screen.getByText('Employee role: yes')).toBeInTheDocument();
    expect(screen.getByText('Field Mode access: yes')).toBeInTheDocument();
    expect(screen.getByText('Admin area access: no')).toBeInTheDocument();
    expect(mocks.setCurrentTenantId).toHaveBeenCalledWith('tenant-a');
    expect(mocks.getTenant).not.toHaveBeenCalled();
  });

  it.each([
    ['missing status', { role: 'employee', tenantId: 'tenant-a' }],
    ['missing tenant', { role: 'employee', status: 'active', tenantId: '' }],
    ['inactive status', { role: 'employee', status: 'inactive', tenantId: 'tenant-a' }],
    ['disabled status', { role: 'employee', status: 'disabled', tenantId: 'tenant-a' }],
    ['suspended status', { role: 'employee', status: 'suspended', tenantId: 'tenant-a' }],
  ])('denies an employee profile with %s', async (_label, profile) => {
    mocks.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => profile });

    render(<AuthProvider><AuthStateProbe /></AuthProvider>);
    await act(async () => {
      await mocks.authStateChanged({ email: 'employee@example.com', uid: 'employee-a' });
    });

    expect(await screen.findByText(/Login state:/)).toBeInTheDocument();
    expect(screen.queryByText('Profile role: employee')).not.toBeInTheDocument();
    expect(mocks.firebaseSignOut).toHaveBeenCalledWith(mocks.auth);
    expect(mocks.getTenant).not.toHaveBeenCalled();
  });

  it('denies an unknown role instead of reinterpreting it', async () => {
    mocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ role: 'contractor', status: 'active', tenantId: 'tenant-a' }),
    });

    render(<AuthProvider><AuthStateProbe /></AuthProvider>);
    await act(async () => {
      await mocks.authStateChanged({ email: 'contractor@example.com', uid: 'contractor-a' });
    });

    expect(await screen.findByText(/account role is not supported/i)).toBeInTheDocument();
    expect(mocks.firebaseSignOut).toHaveBeenCalledWith(mocks.auth);
    expect(mocks.getTenant).not.toHaveBeenCalled();
  });

  it('preserves a legacy customer profile without a status field', async () => {
    mocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ role: 'customer', tenantId: 'tenant-a' }),
    });

    render(<AuthProvider><AuthStateProbe /></AuthProvider>);
    await act(async () => {
      await mocks.authStateChanged({ email: 'customer@example.com', uid: 'customer-a' });
    });

    expect(await screen.findByText('Profile role: customer')).toBeInTheDocument();
    expect(screen.getByText('Field Mode access: no')).toBeInTheDocument();
    expect(mocks.getTenant).not.toHaveBeenCalled();
  });

  it('propagates an explicit super-admin tenant selection and rejects DEFAULT without a read', async () => {
    mocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ role: 'super-admin', status: 'active', tenantId: null }),
    });
    mocks.getTenant.mockImplementation(async tenantId => ({
      id: tenantId,
      businessName: tenantId === 'tenant-a' ? 'Tenant A' : 'Tenant B',
    }));

    render(<AuthProvider><TenantSwitchProbe /></AuthProvider>);
    await act(async () => {
      await mocks.authStateChanged({ email: 'super@example.com', uid: 'super-a' });
    });

    expect(await screen.findByText('Active tenant ID: none')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Select Tenant A' }));
    expect(await screen.findByText('Active tenant ID: tenant-a')).toBeInTheDocument();
    expect(screen.getByText('Selected tenant: Tenant A')).toBeInTheDocument();
    expect(mocks.setCurrentTenantId).toHaveBeenLastCalledWith('tenant-a');

    const readsBeforeInvalidSelection = mocks.getTenant.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Select invalid tenant' }));
    expect(await screen.findByText('Active tenant ID: none')).toBeInTheDocument();
    expect(mocks.getTenant).toHaveBeenCalledTimes(readsBeforeInvalidSelection);
  });

  it.each([
    ['admin', { role: 'admin', status: 'active', tenantId: 'tenant-a' }],
    ['employee', { role: 'employee', status: 'active', tenantId: 'tenant-a' }],
    ['customer', { role: 'customer', status: 'active', tenantId: 'tenant-a' }],
  ])('does not allow a normal %s to switch away from the profile tenant', async (_label, profile) => {
    mocks.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => profile });

    render(<AuthProvider><TenantSwitchProbe /></AuthProvider>);
    await act(async () => {
      await mocks.authStateChanged({ email: `${profile.role}@example.com`, uid: `${profile.role}-a` });
    });

    expect(await screen.findByText('Active tenant ID: tenant-a')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Select Tenant B' }));
    expect(screen.getByText('Active tenant ID: tenant-a')).toBeInTheDocument();
    expect(mocks.getTenant).not.toHaveBeenCalledWith('tenant-b');
  });

  it('ignores a late tenant load after a newer super-admin selection completes', async () => {
    mocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ role: 'super-admin', status: 'active', tenantId: null }),
    });
    let resolveTenantA;
    mocks.getTenant.mockImplementation(tenantId => {
      if (tenantId === 'tenant-a') {
        return new Promise(resolve => { resolveTenantA = resolve; });
      }
      return Promise.resolve({ id: 'tenant-b', businessName: 'Tenant B' });
    });

    render(<AuthProvider><TenantSwitchProbe /></AuthProvider>);
    await act(async () => {
      await mocks.authStateChanged({ email: 'super@example.com', uid: 'super-a' });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select Tenant A' }));
    await waitFor(() => expect(mocks.getTenant).toHaveBeenCalledWith('tenant-a'));
    fireEvent.click(screen.getByRole('button', { name: 'Select Tenant B' }));

    expect(await screen.findByText('Active tenant ID: tenant-b')).toBeInTheDocument();
    expect(screen.getByText('Selected tenant: Tenant B')).toBeInTheDocument();

    await act(async () => {
      resolveTenantA({ id: 'tenant-a', businessName: 'Tenant A' });
    });
    expect(screen.getByText('Active tenant ID: tenant-b')).toBeInTheDocument();
    expect(screen.queryByText('Selected tenant: Tenant A')).not.toBeInTheDocument();
  });
});
