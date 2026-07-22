import { useEffect, useMemo, useState } from 'react';
import {
  CHECKLIST_READINESS,
  CHECKLIST_SUGGESTED_LABEL,
  assembleBookingChecklist,
  bookingChecklistReadiness,
  buildApprovedChecklistSnapshot,
  checklistExecutionCopy,
  extractBookingChecklistScope,
  findRecurringChecklistReuseCandidate,
  isApprovedChecklistCurrent,
} from '../core/checklists/bookingChecklistAssembly';
import { listChecklistTemplates } from '../core/checklists/checklistTemplateRegistry';
import {
  applyChecklistMethodMappings,
  resolveSnapshotMethodGuidance,
} from '../core/checklists/checklistMethodMappingRegistry';
import { updateBookingAdminFields } from '../core/scheduling/schedulingService';
import { listTenantCleaningRecords } from '../modules/cleaning/products/cleaningProductService';
import { getStarterCleaningMethods } from '../modules/cleaning/products/starterCleaningMethods';
import {
  bookingAddress,
  bookingCustomerName,
  bookingPaymentStatus,
  bookingSchedule,
  bookingServiceType,
} from './bookingDisplay';
import { employeeAssignmentLabel } from '../services/employeeProfileService';
import { OwnerChecklistMethodGuidance } from './ChecklistMethodGuidance';
import './BookingChecklistPrep.css';

const READINESS_LABELS = {
  [CHECKLIST_READINESS.NOT_PREPARED]: 'Not prepared',
  [CHECKLIST_READINESS.NEEDS_ATTENTION]: 'Needs attention',
  [CHECKLIST_READINESS.READY]: 'Ready',
  [CHECKLIST_READINESS.COMPLETED]: 'Completed',
};

const ADD_ON_LABELS = {
  oven: 'Inside oven',
  fridge: 'Inside refrigerator',
  insideCabinets: 'Inside cabinets',
  baseboards: 'Baseboards',
  windows: 'Interior windows',
  blindCleaning: 'Blind cleaning',
  wallSpotCleaning: 'Wall cleaning',
  laundryRoomCleaning: 'Laundry room',
  garageCleaning: 'Garage cleaning',
  closetOrganization: 'Closet organization',
  pantryOrganization: 'Pantry organization',
  basementCleaning: 'Basement cleaning',
  petWasteRemoval: 'Pet waste removal',
  ceilingFanCleaning: 'Ceiling fan cleaning',
};

function localDateKey(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function bookingDateKey(booking = {}) {
  if (typeof booking.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(booking.date)) return booking.date;
  const scheduled = booking.scheduledAt?.toDate?.() || new Date(booking.scheduledAt || '');
  return Number.isNaN(scheduled.getTime()) ? '' : localDateKey(scheduled);
}

function bookingDuration(booking = {}) {
  const explicit = Number(booking.estimatedDuration || booking.appointmentDuration);
  if (Number.isFinite(explicit) && explicit > 0) return `${explicit} hour${explicit === 1 ? '' : 's'}`;
  if (booking.date && booking.startTime && booking.endTime) {
    const start = new Date(`${booking.date}T${booking.startTime}`);
    const end = new Date(`${booking.date}T${booking.endTime}`);
    const hours = (end - start) / 3600000;
    if (Number.isFinite(hours) && hours > 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return 'Not recorded';
}

function bookingInstructions(booking = {}) {
  return booking.requestSnapshot?.accessInstructions ||
    booking.requestSnapshot?.rawInput?.accessInstructions ||
    'No access instructions provided';
}

function bookingPrepNotes(booking = {}) {
  return booking.requestSnapshot?.specialRequests ||
    booking.requestSnapshot?.customerNotes ||
    booking.notes ||
    'No special property or service notes';
}

function assigneeName(booking, employeeProfiles) {
  const profile = employeeProfiles.find(employee => employee.uid === booking.assignedEmployeeAuthUid);
  return profile ? employeeAssignmentLabel(profile) : (booking.assignedEmployeeAuthUid ? 'Assigned employee unavailable' : 'Unassigned');
}

export function OwnerTodayJobPrep({
  bookings = [],
  employeeProfiles = [],
  tenantId,
  reviewedBy,
  onOpenBooking,
  onChecklistSaved,
}) {
  const [confirmingBookingId, setConfirmingBookingId] = useState('');
  const [confirmationMessage, setConfirmationMessage] = useState(null);
  const today = localDateKey();
  const todayJobs = bookings
    .filter(booking => bookingDateKey(booking) === today && booking.status !== 'cancelled')
    .sort((a, b) => String(a.startTime || a.scheduledAt || '').localeCompare(String(b.startTime || b.scheduledAt || '')));
  const readiness = todayJobs.map(booking => ({ booking, result: bookingChecklistReadiness(booking, bookings) }));
  const addOns = new Set();
  const preparationWarnings = [];

  todayJobs.forEach(booking => {
    const scope = extractBookingChecklistScope(booking);
    Object.entries(scope.serviceScope).forEach(([key, enabled]) => {
      if (enabled) addOns.add(ADD_ON_LABELS[key] || key);
    });
    if (scope.surfaceNotes) preparationWarnings.push(`${bookingCustomerName(booking)}: ${scope.surfaceNotes}`);
    scope.hazards.forEach(hazard => preparationWarnings.push(`${bookingCustomerName(booking)}: ${hazard}`));
  });

  const confirmRecurringPacket = async (booking, reuseCandidate) => {
    const assembly = assembleBookingChecklist(booking);
    const priorSnapshot = reuseCandidate?.jobChecklistSnapshot;
    const built = buildApprovedChecklistSnapshot({
      booking,
      assembly,
      items: priorSnapshot?.items || [],
      notes: priorSnapshot?.notes || '',
      reviewedBy,
      reuseSource: reuseCandidate,
    });
    if (!tenantId || !built.success) {
      setConfirmationMessage({ type: 'error', bookingId: booking.id, text: built.message || 'Recurring packet could not be confirmed.' });
      return;
    }

    setConfirmingBookingId(booking.id);
    setConfirmationMessage(null);
    const result = await updateBookingAdminFields(tenantId, booking.id, {
      jobChecklistSnapshot: built.data,
      fieldChecklist: checklistExecutionCopy(built.data),
    });
    setConfirmingBookingId('');
    if (!result.success) {
      setConfirmationMessage({ type: 'error', bookingId: booking.id, text: result.message || 'Recurring packet could not be confirmed.' });
      return;
    }
    setConfirmationMessage({ type: 'success', bookingId: booking.id, text: 'Recurring job packet confirmed and ready for Field Mode.' });
    onChecklistSaved?.(booking.id, result.data);
  };

  return (
    <section className="job-prep-today" aria-labelledby="job-prep-today-title">
      <div className="job-prep-heading">
        <div>
          <p className="job-prep-eyebrow">Daily operations</p>
          <h2 id="job-prep-today-title">Today's jobs</h2>
          <p>Review exceptions, not routine work. Jobs are shown in scheduled order.</p>
        </div>
        <div className="job-prep-counts" aria-label="Today's checklist readiness summary">
          <span>{readiness.filter(item => item.result.status === CHECKLIST_READINESS.READY).length} ready</span>
          <span>{readiness.filter(item => item.result.status === CHECKLIST_READINESS.NEEDS_ATTENTION || item.result.status === CHECKLIST_READINESS.NOT_PREPARED).length} need attention</span>
        </div>
      </div>

      {todayJobs.length === 0 ? (
        <div className="job-prep-empty">No active jobs are scheduled for today.</div>
      ) : (
        <div className="job-prep-layout">
          <div className="job-prep-list">
            {readiness.map(({ booking, result }) => (
              <article className="job-prep-card" key={booking.id}>
                <div className="job-prep-card-top">
                  <div>
                    <p className="job-prep-time">{bookingSchedule(booking)}</p>
                    <h3>{bookingCustomerName(booking)}</h3>
                    <p>{bookingAddress(booking)}</p>
                  </div>
                  <span className={`job-prep-status job-prep-status--${result.status}`}>{READINESS_LABELS[result.status]}</span>
                </div>
                <dl className="job-prep-details">
                  <div><dt>Service</dt><dd>{bookingServiceType(booking)}</dd></div>
                  <div><dt>Estimated duration</dt><dd>{bookingDuration(booking)}</dd></div>
                  <div><dt>Assigned employee</dt><dd>{assigneeName(booking, employeeProfiles)}</dd></div>
                  <div><dt>Payment</dt><dd>{bookingPaymentStatus(booking)}</dd></div>
                  <div><dt>Access</dt><dd>{bookingInstructions(booking)}</dd></div>
                  <div><dt>Important notes</dt><dd>{bookingPrepNotes(booking)}</dd></div>
                </dl>
                {result.reasons.length > 0 && (
                  <div className="job-prep-reasons">
                    <strong>{result.status === CHECKLIST_READINESS.READY ? 'Preparation' : 'Needs attention'}</strong>
                    <ul>{result.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
                  </div>
                )}
                <div className="job-prep-card-actions">
                  {result.reuseCandidate && (
                    <button
                      type="button"
                      className="v1-button v1-button-primary"
                      disabled={confirmingBookingId === booking.id || !reviewedBy}
                      onClick={() => confirmRecurringPacket(booking, result.reuseCandidate)}
                    >
                      {confirmingBookingId === booking.id ? 'Confirming...' : 'Confirm recurring packet'}
                    </button>
                  )}
                  <button type="button" className="v1-button v1-button-secondary" onClick={() => onOpenBooking(booking)}>
                    {result.status === CHECKLIST_READINESS.READY ? 'View job packet' : 'Review job prep'}
                  </button>
                </div>
                {confirmationMessage?.bookingId === booking.id && (
                  <p role={confirmationMessage.type === 'error' ? 'alert' : 'status'} className={`job-prep-confirmation job-prep-confirmation--${confirmationMessage.type}`}>
                    {confirmationMessage.text}
                  </p>
                )}
              </article>
            ))}
          </div>

          <aside className="job-prep-summary" aria-labelledby="daily-prep-summary-title">
            <h3 id="daily-prep-summary-title">Daily prep summary</h3>
            <div>
              <h4>Special add-ons</h4>
              <p>{addOns.size ? [...addOns].join(', ') : 'No structured add-ons recorded.'}</p>
            </div>
            <div>
              <h4>Property and surface warnings</h4>
              {preparationWarnings.length
                ? <ul>{preparationWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
                : <p>No structured warnings recorded.</p>}
            </div>
            <div>
              <h4>Products, tools, equipment, and PPE</h4>
              <p>Product and method mappings are not available yet. Review approved job packets and business standards before loading kits.</p>
            </div>
            <div>
              <h4>Refill and mixing</h4>
              <p>No approved refill or mixing mappings are available in this checklist foundation.</p>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

function cloneItems(items = []) {
  return items.map(item => ({
    ...item,
    jobAidSteps: Array.isArray(item.jobAidSteps) ? item.jobAidSteps.map(step => (
      typeof step === 'string' ? step : { ...step }
    )) : [],
    warnings: Array.isArray(item.warnings) ? [...item.warnings] : [],
    approvedMethodIds: [...(item.approvedMethodIds || [])],
    sourceReferences: [...(item.sourceReferences || [])],
    completed: false,
  }));
}

function checklistRoom(area = '') {
  return String(area).split('/')[0].trim() || 'General';
}

function groupedChecklistItems(items = []) {
  return items.reduce((groups, item) => {
    const room = checklistRoom(item.area);
    const existing = groups.find(group => group.room === room);
    if (existing) existing.items.push(item);
    else groups.push({ room, items: [item] });
    return groups;
  }, []);
}

function ChecklistJobAid({ item }) {
  const steps = Array.isArray(item.jobAidSteps) ? item.jobAidSteps : [];
  const warnings = Array.isArray(item.warnings) ? item.warnings : [];
  if (!item.completionCriteria && steps.length === 0 && warnings.length === 0) return null;
  return (
    <details className="booking-checklist-job-aid">
      <summary>View job aid</summary>
      {item.completionCriteria && <p><strong>Completion criteria:</strong> {item.completionCriteria}</p>}
      {steps.length > 0 && (
        <ol>
          {steps.map((step, index) => (
            <li key={`${item.id}-step-${index + 1}`}>
              {typeof step === 'string' ? step : step?.label || 'Step details unavailable'}
              {typeof step === 'object' && step?.condition && <small>Condition: {step.condition}</small>}
              {typeof step === 'object' && step?.note && <small>{step.note}</small>}
            </li>
          ))}
        </ol>
      )}
      {warnings.length > 0 && (
        <div className="booking-checklist-job-aid-warnings">
          <strong>Warnings</strong>
          <ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
        </div>
      )}
    </details>
  );
}

export function BookingChecklistPrep({ booking, allBookings = [], tenantId, reviewedBy, onSaved }) {
  const automaticAssembly = useMemo(() => assembleBookingChecklist(booking), [booking]);
  const reuseCandidate = useMemo(() => findRecurringChecklistReuseCandidate(booking, allBookings), [booking, allBookings]);
  const [assembly, setAssembly] = useState(automaticAssembly);
  const [items, setItems] = useState(() => cloneItems(automaticAssembly.items));
  const [packetNotes, setPacketNotes] = useState('');
  const [newTask, setNewTask] = useState({ area: 'Booking-specific', label: '', required: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [reuseSource, setReuseSource] = useState(null);
  const [tenantMethods, setTenantMethods] = useState([]);
  const [methodLoading, setMethodLoading] = useState(true);
  const [methodLoadError, setMethodLoadError] = useState('');
  const templates = useMemo(() => listChecklistTemplates(), []);
  const systemDefaults = useMemo(() => getStarterCleaningMethods(), []);
  const approved = isApprovedChecklistCurrent(booking);
  const mappedReview = useMemo(
    () => applyChecklistMethodMappings(items, tenantMethods, systemDefaults),
    [items, systemDefaults, tenantMethods],
  );

  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      if (!active) return;
      setMethodLoading(true);
      setMethodLoadError('');
      try {
        const records = await listTenantCleaningRecords(tenantId);
        if (active) setTenantMethods(records);
      } catch {
        if (active) {
          setTenantMethods([]);
          setMethodLoadError('Approved cleaning methods could not be loaded. Checklist tasks are still available for review.');
        }
      } finally {
        if (active) setMethodLoading(false);
      }
    });
    return () => { active = false; };
  }, [tenantId]);

  const selectTemplate = templateId => {
    const next = assembleBookingChecklist(booking, { templateId });
    setAssembly(next);
    setItems(cloneItems(next.items));
    setReuseSource(null);
    setError('');
    setStatus('');
  };

  const useRecurringPacket = () => {
    if (!reuseCandidate?.jobChecklistSnapshot) return;
    const prior = reuseCandidate.jobChecklistSnapshot;
    const nextAssembly = {
      ...automaticAssembly,
      success: true,
      items: cloneItems(prior.items),
      template: {
        sourceRepository: prior.sourceRepository,
        sourceFiles: [...(prior.sourceFiles || [])],
        sourceVersionOrDate: prior.sourceVersionOrDate,
        importedAt: prior.importedAt,
        templateId: prior.templateId,
        templateName: prior.templateName,
        templateVersion: prior.templateVersion,
      },
      warnings: [...(automaticAssembly.warnings || [])],
    };
    setAssembly(nextAssembly);
    setItems(cloneItems(prior.items));
    setPacketNotes(prior.notes || '');
    setReuseSource(reuseCandidate);
    setError('');
    setStatus('Approved recurring packet loaded for confirmation.');
  };

  const removeItem = item => {
    if (item.required) {
      const confirmed = window.confirm('Remove this required task? Confirm that the task is not required for this booking before continuing.');
      if (!confirmed) return;
    }
    setItems(current => current.filter(existing => existing.id !== item.id));
    setStatus('');
  };

  const addTask = event => {
    event.preventDefault();
    const label = newTask.label.trim();
    if (!label) {
      setError('Enter a booking-specific task before adding it.');
      return;
    }
    setItems(current => [...current, {
      id: `owner-task-${Date.now()}-${current.length + 1}`,
      area: newTask.area.trim() || 'Booking-specific',
      fixtureOrSurface: '',
      label,
      completionCriteria: '',
      jobAidSteps: [],
      warnings: [],
      note: '',
      condition: '',
      required: newTask.required,
      completed: false,
      approvedMethodIds: [],
      preferredMethodId: null,
      sourceReferences: [],
    }]);
    setNewTask({ area: 'Booking-specific', label: '', required: true });
    setError('');
  };

  const approveChecklist = async () => {
    setSaving(true);
    setError('');
    setStatus('');
    const built = buildApprovedChecklistSnapshot({
      booking,
      assembly,
      items: mappedReview.items,
      notes: packetNotes,
      reviewedBy,
      reuseSource,
    });
    if (!built.success) {
      setSaving(false);
      setError(built.message);
      return;
    }
    const patch = {
      jobChecklistSnapshot: built.data,
      fieldChecklist: checklistExecutionCopy(built.data),
    };
    const result = await updateBookingAdminFields(tenantId, booking.id, patch);
    if (!result.success) {
      setSaving(false);
      setError(result.message || 'Job checklist could not be approved. Please try again.');
      return;
    }
    setSaving(false);
    setStatus('Job checklist approved and assigned to Field Mode.');
    onSaved?.(result.data);
  };

  if (approved) {
    const snapshot = booking.jobChecklistSnapshot;
    return (
      <section className="booking-checklist-prep booking-checklist-prep--approved" aria-labelledby="booking-checklist-title">
        <div className="booking-checklist-title-row">
          <div>
            <p className="job-prep-eyebrow">Job prep packet</p>
            <h3 id="booking-checklist-title">{snapshot.templateName || snapshot.label || 'Approved checklist'}</h3>
          </div>
          <span className="job-prep-status job-prep-status--ready">Ready</span>
        </div>
        <p>Owner approved on {snapshot.reviewedAt ? new Date(snapshot.reviewedAt).toLocaleString() : 'an earlier date'}.</p>
        {snapshot.notes && <p><strong>Packet notes:</strong> {snapshot.notes}</p>}
        <div className="booking-checklist-items booking-checklist-items--readonly">
          {groupedChecklistItems(snapshot.items).map(group => (
            <section className="booking-checklist-area" key={group.room}>
              <h4>{group.room}</h4>
              {group.items.map(item => (
                <div className="booking-checklist-item" key={item.id}>
                  <div>
                    <strong>{item.fixtureOrSurface || item.area}</strong>
                    <span>{item.label}</span>
                    {item.condition && <small>Condition: {item.condition}</small>}
                    {item.note && <small>{item.note}</small>}
                    <ChecklistJobAid item={item} />
                    <OwnerChecklistMethodGuidance guidance={resolveSnapshotMethodGuidance(item, tenantMethods)} />
                  </div>
                  <span>{item.required ? 'Required' : 'Optional'}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="booking-checklist-prep" aria-labelledby="booking-checklist-title">
      <div className="booking-checklist-title-row">
        <div>
          <p className="job-prep-eyebrow">Job prep packet</p>
          <h3 id="booking-checklist-title">Checklist review</h3>
        </div>
        <span className="job-prep-status job-prep-status--needs_attention">Needs attention</span>
      </div>
      <p className="booking-checklist-suggested">{CHECKLIST_SUGGESTED_LABEL}</p>

      {reuseCandidate && !reuseSource && (
        <div className="booking-checklist-reuse">
          <p>An unchanged approved recurring packet is available from an earlier job.</p>
          <button type="button" className="v1-button v1-button-secondary" onClick={useRecurringPacket}>Use approved recurring packet</button>
        </div>
      )}

      <label className="booking-checklist-template-select">
        Manual template fallback
        <select value={assembly.template?.templateId || ''} onChange={event => selectTemplate(event.target.value)}>
          <option value="">Select an approved template</option>
          {templates.map(template => <option value={template.templateId} key={template.templateId}>{template.templateName}</option>)}
        </select>
      </label>

      {assembly.warnings.length > 0 && (
        <div className="booking-checklist-warning">
          <strong>Preparation warnings</strong>
          <ul>{assembly.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
        </div>
      )}
      {methodLoading && <p role="status" className="v1-muted">Loading approved cleaning methods...</p>}
      {methodLoadError && <p className="booking-checklist-warning">{methodLoadError}</p>}

      {items.length === 0 ? (
        <div className="job-prep-empty">No valid checklist tasks are available. Select a mapped template or correct the booking scope.</div>
      ) : (
        <div className="booking-checklist-items">
          {groupedChecklistItems(items).map(group => (
            <section className="booking-checklist-area" key={group.room}>
              <h4>{group.room}</h4>
              {group.items.map(item => (
                <div className="booking-checklist-item" key={item.id}>
                  <div>
                    <strong>{item.fixtureOrSurface || item.area}</strong>
                    <span>{item.label}</span>
                    {item.condition && <small>Condition: {item.condition}</small>}
                    {item.note && <small>{item.note}</small>}
                    <ChecklistJobAid item={item} />
                    <OwnerChecklistMethodGuidance guidance={mappedReview.guidanceByItemId.get(item.id)} />
                  </div>
                  <div className="booking-checklist-item-actions">
                    <span>{item.required ? 'Required' : 'Optional'}</span>
                    <button type="button" onClick={() => removeItem(item)}>Remove</button>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      <form className="booking-checklist-add" onSubmit={addTask}>
        <h4>Add booking-specific task</h4>
        <input aria-label="Task area" value={newTask.area} onChange={event => setNewTask(current => ({ ...current, area: event.target.value }))} />
        <input aria-label="Task label" placeholder="Task" value={newTask.label} onChange={event => setNewTask(current => ({ ...current, label: event.target.value }))} />
        <label><input type="checkbox" checked={newTask.required} onChange={event => setNewTask(current => ({ ...current, required: event.target.checked }))} /> Required</label>
        <button type="submit" className="v1-button v1-button-secondary">Add task</button>
      </form>

      <label className="booking-checklist-notes">
        Owner checklist notes
        <textarea rows={3} value={packetNotes} onChange={event => setPacketNotes(event.target.value)} />
      </label>

      {error && <p role="alert" className="booking-checklist-error">{error}</p>}
      {status && <p role="status" className="booking-checklist-success">{status}</p>}
      <button type="button" className="v1-button v1-button-primary" disabled={saving || methodLoading || items.length === 0} onClick={approveChecklist}>
        {saving ? 'Approving checklist...' : 'Approve checklist for Field Mode'}
      </button>
    </section>
  );
}
