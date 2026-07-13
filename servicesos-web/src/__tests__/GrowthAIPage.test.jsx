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
    expect(screen.getByText(/Phase 0 local helper/)).toBeInTheDocument();
    expect(screen.getByText(/No real AI calls, posting, or credit deduction yet/)).toBeInTheDocument();
    expect(screen.getAllByText(/Response drafts are local templates only/).length).toBeGreaterThan(0);

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

  it('renders Aunt B and SLAI response scenarios and saves response drafts locally', () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network should not be used'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', fetchSpy);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<GrowthAIPage />);

    expect(screen.getByText('Customer response draft helper')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'New quote request reply' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Follow-up after no response' })).toBeInTheDocument();
    expect(screen.getByText(/Thanks so much for reaching out to Aunt B's Cleaning Services/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Response channel'), { target: { value: 'email' } });
    expect(screen.getByText('Subject')).toBeInTheDocument();
    expect(screen.getByText("Thanks for reaching out to Aunt B's Cleaning Services")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Copy response/ }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Aunt B's Cleaning Services"));

    fireEvent.click(screen.getByRole('button', { name: /Save response draft/ }));
    let savedDrafts = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(savedDrafts).toHaveLength(1);
    expect(savedDrafts[0]).toMatchObject({
      brandKey: 'auntbs',
      postTypeId: 'customer-response',
      platform: 'email',
      status: 'draft',
    });
    expect(savedDrafts[0].title).toContain('[Customer response]');
    expect(savedDrafts[0].inputSnapshot).toMatchObject({
      draftKind: 'customer_response',
      responseScenario: 'New quote request reply',
      responseChannel: 'email',
    });
    expect(screen.getByText(/Draft Library \(1\)/)).toBeInTheDocument();
    expect(screen.getAllByText(/\[Customer response\] Aunt B response - new quote request/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Stellar Logic AI/ }));
    expect(screen.getByRole('option', { name: 'Founder Access inquiry reply' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Technical question acknowledgment' })).toBeInTheDocument();
    expect(screen.getByText(/Thanks for reaching out about ServicesOS Founder Access/)).toBeInTheDocument();

    const channelSelect = screen.getByLabelText('Response channel');
    fireEvent.change(channelSelect, { target: { value: 'sms' } });
    fireEvent.click(screen.getByRole('button', { name: /Save response draft/ }));

    savedDrafts = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(savedDrafts).toHaveLength(2);
    expect(savedDrafts[0]).toMatchObject({
      brandKey: 'slai',
      postTypeId: 'customer-response',
      platform: 'sms',
      status: 'draft',
    });
    expect(savedDrafts[0].inputSnapshot).toMatchObject({
      draftKind: 'customer_response',
      responseScenario: 'Founder Access inquiry reply',
      responseChannel: 'sms',
    });

    expect(screen.getByText(/Draft Library \(2\)/)).toBeInTheDocument();
    expect(savedDrafts[0].title).toContain('[Customer response] SLAI response - Founder Access inquiry');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
