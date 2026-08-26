import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
  getDocs: vi.fn(),
  runTransaction: vi.fn(),
  updates: [],
}));

const firebase = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'admin-a' } },
  db: { path: '' },
}));

vi.mock('../firebase', () => firebase);
vi.mock('../core/leads/leadService', () => ({ getLeads: vi.fn() }));
vi.mock('../core/scheduling/schedulingService', () => ({ getJobs: vi.fn() }));
vi.mock('../services/fieldPhotoService', () => ({ listFieldPhotos: vi.fn() }));
vi.mock('../services/recurringService', () => ({ getRecurringServices: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: (parent, ...segments) => ({ path: [parent?.path, ...segments].filter(Boolean).join('/') }),
  doc: (parent, ...segments) => ({ path: [parent?.path, ...segments].filter(Boolean).join('/'), id: segments.at(-1) }),
  getDocs: firestore.getDocs,
  orderBy: (...args) => args,
  query: reference => reference,
  runTransaction: firestore.runTransaction,
  serverTimestamp: () => ({ serverTimestamp: true }),
}));

import {
  detectEstimateFollowUpOpportunities,
  detectMarketingPhotoReviewOpportunities,
  detectRebookingOpportunities,
  dismissGrowthAIOpportunity,
  markGrowthAIOpportunityActed,
  planGrowthAIOpportunityReconciliation,
} from '../modules/growthAI/growthAIOpportunityService';

function quotedLead(overrides = {}) {
  return {
    id: 'lead-a',
    tenantId: 'tenant-a',
    customerId: 'customer-a',
    status: 'quoted',
    estimate: { priceLow: 180, priceHigh: 220 },
    booking: null,
    updatedAt: '2026-08-20T12:00:00.000Z',
    ...overrides,
  };
}

function opportunity(overrides = {}) {
  return {
    id: 'estimate_followup__lead-a',
    type: 'estimate_followup',
    pillar: 'convert',
    status: 'open',
    sourceRefs: { leadId: 'lead-a' },
    detectionReason: 'Estimate needs follow-up.',
    detectionVersion: 'estimate-followup-v1',
    firstDetectedAt: { preserved: true },
    ...overrides,
  };
}

function recurringCompletedBooking(overrides = {}) {
  return {
    id: 'completed-recurring-a',
    tenantId: 'tenant-a',
    customerId: 'customer-a',
    status: 'completed',
    date: '2026-08-01',
    serviceType: 'standard clean',
    requestSnapshot: { frequency: 'bi-weekly' },
    ...overrides,
  };
}

function activeRecurringService(overrides = {}) {
  return {
    id: 'recurring-standard',
    tenantId: 'tenant-a',
    customerId: 'customer-a',
    serviceType: 'standard clean',
    scheduleType: 'weekly',
    status: 'active',
    ...overrides,
  };
}

describe('GrowthAI deterministic opportunity detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.updates = [];
    firebase.auth.currentUser = { uid: 'admin-a' };
    firestore.runTransaction.mockImplementation(async (_db, callback) => callback({
      get: vi.fn(async reference => ({ exists: () => true, id: reference.id, data: () => opportunity() })),
      update: vi.fn((reference, patch) => firestore.updates.push({ path: reference.path, patch })),
    }));
  });

  it('detects only canonical quoted estimates at or beyond the threshold with no booking relationship', () => {
    const detections = detectEstimateFollowUpOpportunities({
      now: new Date('2026-08-24T12:00:00.000Z'),
      leads: [
        quotedLead(),
        quotedLead({ id: 'below-threshold', updatedAt: '2026-08-22T13:00:00.000Z' }),
        quotedLead({ id: 'new-lead', status: 'new' }),
        quotedLead({ id: 'booked-lead', booking: { bookingId: 'booking-a' } }),
        quotedLead({ id: 'approved-estimate', estimate: { status: 'approved' } }),
        quotedLead({ id: 'declined-estimate', estimate: { status: 'declined' } }),
        quotedLead({ id: 'pending-review', estimate: { status: 'pending_owner_review', requiresReview: true } }),
      ],
      bookings: [{ id: 'booking-linked', sourceLeadId: 'separate-linked-lead' }],
    });

    expect(detections).toHaveLength(1);
    expect(detections[0]).toMatchObject({
      id: 'estimate_followup__lead-a',
      type: 'estimate_followup',
      pillar: 'convert',
      sourceRefs: { leadId: 'lead-a', customerId: 'customer-a' },
      detectionVersion: 'estimate-followup-v1',
    });
    expect(detections[0].detectionReason).toContain('4 days');
    expect(JSON.stringify(detections[0])).not.toMatch(/revenue|stripe|payment/i);
  });

  it('uses canonical booking IDs to exclude an otherwise qualifying estimate', () => {
    expect(detectEstimateFollowUpOpportunities({
      now: new Date('2026-08-24T12:00:00.000Z'),
      leads: [quotedLead({ id: 'lead-linked' })],
      bookings: [{ id: 'booking-a', leadId: 'lead-linked' }],
    })).toEqual([]);
  });

  it('returns the same stable identity on repeated estimate detection', () => {
    const input = {
      now: new Date('2026-08-24T12:00:00.000Z'),
      leads: [quotedLead()],
      bookings: [],
    };
    const first = detectEstimateFollowUpOpportunities(input);
    const second = detectEstimateFollowUpOpportunities(input);
    expect(first).toEqual(second);
    expect(new Set([...first, ...second].map(item => item.id))).toEqual(new Set(['estimate_followup__lead-a']));
  });

  it('requires completed work plus labeled Before and After photos without inferring marketing approval', () => {
    const opportunities = detectMarketingPhotoReviewOpportunities({
      bookings: [
        { id: 'job-a', customerId: 'customer-a', status: 'scheduled', fieldStatus: 'completed' },
        { id: 'job-before-only', status: 'completed' },
        { id: 'job-incomplete', status: 'scheduled', fieldStatus: 'in_progress' },
        { id: 'job-cancelled', status: 'cancelled', fieldStatus: 'completed' },
      ],
      photosByBookingId: {
        'job-a': [
          { id: 'before-a', phase: 'before', roomLabel: 'Kitchen' },
          { id: 'after-a', phase: 'after', roomLabel: 'Kitchen' },
        ],
        'job-before-only': [{ id: 'before-b', phase: 'before', roomLabel: 'Bathroom' }],
        'job-incomplete': [
          { id: 'before-c', phase: 'before', roomLabel: 'Kitchen' },
          { id: 'after-c', phase: 'after', roomLabel: 'Kitchen' },
        ],
        'job-cancelled': [
          { id: 'before-d', phase: 'before', roomLabel: 'Kitchen' },
          { id: 'after-d', phase: 'after', roomLabel: 'Kitchen' },
        ],
      },
    });

    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({
      id: 'marketing_photo_review__job-a',
      type: 'marketing_photo_review',
      pillar: 'attract',
      sourceRefs: { bookingId: 'job-a', customerId: 'customer-a', photoIds: ['before-a', 'after-a'] },
    });
    expect(opportunities[0].detectionReason).toContain('decide whether they are appropriate for marketing');
    expect(opportunities[0]).not.toHaveProperty('marketingApproved');
  });

  it('does not qualify unlabeled legacy photos', () => {
    expect(detectMarketingPhotoReviewOpportunities({
      bookings: [{ id: 'job-a', status: 'completed' }],
      photosByBookingId: {
        'job-a': [
          { id: 'before-a', phase: 'before' },
          { id: 'after-a', phase: 'after', roomLabel: '' },
        ],
      },
    })).toEqual([]);
  });

  it('detects a canonical recurring customer with no matching next booking at the configured cadence', () => {
    const opportunities = detectRebookingOpportunities({
      now: new Date('2026-08-20T12:00:00'),
      bookings: [recurringCompletedBooking()],
    });

    expect(opportunities).toEqual([expect.objectContaining({
      id: 'rebooking_gap__customer-a__booking-service%3Astandard%20clean%3Abiweekly',
      type: 'rebooking_gap',
      pillar: 'retain',
      sourceRefs: { customerId: 'customer-a', serviceKey: 'booking-service:standard clean:biweekly' },
      detectionVersion: 'rebooking-gap-v1',
    })]);
    expect(opportunities[0].detectionReason).toContain('configured every two weeks cadence is now due');
    expect(JSON.stringify(opportunities[0])).not.toMatch(/credit|provider|payment|stripe/i);
  });

  it('suppresses a recurring retention opportunity when a matching upcoming booking exists', () => {
    expect(detectRebookingOpportunities({
      now: new Date('2026-08-20T12:00:00'),
      bookings: [
        recurringCompletedBooking(),
        recurringCompletedBooking({ id: 'upcoming-recurring-a', status: 'scheduled', date: '2026-08-27' }),
      ],
    })).toEqual([]);
  });

  it('suppresses a retention opportunity while the matching service is actively in progress', () => {
    expect(detectRebookingOpportunities({
      now: new Date('2026-08-20T12:00:00'),
      bookings: [
        recurringCompletedBooking(),
        recurringCompletedBooking({ id: 'active-recurring-a', status: 'in_progress', date: '2026-08-19' }),
      ],
    })).toEqual([]);
  });

  it('does not fabricate a due claim before cadence or without a canonical recurring frequency', () => {
    expect(detectRebookingOpportunities({
      now: new Date('2026-08-10T12:00:00'),
      bookings: [recurringCompletedBooking()],
    })).toEqual([]);
    expect(detectRebookingOpportunities({
      now: new Date('2026-08-20T12:00:00'),
      bookings: [recurringCompletedBooking({ requestSnapshot: { frequency: 'one-time' } })],
    })).toEqual([]);
  });

  it('uses the canonical monthly cadence without converting it to an arbitrary global day threshold', () => {
    expect(detectRebookingOpportunities({
      now: new Date('2026-02-28T12:00:00'),
      bookings: [recurringCompletedBooking({
        date: '2026-01-31',
        requestSnapshot: { frequency: 'monthly' },
      })],
    })).toHaveLength(1);
  });

  it('uses the configured cadence as the only service-gap baseline and deduplicates by recurring service identity', () => {
    const opportunities = detectRebookingOpportunities({
      tenantId: 'tenant-a',
      now: new Date('2026-09-15T12:00:00'),
      bookings: [
        recurringCompletedBooking({ id: 'old-completed-a', date: '2026-08-01', recurringServiceId: 'recurring-standard' }),
        recurringCompletedBooking({ id: 'latest-completed-a', date: '2026-08-20', requestSnapshot: { frequency: 'weekly' }, recurringServiceId: 'recurring-standard' }),
      ],
      recurringServices: [activeRecurringService()],
    });

    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({
      id: 'rebooking_gap__customer-a__recurring-service%3Arecurring-standard',
      sourceRefs: { customerId: 'customer-a', serviceKey: 'recurring-service:recurring-standard' },
    });
    expect(opportunities[0].detectionReason).toContain('configured weekly cadence');
  });

  it('creates distinct opportunities for separate recurring services for the same customer', () => {
    const opportunities = detectRebookingOpportunities({
      tenantId: 'tenant-a',
      now: new Date('2026-09-15T12:00:00'),
      bookings: [
        recurringCompletedBooking({ id: 'standard-latest', date: '2026-09-01', requestSnapshot: {}, recurringServiceId: 'recurring-standard' }),
        recurringCompletedBooking({ id: 'deep-monthly', date: '2026-08-01', serviceType: 'deep clean', requestSnapshot: {}, recurringServiceId: 'recurring-deep' }),
      ],
      recurringServices: [
        activeRecurringService(),
        activeRecurringService({ id: 'recurring-deep', serviceType: 'deep clean', scheduleType: 'monthly' }),
      ],
    });

    expect(opportunities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'rebooking_gap__customer-a__recurring-service%3Arecurring-standard',
        sourceRefs: { customerId: 'customer-a', serviceKey: 'recurring-service:recurring-standard' },
      }),
      expect.objectContaining({
        id: 'rebooking_gap__customer-a__recurring-service%3Arecurring-deep',
        sourceRefs: { customerId: 'customer-a', serviceKey: 'recurring-service:recurring-deep' },
      }),
    ]));
    expect(new Set(opportunities.map(item => item.id)).size).toBe(2);
  });

  it('does not let an upcoming recurring service suppress another due service for the same customer', () => {
    const opportunities = detectRebookingOpportunities({
      tenantId: 'tenant-a',
      now: new Date('2026-09-15T12:00:00'),
      bookings: [
        recurringCompletedBooking({ id: 'standard-completed', date: '2026-09-01', requestSnapshot: {}, recurringServiceId: 'recurring-standard' }),
        recurringCompletedBooking({ id: 'deep-completed', date: '2026-08-01', serviceType: 'deep clean', requestSnapshot: {}, recurringServiceId: 'recurring-deep' }),
        recurringCompletedBooking({ id: 'standard-upcoming', status: 'scheduled', date: '2026-09-18', requestSnapshot: {}, recurringServiceId: 'recurring-standard' }),
      ],
      recurringServices: [
        activeRecurringService(),
        activeRecurringService({ id: 'recurring-deep', serviceType: 'deep clean', scheduleType: 'monthly' }),
      ],
    });

    expect(opportunities).toEqual([expect.objectContaining({
      id: 'rebooking_gap__customer-a__recurring-service%3Arecurring-deep',
      sourceRefs: { customerId: 'customer-a', serviceKey: 'recurring-service:recurring-deep' },
    })]);
  });

  it('resolves a generated recurring job without duplicated frequency from its active canonical plan', () => {
    const opportunities = detectRebookingOpportunities({
      tenantId: 'tenant-a',
      now: new Date('2026-08-08T12:00:00'),
      bookings: [recurringCompletedBooking({ requestSnapshot: {}, recurringServiceId: 'recurring-standard' })],
      recurringServices: [activeRecurringService()],
    });

    expect(opportunities).toEqual([expect.objectContaining({
      id: 'rebooking_gap__customer-a__recurring-service%3Arecurring-standard',
      sourceRefs: { customerId: 'customer-a', serviceKey: 'recurring-service:recurring-standard' },
    })]);
    expect(opportunities[0].detectionReason).toContain('configured weekly cadence');
  });

  it('uses the canonical biweekly and monthly plan cadences', () => {
    const biweekly = detectRebookingOpportunities({
      tenantId: 'tenant-a',
      now: new Date('2026-08-15T12:00:00'),
      bookings: [recurringCompletedBooking({ requestSnapshot: {}, recurringServiceId: 'recurring-biweekly' })],
      recurringServices: [activeRecurringService({ id: 'recurring-biweekly', scheduleType: 'biweekly' })],
    });
    const monthly = detectRebookingOpportunities({
      tenantId: 'tenant-a',
      now: new Date('2026-02-28T12:00:00'),
      bookings: [recurringCompletedBooking({ date: '2026-01-31', requestSnapshot: {}, recurringServiceId: 'recurring-monthly' })],
      recurringServices: [activeRecurringService({ id: 'recurring-monthly', scheduleType: 'monthly' })],
    });

    expect(biweekly[0].detectionReason).toContain('configured every two weeks cadence');
    expect(monthly[0].detectionReason).toContain('configured monthly cadence');
  });

  it('does not invent cadence for missing, inactive, or cross-tenant recurring-service references', () => {
    const booking = recurringCompletedBooking({ requestSnapshot: {}, recurringServiceId: 'recurring-standard' });
    expect(detectRebookingOpportunities({
      tenantId: 'tenant-a', now: new Date('2026-08-20T12:00:00'), bookings: [booking], recurringServices: [],
    })).toEqual([]);
    expect(detectRebookingOpportunities({
      tenantId: 'tenant-a', now: new Date('2026-08-20T12:00:00'), bookings: [booking],
      recurringServices: [activeRecurringService({ status: 'paused' })],
    })).toEqual([]);
    expect(detectRebookingOpportunities({
      tenantId: 'tenant-a', now: new Date('2026-08-20T12:00:00'), bookings: [booking],
      recurringServices: [activeRecurringService({ tenantId: 'tenant-b' })],
    })).toEqual([]);
    expect(detectRebookingOpportunities({
      tenantId: 'tenant-a', now: new Date('2026-08-20T12:00:00'), bookings: [booking],
      recurringServices: [activeRecurringService({ scheduleType: 'custom' })],
    })).toEqual([]);
  });

  it('uses canonical plan cadence over a stale duplicated booking frequency', () => {
    const opportunities = detectRebookingOpportunities({
      tenantId: 'tenant-a',
      now: new Date('2026-08-08T12:00:00'),
      bookings: [recurringCompletedBooking({
        requestSnapshot: { frequency: 'monthly' }, recurringServiceId: 'recurring-standard',
      })],
      recurringServices: [activeRecurringService({ scheduleType: 'weekly' })],
    });

    expect(opportunities).toHaveLength(1);
    expect(opportunities[0].detectionReason).toContain('configured weekly cadence');
  });

  it('plans stable idempotent creation, preserves dismissal, and resolves only active records', () => {
    const detection = {
      id: 'estimate_followup__lead-a', type: 'estimate_followup', pillar: 'convert', sourceRefs: { leadId: 'lead-a' },
    };
    expect(planGrowthAIOpportunityReconciliation([], [detection])).toMatchObject({ create: [detection] });
    expect(planGrowthAIOpportunityReconciliation([opportunity()], [detection])).toMatchObject({
      create: [], refresh: [{ current: expect.objectContaining({ status: 'open' }), detection }], resolve: [],
    });
    expect(planGrowthAIOpportunityReconciliation([opportunity({ status: 'dismissed' })], [detection])).toEqual({
      create: [], refresh: [], resolve: [],
    });
    expect(planGrowthAIOpportunityReconciliation([opportunity({ status: 'acted' })], [])).toMatchObject({
      create: [], refresh: [], resolve: [expect.objectContaining({ status: 'acted' })],
    });
    expect(opportunity().firstDetectedAt).toEqual({ preserved: true });
  });

  it('binds action and dismissal actors to the authenticated user', async () => {
    await markGrowthAIOpportunityActed('tenant-a', 'estimate_followup__lead-a');
    expect(firestore.updates[0]).toMatchObject({
      path: 'tenants/tenant-a/growthAIOpportunities/estimate_followup__lead-a',
      patch: { status: 'acted', actedByUid: 'admin-a', updatedByUid: 'admin-a' },
    });

    firestore.runTransaction.mockImplementationOnce(async (_db, callback) => callback({
      get: vi.fn(async reference => ({ exists: () => true, id: reference.id, data: () => opportunity({ status: 'acted' }) })),
      update: vi.fn((reference, patch) => firestore.updates.push({ path: reference.path, patch })),
    }));
    await dismissGrowthAIOpportunity('tenant-a', 'estimate_followup__lead-a');
    expect(firestore.updates[1].patch).toMatchObject({
      status: 'dismissed', dismissedByUid: 'admin-a', updatedByUid: 'admin-a',
    });
  });
});
