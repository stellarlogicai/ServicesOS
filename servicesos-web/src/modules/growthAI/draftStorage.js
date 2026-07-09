// src/modules/growthAI/draftStorage.js
/**
 * GrowthAI Phase 0 — Local Draft Persistence
 *
 * Saves/loads drafts to/from localStorage.
 * Key: servicesos_growthai_phase0_drafts
 *
 * Failure behaviour: any localStorage read/write/parse error is caught and
 * logged; the UI receives an empty array and continues rather than crashing.
 *
 * TODO (Phase 1): replace with tenant-scoped Firestore persistence at:
 *   tenants/{tenantId}/growthAIDrafts/{draftId}
 *   Include: server-side auth verification and role check (super-admin only)
 *   before any read or write on the draft collection.
 */

export const STORAGE_KEY = 'servicesos_growthai_phase0_drafts';

/**
 * Draft shape (v0):
 * {
 *   id:              string   — nanoid-style unique id
 *   brandKey:        string   — 'auntbs' | 'slai'
 *   postTypeId:      string
 *   platform:        string
 *   title:           string
 *   inputSnapshot:   object   — copy of form inputs at generation time
 *   fullCaption:     string
 *   shortCaption:    string
 *   callToAction:    string
 *   hashtags:        string
 *   imagePrompt:     string
 *   status:          'draft' | 'ready' | 'posted'
 *   creditsEstimated: number  — estimated cost, NOT deducted
 *   generationEvents: Array<{ type, at }>
 *   createdAt:       ISO string
 *   updatedAt:       ISO string
 *   postedAt:        ISO string | null
 * }
 */

function makeId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function loadDrafts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[GrowthAI] localStorage read/parse failed — returning empty drafts:', err);
    return [];
  }
}

export function saveDrafts(drafts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    return true;
  } catch (err) {
    console.warn('[GrowthAI] localStorage write failed:', err);
    return false;
  }
}

/** Create a brand-new draft record from generated content. */
export function createDraftRecord({ brandKey, postTypeId, platform, title, inputSnapshot, generated, creditsEstimated }) {
  const now = new Date().toISOString();
  return {
    id:               makeId(),
    brandKey,
    postTypeId,
    platform,
    title:            title || 'Untitled draft',
    inputSnapshot:    inputSnapshot || {},
    fullCaption:      generated.fullCaption   || '',
    shortCaption:     generated.shortCaption  || '',
    callToAction:     generated.callToAction  || '',
    hashtags:         generated.hashtags      || '',
    imagePrompt:      generated.imagePrompt   || '',
    status:           'draft',
    creditsEstimated: creditsEstimated || 0,
    generationEvents: [{ type: 'generate', at: now }],
    createdAt:        now,
    updatedAt:        now,
    postedAt:         null,
  };
}

/** Merge updated fields into an existing draft record. */
export function updateDraftRecord(existing, updates) {
  return {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
}

/** Add a generation event to an existing draft (e.g. regenerate_caption). */
export function addGenerationEvent(draft, type) {
  return {
    ...draft,
    generationEvents: [...(draft.generationEvents || []), { type, at: new Date().toISOString() }],
    updatedAt: new Date().toISOString(),
  };
}

// ─── Convenience CRUD helpers ─────────────────────────────────────────────────

export function insertDraft(drafts, newDraft) {
  const updated = [newDraft, ...drafts];
  saveDrafts(updated);
  return updated;
}

export function upsertDraft(drafts, draft) {
  const idx = drafts.findIndex(d => d.id === draft.id);
  const updated = idx >= 0
    ? drafts.map(d => d.id === draft.id ? draft : d)
    : [draft, ...drafts];
  saveDrafts(updated);
  return updated;
}

export function removeDraft(drafts, id) {
  const updated = drafts.filter(d => d.id !== id);
  saveDrafts(updated);
  return updated;
}

export function duplicateDraft(drafts, id) {
  const source = drafts.find(d => d.id === id);
  if (!source) return drafts;
  const now = new Date().toISOString();
  const copy = {
    ...source,
    id:        makeId(),
    title:     `${source.title} (copy)`,
    status:    'draft',
    createdAt: now,
    updatedAt: now,
    postedAt:  null,
    generationEvents: [{ type: 'duplicate', at: now }],
  };
  const updated = [copy, ...drafts];
  saveDrafts(updated);
  return updated;
}

export function patchDraftStatus(drafts, id, status) {
  const updated = drafts.map(d => {
    if (d.id !== id) return d;
    const now = new Date().toISOString();
    return {
      ...d,
      status,
      updatedAt: now,
      postedAt: status === 'posted' ? now : d.postedAt,
    };
  });
  saveDrafts(updated);
  return updated;
}
