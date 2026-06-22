// src/services/payrollExportService.js
/**
 * Payroll Export Service
 * Handles CSV export with hours, mileage, tips, commission
 */

import { collection, doc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { getTimeClockEntries, getTimeClockSummary } from './timeClockService';

/**
 * Generate payroll CSV for a date range
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<string>} CSV content
 */
export async function generatePayrollCSV(tenantId, startDate, endDate) {
  // Get all employees
  const employeesRef = collection(db, 'tenants', tenantId, 'employees');
  const employeesSnap = await getDocs(employeesRef);
  const employees = employeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Build CSV rows
  const rows = [];
  
  // Header row
  rows.push([
    'Employee ID',
    'Employee Name',
    'Email',
    'Phone',
    'Hourly Rate',
    'Total Hours',
    'Regular Hours',
    'Overtime Hours',
    'Gross Pay',
    'Total Miles',
    'Mileage Reimbursement',
    'Total Tips',
    'Total Commission',
    'Net Pay',
    'Pay Period Start',
    'Pay Period End'
  ]);
  
  // Data rows for each employee
  for (const employee of employees) {
    const summary = await getTimeClockSummary(tenantId, employee.id, startDate, endDate);
    const mileageData = await getMileageForEmployee(tenantId, employee.id, startDate, endDate);
    const tipsData = await getTipsForEmployee(tenantId, employee.id, startDate, endDate);
    const commissionData = await getCommissionForEmployee(tenantId, employee.id, startDate, endDate);
    
    const totalHours = summary.totalWorkHours || 0;
    const regularHours = Math.min(totalHours, 40);
    const overtimeHours = Math.max(0, totalHours - 40);
    
    const hourlyRate = employee.hourlyRate || 0;
    const grossPay = (regularHours * hourlyRate) + (overtimeHours * hourlyRate * 1.5);
    
    const mileageReimbursement = (mileageData.totalMiles || 0) * 0.67; // IRS standard mileage rate
    const netPay = grossPay + mileageReimbursement + (tipsData.totalTips || 0) + (commissionData.totalCommission || 0);
    
    rows.push([
      employee.id,
      employee.name || '',
      employee.email || '',
      employee.phone || '',
      hourlyRate.toFixed(2),
      totalHours.toFixed(2),
      regularHours.toFixed(2),
      overtimeHours.toFixed(2),
      grossPay.toFixed(2),
      (mileageData.totalMiles || 0).toFixed(2),
      mileageReimbursement.toFixed(2),
      (tipsData.totalTips || 0).toFixed(2),
      (commissionData.totalCommission || 0).toFixed(2),
      netPay.toFixed(2),
      startDate,
      endDate
    ]);
  }
  
  // Convert to CSV string
  return rows.map(row => row.join(',')).join('\n');
}

/**
 * Get mileage data for an employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {Promise<Object>} Mileage data
 */
async function getMileageForEmployee(tenantId, employeeId, startDate, endDate) {
  const mileageRef = collection(db, 'tenants', tenantId, 'mileage');
  const q = query(
    mileageRef,
    where('employeeId', '==', employeeId),
    orderBy('date', 'desc')
  );
  const snapshot = await getDocs(q);
  
  const entries = snapshot.docs
    .map(doc => doc.data())
    .filter(entry => entry.date >= startDate && entry.date <= endDate);
  
  const totalMiles = entries.reduce((sum, e) => sum + (e.miles || 0), 0);
  
  return { totalMiles, entries };
}

/**
 * Get tips data for an employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {Promise<Object>} Tips data
 */
async function getTipsForEmployee(tenantId, employeeId, startDate, endDate) {
  const tipsRef = collection(db, 'tenants', tenantId, 'tips');
  const q = query(
    tipsRef,
    where('employeeId', '==', employeeId),
    orderBy('date', 'desc')
  );
  const snapshot = await getDocs(q);
  
  const entries = snapshot.docs
    .map(doc => doc.data())
    .filter(entry => entry.date >= startDate && entry.date <= endDate);
  
  const totalTips = entries.reduce((sum, e) => sum + (e.amount || 0), 0);
  
  return { totalTips, entries };
}

/**
 * Get commission data for an employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {Promise<Object>} Commission data
 */
async function getCommissionForEmployee(tenantId, employeeId, startDate, endDate) {
  const commissionRef = collection(db, 'tenants', tenantId, 'commissions');
  const q = query(
    commissionRef,
    where('employeeId', '==', employeeId),
    orderBy('date', 'desc')
  );
  const snapshot = await getDocs(q);
  
  const entries = snapshot.docs
    .map(doc => doc.data())
    .filter(entry => entry.date >= startDate && entry.date <= endDate);
  
  const totalCommission = entries.reduce((sum, e) => sum + (e.amount || 0), 0);
  
  return { totalCommission, entries };
}

/**
 * Generate detailed payroll CSV with job breakdown
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<string>} CSV content
 */
export async function generateDetailedPayrollCSV(tenantId, startDate, endDate) {
  // Get all employees
  const employeesRef = collection(db, 'tenants', tenantId, 'employees');
  const employeesSnap = await getDocs(employeesRef);
  const employees = employeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Build CSV rows
  const rows = [];
  
  // Header row
  rows.push([
    'Employee Name',
    'Date',
    'Clock In Time',
    'Clock Out Time',
    'Job ID',
    'Customer Name',
    'Work Hours',
    'Break Minutes',
    'Hourly Rate',
    'Pay Amount',
    'Miles Driven',
    'Tips Received',
    'Commission Earned',
    'Notes'
  ]);
  
  // Data rows for each time clock entry
  for (const employee of employees) {
    const timeClockEntries = await getTimeClockEntries(tenantId, employee.id, startDate, endDate);
    
    for (const entry of timeClockEntries) {
      const workHours = (entry.totalWorkMinutes || 0) / 60;
      const breakMinutes = entry.totalBreakMinutes || 0;
      const hourlyRate = employee.hourlyRate || 0;
      const payAmount = workHours * hourlyRate;
      
      // Get job info if available
      let customerName = '';
      let jobId = '';
      if (entry.jobId) {
        const jobRef = doc(db, 'tenants', tenantId, 'bookings', entry.jobId);
        const jobSnap = await getDoc(jobRef);
        if (jobSnap.exists()) {
          const job = jobSnap.data();
          customerName = job.customerName || '';
          jobId = entry.jobId;
        }
      }
      
      // Get mileage for this date
      const mileageData = await getMileageForEmployee(tenantId, employee.id, entry.clockInTime.split('T')[0], entry.clockInTime.split('T')[0]);
      const milesDriven = mileageData.totalMiles || 0;
      
      rows.push([
        employee.name || '',
        entry.clockInTime.split('T')[0],
        entry.clockInTime.split('T')[1]?.substring(0, 5) || '',
        entry.clockOutTime ? entry.clockOutTime.split('T')[1]?.substring(0, 5) : '',
        jobId,
        customerName,
        workHours.toFixed(2),
        breakMinutes,
        hourlyRate.toFixed(2),
        payAmount.toFixed(2),
        milesDriven.toFixed(2),
        '', // Tips would need to be linked to specific jobs
        '', // Commission would need to be linked to specific jobs
        entry.notes || ''
      ]);
    }
  }
  
  // Convert to CSV string
  return rows.map(row => row.join(',')).join('\n');
}

/**
 * Generate payroll summary by employee
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} Summary data
 */
export async function generatePayrollSummary(tenantId, startDate, endDate) {
  const employeesRef = collection(db, 'tenants', tenantId, 'employees');
  const employeesSnap = await getDocs(employeesRef);
  const employees = employeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  const summary = [];
  
  for (const employee of employees) {
    const timeClockSummary = await getTimeClockSummary(tenantId, employee.id, startDate, endDate);
    const mileageData = await getMileageForEmployee(tenantId, employee.id, startDate, endDate);
    const tipsData = await getTipsForEmployee(tenantId, employee.id, startDate, endDate);
    const commissionData = await getCommissionForEmployee(tenantId, employee.id, startDate, endDate);
    
    const totalHours = timeClockSummary.totalWorkHours || 0;
    const regularHours = Math.min(totalHours, 40);
    const overtimeHours = Math.max(0, totalHours - 40);
    
    const hourlyRate = employee.hourlyRate || 0;
    const regularPay = regularHours * hourlyRate;
    const overtimePay = overtimeHours * hourlyRate * 1.5;
    const grossPay = regularPay + overtimePay;
    
    const mileageReimbursement = (mileageData.totalMiles || 0) * 0.67;
    const netPay = grossPay + mileageReimbursement + (tipsData.totalTips || 0) + (commissionData.totalCommission || 0);
    
    summary.push({
      employeeId: employee.id,
      employeeName: employee.name || '',
      email: employee.email || '',
      phone: employee.phone || '',
      hourlyRate,
      totalHours,
      regularHours,
      overtimeHours,
      regularPay,
      overtimePay,
      grossPay,
      totalMiles: mileageData.totalMiles || 0,
      mileageReimbursement,
      totalTips: tipsData.totalTips || 0,
      totalCommission: commissionData.totalCommission || 0,
      netPay,
      payPeriodStart: startDate,
      payPeriodEnd: endDate
    });
  }
  
  return summary;
}

/**
 * Download CSV file
 * @param {string} csvContent - CSV content
 * @param {string} filename - Filename
 */
export function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generate and download payroll CSV
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {boolean} detailed - Whether to generate detailed CSV
 */
export async function downloadPayrollCSV(tenantId, startDate, endDate, detailed = false) {
  const csvContent = detailed 
    ? await generateDetailedPayrollCSV(tenantId, startDate, endDate)
    : await generatePayrollCSV(tenantId, startDate, endDate);
  
  const filename = detailed
    ? `payroll-detailed-${startDate}-to-${endDate}.csv`
    : `payroll-summary-${startDate}-to-${endDate}.csv`;
  
  downloadCSV(csvContent, filename);
}

/**
 * Calculate payroll totals for all employees
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Totals
 */
export async function calculatePayrollTotals(tenantId, startDate, endDate) {
  const summary = await generatePayrollSummary(tenantId, startDate, endDate);
  
  const totals = {
    totalEmployees: summary.length,
    totalHours: 0,
    regularHours: 0,
    overtimeHours: 0,
    totalGrossPay: 0,
    totalMileage: 0,
    totalMileageReimbursement: 0,
    totalTips: 0,
    totalCommission: 0,
    totalNetPay: 0
  };
  
  for (const employee of summary) {
    totals.totalHours += employee.totalHours;
    totals.regularHours += employee.regularHours;
    totals.overtimeHours += employee.overtimeHours;
    totals.totalGrossPay += employee.grossPay;
    totals.totalMileage += employee.totalMiles;
    totals.totalMileageReimbursement += employee.mileageReimbursement;
    totals.totalTips += employee.totalTips;
    totals.totalCommission += employee.totalCommission;
    totals.totalNetPay += employee.netPay;
  }
  
  return totals;
}
