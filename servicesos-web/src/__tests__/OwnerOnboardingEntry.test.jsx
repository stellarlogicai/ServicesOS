// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = {
  bootstrapOwner: vi.fn(),
  completeOwnerBusinessProfile: vi.fn(),
  loadOwnerAgreement: vi.fn(),
  acceptOwnerAgreement: vi.fn(),
  startOwnerSubscriptionCheckout: vi.fn(),
  ownerBootstrapCandidate: false,
  ownerOnboarding: null,
};

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }));

import OwnerOnboardingEntry, { BillingStep } from '../components/OwnerOnboardingEntry';

describe('OwnerOnboardingEntry', () => {
  beforeEach(() => {
    authState.bootstrapOwner.mockReset();
    authState.completeOwnerBusinessProfile.mockReset();
    authState.loadOwnerAgreement.mockReset();
    authState.acceptOwnerAgreement.mockReset();
    authState.startOwnerSubscriptionCheckout.mockReset();
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
});
