import { namedCalculationServiceSelectors } from './growthAIServiceResolution';

// Plans describe the existing executors; they never hold records or conversation state.
export const BUSINESS_PLAN_BOUNDS = Object.freeze({ capabilities: 3, stages: 6, relationshipHops: 7, calculationOperands: 5 });
const FACT_OPERATIONS = ['count', 'identify', 'list', 'lookup'];
const FIELDS = ['customer', 'service', 'price', 'date', 'phone', 'email', 'detail', 'status'];
const HOPS = ['booking.customer', 'booking.service', 'booking.price', 'booking.schedule', 'customer.phone'];
const CALCULATION_SOURCES = ['next_bookings', 'temporal_bookings', 'context_bookings', 'catalog_services', 'named_services', 'context_services'];
const COMPOSITIONS = new Set([
  'fact_lookup', 'temporal_constraint+fact_lookup',
  'relationship_traversal+fact_lookup', 'temporal_constraint+relationship_traversal+fact_lookup',
  'comparison', 'calculation', 'temporal_constraint+calculation',
]);
const unsupported = () => ({ status: 'unsupported' });

export function normalizeBusinessCapabilityPlan(request) {
  if (!request || request.version !== 1 || typeof request.input !== 'string') return unsupported();
  const { operation, entity, field, source } = request;
  if (![...FACT_OPERATIONS, 'traverse', 'compare', 'calculate'].includes(operation) ||
      ![null, 'booking', 'customer', 'estimate', 'service'].includes(entity)) return unsupported();
  const temporal = typeof request.temporal === 'object' && request.temporal !== null ? request.temporal : null;
  if (temporal && (entity !== 'booking' || !['today', 'tomorrow', 'this_week', 'weekday', 'date'].includes(temporal.kind))) return unsupported();
  let capabilities;
  let terminalFields;
  let entities = [];
  let contextReferences = [];
  let selectors = request.selectors;
  let evidenceRequirements = ['authorized_workspace', 'current_canonical_references'];
  let relationshipHops = 0;
  if (FACT_OPERATIONS.includes(operation)) {
    if (field != null && !FIELDS.includes(field) || !request.reference ||
        !['none', 'current', 'position', 'return', 'next_booking'].includes(request.reference.kind)) return unsupported();
    if (['count', 'identify'].includes(operation) && entity !== 'booking' || operation === 'list' && entity !== 'service') return unsupported();
    capabilities = ['fact_lookup'];
    terminalFields = [field || (operation === 'count' ? 'count' : 'summary')];
    contextReferences = request.reference.kind === 'none' ? [] : [{ ...request.reference }];
    if (request.explicitName) entities = [{ type: 'customer', name: request.explicitName }];
    if (request.explicitName && entity === 'booking') {
      evidenceRequirements.push('explicit_customer_identity', 'canonical_customer_relationship');
      if (request.reference.kind === 'current') evidenceRequirements.push('coherent_contextual_booking');
    }
    if (operation === 'lookup') evidenceRequirements.push('unique_resolved_record', `saved_${field}`);
    if (operation === 'list' || entity === 'service') evidenceRequirements.push('canonical_catalog');
  } else if (operation === 'traverse') {
    if (entity !== 'booking' || !Array.isArray(request.fields) || request.fields.length < 2 || request.fields.length > 5 ||
        request.fields.some(value => !FIELDS.includes(value) || ['detail', 'email', 'status'].includes(value)) ||
        new Set(request.fields).size !== request.fields.length || !Array.isArray(request.hops) ||
        request.hops.some(hop => !HOPS.includes(hop)) || new Set(request.hops).size !== request.hops.length ||
        !['next_booking', 'named_customer', 'after_customer'].includes(request.start?.kind)) return unsupported();
    const expectedHops = ['booking.customer', ...request.fields.filter(value => value !== 'customer')
      .map(value => ({ service: 'booking.service', price: 'booking.price', date: 'booking.schedule', phone: 'customer.phone' })[value])];
    if (expectedHops.length !== request.hops.length || expectedHops.some(hop => !request.hops.includes(hop))) return unsupported();
    relationshipHops = request.hops.length + (request.start.kind === 'next_booking' ? 0 : request.start.kind === 'after_customer' ? 2 : 1);
    if (relationshipHops > BUSINESS_PLAN_BOUNDS.relationshipHops) return unsupported();
    capabilities = ['relationship_traversal', 'fact_lookup'];
    terminalFields = [...request.fields];
    entities = request.start.name ? [{ type: 'customer', name: request.start.name }] : [];
    evidenceRequirements.push('unique_current_booking', 'canonical_customer_relationship', ...terminalFields.map(value => `saved_${value}`));
  } else if (operation === 'compare') {
    if (entity !== 'service' || field !== 'price' || !Array.isArray(request.selectors) || request.selectors.length > 5 ||
        request.selectors.some(value => typeof value !== 'string' || !value.trim()) ||
        !['cheaper', 'difference', 'more_expensive'].includes(request.comparison)) return unsupported();
    capabilities = ['comparison'];
    terminalFields = ['configured_price'];
    entities = request.selectors.map(name => ({ type: 'service', name }));
    contextReferences = entities.length ? [] : [{ kind: 'current_services' }];
    evidenceRequirements.push('canonical_catalog', 'distinct_resolved_services', 'valid_price_cents_for_every_service');
  } else {
    if (!['sum', 'average'].includes(request.calculation) || !CALCULATION_SOURCES.includes(source) ||
        (source.endsWith('bookings') ? entity !== 'booking' : entity !== 'service') ||
        source === 'temporal_bookings' && !temporal) return unsupported();
    capabilities = ['calculation'];
    terminalFields = [entity === 'booking' ? 'booking_amount' : 'configured_price'];
    contextReferences = source.startsWith('context_') ? [{ kind: source }] : [];
    evidenceRequirements.push('complete_resolved_operand_set', 'valid_integer_cents_for_every_operand');
    if (entity === 'service') evidenceRequirements.push('canonical_catalog');
    if (source === 'named_services') {
      selectors = namedCalculationServiceSelectors(request.input);
      entities = selectors.map(name => ({ type: 'service', name }));
      evidenceRequirements.push('intended_service_selectors');
    }
  }
  if (temporal) {
    capabilities.unshift('temporal_constraint');
    evidenceRequirements.push('valid_business_timezone', 'valid_local_date_range', 'bookings_inside_range');
  }
  if (!COMPOSITIONS.has(capabilities.join('+')) || capabilities.length > BUSINESS_PLAN_BOUNDS.capabilities) return unsupported();
  const stages = [...(temporal ? ['temporal_filter'] : []), 'resolve_entities', 'retrieve_facts',
    ...(['traverse', 'compare', 'calculate'].includes(operation) ? [operation] : []), 'validate_evidence', 'format_answer'];
  if (stages.length > BUSINESS_PLAN_BOUNDS.stages) return unsupported();
  return { status: 'planned', plan: { ...request, planningVersion: 1, subject: entity || 'context',
    entities, contextReferences, ...(selectors ? { selectors } : {}), selection: { source: source || null, start: request.start || null,
      reference: request.reference || null, count: request.count ?? null },
    constraints: { temporal }, terminalFields, capabilities, stages,
    evidenceRequirements, bounds: { ...BUSINESS_PLAN_BOUNDS, relationshipHops } } };
}
