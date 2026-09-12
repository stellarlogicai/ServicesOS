// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = {
  bootstrapOwner: vi.fn(),
  completeOwnerBusinessProfile: vi.fn(),
  ownerBootstrapCandidate: false,
  ownerOnboarding: null,
};

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }));

import OwnerOnboardingEntry from '../components/OwnerOnboardingEntry';

describe('OwnerOnboardingEntry', () => {
  beforeEach(() => {
    authState.bootstrapOwner.mockReset();
    authState.completeOwnerBusinessProfile.mockReset();
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

  for (const [state, heading] of [
    ['agreement_required', 'SaaS Agreement required'],
    ['billing_required', 'Billing setup required'],
  ]) {
    it(`renders the ${state} onboarding state`, () => {
      authState.ownerOnboarding = { lifecycleManaged: true, onboardingState: state };
      render(<OwnerOnboardingEntry />);
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
      expect(authState.bootstrapOwner).not.toHaveBeenCalled();
    });
  }

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
