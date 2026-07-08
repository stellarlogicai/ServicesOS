import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BusinessSettings from '../components/BusinessSettings';

const mocks = vi.hoisted(() => ({
  tenantId: 'tenant-a',
  getBusinessSettings: vi.fn(),
  saveBusinessSettings: vi.fn(),
  getConnectedAccountStatus: vi.fn(),
  createConnectedAccount: vi.fn(),
  generateOnboardingLink: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ currentTenant: mocks.tenantId ? { id: mocks.tenantId } : null }),
}));

vi.mock('../services/businessSettingsService', () => ({
  BUSINESS_DAYS: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
  getBusinessSettings: mocks.getBusinessSettings,
  saveBusinessSettings: mocks.saveBusinessSettings,
}));

vi.mock('../services/stripeService', () => ({
  getConnectedAccountStatus: mocks.getConnectedAccountStatus,
  createConnectedAccount: mocks.createConnectedAccount,
  generateOnboardingLink: mocks.generateOnboardingLink,
}));

const settings = {
  businessName: 'Aunt B Cleaning',
  businessPhone: '555-0100',
  businessEmail: 'owner@example.com',
  serviceArea: 'Bolivar, MO',
  availability: { availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] },
};

describe('BusinessSettings', () => {
  beforeEach(() => {
    mocks.tenantId = 'tenant-a';
    mocks.getBusinessSettings.mockReset().mockResolvedValue(settings);
    mocks.saveBusinessSettings.mockReset().mockImplementation(async (_tenantId, form) => form);
    mocks.getConnectedAccountStatus.mockReset().mockResolvedValue({
      connected: false,
      status: 'not_connected',
    });
    mocks.createConnectedAccount.mockReset().mockResolvedValue({ accountId: 'acct_test_123' });
    mocks.generateOnboardingLink.mockReset().mockResolvedValue({ url: 'https://connect.stripe.test/onboarding' });
    vi.stubGlobal('open', vi.fn());
  });

  it('loads active-tenant business settings without unsafe fields', async () => {
    render(<BusinessSettings />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(await screen.findByDisplayValue('Aunt B Cleaning')).toBeInTheDocument();
    expect(mocks.getBusinessSettings).toHaveBeenCalledWith('tenant-a');
    expect(screen.getByLabelText('Monday')).toBeChecked();
    expect(screen.getByLabelText('Saturday')).not.toBeChecked();
    for (const unsafe of ['Staff', 'Portal', 'Pricing', 'API key', 'Payment Links', 'PaymentForm']) {
      expect(screen.queryByText(unsafe)).not.toBeInTheDocument();
    }
  });

  it('shows only Stripe Connect setup actions and a not-ready status when charges are disabled', async () => {
    mocks.getConnectedAccountStatus.mockResolvedValue({
      connected: true,
      status: 'pending',
      chargesEnabled: false,
      payoutsEnabled: false,
    });

    render(<BusinessSettings />);

    expect(await screen.findByText('Stripe Connect setup')).toBeInTheDocument();
    expect(screen.getByText('Connect Stripe so customers can pay online from booking payment links. Payment links stay disabled until payments are active.')).toBeInTheDocument();
    expect(await screen.findByText('Stripe is not ready yet. Finish setup before sending online payment links from Bookings.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue Stripe onboarding' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh Stripe status' })).toBeInTheDocument();
    expect(screen.queryByText('Payments ready')).not.toBeInTheDocument();
    expect(screen.queryByText('Payment Links')).not.toBeInTheDocument();
  });

  it('shows ready only when backend reports chargesEnabled true', async () => {
    mocks.getConnectedAccountStatus.mockResolvedValue({
      connected: true,
      status: 'active',
      chargesEnabled: true,
      payoutsEnabled: true,
    });

    render(<BusinessSettings />);

    expect(await screen.findByText('Stripe is ready. You can create booking payment links from Bookings.')).toBeInTheDocument();
    expect(screen.getByText('Online payments active').nextSibling).toHaveTextContent('Ready');
    expect(screen.getByText('Payouts active').nextSibling).toHaveTextContent('Ready');
  });

  it('starts Stripe Connect setup without marking the tenant ready locally', async () => {
    render(<BusinessSettings />);

    const panel = await screen.findByRole('region', { name: 'Stripe Connect setup' });
    fireEvent.change(await within(panel).findByLabelText('Business email'), { target: { value: 'owner@example.com' } });
    fireEvent.change(within(panel).getByLabelText('Business name'), { target: { value: 'Aunt B Cleaning' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Continue Stripe onboarding' }));

    await waitFor(() => expect(mocks.createConnectedAccount).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      businessEmail: 'owner@example.com',
      businessName: 'Aunt B Cleaning',
    }));
    expect(mocks.generateOnboardingLink).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      returnUrl: window.location.href,
      refreshUrl: window.location.href,
    });
    expect(screen.queryByText('Stripe is ready. You can create booking payment links from Bookings.')).not.toBeInTheDocument();
  });

  it('shows actionable backend Stripe Connect setup errors', async () => {
    mocks.createConnectedAccount.mockRejectedValue(new Error(
      'Stripe Connect platform setup is not ready. Confirm you are using the sk_test key from the Stellar Logic AI onboarding sandbox with Connect enabled.'
    ));
    render(<BusinessSettings />);

    const panel = await screen.findByRole('region', { name: 'Stripe Connect setup' });
    fireEvent.change(await within(panel).findByLabelText('Business email'), { target: { value: 'owner@example.com' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Continue Stripe onboarding' }));

    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'Stripe Connect platform setup is not ready. Confirm you are using the sk_test key from the Stellar Logic AI onboarding sandbox with Connect enabled.'
    );
    expect(mocks.generateOnboardingLink).not.toHaveBeenCalled();
  });

  it('changes available days and saves only through the tenant service', async () => {
    render(<BusinessSettings />);
    await screen.findByDisplayValue('Aunt B Cleaning');
    fireEvent.click(screen.getByLabelText('Saturday'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Business Settings' }));

    await waitFor(() => expect(mocks.saveBusinessSettings).toHaveBeenCalledWith(
      'tenant-a',
      expect.objectContaining({ availability: { availableDays: expect.arrayContaining(['monday', 'saturday']) } }),
    ));
    expect(await screen.findByText('Business settings saved.')).toBeInTheDocument();
  });

  it('rejects an empty available-day selection', async () => {
    mocks.getBusinessSettings.mockResolvedValue({ ...settings, availability: { availableDays: ['monday'] } });
    render(<BusinessSettings />);
    await screen.findByDisplayValue('Aunt B Cleaning');
    fireEvent.click(screen.getByLabelText('Monday'));
    expect(screen.getByRole('button', { name: 'Save Business Settings' })).toBeDisabled();
    expect(mocks.saveBusinessSettings).not.toHaveBeenCalled();
  });

  it('shows an honest save failure without success', async () => {
    mocks.saveBusinessSettings.mockRejectedValue(new Error('permission-denied'));
    render(<BusinessSettings />);
    await screen.findByDisplayValue('Aunt B Cleaning');
    fireEvent.click(screen.getByRole('button', { name: 'Save Business Settings' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved');
    expect(screen.queryByText('Business settings saved.')).not.toBeInTheDocument();
  });

  it('requires an active tenant', async () => {
    mocks.tenantId = '';
    render(<BusinessSettings />);
    expect(await screen.findByRole('alert')).toHaveTextContent('tenant is unavailable');
    expect(mocks.getBusinessSettings).not.toHaveBeenCalled();
  });
});
