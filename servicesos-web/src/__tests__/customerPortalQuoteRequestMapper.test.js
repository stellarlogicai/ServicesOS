import { describe, expect, it } from 'vitest';

import {
  buildCustomerPortalQuoteIntakeDraft,
  buildQuoteRequestSnapshot,
  normalizeAIPhotoEstimateData,
  normalizeIntakeFormData
} from '../services/customerPortalQuoteRequestMapper';

describe('Customer Portal quote request mapper', () => {
  it('maps IntakeForm-style data to customer, property, and quote request drafts', () => {
    const formData = {
      fullName: 'Avery Johnson',
      email: 'avery.customer@example.com',
      phone: '555-0100',
      preferredContactMethod: 'email',
      bestTimeToCall: 'Afternoons',
      address: '123 Test Lane',
      city: 'Springfield',
      state: 'MO',
      zipCode: '65804',
      squareFootage: '1450',
      bedrooms: 3,
      bathrooms: 1,
      halfBaths: 1,
      propertyType: 'House',
      levels: 2,
      garage: true,
      basement: false,
      cleaningType: 'standard',
      frequency: 'bi-weekly',
      pets: true,
      petCount: 2,
      petTypes: ['dog', 'cat'],
      condition: 'moderate',
      serviceScope: {
        baseboards: true,
        windows: false
      },
      preferredDate: '2026-07-01',
      preferredTime: '09:00',
      flexibleSchedule: true,
      specialRequests: 'Please focus on kitchen counters.'
    };

    const draft = buildCustomerPortalQuoteIntakeDraft({
      formData,
      sourceFormat: 'intake-form',
      tenantId: 'tenant-test',
      customerId: 'customer-test',
      propertyId: 'property-test',
      authUid: 'auth-test',
      estimate: {
        laborHours: 4,
        priceLow: 180,
        priceHigh: 240,
        requiresReview: false
      },
      submittedAt: '2026-06-22T12:00:00.000Z'
    });

    expect(draft.customerProfileDraft).toMatchObject({
      tenantId: 'tenant-test',
      customerId: 'customer-test',
      authUid: 'auth-test',
      name: 'Avery Johnson',
      email: 'avery.customer@example.com',
      phone: '555-0100'
    });
    expect(draft.propertyProfileDraft).toMatchObject({
      tenantId: 'tenant-test',
      customerId: 'customer-test',
      propertyId: 'property-test',
      address: '123 Test Lane',
      bedrooms: 3,
      bathrooms: 1,
      halfBaths: 1,
      garage: true
    });
    expect(draft.propertyProfileDraft.household).toMatchObject({
      pets: true,
      petCount: 2,
      petTypes: ['dog', 'cat']
    });
    expect(draft.quoteRequestDraft).toMatchObject({
      type: 'quote_request',
      source: 'customer-portal',
      status: 'new',
      customerId: 'customer-test',
      propertyId: 'property-test'
    });
    expect(draft.quoteRequestDraft.requestSnapshot).toMatchObject({
      cleaningType: 'standard',
      frequency: 'bi-weekly',
      preferredDate: '2026-07-01',
      preferredTime: '09:00',
      specialRequests: 'Please focus on kitchen counters.'
    });
    expect(draft.quoteRequestDraft.requestSnapshot.rawInput.fullName).toBe('Avery Johnson');
  });

  it('maps AIPhotoEstimateSystem-style data to the normalized quote intake shape', () => {
    const formData = {
      firstName: 'Maya',
      lastName: 'Rivera',
      email: 'maya.rivera@example.com',
      phone: '555-0200',
      address: '44 Example Court',
      city: 'Tulsa',
      state: 'OK',
      zip: '74104',
      bedroomCount: 4,
      bathroomCount: 2,
      kitchenCount: 1,
      livingRoomCount: 2,
      diningRoomCount: 1,
      officeCount: 1,
      basementCount: 1,
      stairs: true,
      stairsCount: 2,
      petHairLevel: 'heavy',
      clutterLevel: 'high',
      lastCleaned: 'six months ago',
      cleaningType: 'deep',
      frequency: 'one-time',
      extras: {
        oven: true,
        fridge: true,
        windows: true,
        cabinetsInside: true,
        petWasteRemoval: true
      },
      specialRequests: 'Use unscented products and check the guest room closet.',
      preferredDate: '2026-07-05',
      preferredTime: '13:00'
    };

    const normalized = normalizeAIPhotoEstimateData(formData);
    const draft = buildCustomerPortalQuoteIntakeDraft({
      formData,
      sourceFormat: 'ai-photo-estimate',
      tenantId: 'tenant-test',
      customerId: 'customer-ai',
      propertyId: 'property-ai'
    });

    expect(normalized.customer.fullName).toBe('Maya Rivera');
    expect(normalized.property).toMatchObject({
      zipCode: '74104',
      bedrooms: 4,
      bathrooms: 2,
      stairs: true,
      stairsCount: 2
    });
    expect(normalized.property.roomCounts).toMatchObject({
      kitchens: 1,
      livingRooms: 2,
      diningRooms: 1,
      offices: 1,
      basements: 1
    });
    expect(normalized.household).toMatchObject({
      pets: true,
      petHairLevel: 'heavy'
    });
    expect(normalized.requestDetails).toMatchObject({
      cleaningType: 'deep',
      frequency: 'one-time',
      clutterLevel: 'high',
      lastCleaned: 'six months ago',
      specialRequests: 'Use unscented products and check the guest room closet.'
    });
    expect(draft.quoteRequestDraft.requestSnapshot.serviceScope).toMatchObject({
      oven: true,
      fridge: true,
      windows: true,
      insideCabinets: true,
      petWasteRemoval: true
    });
  });

  it('uses safe defaults when optional fields are missing', () => {
    const draft = buildCustomerPortalQuoteIntakeDraft({
      formData: {},
      submittedAt: '2026-06-22T13:00:00.000Z'
    });

    expect(draft.customerProfileDraft).toMatchObject({
      name: '',
      email: '',
      phone: '',
      source: 'customer-portal',
      status: 'active'
    });
    expect(draft.propertyProfileDraft).toMatchObject({
      label: 'Home',
      propertyType: 'House',
      bedrooms: 0,
      bathrooms: 0,
      garage: false,
      basement: false
    });
    expect(draft.quoteRequestDraft.requestSnapshot).toMatchObject({
      cleaningType: 'standard',
      frequency: 'one-time',
      clutterLevel: 'normal',
      preferredDate: '',
      preferredTime: '',
      submittedAt: '2026-06-22T13:00:00.000Z'
    });
  });

  it('merges returning customer saved property data with changed intake fields', () => {
    const savedProperty = {
      propertyId: 'saved-property',
      label: 'Primary home',
      address: '500 Saved Street',
      city: 'Kansas City',
      state: 'MO',
      zipCode: '64101',
      bedrooms: 3,
      bathrooms: 1,
      household: {
        pets: true,
        petCount: 1,
        petTypes: ['dog'],
        petHairLevel: 'medium'
      },
      roomCounts: {
        bedrooms: 3,
        bathrooms: 1,
        kitchens: 1
      },
      cleaningDefaults: {
        preferredFrequency: 'monthly',
        defaultServiceScope: {
          baseboards: true
        }
      }
    };

    const draft = buildCustomerPortalQuoteIntakeDraft({
      formData: {
        bedrooms: 4,
        cleaningType: 'standard',
        preferredDate: '2026-07-10',
        preferredTime: '11:30',
        changeNotes: 'One bedroom was added since the last cleaning.'
      },
      savedProperty,
      customerId: 'returning-customer',
      propertyId: 'saved-property'
    });

    expect(draft.propertyProfileDraft).toMatchObject({
      propertyId: 'saved-property',
      label: 'Primary home',
      address: '500 Saved Street',
      city: 'Kansas City',
      state: 'MO',
      zipCode: '64101',
      bedrooms: 4,
      bathrooms: 1
    });
    expect(draft.propertyProfileDraft.household).toMatchObject({
      pets: true,
      petCount: 1,
      petTypes: ['dog'],
      petHairLevel: 'medium'
    });
    expect(draft.quoteRequestDraft.requestSnapshot).toMatchObject({
      preferredDate: '2026-07-10',
      preferredTime: '11:30',
      changeNotes: 'One bedroom was added since the last cleaning.'
    });
  });

  it('creates quote snapshots that do not mutate when saved property data changes later', () => {
    const normalizedData = normalizeIntakeFormData({
      fullName: 'Jordan Lee',
      email: 'jordan.lee@example.com',
      address: '10 Original Road',
      city: 'Rogers',
      state: 'AR',
      zipCode: '72756',
      bedrooms: 2,
      bathrooms: 2,
      pets: true,
      petTypes: ['cat'],
      preferredDate: '2026-07-12'
    });
    const propertyProfile = {
      propertyId: 'property-immutable',
      address: '10 Original Road',
      bedrooms: 2,
      household: {
        pets: true,
        petTypes: ['cat']
      }
    };
    const snapshot = buildQuoteRequestSnapshot({
      normalizedData,
      customerProfile: {
        customerId: 'customer-immutable',
        name: 'Jordan Lee',
        email: 'jordan.lee@example.com'
      },
      propertyProfile,
      submittedAt: '2026-06-22T14:00:00.000Z'
    });

    propertyProfile.address = '999 Changed Road';
    propertyProfile.household.petTypes.push('dog');

    expect(snapshot.propertySnapshot.address).toBe('10 Original Road');
    expect(snapshot.propertySnapshot.household.petTypes).toEqual(['cat']);
    expect(snapshot.requestSnapshot.rawInput.address).toBe('10 Original Road');
  });

  it('preserves pet, clutter, last-cleaned, add-on, and customer note fields', () => {
    const normalized = normalizeAIPhotoEstimateData({
      firstName: 'Sam',
      lastName: 'Patel',
      petHairLevel: 'medium',
      clutterLevel: 'moderate',
      lastCleaned: 'two months ago',
      extras: {
        baseboards: true,
        blindCleaning: true,
        wallSpotCleaning: true
      },
      notes: 'Customer prefers text before arrival.'
    });

    expect(normalized.household.petHairLevel).toBe('medium');
    expect(normalized.requestDetails).toMatchObject({
      clutterLevel: 'moderate',
      lastCleaned: 'two months ago',
      specialRequests: 'Customer prefers text before arrival.'
    });
    expect(normalized.requestDetails.serviceScope).toMatchObject({
      baseboards: true,
      blindCleaning: true,
      wallSpotCleaning: true
    });
  });
});
