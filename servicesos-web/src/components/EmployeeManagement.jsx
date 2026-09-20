import { useCallback, useEffect, useState } from 'react';
import { listCanonicalEmployees, provisionEmployee, resendEmployeeActivation } from '../services/employeeTeamService';

const EMPTY_FORM = Object.freeze({ name: '', email: '', phone: '' });

export default function EmployeeManagement() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [message, setMessage] = useState({ type: '', text: '' });

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listCanonicalEmployees();
      setEmployees(result.employees);
    } catch {
      setEmployees([]);
      setMessage({ type: 'error', text: 'Employees could not be loaded. Try again.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) loadEmployees(); });
    return () => { active = false; };
  }, [loadEmployees]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setMessage({ type: 'error', text: 'Name and email are required.' });
      return;
    }
    setSubmitting(true);
    try {
      const result = await provisionEmployee(form);
      setMessage({ type: 'success', text: result.reused ? 'Employee already provisioned.' : 'Employee added and activation email sent.' });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await loadEmployees();
    } catch {
      setMessage({ type: 'error', text: 'Employee could not be added. Check the details and try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend(employee) {
    setSubmitting(true);
    try {
      await resendEmployeeActivation(employee.email);
      setMessage({ type: 'success', text: 'Activation email sent.' });
      await loadEmployees();
    } catch {
      setMessage({ type: 'error', text: 'Activation email could not be sent. Try again later.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div><h1 style={{ fontSize: 30, margin: '0 0 6px', color: '#0f172a' }}>Employees</h1><p style={{ margin: 0, color: '#64748b' }}>Manage employee access to ServicesOS.</p></div>
        <button type="button" onClick={() => setShowForm(true)} disabled={submitting}>Add employee</button>
      </div>
      {message.text && <div role="status" style={{ marginBottom: 16, color: message.type === 'error' ? '#991b1b' : '#166534' }}>{message.text}</div>}
      {loading ? <p>Loading employees...</p> : employees.length === 0 ? <div style={{ padding: 28, border: '1px solid #e2e8f0', background: '#fff' }}>No employees yet.</div> : (
        <div style={{ border: '1px solid #e2e8f0', background: '#fff' }}>{employees.map(employee => (
          <div key={employee.uid} style={{ padding: 16, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
            <div><strong>{employee.name}</strong><div style={{ color: '#64748b', marginTop: 4 }}>{employee.email}{employee.phone ? ` · ${employee.phone}` : ''}</div><div style={{ color: '#64748b', marginTop: 4 }}>Status: {employee.status} · Activation: {employee.activationStatus}</div></div>
            {employee.activationStatus !== 'authenticated' && <button type="button" onClick={() => handleResend(employee)} disabled={submitting}>Resend activation</button>}
          </div>
        ))}</div>
      )}
      {showForm && <div role="dialog" aria-modal="true" aria-labelledby="employee-form-title" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', padding: 20 }}>
        <form onSubmit={handleSubmit} style={{ width: 'min(460px, 100%)', padding: 24, background: '#fff' }}>
          <h2 id="employee-form-title" style={{ marginTop: 0 }}>Add employee</h2>
          <label style={{ display: 'block', marginBottom: 14 }}>Name<input aria-label="Name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} maxLength={100} required style={{ display: 'block', width: '100%', marginTop: 6 }} /></label>
          <label style={{ display: 'block', marginBottom: 14 }}>Email<input aria-label="Email" type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} maxLength={320} required style={{ display: 'block', width: '100%', marginTop: 6 }} /></label>
          <label style={{ display: 'block', marginBottom: 20 }}>Phone<input aria-label="Phone" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} maxLength={40} style={{ display: 'block', width: '100%', marginTop: 6 }} /></label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}><button type="button" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }} disabled={submitting}>Cancel</button><button type="submit" disabled={submitting}>{submitting ? 'Adding...' : 'Add employee'}</button></div>
        </form>
      </div>}
    </div>
  );
}
