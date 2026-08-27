import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GrowthAICreditSummary from '../modules/growthAI/components/GrowthAICreditSummary';
import { getGrowthAICreditPresentation } from '../modules/growthAI/growthAICreditPresentation';

const canonicalBalance = Object.freeze({
  available: 82,
  reserved: 0,
  monthlyAllowance: 100,
  nextResetAt: '2026-09-01T05:00:00.000Z',
  timeZone: 'America/Chicago',
});

describe('GrowthAI credit summary', () => {
  it('renders canonical balance, allowance, and tenant-local renewal date', () => {
    const presentation = getGrowthAICreditPresentation({ balance: canonicalBalance });
    render(<GrowthAICreditSummary presentation={presentation} />);

    const summary = screen.getByLabelText('AI credit balance');
    expect(summary).toHaveAttribute('data-credit-state', 'ready');
    expect(summary).toHaveTextContent('82 remaining');
    expect(summary).toHaveTextContent('100 included each month');
    expect(summary).toHaveTextContent('Renews Sep 1');
    expect(summary).not.toHaveTextContent('monthly bucket');
  });

  it('shows loading without flashing a zero balance', () => {
    render(<GrowthAICreditSummary presentation={getGrowthAICreditPresentation({ loading: true })} />);

    const summary = screen.getByLabelText('AI credit balance');
    expect(summary).toHaveAttribute('data-credit-state', 'loading');
    expect(summary).toHaveTextContent('Loading balance');
    expect(summary).not.toHaveTextContent('0 remaining');
  });

  it('keeps unavailable distinct from zero and explains that free intelligence remains', () => {
    render(<GrowthAICreditSummary presentation={getGrowthAICreditPresentation({ error: 'permission denied' })} />);

    const summary = screen.getByLabelText('AI credit balance');
    expect(summary).toHaveAttribute('data-credit-state', 'unavailable');
    expect(summary).toHaveTextContent('Balance unavailable');
    expect(summary).toHaveTextContent('Free ServicesOS intelligence remains available');
    expect(summary).not.toHaveTextContent('0 remaining');
  });

  it('fails safely when canonical renewal metadata is missing or malformed', () => {
    const missing = getGrowthAICreditPresentation({ balance: { ...canonicalBalance, nextResetAt: undefined } });
    const malformed = getGrowthAICreditPresentation({ balance: { ...canonicalBalance, timeZone: 'Central-ish' } });

    expect(missing.status).toBe('unavailable');
    expect(malformed.status).toBe('unavailable');
  });

  it('shows the zero-credit state with the canonical renewal date', () => {
    render(<GrowthAICreditSummary presentation={getGrowthAICreditPresentation({
      balance: { ...canonicalBalance, available: 0 },
    })} />);

    const summary = screen.getByLabelText('AI credit balance');
    expect(summary).toHaveTextContent('0 remaining');
    expect(summary).toHaveTextContent('Renews Sep 1');
    expect(summary).toHaveTextContent('Free ServicesOS intelligence still works');
  });
});
