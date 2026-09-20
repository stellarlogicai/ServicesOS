import { useEffect, useState } from 'react';
import {
  approveCustomerExtraWork,
  approveCustomerJobScope,
  getOwnerJobScope,
  listCustomerExtraWork,
  listCustomerJobScopes,
  requestCustomerScopeApproval,
} from '../services/jobScopeService';

const LABELS = { draft: 'Draft', awaiting_approval: 'Awaiting approval', approved: 'Approved', approval_required: 'Approval required again' };

function ScopeDetails({ scope }) {
  const s = scope.snapshot;
  return <div className="job-scope-details">
    <dl>
      <div><dt>Service</dt><dd>{s.serviceType || 'Not provided'}</dd></div>
      <div><dt>Type</dt><dd>{s.bookingType}</dd></div>
      <div><dt>Schedule</dt><dd>{[s.schedule.date, s.schedule.startTime].filter(Boolean).join(' at ') || 'Not provided'}</dd></div>
      <div><dt>Location</dt><dd>{s.serviceLocation || 'Not provided'}</dd></div>
      <div><dt>Agreed price</dt><dd>{s.price === null ? 'Not provided' : `$${s.price.toFixed(2)}`}</dd></div>
    </dl>
    {s.serviceItems.length > 0 && <><h4>Included tasks</h4><ul>{s.serviceItems.map(item => <li key={item.id}>{item.label}{item.required ? ' (required)' : ''}</li>)}</ul></>}
    {s.selectedAddOns.length > 0 && <><h4>Included add-ons</h4><p>{s.selectedAddOns.join(', ')}</p></>}
    {s.scopeNotes && <><h4>Scope notes</h4><p>{s.scopeNotes}</p></>}
    {s.accessInstructions && <><h4>Access instructions</h4><p>{s.accessInstructions}</p></>}
    <p className="job-scope-notice">Work outside this approved scope is not automatically included. Requested changes may require updated price, time, scheduling, and customer approval.</p>
  </div>;
}

function ExtraWorkApprovals({ bookingId, onApproved }) {
  const [requests, setRequests] = useState([]);
  const [state, setState] = useState('loading');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    listCustomerExtraWork(bookingId).then(value => {
      if (active) { setRequests(value); setState('ready'); }
    }).catch(() => active && setState('error'));
    return () => { active = false; };
  }, [bookingId]);
  const approve = async request => {
    setState('saving'); setMessage('');
    try {
      const updated = await approveCustomerExtraWork(bookingId, request.id);
      setRequests(current => current.map(item => item.id === updated.id ? updated : item));
      setState('ready');
      setMessage('Extra work approved and added to your service scope.');
      onApproved();
    } catch {
      setState('ready');
      setMessage('Extra work could not be approved. Refresh and try again.');
    }
  };
  if (state === 'loading') return <p role="status">Loading extra-work approvals...</p>;
  if (state === 'error') return <p role="alert">Extra-work approvals could not be loaded.</p>;
  if (!requests.length) return null;
  return <section aria-label="Extra-work approvals">
    <h4>Extra work</h4>
    {requests.map(request => <article key={request.id}>
      {request.items.map(item => <p key={item.id}>{item.label} x {item.quantity}: ${(item.lineTotalCents / 100).toFixed(2)} · {item.totalDurationMinutes} minutes</p>)}
      {request.customRequest && <p>{request.customRequest.description}: ${(request.customRequest.priceCents / 100).toFixed(2)} · {request.customRequest.durationMinutes} minutes</p>}
      <p>Total change: ${(request.totalPriceCents / 100).toFixed(2)} · {request.totalDurationMinutes} minutes</p>
      {request.status === 'approval_ready'
        ? <button type="button" onClick={() => approve(request)} disabled={state === 'saving'}>I approve this extra work</button>
        : <p><strong>Approved</strong> · Scope version {request.approvedRevisionVersion}</p>}
    </article>)}
    {message && <p role="status">{message}</p>}
  </section>;
}

export function OwnerJobScopeAgreement({ bookingId }) {
  const [scope, setScope] = useState(null);
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    getOwnerJobScope(bookingId).then(value => { if (active) { setScope(value); setStatus('ready'); } })
      .catch(() => active && setStatus('error'));
    return () => { active = false; };
  }, [bookingId]);
  const send = async () => {
    setStatus('saving'); setMessage('');
    try {
      const value = await requestCustomerScopeApproval(bookingId);
      setScope(value); setStatus('ready'); setMessage('Customer approval requested.');
    } catch {
      setStatus('ready'); setMessage('Approval request could not be created. Try again.');
    }
  };
  if (status === 'loading') return <p aria-live="polite">Loading service agreement...</p>;
  if (status === 'error') return <p>Service agreement could not be loaded.</p>;
  return <section aria-label="Customer service agreement">
    <h3>Customer service agreement</h3>
    <p><strong>{LABELS[scope.state]}</strong> · Version {scope.version || 'not created'}{scope.approvedAt ? ` · Approved ${new Date(scope.approvedAt).toLocaleString()}` : ''}</p>
    <ScopeDetails scope={scope} />
    <button type="button" onClick={send} disabled={status === 'saving' || scope.state === 'awaiting_approval'}>{status === 'saving' ? 'Preparing...' : scope.state === 'approval_required' ? 'Request approval for revision' : 'Request customer approval'}</button>
    {message && <p role="status">{message}</p>}
  </section>;
}

export function CustomerJobScopeAgreements() {
  const [scopes, setScopes] = useState([]);
  const [state, setState] = useState('loading');
  const [message, setMessage] = useState('');
  const load = () => {
    setState('loading');
    return listCustomerJobScopes().then(value => { setScopes(value); setState('ready'); })
      .catch(() => setState('error'));
  };
  useEffect(() => { let active = true; listCustomerJobScopes().then(value => { if (active) { setScopes(value); setState('ready'); } }).catch(() => active && setState('error')); return () => { active = false; }; }, []);
  const approve = async scope => {
    setState('saving'); setMessage('');
    try {
      const updated = await approveCustomerJobScope(scope.snapshot.bookingId, scope.version);
      setScopes(current => current.map(item => item.snapshot.bookingId === updated.snapshot.bookingId && item.version === updated.version ? updated : item));
      setState('ready'); setMessage('Service agreement approved.');
    } catch {
      setState('ready'); setMessage('Service agreement could not be approved. Refresh and try again.');
    }
  };
  if (state === 'loading') return <p role="status">Loading service agreements...</p>;
  if (state === 'error') return <div role="alert">Service agreements could not be loaded. <button type="button" onClick={load}>Retry</button></div>;
  return <div>
    <h2>Service agreements</h2>
    {scopes.length === 0 ? <p>No service agreements are awaiting your review.</p> : scopes.map(scope => <section key={`${scope.snapshot.bookingId}-${scope.version}`} className="customer-scope-agreement">
      <h3>{scope.snapshot.serviceType || 'Scheduled service'}</h3>
      <p><strong>{LABELS[scope.state]}</strong> · Version {scope.version}</p>
      <ScopeDetails scope={scope} />
      {scope.state === 'awaiting_approval' && <button type="button" onClick={() => approve(scope)} disabled={state === 'saving'}>I approve this service scope</button>}
      {scope.state === 'approved' && <ExtraWorkApprovals bookingId={scope.snapshot.bookingId} onApproved={load} />}
    </section>)}
    {message && <p role="status">{message}</p>}
  </div>;
}
