// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = {
  bootstrapOwner: vi.fn(),
  completeOwnerBusinessProfile: vi.fn(),
  loadOwnerAgreement: vi.fn(),
  acceptOwnerAgreement: vi.fn(),
  startOwnerSubscriptionCheckout: vi.fn(),
  refreshOwnerOnboarding: vi.fn(),
  finishOwnerOperationalSetup: vi.fn(),
  ownerBootstrapCandidate: false,
  ownerOnboarding: null,
};

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../services/serviceCatalogService', () => ({ listOwnerServices: vi.fn().mockResolvedValue([]), listActiveServices: vi.fn().mockResolvedValue([]) }));
vi.mock('../components/CompanySettings', () => ({ default: ({ onBrandingSaved }) => <button type="button" onClick={onBrandingSaved}>Save branding</button> }));
vi.mock('../components/StripeConnectOnboarding', () => ({
  default: ({ onStatusConfirmed, tenantId }) => <div>
    <p>Reused Stripe Connect for {tenantId}</p>
    <button type="button" onClick={() => onStatusConfirmed({ ready: true })}>Confirm fresh Stripe readiness</button>
  </div>,
}));

import OwnerOnboardingEntry, { BillingStep } from '../components/OwnerOnboardingEntry';

describe('OwnerOnboardingEntry', () => {
  beforeEach(() => {
    authState.bootstrapOwner.mockReset();
    authState.completeOwnerBusinessProfile.mockReset();
    authState.loadOwnerAgreement.mockReset();
    authState.acceptOwnerAgreement.mockReset();
    authState.startOwnerSubscriptionCheckout.mockReset();
    authState.refreshOwnerOnboarding.mockReset();
    authState.finishOwnerOperationalSetup.mockReset();
    authState.refreshOwnerOnboarding.mockResolvedValue(undefined);
    authState.ownerBootstrapCandidate = false;
    authState.ownerOnboarding = null;
  });

  it('shows bounded loading while a bootstrap candidate resolves', () => {
    authState.ownerBootstrapCandidate = true;
    authState.bootstrapOwner.mockReturnValue(new Promise(() => {}));
    render(<OwnerOnboardingEntry />);
    expect(screen.getByRole('heading', { name: 'Preparing your business account' })).toBeInTheDocument();
    expect(authState.bootstrapOwner).toHaveBeenCalledTimes(1);
  });

  it('renders the fixed no-trial subscription and redirects only after the gateway returns', async () => {
    let resolveCheckout;
    const startCheckout = vi.fn(() => new Promise(resolve => { resolveCheckout = resolve; }));
    const assign = vi.fn();
    render(<BillingStep startCheckout={startCheckout} redirectToCheckout={assign} />);
    expect(screen.getByRole('heading', { name: 'ServicesOS subscription' })).toBeInTheDocument();
    expect(screen.getByText('$100/month')).toBeInTheDocument();
    expect(screen.getByText('Monthly subscription')).toBeInTheDocument();
    expect(screen.getByText('No trial')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Continue to Secure Checkout' });
    fireEvent.click(button); fireEvent.click(button);
    expect(startCheckout).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Opening Secure Checkout…' })).toBeDisabled();
    resolveCheckout({ checkoutUrl: 'https://checkout.stripe.com/c/pay/test' });
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/test'));
  });

  it('keeps billing_required after a transient Checkout failure', async () => {
    authState.ownerOnboarding = { lifecycleManaged: true, onboardingState: 'billing_required' };
    authState.startOwnerSubscriptionCheckout.mockRejectedValue(new Error('private'));
    render(<OwnerOnboardingEntry />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Secure Checkout' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Secure checkout could not be opened. Try again.');
    expect(authState.ownerOnboarding.onboardingState).toBe('billing_required');
  });

  it('loads exact server terms and requires typed name plus an initially unchecked affirmation', async () => {
    const agreement = {
      agreementId: 'servicesos-saas-v1', termsHash: 'a'.repeat(64),
      termsMarkdown: '# Exact canonical terms\n\nFull agreement.',
      acceptanceLanguage: 'I have read and agree to the ServicesOS Software-as-a-Service Agreement on behalf of my business, and I confirm that I am authorized to accept these terms.',
    };
    authState.ownerOnboarding = { lifecycleManaged: true, onboardingState: 'agreement_required' };
    authState.loadOwnerAgreement.mockResolvedValue(agreement);
    authState.acceptOwnerAgreement.mockResolvedValue({ onboardingState: 'billing_required' });
    render(<OwnerOnboardingEntry />);
    expect(await screen.findByText('# Exact canonical terms', { exact: false })).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox');
    const button = screen.getByRole('button', { name: 'Accept Agreement & Continue' });
    expect(checkbox).not.toBeChecked(); expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Typed signer name'), { target: { value: 'Owner Name' } });
    expect(button).toBeDisabled();
    fireEvent.click(checkbox); expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(authState.acceptOwnerAgreement).toHaveBeenCalledWith({ signerName: 'Owner Name', agreementId: agreement.agreementId, termsHash: agreement.termsHash }));
  });

  it('blocks duplicate acceptance and retains signer after transient failure', async () => {
    authState.ownerOnboarding = { lifecycleManaged: true, onboardingState: 'agreement_required' };
    authState.loadOwnerAgreement.mockResolvedValue({ agreementId: 'servicesos-saas-v1', termsHash: 'a'.repeat(64), termsMarkdown: 'Terms', acceptanceLanguage: 'Acceptance' });
    let reject;
    authState.acceptOwnerAgreement.mockImplementation(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    render(<OwnerOnboardingEntry />);
    await screen.findByText('Terms');
    fireEvent.change(screen.getByLabelText('Typed signer name'), { target: { value: 'Owner Name' } });
    fireEvent.click(screen.getByRole('checkbox'));
    const button = screen.getByRole('button', { name: 'Accept Agreement & Continue' });
    fireEvent.click(button); fireEvent.click(button);
    expect(authState.acceptOwnerAgreement).toHaveBeenCalledTimes(1);
    reject(new Error('temporary'));
    expect(await screen.findByText('The agreement could not be accepted. Try again.')).toBeInTheDocument();
    expect(screen.getByLabelText('Typed signer name')).toHaveValue('Owner Name');
  });

  it('prefills and submits the five canonical business profile fields', async () => {
    authState.ownerOnboarding = {
      lifecycleManaged: true, onboardingState: 'business_profile_required',
      businessName: 'Existing Name', businessEmail: 'owner@example.test',
      businessPhone: '555-0100', businessAddress: '10 Main Street', timeZone: 'America/Chicago',
    };
    authState.completeOwnerBusinessProfile.mockResolvedValue({ onboardingState: 'agreement_required' });
    render(<OwnerOnboardingEntry />);

    expect(screen.getByLabelText('Business Name')).toHaveValue('Existing Name');
    expect(screen.getByLabelText('Timezone')).toHaveValue('America/Chicago');
    fireEvent.submit(screen.getByRole('form', { name: 'Business profile setup' }));
    await waitFor(() => expect(authState.completeOwnerBusinessProfile).toHaveBeenCalledWith({
      businessName: 'Existing Name', businessEmail: 'owner@example.test', businessPhone: '555-0100',
      businessAddress: '10 Main Street', timezone: 'America/Chicago',
    }));
  });

  it('validates required fields without submitting', () => {
    authState.ownerOnboarding = { lifecycleManaged: true, onboardingState: 'business_profile_required' };
    render(<OwnerOnboardingEntry />);
    fireEvent.change(screen.getByLabelText('Business Name'), { target: { value: 'Business' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Business profile setup' }));
    expect(screen.getByText('Complete all required business profile fields.')).toBeInTheDocument();
    expect(authState.completeOwnerBusinessProfile).not.toHaveBeenCalled();
  });

  it('blocks duplicate submission and preserves values for a transient retry', async () => {
    authState.ownerOnboarding = {
      lifecycleManaged: true, onboardingState: 'business_profile_required',
      businessName: 'Retry Business', businessEmail: 'owner@example.test', businessPhone: '555-0100',
      businessAddress: '10 Main Street', timeZone: 'UTC',
    };
    let rejectFirst;
    authState.completeOwnerBusinessProfile
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject; }))
      .mockResolvedValueOnce({ onboardingState: 'agreement_required' });
    render(<OwnerOnboardingEntry />);
    const submit = screen.getByRole('button', { name: 'Continue to agreement' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(authState.completeOwnerBusinessProfile).toHaveBeenCalledTimes(1);
    rejectFirst(new Error('temporary'));
    expect(await screen.findByText('Your business profile could not be saved. Try again.')).toBeInTheDocument();
    expect(screen.getByLabelText('Business Name')).toHaveValue('Retry Business');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to agreement' }));
    await waitFor(() => expect(authState.completeOwnerBusinessProfile).toHaveBeenCalledTimes(2));
  });

  it('fails safely and retries exactly once per click', async () => {
    authState.ownerBootstrapCandidate = true;
    authState.bootstrapOwner.mockRejectedValue(new Error('private server detail'));
    render(<OwnerOnboardingEntry />);
    expect(await screen.findByRole('heading', { name: 'Business setup is unavailable' })).toBeInTheDocument();
    expect(screen.queryByText(/private server detail/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(authState.bootstrapOwner).toHaveBeenCalledTimes(2));
  });

  it('fails closed for an unknown or malformed state', () => {
    authState.ownerOnboarding = { lifecycleManaged: true, onboardingState: null };
    render(<OwnerOnboardingEntry />);
    expect(screen.getByRole('heading', { name: 'Business setup is unavailable' })).toBeInTheDocument();
  });

  it('keeps an entitled owner in truthful resumable operational setup', () => {
    authState.ownerOnboarding = {
      lifecycleManaged: true,
      onboardingState: 'operational_setup_required',
      billingEntitlement: 'active',
      operationalProgress: {
        completedSteps: ['business_profile', 'saas_agreement', 'subscription_billing'],
        nextStep: 'services_pricing',
        operationalComplete: false,
      },
    };
    render(<OwnerOnboardingEntry />);
    expect(screen.getByRole('heading', { name: 'Continue setting up ServicesOS' })).toBeInTheDocument();
    expect(screen.getByText('Your subscription is active. Your business setup is still in progress.')).toBeInTheDocument();
    expect(screen.getByText('3 setup steps complete. Continue the next required setup step.')).toBeInTheDocument();
  });

  it('renders canonical services stage when the server reports it incomplete', async () => {
    authState.ownerOnboarding = {
      lifecycleManaged: true, onboardingState: 'operational_setup_required', tenantId: 'tenant-a',
      billingEntitlement: 'active', servicesPricingComplete: false, availabilityComplete: false,
      operationalProgress: { completedSteps: ['business_profile', 'saas_agreement', 'subscription_billing'], nextStep: 'services_pricing', operationalComplete: false },
    };
    render(<OwnerOnboardingEntry />);
    expect(screen.getAllByRole('heading', { name: 'Services and pricing' }).length).toBe(2);
    expect(await screen.findByText('No services configured. Existing estimate and booking behavior remains available until the first service is added.')).toBeInTheDocument();
  });

  it('renders branding remediation only when server-derived custom branding is invalid', () => {
    authState.ownerOnboarding = {
      lifecycleManaged: true, onboardingState: 'operational_setup_required', tenantId: 'tenant-a',
      servicesPricingComplete: true, availabilityComplete: true, brandingComplete: false,
      operationalProgress: {
        completedSteps: ['business_profile', 'saas_agreement', 'subscription_billing', 'services_pricing', 'availability'],
        nextStep: 'branding', operationalComplete: false,
      },
    };
    render(<OwnerOnboardingEntry />);
    expect(screen.getByRole('heading', { name: 'Branding' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save branding' }));
    expect(authState.refreshOwnerOnboarding).toHaveBeenCalledTimes(1);
  });

  it('shows team setup after valid default or custom branding', () => {
    authState.ownerOnboarding = {
      lifecycleManaged: true, onboardingState: 'operational_setup_required',
      servicesPricingComplete: true, availabilityComplete: true, brandingComplete: true,
      operationalProgress: {
        completedSteps: ['business_profile', 'saas_agreement', 'subscription_billing', 'services_pricing', 'availability', 'branding'],
        nextStep: 'team_setup', operationalComplete: false,
      },
    };
    render(<OwnerOnboardingEntry />);
    expect(screen.getByRole('heading', { name: 'Set up your team' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I work alone' })).toBeInTheDocument();
  });

  it('reuses Stripe Connect and advances only after fresh ready confirmation', async () => {
    authState.ownerOnboarding = {
      lifecycleManaged: true, onboardingState: 'operational_setup_required', tenantId: 'tenant-a',
      businessEmail: 'owner@example.test', servicesPricingComplete: true, availabilityComplete: true,
      brandingComplete: true, teamSetupComplete: true, stripeConnectComplete: false,
      stripeConnectStatus: 'incomplete',
      operationalProgress: {
        completedSteps: ['business_profile', 'saas_agreement', 'subscription_billing', 'services_pricing', 'availability', 'branding', 'team_setup'],
        nextStep: 'stripe_connect', operationalComplete: false,
      },
    };
    render(<OwnerOnboardingEntry />);
    expect(screen.getByText('Reused Stripe Connect for tenant-a')).toBeInTheDocument();
    expect(screen.getByText(/leave and return later/i)).toBeInTheDocument();
    expect(authState.refreshOwnerOnboarding).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm fresh Stripe readiness' }));
    await waitFor(() => expect(authState.refreshOwnerOnboarding).toHaveBeenCalledTimes(1));
  });

  it('keeps provider failure on Stripe Connect and renders final acceptance as pending only', () => {
    authState.ownerOnboarding = {
      lifecycleManaged: true, onboardingState: 'operational_setup_required', tenantId: 'tenant-a',
      servicesPricingComplete: true, availabilityComplete: true, brandingComplete: true,
      teamSetupComplete: true, stripeConnectComplete: false, stripeConnectStatus: 'unavailable',
      operationalProgress: {
        completedSteps: ['business_profile', 'saas_agreement', 'subscription_billing', 'services_pricing', 'availability', 'branding', 'team_setup'],
        nextStep: 'stripe_connect', operationalComplete: false,
      },
    };
    const { rerender } = render(<OwnerOnboardingEntry />);
    expect(screen.getByRole('alert')).toHaveTextContent('Stripe status could not be verified.');
    authState.ownerOnboarding = {
      ...authState.ownerOnboarding,
      stripeConnectComplete: true,
      stripeConnectStatus: 'ready',
      operationalProgress: {
        completedSteps: [...authState.ownerOnboarding.operationalProgress.completedSteps, 'stripe_connect'],
        nextStep: 'final_acceptance', operationalComplete: false,
      },
    };
    rerender(<OwnerOnboardingEntry />);
    expect(screen.getByRole('heading', { name: 'Final setup review' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish setup' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Setup readiness' })).toHaveTextContent('Services and pricing: Ready');
    expect(screen.getByRole('list', { name: 'Setup readiness' })).toHaveTextContent('SaaS subscription: Needs attention');
    expect(authState.finishOwnerOperationalSetup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));
    return waitFor(() => expect(authState.finishOwnerOperationalSetup).toHaveBeenCalledTimes(1));
  });
});
