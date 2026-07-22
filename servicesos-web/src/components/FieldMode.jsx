import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BOOKING_FIELD_STATUS_LABELS,
  bookingMatchesEmployeeFieldVisibility,
  getAssignedFieldJobs,
  getJobs,
  updateBookingFieldExecution,
} from '../core/scheduling/schedulingService';
import { useAuth } from '../contexts/AuthContext';
import { FieldPhotoUploadPanel } from './FieldPhotoEvidence';
import { FieldChecklistMethodGuidance } from './ChecklistMethodGuidance';
import { isApprovedChecklistCurrent } from '../core/checklists/bookingChecklistAssembly';
import { getEmployeeUsableCleaningRecordsByIds } from '../modules/cleaning/products/cleaningProductService';
import {
  bookingAddress,
  bookingCustomerName,
  bookingCustomerPhone,
  bookingNotes,
  bookingPaymentStatus,
  bookingSchedule,
  bookingServiceType,
  bookingStatus,
} from './bookingDisplay';
import './FieldMode.css';

function pad(value) {
  return String(value).padStart(2, '0');
}

function localDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function bookingDateKey(booking = {}) {
  if (booking.scheduledAt) {
    const scheduled = typeof booking.scheduledAt?.toDate === 'function'
      ? booking.scheduledAt.toDate()
      : new Date(booking.scheduledAt);
    if (!Number.isNaN(scheduled.getTime())) return localDateKey(scheduled);
  }
  const stored = booking.date || booking.appointmentDate;
  return typeof stored === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(stored) ? stored : '';
}

function sortValue(booking) {
  return `${bookingDateKey(booking)}T${booking.startTime || booking.time || booking.appointmentTime || '23:59'}`;
}

function shouldUseMapsFallback() {
  if (window.__SERVICESOS_ALLOW_MAPS_AUTO_OPEN__ === true) return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '';
}

function fieldStatusValue(booking = {}) {
  const status = typeof booking.fieldStatus === 'string' && booking.fieldStatus.trim()
    ? booking.fieldStatus.trim()
    : 'not_started';
  return BOOKING_FIELD_STATUS_LABELS[status] ? status : 'not_started';
}

function fieldStatusLabel(booking = {}) {
  return BOOKING_FIELD_STATUS_LABELS[fieldStatusValue(booking)];
}

function normalizeChecklist(items, approvedSnapshot) {
  const sourceItems = Array.isArray(items) && items.length > 0
    ? items
    : (approvedSnapshot?.ownerApproved === true && Array.isArray(approvedSnapshot.items)
      ? approvedSnapshot.items
      : []);
  const seenIds = new Set();
  return sourceItems
    .filter(item => item && typeof item === 'object')
    .map((item, index) => ({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `item-${index + 1}`,
      area: typeof item.area === 'string' && item.area.trim() ? item.area.trim() : 'General',
      fixtureOrSurface: typeof item.fixtureOrSurface === 'string' ? item.fixtureOrSurface.trim() : '',
      label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : `Checklist item ${index + 1}`,
      completionCriteria: typeof item.completionCriteria === 'string' ? item.completionCriteria.trim() : '',
      jobAidSteps: normalizeJobAidSteps(item.jobAidSteps),
      warnings: Array.isArray(item.warnings)
        ? item.warnings.filter(warning => typeof warning === 'string' && warning.trim()).map(warning => warning.trim())
        : [],
      note: typeof item.note === 'string' ? item.note : '',
      condition: typeof item.condition === 'string' ? item.condition : '',
      required: item.required === true,
      completed: item.completed === true,
      approvedMethodIds: Array.isArray(item.approvedMethodIds) ? [...item.approvedMethodIds] : [],
      preferredMethodId: item.preferredMethodId || null,
      sourceReferences: Array.isArray(item.sourceReferences)
        ? item.sourceReferences.filter(reference => typeof reference === 'string' && reference.trim())
        : [],
    }))
    .filter(item => {
      if (seenIds.has(item.id)) return false;
      seenIds.add(item.id);
      return true;
    });
}

function normalizeJobAidSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.map(step => {
    if (typeof step === 'string') return { label: step.trim(), note: '', condition: '' };
    if (!step || typeof step !== 'object') return null;
    return {
      label: typeof step.label === 'string' ? step.label.trim() : '',
      note: typeof step.note === 'string' ? step.note.trim() : '',
      condition: typeof step.condition === 'string' ? step.condition.trim() : '',
    };
  }).filter(step => step?.label);
}

function checklistRoom(area = '') {
  return String(area).split('/')[0].trim() || 'General';
}

function fieldSafeInstructions(booking = {}) {
  const candidates = [
    booking.fieldInstructions,
    booking.technicianNotes,
    booking.accessInstructions,
    booking.requestSnapshot?.accessInstructions,
    booking.requestSnapshot?.rawInput?.accessInstructions,
    booking.requestSnapshot?.specialRequests,
    booking.formData?.specialRequests,
  ];
  return candidates.find(value => typeof value === 'string' && value.trim())?.trim() || 'No field instructions provided';
}

function JobCard({ booking, employeeView, onOpen }) {
  return (
    <article className="v1-card field-job-card">
      <div className="field-job-card-header">
        <div>
          <div className="field-job-time">{bookingSchedule(booking)}</div>
          <h2>{bookingCustomerName(booking)}</h2>
          <p>{bookingServiceType(booking)}</p>
        </div>
        <div className="field-job-badges">
          <span className="v1-pill">{bookingStatus(booking)}</span>
          <span className="v1-pill">{fieldStatusLabel(booking)}</span>
          {!employeeView && <span className="v1-pill v1-pill-payment">{bookingPaymentStatus(booking)}</span>}
        </div>
      </div>
      <div className="field-job-address">{bookingAddress(booking)}</div>
      <button className="v1-button v1-button-secondary" type="button" onClick={() => onOpen(booking)}>Open job packet</button>
    </article>
  );
}

function JobPacket({ booking, employeeView, fieldPhotoAccess, tenantId, userId, onClose, onBookingPatch, onAccessLost }) {
  const [actionMessage, setActionMessage] = useState('');
  const [executionMessage, setExecutionMessage] = useState('');
  const [executionError, setExecutionError] = useState('');
  const [savingAction, setSavingAction] = useState('');
  const [fieldStatus, setFieldStatus] = useState(fieldStatusValue(booking));
  const approvedChecklistCurrent = isApprovedChecklistCurrent(booking);
  const [checklist, setChecklist] = useState(() => normalizeChecklist(
    approvedChecklistCurrent ? booking.fieldChecklist : [],
    approvedChecklistCurrent ? booking.jobChecklistSnapshot : null
  ));
  const [fieldNotes, setFieldNotes] = useState(typeof booking.fieldNotes === 'string' ? booking.fieldNotes : '');
  const [fieldIssue, setFieldIssue] = useState(typeof booking.fieldIssue === 'string' ? booking.fieldIssue : '');
  const [photoEvidence, setPhotoEvidence] = useState({ loading: true, photos: [] });
  const [methodRecords, setMethodRecords] = useState([]);
  const [showCompletionWarning, setShowCompletionWarning] = useState(false);
  const phone = bookingCustomerPhone(booking);
  const address = bookingAddress(booking);
  const hasPhone = phone !== 'Phone not provided';
  const hasAddress = address !== 'Address not provided';
  const mapsUrl = hasAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '';
  const defaultActionMessage = 'Maps opens in a new tab/window where supported. Calls require a phone-capable device.';
  const mapsFallbackMessage = 'Maps could not open automatically. Copy the address and open it in your maps app.';
  const callFallbackMessage = 'If nothing opened, your device/browser may not support phone calls from this page.';
  const displayedActionMessage = actionMessage || defaultActionMessage;
  const completedCount = checklist.filter(item => item.completed).length;
  const methodIds = useMemo(() => Array.from(new Set(checklist.flatMap(item => [
    ...(Array.isArray(item.approvedMethodIds) ? item.approvedMethodIds : []),
    item.preferredMethodId,
  ]).filter(Boolean))).sort(), [checklist]);
  const methodIdsKey = methodIds.join('|');
  const methodRecordById = useMemo(
    () => new Map(methodRecords.map(record => [record.id, record])),
    [methodRecords],
  );
  const checklistGroups = useMemo(() => checklist.reduce((groups, item) => {
    const room = checklistRoom(item.area);
    const existing = groups.find(group => group.room === room);
    if (existing) existing.items.push(item);
    else groups.push({ room, items: [item] });
    return groups;
  }, []), [checklist]);
  const hasApprovedChecklist = approvedChecklistCurrent;
  const approvedPacketNotes = typeof booking.jobChecklistSnapshot?.notes === 'string'
    ? booking.jobChecklistSnapshot.notes.trim()
    : '';
  const approvedPacketWarnings = Array.isArray(booking.jobChecklistSnapshot?.warnings)
    ? booking.jobChecklistSnapshot.warnings.filter(warning => typeof warning === 'string' && warning.trim())
    : [];
  const saving = Boolean(savingAction);

  useEffect(() => {
    let active = true;
    const requestedMethodIds = methodIdsKey ? methodIdsKey.split('|') : [];
    Promise.resolve().then(async () => {
      if (!active) return;
      setMethodRecords([]);
      if (!tenantId || requestedMethodIds.length === 0) return;
      try {
        const records = await getEmployeeUsableCleaningRecordsByIds(tenantId, requestedMethodIds);
        if (active) setMethodRecords(records);
      } catch {
        if (active) setMethodRecords([]);
      }
    });

    return () => { active = false; };
  }, [tenantId, methodIdsKey]);

  const handleCallCustomer = event => {
    event.stopPropagation();
    setActionMessage(callFallbackMessage);
  };
  const openMapsInNewTab = event => {
    event.preventDefault();
    event.stopPropagation();
    setActionMessage('');
    if (shouldUseMapsFallback()) {
      setActionMessage(mapsFallbackMessage);
      return;
    }
    const opened = window.open(mapsUrl, '_blank', 'noopener,noreferrer');
    if (opened === null) {
      setActionMessage(mapsFallbackMessage);
    }
  };
  const copyAddress = async event => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      setActionMessage('Address copied.');
    } catch {
      setActionMessage(mapsFallbackMessage);
    }
  };
  const saveFieldExecution = async (patch, successMessage, actionName) => {
    setExecutionError('');
    setExecutionMessage('');
    if (!tenantId || !booking.id) {
      setExecutionError('Job update could not be saved. The tenant or booking is unavailable.');
      return;
    }

    setSavingAction(actionName);
    try {
      const result = await updateBookingFieldExecution(tenantId, booking.id, patch, { updatedBy: userId });
      if (!result?.success) {
        throw new Error(result?.message || 'field-update-failed');
      }
      const updatedBooking = { ...booking, ...result.data };
      onBookingPatch(updatedBooking);
      if (result.data?.fieldStatus) setFieldStatus(result.data.fieldStatus);
      if (Array.isArray(result.data?.fieldChecklist)) setChecklist(result.data.fieldChecklist);
      if (Object.hasOwn(result.data || {}, 'fieldNotes')) setFieldNotes(result.data.fieldNotes);
      if (Object.hasOwn(result.data || {}, 'fieldIssue')) setFieldIssue(result.data.fieldIssue);
      setExecutionMessage(successMessage);
    } catch {
      setExecutionError('Job update could not be saved. Please try again.');
      if (employeeView) onAccessLost?.();
    } finally {
      setSavingAction('');
    }
  };
  const startJob = () => saveFieldExecution({ fieldStatus: 'in_progress' }, 'Job started.', 'start');
  const saveChecklist = () => saveFieldExecution({ fieldChecklist: checklist }, 'Checklist saved.', 'checklist');
  const saveNotes = () => saveFieldExecution({ fieldNotes, fieldIssue }, 'Notes saved.', 'notes');
  const updatePhotoEvidence = useCallback(evidence => setPhotoEvidence(evidence), []);
  const completeJob = () => saveFieldExecution({
    fieldStatus: 'completed',
    fieldChecklist: checklist,
    fieldNotes,
    fieldIssue,
  }, 'Job marked complete.', 'complete');
  const markComplete = () => {
    const hasUploadedAfterPhoto = photoEvidence.photos.some(photo => photo.phase === 'after');
    if (fieldPhotoAccess && !hasUploadedAfterPhoto) {
      setShowCompletionWarning(true);
      return;
    }
    completeJob();
  };

  return (
    <div className="v1-modal-overlay" onClick={onClose}>
      <section className="v1-modal field-job-packet" role="dialog" aria-modal="true" aria-labelledby="field-job-title" onClick={event => event.stopPropagation()}>
        <header className="field-job-packet-header">
          <div>
            <p>Field job packet</p>
            <h2 id="field-job-title">{bookingCustomerName(booking)}</h2>
          </div>
          <button className="v1-button v1-button-secondary" type="button" onClick={onClose}>Close</button>
        </header>
        <div className="field-job-badges">
          <span className="v1-pill">{bookingStatus(booking)}</span>
          <span className="v1-pill">{BOOKING_FIELD_STATUS_LABELS[fieldStatus] || BOOKING_FIELD_STATUS_LABELS.not_started}</span>
          {!employeeView && <span className="v1-pill v1-pill-payment">{bookingPaymentStatus(booking)}</span>}
        </div>
        <dl className="field-job-details">
          <dt>Schedule</dt><dd>{bookingSchedule(booking)}</dd>
          <dt>Service</dt><dd>{bookingServiceType(booking)}</dd>
          <dt>Address</dt><dd>{address}</dd>
          <dt>Notes</dt><dd>{employeeView ? fieldSafeInstructions(booking) : bookingNotes(booking)}</dd>
          <dt>Phone</dt><dd>{phone}</dd>
        </dl>
        <section className="field-job-actions" aria-labelledby="field-job-actions-title">
          <h3 id="field-job-actions-title">Field actions</h3>
          <div className="field-job-action-buttons">
            {hasPhone ? <a className="v1-button v1-button-primary" href={`tel:${phone}`} onClick={handleCallCustomer}>Call customer</a> : <span className="field-job-unavailable">Call unavailable</span>}
            {hasAddress ? (
              <>
                <button className="v1-button v1-button-secondary" type="button" onClick={openMapsInNewTab}>Open in maps</button>
                <button className="v1-button v1-button-secondary" type="button" onClick={copyAddress}>Copy address</button>
              </>
            ) : <span className="field-job-unavailable">Maps unavailable</span>}
          </div>
          <div className="field-job-action-status" role="status">{displayedActionMessage}</div>
        </section>
        <section className="field-job-execution" aria-labelledby="field-job-execution-title">
          <div className="field-job-execution-header">
            <div>
              <h3 id="field-job-execution-title">Job execution</h3>
              <p>Job completion is separate from payment status.</p>
            </div>
            <span className="v1-pill">{BOOKING_FIELD_STATUS_LABELS[fieldStatus] || BOOKING_FIELD_STATUS_LABELS.not_started}</span>
          </div>
          <div className="field-job-execution-controls">
            <button
              className="v1-button v1-button-primary"
              type="button"
              onClick={startJob}
              disabled={saving || fieldStatus === 'in_progress' || fieldStatus === 'completed'}
            >
              {savingAction === 'start' ? 'Starting...' : 'Start Job'}
            </button>
            <button
              className="v1-button v1-button-secondary"
              type="button"
              onClick={markComplete}
              disabled={saving || fieldStatus === 'completed'}
            >
              {savingAction === 'complete' ? 'Completing...' : 'Mark Complete'}
            </button>
          </div>
          {showCompletionWarning && (
            <div className="field-completion-warning" role="alertdialog" aria-labelledby="field-completion-warning-title">
              <p id="field-completion-warning-title">No after photos have been uploaded. Complete the job anyway?</p>
              <div className="field-completion-warning-actions">
                <button className="v1-button v1-button-secondary" type="button" onClick={() => setShowCompletionWarning(false)}>
                  Go back
                </button>
                <button
                  className="v1-button v1-button-primary"
                  type="button"
                  onClick={() => {
                    setShowCompletionWarning(false);
                    completeJob();
                  }}
                >
                  Complete anyway
                </button>
              </div>
            </div>
          )}
          <div className="field-job-checklist">
            <h4>Checklist</h4>
            {!hasApprovedChecklist || checklist.length === 0 ? (
              <p className="field-job-checklist-empty">No checklist assigned to this job.</p>
            ) : (
              <>
                {(approvedPacketNotes || approvedPacketWarnings.length > 0) && (
                  <div className="field-job-prep-context">
                    <h4>Owner-approved job prep</h4>
                    {approvedPacketNotes && <p><strong>Job notes:</strong> {approvedPacketNotes}</p>}
                    {approvedPacketWarnings.length > 0 && (
                      <ul>{approvedPacketWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
                    )}
                  </div>
                )}
                <p>{completedCount} of {checklist.length} complete</p>
                <div className="field-job-checklist-groups">
                  {checklistGroups.map(group => {
                    const groupCompleted = group.items.filter(item => item.completed).length;
                    return (
                      <section className="field-job-checklist-area" key={group.room}>
                        <div className="field-job-checklist-area-heading">
                          <h5>{group.room}</h5>
                          <span>{groupCompleted} of {group.items.length} complete</span>
                        </div>
                        <div className="field-job-checklist-items">
                          {group.items.map(item => (
                            <div key={item.id} className="field-job-checklist-item">
                              <label className="field-job-checklist-item-main">
                                <input
                                  type="checkbox"
                                  checked={item.completed}
                                  onChange={event => {
                                    const checked = event.target.checked;
                                    setChecklist(current => current.map(existing => (
                                      existing.id === item.id ? { ...existing, completed: checked } : existing
                                    )));
                                  }}
                                />
                                <span>
                                  <strong>{item.fixtureOrSurface || item.area}</strong>
                                  <small className="field-job-checklist-requirement">{item.required ? 'Required' : 'Optional'}</small>
                                  {item.label}
                                  {item.condition && <small>Condition: {item.condition}</small>}
                                  {item.note && <small>{item.note}</small>}
                                </span>
                              </label>
                              {(item.completionCriteria || item.jobAidSteps.length > 0 || item.warnings.length > 0) && (
                                <details className="field-job-checklist-job-aid">
                                  <summary>View steps</summary>
                                  {item.completionCriteria && <p><strong>Completion criteria:</strong> {item.completionCriteria}</p>}
                                  {item.jobAidSteps.length > 0 && (
                                    <ol>
                                      {item.jobAidSteps.map((step, index) => (
                                        <li key={`${item.id}-step-${index + 1}`}>
                                          {step.label}
                                          {step.condition && <small>Condition: {step.condition}</small>}
                                          {step.note && <small>{step.note}</small>}
                                        </li>
                                      ))}
                                    </ol>
                                  )}
                                  {item.warnings.length > 0 && (
                                    <div className="field-job-checklist-warnings">
                                      <strong>Warnings</strong>
                                      <ul>{item.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
                                    </div>
                                  )}
                                </details>
                              )}
                              <FieldChecklistMethodGuidance
                                records={(item.approvedMethodIds || [])
                                  .map(recordId => methodRecordById.get(recordId))
                                  .filter(Boolean)}
                                preferredMethodId={item.preferredMethodId}
                              />
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
                <button
                  className="v1-button v1-button-secondary"
                  type="button"
                  onClick={saveChecklist}
                  disabled={saving}
                >
                  {savingAction === 'checklist' ? 'Saving...' : 'Save checklist'}
                </button>
              </>
            )}
          </div>
          <div className="field-job-notes">
            <label>
              Employee notes
              <textarea
                value={fieldNotes}
                onChange={event => setFieldNotes(event.target.value)}
                rows={3}
                placeholder="Add job notes for owner review."
              />
            </label>
            <label>
              Issue/problem to flag
              <textarea
                value={fieldIssue}
                onChange={event => setFieldIssue(event.target.value)}
                rows={2}
                placeholder="Optional issue to review later."
              />
            </label>
            <button
              className="v1-button v1-button-secondary"
              type="button"
              onClick={saveNotes}
              disabled={saving}
            >
              {savingAction === 'notes' ? 'Saving...' : 'Save notes'}
            </button>
          </div>
          {fieldPhotoAccess && (
            <FieldPhotoUploadPanel
              tenantId={tenantId}
              bookingId={booking.id}
              onEvidenceChange={updatePhotoEvidence}
            />
          )}
          {executionMessage && <div className="field-job-execution-status" role="status">{executionMessage}</div>}
          {executionError && <div className="field-job-execution-error" role="alert">{executionError}</div>}
        </section>
      </section>
    </div>
  );
}

export default function FieldMode() {
  const { isEmployee, isSuperAdmin, tenantId, user, userProfile } = useAuth();
  const loadRequestRef = useRef(0);
  const employeeView = isEmployee?.() === true;
  const authenticatedUserId = user?.uid || '';
  const employeePhotoAccess = employeeView &&
    userProfile?.role === 'employee' &&
    userProfile?.status === 'active' &&
    userProfile?.tenantId === tenantId &&
    authenticatedUserId === userProfile?.uid;
  const tenantAdminPhotoAccess = userProfile?.role === 'admin' &&
    userProfile?.status === 'active' &&
    userProfile?.tenantId === tenantId &&
    authenticatedUserId === userProfile?.uid;
  const superAdminPhotoAccess = isSuperAdmin?.() === true &&
    userProfile?.status === 'active' &&
    Boolean(tenantId) &&
    tenantId !== 'DEFAULT' &&
    authenticatedUserId === userProfile?.uid;
  const fieldPhotoAccess = employeePhotoAccess || tenantAdminPhotoAccess || superAdminPhotoAccess;
  const [bookings, setBookings] = useState([]);
  const [bookingsTenantId, setBookingsTenantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const patchSelectedBooking = (updatedBooking) => {
    setSelectedBooking(updatedBooking);
    setBookings(current => current.map(booking => (
      booking.id === updatedBooking.id ? { ...booking, ...updatedBooking } : booking
    )));
  };

  const load = useCallback(async () => {
    const requestedTenantId = tenantId;
    const requestId = ++loadRequestRef.current;
    const isCurrentRequest = () => requestId === loadRequestRef.current;

    setLoading(true);
    setError('');
    if (!tenantId) {
      setBookings([]);
      setError('Field Mode could not be loaded. Your tenant is unavailable.');
      setLoading(false);
      return;
    }
    try {
      const result = employeeView
        ? await getAssignedFieldJobs(requestedTenantId, authenticatedUserId)
        : await getJobs(requestedTenantId);
      if (!isCurrentRequest()) return;
      if (!result.success) throw new Error('load-failed');
      const nextBookings = Array.isArray(result.data) ? result.data : [];
      setBookings(nextBookings);
      setBookingsTenantId(requestedTenantId);
      if (employeeView) {
        setSelectedBooking(current => current && nextBookings.some(booking => booking.id === current.id)
          ? current
          : null);
      }
    } catch {
      if (!isCurrentRequest()) return;
      setBookings([]);
      setError('Field Mode could not be loaded. Please try again.');
    } finally {
      if (isCurrentRequest()) setLoading(false);
    }
  }, [authenticatedUserId, employeeView, tenantId]);

  useEffect(() => {
    let active = true;
    loadRequestRef.current += 1;
    Promise.resolve().then(() => {
      if (!active) return;
      setBookings([]);
      setBookingsTenantId(null);
      setSelectedBooking(null);
      setError('');
      setLoading(true);
      load();
    });
    return () => {
      active = false;
      loadRequestRef.current += 1;
    };
  }, [load]);

  const grouped = useMemo(() => {
    const today = localDateKey(new Date());
    const tenantBookings = bookingsTenantId === tenantId ? bookings : [];
    const activeBookings = employeeView
      ? tenantBookings.filter(booking => bookingMatchesEmployeeFieldVisibility(booking, authenticatedUserId))
      : tenantBookings;
    const ordered = [...activeBookings].filter(booking => bookingDateKey(booking) >= today).sort((a, b) => sortValue(a).localeCompare(sortValue(b)));
    return {
      today: ordered.filter(booking => bookingDateKey(booking) === today),
      upcoming: ordered.filter(booking => bookingDateKey(booking) > today),
    };
  }, [authenticatedUserId, bookings, bookingsTenantId, employeeView, tenantId]);

  return (
    <section className="v1-page field-mode-page" aria-labelledby="field-mode-title">
      <div className="v1-page-header" style={{ marginBottom: 32 }}>
        <h1 className="v1-page-title" id="field-mode-title">Field Mode</h1>
        <p className="v1-page-subtitle">Job packets for today and upcoming work. Use Bookings to change schedules or payment details.</p>
      </div>
      {loading && <p role="status">Loading Field Mode…</p>}
      {!loading && error && <div className="v1-empty-state" role="alert">{error}{tenantId && <><br /><button className="v1-button v1-button-secondary" type="button" onClick={load}>Try again</button></>}</div>}
      {!loading && !error && (
        <div className="field-mode-sections" style={{ display: 'grid', gap: 32 }}>
          <section aria-labelledby="today-jobs-title">
            <h2 id="today-jobs-title" style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 16 }}>Today</h2>
            {grouped.today.length ? grouped.today.map((booking, index) => <JobCard booking={booking} employeeView={employeeView} onOpen={setSelectedBooking} key={booking.id || `today-${index}`} />) : <div className="v1-empty-state" style={{ padding: 48, textAlign: 'center', color: '#64748b' }}><div style={{ fontSize: 48, marginBottom: 16 }}>📅</div><div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#475569' }}>No jobs scheduled for today</div><div style={{ fontSize: 14 }}>Upcoming job packets will appear below.</div></div>}
          </section>
          <section aria-labelledby="upcoming-jobs-title">
            <h2 id="upcoming-jobs-title" style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 16 }}>Upcoming</h2>
            {grouped.upcoming.length ? grouped.upcoming.map((booking, index) => <JobCard booking={booking} employeeView={employeeView} onOpen={setSelectedBooking} key={booking.id || `upcoming-${index}`} />) : <div className="v1-empty-state" style={{ padding: 48, textAlign: 'center', color: '#64748b' }}><div style={{ fontSize: 48, marginBottom: 16 }}>📅</div><div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#475569' }}>No upcoming jobs scheduled</div><div style={{ fontSize: 14 }}>Approved bookings will show here for field reference.</div></div>}
          </section>
        </div>
      )}
      {selectedBooking && bookingsTenantId === tenantId && (
        <JobPacket
          key={selectedBooking.id || 'selected-job'}
          booking={selectedBooking}
          employeeView={employeeView}
          fieldPhotoAccess={fieldPhotoAccess}
          tenantId={tenantId}
          userId={authenticatedUserId}
          onBookingPatch={patchSelectedBooking}
          onAccessLost={() => {
            setSelectedBooking(null);
            load();
          }}
          onClose={() => setSelectedBooking(null)}
        />
      )}
    </section>
  );
}
