import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

vi.mock('../firebase', () => ({ db: 'db' }));
vi.mock('firebase/firestore', () => firestore);

import {
  employeeAssignmentLabel,
  getActiveTenantEmployeeProfiles,
} from '../services/employeeProfileService';

describe('employee profile assignment service', () => {
  beforeEach(() => {
    Object.values(firestore).forEach(mock => mock.mockReset());
    firestore.collection.mockReturnValue('users-ref');
    firestore.where.mockImplementation((...parts) => parts);
    firestore.query.mockImplementation((...parts) => parts);
  });

  it('queries only active employee profiles for the selected tenant', async () => {
    firestore.getDocs.mockResolvedValue({
      docs: [
        { id: 'employee-b', data: () => ({ displayName: 'Zoe', role: 'employee', status: 'active', tenantId: 'tenant-a' }) },
        { id: 'employee-a', data: () => ({ displayName: 'Avery', role: 'employee', status: 'active', tenantId: 'tenant-a' }) },
      ],
    });

    const result = await getActiveTenantEmployeeProfiles('tenant-a');

    expect(firestore.where).toHaveBeenNthCalledWith(1, 'tenantId', '==', 'tenant-a');
    expect(firestore.where).toHaveBeenNthCalledWith(2, 'role', '==', 'employee');
    expect(firestore.where).toHaveBeenNthCalledWith(3, 'status', '==', 'active');
    expect(result.data.map(employee => employee.uid)).toEqual(['employee-a', 'employee-b']);
  });

  it('does not query without a tenant and returns honest fallback labels', async () => {
    expect((await getActiveTenantEmployeeProfiles('')).success).toBe(false);
    expect(firestore.getDocs).not.toHaveBeenCalled();
    expect(employeeAssignmentLabel({ uid: 'employee-a' })).toBe('employee-a');
  });
});
