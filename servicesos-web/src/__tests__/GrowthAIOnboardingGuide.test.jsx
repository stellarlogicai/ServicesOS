// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GrowthAIOnboardingGuide from '../modules/growthAI/components/GrowthAIOnboardingGuide';

const GUIDE_TITLES = [
  'Meet SLAI Assistant',
  'Start your day',
  'Act on opportunities',
  'Create and communicate',
  'Review your work',
  'Understand AI credits',
];

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

    expect(screen.getByRole('heading', { name: 'Welcome to SLAI Assistant.' })).toBeInTheDocument();
    expect(screen.getByText(/Business Assistant for ServicesOS/i)).toBeInTheDocument();
    expect(screen.getByText(/never uses AI credits/i)).toBeInTheDocument();
    expect(screen.queryByText(/GrowthAI/i)).not.toBeInTheDocument();
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
    expect(screen.getByText('SLAI Assistant guide')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Meet SLAI Assistant' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('keeps the completed V1 guide concise, accurate, and human-controlled', () => {
    const guideCopy = GUIDE_TITLES.map((_, step) => {
      const view = render(
        <GrowthAIOnboardingGuide
          businessName="Tenant A Cleaning"
          mode="tour"
          onNext={() => {}}
          onSkip={() => {}}
          onStart={() => {}}
          step={step}
        />,
      );
      expect(screen.getByRole('heading', { name: GUIDE_TITLES[step] })).toBeInTheDocument();
      const copy = view.container.textContent;
      view.unmount();
      return copy;
    }).join(' ');

    expect(GUIDE_TITLES).toHaveLength(6);
    expect(guideCopy).toMatch(/business briefing/i);
    expect(guideCopy).toMatch(/rebooking/i);
    expect(guideCopy).toMatch(/marketing posts/i);
    expect(guideCopy).toMatch(/Drafts/i);
    expect(guideCopy).toMatch(/100 AI credits included each month/i);
    expect(guideCopy).toMatch(/You decide/i);
    expect(guideCopy).toMatch(/does not monitor external review sites/i);
    expect(guideCopy).not.toMatch(/automatically sent|published automatically|automatically book/i);
  });
});
