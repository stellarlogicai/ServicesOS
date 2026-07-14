import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
  doc: vi.fn((_db, ...segments) => segments.join('/')),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}));

vi.mock('firebase/firestore', () => firestore);
vi.mock('../firebase', () => ({ db: 'db' }));

import {
  DEFAULT_AVAILABLE_DAYS,
  getBusinessSettings,
  saveBusinessSettings,
} from '../services/businessSettingsService';

describe('businessSettingsService', () => {
  beforeEach(() => Object.values(firestore).forEach(mock => mock.mockClear()));

  it('loads the tenant document and defaults missing availability to Monday-Friday', async () => {
    firestore.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        businessName: 'Tenant A',
        businessPhone: '555-root',
        businessSettings: {
          businessEmail: 'owner@example.com',
          businessAddress: '10 Main Street',
          websiteUrl: 'https://example.com',
          facebookUrl: 'https://facebook.com/auntb',
          defaultServiceNotes: 'Bring entry code.',
        },
        stripeAccountId: 'acct_123456789',
        chargesEnabled: true,
        payoutsEnabled: true,
        stripeConnectStatus: 'active',
        unrelated: 'preserved',
      }),
    });
    const result = await getBusinessSettings('tenant-a');
    expect(firestore.doc).toHaveBeenCalledWith('db', 'tenants', 'tenant-a');
    expect(result.availability.availableDays).toEqual(DEFAULT_AVAILABLE_DAYS);
    expect(result.businessName).toBe('Tenant A');
    expect(result.businessPhone).toBe('555-root');
    expect(result.businessEmail).toBe('owner@example.com');
    expect(result.businessAddress).toBe('10 Main Street');
    expect(result.websiteUrl).toBe('https://example.com');
    expect(result.facebookUrl).toBe('https://facebook.com/auntb');
    expect(result.defaultServiceNotes).toBe('Bring entry code.');
    expect(result.stripeConnection).toMatchObject({
      label: 'Connected',
      detail: 'Stripe is connected for booking payment links.',
      stripeAccountId: '...456789',
      chargesEnabled: true,
      payoutsEnabled: true,
      status: 'active',
    });
  });

  it('writes only the sanitized businessSettings field and generated updatedAt', async () => {
    await saveBusinessSettings('tenant-a', {
      businessName: ' Tenant A ',
      businessPhone: ' 555-0100 ',
      businessEmail: ' owner@example.com ',
      serviceArea: ' Bolivar ',
      businessAddress: ' 10 Main Street ',
      websiteUrl: ' https://auntb.example ',
      facebookUrl: ' https://facebook.com/auntb ',
      defaultServiceNotes: ' Bring entry code. ',
      availability: { availableDays: ['monday', 'saturday', 'invalid'] },
      stripeSecret: 'forbidden',
    }, { updatedByUid: ' admin-test ' });
    expect(firestore.updateDoc).toHaveBeenCalledWith('tenants/tenant-a', {
      businessSettings: {
        businessName: 'Tenant A',
        businessPhone: '555-0100',
        businessEmail: 'owner@example.com',
        serviceArea: 'Bolivar',
        businessAddress: '10 Main Street',
        websiteUrl: 'https://auntb.example',
        facebookUrl: 'https://facebook.com/auntb',
        defaultServiceNotes: 'Bring entry code.',
        availability: { availableDays: ['monday', 'saturday'] },
      },
      updatedAt: 'SERVER_TIMESTAMP',
      updatedByUid: 'admin-test',
    });
  });

  it('shows setup-needed Stripe status from tenant fields without exposing the full account id', async () => {
    firestore.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        businessName: 'Tenant A',
        stripeAccountId: 'acct_needs_setup_123456',
        chargesEnabled: false,
        payoutsEnabled: false,
        stripeAccountStatus: 'pending',
      }),
    });

    const result = await getBusinessSettings('tenant-a');

    expect(result.stripeConnection).toMatchObject({
      label: 'Needs setup',
      stripeAccountId: '...123456',
      chargesEnabled: false,
      payoutsEnabled: false,
      status: 'pending',
    });
    expect(result.stripeConnection.stripeAccountId).not.toContain('acct_needs_setup');
  });

  it('rejects missing tenant and empty days without writing', async () => {
    await expect(saveBusinessSettings('', {})).rejects.toThrow('Tenant ID');
    await expect(saveBusinessSettings('tenant-a', { availability: { availableDays: [] } })).rejects.toThrow('at least one');
    expect(firestore.updateDoc).not.toHaveBeenCalled();
  });
});
