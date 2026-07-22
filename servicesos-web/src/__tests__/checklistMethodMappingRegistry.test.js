import { describe, expect, it } from 'vitest';
import {
  applyChecklistMethodMappings,
  getChecklistMethodMapping,
  resolveChecklistMethodGuidance,
  resolveSnapshotMethodGuidance,
} from '../core/checklists/checklistMethodMappingRegistry';
import { buildSystemDefaultAdoption } from '../modules/cleaning/products/cleaningProductModel';
import { getStarterCleaningMethods } from '../modules/cleaning/products/starterCleaningMethods';

const SHOWER_OUTCOME_ID = 'standard-one-time-bathroom-shower-or-tub-required-1';

function tenantMethod(sourceId, overrides = {}) {
  const source = getStarterCleaningMethods().find(record => record.id === sourceId);
  return {
    ...buildSystemDefaultAdoption(source, {
      id: `adopted-${sourceId}`,
      tenantId: 'tenant-a',
      actorUid: 'admin-a',
    }),
    status: 'approved',
    employeeVisible: true,
    ownerReviewNotes: 'Approved for tenant use.',
    ...overrides,
  };
}

describe('checklist method mapping registry', () => {
  it('maps stable outcome IDs without changing checklist structure or completion state', () => {
    const items = [
      { id: SHOWER_OUTCOME_ID, label: 'Clean shower', completed: false, approvedMethodIds: [], preferredMethodId: null },
      { id: 'unmapped-countertop', label: 'Clean unknown countertop', completed: true, approvedMethodIds: [], preferredMethodId: null },
    ];
    const approvedShower = tenantMethod('ab-dawn-vinegar-shower-cleaner');
    const result = applyChecklistMethodMappings(items, [approvedShower], getStarterCleaningMethods());
    expect(result.items).toHaveLength(items.length);
    expect(result.items[0]).toMatchObject({
      id: SHOWER_OUTCOME_ID,
      label: 'Clean shower',
      completed: false,
      approvedMethodIds: [approvedShower.id],
      preferredMethodId: approvedShower.id,
    });
    expect(result.items[1]).toEqual(items[1]);
    expect(getChecklistMethodMapping('unmapped-countertop')).toBeNull();
  });

  it('shows an honest owner warning while candidate or pending methods remain unusable', () => {
    const pending = tenantMethod('ab-dawn-vinegar-shower-cleaner', {
      status: 'pending_review',
      employeeVisible: false,
    });
    const guidance = resolveChecklistMethodGuidance(
      { id: SHOWER_OUTCOME_ID },
      [pending],
      getStarterCleaningMethods(),
    );
    expect(guidance.preferred).toBeNull();
    expect(guidance.alternatives).toEqual([]);
    expect(guidance.warnings.join(' ')).toMatch(/pending review.*not employee-usable/i);
  });

  it('preserves an immutable snapshot mapping and degrades safely when a record is missing', () => {
    const snapshotItem = {
      id: SHOWER_OUTCOME_ID,
      approvedMethodIds: ['approved-one', 'missing-one'],
      preferredMethodId: 'approved-one',
    };
    const guidance = resolveSnapshotMethodGuidance(snapshotItem, [{
      ...tenantMethod('ab-dawn-vinegar-shower-cleaner'),
      id: 'approved-one',
    }]);
    expect(guidance.preferred.id).toBe('approved-one');
    expect(guidance.warnings).toContain('A previously approved method is no longer available.');
    expect(applyChecklistMethodMappings([snapshotItem], [], getStarterCleaningMethods()).items[0]).toBe(snapshotItem);
  });

  it('does not present a retired snapshot method as approved owner guidance', () => {
    const retired = tenantMethod('ab-dawn-vinegar-shower-cleaner', {
      id: 'retired-method',
      status: 'retired',
      employeeVisible: false,
    });
    const guidance = resolveSnapshotMethodGuidance({
      id: SHOWER_OUTCOME_ID,
      approvedMethodIds: [retired.id],
      preferredMethodId: retired.id,
    }, [retired]);
    expect(guidance.preferred).toBeNull();
    expect(guidance.warnings.join(' ')).toMatch(/no longer employee-usable/i);
  });
});
