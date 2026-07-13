// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../contexts/AuthContextValue';

vi.mock('../pages/Dashboard', () => ({
  default: () => <h1>Wife Beta Dashboard</h1>
}));

vi.mock('../AIPhotoEstimateSystem', () => ({
  default: () => <h1>Create Estimate Screen</h1>
}));

vi.mock('../components/CustomerManagement', () => ({
  default: () => <h1>Customers Screen</h1>
}));

vi.mock('../components/BookingsList', () => ({
  default: () => <h1>Bookings Screen</h1>
}));

vi.mock('../components/FieldMode', () => ({
  default: () => <h1>Field Mode Screen</h1>
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

vi.mock('../modules/growthAI/GrowthAIPage', () => ({
  default: () => (
    <main>
      <h1>GrowthAI — Marketing Helper</h1>
      <p>Placeholder/local generation only · Credits estimated, never deducted · No auto-posting · No real AI or image API call · super-admin only</p>
    </main>
  )
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
import { getStripeBookingCheckoutResult } from '../services/stripeCheckoutResult';

describe('App onboarding router context', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
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

  it('bypasses legacy onboarding for current ServicesOS beta', () => {
    render(<App />);

    // Legacy onboarding is disabled for beta - admin should land on Dashboard
    expect(screen.queryByRole('heading', { name: 'Welcome to CleanOps' })).not.toBeInTheDocument();
    expect(screen.queryByText('Step 1 of 7 • 14% Complete')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Wife Beta Dashboard' })).toBeInTheDocument();
  });

  it('skips onboarding for an admin whose tenant is complete', () => {
    authState.userProfile = { uid: 'admin-test', onboardingCompleted: true };

    render(<App />);

    expect(screen.queryByRole('heading', { name: 'Welcome to CleanOps' })).not.toBeInTheDocument();
    ['Dashboard', 'Create estimate', 'Customers', 'Bookings', 'Field Mode', 'Calendar', 'Business Settings'].forEach(label => {
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
      'AI training',
      'GrowthAI'
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

    fireEvent.click(screen.getByText('Field Mode'));

    expect(screen.getByRole('heading', { name: 'Field Mode Screen' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Calendar'));

    expect(screen.getByRole('heading', { name: 'Read-Only Calendar Screen' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Business Settings'));

    expect(screen.getByRole('heading', { name: 'Business Settings Screen' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(authState.logout).toHaveBeenCalledTimes(1);
  });

  it('uses the polished ServicesOS default identity when tenant branding is absent', () => {
    authState.currentTenant = { id: 'tenant-test', onboardingCompleted: true };
    authState.userProfile = { uid: 'admin-test', onboardingCompleted: true };

    render(<App />);

    expect(screen.getByText('ServicesOS')).toBeInTheDocument();
    expect(screen.getByText('Service operations')).toBeInTheDocument();
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
    expect(screen.getByRole('navigation')).toHaveStyle({ zIndex: '130' });
    ['Dashboard', 'Create estimate', 'Customers', 'Bookings', 'Field Mode', 'Calendar', 'Business Settings'].forEach(label => {
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
      '/tap-to-pay',
      '/growth-ai',
      '/growthai'
    ].forEach(path => {
      window.history.pushState({}, '', path);
      const { unmount } = render(<App />);

      ['Dashboard', 'Create estimate', 'Customers', 'Bookings', 'Field Mode', 'Calendar', 'Business Settings'].forEach(label => {
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
        'AI training',
        'GrowthAI'
      ].forEach(label => {
        expect(screen.queryByText(label)).not.toBeInTheDocument();
      });

      [
        'Customer Portal Screen',
        'Deferred Staff Scheduling Screen',
        'Deferred Route Optimization Screen',
        'Deferred Insurance Screen',
        'Deferred Data Export Screen',
        'Deferred Backup Screen',
        'Deferred Settings Screen',
        'Deferred AI Training Screen',
        'GrowthAI — Marketing Helper'
      ].forEach(heading => {
        expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument();
      });

      expect(screen.getByRole('heading', { name: 'Wife Beta Dashboard' })).toBeInTheDocument();

      unmount();
    });
  });

  it('keeps old payment links hidden from super-admin navigation while preserving other deferred routes', () => {
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
      'Field Mode',
      'Staff scheduling',
      'Route optimization',
      'Calendar',
      'Business Settings',
      'Insurance',
      'Data export',
      'Tenant management',
      'AI training',
      'GrowthAI',
      'Backup',
      'Settings'
    ].forEach(label => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    expect(screen.queryByText('Payment links')).not.toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Super Admin Tenant Management Screen' })).toBeInTheDocument();
  });

  it('allows super-admin to open GrowthAI while keeping the Phase 0 honesty banner visible', () => {
    authState.role = 'super-admin';
    authState.isSuperAdmin = () => true;
    authState.userProfile = { uid: 'super-admin-test', onboardingCompleted: true };
    authState.currentTenant = null;

    render(<App />);

    fireEvent.click(screen.getByText('GrowthAI'));

    expect(screen.getByRole('heading', { name: 'GrowthAI — Marketing Helper' })).toBeInTheDocument();
    expect(screen.getByText(/Placeholder\/local generation only/)).toBeInTheDocument();
    expect(screen.queryByText('Payment links')).not.toBeInTheDocument();
  });

  it('does not expose GrowthAI to customer users', () => {
    authState.role = 'customer';
    authState.isSuperAdmin = () => false;
    authState.userProfile = { uid: 'customer-test', onboardingCompleted: true };
    authState.currentTenant = {
      id: 'tenant-test',
      businessName: 'Test Cleaning Co.',
      onboardingCompleted: true
    };

    render(<App />);

    expect(screen.getByText('Customer portal')).toBeInTheDocument();
    expect(screen.queryByText('GrowthAI')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'GrowthAI — Marketing Helper' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Customer Portal Screen' })).toBeInTheDocument();
  });

  it('detects Stripe booking checkout return query states', () => {
    expect(getStripeBookingCheckoutResult('?stripe_booking_checkout=success&session_id=cs_test_123')).toBe('success');
    expect(getStripeBookingCheckoutResult('?stripe_booking_checkout=cancelled')).toBe('cancelled');
    expect(getStripeBookingCheckoutResult('?stripe_booking_checkout=canceled')).toBe('cancelled');
    expect(getStripeBookingCheckoutResult('?other=value')).toBeNull();
  });

  it('renders Stripe checkout success without entering the authenticated shell', () => {
    window.history.pushState({}, '', '/?stripe_booking_checkout=success&session_id=cs_test_123');

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Payment received. Thank you.' })).toBeInTheDocument();
    expect(screen.getByText('Payment confirmation may take a moment to appear for the business.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Wife Beta Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Customer Portal Screen' })).not.toBeInTheDocument();
  });

  it('renders Stripe checkout cancellation without entering the authenticated shell', () => {
    window.history.pushState({}, '', '/?stripe_booking_checkout=cancelled');

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Payment was cancelled.' })).toBeInTheDocument();
    expect(screen.getByText('You can close this page or contact the business.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Wife Beta Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Customer Portal Screen' })).not.toBeInTheDocument();
  });
});
