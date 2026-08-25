const crypto = require('node:crypto');
const { FieldValue } = require('firebase-admin/firestore');
const { GrowthAIProviderError, validateProviderOutput } = require('./growthAIProvider');

const ACTION_COSTS = Object.freeze({
  customer_response: 1,
  estimate_assistance: 1,
  estimate_followup: 1,
  marketing_post: 1,
});
const CREDIT_BUCKETS = Object.freeze(['monthly', 'promotional', 'purchased']);
const ALLOWED_ORIGINS = new Set([
  'https://servicesos.netlify.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]);
const MAX_IDEMPOTENCY_LENGTH = 128;

class GrowthAIGatewayError extends Error {
  constructor(message, { code = 'gateway_error', status = 400 } = {}) {
    super(message);
    this.name = 'GrowthAIGatewayError';
    this.code = code;
    this.status = status;
  }
}

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function exactKeys(value, allowed, required = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return required.every(key => keys.includes(key)) && keys.every(key => allowed.includes(key));
}

function normalizeSourceRefs(actionType, sourceRefs = {}) {
  if (!exactKeys(sourceRefs, ['opportunityId', 'leadId'])) {
    throw new GrowthAIGatewayError('The GrowthAI source references are invalid.', { code: 'invalid_request' });
  }
  if (!['estimate_assistance', 'estimate_followup'].includes(actionType) && Object.keys(sourceRefs).length > 0) {
    throw new GrowthAIGatewayError('This GrowthAI action does not accept source references.', { code: 'invalid_request' });
  }
  const normalized = {};
  for (const key of ['opportunityId', 'leadId']) {
    const value = cleanString(sourceRefs[key], 128);
    if (value) normalized[key] = value;
  }
  if (actionType === 'estimate_followup' && (!normalized.opportunityId || !normalized.leadId)) {
    throw new GrowthAIGatewayError('Estimate follow-up requires a canonical opportunity and lead.', { code: 'invalid_request' });
  }
  if (actionType === 'estimate_assistance' &&
      (!normalized.leadId || normalized.opportunityId || Object.keys(normalized).length !== 1)) {
    throw new GrowthAIGatewayError('Estimate assistance requires exactly one canonical lead.', { code: 'invalid_request' });
  }
  return normalized;
}

function normalizeInput(actionType, input = {}) {
  const shapes = {
    customer_response: {
      allowed: ['customerMessage', 'scenarioId', 'channelId'],
      required: ['customerMessage', 'scenarioId', 'channelId'],
      limits: { customerMessage: 2_000, scenarioId: 64, channelId: 32 },
    },
    estimate_assistance: {
      allowed: [],
      required: [],
      limits: {},
    },
    estimate_followup: {
      allowed: ['channelId'],
      required: [],
      limits: { channelId: 32 },
    },
    marketing_post: {
      allowed: ['postTypeId', 'platform', 'serviceType', 'serviceArea', 'offer', 'cleaningTopic', 'extraNotes'],
      required: ['postTypeId'],
      limits: {
        postTypeId: 64, platform: 32, serviceType: 160, serviceArea: 160,
        offer: 300, cleaningTopic: 300, extraNotes: 1_000,
      },
    },
  };
  const shape = shapes[actionType];
  if (!shape || !exactKeys(input, shape.allowed, shape.required)) {
    throw new GrowthAIGatewayError('The GrowthAI input shape is invalid.', { code: 'invalid_request' });
  }
  const normalized = {};
  for (const key of shape.allowed) {
    const value = cleanString(input[key], shape.limits[key]);
    if (value) normalized[key] = value;
  }
  for (const key of shape.required) {
    if (!normalized[key]) {
      throw new GrowthAIGatewayError('Required GrowthAI input is missing.', { code: 'invalid_request' });
    }
  }
  return normalized;
}

function normalizeGenerationRequest(body = {}) {
  if (!exactKeys(body, ['tenantId', 'actionType', 'idempotencyKey', 'sourceRefs', 'input'], ['tenantId', 'actionType', 'idempotencyKey', 'sourceRefs', 'input'])) {
    throw new GrowthAIGatewayError('The GrowthAI request shape is invalid.', { code: 'invalid_request' });
  }
  const tenantId = cleanString(body.tenantId, 128);
  const actionType = cleanString(body.actionType, 64);
  const idempotencyKey = cleanString(body.idempotencyKey, MAX_IDEMPOTENCY_LENGTH);
  if (!tenantId || tenantId === 'DEFAULT' || !Object.hasOwn(ACTION_COSTS, actionType) || !idempotencyKey) {
    throw new GrowthAIGatewayError('The GrowthAI request is invalid.', { code: 'invalid_request' });
  }
  return {
    tenantId,
    actionType,
    idempotencyKey,
    sourceRefs: normalizeSourceRefs(actionType, body.sourceRefs),
    input: normalizeInput(actionType, body.input),
  };
}

function membershipIncludes(membership, uid) {
  if (Array.isArray(membership)) return membership.includes(uid);
  return Boolean(membership && typeof membership === 'object' && membership[uid]);
}

async function verifyGrowthAIActor({ db, uid, tenantId }) {
  const [userSnapshot, tenantSnapshot] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('tenants').doc(tenantId).get(),
  ]);
  if (!userSnapshot.exists || !tenantSnapshot.exists) {
    throw new GrowthAIGatewayError('You are not authorized to use GrowthAI for this tenant.', { code: 'forbidden', status: 403 });
  }
  const profile = userSnapshot.data() || {};
  const tenant = tenantSnapshot.data() || {};
  const isSuperAdmin = profile.role === 'super-admin' && profile.status === 'active';
  const isTenantAdmin = profile.role === 'admin' && profile.status === 'active' &&
    profile.tenantId === tenantId && membershipIncludes(tenant.adminUsers, uid);
  if (!isSuperAdmin && !isTenantAdmin) {
    throw new GrowthAIGatewayError('You are not authorized to use GrowthAI for this tenant.', { code: 'forbidden', status: 403 });
  }
  return { profile, tenant };
}

async function verifySourceContext({ db, request }) {
  if (request.actionType === 'estimate_assistance') {
    const leadRef = db.collection('tenants').doc(request.tenantId)
      .collection('leads').doc(request.sourceRefs.leadId);
    const leadSnapshot = await leadRef.get();
    if (!leadSnapshot.exists) {
      throw new GrowthAIGatewayError('The estimate source could not be verified.', { code: 'invalid_source', status: 404 });
    }
    const lead = leadSnapshot.data() || {};
    if (lead.tenantId !== request.tenantId || !['new', 'quoted'].includes(lead.status) ||
        lead.booking != null || lead.estimate?.status === 'approved') {
      throw new GrowthAIGatewayError('The estimate source does not belong to this tenant or is no longer reviewable.', { code: 'invalid_source', status: 403 });
    }
    return { lead, baselinePrice: deterministicEstimateBaseline(lead.estimate) };
  }
  if (request.actionType !== 'estimate_followup') return {};
  const opportunityRef = db.collection('tenants').doc(request.tenantId)
    .collection('growthAIOpportunities').doc(request.sourceRefs.opportunityId);
  const leadRef = db.collection('tenants').doc(request.tenantId)
    .collection('leads').doc(request.sourceRefs.leadId);
  const [opportunitySnapshot, leadSnapshot] = await Promise.all([opportunityRef.get(), leadRef.get()]);
  if (!opportunitySnapshot.exists || !leadSnapshot.exists) {
    throw new GrowthAIGatewayError('The estimate follow-up source could not be verified.', { code: 'invalid_source', status: 404 });
  }
  const opportunity = opportunitySnapshot.data() || {};
  const lead = leadSnapshot.data() || {};
  if (opportunity.tenantId !== request.tenantId || opportunity.type !== 'estimate_followup' ||
      opportunity.sourceRefs?.leadId !== request.sourceRefs.leadId ||
      !['open', 'acted'].includes(opportunity.status)) {
    throw new GrowthAIGatewayError('The estimate follow-up source does not belong to this tenant or action.', { code: 'invalid_source', status: 403 });
  }
  return { opportunity, opportunityRef, lead };
}

function deterministicEstimateBaseline(estimate = {}) {
  const low = Number(estimate.priceLow);
  const suggestedValue = Number(estimate.priceSuggested);
  const high = Number(estimate.priceHigh);
  if (!Number.isFinite(low) || low <= 0 || !Number.isFinite(high) || high < low) {
    throw new GrowthAIGatewayError('The saved estimate does not contain a valid deterministic price range.', { code: 'invalid_source', status: 422 });
  }
  const suggested = Number.isFinite(suggestedValue) && suggestedValue >= low && suggestedValue <= high
    ? suggestedValue
    : null;
  return {
    low,
    suggested,
    high,
    currency: cleanString(estimate.currency, 8) || 'USD',
    pricingProfileId: cleanString(estimate.tenantPricingProfileId, 128) || null,
    requiresManualReview: estimate.requiresManualReview === true,
  };
}

function businessContext(tenant = {}) {
  const settings = tenant.businessSettings || {};
  return {
    businessName: cleanString(settings.businessName || tenant.businessName, 180) || 'the cleaning business',
    serviceArea: cleanString(settings.serviceArea, 180),
    brandVoice: cleanString(tenant.growthAIBrandVoice, 300),
  };
}

function buildPrompt({ request, tenant, sourceContext }) {
  const business = businessContext(tenant);
  const systemInstruction = [
    'You draft private business content for ServicesOS.',
    'Return only the requested draft text, with no analysis or metadata.',
    'Do not claim that anything was sent, booked, paid, approved, or published.',
    'Do not include payment details, Stripe data, hidden notes, or unrelated customer information.',
    `Write for ${business.businessName}${business.serviceArea ? ` serving ${business.serviceArea}` : ''}.`,
  ].join(' ');

  if (request.actionType === 'estimate_assistance') {
    const lead = sourceContext.lead || {};
    const formData = lead.formData || {};
    const requestSnapshot = lead.requestSnapshot || {};
    const baseline = sourceContext.baselinePrice;
    const serviceType = cleanString(requestSnapshot.cleaningType || formData.cleaningType || formData.serviceType, 160) || 'cleaning service';
    const frequency = cleanString(requestSnapshot.frequency || formData.frequency, 80) || 'not specified';
    const propertyFacts = [
      ['Bedrooms', formData.bedrooms ?? formData.bedroomCount],
      ['Bathrooms', formData.bathrooms ?? formData.bathroomCount],
      ['Half bathrooms', formData.halfBaths],
      ['Square footage', formData.squareFootage],
      ['Levels', formData.levels],
      ['Stairs', formData.stairs],
      ['Condition', formData.condition || formData.clutterLevel],
      ['Pet hair', formData.petHairLevel],
      ['Last cleaned', formData.lastCleaned],
    ].map(([label, value]) => {
      const cleaned = cleanString(value == null ? '' : String(value), 120);
      return cleaned ? `${label}: ${cleaned}.` : '';
    }).filter(Boolean);
    const manualReviewReasons = Array.isArray(lead.estimate?.manualReviewReasons)
      ? lead.estimate.manualReviewReasons.slice(0, 8).map(value => cleanString(value, 300)).filter(Boolean)
      : [];
    const selectedAddOns = formData.extras && typeof formData.extras === 'object' && !Array.isArray(formData.extras)
      ? Object.entries(formData.extras)
          .filter(([, value]) => value === true || (Number.isFinite(Number(value)) && Number(value) > 0))
          .slice(0, 12)
          .map(([key, value]) => `${cleanString(key, 80)}${value === true ? '' : ` (${Number(value)})`}`)
          .filter(Boolean)
      : [];
    const estimateSystemInstruction = [
      'You assist a cleaning-business owner reviewing a deterministic ServicesOS estimate.',
      'Return only one valid JSON object with exactly these keys: recommendedPrice, reasoning, assumptions, scopeSuggestions, possibleAddOns, complexityFlags.',
      'recommendedPrice must be a number. reasoning must be a concise string. The other fields must be arrays of concise strings.',
      'Do not claim the recommendation is approved, final, sent, booked, or paid.',
      'Do not modify or invent business pricing rules. The deterministic baseline remains authoritative and requires human approval.',
      'Do not include customer identity, address, payment information, Stripe data, medical details, hidden notes, or provider metadata.',
      `Provide a private recommendation for ${business.businessName}.`,
    ].join(' ');
    return {
      systemInstruction: estimateSystemInstruction,
      userPrompt: [
        `Service type: ${serviceType}.`,
        `Frequency: ${frequency}.`,
        `Deterministic baseline: ${baseline.currency} ${baseline.low}-${baseline.high}${baseline.suggested == null ? '' : `; suggested ${baseline.suggested}`}.`,
        baseline.pricingProfileId ? `Pricing profile: ${baseline.pricingProfileId}.` : '',
        baseline.requiresManualReview ? 'ServicesOS requires manual review.' : '',
        selectedAddOns.length ? `Selected add-ons: ${selectedAddOns.join(', ')}.` : '',
        ...propertyFacts,
        ...manualReviewReasons.map(reason => `ServicesOS review reason: ${reason}`),
        'Recommend a review value and explain assumptions, scope corrections, possible add-ons, and complexity flags without changing the deterministic estimate.',
      ].filter(Boolean).join('\n'),
      title: `[AI estimate assistance] ${serviceType}`,
      pillar: 'convert',
    };
  }

  if (request.actionType === 'customer_response') {
    return {
      systemInstruction,
      userPrompt: [
        `Draft a ${request.input.channelId} customer response for scenario ${request.input.scenarioId}.`,
        `Customer message: ${request.input.customerMessage}`,
        'Keep it concise, courteous, and ready for human review.',
      ].join('\n'),
      title: '[AI customer response] Review before sending',
      pillar: 'convert',
    };
  }

  if (request.actionType === 'estimate_followup') {
    const lead = sourceContext.lead || {};
    const estimate = lead.estimate || {};
    const formData = lead.formData || {};
    const requestSnapshot = lead.requestSnapshot || {};
    const serviceType = cleanString(requestSnapshot.cleaningType || formData.cleaningType || formData.serviceType, 160) || 'cleaning service';
    const estimateStatus = cleanString(estimate.status || lead.status, 64) || 'quoted';
    return {
      systemInstruction,
      userPrompt: [
        `Draft a ${request.input.channelId || 'general'} follow-up for a ${serviceType} estimate.`,
        `Canonical estimate status: ${estimateStatus}.`,
        'Do not include a customer name, address, payment information, or an invented deadline.',
        'Invite questions or scheduling and require human review before sending.',
      ].join('\n'),
      title: `[AI estimate follow-up] ${serviceType}`,
      pillar: 'convert',
    };
  }

  return {
    systemInstruction,
    userPrompt: [
      `Draft a ${request.input.platform || 'social'} marketing post of type ${request.input.postTypeId}.`,
      request.input.serviceType ? `Service: ${request.input.serviceType}.` : '',
      request.input.serviceArea ? `Area: ${request.input.serviceArea}.` : '',
      request.input.offer ? `Offer: ${request.input.offer}.` : '',
      request.input.cleaningTopic ? `Cleaning topic: ${request.input.cleaningTopic}.` : '',
      request.input.extraNotes ? `Owner notes: ${request.input.extraNotes}.` : '',
      'Do not mention customer identities, job photos, photo permissions, medical details, or unsupported claims.',
    ].filter(Boolean).join('\n'),
    title: `[AI marketing post] ${request.input.serviceType || request.input.postTypeId}`,
    pillar: 'attract',
  };
}

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function serverTimestamp(admin) {
  return admin.firestore.FieldValue?.serverTimestamp?.() || FieldValue.serverTimestamp();
}

function operationId({ tenantId, uid, idempotencyKey }) {
  return hashValue(`${tenantId}\n${uid}\n${idempotencyKey}`);
}

function requestHash(request) {
  return hashValue(JSON.stringify({
    tenantId: request.tenantId,
    actionType: request.actionType,
    sourceRefs: request.sourceRefs,
    input: request.input,
  }));
}

function normalizeBuckets(value = {}) {
  return Object.fromEntries(CREDIT_BUCKETS.map(bucket => {
    const credits = Number(value[bucket]);
    return [bucket, Number.isInteger(credits) && credits >= 0 ? credits : 0];
  }));
}

function allocateCredits(buckets, cost) {
  const remaining = { ...buckets };
  const reservedBuckets = Object.fromEntries(CREDIT_BUCKETS.map(bucket => [bucket, 0]));
  let needed = cost;
  for (const bucket of CREDIT_BUCKETS) {
    const amount = Math.min(remaining[bucket], needed);
    remaining[bucket] -= amount;
    reservedBuckets[bucket] = amount;
    needed -= amount;
  }
  return needed === 0 ? { remaining, reservedBuckets } : null;
}

function creditBalanceRef(db, tenantId) {
  return db.collection('tenants').doc(tenantId).collection('growthAICreditBalances').doc('current');
}

function ledgerRef(db, tenantId, ledgerId) {
  return db.collection('tenants').doc(tenantId).collection('growthAICreditLedger').doc(ledgerId);
}

async function reserveCredits({ admin, db, request, uid }) {
  const ledgerId = operationId({ tenantId: request.tenantId, uid, idempotencyKey: request.idempotencyKey });
  const fingerprint = requestHash(request);
  const cost = ACTION_COSTS[request.actionType];
  const balanceRef = creditBalanceRef(db, request.tenantId);
  const operationRef = ledgerRef(db, request.tenantId, ledgerId);
  return db.runTransaction(async transaction => {
    const existingSnapshot = await transaction.get(operationRef);
    if (existingSnapshot.exists) {
      const existing = existingSnapshot.data() || {};
      if (existing.requestHash !== fingerprint) {
        throw new GrowthAIGatewayError('This idempotency key was already used for different content.', { code: 'idempotency_conflict', status: 409 });
      }
      if (existing.status === 'finalized') return { kind: 'finalized', ledgerId, ledger: existing };
      if (existing.status === 'reserved') {
        throw new GrowthAIGatewayError('This GrowthAI request is already processing.', { code: 'already_processing', status: 409 });
      }
      throw new GrowthAIGatewayError('This failed request is closed. Retry with a new idempotency key.', { code: 'retry_with_new_key', status: 409 });
    }

    const balanceSnapshot = await transaction.get(balanceRef);
    const balance = balanceSnapshot.exists ? balanceSnapshot.data() || {} : {};
    const buckets = normalizeBuckets(balance.buckets);
    const allocation = allocateCredits(buckets, cost);
    if (!allocation) {
      throw new GrowthAIGatewayError('Not enough AI credits for this generation.', { code: 'insufficient_credits', status: 402 });
    }
    const reservedCredits = Number.isInteger(balance.reservedCredits) && balance.reservedCredits >= 0 ? balance.reservedCredits : 0;
    transaction.set(balanceRef, {
      schemaVersion: 1,
      tenantId: request.tenantId,
      buckets: allocation.remaining,
      reservedCredits: reservedCredits + cost,
      updatedAt: serverTimestamp(admin),
      updatedByUid: uid,
    });
    transaction.create(operationRef, {
      schemaVersion: 1,
      id: ledgerId,
      tenantId: request.tenantId,
      actorUid: uid,
      actionType: request.actionType,
      idempotencyKeyHash: hashValue(request.idempotencyKey),
      requestHash: fingerprint,
      credits: cost,
      reservedBuckets: allocation.reservedBuckets,
      status: 'reserved',
      createdAt: serverTimestamp(admin),
      reservedAt: serverTimestamp(admin),
      finalizedAt: null,
      restoredAt: null,
      failureCode: null,
      relatedDraftId: null,
      relatedOpportunityId: request.sourceRefs.opportunityId || null,
      providerRequestId: null,
      modelId: null,
      result: null,
    });
    return { kind: 'reserved', ledgerId, operationRef, balanceRef };
  });
}

function draftContent(actionType, text) {
  return {
    fullCaption: text,
    shortCaption: '',
    callToAction: actionType === 'marketing_post' ? 'Review before publishing' : 'Review and send manually',
    hashtags: '',
    imagePrompt: '',
  };
}

function normalizeRecommendationList(value, fieldName) {
  if (!Array.isArray(value) || value.length > 8) {
    throw new GrowthAIGatewayError(`The AI estimate ${fieldName} are invalid.`, { code: 'invalid_provider_output', status: 502 });
  }
  const normalized = value.map(item => cleanString(item, 500));
  if (normalized.some(item => !item)) {
    throw new GrowthAIGatewayError(`The AI estimate ${fieldName} are invalid.`, { code: 'invalid_provider_output', status: 502 });
  }
  return normalized;
}

function parseEstimateAssistance(providerText, baselinePrice) {
  const trimmed = cleanString(providerText, 12_000);
  const jsonText = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new GrowthAIGatewayError('The AI estimate recommendation was not valid structured output.', { code: 'invalid_provider_output', status: 502 });
  }
  const allowedKeys = ['recommendedPrice', 'reasoning', 'assumptions', 'scopeSuggestions', 'possibleAddOns', 'complexityFlags'];
  if (!exactKeys(parsed, allowedKeys, allowedKeys)) {
    throw new GrowthAIGatewayError('The AI estimate recommendation shape is invalid.', { code: 'invalid_provider_output', status: 502 });
  }
  const recommendedPrice = parsed.recommendedPrice;
  const reasoning = cleanString(parsed.reasoning, 2_000);
  if (typeof recommendedPrice !== 'number' || !Number.isFinite(recommendedPrice) ||
      recommendedPrice <= 0 || recommendedPrice > 100_000 || !reasoning) {
    throw new GrowthAIGatewayError('The AI estimate recommendation values are invalid.', { code: 'invalid_provider_output', status: 502 });
  }
  return {
    schemaVersion: 1,
    authoritative: false,
    humanApprovalRequired: true,
    baselinePrice,
    recommendedPrice,
    reasoning,
    assumptions: normalizeRecommendationList(parsed.assumptions, 'assumptions'),
    scopeSuggestions: normalizeRecommendationList(parsed.scopeSuggestions, 'scope suggestions'),
    possibleAddOns: normalizeRecommendationList(parsed.possibleAddOns, 'possible add-ons'),
    complexityFlags: normalizeRecommendationList(parsed.complexityFlags, 'complexity flags'),
  };
}

function estimateAssistanceContent(assistance) {
  const baseline = assistance.baselinePrice;
  return {
    fullCaption: [
      `AI recommendation: ${baseline.currency} ${assistance.recommendedPrice}`,
      `Deterministic ServicesOS baseline: ${baseline.currency} ${baseline.low}-${baseline.high}`,
      `Reasoning: ${assistance.reasoning}`,
    ].join('\n'),
    shortCaption: 'AI recommendation only; deterministic pricing remains authoritative.',
    callToAction: 'Human review and approval required.',
    hashtags: '',
    imagePrompt: '',
  };
}

async function finalizeGeneration({ admin, db, ledgerId, prompt, providerResult, request, sourceContext, uid }) {
  const operationRef = ledgerRef(db, request.tenantId, ledgerId);
  const balanceRef = creditBalanceRef(db, request.tenantId);
  const draftRef = db.collection('tenants').doc(request.tenantId).collection('growthAIDrafts').doc(`ai-${ledgerId}`);
  const auditRef = draftRef.collection('audit').doc(`created-${ledgerId.slice(0, 32)}`);
  const estimateAssistance = request.actionType === 'estimate_assistance'
    ? parseEstimateAssistance(providerResult.text, sourceContext.baselinePrice)
    : null;
  const content = estimateAssistance
    ? estimateAssistanceContent(estimateAssistance)
    : draftContent(request.actionType, providerResult.text);
  const recommendationRef = estimateAssistance
    ? db.collection('tenants').doc(request.tenantId).collection('growthAIEstimateRecommendations').doc(draftRef.id)
    : null;
  const sourceRefs = { ...request.sourceRefs };
  return db.runTransaction(async transaction => {
    const [operationSnapshot, balanceSnapshot] = await Promise.all([
      transaction.get(operationRef), transaction.get(balanceRef),
    ]);
    if (!operationSnapshot.exists || operationSnapshot.data()?.status !== 'reserved') {
      throw new GrowthAIGatewayError('The GrowthAI credit reservation is no longer active.', { code: 'reservation_invalid', status: 409 });
    }
    const operation = operationSnapshot.data();
    const balance = balanceSnapshot.data() || {};
    transaction.set(balanceRef, {
      ...balance,
      reservedCredits: Math.max(0, (balance.reservedCredits || 0) - operation.credits),
      updatedAt: serverTimestamp(admin),
      updatedByUid: uid,
    });
    transaction.create(draftRef, {
      schemaVersion: 1,
      id: draftRef.id,
      tenantId: request.tenantId,
      pillar: prompt.pillar,
      actionType: request.actionType,
      status: 'draft',
      title: prompt.title.slice(0, 180),
      content,
      sourceRefs,
      createdByUid: uid,
      createdAt: serverTimestamp(admin),
      updatedByUid: uid,
      updatedAt: serverTimestamp(admin),
      approvedByUid: null,
      approvedAt: null,
      version: 1,
      lastAuditId: auditRef.id,
    });
    transaction.create(auditRef, {
      schemaVersion: 1,
      id: auditRef.id,
      tenantId: request.tenantId,
      draftId: draftRef.id,
      draftVersion: 1,
      action: 'draft_created',
      actorUid: uid,
      timestamp: serverTimestamp(admin),
      fromStatus: null,
      toStatus: 'draft',
    });
    if (recommendationRef) {
      transaction.create(recommendationRef, {
        id: recommendationRef.id,
        tenantId: request.tenantId,
        draftId: draftRef.id,
        leadId: request.sourceRefs.leadId,
        actionType: request.actionType,
        status: 'unapproved',
        ...estimateAssistance,
        createdByUid: uid,
        createdAt: serverTimestamp(admin),
      });
    }
    if (sourceContext.opportunityRef && sourceContext.opportunity?.status === 'open') {
      transaction.update(sourceContext.opportunityRef, {
        status: 'acted',
        actedAt: serverTimestamp(admin),
        actedByUid: uid,
        updatedAt: serverTimestamp(admin),
        updatedByUid: uid,
      });
    }
    const result = {
      draftId: draftRef.id,
      title: prompt.title.slice(0, 180),
      content,
      sourceRefs,
      ...(estimateAssistance ? { estimateAssistance } : {}),
    };
    transaction.update(operationRef, {
      status: 'finalized',
      finalizedAt: serverTimestamp(admin),
      providerRequestId: providerResult.providerRequestId,
      modelId: providerResult.modelId,
      relatedDraftId: draftRef.id,
      ...(recommendationRef ? { relatedEstimateRecommendationId: recommendationRef.id } : {}),
      result,
    });
    return result;
  });
}

async function restoreCredits({ admin, db, failureCode, ledgerId, request, uid }) {
  const operationRef = ledgerRef(db, request.tenantId, ledgerId);
  const balanceRef = creditBalanceRef(db, request.tenantId);
  await db.runTransaction(async transaction => {
    const [operationSnapshot, balanceSnapshot] = await Promise.all([
      transaction.get(operationRef), transaction.get(balanceRef),
    ]);
    if (!operationSnapshot.exists || operationSnapshot.data()?.status !== 'reserved') return;
    const operation = operationSnapshot.data();
    const balance = balanceSnapshot.data() || {};
    const buckets = normalizeBuckets(balance.buckets);
    for (const bucket of CREDIT_BUCKETS) buckets[bucket] += operation.reservedBuckets?.[bucket] || 0;
    transaction.set(balanceRef, {
      ...balance,
      buckets,
      reservedCredits: Math.max(0, (balance.reservedCredits || 0) - operation.credits),
      updatedAt: serverTimestamp(admin),
      updatedByUid: uid,
    });
    transaction.update(operationRef, {
      status: 'restored',
      restoredAt: serverTimestamp(admin),
      failureCode: cleanString(failureCode, 64) || 'provider_error',
    });
  });
}

async function generateGrowthAIContent({ admin, provider, requestBody, uid }) {
  const request = normalizeGenerationRequest(requestBody);
  const db = admin.firestore();
  const { tenant } = await verifyGrowthAIActor({ db, uid, tenantId: request.tenantId });
  const sourceContext = await verifySourceContext({ db, request });
  const prompt = buildPrompt({ request, tenant, sourceContext });
  const reservation = await reserveCredits({ admin, db, request, uid });
  if (reservation.kind === 'finalized') {
    return { success: true, reused: true, creditsCharged: reservation.ledger.credits, ...reservation.ledger.result };
  }

  try {
    const providerResult = validateProviderOutput(await provider.generateText({
      actionType: request.actionType,
      systemInstruction: prompt.systemInstruction,
      userPrompt: prompt.userPrompt,
    }));
    const result = await finalizeGeneration({
      admin, db, ledgerId: reservation.ledgerId, prompt, providerResult, request, sourceContext, uid,
    });
    return { success: true, reused: false, creditsCharged: ACTION_COSTS[request.actionType], ...result };
  } catch (error) {
    const failureCode = error?.code || 'provider_error';
    await restoreCredits({ admin, db, failureCode, ledgerId: reservation.ledgerId, request, uid });
    if (error instanceof GrowthAIGatewayError || error instanceof GrowthAIProviderError) throw error;
    throw new GrowthAIGatewayError('AI-assisted generation failed. Your credit was restored.', { code: failureCode, status: 502 });
  }
}

function applyCors(req, res) {
  const origin = req.headers?.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function createGrowthAIGenerationHandler({ admin, provider }) {
  return async (req, res) => {
    applyCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' });
    const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' });
    }
    let uid;
    try {
      uid = (await admin.auth().verifyIdToken(authHeader.slice('Bearer '.length).trim())).uid;
    } catch {
      return res.status(401).json({ error: 'Invalid authentication token', code: 'unauthenticated' });
    }
    try {
      const result = await generateGrowthAIContent({ admin, provider, requestBody: req.body, uid });
      return res.status(200).json(result);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : error instanceof GrowthAIProviderError ? 502 : 500;
      const code = cleanString(error?.code, 64) || 'generation_failed';
      const safeMessage = status >= 500 && !(error instanceof GrowthAIProviderError)
        ? 'AI-assisted generation failed. Your credit was restored.'
        : error.message;
      return res.status(status).json({ error: safeMessage, code });
    }
  };
}

module.exports = {
  ACTION_COSTS,
  CREDIT_BUCKETS,
  GrowthAIGatewayError,
  buildPrompt,
  createGrowthAIGenerationHandler,
  generateGrowthAIContent,
  normalizeGenerationRequest,
  verifyGrowthAIActor,
};
