import { describe, expect, it } from 'vitest';

import { buildCustomerPortalQuoteLeadPayload } from '../services/customerPortalQuoteLeadPayloadBuilder';
import { buildCustomerPortalQuoteIntakeDraft } from '../services/customerPortalQuoteRequestMapper';

const submittedAt = '2026-06-22T18:00:00.000Z';

function buildFakeQuoteIntakeDraft(overrides = {}) {
  return buildCustomerPortalQuoteIntakeDraft({
    formData: {
      fullName: 'Avery Johnson',
      email: 'avery.customer@example.com',
      phone: '555-0100',
      address: '123 Test Lane',
      city: 'Springfield',
      state: 'MO',
      zipCode: '65804',
      propertyType: 'House',
      squareFootage: '1450',
      bedrooms: 3,
      bathrooms: 1,
      halfBaths: 1,
      levels: 2,
      garage: true,
      basement: false,
      stairs: true,
      stairsCount: 1,
      cleaningType: 'deep',
      frequency: 'one-time',
      pets: true,
      petCount: 2,
      petTypes: ['dog', 'cat'],
      petHairLevel: 'heavy',
      clutterLevel: 'moderate',
      lastCleaned: 'one-to-three-months',
      serviceScope: {
        oven: true,
        baseboards: true,
        windows: false
      },
      surfaceNotes: 'Hardwood floors and stone counters.',
      accessInstructions: 'Use the side gate.',
      preferredDate: '2026-07-15',
      preferredTime: '10:30',
      flexibleSchedule: true,
      customerNotes: 'Please text before arrival.',
      specialRequests: 'Focus on kitchen and pet hair.'
    },
    sourceFormat: 'intake-form',
    tenantId: 'tenant-test',
    customerId: 'customer-test',
    propertyId: 'property-test',
    authUid: 'auth-test',
    submittedAt,
    ...overrides
  });
}

describe('Customer Portal quote lead payload builder', () => {
  it('builds a legacy-compatible lead payload from a quote intake draft', () => {
    const quoteIntakeDraft = buildFakeQuoteIntakeDraft();
    const payload = buildCustomerPortalQuoteLeadPayload(quoteIntakeDraft);

    expect(payload).toMatchObject({
      schemaVersion: 1,
      type: 'quote_request',
      source: 'customer-portal',
      status: 'new',
      tenantId: 'tenant-test',
      customerId: 'customer-test',
      propertyId: 'property-test',
      createdByAuthUid: 'auth-test',
      booking: null,
      createdAt: submittedAt,
      updatedAt: submittedAt
    });
  });

  it('includes required formData fields for dashboard and admin compatibility', () => {
    const payload = buildCustomerPortalQuoteLeadPayload(buildFakeQuoteIntakeDraft());

    expect(payload.formData).toMatchObject({
      fullName: 'Avery Johnson',
      firstName: 'Avery',
      lastName: 'Johnson',
      email: 'avery.customer@example.com',
      phone: '555-0100',
      address: '123 Test Lane',
      city: 'Springfield',
      state: 'MO',
      zipCode: '65804',
      zip: '65804',
      cleaningType: 'deep',
      serviceType: 'deep',
      frequency: 'one-time',
      bedrooms: 3,
      bathrooms: 1,
      halfBaths: 1,
      squareFootage: '1450',
      preferredDate: '2026-07-15',
      preferredTime: '10:30'
    });
  });

  it('uses a safe placeholder estimate that requires owner review', () => {
    const quoteIntakeDraft = buildFakeQuoteIntakeDraft({
      estimate: {
        priceLow: 200,
        priceHigh: 260,
        laborHours: 4,
        aiEnhanced: true
      }
    });
    const payload = buildCustomerPortalQuoteLeadPayload(quoteIntakeDraft);

    expect(payload.estimate).toEqual({
      priceLow: 0,
      priceHigh: 0,
      laborHours: 0,
      appointmentDuration: null,
      aiEnhanced: false,
      requiresReview: true,
      status: 'pending_owner_review'
    });
    expect(payload.review).toMatchObject({
      requiresOwnerReview: true,
      reviewReason: 'Customer Portal quote request needs owner review',
      reviewedBy: null,
      reviewedAt: null,
      ownerNotes: ''
    });
  });

  it('includes customer, property, and request snapshots', () => {
    const payload = buildCustomerPortalQuoteLeadPayload(buildFakeQuoteIntakeDraft());

    expect(payload.customerSnapshot).toMatchObject({
      customerId: 'customer-test',
      fullName: 'Avery Johnson',
      email: 'avery.customer@example.com',
      phone: '555-0100'
    });
    expect(payload.propertySnapshot).toMatchObject({
      propertyId: 'property-test',
      address: '123 Test Lane',
      bedrooms: 3,
      bathrooms: 1,
      household: {
        pets: true,
        petCount: 2,
        petHairLevel: 'heavy'
      }
    });
    expect(payload.requestSnapshot).toMatchObject({
      cleaningType: 'deep',
      frequency: 'one-time',
      preferredDate: '2026-07-15',
      preferredTime: '10:30',
      rawInput: {
        fullName: 'Avery Johnson'
      }
    });
  });

  it('throws clear errors before persistence inputs are complete', () => {
    const baseDraft = buildFakeQuoteIntakeDraft().quoteRequestDraft;

    expect(() =>
      buildCustomerPortalQuoteLeadPayload({ ...baseDraft, tenantId: null })
    ).toThrow('Customer Portal quote lead payload requires tenantId.');

    expect(() =>
      buildCustomerPortalQuoteLeadPayload({ ...baseDraft, createdByAuthUid: null })
    ).toThrow('Customer Portal quote lead payload requires auth uid.');

    expect(() =>
      buildCustomerPortalQuoteLeadPayload({ ...baseDraft, customerId: null })
    ).toThrow('Customer Portal quote lead payload requires customerId.');
  });

  it('preserves preferred date and time in appointmentRequest', () => {
    const payload = buildCustomerPortalQuoteLeadPayload(buildFakeQuoteIntakeDraft());

    expect(payload.appointmentRequest).toEqual({
      preferredDate: '2026-07-15',
      preferredTime: '10:30',
      flexibleSchedule: true,
      notes: 'Focus on kitchen and pet hair.',
      status: 'pending_review',
      requestedAt: submittedAt
    });
  });

  it('preserves add-ons, pets, clutter, pet hair, last-cleaned, and notes', () => {
    const payload = buildCustomerPortalQuoteLeadPayload(buildFakeQuoteIntakeDraft());

    expect(payload.formData).toMatchObject({
      pets: true,
      hasPets: true,
      petCount: 2,
      petTypes: ['dog', 'cat'],
      petHairLevel: 'heavy',
      clutterLevel: 'moderate',
      lastCleaned: 'one-to-three-months',
      surfaceNotes: 'Hardwood floors and stone counters.',
      accessInstructions: 'Use the side gate.',
      customerNotes: 'Please text before arrival.',
      notes: 'Focus on kitchen and pet hair.'
    });
    expect(payload.formData.serviceScope).toMatchObject({
      oven: true,
      baseboards: true,
      windows: false
    });
    expect(payload.requestSnapshot).toMatchObject({
      clutterLevel: 'moderate',
      lastCleaned: 'one-to-three-months',
      surfaceNotes: 'Hardwood floors and stone counters.',
      accessInstructions: 'Use the side gate.',
      customerNotes: 'Please text before arrival.',
      specialRequests: 'Focus on kitchen and pet hair.'
    });
  });

  it('does not mutate the input draft', () => {
    const quoteIntakeDraft = buildFakeQuoteIntakeDraft();
    const originalDraft = JSON.parse(JSON.stringify(quoteIntakeDraft));
    const payload = buildCustomerPortalQuoteLeadPayload(quoteIntakeDraft);

    payload.customerSnapshot.fullName = 'Changed Name';
    payload.propertySnapshot.household.petTypes.push('bird');
    payload.requestSnapshot.serviceScope.oven = false;

    expect(quoteIntakeDraft).toEqual(originalDraft);
    expect(quoteIntakeDraft.quoteRequestDraft.customerSnapshot.fullName).toBe('Avery Johnson');
    expect(quoteIntakeDraft.quoteRequestDraft.propertySnapshot.household.petTypes).toEqual([
      'dog',
      'cat'
    ]);
    expect(quoteIntakeDraft.quoteRequestDraft.requestSnapshot.serviceScope.oven).toBe(true);
  });
});
