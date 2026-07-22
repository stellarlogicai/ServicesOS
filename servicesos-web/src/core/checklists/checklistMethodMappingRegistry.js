import { isEmployeeUsableCleaningRecord } from '../../modules/cleaning/products/cleaningProductModel';

const mapping = (id, outcomeIds, preferredSourceDefaultId, methodCategories) => Object.freeze({
  id,
  outcomeIds: Object.freeze(outcomeIds),
  preferredSourceDefaultId,
  methodCategories: Object.freeze(methodCategories),
});

export const CHECKLIST_METHOD_MAPPINGS = Object.freeze([
  mapping('shower-soap-scum-v1', [
    'standard-one-time-bathroom-shower-or-tub-required-1',
    'standard-recurring-bathroom-shower-or-tub-required-1',
    'maintenance-bathroom-shower-required-1',
    'bathroom-core-clean-shower-and-or-tub-walls-doors-fixtures-and-drains',
  ], 'ab-dawn-vinegar-shower-cleaner', ['shower cleaner']),
  mapping('mirror-cleaning-v1', [
    'standard-one-time-bathroom-mirror-required-1',
    'standard-recurring-bathroom-mirror-required-1',
    'bathroom-core-clean-mirror-to-a-streak-free-finish',
  ], 'ab-mirror-cleaner', ['mirror cleaner']),
  mapping('ordinary-window-glass-v1', [
    'standard-one-time-entryway-glass-required-1',
    'standard-recurring-entryway-glass-required-1',
    'living-room-core-living-room-window-areas-required-1',
    'bedroom-core-bedroom-window-areas-required-1',
    'move-out-service-windows-required-1',
    'addon-windows-whole-home-selected-add-on-optional-1',
  ], 'ab-window-glass-vinegar-cleaner', ['glass cleaner']),
  mapping('kitchen-heavy-grease-v1', [
    'kitchen-deep-complete-approved-heavy-grease-removal',
  ], 'ab-kitchen-grease-cleaner', ['degreasing cleaner']),
  mapping('routine-toilet-cleaning-v1', [
    'standard-one-time-bathroom-toilet-required-1',
    'standard-recurring-bathroom-toilet-required-1',
    'maintenance-bathroom-toilet-required-1',
    'bathroom-core-clean-toilet-interior-exterior-and-base',
  ], 'ab-routine-toilet-bowl-cleaning-method', ['toilet-bowl cleaner']),
]);

const MAPPING_BY_OUTCOME_ID = new Map(
  CHECKLIST_METHOD_MAPPINGS.flatMap(entry => entry.outcomeIds.map(outcomeId => [outcomeId, entry])),
);

function token(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function getChecklistMethodMapping(outcomeId) {
  return MAPPING_BY_OUTCOME_ID.get(outcomeId) || null;
}

function matchesMapping(record, entry) {
  return record.sourceDefaultId === entry.preferredSourceDefaultId ||
    entry.methodCategories.includes(token(record.category));
}

function sourceDefault(systemDefaults, entry) {
  return systemDefaults.find(record => record.id === entry.preferredSourceDefaultId) || null;
}

export function resolveChecklistMethodGuidance(item, tenantRecords = [], systemDefaults = []) {
  const entry = getChecklistMethodMapping(item?.id);
  if (!entry) return { mapping: null, preferred: null, alternatives: [], warnings: [] };

  const matches = tenantRecords.filter(record => matchesMapping(record, entry));
  const usable = matches.filter(isEmployeeUsableCleaningRecord);
  const preferred = usable.find(record => record.sourceDefaultId === entry.preferredSourceDefaultId) || usable[0] || null;
  const alternatives = usable.filter(record => record.id !== preferred?.id);
  const source = sourceDefault(systemDefaults, entry);
  const sourceCopy = matches.find(record => record.sourceDefaultId === entry.preferredSourceDefaultId);
  const warnings = [];

  if (!sourceCopy && source) {
    warnings.push(`${source.name} is a ${source.status.replaceAll('_', ' ')} system default and has not been adopted and approved for this tenant.`);
  } else if (sourceCopy && !isEmployeeUsableCleaningRecord(sourceCopy)) {
    warnings.push(`${sourceCopy.name} is ${sourceCopy.status.replaceAll('_', ' ')} and is not employee-usable.`);
  }
  if (!preferred) warnings.push('No approved employee-visible method is available for this outcome.');

  return { mapping: entry, preferred, alternatives, warnings };
}

export function applyChecklistMethodMappings(items = [], tenantRecords = [], systemDefaults = []) {
  const guidanceByItemId = new Map();
  const mappedItems = items.map(item => {
    if (Array.isArray(item.approvedMethodIds) && item.approvedMethodIds.length > 0) {
      const guidance = resolveSnapshotMethodGuidance(item, tenantRecords);
      guidanceByItemId.set(item.id, guidance);
      return item;
    }
    const guidance = resolveChecklistMethodGuidance(item, tenantRecords, systemDefaults);
    guidanceByItemId.set(item.id, guidance);
    if (!guidance.mapping) return item;
    const approvedMethodIds = [guidance.preferred, ...guidance.alternatives].filter(Boolean).map(record => record.id);
    return {
      ...item,
      approvedMethodIds,
      preferredMethodId: guidance.preferred?.id || null,
    };
  });
  return { items: mappedItems, guidanceByItemId };
}

export function resolveSnapshotMethodGuidance(item, tenantRecords = []) {
  const ids = Array.isArray(item?.approvedMethodIds) ? item.approvedMethodIds : [];
  const known = ids
    .map(recordId => tenantRecords.find(record => record.id === recordId))
    .filter(Boolean);
  const available = known.filter(isEmployeeUsableCleaningRecord);
  const preferred = available.find(record => record.id === item?.preferredMethodId) || available[0] || null;
  const warnings = [];
  if (known.length < ids.length) warnings.push('A previously approved method is no longer available.');
  const unavailable = known.filter(record => !isEmployeeUsableCleaningRecord(record));
  if (unavailable.length > 0) {
    warnings.push(`${unavailable.map(record => record.name).join(', ')} is no longer employee-usable.`);
  }
  return {
    mapping: getChecklistMethodMapping(item?.id),
    preferred,
    alternatives: available.filter(record => record.id !== preferred?.id),
    warnings,
  };
}
