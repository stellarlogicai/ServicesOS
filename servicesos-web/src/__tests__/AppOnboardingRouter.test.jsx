// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../contexts/AuthContextValue';

const authState = {
  user: { uid: 'admin-test', email: 'admin@example.com' },
  userProfile: { uid: 'admin-test', onboardingCompleted: false },
  role: 'admin',
  currentTenant: {
    id: 'tenant-test',
    businessName: 'Test Cleaning Co.',
    onboardingCompleted: false
  },
  loading: false,
  logout: vi.fn(),
  hasPermission: () => true,
  isSuperAdmin: () => false
};

vi.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }) => (
    <AuthContext.Provider value={authState}>{children}</AuthContext.Provider>
  ),
  useAuth: () => authState
}));

import App from '../App';

describe('App onboarding router context', () => {
  beforeEach(() => {
    authState.currentTenant = {
      id: 'tenant-test',
      businessName: 'Test Cleaning Co.',
      onboardingCompleted: false
    };
    authState.userProfile = { uid: 'admin-test', onboardingCompleted: false };
  });

  it('renders admin onboarding inside the app router', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Welcome to CleanOps' })).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 7 • 14% Complete')).toBeInTheDocument();
  });

  it('skips onboarding for an admin whose tenant is complete', () => {
    authState.userProfile = { uid: 'admin-test', onboardingCompleted: true };

    render(<App />);

    expect(screen.queryByRole('heading', { name: 'Welcome to CleanOps' })).not.toBeInTheDocument();
    [
      'New quote',
      'Dashboard',
      'Customers',
      'Customer portal',
      'Staff scheduling',
      'Route optimization',
      'Calendar',
      'Payment links',
      'Insurance',
      'Data export',
      'Backup',
      'Settings'
    ].forEach(label => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    expect(screen.queryByText('Tenant management')).not.toBeInTheDocument();
    expect(screen.queryByText('AI training')).not.toBeInTheDocument();
  });
});
