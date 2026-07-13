// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GrowthAIPage from '../modules/growthAI/GrowthAIPage';
import { STORAGE_KEY } from '../modules/growthAI/draftStorage';

describe('GrowthAI Phase 0 local helper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    const storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(key => storage.get(key) ?? null),
      setItem: vi.fn((key, value) => storage.set(key, String(value))),
      removeItem: vi.fn(key => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    });
  });

  it('renders honesty copy and saves generated drafts locally without API calls', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network should not be used'));
    vi.stubGlobal('fetch', fetchSpy);

    render(<GrowthAIPage />);

    expect(screen.getByText(/Internal Phase 0 shell/)).toBeInTheDocument();
    expect(screen.getByText(/Placeholder\/local generation only/)).toBeInTheDocument();
    expect(screen.getByText(/Credits estimated, never deducted/)).toBeInTheDocument();
    expect(screen.getByText(/No auto-posting/)).toBeInTheDocument();
    expect(screen.getByText(/No real AI or image API call/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Availability Post/ }));
    fireEvent.click(screen.getByRole('button', { name: /Generate Draft/ }));

    expect(screen.getByText('Full caption')).toBeInTheDocument();
    expect(screen.getByText(/Placeholder \(Phase 0\)/)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Save as new/ }));

    const savedDrafts = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(savedDrafts).toHaveLength(1);
    expect(savedDrafts[0]).toMatchObject({
      brandKey: 'auntbs',
      postTypeId: 'availability',
      platform: 'facebook',
      status: 'draft',
    });
    expect(savedDrafts[0].creditsEstimated).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
