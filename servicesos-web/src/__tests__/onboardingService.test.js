import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  doc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn()
}));

vi.mock('../firebase', () => ({
  db: { id: 'test-db' }
}));

vi.mock('firebase/firestore', () => ({
  doc: firestoreMocks.doc,
  serverTimestamp: firestoreMocks.serverTimestamp,
  updateDoc: firestoreMocks.updateDoc
}));

import { completeUserOnboarding } from '../services/onboardingService';

describe('completeUserOnboarding', () => {
  beforeEach(() => {
    firestoreMocks.doc.mockReset();
    firestoreMocks.updateDoc.mockReset();
    firestoreMocks.serverTimestamp.mockReset();
    firestoreMocks.doc.mockReturnValue('user-ref');
    firestoreMocks.serverTimestamp.mockReturnValue('server-time');
    firestoreMocks.updateDoc.mockResolvedValue();
  });

  it('persists durable completion on the authenticated user document', async () => {
    await completeUserOnboarding('admin-test');

    expect(firestoreMocks.doc).toHaveBeenCalledWith(
      { id: 'test-db' },
      'users',
      'admin-test'
    );
    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith('user-ref', {
      onboardingCompleted: true,
      onboardingProgress: 100,
      onboardingCompletedAt: 'server-time',
      updatedAt: 'server-time'
    });
  });
});
