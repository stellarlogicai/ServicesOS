import { describe, expect, it } from 'vitest';
import { assembleBookingChecklist } from '../core/checklists/bookingChecklistAssembly';
import { buildDailyPrepSummary } from '../core/checklists/dailyPrepAggregation';
import { buildSystemDefaultAdoption, normalizeCleaningRecord } from '../modules/cleaning/products/cleaningProductModel';
import { getStarterCleaningMethods } from '../modules/cleaning/products/starterCleaningMethods';

function booking(overrides = {}) {
  return {
    id: 'job-a',
    customerName: 'First Job',
    date: '2026-07-22',
    startTime: '08:00',
    status: 'scheduled',
    serviceType: 'standard',
    address: '100 Test Lane',
    propertySnapshot: { roomCounts: { bathrooms: 1, kitchens: 1 } },
    requestSnapshot: { cleaningType: 'standard', frequency: 'one-time', serviceScope: {} },
    ...overrides,
  };
}

function withApprovedSnapshot(base, items) {
  return {
    ...base,
    jobChecklistSnapshot: {
      ownerApproved: true,
      items,
      provenance: { sourceScopeSignature: assembleBookingChecklist(base).sourceScopeSignature },
    },
  };
}

function item(overrides = {}) {
  return {
    id: 'standard-one-time-bathroom-shower-or-tub-required-1',
    area: 'Bathroom / Shower or Tub',
    fixtureOrSurface: 'Shower or Tub',
    label: 'Complete shower or tub',
    required: true,
    completed: false,
    approvedMethodIds: [],
    preferredMethodId: null,
    ...overrides,
  };
}

function adoptedMethod(sourceId, overrides = {}) {
  const source = getStarterCleaningMethods().find(record => record.id === sourceId);
  return normalizeCleaningRecord({
    ...buildSystemDefaultAdoption(source, {
      id: `adopted-${sourceId}`,
      tenantId: 'tenant-a',
      actorUid: 'owner-a',
    }),
    status: 'approved',
    employeeVisible: true,
    ownerReviewNotes: 'Approved for local use.',
    ...overrides,
  });
}

function commercialProduct(overrides = {}) {
  return normalizeCleaningRecord({
    id: 'commercial-a',
    recordType: 'commercial_product',
    scope: 'tenant',
    tenantId: 'tenant-a',
    name: 'Exact Commercial Product',
    category: 'bathroom cleaner',
    classification: 'cleaning',
    status: 'approved',
    employeeVisible: true,
    brand: 'Test Brand',
    productName: 'Surface Cleaner',
    variant: 'Unscented',
    manufacturer: 'Test Manufacturer',
    containerSize: '24 oz',
    prohibitedSurfaces: ['Natural stone'],
    requiredTools: ['Blue microfiber cloth'],
    requiredPPE: ['Gloves'],
    dangerousCombinations: ['Do not mix with bleach.'],
    ownerReviewNotes: 'Label reviewed.',
    ...overrides,
  });
}

describe('buildDailyPrepSummary', () => {
  it('deduplicates usable preparation across ordered jobs and preserves exact approved guidance', () => {
    const shower = adoptedMethod('ab-dawn-vinegar-shower-cleaner');
    const product = commercialProduct();
    const restricted = adoptedMethod('ab-mirror-cleaner', {
      id: 'restricted-mirror',
      status: 'restricted',
      ownerReviewNotes: 'Use only on the owner-approved mirror.',
    });
    const first = booking();
    const second = booking({ id: 'job-b', customerName: 'Second Job', startTime: '10:00' });
    const approvedFirst = withApprovedSnapshot(first, [
      item({ approvedMethodIds: [shower.id, product.id], preferredMethodId: shower.id }),
      item({ id: 'standard-one-time-bathroom-mirror-required-1', fixtureOrSurface: 'Mirror', approvedMethodIds: [restricted.id], preferredMethodId: restricted.id }),
    ]);
    const approvedSecond = withApprovedSnapshot(second, [
      item({ approvedMethodIds: [shower.id], preferredMethodId: shower.id }),
    ]);

    const before = JSON.stringify([approvedFirst, approvedSecond]);
    const summary = buildDailyPrepSummary({
      bookings: [approvedFirst, approvedSecond],
      tenantId: 'tenant-a',
      tenantMethods: [shower, product, restricted],
    });

    expect(summary.mixtures).toHaveLength(2);
    expect(summary.mixtures.filter(entry => entry.id === shower.id)).toHaveLength(1);
    expect(summary.mixtures.find(entry => entry.id === shower.id).jobs.map(job => job.label)).toEqual(['First Job', 'Second Job']);
    expect(summary.mixtures.find(entry => entry.id === restricted.id).record).toMatchObject({
      status: 'restricted',
      employeeVisible: true,
      ownerReviewNotes: 'Use only on the owner-approved mirror.',
    });
    expect(summary.commercialProducts).toEqual([expect.objectContaining({
      id: product.id,
      record: expect.objectContaining({
        brand: 'Test Brand',
        productName: 'Surface Cleaner',
        variant: 'Unscented',
        containerSize: '24 oz',
      }),
    })]);
    expect(summary.tools.filter(entry => entry.label === 'Dedicated chemical-resistant spray bottle')).toHaveLength(1);
    expect(summary.ppe.filter(entry => entry.label === 'Gloves')).toHaveLength(1);
    expect(summary.ppe.find(entry => entry.label === 'Gloves').jobs.map(job => job.label)).toEqual(['First Job', 'Second Job']);
    expect(summary.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Dawn and Vinegar Shower Cleaner: Never mix with bleach.' }),
      expect.objectContaining({ label: expect.stringContaining('restricted') }),
    ]));
    expect(JSON.stringify([approvedFirst, approvedSecond])).toBe(before);
  });

  it('excludes unusable, missing, cross-tenant, and unapproved-snapshot records from preparation', () => {
    const pending = adoptedMethod('ab-mirror-cleaner', { id: 'pending-method', status: 'pending_review', employeeVisible: false });
    const retired = adoptedMethod('ab-routine-toilet-bowl-cleaning-method', { id: 'retired-method', status: 'retired', employeeVisible: false });
    const crossTenant = adoptedMethod('ab-kitchen-grease-cleaner', { id: 'tenant-b-method', tenantId: 'tenant-b' });
    const base = booking();
    const approved = withApprovedSnapshot(base, [
      item({ approvedMethodIds: [pending.id] }),
      item({ id: 'standard-one-time-bathroom-toilet-required-1', fixtureOrSurface: 'Toilet', approvedMethodIds: [retired.id] }),
      item({ id: 'kitchen-deep-complete-approved-heavy-grease-removal', fixtureOrSurface: 'Kitchen grease', approvedMethodIds: ['missing-method'] }),
      item({ id: 'kitchen-core-clean-countertops', area: 'Kitchen / Countertops', fixtureOrSurface: 'Countertops' }),
      item({ id: 'standard-one-time-kitchen-floors-required-1', area: 'Kitchen / Floors', fixtureOrSurface: 'Floors' }),
      item({ id: 'cross-tenant-item', fixtureOrSurface: 'Cross-tenant method', approvedMethodIds: [crossTenant.id] }),
    ]);
    const noSnapshot = booking({ id: 'job-no-snapshot', customerName: 'Unprepared Job', startTime: '12:00' });
    const otherTenantJob = withApprovedSnapshot(
      booking({ id: 'tenant-b-job', customerName: 'Tenant B Job', tenantId: 'tenant-b', startTime: '14:00' }),
      [item({ approvedMethodIds: [crossTenant.id] })],
    );
    const summary = buildDailyPrepSummary({
      bookings: [approved, noSnapshot, otherTenantJob],
      tenantId: 'tenant-a',
      tenantMethods: [pending, retired, crossTenant],
    });

    expect(summary.mixtures).toHaveLength(0);
    expect(summary.commercialProducts).toHaveLength(0);
    expect(summary.needsAttention.map(entry => entry.reason).join(' ')).toMatch(/pending review/i);
    expect(summary.needsAttention.map(entry => entry.reason).join(' ')).toMatch(/retired/i);
    expect(summary.needsAttention.map(entry => entry.reason).join(' ')).toMatch(/missing tenant method/i);
    expect(summary.needsAttention.map(entry => entry.reason).join(' ')).toMatch(/no approved method mapping/i);
    expect(summary.needsAttention.map(entry => entry.reason).join(' ')).toMatch(/No approved current checklist snapshot/i);
    expect(summary.eligibleJobs.map(job => job.label)).not.toContain('Tenant B Job');
    expect(summary.needsAttention.map(entry => entry.job.label)).not.toContain('Tenant B Job');
  });
});
