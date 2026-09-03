import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
  getDocs: vi.fn(),
  runTransaction: vi.fn(),
  sets: [],
  transactionTargetIds: [],
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
  detectReviewRequestOpportunities,
  dismissGrowthAIOpportunity,
  markGrowthAIOpportunityActed,
  planGrowthAIOpportunityReconciliation,
  reconcileGrowthAIOpportunities,
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

function detection(index, overrides = {}) {
  return {
    id: `opportunity-${index}`,
    type: 'estimate_followup',
    pillar: 'convert',
    sourceRefs: { leadId: `lead-${index}` },
    detectionReason: `Detection ${index}`,
    detectionVersion: 'estimate-followup-v1',
    ...overrides,
  };
}

function opportunitySnapshot(items = []) {
  return {
    docs: items.map(item => ({ id: item.id, data: () => ({ ...item }) })),
  };
}

function transactionRecorder(currentById = new Map()) {
  const targetIds = [];
  firestore.transactionTargetIds.push(targetIds);
  return {
    get: vi.fn(async reference => {
      targetIds.push(reference.id);
      const current = currentById.get(reference.id);
      return { exists: () => Boolean(current), id: reference.id, data: () => current };
    }),
    set: vi.fn((reference, payload) => firestore.sets.push({ id: reference.id, payload })),
    update: vi.fn((reference, patch) => firestore.updates.push({ id: reference.id, patch })),
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

  it('surfaces one neutral review-request opportunity for a completed tenant booking with a customer reference', () => {
    const bookings = [{
      id: 'booking-completed', tenantId: 'tenant-a', customerId: 'customer-a', status: 'completed', serviceType: 'deep clean',
    }];
    const first = detectReviewRequestOpportunities({ bookings, tenantId: 'tenant-a' });
    const second = detectReviewRequestOpportunities({ bookings, tenantId: 'tenant-a' });
    expect(first).toEqual([expect.objectContaining({
      id: 'review_request__customer-a',
      type: 'review_request',
      pillar: 'reputation',
      sourceRefs: { bookingId: 'booking-completed', customerId: 'customer-a' },
      detectionVersion: 'review-request-v1',
    })]);
    expect(first).toEqual(second);
    expect(first[0].detectionReason).toMatch(/consider asking for feedback or a review/i);
    expect(JSON.stringify(first[0])).not.toMatch(/happy|satisfied|star|credit|provider|payment|stripe/i);
  });

  it('uses one most-recent qualifying review request per customer without suppressing other customers', () => {
    const opportunities = detectReviewRequestOpportunities({
      tenantId: 'tenant-a',
      bookings: [
        { id: 'booking-old', tenantId: 'tenant-a', customerId: 'customer-a', status: 'completed', date: '2026-08-01' },
        { id: 'booking-new', tenantId: 'tenant-a', customerId: 'customer-a', status: 'completed', date: '2026-08-15', recurringServiceId: 'weekly-plan' },
        { id: 'booking-other-customer', tenantId: 'tenant-a', customerId: 'customer-b', status: 'completed', date: '2026-08-14' },
        { id: 'booking-other-tenant', tenantId: 'tenant-b', customerId: 'customer-a', status: 'completed', date: '2026-08-20' },
      ],
    });

    expect(opportunities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'review_request__customer-a',
        sourceRefs: { bookingId: 'booking-new', customerId: 'customer-a' },
      }),
      expect.objectContaining({
        id: 'review_request__customer-b',
        sourceRefs: { bookingId: 'booking-other-customer', customerId: 'customer-b' },
      }),
    ]));
    expect(opportunities).toHaveLength(2);
    expect(JSON.stringify(opportunities)).not.toMatch(/satisfied|credit|provider|payment|stripe/i);
  });

  it('reuses the customer-level lifecycle without reopening a dismissed review request', () => {
    const [detection] = detectReviewRequestOpportunities({
      tenantId: 'tenant-a',
      bookings: [{ id: 'booking-new', tenantId: 'tenant-a', customerId: 'customer-a', status: 'completed', date: '2026-08-15' }],
    });
    const open = opportunity({
      id: 'review_request__customer-a', type: 'review_request', pillar: 'reputation',
      sourceRefs: { bookingId: 'booking-old', customerId: 'customer-a' },
    });

    expect(planGrowthAIOpportunityReconciliation([open], [detection])).toMatchObject({
      create: [],
      refresh: [{ current: open, detection }],
      resolve: [],
    });
    expect(planGrowthAIOpportunityReconciliation([{ ...open, status: 'dismissed' }], [detection])).toEqual({
      create: [], refresh: [], resolve: [],
    });
  });

  it('suppresses review requests for incomplete, cancelled, unlinked, or issue-flagged bookings', () => {
    expect(detectReviewRequestOpportunities({ bookings: [
      { id: 'in-progress', customerId: 'customer-a', status: 'in_progress' },
      { id: 'cancelled', customerId: 'customer-a', status: 'cancelled', fieldStatus: 'completed' },
      { id: 'missing-customer', status: 'completed' },
      { id: 'field-issue', customerId: 'customer-a', status: 'completed', fieldIssue: 'Door access issue' },
      { id: 'incident', customerId: 'customer-a', status: 'completed', hasIncident: true },
    ] })).toEqual([]);
  });

  it('does not surface another tenant\'s completed booking in a tenant-scoped review refresh', () => {
    expect(detectReviewRequestOpportunities({
      tenantId: 'tenant-a',
      bookings: [{ id: 'tenant-b-booking', tenantId: 'tenant-b', customerId: 'customer-b', status: 'completed' }],
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
    const booking = recurringCompletedBooking({
      requestSnapshot: { frequency: 'weekly' }, recurringServiceId: 'recurring-standard',
    });
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

describe('GrowthAI opportunity reconciliation transaction bounds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.sets = [];
    firestore.transactionTargetIds = [];
    firestore.updates = [];
    firebase.auth.currentUser = { uid: 'admin-a' };
  });

  function useRecordedTransactions(current = []) {
    const currentById = new Map(current.map(item => [item.id, item]));
    firestore.runTransaction.mockImplementation(async (_db, callback) => callback(transactionRecorder(currentById)));
  }

  it('returns the canonical list without opening a transaction when there are no targets', async () => {
    const finalList = [opportunity({ id: 'dismissed-a', status: 'dismissed' })];
    firestore.getDocs
      .mockResolvedValueOnce(opportunitySnapshot([]))
      .mockResolvedValueOnce(opportunitySnapshot(finalList));

    const result = await reconcileGrowthAIOpportunities('tenant-a', []);

    expect(firestore.runTransaction).not.toHaveBeenCalled();
    expect(result).toEqual(finalList);
  });

  it('uses one transaction for no more than 20 targets', async () => {
    const detections = Array.from({ length: 20 }, (_, index) => detection(index));
    firestore.getDocs.mockResolvedValue(opportunitySnapshot([]));
    useRecordedTransactions();

    await reconcileGrowthAIOpportunities('tenant-a', detections);

    expect(firestore.runTransaction).toHaveBeenCalledTimes(1);
    expect(firestore.transactionTargetIds.map(ids => ids.length)).toEqual([20]);
  });

  it('splits 21 targets into two sequentially awaited transactions', async () => {
    const detections = Array.from({ length: 21 }, (_, index) => detection(index));
    firestore.getDocs.mockResolvedValue(opportunitySnapshot([]));
    let releaseFirst;
    let signalFirstStarted;
    const firstStarted = new Promise(resolve => { signalFirstStarted = resolve; });
    const firstGate = new Promise(resolve => { releaseFirst = resolve; });
    let transactionNumber = 0;
    firestore.runTransaction.mockImplementation(async (_db, callback) => {
      transactionNumber += 1;
      if (transactionNumber === 1) {
        signalFirstStarted();
        await firstGate;
      }
      return callback(transactionRecorder());
    });

    const reconciliation = reconcileGrowthAIOpportunities('tenant-a', detections);
    await firstStarted;
    expect(firestore.runTransaction).toHaveBeenCalledTimes(1);
    releaseFirst();
    await reconciliation;

    expect(firestore.runTransaction).toHaveBeenCalledTimes(2);
    expect(firestore.transactionTargetIds.map(ids => ids.length)).toEqual([20, 1]);
  });

  it('splits 45 targets into transactions of 20, 20, and 5', async () => {
    const detections = Array.from({ length: 45 }, (_, index) => detection(index));
    firestore.getDocs.mockResolvedValue(opportunitySnapshot([]));
    useRecordedTransactions();

    await reconcileGrowthAIOpportunities('tenant-a', detections);

    expect(firestore.runTransaction).toHaveBeenCalledTimes(3);
    expect(firestore.transactionTargetIds.map(ids => ids.length)).toEqual([20, 20, 5]);
    expect(Math.max(...firestore.transactionTargetIds.map(ids => ids.length))).toBeLessThanOrEqual(20);
  });

  it('preserves creates, refreshes, and resolves across chunk boundaries', async () => {
    const creates = Array.from({ length: 9 }, (_, index) => detection(index));
    const refreshes = Array.from({ length: 8 }, (_, index) => opportunity({
      id: `refresh-${index}`,
      sourceRefs: { leadId: `refresh-lead-${index}` },
    }));
    const resolves = Array.from({ length: 8 }, (_, index) => opportunity({
      id: `resolve-${index}`,
      status: index % 2 === 0 ? 'open' : 'acted',
    }));
    const refreshDetections = refreshes.map((item, index) => detection(`refresh-${index}`, {
      id: item.id,
      detectionReason: `Refreshed ${index}`,
    }));
    const existing = [...refreshes, ...resolves];
    firestore.getDocs.mockResolvedValueOnce(opportunitySnapshot(existing)).mockResolvedValueOnce(opportunitySnapshot(existing));
    useRecordedTransactions(existing);

    await reconcileGrowthAIOpportunities('tenant-a', [...creates, ...refreshDetections]);

    expect(firestore.transactionTargetIds.map(ids => ids.length)).toEqual([20, 5]);
    expect(firestore.sets).toHaveLength(9);
    expect(firestore.sets.every(item => item.payload.status === 'open' && item.payload.tenantId === 'tenant-a')).toBe(true);
    expect(firestore.sets.every(item => item.payload.createdByUid === 'admin-a' && item.payload.updatedByUid === 'admin-a')).toBe(true);
    const refreshUpdates = firestore.updates.filter(item => item.id.startsWith('refresh-'));
    expect(refreshUpdates).toHaveLength(8);
    expect(refreshUpdates.every(item => item.patch.updatedByUid === 'admin-a' && !('status' in item.patch))).toBe(true);
    expect(refreshUpdates.every(item => !('sourceRefs' in item.patch))).toBe(true);
    expect(firestore.updates.filter(item => item.id.startsWith('resolve-'))).toHaveLength(8);
    expect(firestore.updates.filter(item => item.id.startsWith('resolve-')).every(item => item.patch.status === 'resolved')).toBe(true);
  });

  it('deduplicates repeated detection and existing IDs before counting transaction targets', async () => {
    const repeatedDetection = detection('duplicate', { id: 'duplicate-id' });
    const repeatedExisting = opportunity({ id: 'existing-id', status: 'open' });
    firestore.getDocs
      .mockResolvedValueOnce(opportunitySnapshot([repeatedExisting, repeatedExisting]))
      .mockResolvedValueOnce(opportunitySnapshot([]));
    useRecordedTransactions([repeatedExisting]);

    await reconcileGrowthAIOpportunities('tenant-a', [repeatedDetection, repeatedDetection]);

    expect(firestore.transactionTargetIds).toEqual([['duplicate-id', 'existing-id']]);
    expect(new Set(firestore.transactionTargetIds.flat()).size).toBe(2);
  });

  it('keeps review-request source reference refresh behavior unchanged', async () => {
    const current = opportunity({
      id: 'review_request__customer-a',
      type: 'review_request',
      pillar: 'reputation',
      sourceRefs: { bookingId: 'booking-old', customerId: 'customer-a' },
    });
    const refreshed = detection('review', {
      id: current.id,
      type: 'review_request',
      pillar: 'reputation',
      sourceRefs: { bookingId: 'booking-new', customerId: 'customer-a' },
    });
    firestore.getDocs.mockResolvedValueOnce(opportunitySnapshot([current])).mockResolvedValueOnce(opportunitySnapshot([current]));
    useRecordedTransactions([current]);

    await reconcileGrowthAIOpportunities('tenant-a', [refreshed]);

    expect(firestore.updates).toHaveLength(1);
    expect(firestore.updates[0].patch.sourceRefs).toEqual(refreshed.sourceRefs);
  });

  it('continues to leave dismissed and resolved opportunities unchanged', async () => {
    const dismissed = opportunity({ id: 'dismissed-a', status: 'dismissed' });
    const resolved = opportunity({ id: 'resolved-a', status: 'resolved' });
    firestore.getDocs.mockResolvedValue(opportunitySnapshot([dismissed, resolved]));

    await reconcileGrowthAIOpportunities('tenant-a', [detection('dismissed', { id: dismissed.id })]);

    expect(firestore.runTransaction).not.toHaveBeenCalled();
    expect(firestore.sets).toEqual([]);
    expect(firestore.updates).toEqual([]);
  });

  it('propagates a middle-chunk failure without starting later chunks', async () => {
    const detections = Array.from({ length: 45 }, (_, index) => detection(index));
    firestore.getDocs.mockResolvedValue(opportunitySnapshot([]));
    let transactionNumber = 0;
    firestore.runTransaction.mockImplementation(async (_db, callback) => {
      transactionNumber += 1;
      if (transactionNumber === 2) throw new Error('middle chunk failed');
      return callback(transactionRecorder());
    });

    await expect(reconcileGrowthAIOpportunities('tenant-a', detections)).rejects.toThrow('middle chunk failed');

    expect(firestore.runTransaction).toHaveBeenCalledTimes(2);
    expect(firestore.transactionTargetIds.map(ids => ids.length)).toEqual([20]);
    expect(firestore.sets).toHaveLength(20);
    expect(firestore.getDocs).toHaveBeenCalledTimes(1);
  });
});
