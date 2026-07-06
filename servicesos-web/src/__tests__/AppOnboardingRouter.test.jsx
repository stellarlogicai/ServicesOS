// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../contexts/AuthContextValue';

vi.mock('../pages/Dashboard', () => ({
  default: () => <h1>Wife Beta Dashboard</h1>
}));

vi.mock('../AIPhotoEstimateSystem', () => ({
  default: ({ enablePayments }) => (
    <>
      <h1>Create Estimate Screen</h1>
      {enablePayments && <button>Proceed to Payment</button>}
    </>
  )
}));

vi.mock('../components/CustomerManagement', () => ({
  default: () => <h1>Customers Screen</h1>
}));

vi.mock('../components/BookingsList', () => ({
  default: () => <h1>Bookings Screen</h1>
}));

vi.mock('../components/StaffScheduling', () => ({
  default: () => <h1>Deferred Staff Scheduling Screen</h1>
}));

vi.mock('../components/RouteOptimization', () => ({
  default: () => <h1>Deferred Route Optimization Screen</h1>
}));

vi.mock('../components/CalendarView', () => ({
  default: () => <h1>Read-Only Calendar Screen</h1>
}));

vi.mock('../components/PaymentLinks', () => ({
  default: () => <h1>Deferred Payment Links Screen</h1>
}));

vi.mock('../components/InsuranceTracking', () => ({
  default: () => <h1>Deferred Insurance Screen</h1>
}));

vi.mock('../components/DataExport', () => ({
  default: () => <h1>Deferred Data Export Screen</h1>
}));

vi.mock('../components/TenantManagement', () => ({
  default: () => <h1>Super Admin Tenant Management Screen</h1>
}));

vi.mock('../components/AIModelTraining', () => ({
  default: () => <h1>Deferred AI Training Screen</h1>
}));

vi.mock('../components/BackupPanel', () => ({
  default: () => <h1>Deferred Backup Screen</h1>
}));

vi.mock('../components/CompanySettings', () => ({
  default: () => <h1>Deferred Settings Screen</h1>
}));

vi.mock('../components/BusinessSettings', () => ({
  default: () => <h1>Business Settings Screen</h1>
}));

vi.mock('../components/CustomerPortal', () => ({
  default: () => <h1>Customer Portal Screen</h1>
}));

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
    authState.logout.mockReset();
    authState.logout.mockResolvedValue({ success: true });
    authState.role = 'admin';
    authState.hasPermission = () => true;
    authState.isSuperAdmin = () => false;
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
    ['Dashboard', 'Create estimate', 'Customers', 'Bookings', 'Calendar', 'Business Settings'].forEach(label => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    [
      'Customer portal',
      'Staff scheduling',
      'Route optimization',
      'Payment links',
      'Insurance',
      'Data export',
      'Backup',
      'Settings',
      'Tenant management',
      'AI training'
    ].forEach(label => {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Wife Beta Dashboard' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Customers'));

    expect(screen.getByRole('heading', { name: 'Customers Screen' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Create estimate'));

    expect(screen.getByRole('heading', { name: 'Create Estimate Screen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Proceed to Payment' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Bookings'));

    expect(screen.getByRole('heading', { name: 'Bookings Screen' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Calendar'));

    expect(screen.getByRole('heading', { name: 'Read-Only Calendar Screen' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Business Settings'));

    expect(screen.getByRole('heading', { name: 'Business Settings Screen' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(authState.logout).toHaveBeenCalledTimes(1);
  });

  it('keeps the mobile menu toggle accessible and limited to approved admin navigation', () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 });
    authState.userProfile = { uid: 'admin-test', onboardingCompleted: true };

    const { unmount } = render(<App />);
    const menuToggle = screen.getByRole('button', { name: 'Open navigation menu' });

    expect(menuToggle).toHaveClass('mobile-menu-toggle');
    expect(menuToggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(menuToggle);

    expect(screen.getByRole('button', { name: 'Close navigation menu' })).toHaveAttribute('aria-expanded', 'true');
    ['Dashboard', 'Create estimate', 'Customers', 'Bookings', 'Calendar', 'Business Settings'].forEach(label => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Payment links')).not.toBeInTheDocument();

    unmount();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  });

  it('does not expose deferred wife-beta modules to a completed normal admin through nav or direct paths', () => {
    authState.userProfile = { uid: 'admin-test', onboardingCompleted: true };

    [
      '/settings',
      '/payments',
      '/payment-links',
      '/stripe',
      '/scheduling',
      '/schedule',
      '/staff-scheduling',
      '/customer-portal',
      '/insurance',
      '/data-export',
      '/backup',
      '/route-optimization',
      '/payroll',
      '/training',
      '/tap-to-pay'
    ].forEach(path => {
      window.history.pushState({}, '', path);
      const { unmount } = render(<App />);

      ['Dashboard', 'Create estimate', 'Customers', 'Bookings', 'Calendar', 'Business Settings'].forEach(label => {
        expect(screen.getByText(label)).toBeInTheDocument();
      });

      [
        'Customer portal',
        'Staff scheduling',
        'Route optimization',
        'Payment links',
        'Insurance',
        'Data export',
        'Backup',
        'Settings',
        'Tenant management',
        'AI training'
      ].forEach(label => {
        expect(screen.queryByText(label)).not.toBeInTheDocument();
      });

      [
        'Customer Portal Screen',
        'Deferred Staff Scheduling Screen',
        'Deferred Route Optimization Screen',
        'Deferred Payment Links Screen',
        'Deferred Insurance Screen',
        'Deferred Data Export Screen',
        'Deferred Backup Screen',
        'Deferred Settings Screen',
        'Deferred AI Training Screen'
      ].forEach(heading => {
        expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument();
      });

      expect(screen.getByRole('heading', { name: 'Wife Beta Dashboard' })).toBeInTheDocument();

      unmount();
    });
  });

  it('keeps existing super-admin nav visibility unchanged', () => {
    authState.role = 'super-admin';
    authState.isSuperAdmin = () => true;
    authState.userProfile = { uid: 'super-admin-test', onboardingCompleted: true };
    authState.currentTenant = null;

    render(<App />);

    [
      'Dashboard',
      'Create estimate',
      'Customers',
      'Bookings',
      'Staff scheduling',
      'Route optimization',
      'Calendar',
      'Business Settings',
      'Payment links',
      'Insurance',
      'Data export',
      'Tenant management',
      'AI training',
      'Backup',
      'Settings'
    ].forEach(label => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: 'Super Admin Tenant Management Screen' })).toBeInTheDocument();
  });
});
