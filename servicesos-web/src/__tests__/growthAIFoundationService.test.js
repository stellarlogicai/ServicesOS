import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
  sets: [],
  currentDraft: null,
  id: 0,
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  runTransaction: vi.fn(),
}));

const firebase = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'admin-a' } },
  db: { name: 'db' },
}));

vi.mock('../firebase', () => firebase);

vi.mock('firebase/firestore', () => {
  const refPath = value => value?.path || '';
  return {
    collection: (parent, ...segments) => ({ path: [refPath(parent), ...segments].filter(Boolean).join('/') }),
    doc: (parent, ...segments) => {
      const suffix = segments.length ? segments : [`auto-${++firestore.id}`];
      return { path: [refPath(parent), ...suffix].filter(Boolean).join('/'), id: suffix.at(-1) };
    },
    getDoc: firestore.getDoc,
    getDocs: firestore.getDocs,
    orderBy: (...args) => ({ orderBy: args }),
    query: reference => reference,
    runTransaction: firestore.runTransaction,
    serverTimestamp: () => ({ serverTimestamp: true }),
    setDoc: firestore.setDoc,
  };
});

import {
  approveGrowthAIDraft,
  createGrowthAIDraft,
  normalizeGrowthAIContent,
  normalizeGrowthAISourceRefs,
  updateGrowthAIDraftContent,
} from '../modules/growthAI/growthAIFoundationService';

const content = {
  fullCaption: 'Caption',
  shortCaption: 'Short',
  callToAction: 'Call',
  hashtags: '#Tag',
  imagePrompt: 'Image',
};

function currentDraft(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'draft-a',
    tenantId: 'tenant-a',
    pillar: 'attract',
    actionType: 'marketing_post',
    status: 'approved',
    title: 'Title',
    content,
    sourceRefs: {},
    createdByUid: 'admin-a',
    createdAt: { existing: true },
    updatedByUid: 'admin-a',
    updatedAt: { existing: true },
    approvedByUid: 'admin-a',
    approvedAt: { existing: true },
    version: 3,
    lastAuditId: 'audit-3',
    ...overrides,
  };
}

describe('GrowthAI foundation service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestore.sets = [];
    firestore.currentDraft = currentDraft();
    firestore.id = 0;
    firebase.auth.currentUser = { uid: 'admin-a' };
    firestore.runTransaction.mockImplementation(async (_db, callback) => callback({
      get: vi.fn(async () => ({ exists: () => true, id: 'draft-a', data: () => firestore.currentDraft })),
      set: vi.fn((reference, payload) => firestore.sets.push({ path: reference.path, payload })),
    }));
  });

  it('normalizes the controlled content and source-reference shapes', () => {
    expect(normalizeGrowthAIContent({ fullCaption: '  Caption  ', unsafe: 'ignored' })).toEqual({
      fullCaption: 'Caption', shortCaption: '', callToAction: '', hashtags: '', imagePrompt: '',
    });
    expect(normalizeGrowthAISourceRefs({
      bookingId: ' booking-a ',
      photoIds: Array.from({ length: 10 }, (_, index) => `photo-${index}`),
      customerCopy: { name: 'Must not be copied' },
    })).toEqual({
      bookingId: 'booking-a',
      photoIds: ['photo-0', 'photo-1', 'photo-2', 'photo-3', 'photo-4', 'photo-5', 'photo-6', 'photo-7'],
    });
  });

  it('creates a tenant draft and matching immutable audit with the authenticated actor', async () => {
    const created = await createGrowthAIDraft('tenant-a', {
      pillar: 'attract', actionType: 'marketing_post', title: 'Title', content, sourceRefs: { bookingId: 'booking-a' },
    });

    expect(created.tenantId).toBe('tenant-a');
    expect(created.createdByUid).toBe('admin-a');
    expect(firestore.sets).toHaveLength(2);
    expect(firestore.sets[0].path).toMatch(/^tenants\/tenant-a\/growthAIDrafts\/auto-/);
    expect(firestore.sets[1].path).toContain('/audit/auto-');
    expect(firestore.sets[1].payload).toMatchObject({
      action: 'draft_created', actorUid: 'admin-a', fromStatus: null, toStatus: 'draft', draftVersion: 1,
    });
  });

  it('invalidates an approved draft on material edit and appends the matching audit action', async () => {
    const updated = await updateGrowthAIDraftContent('tenant-a', 'draft-a', {
      pillar: 'attract', actionType: 'marketing_post', title: 'Changed title',
      content: { ...content, fullCaption: 'Changed caption' }, sourceRefs: {},
    });

    expect(updated).toMatchObject({
      status: 'needs_review', approvedByUid: null, approvedAt: null,
      updatedByUid: 'admin-a', version: 4,
    });
    expect(firestore.sets[1].payload).toMatchObject({
      action: 'approval_invalidated', actorUid: 'admin-a', fromStatus: 'approved', toStatus: 'needs_review',
    });
  });

  it('records approval using the authenticated actor rather than caller input', async () => {
    firestore.currentDraft = currentDraft({ status: 'needs_review', approvedByUid: null, approvedAt: null });
    const approved = await approveGrowthAIDraft('tenant-a', 'draft-a');
    expect(approved.status).toBe('approved');
    expect(approved.approvedByUid).toBe('admin-a');
    expect(firestore.sets[1].payload).toMatchObject({ action: 'approved', actorUid: 'admin-a' });
  });
});
