// src/modules/growthAI/brandProfiles.js
/**
 * GrowthAI Phase 0 — Brand Profiles, Post Types, Content Ideas
 *
 * Pure data module. No Firebase, no external dependencies, no API calls.
 * Supports two internal brands for Phase 0: Aunt B's and Stellar Logic AI.
 *
 * TODO (Phase 1): fetch brand profiles from a tenant-scoped Firestore
 * collection so owners can customise them without a code deploy.
 */

export const BRANDS = {
  auntbs: {
    key: 'auntbs',
    name: "Aunt B's Cleaning Services",
    emoji: '🧹',
    tone: 'friendly, fun, trustworthy, local',
    services: ['standard clean', 'deep clean', 'move-out clean', 'recurring clean'],
    defaultCTA: 'Message us for a free quote!',
    imageStyle: 'friendly local cleaning brand — bright, welcoming, real home',
    audience: 'local homeowners and renters in the service area',
    postTypes: [
      { id: 'availability',  label: 'Availability Post',         emoji: '📅' },
      { id: 'promo',         label: 'Promo / Discount Post',     emoji: '🎉' },
      { id: 'cleaning-tip',  label: 'Cleaning Tip Post',         emoji: '💡' },
      { id: 'seasonal',      label: 'Seasonal Post',             emoji: '🍂' },
      { id: 'review-trust',  label: 'Review / Trust Post',       emoji: '⭐' },
      { id: 'before-after',  label: 'Before / After Style Post', emoji: '✨' },
    ],
  },

  slai: {
    key: 'slai',
    name: 'Stellar Logic AI',
    emoji: '🤖',
    tone: 'founder-led, practical, trustworthy, technical when needed',
    services: ['ServicesOS'],
    defaultCTA: 'Follow along as ServicesOS moves toward customer-ready V1',
    imageStyle: 'clean enterprise AI / founder build-log visuals — minimal, purposeful',
    audience: 'small business owners, future ServicesOS users, founders, operators, technical followers',
    postTypes: [
      { id: 'product-update',    label: 'Founder / Product Update',     emoji: '🚀' },
      { id: 'feature-explainer', label: 'ServicesOS Feature Explainer',  emoji: '🔧' },
      { id: 'website-copy',      label: 'Website / Feature Copy',        emoji: '✍️' },
      { id: 'founder-access',    label: 'Founder Access Post',           emoji: '🔑' },
      { id: 'pricing-philosophy',label: 'Pricing Philosophy Post',       emoji: '💰' },
      { id: 'build-progress',    label: 'Build Progress Update',         emoji: '🏗️' },
    ],
  },
};

export const PLATFORMS = [
  { id: 'facebook',   label: 'Facebook',   maxChars: 500  },
  { id: 'instagram',  label: 'Instagram',  maxChars: 300  },
  { id: 'linkedin',   label: 'LinkedIn',   maxChars: 700  },
  { id: 'website',    label: 'Website',    maxChars: 1000 },
];

// Credit cost table — shown in the UI before generation.
// Phase 0: ESTIMATED ONLY. No credits are deducted.
// TODO (Phase 1): pass these costs to a backend Cloud Function that:
//   1. Verifies the caller's Firebase ID token
//   2. Atomically checks and deducts credits server-side (Firestore
//      transaction or counter) before calling the AI model
//   3. Returns the generated content; rolls back on model failure
//   NEVER hold API keys in VITE_* env vars — they end up in the client bundle.
export const CREDIT_COSTS = {
  generate_caption:      1,
  regenerate_caption:    1,
  generate_five_ideas:   2,
  generate_image_prompt: 1,
  generate_image:        12, // midpoint of 8–15 range; image API not wired in Phase 0
  generate_alt_image:    12,
  weekly_content_pack:   22, // midpoint of 15–30 range
};

export const DRAFT_STATUS = {
  DRAFT:  'draft',
  READY:  'ready',
  POSTED: 'posted',
};

// ─── Static content ideas (no AI call) ───────────────────────────────────────
// Clicking an idea prefills form fields only. It does NOT auto-generate.
// TODO (Phase 1): move idea templates to a Firestore collection so they can
// be edited by the super-admin without a code deploy.

export const CONTENT_IDEAS = {
  auntbs: [
    {
      label: 'Now booking this week',
      emoji: '📅',
      prefill: {
        postTypeId: 'availability',
        inputs: { serviceType: 'standard clean', dateRange: 'this week', offer: 'limited slots available' },
      },
    },
    {
      label: 'Spring cleaning reminder',
      emoji: '🌸',
      prefill: {
        postTypeId: 'seasonal',
        inputs: { dateRange: 'spring', cleaningTopic: 'fresh start, declutter, deep reset', serviceType: 'deep clean' },
      },
    },
    {
      label: 'Move-out cleaning availability',
      emoji: '🏠',
      prefill: {
        postTypeId: 'availability',
        inputs: { serviceType: 'move-out clean', offer: 'last-minute slots available', cleaningTopic: 'spotless for landlord inspection' },
      },
    },
    {
      label: 'Deep clean promo',
      emoji: '🎉',
      prefill: {
        postTypeId: 'promo',
        inputs: { serviceType: 'deep clean', offer: '10% off your first deep clean this month' },
      },
    },
    {
      label: 'Review / trust builder',
      emoji: '⭐',
      prefill: {
        postTypeId: 'review-trust',
        inputs: { cleaningTopic: 'reliable, friendly, thorough', serviceType: 'recurring clean' },
      },
    },
    {
      label: 'Cleaning tip of the week',
      emoji: '💡',
      prefill: {
        postTypeId: 'cleaning-tip',
        inputs: { cleaningTopic: 'quick tip that saves time or keeps the home fresh longer' },
      },
    },
  ],

  slai: [
    {
      label: 'ServicesOS build progress update',
      emoji: '🏗️',
      prefill: {
        postTypeId: 'build-progress',
        inputs: { productArea: 'ServicesOS', updateType: 'milestone', currentStatus: 'wife-beta testing underway' },
      },
    },
    {
      label: 'Wife beta lesson learned',
      emoji: '📓',
      prefill: {
        postTypeId: 'product-update',
        inputs: { productArea: 'ServicesOS wife beta', updateType: 'lesson learned', targetAudience: 'founders, small business operators' },
      },
    },
    {
      label: 'Field Mode web beta note',
      emoji: '📱',
      prefill: {
        postTypeId: 'feature-explainer',
        inputs: { productArea: 'Field Mode', updateType: 'feature live', currentStatus: 'read-only web beta', notLiveYet: 'full field app, payroll, native mobile' },
      },
    },
    {
      label: 'Founder Access explanation',
      emoji: '🔑',
      prefill: {
        postTypeId: 'founder-access',
        inputs: { productArea: 'ServicesOS', updateType: 'access offer', targetAudience: 'early adopters, cleaning business owners' },
      },
    },
    {
      label: 'Pricing philosophy',
      emoji: '💰',
      prefill: {
        postTypeId: 'pricing-philosophy',
        inputs: { productArea: 'ServicesOS', updateType: 'philosophy', targetAudience: 'small business owners weighing SaaS costs' },
      },
    },
    {
      label: 'GrowthAI Phase 0 internal helper note',
      emoji: '🚀',
      prefill: {
        postTypeId: 'build-progress',
        inputs: {
          productArea: 'GrowthAI / Marketing Helper',
          updateType: 'internal build note',
          currentStatus: 'Phase 0 internal shell — placeholder generation, no auto-posting',
          notLiveYet: 'backend AI gateway, real credit deduction, Firestore draft persistence',
          whatChanged: 'local draft library with localStorage, content ideas, copy buttons',
        },
      },
    },
  ],
};
