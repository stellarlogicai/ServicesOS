import { describe, expect, it } from 'vitest';
import { buildGrowthAIBusinessBriefing } from '../modules/growthAI/growthAIBusinessBriefing';

const controlledNow = new Date(2026, 7, 26, 10, 0, 0);

describe('GrowthAI business briefing', () => {
  it('derives a controlled-date briefing from canonical bookings and deterministic opportunities', () => {
    const briefing = buildGrowthAIBusinessBriefing({
      now: controlledNow,
      bookings: [
        { id: 'completed-today', date: '2026-08-26', status: 'completed' },
        { id: 'completed-yesterday', date: '2026-08-25', status: 'completed' },
        { id: 'cancelled-today', date: '2026-08-26', status: 'cancelled' },
      ],
      opportunities: [
        { id: 'follow-up', type: 'estimate_followup', status: 'open', detectionReason: 'Quoted estimate needs follow-up.' },
        { id: 'photo-review', type: 'marketing_photo_review', status: 'acted', detectionReason: 'Completed photos are ready for owner review.' },
        { id: 'dismissed', type: 'estimate_followup', status: 'dismissed', detectionReason: 'Do not include this.' },
      ],
    });

    expect(briefing.today).toBe('2026-08-26');
    expect(briefing.wins).toEqual([{ id: 'completed-work', text: '1 job completed today.' }]);
    expect(briefing.needsAttention).toEqual([{ id: 'follow-up', text: 'Quoted estimate needs follow-up.' }]);
    expect(briefing.noticed).toEqual([{ id: 'photo-review', text: 'Completed photos are ready for owner review.' }]);
    expect(briefing.actions).toEqual([{ id: 'opportunities', capabilityType: 'opportunities', label: 'Review estimate follow-ups' }]);
    expect(briefing.isEmpty).toBe(false);
  });

  it('uses a calm empty state with only existing, non-mutating workflow actions', () => {
    const briefing = buildGrowthAIBusinessBriefing({ now: controlledNow });

    expect(briefing).toMatchObject({ isEmpty: true, wins: [], needsAttention: [], noticed: [] });
    expect(briefing.actions).toEqual([
      { id: 'marketing', capabilityType: 'marketing', label: 'Create marketing' },
      { id: 'customer_response', capabilityType: 'customer_response', label: 'Prepare a response' },
    ]);
  });

  it('surfaces a retention opportunity through the existing controlled opportunity review path', () => {
    const briefing = buildGrowthAIBusinessBriefing({
      now: controlledNow,
      opportunities: [{
        id: 'rebooking_gap__customer-a',
        type: 'rebooking_gap',
        status: 'open',
        detectionReason: 'A configured bi-weekly service is now due with no upcoming booking.',
      }],
    });

    expect(briefing.noticed).toEqual([{
      id: 'rebooking_gap__customer-a',
      text: 'A configured bi-weekly service is now due with no upcoming booking.',
    }]);
    expect(briefing.actions).toEqual([{ id: 'opportunities', capabilityType: 'opportunities', label: 'Review opportunities' }]);
  });

  it('degrades safely when canonical records are partial or missing fields', () => {
    const briefing = buildGrowthAIBusinessBriefing({
      now: controlledNow,
      bookings: [{ id: 'incomplete-booking', status: 'completed' }, null],
      opportunities: [{ id: 'partial-opportunity', type: 'rebooking_gap', status: 'open' }, null],
    });

    expect(briefing.wins).toEqual([]);
    expect(briefing.needsAttention).toEqual([]);
    expect(briefing.noticed).toEqual([{ id: 'partial-opportunity', text: 'GrowthAI found an opportunity worth reviewing.' }]);
    expect(briefing.isEmpty).toBe(false);
  });
});
