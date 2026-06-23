// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../contexts/AuthContextValue';

import ImprovedOnboarding from '../components/ImprovedOnboarding';

function renderOnboarding({ onComplete = vi.fn(), completeOnboarding = vi.fn() } = {}) {
  render(
    <AuthContext.Provider
      value={{
        completeOnboarding
      }}
    >
      <ImprovedOnboarding onComplete={onComplete} />
    </AuthContext.Provider>
  );

  return { onComplete, completeOnboarding };
}

function advanceToFinalStep() {
  for (let step = 1; step < 7; step += 1) {
    fireEvent.click(screen.getByRole('button', { name: 'Continue →' }));
  }
}

describe('ImprovedOnboarding completion', () => {
  it('shows clear 100% progress on the final step', () => {
    renderOnboarding();
    advanceToFinalStep();

    expect(screen.getByText('Step 7 of 7 • 100% Complete')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Import Existing Data' })).toBeInTheDocument();
  });

  it('persists completion and exits onboarding', async () => {
    const onComplete = vi.fn();
    const completeOnboarding = vi.fn().mockResolvedValue();
    renderOnboarding({ onComplete, completeOnboarding });
    advanceToFinalStep();

    fireEvent.click(screen.getByRole('button', { name: 'Complete Setup →' }));

    await waitFor(() => {
      expect(completeOnboarding).toHaveBeenCalledTimes(1);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Import Existing Data' })).toBeInTheDocument();
  });
});
