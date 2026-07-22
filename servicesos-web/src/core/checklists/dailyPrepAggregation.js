import { isEmployeeUsableCleaningRecord } from '../../modules/cleaning/products/cleaningProductModel';
import { getChecklistMethodMapping } from './checklistMethodMappingRegistry';
import { extractBookingChecklistScope, isApprovedChecklistCurrent } from './bookingChecklistAssembly';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function jobLabel(booking = {}) {
  return text(booking.customerName) || text(booking.customerSnapshot?.name) || 'Unnamed scheduled job';
}

function outcomeLabel(item = {}) {
  return text(item.fixtureOrSurface) || text(item.label) || 'Checklist outcome';
}

function isKnownUnmappedSurfaceOutcome(item = {}) {
  const values = [item.fixtureOrSurface, item.area, item.label].map(text).join(' ').toLowerCase();
  return values.includes('countertop') || values.includes('floor');
}

function statusLabel(status) {
  return text(status).replaceAll('_', ' ') || 'unavailable';
}

function addJob(group, job) {
  if (!group.jobs.some(existing => existing.id === job.id)) group.jobs.push(job);
}

function addRecordGroup(groups, record, job) {
  const existing = groups.get(record.id);
  if (existing) {
    addJob(existing, job);
    return;
  }
  groups.set(record.id, { id: record.id, record, jobs: [job] });
}

function addTextGroup(groups, value, job) {
  const label = text(value);
  if (!label) return;
  const existing = groups.get(label);
  if (existing) {
    addJob(existing, job);
    return;
  }
  groups.set(label, { label, jobs: [job] });
}

function addAttention(items, job, reason) {
  const message = text(reason);
  if (!message) return;
  const key = `${job.id}|${message}`;
  if (!items.some(item => item.key === key)) items.push({ key, job, reason: message });
}

function addRecordRequirements(summary, record, job) {
  (record.requiredTools || []).forEach(value => addTextGroup(summary.tools, value, job));
  (record.requiredPPE || []).forEach(value => addTextGroup(summary.ppe, value, job));
  if ((record.prohibitedSurfaces || []).length > 0) {
    addTextGroup(summary.warnings, `${record.name}: Do not use on ${record.prohibitedSurfaces.join(', ')}.`, job);
  }
  (record.dangerousCombinations || []).forEach(value => addTextGroup(summary.warnings, `${record.name}: ${value}`, job));

  if (record.status === 'restricted') {
    const restriction = text(record.ownerReviewNotes) || (record.prohibitedSurfaces || []).join(', ');
    addTextGroup(summary.warnings, `${record.name} is restricted${restriction ? `: ${restriction}` : '.'}`, job);
  }

  if ((record.compatibleSurfaces || []).length === 0 && (record.prohibitedSurfaces || []).length === 0) {
    addAttention(summary.needsAttention, job, `${record.name} has no approved surface guidance.`);
  }
}

function summaryValues(groups) {
  return [...groups.values()];
}

/**
 * Creates a read-only kit-preparation view from approved booking snapshots.
 * It deliberately consumes only method IDs already saved in each snapshot.
 */
export function buildDailyPrepSummary({ bookings = [], tenantId, tenantMethods = [] } = {}) {
  const methodsById = new Map(
    tenantMethods
      .filter(record => record?.scope === 'tenant' && (!tenantId || record.tenantId === tenantId))
      .map(record => [record.id, record]),
  );
  const summary = {
    mixtures: new Map(),
    commercialProducts: new Map(),
    tools: new Map(),
    ppe: new Map(),
    warnings: new Map(),
    needsAttention: [],
    eligibleJobs: [],
  };

  bookings.forEach((booking, order) => {
    if (tenantId && text(booking.tenantId) && text(booking.tenantId) !== tenantId) return;
    const job = { id: text(booking.id) || `scheduled-job-${order + 1}`, label: jobLabel(booking), order };
    if (!isApprovedChecklistCurrent(booking)) {
      addAttention(summary.needsAttention, job, 'No approved current checklist snapshot. This job is excluded from usable preparation items.');
      return;
    }

    summary.eligibleJobs.push(job);
    const scope = extractBookingChecklistScope(booking);
    if (scope.surfaceNotes) addTextGroup(summary.warnings, `Surface note: ${scope.surfaceNotes}`, job);
    scope.hazards.forEach(hazard => addTextGroup(summary.warnings, `Safety information: ${hazard}`, job));
    if (scope.customerInstructions) addTextGroup(summary.warnings, `Job note: ${scope.customerInstructions}`, job);
    const items = Array.isArray(booking.jobChecklistSnapshot?.items) ? booking.jobChecklistSnapshot.items : [];
    items.forEach(item => {
      const methodIds = [...new Set((Array.isArray(item.approvedMethodIds) ? item.approvedMethodIds : [])
        .filter(value => typeof value === 'string' && value.trim()))];
      const mapping = getChecklistMethodMapping(item.id);

      if (methodIds.length === 0) {
        if (mapping) {
          addAttention(summary.needsAttention, job, `${outcomeLabel(item)} has no saved approved method.`);
        } else if (isKnownUnmappedSurfaceOutcome(item)) {
          addAttention(summary.needsAttention, job, `${outcomeLabel(item)} has no approved method mapping. Owner surface review is required.`);
        }
        return;
      }

      methodIds.forEach(methodId => {
        const record = methodsById.get(methodId);
        if (!record) {
          addAttention(summary.needsAttention, job, `${outcomeLabel(item)} references a missing tenant method.`);
          return;
        }
        if (!isEmployeeUsableCleaningRecord(record)) {
          addAttention(summary.needsAttention, job, `${record.name} is ${statusLabel(record.status)} or not employee-visible and cannot be prepared for field use.`);
          return;
        }

        if (record.recordType === 'company_mix') addRecordGroup(summary.mixtures, record, job);
        if (record.recordType === 'commercial_product') addRecordGroup(summary.commercialProducts, record, job);
        addRecordRequirements(summary, record, job);
      });
    });
  });

  return {
    mixtures: summaryValues(summary.mixtures),
    commercialProducts: summaryValues(summary.commercialProducts),
    tools: summaryValues(summary.tools),
    ppe: summaryValues(summary.ppe),
    warnings: summaryValues(summary.warnings),
    needsAttention: summary.needsAttention,
    eligibleJobs: summary.eligibleJobs,
  };
}
