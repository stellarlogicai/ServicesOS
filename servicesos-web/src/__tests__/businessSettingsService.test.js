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
      data: () => ({ businessName: 'Tenant A', unrelated: 'preserved' }),
    });
    const result = await getBusinessSettings('tenant-a');
    expect(firestore.doc).toHaveBeenCalledWith('db', 'tenants', 'tenant-a');
    expect(result.availability.availableDays).toEqual(DEFAULT_AVAILABLE_DAYS);
  });

  it('writes only the sanitized businessSettings field and generated updatedAt', async () => {
    await saveBusinessSettings('tenant-a', {
      businessName: ' Tenant A ',
      businessPhone: ' 555-0100 ',
      businessEmail: ' owner@example.com ',
      serviceArea: ' Bolivar ',
      availability: { availableDays: ['monday', 'saturday', 'invalid'] },
      stripeSecret: 'forbidden',
    });
    expect(firestore.updateDoc).toHaveBeenCalledWith('tenants/tenant-a', {
      businessSettings: {
        businessName: 'Tenant A',
        businessPhone: '555-0100',
        businessEmail: 'owner@example.com',
        serviceArea: 'Bolivar',
        availability: { availableDays: ['monday', 'saturday'] },
      },
      updatedAt: 'SERVER_TIMESTAMP',
    });
  });

  it('rejects missing tenant and empty days without writing', async () => {
    await expect(saveBusinessSettings('', {})).rejects.toThrow('Tenant ID');
    await expect(saveBusinessSettings('tenant-a', { availability: { availableDays: [] } })).rejects.toThrow('at least one');
    expect(firestore.updateDoc).not.toHaveBeenCalled();
  });
});
