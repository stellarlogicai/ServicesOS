// src/modules/growthAI/growthAIService.js
/**
 * GrowthAI Phase 0 — Content Generation Service
 *
 * ─── SECURITY / ARCHITECTURE NOTES ───────────────────────────────────────────
 *
 * NO browser-side AI API calls in Phase 0.
 * Reasons:
 *  1. VITE_* env vars are inlined into the client JS bundle at build time and
 *     are visible to anyone who opens DevTools — never put API keys there.
 *  2. Credit enforcement cannot be atomic or tamper-proof from the browser.
 *
 * TODO (Phase 1 — backend AI gateway):
 *  - Create a Firebase Cloud Function (or equivalent server route):
 *      POST /growthAI/generate
 *      Body: { brandKey, postTypeId, inputs }
 *      Headers: Authorization: Bearer <Firebase ID token>
 *    The function should:
 *      a. Verify the caller's Firebase ID token (admin.auth().verifyIdToken)
 *      b. Confirm the caller has role === 'super-admin' on their tenant doc
 *      c. In a Firestore transaction: check remaining credits, deduct atomically
 *         BEFORE calling the model — roll back on model failure
 *      d. Call the Anthropic / OpenAI API using server-side env vars (not VITE_*)
 *      e. Return { draft } to the client
 *  - Replace generatePlaceholderDraft() below with a fetch() to that endpoint
 *  - The honesty / safety prompt rules in buildPrompt() should live server-side
 *
 * TODO (Phase 1 — credit deduction):
 *  - Move deductCredits() call entirely inside the Cloud Function above
 *  - The client must NEVER write to the credits subcollection directly
 *  - Client can still read remaining credits for display (read-only query is OK)
 *
 * ─── PHASE 0 BEHAVIOUR ───────────────────────────────────────────────────────
 *
 * All generation is local / deterministic. No network request is made.
 * Credits are ESTIMATED ONLY — nothing is deducted from Firestore.
 */

import { CREDIT_COSTS } from './brandProfiles';

// ─── Placeholder generation (pure local) ─────────────────────────────────────

function safeTrim(val) {
  return typeof val === 'string' ? val.trim() : '';
}

function areaTag(area) {
  return area.replace(/[^a-zA-Z0-9]/g, '');
}

function placeholderDraft(brand, postType, inputs) {
  const cta   = safeTrim(inputs.cta)   || brand.defaultCTA;
  const notes = safeTrim(inputs.extraNotes) ? ` ${inputs.extraNotes.trim()}` : '';

  if (brand.key === 'auntbs') {
    const service = safeTrim(inputs.serviceType)  || 'cleaning service';
    const area    = safeTrim(inputs.serviceArea)   || 'your area';
    const offer   = safeTrim(inputs.offer)         || 'professional results';
    const season  = safeTrim(inputs.dateRange)     || 'this season';
    const topic   = safeTrim(inputs.cleaningTopic) || 'spotless results';
    const tag     = areaTag(area) || 'CleaningServices';

    const fullCaption =
      `✨ ${postType.label} ✨\n\n` +
      `Looking for a reliable ${service} in ${area}?${notes}\n\n` +
      `We deliver ${topic} and take real pride in every home we clean. ` +
      `${season} slots are filling fast — don't wait!\n\n` +
      `🎯 ${offer}\n\n` +
      `${cta}\n\n` +
      `#CleanHome #${tag} #AuntBsCleaning #ProfessionalCleaning #LocalBusiness`;

    return {
      title:        `${postType.label} — ${area}`,
      fullCaption,
      shortCaption: `✨ Need a ${service} in ${area}? ${cta}`,
      callToAction: cta,
      hashtags:     `#CleanHome #${tag} #AuntBsCleaning #ProfessionalCleaning #LocalBusiness`,
      imagePrompt:
        `${brand.imageStyle}: visual for a "${postType.label.toLowerCase()}" post. ` +
        `Bright, welcoming ${area} home. Real, not stock-photo. No text overlay.`,
    };
  }

  // SLAI
  const product    = safeTrim(inputs.productArea)    || 'ServicesOS';
  const status     = safeTrim(inputs.currentStatus)  || 'in active development';
  const changed    = safeTrim(inputs.whatChanged)    || 'steady build progress';
  const notLive    = safeTrim(inputs.notLiveYet)     || 'some features still being built';
  const audience   = safeTrim(inputs.targetAudience) || brand.audience;
  const discussion = safeTrim(inputs.ctaQuestion)    || cta;
  const updateType = safeTrim(inputs.updateType)     || 'update';

  const fullCaption =
    `🏗️ ${postType.label}\n\n` +
    `${product} — ${updateType}: ${status}.${notes}\n\n` +
    `What changed: ${changed}.\n\n` +
    `What's NOT live yet: ${notLive} — building honestly, shipping carefully.\n\n` +
    `Building for: ${audience}.\n\n` +
    `${discussion}`;

  return {
    title:        `${postType.label} — ${product}`,
    fullCaption,
    shortCaption: `${product} ${updateType}: ${changed}. ${discussion}`,
    callToAction: discussion,
    hashtags:     `#ServicesOS #SaaS #FounderBuild #SmallBusiness #BuildInPublic #StellarLogicAI`,
    imagePrompt:
      `${brand.imageStyle}: visual for a "${postType.label.toLowerCase()}" post about ${product}. ` +
      `Minimal, purposeful, enterprise look. No text overlay.`,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a content draft.
 *
 * Phase 0: returns a deterministic placeholder. No network request.
 * Credits are ESTIMATED, not deducted.
 *
 * @param {object} brand    - from BRANDS in brandProfiles.js
 * @param {object} postType - { id, label, emoji }
 * @param {object} inputs   - form field values (all optional; safe defaults applied)
 * @returns {{ generated, creditsEstimated, aiUsed }}
 */
export function generateDraft(brand, postType, inputs) {
  // Defensive: inputs may be null/undefined if form fields haven't been touched
  const safeInputs = inputs && typeof inputs === 'object' ? inputs : {};
  const generated  = placeholderDraft(brand, postType, safeInputs);
  return {
    generated,
    creditsEstimated: CREDIT_COSTS.generate_caption,
    aiUsed: false,
  };
}

/**
 * Regenerate caption — same as initial generation for Phase 0.
 * TODO (Phase 1): call the backend endpoint with the same inputs but with
 * a "regenerate" flag so the model uses a different random seed / temperature.
 */
export function regenerateCaption(brand, postType, inputs) {
  const safeInputs = inputs && typeof inputs === 'object' ? inputs : {};
  const generated  = placeholderDraft(brand, postType, safeInputs);
  return {
    generated,
    creditsEstimated: CREDIT_COSTS.regenerate_caption,
    aiUsed: false,
  };
}

/**
 * Generate an image prompt only — cheaper than full generation.
 * Does NOT call any image generation API in Phase 0.
 * TODO (Phase 1): same backend-route requirement as generateDraft.
 */
export function generateImagePromptOnly(brand, postType, inputs) {
  const safeInputs = inputs && typeof inputs === 'object' ? inputs : {};
  const draft = placeholderDraft(brand, postType, safeInputs);
  return {
    imagePrompt:      draft.imagePrompt,
    creditsEstimated: CREDIT_COSTS.generate_image_prompt,
  };
}
