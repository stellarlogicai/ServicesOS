// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../contexts/AuthContextValue';

const repeatWorkflowMocks = vi.hoisted(() => ({
  selectedCustomer: null,
  estimateProps: null,
}));

vi.mock('../pages/Dashboard', () => ({
  default: () => <h1>Wife Beta Dashboard</h1>
}));

vi.mock('../AIPhotoEstimateSystem', () => ({
  default: ({ initialCustomerPrefill, existingCustomerContext }) => {
    repeatWorkflowMocks.estimateProps = { initialCustomerPrefill, existingCustomerContext };
    return (
      <section>
        <h1>Create Estimate Screen</h1>
        <p data-testid="estimate-prefill-name">{initialCustomerPrefill?.firstName || 'No customer prefill'}</p>
        <p data-testid="estimate-prefill-address">{initialCustomerPrefill?.address || 'No customer address'}</p>
        <p data-testid="estimate-prefill-context">{existingCustomerContext?.tenantId || 'No customer context'}</p>
      </section>
    );
  }
}));

vi.mock('../components/CustomerManagement', () => ({
  default: ({ onCreateEstimate }) => (
    <section>
      <h1>Customers Screen</h1>
      <button type="button" onClick={() => onCreateEstimate?.(repeatWorkflowMocks.selectedCustomer)}>
        Create repeat-customer estimate
      </button>
    </section>
  )
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
  default: () => <h1>Data Export Screen</h1>
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
      <h1>GrowthAI Draft Workspace</h1>
      <p>Deterministic content only. Human review is required. Approval does not send or publish anything.</p>
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
  tenantId: 'tenant-test',
  tenantLoading: false,
  loading: false,
  logout: vi.fn(),
  hasPermission: () => true,
  isSuperAdmin: () => false,
  isEmployee: () => false
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
    authState.isEmployee = () => false;
    authState.isSuperAdmin = () => false;
    authState.currentTenant = {
      id: 'tenant-test',
      businessName: 'Test Cleaning Co.',
      onboardingCompleted: false
    };
    authState.tenantId = 'tenant-test';
    authState.tenantLoading = false;
    authState.userProfile = { uid: 'admin-test', onboardingCompleted: false };
    repeatWorkflowMocks.selectedCustomer = {
      id: 'customer-a',
      name: 'Tenant A Customer',
      firstName: 'Tenant',
      lastName: 'A Customer',
      email: 'tenant-a@example.test',
      phone: '555-0101',
      address: '110 Example Lane',
      city: 'Test City',
      state: 'TX',
      zip: '00000',
    };
    repeatWorkflowMocks.estimateProps = null;
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
    ['Dashboard', 'Create estimate', 'Customers', 'Bookings', 'Field Mode', 'Calendar', 'Business Settings', 'Data export', 'GrowthAI'].forEach(label => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    [
      'Customer portal',
      'Staff scheduling',
      'Route optimization',
      'Payment links',
      'Insurance',
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

    fireEvent.click(screen.getByText('Field Mode'));

    expect(screen.getByRole('heading', { name: 'Field Mode Screen' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Calendar'));

    expect(screen.getByRole('heading', { name: 'Read-Only Calendar Screen' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Business Settings'));

    expect(screen.getByRole('heading', { name: 'Business Settings Screen' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Data export'));

    expect(screen.getByRole('heading', { name: 'Data Export Screen' })).toBeInTheDocument();

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
    ['Dashboard', 'Create estimate', 'Customers', 'Bookings', 'Field Mode', 'Calendar', 'Business Settings', 'Data export', 'GrowthAI'].forEach(label => {
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
      '/backup',
      '/route-optimization',
      '/payroll',
      '/training',
      '/tap-to-pay'
    ].forEach(path => {
      window.history.pushState({}, '', path);
      const { unmount } = render(<App />);

      ['Dashboard', 'Create estimate', 'Customers', 'Bookings', 'Field Mode', 'Calendar', 'Business Settings', 'Data export', 'GrowthAI'].forEach(label => {
        expect(screen.getByText(label)).toBeInTheDocument();
      });

      [
        'Customer portal',
        'Staff scheduling',
        'Route optimization',
        'Payment links',
        'Insurance',
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
        'Deferred Insurance Screen',
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

  it('allows a tenant admin to open the tenant-scoped GrowthAI workspace', () => {
    authState.userProfile = { uid: 'admin-test', onboardingCompleted: true };
    render(<App />);

    fireEvent.click(screen.getByText('GrowthAI'));

    expect(screen.getByRole('heading', { name: 'GrowthAI Draft Workspace' })).toBeInTheDocument();
    expect(screen.getByText(/Approval does not send or publish anything/)).toBeInTheDocument();
  });

  it('keeps old payment links hidden from super-admin navigation while preserving other deferred routes', () => {
    authState.role = 'super-admin';
    authState.isSuperAdmin = () => true;
    authState.userProfile = { uid: 'super-admin-test', onboardingCompleted: true };
    authState.currentTenant = null;
    authState.tenantId = null;

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

  it('requires a super-admin to select a tenant before opening GrowthAI', () => {
    authState.role = 'super-admin';
    authState.isSuperAdmin = () => true;
    authState.userProfile = { uid: 'super-admin-test', onboardingCompleted: true };
    authState.currentTenant = null;
    authState.tenantId = null;

    render(<App />);

    fireEvent.click(screen.getByText('GrowthAI'));

    expect(screen.getByRole('heading', { name: 'Select a tenant to view this area.' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'GrowthAI Draft Workspace' })).not.toBeInTheDocument();
    expect(screen.queryByText('Payment links')).not.toBeInTheDocument();
  });

  it('blocks super-admin tenant pages until an explicit tenant is selected', () => {
    authState.role = 'super-admin';
    authState.isSuperAdmin = () => true;
    authState.userProfile = { uid: 'super-admin-test', role: 'super-admin', onboardingCompleted: true };
    authState.currentTenant = null;
    authState.tenantId = null;

    const { rerender } = render(<App />);

    for (const label of ['Dashboard', 'Create estimate', 'Bookings', 'Calendar', 'Field Mode', 'Business Settings', 'Data export']) {
      fireEvent.click(screen.getByText(label));
      expect(screen.getByRole('heading', { name: 'Select a tenant to view this area.' })).toBeInTheDocument();
    }
    expect(screen.queryByRole('heading', { name: 'Bookings Screen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Create Estimate Screen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Business Settings Screen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Data Export Screen' })).not.toBeInTheDocument();

    authState.currentTenant = { id: 'tenant-b', businessName: 'Tenant B' };
    authState.tenantId = 'tenant-b';
    rerender(<App />);
    fireEvent.click(screen.getByText('Bookings'));
    expect(screen.getByRole('heading', { name: 'Bookings Screen' })).toBeInTheDocument();

    authState.currentTenant = null;
    authState.tenantId = null;
    rerender(<App />);
    expect(screen.getByRole('heading', { name: 'Select a tenant to view this area.' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bookings Screen' })).not.toBeInTheDocument();
  });

  it('clears and rejects repeat-customer estimate context when a super-admin changes tenants', async () => {
    authState.role = 'super-admin';
    authState.isSuperAdmin = () => true;
    authState.userProfile = { uid: 'super-admin-test', role: 'super-admin', onboardingCompleted: true };
    authState.currentTenant = { id: 'tenant-a', businessName: 'Tenant A' };
    authState.tenantId = 'tenant-a';

    const { rerender } = render(<App />);
    fireEvent.click(screen.getByText('Customers'));
    fireEvent.click(screen.getByRole('button', { name: 'Create repeat-customer estimate' }));

    expect(screen.getByTestId('estimate-prefill-name')).toHaveTextContent('Tenant');
    expect(screen.getByTestId('estimate-prefill-address')).toHaveTextContent('110 Example Lane');
    expect(screen.getByTestId('estimate-prefill-context')).toHaveTextContent('tenant-a');
    expect(repeatWorkflowMocks.estimateProps.existingCustomerContext).toMatchObject({
      tenantId: 'tenant-a',
      customerId: 'customer-a',
    });

    authState.currentTenant = { id: 'tenant-b', businessName: 'Tenant B' };
    authState.tenantId = 'tenant-b';
    await act(async () => {
      rerender(<App />);
    });

    expect(screen.getByTestId('estimate-prefill-name')).toHaveTextContent('No customer prefill');
    expect(screen.getByTestId('estimate-prefill-address')).toHaveTextContent('No customer address');
    expect(screen.getByTestId('estimate-prefill-context')).toHaveTextContent('No customer context');
    expect(repeatWorkflowMocks.estimateProps.initialCustomerPrefill).toBeUndefined();
    expect(repeatWorkflowMocks.estimateProps.existingCustomerContext).toBeNull();

    repeatWorkflowMocks.selectedCustomer = {
      ...repeatWorkflowMocks.selectedCustomer,
      id: 'customer-b',
      name: 'Tenant B Customer',
      firstName: 'Tenant',
      lastName: 'B Customer',
      email: 'tenant-b@example.test',
      address: '220 Example Road',
      city: 'Other City',
      state: 'MO',
      zip: '65613',
    };
    fireEvent.click(screen.getByText('Customers'));
    fireEvent.click(screen.getByRole('button', { name: 'Create repeat-customer estimate' }));

    expect(screen.getByTestId('estimate-prefill-name')).toHaveTextContent('Tenant');
    expect(screen.getByTestId('estimate-prefill-address')).toHaveTextContent('220 Example Road');
    expect(screen.getByTestId('estimate-prefill-context')).toHaveTextContent('tenant-b');
    expect(repeatWorkflowMocks.estimateProps.existingCustomerContext).toMatchObject({
      tenantId: 'tenant-b',
      customerId: 'customer-b',
    });

    authState.currentTenant = null;
    authState.tenantId = null;
    await act(async () => {
      rerender(<App />);
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Select a tenant to view this area.' })).toBeInTheDocument();
    });
  });

  it('does not expose GrowthAI to customer users', () => {
    authState.role = 'customer';
    authState.isSuperAdmin = () => false;
    authState.isEmployee = () => authState.role === 'employee';
    authState.userProfile = { uid: 'customer-test', onboardingCompleted: true };
    authState.currentTenant = {
      id: 'tenant-test',
      businessName: 'Test Cleaning Co.',
      onboardingCompleted: true
    };

    render(<App />);

    expect(screen.getByText('Customer portal')).toBeInTheDocument();
    expect(screen.queryByText('GrowthAI')).not.toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('Data export')).not.toBeInTheDocument();
    expect(screen.queryByText('Business Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Field Mode')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'GrowthAI Draft Workspace' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Customer Portal Screen' })).toBeInTheDocument();
  });

  it('limits an employee to Field Mode and sign out across direct browser paths', () => {
    authState.role = 'employee';
    authState.hasPermission = permission => permission === 'access_field_mode';
    authState.userProfile = {
      uid: 'employee-test',
      role: 'employee',
      status: 'active',
      tenantId: 'tenant-test',
    };
    authState.currentTenant = null;

    for (const path of ['/', '/dashboard', '/bookings', '/business-settings', '/data-export', '/customer-portal']) {
      window.history.pushState({}, '', path);
      const { unmount } = render(<App />);

      expect(screen.getByRole('heading', { name: 'Field Mode Screen' })).toBeInTheDocument();
      expect(screen.getByText('Field Mode')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
      expect(screen.getByText('Field operations')).toBeInTheDocument();

      [
        'Dashboard',
        'Create estimate',
        'Customers',
        'Bookings',
        'Calendar',
        'Business Settings',
        'Data export',
        'Customer portal',
        'Staff scheduling',
        'Tenant management',
        'GrowthAI',
      ].forEach(label => expect(screen.queryByText(label)).not.toBeInTheDocument());

      [
        'Wife Beta Dashboard',
        'Bookings Screen',
        'Business Settings Screen',
        'Data Export Screen',
        'Customer Portal Screen',
      ].forEach(heading => expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument());

      unmount();
    }
  });

  it('falls back from an admin page to Field Mode when the active role becomes employee', async () => {
    authState.userProfile = { uid: 'admin-test', role: 'admin', onboardingCompleted: true };
    const { rerender } = render(<App />);

    fireEvent.click(screen.getByText('Business Settings'));
    expect(screen.getByRole('heading', { name: 'Business Settings Screen' })).toBeInTheDocument();

    authState.role = 'employee';
    authState.hasPermission = permission => permission === 'access_field_mode';
    authState.userProfile = {
      uid: 'employee-test',
      role: 'employee',
      status: 'active',
      tenantId: 'tenant-test',
    };
    authState.currentTenant = null;
    rerender(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Field Mode Screen' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Business Settings Screen' })).not.toBeInTheDocument();
  });

  it('detects Stripe booking checkout return query states', () => {
    expect(getStripeBookingCheckoutResult('?stripe_booking_checkout=success&session_id=cs_test_123')).toBe('returned');
    expect(getStripeBookingCheckoutResult('?stripe_booking_checkout=cancelled')).toBe('cancelled');
    expect(getStripeBookingCheckoutResult('?stripe_booking_checkout=canceled')).toBe('cancelled');
    ['failed', 'expired', 'incomplete', 'unpaid'].forEach(result => {
      expect(getStripeBookingCheckoutResult(`?stripe_booking_checkout=${result}`)).toBeNull();
    });
    expect(getStripeBookingCheckoutResult('?other=value')).toBeNull();
  });

  it('treats a Stripe checkout return parameter as confirmation pending without entering the authenticated shell', () => {
    window.history.pushState({}, '', '/?stripe_booking_checkout=success&session_id=cs_test_123');

    const { unmount } = render(<App />);

    expect(screen.getByRole('heading', { name: 'Payment confirmation pending.' })).toBeInTheDocument();
    expect(screen.getByText("If you finished checkout, we're securely confirming the payment. The booking will update once confirmation is received.")).toBeInTheDocument();
    expect(screen.queryByText(/Payment received/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Wife Beta Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Customer Portal Screen' })).not.toBeInTheDocument();
    expect(authState.logout).not.toHaveBeenCalled();

    unmount();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Payment confirmation pending.' })).toBeInTheDocument();
    expect(screen.queryByText(/Payment received/i)).not.toBeInTheDocument();
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
