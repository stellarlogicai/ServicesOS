import { describe, expect, it } from 'vitest';
import { namedCalculationServiceSelectors, resolveCanonicalServiceSelectors } from '../modules/growthAI/growthAIServiceResolution';

const packet = () => ({ tenantId: 'a', services: [
  { id: 'standard', name: 'Standard', serviceType: 'standard', priceCents: 10000 },
  { id: 'deep', name: 'Canonical Deep', serviceType: 'deep', priceCents: 15000 },
  { id: 'other', name: 'Other Deep', serviceType: 'deep', priceCents: 20000 },
] });

describe('bounded canonical service selector resolution', () => {
  it('extracts independent operands from the existing named calculation framing', () => {
    expect(namedCalculationServiceSelectors('How much would Canonical Deep and Standard cost together?')).toEqual(['canonical deep', 'standard']);
    expect(namedCalculationServiceSelectors("What's the total for Canonical Deep and Standard?")).toEqual(['canonical deep', 'standard']);
    expect(namedCalculationServiceSelectors('What is the average of Canonical Deep, Other Deep and Standard?')).toEqual(['canonical deep', 'other deep', 'standard']);
    expect(namedCalculationServiceSelectors('Which service should I promote?')).toEqual([]);
  });
  it.each([['Canonical Deep', 'deep', 15000], ['Standard', 'standard', 10000]])('resolves %s alone to exactly its canonical record', (selector, id, cents) => {
    const resolved = resolveCanonicalServiceSelectors(packet(), [selector]);
    expect(resolved.status).toBe('resolved');
    expect(resolved.records.map(record => [record.id, record.priceCents])).toEqual([[id, cents]]);
    expect(resolved.resolutions[0].match).toBe('exact_name');
  });
  it('does not union classification matches into an exact named pair', () => {
    const result = resolveCanonicalServiceSelectors(packet(), ['Canonical Deep', 'Standard']);
    expect(result.records.map(record => record.id)).toEqual(['deep', 'standard']);
    expect(result.resolutions.map(item => item.reference.id)).toEqual(['deep', 'standard']);
  });
  it('clarifies an ambiguous classification instead of choosing or aggregating', () => {
    expect(resolveCanonicalServiceSelectors(packet(), ['deep clean', 'standard clean'])).toMatchObject({ status: 'needs_clarification', reason: 'ambiguous_service_selector' });
  });
  it('preserves a unique classification fallback', () => {
    const data = packet(); data.services.pop();
    expect(resolveCanonicalServiceSelectors(data, ['deep clean', 'standard clean']).records.map(record => record.id)).toEqual(['deep', 'standard']);
  });
  it('does not substring-match a nonexistent explicit name', () => {
    expect(resolveCanonicalServiceSelectors(packet(), ['Canonical Deep Deluxe', 'Standard'])).toMatchObject({ status: 'insufficient_evidence', reason: 'missing_service_selector' });
  });
  it('clarifies duplicate canonical names', () => {
    const data = packet(); data.services.push({ ...data.services[1], id: 'duplicate' });
    expect(resolveCanonicalServiceSelectors(data, ['Canonical Deep', 'Standard']).status).toBe('needs_clarification');
  });
  it('does not deduplicate a repeated requested operand into another calculation', () => {
    expect(resolveCanonicalServiceSelectors(packet(), ['Canonical Deep', 'Canonical Deep']).status).toBe('needs_clarification');
  });
  it('rejects an explicitly foreign tenant record', () => {
    const data = packet(); data.services[1].tenantId = 'b';
    expect(resolveCanonicalServiceSelectors(data, ['Canonical Deep']).reason).toBe('scope_mismatch');
  });
});
