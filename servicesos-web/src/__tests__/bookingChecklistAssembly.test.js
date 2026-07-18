import { describe, expect, it } from 'vitest';
import {
  CHECKLIST_READINESS,
  CHECKLIST_SUGGESTED_LABEL,
  assembleBookingChecklist,
  bookingChecklistReadiness,
  buildApprovedChecklistSnapshot,
  checklistExecutionCopy,
  findRecurringChecklistReuseCandidate,
} from '../core/checklists/bookingChecklistAssembly';
import { getChecklistTemplate, listChecklistTemplates } from '../core/checklists/checklistTemplateRegistry';

const baseBooking = (overrides = {}) => ({
  id: 'booking-1',
  tenantId: 'tenant-a',
  customerId: 'customer-a',
  propertyId: 'property-a',
  serviceType: 'standard',
  paymentStatus: 'not_paid',
  agreedPrice: 185,
  date: '2026-07-20',
  startTime: '09:00',
  assignedEmployeeAuthUid: 'employee-a',
  propertySnapshot: {
    roomCounts: {
      bedrooms: 2,
      bathrooms: 1,
      kitchens: 1,
      livingRooms: 1,
      diningRooms: 0,
      offices: 0,
      closets: 0,
    },
    household: { petCount: 0, petHairLevel: 'none' },
  },
  requestSnapshot: {
    cleaningType: 'standard',
    frequency: 'one-time',
    serviceScope: {},
  },
  ...overrides,
});

const itemRepresentsSourceLine = (item, label) => item.label === label ||
  item.jobAidSteps.some(step => step.label === label);

const resultRepresentsSourceLine = (result, label) => result.items.some(item => itemRepresentsSourceLine(item, label));

describe('booking checklist assembly', () => {
  it('selects Standard One-Time Clean for a standard one-time booking', () => {
    const result = assembleBookingChecklist(baseBooking());
    expect(result.success).toBe(true);
    expect(result.template.templateId).toBe('standard-one-time');
    expect(result.template.templateName).toBe('Standard One-Time Clean');
    expect(resultRepresentsSourceLine(result, 'Review service request')).toBe(true);
  });

  it('selects Deep Clean and canonical room modules', () => {
    const result = assembleBookingChecklist(baseBooking({
      serviceType: 'deep',
      requestSnapshot: { cleaningType: 'deep', frequency: 'one-time', serviceScope: {} },
    }));
    expect(result.template.templateId).toBe('deep-clean');
    expect(result.items.some(item => item.area === 'Bathroom / Vanity and Sink' &&
      item.jobAidSteps.some(step => step.label === 'Sanitize basin'))).toBe(true);
    expect(result.items.some(item => item.area === 'Kitchen / Heavy Grease Removal')).toBe(true);
  });

  it('selects Move-Out Clean for an unambiguous move-out booking', () => {
    const result = assembleBookingChecklist(baseBooking({
      serviceType: 'move-out',
      requestSnapshot: { cleaningType: 'move-out', frequency: 'one-time', serviceScope: {} },
    }));
    expect(result.template.templateId).toBe('move-out-clean');
    expect(resultRepresentsSourceLine(result, 'Ready for inspection')).toBe(true);
  });

  it('keeps standard recurring and maintenance as separate templates', () => {
    const recurring = assembleBookingChecklist(baseBooking({
      serviceType: 'recurring',
      requestSnapshot: { cleaningType: 'recurring', frequency: 'bi-weekly', serviceScope: {} },
    }));
    const maintenance = assembleBookingChecklist(baseBooking({
      serviceType: 'maintenance',
      requestSnapshot: { cleaningType: 'maintenance', frequency: 'monthly', serviceScope: {} },
    }));
    expect(recurring.template.templateId).toBe('standard-recurring');
    expect(maintenance.template.templateId).toBe('maintenance');
  });

  it('uses selected rooms to exclude room task groups with a zero count', () => {
    const result = assembleBookingChecklist(baseBooking({
      serviceType: 'deep',
      propertySnapshot: {
        roomCounts: { bedrooms: 0, bathrooms: 1, kitchens: 1, livingRooms: 0, diningRooms: 0, offices: 0, closets: 0 },
        household: { petCount: 0, petHairLevel: 'none' },
      },
      requestSnapshot: { cleaningType: 'deep', frequency: 'one-time', serviceScope: {} },
    }));
    expect(result.items.some(item => item.area.startsWith('Bathroom'))).toBe(true);
    expect(result.items.some(item => item.area.startsWith('Kitchen'))).toBe(true);
    expect(result.items.some(item => item.area.startsWith('Bedroom'))).toBe(false);
    expect(result.items.some(item => item.area.startsWith('Living Room'))).toBe(false);
    expect(result.items.some(item => item.area === 'Closets')).toBe(false);
  });

  it('adds selected approved add-ons and excludes declined add-ons', () => {
    const result = assembleBookingChecklist(baseBooking({
      requestSnapshot: {
        cleaningType: 'standard',
        frequency: 'one-time',
        serviceScope: { oven: true, fridge: false, insideCabinets: true },
      },
    }));
    expect(result.items.some(item => item.label === 'Interior oven cleaning')).toBe(true);
    expect(result.items.some(item => item.label === 'Interior cabinets')).toBe(true);
    expect(result.items.some(item => item.label === 'Interior refrigerator cleaning')).toBe(false);
    expect(result.items.find(item => item.label === 'Interior oven cleaning')?.required).toBe(false);
  });

  it('preserves the Initial Deep closet group without duplicating canonical room tasks', () => {
    const result = assembleBookingChecklist(baseBooking({
      serviceType: 'deep',
      propertySnapshot: {
        roomCounts: { bedrooms: 0, bathrooms: 0, kitchens: 0, livingRooms: 0, diningRooms: 0, offices: 0, closets: 1 },
        household: { petCount: 0, petHairLevel: 'none' },
      },
      requestSnapshot: { cleaningType: 'deep', frequency: 'one-time', serviceScope: {} },
    }));
    const closetItems = result.items.filter(item => item.area === 'Closets');
    expect(closetItems.some(item => itemRepresentsSourceLine(item, 'Dust shelving'))).toBe(true);
    expect(closetItems.flatMap(item => item.jobAidSteps.map(step => step.label)).filter(label => label === 'Dust shelving')).toHaveLength(1);
  });

  it('warns instead of silently dropping an unmapped add-on', () => {
    const result = assembleBookingChecklist(baseBooking({
      requestSnapshot: {
        cleaningType: 'standard',
        frequency: 'one-time',
        serviceScope: { garageCleaning: true },
      },
    }));
    expect(result.warnings).toContain('Unknown add-on: garageCleaning. Owner mapping is required.');
  });

  it('does not duplicate an unmapped service warning in readiness', () => {
    const booking = baseBooking({ serviceType: 'airbnb-turnover', requestSnapshot: { cleaningType: 'airbnb-turnover' } });
    const result = bookingChecklistReadiness(booking, []);
    expect(result.reasons).toEqual(['No mapped service checklist for "airbnb-turnover".']);
  });

  it('falls back to manual owner selection for missing or ambiguous service scope', () => {
    const missing = assembleBookingChecklist(baseBooking({ serviceType: '', requestSnapshot: {}, formData: {} }));
    const ambiguous = assembleBookingChecklist(baseBooking({
      serviceType: 'moveout',
      requestSnapshot: { cleaningType: 'moveout', frequency: 'one-time' },
    }));
    expect(missing).toMatchObject({ success: false, readiness: CHECKLIST_READINESS.NOT_PREPARED });
    expect(ambiguous.success).toBe(false);
    expect(ambiguous.warnings[0]).toMatch(/ambiguous/i);
    expect(assembleBookingChecklist(baseBooking({ serviceType: '' }), { templateId: 'kitchen-focus' }).template.templateId).toBe('kitchen-focus');
  });

  it('marks every new suggestion for owner review', () => {
    const result = assembleBookingChecklist(baseBooking());
    expect(result.label).toBe(CHECKLIST_SUGGESTED_LABEL);
    expect(result.readiness).toBe(CHECKLIST_READINESS.NEEDS_ATTENTION);
    expect(result.readinessReasons).toContain('Checklist has not been reviewed.');
  });

  it('keeps planning-source traceability and method-library extension fields', () => {
    const result = assembleBookingChecklist(baseBooking());
    expect(result.template).toMatchObject({
      sourceRepository: 'C:/Users/merce/Documents/SLAI_Real/Planning',
      templateId: 'standard-one-time',
      templateName: 'Standard One-Time Clean',
      templateVersion: '2.0.0',
    });
    expect(result.template.sourceFiles).toContain('01_ServicesOS/Service Checklist/One-Time Cleaning Checklist.md');
    expect(result.items.every(item => Array.isArray(item.approvedMethodIds) && item.preferredMethodId === null)).toBe(true);
    expect(result.items.every(item => Array.isArray(item.sourceReferences) && item.sourceReferences.length > 0)).toBe(true);
  });

  it('groups bathroom fixture micro-steps into stable room outcomes', () => {
    const template = getChecklistTemplate('bathroom-focus');
    const vanity = template.items.find(item => item.area === 'Bathroom / Vanity and Sink');
    const mirror = template.items.find(item => item.area === 'Bathroom / Mirror');

    expect(vanity).toMatchObject({
      id: 'bathroom-core-clean-vanity-sink-basin-faucet-countertops-edges-and-corners',
      label: 'Clean vanity, sink basin, faucet, countertops, edges, and corners',
      completionCriteria: expect.stringContaining('water spots'),
    });
    expect(vanity.jobAidSteps.map(step => step.label)).toEqual(expect.arrayContaining([
      'Clean basin', 'Clean faucet', 'Polish faucet', 'Remove water spots', 'Inspect for buildup',
      'Clean countertops', 'Clean corners',
    ]));
    expect(mirror).toMatchObject({ label: 'Clean mirror to a streak-free finish' });
    expect(mirror.jobAidSteps.map(step => step.label)).toEqual([
      'Clean mirror',
      'Remove streaks',
      'Inspect from multiple angles',
    ]);
  });

  it('collapses kitchen preparation, cleaning, and inspection into concise parents', () => {
    const template = getChecklistTemplate('kitchen-focus');
    const countertops = template.items.find(item => item.area === 'Kitchen / Countertops and Backsplash');

    expect(template.items).toHaveLength(9);
    expect(countertops).toMatchObject({
      label: 'Clear permitted items and clean countertops, backsplash, edges, and corners',
      completionCriteria: expect.stringContaining('visible debris'),
    });
    expect(countertops.jobAidSteps.map(step => step.label)).toEqual(expect.arrayContaining([
      'Remove loose debris', 'Move accessible items', 'Clean countertops', 'Clean backsplash',
      'No visible debris', 'No visible residue',
    ]));
    expect(template.items.some(item => /prepar|final inspection/i.test(item.label) && item !== template.items.at(-1))).toBe(false);
  });

  it('keeps parent IDs unique and the core template counts usable', () => {
    const templates = Object.fromEntries(listChecklistTemplates().map(template => [template.templateId, template]));
    Object.values(templates).forEach(template => {
      expect(new Set(template.items.map(item => item.id)).size).toBe(template.items.length);
    });
    expect(templates.maintenance.items.length).toBeGreaterThanOrEqual(15);
    expect(templates.maintenance.items.length).toBeLessThanOrEqual(30);
    expect(templates['standard-recurring'].items.length).toBeGreaterThanOrEqual(20);
    expect(templates['standard-recurring'].items.length).toBeLessThanOrEqual(45);
    expect(templates['standard-one-time'].items.length).toBeGreaterThanOrEqual(25);
    expect(templates['standard-one-time'].items.length).toBeLessThanOrEqual(50);
  });

  it('assembles a concise Bathroom and Kitchen Deep Clean without losing source guidance', () => {
    const result = assembleBookingChecklist(baseBooking({
      serviceType: 'deep',
      propertySnapshot: {
        roomCounts: {
          bedrooms: 0, bathrooms: 1, kitchens: 1, livingRooms: 0, diningRooms: 0,
          offices: 0, closets: 0, laundryRooms: 0,
        },
        household: { petCount: 0, petHairLevel: 'none' },
      },
      requestSnapshot: {
        cleaningType: 'deep',
        frequency: 'one-time',
        serviceScope: { oven: true },
      },
    }));
    const representedSourceLines = result.items.reduce((count, item) => count + (item.jobAidSteps.length || 1), 0);

    expect(result.items).toHaveLength(33);
    expect(result.items.filter(item => item.required)).toHaveLength(30);
    expect(result.items.filter(item => !item.required)).toHaveLength(3);
    expect(result.items.filter(item => item.area.startsWith('Bathroom'))).toHaveLength(9);
    expect(result.items.filter(item => item.area.startsWith('Kitchen'))).toHaveLength(11);
    expect(result.items.reduce((count, item) => count + item.jobAidSteps.length, 0)).toBe(212);
    expect(representedSourceLines).toBe(212);
    expect(result.items.filter(item => item.id.startsWith('addon-')).map(item => item.label)).toEqual(['Interior oven cleaning']);
    expect(result.items.some(item => /\boutcome\b/i.test(item.label))).toBe(false);
    expect(result.items.some(item => /^(sanitize|sanitized|disinfect)/i.test(item.label))).toBe(false);
  });

  it('keeps sanitizing source guidance conditional instead of creating routine parent tasks', () => {
    const templates = ['bathroom-focus', 'kitchen-focus'].map(getChecklistTemplate);
    const allItems = templates.flatMap(template => template.items);
    const sanitizingSteps = allItems.flatMap(item => item.jobAidSteps)
      .filter(step => /\b(sanitiz|disinfect)/i.test(step.label));

    expect(allItems.some(item => /^(sanitize|sanitized|disinfect)/i.test(item.label))).toBe(false);
    expect(sanitizingSteps.length).toBeGreaterThan(0);
    expect(sanitizingSteps.every(step => /explicitly included/i.test(step.condition))).toBe(true);
    expect(allItems.some(item => item.warnings.some(warning => /contact time/i.test(warning)))).toBe(true);
  });

  it('keeps conditional language and selected add-ons separately trackable', () => {
    const result = assembleBookingChecklist(baseBooking({
      requestSnapshot: {
        cleaningType: 'standard',
        frequency: 'one-time',
        serviceScope: { oven: true },
      },
    }));
    const conditional = result.items.find(item => item.condition === 'if requested' ||
      item.jobAidSteps.some(step => step.condition === 'if requested'));
    const oven = result.items.find(item => item.label === 'Interior oven cleaning');

    expect(conditional).toBeDefined();
    expect(oven).toMatchObject({ required: false });
    expect(oven.id).toContain('addon-oven');
  });

  it('creates an immutable owner-approved booking snapshot with provenance', () => {
    const booking = baseBooking();
    const assembly = assembleBookingChecklist(booking);
    const built = buildApprovedChecklistSnapshot({
      booking,
      assembly,
      items: assembly.items,
      reviewedBy: 'owner-a',
      now: '2026-07-17T12:00:00.000Z',
    });
    expect(built.success).toBe(true);
    expect(built.data).toMatchObject({
      ownerApproved: true,
      templateId: 'standard-one-time',
      provenance: {
        assemblyMethod: 'booking_scope',
        sourceBookingId: 'booking-1',
        sourceServiceType: 'standard',
        ownerApproved: true,
      },
    });
    expect(built.data.items.some(item => item.jobAidSteps.length > 0)).toBe(true);
    expect(built.data.items.every(item => Array.isArray(item.warnings))).toBe(true);
    expect(built.data.items.every(item => Array.isArray(item.sourceReferences))).toBe(true);
    expect(built.data.provenance.sourceScopeSnapshot).not.toHaveProperty('paymentStatus');
    expect(checklistExecutionCopy(built.data).every(item => item.completed === false)).toBe(true);
  });

  it('does not let later registry object changes alter an existing snapshot', () => {
    const booking = baseBooking();
    const assembly = assembleBookingChecklist(booking);
    const built = buildApprovedChecklistSnapshot({ booking, assembly, items: assembly.items, reviewedBy: 'owner-a' });
    const originalLabel = built.data.items[0].label;
    const laterTemplateRead = getChecklistTemplate('standard-one-time');
    laterTemplateRead.items[0].label = 'Changed later';
    expect(built.data.items[0].label).toBe(originalLabel);
    expect(getChecklistTemplate('standard-one-time').items[0].label).toBe(originalLabel);
  });

  it('reuses an approved recurring snapshot only when material scope matches', () => {
    const booking = baseBooking({
      id: 'current',
      serviceType: 'recurring',
      requestSnapshot: { cleaningType: 'recurring', frequency: 'bi-weekly', serviceScope: { oven: false } },
    });
    const assembly = assembleBookingChecklist(booking);
    const priorBuilt = buildApprovedChecklistSnapshot({
      booking: { ...booking, id: 'prior' },
      assembly,
      items: assembly.items,
      reviewedBy: 'owner-a',
      now: '2026-07-01T12:00:00.000Z',
    });
    const prior = { ...booking, id: 'prior', jobChecklistSnapshot: priorBuilt.data };
    expect(findRecurringChecklistReuseCandidate(booking, [prior])).toMatchObject({ id: 'prior' });

    const changed = {
      ...booking,
      requestSnapshot: { ...booking.requestSnapshot, serviceScope: { oven: true } },
    };
    expect(findRecurringChecklistReuseCandidate(changed, [prior])).toBeNull();
  });

  it('marks an approved packet Needs attention when booking scope later changes', () => {
    const original = baseBooking();
    const assembly = assembleBookingChecklist(original);
    const built = buildApprovedChecklistSnapshot({ booking: original, assembly, items: assembly.items, reviewedBy: 'owner-a' });
    const changed = {
      ...original,
      requestSnapshot: { ...original.requestSnapshot, specialRequests: 'New fragile surface instruction.' },
      jobChecklistSnapshot: built.data,
    };
    expect(bookingChecklistReadiness(changed, [])).toEqual({
      status: CHECKLIST_READINESS.NEEDS_ATTENTION,
      reasons: ['Booking scope changed since prior approval.'],
    });
  });

  it('requires owner review when an approved snapshot contains duplicate item IDs', () => {
    const booking = baseBooking();
    const assembly = assembleBookingChecklist(booking);
    const built = buildApprovedChecklistSnapshot({ booking, assembly, items: assembly.items, reviewedBy: 'owner-a' });
    const duplicate = {
      ...booking,
      jobChecklistSnapshot: {
        ...built.data,
        items: [built.data.items[0], { ...built.data.items[1], id: built.data.items[0].id }],
      },
    };

    expect(bookingChecklistReadiness(duplicate, [])).toEqual({
      status: CHECKLIST_READINESS.NEEDS_ATTENTION,
      reasons: ['Approved checklist data is invalid. Owner review is required.'],
    });
  });

  it('does not mutate price, payment, schedule, customer, or assignment fields', () => {
    const booking = baseBooking();
    const before = structuredClone(booking);
    const result = assembleBookingChecklist(booking);
    expect(booking).toEqual(before);
    expect(result.sourceScopeSnapshot).not.toHaveProperty('paymentStatus');
    expect(result.sourceScopeSnapshot).not.toHaveProperty('agreedPrice');
    expect(result.sourceScopeSnapshot).not.toHaveProperty('assignedEmployeeAuthUid');
    expect(bookingChecklistReadiness(booking, []).status).toBe(CHECKLIST_READINESS.NEEDS_ATTENTION);
  });
});
