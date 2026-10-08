import { formatMarketingServiceName } from './growthAIMarketingService';
import { normalizeOwnerUtterance } from './growthAIOwnerVocabulary';
import { normalizeBusinessCapabilityPlan } from './growthAIBusinessPlan';
import { resolveCanonicalServiceSelectors } from './growthAIServiceResolution';

const COLLECTIONS = { booking: 'bookings', customer: 'customers', estimate: 'estimates', service: 'services' };
export const BUSINESS_EVIDENCE_PRIORITY = Object.freeze([
  'explicit_canonical_selector', 'canonical_id_relationship', 'current_typed_context', 'interpretation_only',
]);
const reference = record => ({ type: record.type, id: record.id });
const key = ref => `${ref?.type}:${ref?.id}`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const assessment = (state, reason) => ({ state, reason });
const validCents = value => Number.isSafeInteger(value) && value >= 0;
const orderedBookings = packet => [...packet.bookings].filter(record => record.upcoming)
  .sort((a, b) => (a.scheduledMillis ?? Infinity) - (b.scheduledMillis ?? Infinity) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
const nameKey = value => normalizeOwnerUtterance(value).replace(/[?.!,]+/g, ' ').trim();
const dateValid = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

// Shared existing integer-cent arithmetic is also used to verify derived output.
export function calculateCanonicalCents(kind, cents) {
  if (!Array.isArray(cents) || !cents.length || cents.some(value => !validCents(value))) return null;
  if (kind === 'difference') return cents.length === 2 ? { differenceCents: Math.abs(cents[0] - cents[1]) } : null;
  const totalCents = cents.reduce((total, value) => total + value, 0);
  if (!Number.isSafeInteger(totalCents)) return null;
  if (kind === 'sum') return { totalCents, count: cents.length };
  if (kind === 'average') {
    const wholeCents = Math.floor(totalCents / cents.length);
    const remainderCents = totalCents % cents.length;
    return { totalCents, count: cents.length, averageCents: wholeCents + (remainderCents * 2 >= cents.length ? 1 : 0), rounded: remainderCents !== 0 };
  }
  return null;
}

export function readBusinessEvidenceValue(record, field) {
  if (field === 'status') return typeof record.status === 'string' && record.status.trim() ? record.status : null;
  if (field === 'email' || field === 'phone') return record.contact?.[field] || null;
  if (field === 'customer') return record.type === 'service' ? null : record.customerName || record.name || null;
  if (field === 'service') return record.serviceType ? formatMarketingServiceName(record.serviceType) : null;
  if (field === 'price') return record.type === 'service' ? { cents: record.priceCents } : record.type === 'booking'
    ? typeof record.amount === 'number' && Number.isFinite(record.amount) ? { amount: record.amount } : null
    : record.type === 'estimate' && record.pricing ? { range: record.pricing } : null;
  if (field === 'date') return record.type === 'booking' && dateValid(record.date)
    ? { date: record.date, time: record.time || null } : null;
  if (field === 'amount') return record.amount;
  if (field === 'priceCents') return record.priceCents;
  if (field === 'summary' || field === 'detail') return { name: record.customerName || record.name || '',
    serviceType: record.serviceType || '', date: record.date || '', time: record.time || '', status: record.status || '',
    ...(record.type === 'service' ? { priceCents: record.priceCents, durationMinutes: record.durationMinutes } : {}),
    ...(field === 'detail' && record.type === 'booking' ? { amount: record.amount } : {}),
    ...(field === 'detail' && record.type === 'estimate' ? { pricing: record.pricing } : {}) };
  return null;
}

export function canonicalRecordForEvidence(packet, ref) {
  const matches = packet?.[COLLECTIONS[ref?.type]]?.filter(record => record.id === ref.id && record.type === ref.type) || [];
  return matches.length === 1 ? matches[0] : null;
}

export function validateBusinessEvidenceInputs(plan, packet, records) {
  const requirements = plan.evidenceRequirements || [];
  if (!requirements.includes('authorized_workspace') || !requirements.includes('current_canonical_references') ||
      !packet?.ready || !packet.tenantId || packet.tenantId === 'DEFAULT') return assessment('insufficient_evidence', 'workspace_unavailable');
  if (requirements.includes('canonical_catalog') && !packet.catalogReady) return assessment('insufficient_evidence', 'catalog_unavailable');
  for (const record of records) {
    if (record?.scheduleError) return assessment('insufficient_evidence', 'invalid_booking_schedule');
    if (!record || record.tenantId && record.tenantId !== packet.tenantId) return assessment('invalid_stale_evidence', 'scope_mismatch');
    const matches = packet[COLLECTIONS[record.type]]?.filter(item => item.id === record.id) || [];
    if (matches.length > 1) return assessment('needs_clarification', 'ambiguous_canonical_id');
    if (matches.length !== 1 || matches[0] !== record) return assessment('invalid_stale_evidence', 'stale_reference');
  }
  if (requirements.includes('unique_resolved_record') || requirements.includes('unique_current_booking')) {
    if (records.length !== 1) return assessment('needs_clarification', 'unique_record_required');
  }
  if (requirements.includes('canonical_customer_relationship')) {
    if (!records[0]?.customerId || !canonicalRecordForEvidence(packet, { type: 'customer', id: records[0].customerId })) {
      return assessment('insufficient_evidence', 'missing_customer_relationship');
    }
  }
  if (requirements.includes('explicit_customer_identity')) {
    const matches = packet.bookings.filter(record => nameKey(record.customerName) === plan.explicitName);
    const ids = new Set(matches.map(record => record.customerId));
    if (!matches.length || ids.size !== 1 || ids.has('') || records.some(record => !matches.includes(record))) {
      return assessment('needs_clarification', 'explicit_customer_mismatch');
    }
    if (!requirements.includes('coherent_contextual_booking') && matches.length !== 1) {
      return assessment('needs_clarification', 'ambiguous_customer_booking');
    }
  }
  for (const requirement of requirements.filter(value => value.startsWith('saved_'))) {
    const field = requirement.slice(6);
    const value = readBusinessEvidenceValue(records[0] || {}, field);
    if (value == null || value === '') return assessment('insufficient_evidence', `missing_${field}`);
    if (field === 'price' && (records[0].type === 'booking' && !validCents(bookingCents(records[0])) ||
        records[0].type === 'service' && (!validCents(records[0].priceCents) || records[0].priceCents === 0))) return assessment('insufficient_evidence', 'invalid_price');
    if (field === 'date' && /\btime\b/.test(plan.input) && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time || '')) {
      return assessment('insufficient_evidence', 'missing_time');
    }
  }
  if (requirements.includes('valid_price_cents_for_every_service') &&
      records.some(record => !validCents(record.priceCents) || record.priceCents === 0)) return assessment('insufficient_evidence', 'invalid_price');
  if (requirements.includes('valid_integer_cents_for_every_operand')) {
    if (!records.length || records.length > plan.bounds.calculationOperands) return assessment('needs_clarification', 'bounded_operands_required');
    if (records.some(record => !validCents(record.type === 'service' ? record.priceCents : bookingCents(record)))) {
      return assessment('insufficient_evidence', 'invalid_operand');
    }
  }
  if (new Set(records.map(record => key(reference(record)))).size !== records.length) return assessment('needs_clarification', 'duplicate_operand');
  return assessment('sufficient', 'canonical_inputs');
}

function bookingCents(record) {
  if (typeof record.amount !== 'number' || !Number.isFinite(record.amount) || record.amount < 0) return null;
  const cents = Math.round(record.amount * 100);
  return validCents(cents) && Math.abs(record.amount * 100 - cents) < 0.000001 ? cents : null;
}

function contextDependent(plan) {
  return plan.source?.startsWith('context_') || plan.operation === 'compare' && !plan.selectors.length ||
    plan.operation === 'lookup' && !plan.explicitName && !plan.classification && plan.reference?.kind !== 'next_booking';
}

function invalidContext(plan, packet, session) {
  if (!contextDependent(plan) || !session?.tenantId) return false;
  if (session.tenantId !== packet?.tenantId || session.suspended) return true;
  const selection = plan.reference?.kind === 'return' ? plan.reference.entity === 'customer' ? session.personContext : session.topics?.[plan.reference.entity] : session;
  const refs = plan.source?.startsWith('context_') || plan.operation === 'compare' ? selection?.list || [] : [selection?.selected].filter(Boolean);
  return refs.some(ref => !canonicalRecordForEvidence(packet, ref));
}

// No descriptors survive the request; the current packet supplies every factual value.
export function gateBusinessEvidence(result, packet, session = {}, temporalConstraint = null) {
  if (result.status !== 'answerable') return { ...result, evidenceDescriptors: [], confidence: assessment(
    result.status === 'unsupported' ? 'unsupported' : result.reason === 'stale_evidence' || invalidContext(result.plan || {}, packet, session)
      ? 'invalid_stale_evidence' : result.status, result.reason || 'executor_rejected') };
  const planned = normalizeBusinessCapabilityPlan(result.plan);
  if (planned.status === 'unsupported') return { status: 'unsupported', evidenceDescriptors: [], confidence: assessment('unsupported', 'invalid_plan') };
  const plan = planned.plan;
  const deny = (state, reason) => ({ status: state === 'needs_clarification' ? state : 'insufficient_evidence', plan,
    evidence: [], evidenceDescriptors: [], confidence: assessment(state, reason),
    message: state === 'needs_clarification' ? 'Choose the specific current canonical records; this evidence is ambiguous.'
      : 'The required canonical evidence is unavailable or inconsistent. Choose a current record; I will not infer the missing values.' });
  if (!Array.isArray(result.evidence) || !Array.isArray(result.usedReferences)) return deny('invalid_stale_evidence', 'missing_provenance');
  const refs = result.evidence.map(item => item.reference);
  if (refs.some(ref => (packet?.[COLLECTIONS[ref?.type]] || []).filter(record => record.id === ref.id).length > 1)) {
    return deny('needs_clarification', 'ambiguous_canonical_id');
  }
  const records = refs.map(ref => canonicalRecordForEvidence(packet, ref));
  const inputs = validateBusinessEvidenceInputs(plan, packet, records);
  if (inputs.state !== 'sufficient') return deny(inputs.state, inputs.reason);
  if (plan.evidenceRequirements.includes('coherent_contextual_booking') &&
      (session.tenantId !== packet.tenantId || session.suspended || session.selected?.type !== 'booking' ||
        !same(refs, [session.selected]))) return deny('needs_clarification', 'explicit_context_conflict');
  if (!same(refs, result.usedReferences)) return deny('invalid_stale_evidence', 'inconsistent_references');
  let intended;
  let serviceResolution;
  if (plan.evidenceRequirements.includes('intended_service_selectors') || plan.operation === 'compare' && plan.selectors.length) {
    serviceResolution = resolveCanonicalServiceSelectors(packet, plan.selectors);
    if (serviceResolution.status !== 'resolved') return deny(serviceResolution.status, serviceResolution.reason);
    intended = serviceResolution.records;
  } else if (['count', 'identify'].includes(plan.operation) || plan.source === 'temporal_bookings') intended = orderedBookings(packet);
  else if (plan.operation === 'list') intended = packet.services;
  else if (plan.source === 'next_bookings') intended = orderedBookings(packet).slice(0, plan.count);
  else if (plan.source?.startsWith('context_') || plan.operation === 'compare' && !plan.selectors.length) {
    if (invalidContext(plan, packet, session)) return deny('invalid_stale_evidence', 'invalid_context');
    intended = session.list?.map(ref => canonicalRecordForEvidence(packet, ref));
  }
  if (intended && !same(refs, intended.map(reference))) return deny('invalid_stale_evidence', 'intended_selection_mismatch');
  if (plan.explicitName && records.some(record => nameKey(record.customerName || record.name) !== plan.explicitName)) {
    return deny('invalid_stale_evidence', 'explicit_selector_mismatch');
  }
  if (plan.operation === 'traverse') {
    const ordered = orderedBookings(packet);
    let intendedBooking = ordered[0];
    if (plan.start.kind !== 'next_booking') {
      const matches = ordered.filter(record => nameKey(record.customerName) === plan.start.name);
      if (matches.length !== 1) return deny('needs_clarification', 'ambiguous_start_booking');
      intendedBooking = plan.start.kind === 'after_customer' ? ordered[ordered.indexOf(matches[0]) + 1] : matches[0];
    }
    if (!intendedBooking || key(reference(intendedBooking)) !== key(refs[0])) return deny('invalid_stale_evidence', 'relationship_selection_mismatch');
  }
  if (plan.constraints.temporal && (!temporalConstraint || temporalConstraint.timeZone !== packet.timeZone ||
      records.some(record => record.type !== 'booking' || record.date < temporalConstraint.startDate || record.date >= temporalConstraint.endDate))) {
    return deny('invalid_stale_evidence', 'invalid_temporal_provenance');
  }
  const descriptors = [];
  const scope = { tenantId: packet.tenantId, validated: true, freshness: 'current_packet' };
  const explicit = Boolean(plan.explicitName || plan.entities.length || plan.classification);
  const resolution = explicit ? 'explicit_canonical_selector' : contextDependent(plan) ? 'current_typed_context' : 'canonical_selector';
  const add = (sourceType, record, field, value, provenance = {}) => descriptors.push({ sourceType,
    reference: record ? reference(record) : null, field, value, scope, provenance });
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!result.evidence[index].fields?.length) return deny('invalid_stale_evidence', 'missing_fields');
    const fields = plan.operation === 'traverse' ? plan.fields : plan.operation === 'calculate' ? [record.type === 'service' ? 'priceCents' : 'amount']
      : plan.operation === 'compare' ? ['priceCents'] : [plan.field || 'summary'];
    for (const field of fields) add('canonical_field', record, field, readBusinessEvidenceValue(record, field), {
      resolution, ...(serviceResolution ? { selector: serviceResolution.resolutions[index].selector, match: serviceResolution.resolutions[index].match } : {}),
    });
    if (resolution === 'current_typed_context') add('context_reference', record, 'selection', reference(record), { factualAuthority: false });
    if (plan.operation === 'traverse') add('canonical_relationship', record, 'customerId', record.customerId,
      { target: { type: 'customer', id: record.customerId }, hops: [...plan.hops] });
  }
  if (temporalConstraint) add('temporal_constraint', null, 'date_range', { ...temporalConstraint }, { factualAuthority: false });
  if (['count', 'identify', 'list'].includes(plan.operation)) add('derived_deterministic', null, 'loaded_record_count', records.length,
    { operands: refs, selection: plan.operation === 'list' ? 'current_catalog' : 'current_upcoming_packet' });
  if (plan.operation === 'lookup' && plan.field !== 'detail') {
    if (!same(result.value, readBusinessEvidenceValue(records[0], plan.field))) return deny('invalid_stale_evidence', 'field_output_mismatch');
  } else if (plan.operation === 'traverse') {
    if (records.length !== 1 || plan.fields.some(field => !same(result.value?.[field], readBusinessEvidenceValue(records[0], field)))) {
      return deny('invalid_stale_evidence', 'compound_chain_mismatch');
    }
  } else if (plan.operation === 'calculate') {
    const cents = records.map(record => record.type === 'service' ? record.priceCents : bookingCents(record));
    const derived = calculateCanonicalCents(plan.calculation, cents);
    if (!derived || Object.entries(derived).some(([field, value]) => result.value?.[field] !== value) ||
        !same(result.value?.records, records.map((record, index) => ({ reference: reference(record), label: record.name || record.customerName, cents: cents[index] })))) {
      return deny('invalid_stale_evidence', 'calculation_provenance_mismatch');
    }
    add('derived_deterministic', null, plan.calculation, derived, { operands: records.map((record, index) => ({ reference: reference(record), cents: cents[index] })) });
  } else if (plan.operation === 'compare') {
    const values = records.map(record => ({ reference: reference(record), name: record.name, priceCents: record.priceCents }));
    const min = Math.min(...values.map(item => item.priceCents));
    const max = Math.max(...values.map(item => item.priceCents));
    const difference = calculateCanonicalCents('difference', [max, min]);
    if (!same(result.value?.services, values) || result.value?.differenceCents !== difference?.differenceCents ||
        !same(result.value?.cheaper, values.filter(item => item.priceCents === min).map(item => item.reference)) ||
        !same(result.value?.moreExpensive, values.filter(item => item.priceCents === max).map(item => item.reference))) {
      return deny('invalid_stale_evidence', 'comparison_provenance_mismatch');
    }
    add('derived_deterministic', null, 'price_difference', difference, { operands: values });
  }
  return { ...result, evidenceDescriptors: descriptors,
    confidence: { ...assessment('sufficient', 'canonical_evidence'), requirementsChecked: [...plan.evidenceRequirements], resolution,
      explicitReplacement: explicit && session.tenantId === packet.tenantId && Boolean(session.selected || session.list?.length) &&
        (session.selected ? !refs.some(ref => key(ref) === key(session.selected)) : !same(refs, session.list)) } };
}
