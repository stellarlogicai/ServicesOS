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
  useAuth: () => ({
    tenantId: mocks.tenantId,
    user: { uid: 'admin-test' },
    role: 'admin',
    isAdmin: () => true,
  }),
}));

vi.mock('../components/CleaningProductsMethodsSection', () => ({
  default: ({ tenantId, actorUid, canManage }) => (
    canManage
      ? <section aria-label="Cleaning Products & Methods test section">{tenantId}:{actorUid}</section>
      : null
  ),
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
  businessAddress: '10 Main Street',
  websiteUrl: 'https://auntb.example',
  facebookUrl: 'https://facebook.com/auntb',
  defaultServiceNotes: 'Use side entry when available.',
  availability: { availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] },
  stripeConnection: {
    label: 'Needs setup',
    detail: 'Stripe account exists, but payments or payouts are not fully ready yet.',
    stripeAccountId: '...123456',
    chargesEnabled: false,
    payoutsEnabled: false,
    status: 'pending',
  },
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
    expect(screen.getByDisplayValue('555-0100')).toBeInTheDocument();
    expect(screen.getByDisplayValue('owner@example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Bolivar, MO')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10 Main Street')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://auntb.example')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://facebook.com/auntb')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Use side entry when available.')).toBeInTheDocument();
    expect(screen.getByLabelText('Monday')).toBeChecked();
    expect(screen.getByLabelText('Saturday')).not.toBeChecked();
    for (const unsafe of ['Staff', 'Portal', 'Pricing', 'API key', 'Payment Links', 'PaymentForm']) {
      expect(screen.queryByText(unsafe)).not.toBeInTheDocument();
    }
  });

  it('shows read-only Stripe status and the existing Connect Stripe action', async () => {
    render(<BusinessSettings />);

    const panel = await screen.findByRole('region', { name: 'Stripe Connect setup' });
    expect(await within(panel).findByText('Stripe is not connected.')).toBeInTheDocument();
    expect(screen.getAllByText('Not ready')).toHaveLength(2);
    expect(within(panel).getByRole('button', { name: 'Connect Stripe' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Refresh Stripe status' })).toBeInTheDocument();
    expect(mocks.getConnectedAccountStatus).toHaveBeenCalledWith('tenant-a');
    for (const field of ['stripeAccountId', 'chargesEnabled', 'payoutsEnabled', 'stripeStatus', 'stripeConnectStatus', 'stripeAccountStatus', 'stripeAccountMode']) {
      expect(screen.queryByLabelText(field)).not.toBeInTheDocument();
    }
  });

  it('starts Stripe Connect through the existing account and onboarding helpers', async () => {
    render(<BusinessSettings />);

    const panel = await screen.findByRole('region', { name: 'Stripe Connect setup' });
    fireEvent.click(await within(panel).findByRole('button', { name: 'Connect Stripe' }));

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
    expect(window.open).toHaveBeenCalledWith('https://connect.stripe.test/onboarding', '_self', 'noopener,noreferrer');
  });

  it('shows Resume Stripe setup for an existing incomplete account', async () => {
    mocks.getConnectedAccountStatus.mockResolvedValue({
      connected: true,
      status: 'pending',
      chargesEnabled: false,
      payoutsEnabled: false,
    });

    render(<BusinessSettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'Resume Stripe setup' }));
    await waitFor(() => expect(mocks.generateOnboardingLink).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      returnUrl: window.location.href,
      refreshUrl: window.location.href,
    }));
    expect(mocks.createConnectedAccount).not.toHaveBeenCalled();
  });

  it('shows Connected only when charges and payouts are confirmed', async () => {
    mocks.getConnectedAccountStatus.mockResolvedValue({
      connected: true,
      status: 'active',
      chargesEnabled: true,
      payoutsEnabled: true,
    });

    render(<BusinessSettings />);

    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.getAllByText('Ready')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Connect Stripe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume Stripe setup' })).not.toBeInTheDocument();
  });

  it('shows an unknown status without offering onboarding when status cannot be checked', async () => {
    mocks.getConnectedAccountStatus.mockRejectedValue(new Error('unavailable'));

    render(<BusinessSettings />);

    expect(await screen.findByText('Stripe status unknown')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Stripe Connect status could not be refreshed.');
    expect(screen.queryByRole('button', { name: 'Connect Stripe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume Stripe setup' })).not.toBeInTheDocument();
  });

  it('edits basic business details and saves only through the tenant service', async () => {
    render(<BusinessSettings />);
    await screen.findByDisplayValue('Aunt B Cleaning');
    fireEvent.change(screen.getByLabelText(/Business name/), { target: { value: 'Aunt B Cleaning Co.' } });
    fireEvent.change(screen.getByLabelText('Business phone'), { target: { value: '555-0199' } });
    fireEvent.change(screen.getByLabelText('Business email'), { target: { value: 'new-owner@example.com' } });
    fireEvent.change(screen.getByLabelText('Service area'), { target: { value: 'Bolivar and Springfield' } });
    fireEvent.change(screen.getByLabelText(/Business address/), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/Website link/), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/Facebook link/), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/Default service notes/), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('Saturday'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Business Settings' }));

    await waitFor(() => expect(mocks.saveBusinessSettings).toHaveBeenCalledWith(
      'tenant-a',
      expect.objectContaining({
        businessName: 'Aunt B Cleaning Co.',
        businessPhone: '555-0199',
        businessEmail: 'new-owner@example.com',
        serviceArea: 'Bolivar and Springfield',
        businessAddress: '',
        websiteUrl: '',
        facebookUrl: '',
        defaultServiceNotes: '',
        availability: { availableDays: expect.arrayContaining(['monday', 'saturday']) },
      }),
      { updatedByUid: 'admin-test' },
    ));
    expect(await screen.findByText('Business settings saved.')).toBeInTheDocument();
    expect(mocks.getConnectedAccountStatus).toHaveBeenCalledWith('tenant-a');
    expect(mocks.createConnectedAccount).not.toHaveBeenCalled();
    expect(mocks.generateOnboardingLink).not.toHaveBeenCalled();
    const savedSettings = mocks.saveBusinessSettings.mock.calls[0][1];
    for (const field of ['stripeConnection', 'stripeAccountId', 'chargesEnabled', 'payoutsEnabled', 'stripeStatus', 'stripeConnectStatus', 'stripeAccountStatus', 'stripeAccountMode']) {
      expect(savedSettings).not.toHaveProperty(field);
    }
  });

  it('validates required business name and basic email format before saving', async () => {
    render(<BusinessSettings />);
    await screen.findByDisplayValue('Aunt B Cleaning');

    fireEvent.change(screen.getByLabelText(/Business name/), { target: { value: ' ' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Business settings form' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Business name is required.');
    expect(mocks.saveBusinessSettings).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Business name/), { target: { value: 'Aunt B Cleaning' } });
    fireEvent.change(screen.getByLabelText('Business email'), { target: { value: 'not-an-email' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Business settings form' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid business email address.');
    expect(mocks.saveBusinessSettings).not.toHaveBeenCalled();
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
