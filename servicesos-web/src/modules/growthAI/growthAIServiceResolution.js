import { normalizeOwnerUtterance } from './growthAIOwnerVocabulary';
import { formatMarketingServiceName } from './growthAIMarketingService';

const serviceKey = value => normalizeOwnerUtterance(value).replace(/^(?:a|an|the)\s+/, '')
  .replace(/\s+(?:clean|cleaning|service)$/, '').trim();

// Strip only the existing calculation framing, never search names inside a sentence.
export function namedCalculationServiceSelectors(input) {
  const text = normalizeOwnerUtterance(input).replace(/[?.!]+$/, '').trim();
  const match = text.match(/^(?:how much (?:would|do|does)|(?:what is|show|tell me) (?:the )?(?:total|average)(?: (?:price|cost))?(?: (?:of|for))?)\s+(.+)$/);
  if (!match) return [];
  const body = match[1].replace(/\s+(?:(?:cost|be)(?: together)?|together)$/, '').trim();
  return body.split(/\s+(?:and|or|vs\.?|versus)\s+|\s*,\s*/).map(value => value.trim()).filter(Boolean);
}

export function resolveCanonicalServiceSelectors(packet, selectors) {
  const records = [];
  const resolutions = [];
  if (!Array.isArray(selectors) || selectors.length < 1 || selectors.some(value => typeof value !== 'string' || !value.trim())) {
    return { status: 'needs_clarification', reason: 'service_selectors_required' };
  }
  for (const selector of selectors) {
    const key = serviceKey(selector);
    const exact = packet.services.filter(record => serviceKey(record.name) === key);
    const matches = exact.length ? exact : packet.services.filter(record => serviceKey(formatMarketingServiceName(record.serviceType)) === key);
    if (matches.length > 1) return { status: 'needs_clarification', reason: 'ambiguous_service_selector' };
    if (!matches.length) return { status: 'insufficient_evidence', reason: 'missing_service_selector' };
    const record = matches[0];
    if (record.tenantId && record.tenantId !== packet.tenantId) return { status: 'insufficient_evidence', reason: 'scope_mismatch' };
    if (records.some(item => item.id === record.id)) return { status: 'needs_clarification', reason: 'duplicate_service_selector' };
    records.push(record);
    resolutions.push({ selector, reference: { type: 'service', id: record.id }, match: exact.length ? 'exact_name' : 'classification' });
  }
  return { status: 'resolved', records, resolutions };
}
