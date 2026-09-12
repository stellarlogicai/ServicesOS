// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = {
  bootstrapOwner: vi.fn(),
  ownerBootstrapCandidate: false,
  ownerOnboarding: null,
};

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }));

import OwnerOnboardingEntry from '../components/OwnerOnboardingEntry';

describe('OwnerOnboardingEntry', () => {
  beforeEach(() => {
    authState.bootstrapOwner.mockReset();
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
    ['business_profile_required', 'Set up your business profile'],
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
