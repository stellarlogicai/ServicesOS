import { resolveBookingSchedule, isEligibleUpcomingBooking, hasInvalidActiveBookingSchedule, BOOKING_SCHEDULE_UNAVAILABLE } from './growthAIBookingFacts';
import { listEligibleEstimateAssistanceLeads, readSavedEstimatePricing, formatEstimateCurrency } from './growthAIEstimateAssistance';
import { formatMarketingServiceName } from './growthAIMarketingService';
import { resolveTemporalConstraint, validScheduleDate, validScheduleTime, localDateParts } from './growthAITemporalConstraint';
import { readAssistantBookingFinancials } from './growthAIBookingFinancialContext';

const text = value => typeof value === 'string' ? value.trim().slice(0, 160) : '';
const ref = (type, id) => ({ type, id });
const name = record => text(record.customerSnapshot?.fullName || record.customerSnapshot?.displayName ||
  record.customerSnapshot?.name || record.customerName || record.formData?.fullName) ||
  [text(record.formData?.firstName), text(record.formData?.lastName)].filter(Boolean).join(' ') || 'Customer';
const serviceType = record => text(record.serviceType || record.requestSnapshot?.cleaningType ||
  record.formData?.cleaningType || record.formData?.serviceType);
const dateMillis = value => {
  try {
    let parsed;
    if (typeof value === 'string') {
      const parts = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):([0-5]\d)(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
      if (!parts || !validScheduleDate(parts[1]) || !validScheduleTime(parts[2])) return null;
      parsed = Date.parse(value);
    } else if (value instanceof Date) parsed = value.getTime();
    else if (typeof value === 'number') parsed = value;
    else if (typeof value?.toMillis === 'function') parsed = value.toMillis();
    else if (typeof value?.toDate === 'function') parsed = value.toDate().getTime();
    else if (Number.isSafeInteger(value?.seconds)) {
      const nanos = value.nanoseconds ?? 0;
      if (!Number.isInteger(nanos) || nanos < 0 || nanos >= 1000000000) return null;
      parsed = value.seconds * 1000 + nanos / 1000000;
    }
    return Number.isFinite(parsed) && Number.isFinite(new Date(parsed).getTime()) ? parsed : null;
  } catch { return null; }
};
const visible = record => record.isArchived !== true && record.isDeleted !== true;
const savedContact = record => {
  const snapshot = record.customerSnapshot || {};
  const form = record.formData || {};
  const phone = snapshot.phone || record.customerPhone || form.phone;
  const email = snapshot.email || form.email;
  return {
    phone: typeof phone === 'string' && phone.length <= 40 && /^[+()\d .-]{5,40}$/.test(phone.trim()) ? phone.trim() : '',
    email: typeof email === 'string' && email.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? email.trim() : '',
  };
};

// Inputs come from existing authorized loaders; this projection is never a provider prompt.
export function buildOwnerContext({ tenantId, authorized, bookings = [], leads = [], services = [], ready = false, catalogReady = false, timeZone = '', now = new Date() }) {
  const packet = { tenantId, ready: authorized === true && ready, catalogReady: authorized === true && catalogReady,
    timeZone: text(timeZone), bookings: [], estimates: [], services: [], customers: [] };
  if (!authorized || !text(tenantId) || tenantId === 'DEFAULT') return { ...packet, ready: false, catalogReady: false };
  const ownBookings = bookings.filter(record => record?.id && record.tenantId === tenantId && visible(record));
  const ownLeads = leads.filter(record => record?.id && record.tenantId === tenantId && visible(record));
  packet.bookings = ownBookings.map(record => {
    const schedule = resolveBookingSchedule(record, packet.timeZone);
    return {
      type: 'booking', id: record.id, customerId: text(record.customerId), customerName: name(record),
      serviceType: serviceType(record), serviceId: text(record.serviceId), date: schedule.date || text(record.date), time: schedule.time || text(record.startTime),
      scheduledMillis: schedule.startMillis, scheduleError: schedule.error, status: text(record.status), completed: record.status === 'completed' || record.fieldStatus === 'completed',
      upcoming: isEligibleUpcomingBooking(record, now.getTime(), packet.timeZone, schedule),
      ...readAssistantBookingFinancials(record),
      leadId: text(record.leadId || record.sourceLeadId),
      contact: savedContact(record),
    };
  });
  const eligibleIds = new Set(listEligibleEstimateAssistanceLeads(ownLeads, tenantId).map(record => record.id));
  packet.estimates = ownLeads.filter(record => eligibleIds.has(record.id)).map(record => ({
    type: 'estimate', id: record.id, customerId: text(record.customerId), customerName: name(record),
    serviceType: serviceType(record), status: text(record.status), createdMillis: dateMillis(record.createdAt),
    pricing: readSavedEstimatePricing(record.estimate),
    contact: savedContact(record),
  }));
  packet.services = services.filter(record => record?.active === true && text(record.id) && text(record.name) &&
    (!record.tenantId || record.tenantId === tenantId) && Number.isInteger(record.priceCents) && record.priceCents > 0 &&
    Number.isInteger(record.durationMinutes) && record.durationMinutes > 0).map(record => ({
    type: 'service', id: record.id, name: text(record.name), serviceType: text(record.serviceType),
    priceCents: record.priceCents, durationMinutes: record.durationMinutes,
  }));
  const customers = new Map();
  for (const record of [...packet.bookings, ...packet.estimates]) {
    if (record.customerId) customers.set(record.customerId, { type: 'customer', id: record.customerId, name: record.customerName });
  }
  packet.customers = [...customers.values()];
  return packet;
}

function find(packet, reference) {
  const collection = { booking: 'bookings', estimate: 'estimates', customer: 'customers', service: 'services' }[reference?.type];
  return collection ? packet[collection].find(record => record.id === reference.id) || null : null;
}

function resolveReference(packet, session, input) {
  if (session?.tenantId !== packet.tenantId) return null;
  if (session.suspended && !/\b(?:first|second|last)\b/.test(input)) return null;
  if (/\bthose customers\b/.test(input)) return null;
  const list = session.list || [];
  if (/\bother one\b/.test(input)) {
    if (list.length !== 2 || !session.selected || !list.every(reference => find(packet, reference)) ||
        list[0].type === list[1].type && list[0].id === list[1].id) return null;
    const selectedIndex = list.findIndex(reference => reference.type === session.selected.type && reference.id === session.selected.id);
    return selectedIndex < 0 ? null : find(packet, list[1 - selectedIndex]);
  }
  if (/\b(?:those customers|them|they|their)\b/.test(input) && !session.selected && list.length !== 1) return null;
  let index = session.index ?? -1;
  if (/\bfirst(?: one)?\b/.test(input)) index = 0;
  else if (/\bsecond(?: one)?\b/.test(input)) index = 1;
  else if (/\blast(?: one)?\b/.test(input)) index = list.length - 1;
  else if (/\bprevious(?: one)?\b/.test(input)) index -= 1;
  else if (/\b(?:next(?: one)?|after that)\b/.test(input)) index += 1;
  else return find(packet, session.selected);
  return list[index] ? find(packet, list[index]) : null;
}

const clarify = content => ({ content: content || 'Which booking, customer, estimate, or service do you mean? Choose a record or specify its position in the current list.', kind: 'clarify' });
const describe = record => record.type === 'service' ? `${record.name}: ${formatEstimateCurrency(record.priceCents / 100)}, ${record.durationMinutes} minutes.` :
  record.type === 'customer' ? record.name : `${record.customerName}: ${formatMarketingServiceName(record.serviceType || 'cleaning service')}${record.type === 'booking' ? `, ${record.date || 'date unavailable'}${record.time ? ` at ${record.time}` : ''}` : ''}, ${record.status || 'status unavailable'}.`;

export function resolveOwnerContext(request, packet, session = {}, { now = new Date() } = {}) {
  if (!request) return null;
  const input = request.input;
  const unavailable = 'This tenant context is currently unavailable. Reload the workspace before asking about these records.';
  if (!packet.ready) return clarify(unavailable);
  if (['bookings', 'overview', 'priority_review', 'review_choices'].includes(request.domain) && hasInvalidActiveBookingSchedule(packet)) {
    return { ...clarify(BOOKING_SCHEDULE_UNAVAILABLE), status: 'insufficient_evidence' };
  }
  if (session?.tenantId !== packet.tenantId) session = {};
  const returnType = request.returnType || input.match(/\b(?:that|second|first) (customer|booking|job|estimate|service)\b/)?.[1];
  const currentType = session.list?.[0]?.type;
  const currentMatches = returnType === 'customer' ? ['booking', 'estimate', 'customer'].includes(currentType) : currentType === (returnType === 'job' ? 'booking' : returnType);
  if (returnType && (request.returnType || !currentMatches)) {
    const target = returnType === 'customer' ? session.personContext : returnType === 'recent' ? session.topics?.[session.recent?.at(-1)?.type] : session.topics?.[returnType === 'job' ? 'booking' : returnType];
    if (!target && request.returnType) return clarify('That earlier entity is not established in this conversation. Choose the intended record from a current list.');
    if (target) session = { ...session, ...target, suspended: false };
  }
  if (request.ambiguous) return clarify('Choose the specific own-tenant record from a current result list. Names or tenant text do not authorize a lookup.');
  const result = (content, records, selected = null) => {
    const topic = records[0]?.type || { bookings: 'booking', estimates: 'estimate', services: 'service' }[request.domain] || session.activeTopic;
    const selection = { list: records.map(record => ref(record.type, record.id)), selected: selected ? ref(selected.type, selected.id) : null,
      index: selected ? records.findIndex(record => record.type === selected.type && record.id === selected.id) : -1 };
    const topics = { ...session.topics, ...(['booking', 'estimate', 'customer', 'service'].includes(topic) ? { [topic]: selection } : {}) };
    const recent = selected ? [...(session.recent || []).filter(item => item.type !== selected.type || item.id !== selected.id), ref(selected.type, selected.id)].slice(-6) : session.recent || [];
    return { kind: 'answer', content, context: { ...selection, tenantId: packet.tenantId, activeTopic: topic, suspended: false, topics, recent,
      personContext: request.preservePersonContext && session.personContext ? session.personContext
        : selected && ['booking', 'estimate', 'customer'].includes(selected.type) ? selection : session.personContext } };
  };
  if (request.domain === 'review_choices') {
    return clarify(`Do you mean today's bookings, open estimates, or follow-up opportunities? I have ${packet.bookings.filter(record => record.upcoming).length} upcoming bookings and ${packet.estimates.length} eligible open estimates in the loaded records. These counts do not establish overdue work or missed tasks.`);
  }
  if (request.domain === 'priority_review') {
    const overview = resolveOwnerContext({ domain: 'overview', input: '' }, packet, session, { now });
    return { ...overview, content: `I cannot determine urgency or rank the most important work from these records. Here is the recorded work you can review:\n${overview.content}` };
  }
  if (request.domain === 'overview') {
    const bookings = resolveOwnerContext({ domain: 'bookings', input: '' }, packet, session, { now });
    const focus = bookings.context.list.length ? bookings : resolveOwnerContext({ domain: 'estimates', input: '' }, packet, session, { now });
    return { ...focus, content: `${bookings.content}\n${packet.estimates.length} eligible open estimates are available to review. Start with the next scheduled booking if appropriate, then review open estimates. This is not an urgency ranking or evidence that anyone is overdue.${bookings.context.list.length ? '' : `\n${focus.content}`}` };
  }
  if (request.domain === 'followup_review') {
    const estimates = resolveOwnerContext({ domain: 'estimates', input: '' }, packet, session, { now });
    return { ...estimates, kind: 'handoff', workflow: 'opportunities', content: `${estimates.content}\nThese are estimate-review candidates, not a finding that any customer is overdue. Review existing follow-up/rebooking opportunities before deciding to contact anyone.` };
  }
  if (request.domain === 'bookings') {
    let records = packet.bookings.filter(record => record.upcoming);
    const temporalKind = /\btoday\b/.test(input) ? 'today' : /\btomorrow\b/.test(input) ? 'tomorrow'
      : /\bthis week\b/.test(input) ? 'this_week' : null;
    if (!request.temporalConstraint && temporalKind) {
      const constraint = resolveTemporalConstraint({ kind: temporalKind }, packet, { now });
      if (constraint.error) return clarify(constraint.error);
      records = records.filter(record => record.date >= constraint.startDate && record.date < constraint.endDate);
    }
    records.sort((a, b) => (a.scheduledMillis ?? Infinity) - (b.scheduledMillis ?? Infinity) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
    if (/^who else is coming[?.!]*$/.test(input)) {
      const selected = session?.tenantId === packet.tenantId ? find(packet, session.selected) : null;
      if (!selected || selected.type !== 'booking' || !records.some(item => item.id === selected.id)) return clarify('Choose the scheduled booking you mean before asking who else is coming.');
      const others = records.map((item, index) => ({ item, index })).filter(({ item }) => item.id !== selected.id);
      return result(others.length ? `Other upcoming bookings:\n${others.map(({ item, index }) => `${index + 1}. ${describe(item)}`).join('\n')}` : 'No other eligible upcoming bookings are present in the loaded records.', records, selected);
    }
    const existenceQuestion = /^(?:do i have|are there)\b/i.test(input);
    const introduction = request.countQuestion ? existenceQuestion
      ? records.length ? `Yes, you have ${records.length} upcoming ${records.length === 1 ? 'booking' : 'bookings'}.` : "No, you don't have any upcoming bookings."
      : records.length ? `You have ${records.length} upcoming ${records.length === 1 ? 'booking' : 'bookings'}.` : 'You have no upcoming bookings.'
      : `You have ${records.length} upcoming bookings.`;
    if (!records.length) return result(request.countQuestion ? introduction : 'No eligible upcoming bookings were found in this window.', []);
    return result(`${introduction} Next: ${describe(records[0])}\n${records.map((record, index) => `${index + 1}. ${describe(record)}`).join('\n')}`, records, records[0]);
  }
  if (request.domain === 'estimates') {
    const records = [...packet.estimates];
    if (/\b(longest|oldest)\b/.test(input)) {
      if (records.some(record => record.createdMillis == null)) return clarify('Some estimates have no saved creation date, so I cannot reliably identify the oldest.');
      records.sort((a, b) => a.createdMillis - b.createdMillis || a.id.localeCompare(b.id));
    }
    if (!records.length) return result('No eligible open estimates are available.', []);
    const oldest = /\b(longest|oldest)\b/.test(input);
    return result(`${records.length} eligible open estimates:\n${records.map((record, index) => `${index + 1}. ${describe(record)}`).join('\n')}`, records, oldest || records.length === 1 ? records[0] : null);
  }
  if (request.domain === 'services') {
    if (!packet.catalogReady) return clarify('The canonical service catalog is unavailable. I will not infer configured prices from past bookings.');
    return result(packet.services.length ? packet.services.map((record, index) => `${index + 1}. ${describe(record)}`).join('\n') : 'No active canonical services are configured.', packet.services, packet.services.length === 1 ? packet.services[0] : null);
  }
  if (request.domain === 'context_review' && (session?.tenantId !== packet.tenantId || !session.list?.length)) {
    return resolveOwnerContext({ domain: 'overview', input: '' }, packet, {}, { now });
  }
  let record = resolveReference(packet, session,
    request.explicitName && request.reference?.kind === 'current' ? 'that job' : input);
  const explicitBookingContact = request.domain === 'contact' && ['phone', 'email'].includes(request.contactField) &&
    request.reference?.kind === 'current' && Boolean(request.explicitName);
  const explicitBookingRead = Boolean(request.explicitName) && (['price', 'status', 'date', 'service', 'history'].includes(request.domain) ||
    ['detail', 'customer', 'quote'].includes(request.domain) && request.reference?.kind === 'current');
  if (explicitBookingRead || explicitBookingContact) {
    const field = explicitBookingContact ? request.contactField : request.field === 'estimate_creation' ? 'estimate creation date'
      : request.domain === 'price' ? 'amount' : request.domain === 'date' ? 'appointment' : request.domain;
    const referenceType = request.field === 'estimate_creation' && /\b(?:this|that|the) estimate\b/.test(input) ? 'estimate' : 'booking';
    const named = (referenceType === 'estimate' ? packet.estimates : packet.bookings).filter(item => item.customerName.toLowerCase() === request.explicitName);
    const customerIds = new Set(named.map(item => item.customerId));
    if (!named.length || customerIds.size !== 1 || customerIds.has('')) {
      return clarify(request.domain === 'quote' ? 'Choose the specific own-tenant customer; that name is missing or identifies multiple customers.'
        : 'Choose the specific own-tenant customer; that name does not establish one canonical customer.');
    }
    if (request.reference?.kind === 'current') {
      if (!record || record.type !== referenceType || record.customerId !== named[0].customerId || !named.includes(record)) {
        return clarify(`The named customer and referenced ${referenceType} do not establish the same ${referenceType === 'booking' ? 'job' : 'estimate'}. Choose the intended ${referenceType} before asking about its ${field}.`);
      }
    } else {
      if (named.length !== 1) return clarify(`Choose the specific booking for this customer before asking about its ${field}.`);
      [record] = named;
    }
  }
  if (request.domain === 'quote' && request.explicitName && request.reference?.kind !== 'current') {
    const named = [...packet.bookings, ...packet.estimates].filter(item => item.customerName.toLowerCase() === request.explicitName);
    const customerIds = new Set(named.map(item => item.customerId));
    if (!named.length || customerIds.size !== 1 || customerIds.has('')) {
      return clarify('Choose the specific own-tenant customer; that name is missing or identifies multiple customers.');
    }
    const [customerId] = customerIds;
    const bookings = packet.bookings.filter(item => item.customerId === customerId);
    const candidates = bookings.length ? bookings : packet.estimates.filter(item => item.customerId === customerId);
    if (candidates.length !== 1) return clarify('Choose the specific estimate or booking for this customer before asking about the quote.');
    [record] = candidates;
  }
  if (request.explicitName && request.domain === 'detail' && !explicitBookingRead) {
    const matches = (session.list || []).map(reference => find(packet, reference)).filter(item => item && (item.customerName || item.name).toLowerCase() === request.explicitName);
    if (matches.length !== 1) return clarify('Choose the specific record from the current list; that name is missing or identifies multiple records.');
    [record] = matches;
  }
  if (['talk_to', 'contact', 'context_review'].includes(request.domain)) {
    const current = session?.tenantId === packet.tenantId ? (session.list || []).map(reference => find(packet, reference)).filter(Boolean) : [];
    if (request.explicitName && !explicitBookingContact) {
      const matches = current.filter(item => (item.customerName || item.name).toLowerCase() === request.explicitName);
      record = matches.length === 1 ? matches[0] : null;
      if (!record) return clarify('Choose the specific record from the current list; that name is missing or identifies multiple records.');
    }
    if (/\bother customer\b/.test(input)) {
      const alternatives = current.filter(item => item.customerId && record?.customerId && item.customerId !== record.customerId);
      record = alternatives.length === 1 ? alternatives[0] : null;
    }
    if (/\babout (?:my|the|an?) estimate\b/.test(input) && record?.type !== 'estimate') {
      return clarify('Do you mean the customer on an open estimate? Choose the intended estimate before asking who to contact.');
    }
    if (request.domain === 'talk_to' && /\babout\b/.test(input) && !/\babout (?:my|the|an?|this|that) (?:estimate|booking|job)\b/.test(input)) {
      return clarify('Choose the specific booking or estimate you mean; I will not substitute the selected customer for an explicit different topic.');
    }
    if (!record || record.type === 'service') {
      const people = [...new Set(current.filter(item => item.type !== 'service').map(item => item.customerName || item.name))];
      return clarify(people.length ? `Do you mean ${people.join(' or ')}? Choose the intended position in the current list; I cannot infer who needs attention or is awaiting a reply.` : 'Do you mean a customer on your upcoming schedule, someone with an open estimate, or a follow-up opportunity? Establish the intended record first.');
    }
  }
  if (request.serviceType) {
    if (!packet.catalogReady) return clarify('The canonical service catalog is unavailable.');
    const matches = packet.services.filter(item => item.serviceType === request.serviceType);
    if (matches.length !== 1) return clarify('Choose the specific canonical service; that classification is missing or has multiple configured services.');
    [record] = matches;
  }
  if (record?.scheduleError) return { ...clarify(BOOKING_SCHEDULE_UNAVAILABLE), status: 'insufficient_evidence' };
  if (!record) {
    const choices = session?.tenantId === packet.tenantId ? (session.list || [])
      .map((reference, index) => ({ record: find(packet, reference), index }))
      .filter(item => item.record).slice(0, 6) : [];
    return clarify(choices.length ? `Which booking, customer, estimate, or service do you mean? ${choices.map(({ record: choice, index }) => `${index + 1}. ${describe(choice)}`).join(' ')} Choose its position in the current list; I will not guess.` : undefined);
  }
  const requestedType = input.match(/\b(?:this|that|about (?:my|the|an?)) (estimate|booking|job|service)\b/)?.[1];
  const expectedType = requestedType === 'job' ? 'booking' : requestedType;
  if (expectedType && record.type !== expectedType) {
    return clarify(`The selected record is ${record.type === 'estimate' ? 'an' : 'a'} ${record.type}; this question asks about ${expectedType === 'estimate' ? 'an' : 'a'} ${expectedType}. Choose the intended ${expectedType} from its current list before asking about it.`);
  }
  if (request.domain === 'date' && /\bappointment\b/.test(input) && record.type !== 'booking') {
    return clarify('Choose the specific booking for the appointment date; an estimate creation date is not an appointment.');
  }
  const records = (session.list || []).map(reference => find(packet, reference)).filter(Boolean);
  const answer = content => {
    const retainedList = records.some(item => item.type === record.type && item.id === record.id);
    const response = result(content, retainedList ? records : [record], record);
    if (retainedList && session.list?.length) {
      const selection = { list: session.list, selected: ref(record.type, record.id), index: session.list.findIndex(item => item.type === record.type && item.id === record.id) };
      response.context = { ...response.context, ...selection, topics: { ...response.context.topics, [record.type]: selection },
        personContext: ['booking', 'estimate', 'customer'].includes(record.type) ? selection : response.context.personContext };
    }
    return response;
  };
  if (request.domain === 'talk_to') return answer(`The customer associated with the selected ${record.type} is ${record.customerName || record.name}. This identifies the person, not a finding that they need a response.`);
  if (request.domain === 'context_review') return answer(`You are reviewing ${record.customerName || record.name}'s ${record.type}. I cannot infer urgency or whether they are awaiting a reply. Review this record and existing follow-up opportunities before deciding whom to contact.`);
  if (request.domain === 'contact') {
    const fields = request.contactField ? [request.contactField] : ['phone', 'email'];
    return answer(`${record.customerName || record.name} - saved ${record.type} contact information: ${fields.map(field => `${field === 'phone' ? 'Phone' : 'Email'}: ${record.contact?.[field] || 'unavailable in this loaded record'}`).join('; ')}. This is saved record information, not a verified current customer profile.`);
  }
  if (request.domain === 'message') {
    if (record.type === 'customer') {
      const matches = [...packet.estimates, ...packet.bookings.filter(item => item.status !== 'cancelled')].filter(item => item.customerId === record.id);
      if (matches.length !== 1) return clarify('Choose the specific estimate or booking for this customer before drafting.');
      [record] = matches;
    }
    if (!['booking', 'estimate'].includes(record.type)) return clarify('Choose a booking or estimate before drafting a customer message.');
    return { ...answer('Review the selected canonical record before preparing a message.'), kind: 'handoff', workflow: 'customer_response',
      communication: record.type === 'estimate' ? { type: 'estimate_followup', leadId: record.id } : { type: record.completed ? 'rebooking' : 'scheduling', bookingId: record.id } };
  }
  if (request.domain === 'marketing') {
    if (record.type !== 'service') return clarify('Choose an active canonical service before preparing a post about it.');
    return { ...answer(`Prepare a post about ${record.name}; review before creating anything.`), kind: 'handoff', workflow: 'marketing', serviceType: record.serviceType };
  }
  if (request.domain === 'promote') return answer(record.type === 'service' ? `You can prepare a spotlight for ${record.name}. I do not have evidence that it will outperform other services. Choose to create a post when ready.` : 'Select a canonical service to review promotion options.');
  if (request.domain === 'followup') return answer('Review the existing follow-up/rebooking opportunities. A future booking alone is not evidence that a customer needs a follow-up. Nothing has been drafted or sent.');
  if (request.domain === 'history') {
    const customerId = record.type === 'customer' ? record.id : record.customerId;
    if (!customerId) return answer('This record has no canonical customer link, so I cannot establish booking history.');
    const history = packet.bookings.filter(item => item.customerId === customerId && item.completed);
    const dated = history.filter(item => !item.scheduleError && Number.isFinite(item.scheduledMillis) && validScheduleDate(item.date))
      .sort((a, b) => b.scheduledMillis - a.scheduledMillis || b.date.localeCompare(a.date));
    return answer(`${history.length} completed bookings are present for this canonical customer in the loaded tenant records.${dated.length ? ` Most recent: ${dated[0].date}.` : history.length ? ' The most recent work date cannot be established from incomplete dates.' : ''} This is recorded history, not a claim that no other past work occurred.`);
  }
  if (request.domain === 'customer') return answer(record.type === 'service' ? 'A service does not identify a customer. Choose a booking or estimate.' :
    `${record.customerName || record.name}.${record.customerId ? ' Canonical customer relationship is available.' : record.type === 'customer' ? '' : ' No canonical customer relationship is saved on this record.'}`);
  if (request.domain === 'service') return answer(record.type === 'service' ? describe(record) : formatMarketingServiceName(record.serviceType || 'Service unavailable'));
  if (request.domain === 'scope') return answer('The canonical service catalog stores classification, price and duration, not an included-work description. Review the approved booking scope for inclusions.');
  if (request.domain === 'date') {
    if (request.field === 'estimate_creation') {
      let estimate = record;
      if (record.type === 'booking') {
        const matches = packet.estimates.filter(item => record.leadId ? item.id === record.leadId : record.customerId && item.customerId === record.customerId);
        if (!record.customerId || matches.length !== 1 || !matches[0].customerId || matches[0].customerId !== record.customerId) {
          return clarify('The linked estimate does not establish this customer relationship. Choose the intended estimate before asking for its creation date.');
        }
        [estimate] = matches;
      }
      const parts = estimate.type === 'estimate' && Number.isFinite(estimate.createdMillis)
        ? localDateParts(new Date(estimate.createdMillis), packet.timeZone) : null;
      return answer(parts ? `Created ${parts.month}/${parts.day}/${parts.year}.` : 'The estimate creation date is unavailable.');
    }
    if (record.type === 'estimate') {
      const parts = Number.isFinite(record.createdMillis) ? localDateParts(new Date(record.createdMillis), packet.timeZone) : null;
      return answer(parts ? `Created ${parts.month}/${parts.day}/${parts.year}.` : 'The estimate creation date is unavailable.');
    }
    return answer(record.type === 'booking' ? `${record.date || 'Appointment date unavailable'}${record.time ? ` at ${record.time}` : ''}.` : 'Choose a booking or estimate for its date.');
  }
  if (request.domain === 'status') return answer(record.status || 'This context does not include a booking or estimate status.');
  if (request.domain === 'detail') return answer(`${describe(record)}${record.type === 'booking' && record.amount != null ? ` Saved booking amount: ${formatEstimateCurrency(record.amount)}.` : record.type === 'estimate' ? record.pricing ? ` Saved estimate range: ${formatEstimateCurrency(record.pricing.low, record.pricing.currency)} to ${formatEstimateCurrency(record.pricing.high, record.pricing.currency)}.` : ' Saved estimate pricing is incomplete; owner review is required.' : ''}`);
  if (request.domain === 'quote' && record.type === 'booking') {
    const matches = packet.estimates.filter(item => record.leadId ? item.id === record.leadId : record.customerId && item.customerId === record.customerId);
    if (!record.customerId || matches.some(item => !item.customerId || item.customerId !== record.customerId)) {
      return clarify('The linked estimate does not establish this customer relationship. Choose the intended estimate before asking about the quote.');
    }
    if (matches.length > 1) return clarify('Multiple estimates belong to this customer. Choose which estimate you mean.');
    if (matches.length === 1) return answer(matches[0].pricing ? `Saved estimate range: ${formatEstimateCurrency(matches[0].pricing.low, matches[0].pricing.currency)} to ${formatEstimateCurrency(matches[0].pricing.high, matches[0].pricing.currency)}.` : 'Saved estimate pricing is incomplete; owner review is required.');
    else return answer(`No linked open estimate is available.${record.amount != null ? ` The saved booking amount is ${formatEstimateCurrency(record.amount)}; it is not evidence of a historical quote.` : ''}`);
  }
  if (['price', 'quote'].includes(request.domain)) return answer(record.type === 'service' ? describe(record) : record.type === 'booking' ? record.amount == null ? 'Saved booking amount is unavailable.' : `Saved booking amount: ${formatEstimateCurrency(record.amount)}.` : record.pricing ? `Saved estimate range: ${formatEstimateCurrency(record.pricing.low, record.pricing.currency)} to ${formatEstimateCurrency(record.pricing.high, record.pricing.currency)}.` : 'Saved estimate pricing is incomplete; owner review is required.');
  return answer(describe(record));
}
