// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GrowthAIOnboardingGuide from '../modules/growthAI/components/GrowthAIOnboardingGuide';

describe('GrowthAIOnboardingGuide', () => {
  it('offers a free, skippable first-run introduction', () => {
    const onStart = vi.fn();
    const onSkip = vi.fn();
    render(
      <GrowthAIOnboardingGuide
        businessName="Tenant A Cleaning"
        mode="welcome"
        onNext={() => {}}
        onSkip={onSkip}
        onStart={onStart}
        step={0}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Welcome to GrowthAI.' })).toBeInTheDocument();
    expect(screen.getByText(/uses no AI credits/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show me around' }));
    expect(onStart).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: "I'll explore myself" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('shows bounded step progress and advances through the guide', () => {
    const onNext = vi.fn();
    render(
      <GrowthAIOnboardingGuide
        businessName="Tenant A Cleaning"
        mode="tour"
        onNext={onNext}
        onSkip={() => {}}
        onStart={() => {}}
        step={0}
      />,
    );

    expect(screen.getByText('1 of 6')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Understand your business' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('keeps consequential actions human-controlled in onboarding copy', () => {
    render(
      <GrowthAIOnboardingGuide
        businessName="Tenant A Cleaning"
        mode="tour"
        onNext={() => {}}
        onSkip={() => {}}
        onStart={() => {}}
        step={2}
      />,
    );

    expect(screen.getByText(/ServicesOS calculates\. GrowthAI assists\. You approve the final price\./i)).toBeInTheDocument();
  });
});
