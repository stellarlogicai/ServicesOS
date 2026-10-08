import { normalizeOwnerUtterance, resolveOwnerContextRequest } from './growthAIOwnerVocabulary';
import { resolveOwnerContext } from './growthAIOwnerContext';
import { hasInvalidActiveBookingSchedule, BOOKING_SCHEDULE_UNAVAILABLE } from './growthAIBookingFacts';
import { formatEstimateCurrency } from './growthAIEstimateAssistance';
import { BUSINESS_PLAN_BOUNDS, normalizeBusinessCapabilityPlan } from './growthAIBusinessPlan';
import { resolveCanonicalServiceSelectors } from './growthAIServiceResolution';
import { WEEKDAYS, resolveTemporalConstraint } from './growthAITemporalConstraint';
import { calculateCanonicalCents as calculationCents, readBusinessEvidenceValue as readValue,
  validateBusinessEvidenceInputs, gateBusinessEvidence } from './growthAIBusinessEvidence';

const unsupported = () => ({ status: 'unsupported' });
const FIELDS = Object.freeze({
  email: /\bemail\b/,
  phone: /\b(?:phone|number|contact)\b/,
  price: /\b(?:price|cost|charging|charge|paying)\b/,
  status: /\bstatus\b/,
  date: /\b(?:when|date|time)\b/,
  service: /\bservice\b/,
  customer: /\b(?:who|customer name)\b/,
});
const COLLECTIONS = Object.freeze({ booking: 'bookings', customer: 'customers', estimate: 'estimates', service: 'services' });
const MAX_CALCULATION_OPERANDS = BUSINESS_PLAN_BOUNDS.calculationOperands;
const MONTHS = Object.freeze({ january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 });

const relationshipText = value => normalizeOwnerUtterance(value).replace(/[?.!,]+/g, ' ').trim();

function temporalPhrase(input) {
  if (/\btoday\b/.test(input)) return { kind: 'today' };
  if (/\btomorrow\b/.test(input)) return { kind: 'tomorrow' };
  if (/\bthis week\b/.test(input)) return { kind: 'this_week' };
  const weekday = WEEKDAYS.find(day => new RegExp(`\\b${day}\\b`).test(input));
  if (weekday) return { kind: 'weekday', weekday };
  const numeric = input.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (numeric) return { kind: 'date', month: Number(numeric[1]), day: Number(numeric[2]) };
  const named = input.match(/\b(?:on )?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/);
  return named ? { kind: 'date', month: MONTHS[named[1]], day: Number(named[2]) } : null;
}

function scopedPacketForTemporal(packet, constraint) {
  return constraint ? { ...packet, bookings: packet.bookings.filter(record => record.date >= constraint.startDate && record.date < constraint.endDate) } : packet;
}

function terminalFields(input) {
  const fields = [];
  if (/\b(?:who(?: is)? (?:my |the )?(?:next )?customer|customer for|customer(?:,|\s+what|\s+and))\b/.test(input)) fields.push('customer');
  if (/\b(?:what service|service are|service is|service (?:do|will)|what are they getting)\b/.test(input)) fields.push('service');
  if (/\b(?:how much|what (?:is|are) (?:the )?(?:customer )?(?:paying|charging)|how much is it)\b/.test(input)) fields.push('price');
  if (/\b(?:phone|number)\b/.test(input)) fields.push('phone');
  if (/\b(?:when|date|time)\b/.test(input)) fields.push('date');
  return [...new Set(fields)];
}

function interpretRelationshipTraversal(input) {
  if (!/^(?:what|who|which|when|how)\b/.test(input) ||
      /\b(?:write|draft|send|create|save|marketing|reputation|review|estimate|profit|margin|recommend|history|refund|cancel|payment|do not|don't|never|not)\b/.test(input)) return null;
  const fields = terminalFields(input);
  const after = input.match(/\b(?:comes?|is) after ([a-z][a-z .'-]{1,80}?)(?:\s+(?:and|what|who)|$)/);
  const named = input.match(/\b(?:service is|customer is|for) ([a-z][a-z .'-]{1,80}?)(?:\s+(?:getting|and|what|who|,)|$)/);
  const temporal = temporalPhrase(input);
  const start = after ? { kind: 'after_customer', name: relationshipText(after[1]) }
    : /\bnext (?:customer|booking|job)\b/.test(input) ? { kind: 'next_booking' }
      : temporal && /\b(?:customer|booking|job)\b/.test(input) ? { kind: 'next_booking' }
      : named ? { kind: 'named_customer', name: relationshipText(named[1]) } : null;
  if (!start) return null;
  if (fields.length === 1 && ['service', 'price', 'phone', 'date'].includes(fields[0])) fields.unshift('customer');
  if (fields.length < 2) return null;
  const hops = ['booking.customer'];
  if (fields.includes('service')) hops.push('booking.service');
  if (fields.includes('price')) hops.push('booking.price');
  if (fields.includes('date')) hops.push('booking.schedule');
  if (fields.includes('phone')) hops.push('customer.phone');
  return { version: 1, entity: 'booking', operation: 'traverse', fields, start, hops, temporal, input };
}

function interpretComparison(input) {
  if (!/^(?:compare|what|which|how)\b/.test(input) ||
      !/\b(?:compare|difference|cheaper|expensive|costs? more|much more)\b/.test(input) ||
      /\b(?:write|draft|send|create|save|marketing|reputation|review|estimates?|bookings?|customers?|profits?|margins?|best|recommend|durations?|time|demand|history|discount|promotion|payments?|subscription|billing|do not|don't|never|not)\b/.test(input)) return null;
  const text = input.replace(/[?.!]+$/, '').trim();
  let entities = text.includes(' between ') ? text.split(' between ')[1] : /^compare\b/.test(text)
    ? text.replace(/^compare\s+/, '') : text.includes(',') ? text.slice(text.indexOf(',') + 1) : null;
  if (entities && /^(?:(?:these|those|the) (?:two|services)|these two services|those two services)$/.test(entities.trim())) entities = null;
  const selectors = entities ? entities.split(/\s+(?:and|or|vs\.?|versus)\s+|\s*,\s*/).map(item => item.trim()).filter(Boolean) : [];
  return { version: 1, entity: 'service', operation: 'compare', field: 'price',
    comparison: /\bcheaper\b/.test(input) ? 'cheaper' : /\bdifference|much more\b/.test(input) ? 'difference' : 'more_expensive',
    reference: { kind: selectors.length ? 'named_services' : 'current_services' }, selectors, input };
}

function interpretCalculation(input) {
  if (!/^(?:what|how|which|show|tell)\b/.test(input) ||
      /\b(?:write|draft|send|create|save|marketing|reputation|review|estimate|profit|margin|recommend|history|refund|cancel|payment|paid|billing|do not|don't|never|not)\b/.test(input)) return null;
  const calculation = /\baverage\b/.test(input) ? 'average' : /\b(?:total|together|worth)\b/.test(input) ? 'sum' : null;
  if (!calculation) return null;
  const temporal = temporalPhrase(input);
  if (temporal && /\b(?:bookings?|jobs?|appointments?|schedule)\b/.test(input)) return {
    version: 1, entity: 'booking', operation: 'calculate', calculation, source: 'temporal_bookings', temporal, input,
  };
  const nextCount = input.match(/\bnext\s+(\d+)\s+(?:bookings?|jobs?|appointments?)\b/);
  if (nextCount) return { version: 1, entity: 'booking', operation: 'calculate', calculation,
    source: 'next_bookings', count: Number(nextCount[1]), temporal, input };
  // An explicit conversational pair takes precedence over the general service catalog.
  if (/\b(?:these|those) (?:two |both )?(?:services?|ones?)\b/.test(input)) return {
    version: 1, entity: 'service', operation: 'calculate', calculation, source: 'context_services', temporal, input,
  };
  if (/\b(?:average|total)\b.*\b(?:my )?services?\b/.test(input)) return {
    version: 1, entity: 'service', operation: 'calculate', calculation, source: 'catalog_services', temporal, input,
  };
  if (/\b(?:and|vs\.?|versus)\b/.test(input) && /\b(?:total|together|cost)\b/.test(input)) return {
    version: 1, entity: 'service', operation: 'calculate', calculation, source: 'named_services', temporal, input,
  };
  if (/\b(?:total|cost) together\b/.test(input)) return {
    version: 1, entity: 'service', operation: 'calculate', calculation, source: 'context_services', temporal, input,
  };
  if (/\b(?:both|these two|those two) (?:bookings?|jobs?|appointments?)\b/.test(input)) return {
    version: 1, entity: 'booking', operation: 'calculate', calculation, source: 'context_bookings', temporal, input,
  };
  return null;
}

// Small composable slots, not a sentence allowlist. Uncertain language retains the existing router.
export function interpretBusinessQuestion(message) {
  const input = normalizeOwnerUtterance(message);
  const contact = resolveOwnerContextRequest(input);
  if (contact?.unrecognizedNamedReference) return unsupported();
  // These existing legacy fields are not booking appointment facts or modern traversal requests.
  if (contact?.field === 'estimate_creation' || contact?.explicitName && ['history', 'quote', 'detail', 'customer'].includes(contact.domain)) return unsupported();
  // Keep the existing deterministic contact-info -> phone contract, including named reads.
  const contactField = contact?.contactField || (contact?.domain === 'contact' && contact.explicitName && /\bcontact info\b/.test(input) ? 'phone' : null);
  if (contact?.explicitName && (['price', 'status', 'date', 'service'].includes(contact.domain) ||
      contact.domain === 'contact' && ['phone', 'email'].includes(contact.contactField) && contact.reference?.kind === 'current')) return {
    status: 'interpreted', plan: { version: 1, entity: 'booking', operation: 'lookup', field: contact.domain === 'contact' ? contact.contactField : contact.domain,
      reference: contact.reference, explicitName: contact.explicitName, temporal: 'upcoming', input },
  };
  if (contact?.domain === 'contact' && contact.explicitName && contactField) return {
    status: 'interpreted', plan: { version: 1, entity: 'customer', operation: 'lookup', field: contactField,
      reference: { kind: 'none' }, explicitName: contact.explicitName, temporal: 'upcoming', input },
  };
  const calculation = interpretCalculation(input);
  if (calculation) return { status: 'interpreted', plan: calculation };
  const traversal = interpretRelationshipTraversal(input);
  if (traversal) return { status: 'interpreted', plan: traversal };
  const comparison = interpretComparison(input);
  if (comparison) return { status: 'interpreted', plan: comparison };
  if (/\b(?:next|last) week\b/.test(input) ||
      !/^(?:what|who|which|when|how|show|list|tell|count|go|take|do|are)\b/.test(input) ||
      /\b(?:write|draft|create|send|save|improve|generate|review|reputation|marketing|promote|attention|urgent|worry|important|take care|needs taking care|history|before|quote|quoted|include|difference|compare|delete|refund|cancel|payment|paid|do not|don't|never|not)\b/.test(input) ||
      /\b(?:and|or)\b/.test(input) || /\b(?:personal|life|month|yesterday|overdue|past due|completed|cancelled|archived|deleted|assigned|ever|all time)\b/.test(input)) return unsupported();
  const temporal = temporalPhrase(input) || 'upcoming';
  const bookingLanguage = /\b(?:bookings?|jobs?|appointments?|schedule|scheduled|coming|next customer)\b/.test(input);
  const temporalFact = temporal !== 'upcoming' &&
    (bookingLanguage || /\b(?:how many|count|number of|who|first|what do i have)\b/.test(input));
  const booking = bookingLanguage || temporalFact;
  const catalog = /\bservices\b/.test(input) && /\b(?:offer|have|available|list|show)\b/.test(input);
  const count = /\b(?:how many|count|number of)\b/.test(input) || /^(?:do i have|are there)\b/.test(input) && booking;
  const ordinal = input.match(/\b(first|second|last|previous|other)\b/)?.[1] || (/\bnext one\b/.test(input) ? 'next' : null);
  const returnType = /\bback to\b/.test(input) ? input.match(/\b(customer|booking|job|estimate|service)\b/)?.[1] : null;
  const reference = returnType ? { kind: 'return', entity: returnType === 'job' ? 'booking' : returnType } : ordinal
    ? { kind: 'position', position: ordinal } : /\b(?:their|they|them|that|this|it|selected|current|the customer)\b/.test(input)
      ? { kind: 'current' } : { kind: 'none' };
  const fields = Object.entries(FIELDS).filter(([, pattern]) => pattern.test(input)).map(([field]) => field);
  // Count's "number" is not a contact field; catalog's plural services is not a selected-job field.
  let field = count ? null : fields[0] || null;
  if (field === 'service' && /^what (?:service|am i)/.test(input)) field = 'service';
  const next = /\bnext\b/.test(input) && !ordinal && !/\b(?:what about|after)\b/.test(input);
  let entity = catalog ? 'service' : /\bestimates?\b/.test(input) ? 'estimate' : booking || next ? 'booking' : null;
  let operation = catalog ? 'list' : count && booking ? 'count' : booking && (!field || field === 'customer' && reference.kind === 'none') || next && field === 'customer' ? 'identify' : field ? 'lookup' : null;
  if (count && !booking) return unsupported();
  if (!entity && field === 'customer') entity = 'customer';
  if (returnType && !field) { entity = reference.entity; operation = 'lookup'; field = 'detail'; }
  if (!operation) return unsupported();
  // Named lookup remains the existing context resolver's responsibility, never an implicit selection.
  if (reference.kind === 'none' && operation === 'lookup' && !next &&
      !/^(?:what (?:are we charging|is (?:the )?(?:price|cost|date|time|email|phone|number))|how much (?:are we charging|do we charge))[^a-z]*$/.test(input)) return unsupported();
  const classification = field === 'price' ? input.match(/\b(standard|deep|move[ -]?out|construction)\b/)?.[1]?.replace(/[ -]/g, '') : null;
  return { status: 'interpreted', plan: { version: 1, entity, operation, field, temporal,
    reference: next ? { kind: 'next_booking' } : reference, classification: classification || null, input } };
}

const find = (packet, reference) => packet[COLLECTIONS[reference?.type]]?.find(record => record.id === reference.id);
const typedRef = record => ({ type: record.type, id: record.id });

function traversalContext(packet, session, booking, options) {
  const listed = resolveOwnerContext({ domain: 'bookings', input: '' }, packet, session, options);
  if (!listed || listed.kind !== 'answer') return null;
  const selected = typedRef(booking);
  const index = listed.context.list.findIndex(reference => reference.type === selected.type && reference.id === selected.id);
  if (index < 0) return null;
  const selection = { list: listed.context.list, selected, index };
  return { ...listed.context, ...selection, activeTopic: 'booking', suspended: false,
    topics: { ...listed.context.topics, booking: selection }, personContext: selection };
}

function traverseRelationships(plan, packet, session, options) {
  const reject = (status, message) => ({ status, plan, evidence: [], message });
  const ordered = [...packet.bookings].filter(record => record.upcoming)
    .sort((a, b) => (a.scheduledMillis ?? Infinity) - (b.scheduledMillis ?? Infinity) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
  let booking;
  if (plan.start.kind === 'next_booking') {
    [booking] = ordered;
  } else {
    const matchingCustomers = new Map();
    for (const record of ordered) {
      if (relationshipText(record.customerName) === plan.start.name) {
        const key = record.customerId || record.id;
        matchingCustomers.set(key, [...(matchingCustomers.get(key) || []), record]);
      }
    }
    if (matchingCustomers.size !== 1) return reject('needs_clarification', 'Choose the specific current customer booking from the loaded schedule; that customer name is missing or ambiguous.');
    const [matches] = matchingCustomers.values();
    if (matches.length !== 1) return reject('needs_clarification', 'That customer has more than one current booking. Choose the specific booking before asking what comes after it.');
    const [matched] = matches;
    booking = plan.start.kind === 'after_customer' ? ordered[ordered.findIndex(record => record.id === matched.id) + 1] : matched;
  }
  if (!booking) return reject('insufficient_evidence', 'No eligible upcoming booking is available for that relationship. I will not infer one from another record.');
  if (!booking.customerId || !booking.customerName) return reject('insufficient_evidence', 'That booking has no canonical customer relationship. I cannot continue this lookup.');
  const inputs = validateBusinessEvidenceInputs(plan, packet, [booking]);
  if (inputs.state !== 'sufficient') return reject(inputs.state === 'needs_clarification' ? inputs.state : 'insufficient_evidence', 'The required canonical relationship or saved field is unavailable. I will not infer it from another record.');
  const context = traversalContext(packet, session, booking, options);
  if (!context) return reject('insufficient_evidence', 'The selected booking is no longer available in the current authorized schedule.');
  const values = {};
  for (const field of plan.fields) {
    const value = readValue(booking, field);
    if (value == null || value === '') return reject('insufficient_evidence', `The requested ${field} is unavailable in this loaded booking. I will not infer it from another record.`);
    values[field] = value;
  }
  const fields = plan.fields.map(field => field === 'phone' ? 'contact.phone' : field === 'customer' ? 'customerName' : field);
  return { status: 'answerable', plan, context, value: values,
    evidence: [{ reference: typedRef(booking), fields, hops: plan.hops }], usedReferences: [typedRef(booking)],
    label: booking.customerName, sourceType: 'booking' };
}

function bookingAmountCents(record) {
  if (record?.type !== 'booking' || typeof record.amount !== 'number' || !Number.isFinite(record.amount) || record.amount < 0) return null;
  const cents = Math.round(record.amount * 100);
  return Number.isSafeInteger(cents) && Math.abs(record.amount * 100 - cents) < 0.000001 ? cents : null;
}

function calculationContext(packet, session, records, domain, options) {
  const resolved = resolveOwnerContext({ domain, input: '' }, { ...packet, [COLLECTIONS[records[0]?.type]]: records }, session, options);
  return resolved?.kind === 'answer' ? resolved.context : null;
}

function calculateBusinessFacts(plan, packet, session, options) {
  const reject = (status, message) => ({ status, plan, evidence: [], message });
  let records;
  let cents;
  let context;
  if (plan.source === 'next_bookings' || plan.source === 'temporal_bookings') {
    if (plan.source === 'temporal_bookings') {
      records = [...packet.bookings].filter(record => record.upcoming)
        .sort((a, b) => (a.scheduledMillis ?? Infinity) - (b.scheduledMillis ?? Infinity) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
      if (!records.length) return reject('insufficient_evidence', 'No eligible bookings are available in that time window.');
      if (records.length > MAX_CALCULATION_OPERANDS) return reject('needs_clarification', `Choose no more than ${MAX_CALCULATION_OPERANDS} bookings for a bounded calculation.`);
      context = calculationContext(packet, session, records, 'bookings', options);
      cents = records.map(bookingAmountCents);
    } else {
    if (!Number.isSafeInteger(plan.count) || plan.count < 1 || plan.count > MAX_CALCULATION_OPERANDS) return reject('needs_clarification', `Choose between 1 and ${MAX_CALCULATION_OPERANDS} upcoming bookings for a bounded calculation.`);
    records = [...packet.bookings].filter(record => record.upcoming)
      .sort((a, b) => (a.scheduledMillis ?? Infinity) - (b.scheduledMillis ?? Infinity) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id))
      .slice(0, plan.count);
    if (records.length !== plan.count) return reject('insufficient_evidence', `Only ${records.length} eligible upcoming booking${records.length === 1 ? '' : 's'} are available. I will not substitute other records.`);
    context = calculationContext(packet, session, records, 'bookings', options);
    cents = records.map(bookingAmountCents);
    }
  } else if (plan.source === 'context_bookings') {
    if (session.tenantId !== packet.tenantId || session.suspended || session.activeTopic !== 'booking' ||
        !Array.isArray(session.list) || session.list.length !== 2 || session.list.some(reference => reference.type !== 'booking')) {
      return reject('needs_clarification', 'Establish exactly two current bookings before asking for their calculation.');
    }
    records = session.list.map(reference => find(packet, reference));
    if (records.some(record => !record)) return reject('insufficient_evidence', 'The earlier booking references are stale. Establish the two current bookings again.');
    context = calculationContext(packet, session, records, 'bookings', options);
    cents = records.map(bookingAmountCents);
  } else {
    if (!packet.catalogReady) return reject('insufficient_evidence', 'The canonical service catalog is unavailable. I cannot calculate configured service prices.');
    if (plan.source === 'catalog_services') records = packet.services;
    else if (plan.source === 'context_services') {
      if (session.tenantId !== packet.tenantId || session.suspended || session.activeTopic !== 'service' ||
          !Array.isArray(session.list) || session.list.length !== 2 || session.list.some(reference => reference.type !== 'service')) {
        return reject('needs_clarification', 'Establish exactly two canonical services before asking for their calculation.');
      }
      records = session.list.map(reference => find(packet, reference));
      if (records.some(record => !record)) return reject('insufficient_evidence', 'The earlier service references are stale. Establish the intended services again.');
    } else {
      if (plan.selectors.length < 2) return reject('needs_clarification', 'Name at least two canonical services for this calculation.');
      if (plan.selectors.length > MAX_CALCULATION_OPERANDS) return reject('needs_clarification', `Choose no more than ${MAX_CALCULATION_OPERANDS} canonical services for a bounded calculation.`);
      const resolved = resolveCanonicalServiceSelectors(packet, plan.selectors);
      if (resolved.status !== 'resolved') return reject(resolved.status, resolved.status === 'needs_clarification'
        ? 'Choose distinct configured service names; a requested service is ambiguous or repeated.'
        : 'A requested canonical service is unavailable. I will not substitute another service.');
      records = resolved.records;
    }
    if (records.length < 2) return reject('needs_clarification', 'Name at least two canonical services, or establish exactly two services first.');
    if (records.length > MAX_CALCULATION_OPERANDS) return reject('needs_clarification', `Choose no more than ${MAX_CALCULATION_OPERANDS} canonical services for a bounded calculation.`);
    context = calculationContext(packet, session, records, 'services', options);
    cents = records.map(record => record.priceCents);
  }
  if (!context) return reject('insufficient_evidence', 'The selected records are no longer available in the current authorized workspace.');
  const inputs = validateBusinessEvidenceInputs(plan, packet, records);
  if (inputs.state !== 'sufficient') return reject(inputs.state === 'needs_clarification' ? inputs.state : 'insufficient_evidence', 'A requested canonical amount is unavailable or invalid. I will not substitute zero or infer another value.');
  const value = calculationCents(plan.calculation, cents);
  if (!value) return reject('insufficient_evidence', 'A requested canonical amount is unavailable or invalid. I will not substitute zero or infer another value.');
  const fields = records[0].type === 'service' ? ['priceCents'] : ['amount'];
  const values = records.map((record, index) => ({ reference: typedRef(record), label: record.name || record.customerName, cents: cents[index] }));
  return { status: 'answerable', plan, context, value: { ...value, records: values },
    evidence: values.map(value => ({ reference: value.reference, fields, cents: value.cents })),
    usedReferences: values.map(value => value.reference) };
}

function compareServices(plan, packet, session, options) {
  const reject = (status, message) => ({ status, plan, evidence: [], message });
  if (!packet.catalogReady) return reject('insufficient_evidence', 'The canonical service catalog is unavailable. I cannot compare configured prices.');
  let records;
  if (plan.selectors.length) {
    if (plan.selectors.length < 2) return reject('needs_clarification', 'Name at least two canonical services to compare.');
    const resolved = resolveCanonicalServiceSelectors(packet, plan.selectors);
    if (resolved.status !== 'resolved') return reject(resolved.status, resolved.status === 'needs_clarification'
      ? 'More than one canonical service matches that name, or a service is repeated. Use distinct configured service names.'
      : 'A requested canonical service or its configured price is unavailable in this loaded catalog. I will not infer it from bookings.');
    records = resolved.records;
  } else {
    if (session.tenantId !== packet.tenantId || session.suspended || session.activeTopic !== 'service' ||
        !session.list?.length || session.list.some(reference => reference.type !== 'service')) {
      return reject('needs_clarification', 'Which canonical services do you want to compare? Name them or establish a service list first.');
    }
    if (/\b(?:two|one|other)\b/.test(plan.input) && session.list.length !== 2) {
      return reject('needs_clarification', 'Which two services do you mean? Name the intended pair; I will not choose from a larger list.');
    }
    records = session.list.map(reference => find(packet, reference));
    if (records.some(record => !record)) return reject('insufficient_evidence', 'The earlier service references are stale. Establish a current service list before comparing.');
  }
  if (records.length < 2 || new Set(records.map(record => record.id)).size !== records.length) {
    return reject('needs_clarification', 'Choose at least two distinct canonical services to compare.');
  }
  if (records.some(record => !Number.isSafeInteger(record.priceCents) || record.priceCents <= 0)) {
    return reject('insufficient_evidence', 'A configured service price is unavailable or invalid. I cannot calculate a comparison.');
  }
  const inputs = validateBusinessEvidenceInputs(plan, packet, records);
  if (inputs.state !== 'sufficient') return reject(inputs.state === 'needs_clarification' ? inputs.state : 'insufficient_evidence', 'The requested canonical service evidence is unavailable or ambiguous.');
  // The existing resolver owns the service topic/list and preserves the earlier person context.
  const resolved = resolveOwnerContext({ domain: 'services', input: '' }, { ...packet, services: records }, session, options);
  const values = records.map(record => ({ reference: typedRef(record), name: record.name, priceCents: record.priceCents }));
  const min = Math.min(...values.map(value => value.priceCents));
  const max = Math.max(...values.map(value => value.priceCents));
  const difference = calculationCents('difference', [max, min]);
  return { status: 'answerable', plan, context: resolved.context,
    evidence: values.map(value => ({ reference: value.reference, fields: ['priceCents'], priceCents: value.priceCents })),
    usedReferences: values.map(value => value.reference),
    value: { services: values, differenceCents: difference?.differenceCents,
      cheaper: values.filter(value => value.priceCents === min).map(value => value.reference),
      moreExpensive: values.filter(value => value.priceCents === max).map(value => value.reference) } };
}

export function queryBusinessFacts(plan, packet, session = {}, options = {}) {
  const planned = normalizeBusinessCapabilityPlan(plan);
  if (planned.status === 'unsupported') return gateBusinessEvidence(planned, packet, session);
  plan = planned.plan;
  if (!packet?.ready || !packet.tenantId || packet.tenantId === 'DEFAULT') return gateBusinessEvidence({
    status: 'insufficient_evidence', plan, evidence: [], reason: 'workspace_unavailable',
    message: 'This tenant context is currently unavailable. Reload the workspace before asking about these records.',
  }, packet, session);
  const constraint = resolveTemporalConstraint(plan.constraints.temporal, packet, options);
  if (constraint?.error) return gateBusinessEvidence({ status: 'insufficient_evidence', plan, evidence: [], message: constraint.error }, packet, session);
  if ((plan.entity === 'booking' || plan.reference?.kind === 'next_booking') && hasInvalidActiveBookingSchedule(packet)) {
    return gateBusinessEvidence({ status: 'insufficient_evidence', plan, evidence: [], message: BOOKING_SCHEDULE_UNAVAILABLE }, packet, session);
  }
  const scopedPacket = scopedPacketForTemporal(packet, constraint);
  // Existing executors fuse canonical retrieval with their bounded operation.
  let result;
  if (plan.capabilities.includes('comparison')) result = compareServices(plan, scopedPacket, session, options);
  else if (plan.capabilities.includes('relationship_traversal')) result = traverseRelationships(plan, scopedPacket, session, options);
  else if (plan.capabilities.includes('calculation')) result = calculateBusinessFacts(plan, scopedPacket, session, options);
  else result = lookupBusinessFacts(plan, scopedPacket, session, options, constraint);
  return gateBusinessEvidence(result, scopedPacket, session, constraint);
}

function lookupBusinessFacts(plan, scopedPacket, session, options, constraint) {
  let context = session;
  let request;
  if (plan.operation === 'list') request = { domain: 'services', input: plan.input };
  else if (plan.operation === 'count' || plan.operation === 'identify') request = {
    domain: 'bookings', input: plan.input,
    countQuestion: plan.operation === 'count' || /\bcoming up\b/.test(plan.input) && !/\b(?:jobs?|bookings?|appointments?)\b/.test(plan.input),
  };
  else {
    if (plan.reference.kind === 'next_booking') {
      const next = resolveOwnerContext({ domain: 'bookings', input: plan.input, temporalConstraint: constraint }, scopedPacket, context, options);
      context = next.context || {};
    }
    request = { domain: ['email', 'phone'].includes(plan.field) ? 'contact' : plan.field,
      input: plan.reference.kind === 'next_booking' ? 'their' : plan.input, contactField: ['email', 'phone'].includes(plan.field) ? plan.field : null,
      explicitName: plan.explicitName || null, serviceType: plan.classification,
      reference: plan.reference,
      returnType: plan.reference.kind === 'return' ? plan.reference.entity : null };
  }
  if (constraint) request = { ...request, temporalConstraint: constraint, preservePersonContext: Boolean(session.personContext) };
  const resolved = resolveOwnerContext(request, scopedPacket, context, options);
  if (!resolved || resolved.kind === 'handoff') return unsupported();
  if (resolved.kind === 'clarify') return { status: resolved.status === 'insufficient_evidence' || scopedPacket.catalogReady === false && plan.entity === 'service'
    ? 'insufficient_evidence' : 'needs_clarification', plan, evidence: [], message: resolved.content };
  const refs = plan.operation === 'lookup' ? [resolved.context?.selected].filter(Boolean) : resolved.context?.list || [];
  const records = refs.map(reference => find(scopedPacket, reference));
  if (records.some(record => !record)) return { status: 'insufficient_evidence', plan, evidence: [], reason: 'stale_evidence', message: 'The requested records are no longer available. Choose a current record.' };
  const value = plan.operation === 'lookup' ? readValue(records[0] || {}, plan.field) : null;
  const inputs = validateBusinessEvidenceInputs(plan, scopedPacket, records);
  if (inputs.state !== 'sufficient' && plan.field === 'date') return { status: 'insufficient_evidence', plan, evidence: [],
    message: 'The requested date or time is unavailable or invalid in this loaded record. I will not infer it.' };
  const evidence = records.map(record => ({ reference: typedRef(record), fields: plan.field ? [plan.field] : ['summary'] }));
  return { status: plan.operation === 'lookup' && plan.field !== 'detail' && value == null ? 'insufficient_evidence' : 'answerable',
    plan, evidence, context: resolved.context, value,
    // Summary/detail templates already validate and format the same authorized projection.
    summary: resolved.content, label: records[0]?.customerName || records[0]?.name || '', sourceType: records[0]?.type || null,
    usedReferences: evidence.map(item => item.reference) };
}

export function formatBusinessAnswer(result) {
  if (!result || result.status === 'unsupported') return null;
  if (result.message) return result.message;
  if (result.status === 'answerable' && result.confidence?.state !== 'sufficient') return 'The required canonical evidence has not been validated. Choose a current record.';
  if (result.plan.operation === 'traverse') {
    const parts = [];
    if (result.plan.fields.includes('customer')) parts.push(`Customer: ${result.value.customer}.`);
    if (result.plan.fields.includes('service')) parts.push(`Service: ${result.value.service}.`);
    if (result.plan.fields.includes('price')) parts.push(`Saved booking amount: ${formatEstimateCurrency(result.value.price.amount)}.`);
    if (result.plan.fields.includes('date')) parts.push(`Scheduled: ${result.value.date.date}${result.value.date.time ? ` at ${result.value.date.time}` : ''}.`);
    if (result.plan.fields.includes('phone')) parts.push(`Saved booking contact phone: ${result.value.phone}. This is saved record information, not a verified current customer profile.`);
    return parts.join(' ');
  }
  if (result.plan.operation === 'compare') {
    const { services, differenceCents } = result.value;
    const prices = services.map(service => `${service.name} is ${formatEstimateCurrency(service.priceCents / 100)}`).join('; ');
    if (!differenceCents) return `These services have the same configured price. ${prices}. Configured-price difference: ${formatEstimateCurrency(0)}.`;
    const cheaper = services.filter(service => service.priceCents === Math.min(...services.map(item => item.priceCents))).map(service => service.name).join(', ');
    const expensive = services.filter(service => service.priceCents === Math.max(...services.map(item => item.priceCents))).map(service => service.name).join(', ');
    return `${prices}. ${expensive} costs ${formatEstimateCurrency(differenceCents / 100)} more than ${cheaper}; ${cheaper} is cheaper. This compares configured service prices, not customer-specific quotes.`;
  }
  if (result.plan.operation === 'calculate') {
    const label = result.plan.calculation === 'average' ? 'Average' : 'Total';
    const cents = result.plan.calculation === 'average' ? result.value.averageCents : result.value.totalCents;
    const basis = result.value.records.map(record => `${record.label}: ${formatEstimateCurrency(record.cents / 100)}`).join('; ');
    const rounding = result.plan.calculation === 'average' && result.value.rounded ? ' Rounded to the nearest cent.' : '';
    return `${label}: ${formatEstimateCurrency(cents / 100)} across ${result.value.count} canonical ${result.value.count === 1 ? 'record' : 'records'}. ${basis}.${rounding}`;
  }
  const field = result.plan.field;
  if (['email', 'phone'].includes(field)) return `${result.label} - saved ${result.sourceType} contact information: ${field === 'email' ? 'Email' : 'Phone'}: ${result.value || 'unavailable in this loaded record'}. This is saved record information, not a verified current customer profile.`;
  if (result.status === 'insufficient_evidence') return `The requested ${field} is unavailable in this loaded record. I will not infer it from another record.`;
  if (field === 'price' && result.sourceType === 'booking') return `Saved booking amount: ${formatEstimateCurrency(result.value.amount)}.`;
  if (field === 'price' && result.sourceType === 'estimate') return `Saved estimate range: ${formatEstimateCurrency(result.value.range.low, result.value.range.currency)} to ${formatEstimateCurrency(result.value.range.high, result.value.range.currency)}.`;
  if (field === 'service') return result.value;
  if (field === 'status') return result.value;
  if (field === 'date') return `${result.value.date}${result.value.time ? ` at ${result.value.time}` : ''}.`;
  return result.summary;
}

export function answerBusinessQuestion(message, packet, session, options) {
  const planned = buildBusinessCapabilityPlan(message);
  if (planned.status === 'unsupported') return gateBusinessEvidence(planned, packet, session);
  return queryBusinessFacts(planned.plan, packet, session, options);
}

export function buildBusinessCapabilityPlan(message) {
  const interpreted = interpretBusinessQuestion(message);
  return interpreted.status === 'unsupported' ? interpreted : normalizeBusinessCapabilityPlan(interpreted.plan);
}
