import { useCallback, useEffect, useState } from 'react';
import { getJobsByDate, createJob, updateJobStatus } from '../core/scheduling/schedulingService';
import { listCanonicalEmployees } from '../services/employeeTeamService';
import EmployeeManagement from './EmployeeManagement';

export default function StaffScheduling({ tenantId }) {
  const [activeTab, setActiveTab] = useState('shifts');
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [shiftForm, setShiftForm] = useState({ employeeId: '', date: selectedDate, startTime: '09:00', endTime: '12:00', address: '', jobId: '' });

  const loadEmployees = useCallback(async () => {
    try { setEmployees((await listCanonicalEmployees()).employees); }
    catch { setEmployees([]); setMessage({ type: 'error', text: 'Employees could not be loaded.' }); }
  }, []);
  const loadShifts = useCallback(async () => {
    if (!tenantId) return;
    const result = await getJobsByDate(tenantId, selectedDate);
    if (result.success) setShifts(result.data);
    else setMessage({ type: 'error', text: 'Scheduled jobs could not be loaded.' });
  }, [tenantId, selectedDate]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) { loadEmployees(); loadShifts(); } });
    return () => { active = false; };
  }, [loadEmployees, loadShifts]);
  const showMessage = (type, text) => setMessage({ type, text });

  async function handleCreateShift() {
    if (!shiftForm.employeeId || !shiftForm.address.trim()) { showMessage('error', 'Employee and address are required'); return; }
    try {
      const result = await createJob(tenantId, { ...shiftForm, employeeId: shiftForm.employeeId, status: 'scheduled' });
      if (!result.success) throw new Error();
      setShiftForm(current => ({ ...current, jobId: '' }));
      await loadShifts();
      showMessage('success', 'Shift created successfully');
    } catch { showMessage('error', 'Failed to create shift'); }
  }

  async function changeStatus(shiftId, status) {
    try { const result = await updateJobStatus(tenantId, shiftId, status); if (!result.success) throw new Error(); await loadShifts(); showMessage('success', status === 'completed' ? 'Checked out successfully' : 'Checked in successfully'); }
    catch { showMessage('error', 'Job status could not be updated'); }
  }

  return <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
    <div style={{ marginBottom: 24 }}><h1 style={{ fontSize: 32, margin: '0 0 8px', color: '#0f172a' }}>Staff Scheduling</h1><p style={{ margin: 0, color: '#64748b' }}>Schedule employees to jobs</p></div>
    {message.text && <div role="status" style={{ marginBottom: 18, color: message.type === 'error' ? '#991b1b' : '#166534' }}>{message.text}</div>}
    <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}><button type="button" onClick={() => setActiveTab('shifts')}>Shifts</button><button type="button" onClick={() => setActiveTab('employees')}>Employees</button></div>
    {activeTab === 'employees' ? <EmployeeManagement /> : <>
      <label style={{ display: 'block', marginBottom: 20 }}>Select date<input aria-label="Select date" type="date" value={selectedDate} onChange={event => { setSelectedDate(event.target.value); setShiftForm(current => ({ ...current, date: event.target.value })); }} style={{ display: 'block', marginTop: 6 }} /></label>
      <section style={{ background: '#fff', padding: 20, border: '1px solid #e2e8f0', marginBottom: 22 }}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Schedule New Job</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <select aria-label="Employee" value={shiftForm.employeeId} onChange={event => setShiftForm({ ...shiftForm, employeeId: event.target.value })}><option value="">Select Employee</option>{employees.map(employee => <option key={employee.uid} value={employee.uid}>{employee.name}</option>)}</select>
          <input aria-label="Start time" type="time" value={shiftForm.startTime} onChange={event => setShiftForm({ ...shiftForm, startTime: event.target.value })} />
          <input aria-label="End time" type="time" value={shiftForm.endTime} onChange={event => setShiftForm({ ...shiftForm, endTime: event.target.value })} />
          <input aria-label="Job address" placeholder="Job Address" value={shiftForm.address} onChange={event => setShiftForm({ ...shiftForm, address: event.target.value })} />
          <input aria-label="Job ID" placeholder="Job ID (optional)" value={shiftForm.jobId} onChange={event => setShiftForm({ ...shiftForm, jobId: event.target.value })} />
          <button type="button" onClick={handleCreateShift}>Schedule Job</button>
        </div>
      </section>
      <section style={{ background: '#fff', padding: 20, border: '1px solid #e2e8f0' }}><h2 style={{ fontSize: 18, marginTop: 0 }}>Scheduled Jobs for {selectedDate} ({shifts.length})</h2>{shifts.length === 0 ? <p>No jobs scheduled for this date</p> : shifts.map(shift => { const employee=employees.find(item=>item.uid===shift.employeeId||item.uid===shift.assignedEmployeeAuthUid); return <div key={shift.id} style={{ padding: 14, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}><div><strong>{employee?.name || 'Unknown Employee'}</strong><div>{shift.startTime} - {shift.endTime} · {shift.address}</div><div>Status: {shift.status}</div></div><div>{shift.status==='scheduled'&&<button type="button" onClick={()=>changeStatus(shift.id,'in_progress')}>Check In</button>}{shift.status==='in_progress'&&<button type="button" onClick={()=>changeStatus(shift.id,'completed')}>Check Out</button>}</div></div>; })}</section>
    </>}
  </div>;
}
