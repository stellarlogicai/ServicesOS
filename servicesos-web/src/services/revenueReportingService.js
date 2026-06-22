// src/services/revenueReportingService.js
/**
 * Revenue Reporting Service
 * Handles monthly, yearly, per customer, and per employee revenue reporting
 */

import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { getPaymentsAnalytics } from './paymentsTrackingService';

/**
 * Get monthly revenue for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>}
 */
export async function getMonthlyRevenue(tenantId, year, month) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
  
  const analytics = await getPaymentsAnalytics(tenantId, startDate, endDate);
  
  // Get invoices for the month
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  const invoicesSnap = await getDocs(invoicesRef);
  const invoices = invoicesSnap.docs
    .map(doc => doc.data())
    .filter(inv => inv.createdAt >= startDate && inv.createdAt <= endDate);
  
  const totalInvoiced = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const paidInvoices = invoices.filter(inv => inv.status === 'paid').length;
  const pendingInvoices = invoices.filter(inv => inv.status === 'pending' || inv.status === 'partial').length;
  
  return {
    year,
    month,
    startDate,
    endDate,
    totalRevenue: analytics.netRevenue,
    grossRevenue: analytics.totalRevenue,
    refunds: analytics.totalRefunds,
    totalInvoiced,
    paidInvoices,
    pendingInvoices,
    paymentCount: analytics.completedPayments,
    averagePaymentAmount: analytics.averagePaymentAmount,
    successRate: analytics.successRate
  };
}

/**
 * Get yearly revenue for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {number} year - Year
 * @returns {Promise<Object>}
 */
export async function getYearlyRevenue(tenantId, year) {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  
  const analytics = await getPaymentsAnalytics(tenantId, startDate, endDate);
  
  // Get monthly breakdown
  const monthlyData = [];
  for (let month = 1; month <= 12; month++) {
    const monthData = await getMonthlyRevenue(tenantId, year, month);
    monthlyData.push(monthData);
  }
  
  // Calculate growth vs previous year
  const previousYearAnalytics = await getPaymentsAnalytics(tenantId, `${year - 1}-01-01`, `${year - 1}-12-31`);
  const growthRate = previousYearAnalytics.netRevenue > 0 
    ? ((analytics.netRevenue - previousYearAnalytics.netRevenue) / previousYearAnalytics.netRevenue) * 100 
    : 0;
  
  return {
    year,
    startDate,
    endDate,
    totalRevenue: analytics.netRevenue,
    grossRevenue: analytics.totalRevenue,
    refunds: analytics.totalRefunds,
    paymentCount: analytics.completedPayments,
    averagePaymentAmount: analytics.averagePaymentAmount,
    successRate: analytics.successRate,
    monthlyData,
    growthRate: Math.round(growthRate * 100) / 100
  };
}

/**
 * Get revenue per customer
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>}
 */
export async function getRevenuePerCustomer(tenantId, startDate, endDate) {
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  const customersSnap = await getDocs(customersRef);
  const customers = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  const customerRevenue = [];
  
  for (const customer of customers) {
    const paymentsRef = collection(db, 'tenants', tenantId, 'payments');
    const q = query(
      paymentsRef,
      where('customerId', '==', customer.id),
      where('status', '==', 'completed'),
      orderBy('createdAt', 'desc')
    );
    const paymentsSnap = await getDocs(q);
    const payments = paymentsSnap.docs
      .map(doc => doc.data())
      .filter(p => p.createdAt >= startDate && p.createdAt <= endDate);
    
    const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const paymentCount = payments.length;
    
    if (paymentCount > 0) {
      customerRevenue.push({
        customerId: customer.id,
        customerName: customer.name || '',
        customerEmail: customer.email || '',
        customerPhone: customer.phone || '',
        totalRevenue,
        paymentCount,
        averagePayment: totalRevenue / paymentCount,
        firstPaymentDate: payments[payments.length - 1]?.createdAt,
        lastPaymentDate: payments[0]?.createdAt
      });
    }
  }
  
  // Sort by revenue descending
  customerRevenue.sort((a, b) => b.totalRevenue - a.totalRevenue);
  
  return customerRevenue;
}

/**
 * Get revenue per employee
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>}
 */
export async function getRevenuePerEmployee(tenantId, startDate, endDate) {
  const employeesRef = collection(db, 'tenants', tenantId, 'employees');
  const employeesSnap = await getDocs(employeesRef);
  const employees = employeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  const employeeRevenue = [];
  
  for (const employee of employees) {
    // Get jobs assigned to this employee
    const bookingsRef = collection(db, 'tenants', tenantId, 'bookings');
    const bookingsSnap = await getDocs(bookingsRef);
    const bookings = bookingsSnap.docs
      .map(doc => doc.data())
      .filter(b => 
        b.assignedEmployees && 
        b.assignedEmployees.includes(employee.id) &&
        b.date >= startDate &&
        b.date <= endDate
      );
    
    // Get payments for these bookings
    let totalRevenue = 0;
    let jobCount = bookings.length;
    
    for (const booking of bookings) {
      if (booking.invoiceId) {
        const paymentsRef = collection(db, 'tenants', tenantId, 'payments');
        const q = query(
          paymentsRef,
          where('invoiceId', '==', booking.invoiceId),
          where('status', '==', 'completed')
        );
        const paymentsSnap = await getDocs(q);
        const payments = paymentsSnap.docs.map(doc => doc.data());
        totalRevenue += payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      }
    }
    
    if (jobCount > 0) {
      employeeRevenue.push({
        employeeId: employee.id,
        employeeName: employee.name || '',
        employeeEmail: employee.email || '',
        totalRevenue,
        jobCount,
        averageRevenuePerJob: totalRevenue / jobCount,
        hourlyRate: employee.hourlyRate || 0
      });
    }
  }
  
  // Sort by revenue descending
  employeeRevenue.sort((a, b) => b.totalRevenue - a.totalRevenue);
  
  return employeeRevenue;
}

/**
 * Get revenue trends over time
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {string} granularity - 'daily', 'weekly', or 'monthly'
 * @returns {Promise<Array>}
 */
export async function getRevenueTrends(tenantId, startDate, endDate, granularity = 'monthly') {
  const trends = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (granularity === 'monthly') {
    let current = new Date(start);
    while (current <= end) {
      const year = current.getFullYear();
      const month = current.getMonth() + 1;
      const monthData = await getMonthlyRevenue(tenantId, year, month);
      trends.push(monthData);
      current.setMonth(current.getMonth() + 1);
    }
  } else if (granularity === 'weekly') {
    // Weekly aggregation
    let current = new Date(start);
    while (current <= end) {
      const weekStart = new Date(current);
      const weekEnd = new Date(current);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      const weekStartDate = weekStart.toISOString().split('T')[0];
      const weekEndDate = weekEnd.toISOString().split('T')[0];
      
      const analytics = await getPaymentsAnalytics(tenantId, weekStartDate, weekEndDate);
      
      trends.push({
        period: 'week',
        startDate: weekStartDate,
        endDate: weekEndDate,
        totalRevenue: analytics.netRevenue,
        paymentCount: analytics.completedPayments
      });
      
      current.setDate(current.getDate() + 7);
    }
  } else {
    // Daily aggregation
    let current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      const analytics = await getPaymentsAnalytics(tenantId, dateStr, dateStr);
      
      trends.push({
        period: 'day',
        date: dateStr,
        totalRevenue: analytics.netRevenue,
        paymentCount: analytics.completedPayments
      });
      
      current.setDate(current.getDate() + 1);
    }
  }
  
  return trends;
}

/**
 * Get revenue summary dashboard
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>}
 */
export async function getRevenueDashboard(tenantId) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  // Current month revenue
  const currentMonthRevenue = await getMonthlyRevenue(tenantId, currentYear, currentMonth);
  
  // Previous month revenue
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const prevMonthRevenue = await getMonthlyRevenue(tenantId, prevMonthYear, prevMonth);
  
  // Year to date revenue
  const ytdStartDate = `${currentYear}-01-01`;
  const ytdEndDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`;
  const ytdAnalytics = await getPaymentsAnalytics(tenantId, ytdStartDate, ytdEndDate);
  
  // Top customers
  const topCustomers = await getRevenuePerCustomer(
    tenantId,
    ytdStartDate,
    ytdEndDate
  );
  
  // Top employees
  const topEmployees = await getRevenuePerEmployee(
    tenantId,
    ytdStartDate,
    ytdEndDate
  );
  
  // Calculate month-over-month growth
  const momGrowth = prevMonthRevenue.totalRevenue > 0
    ? ((currentMonthRevenue.totalRevenue - prevMonthRevenue.totalRevenue) / prevMonthRevenue.totalRevenue) * 100
    : 0;
  
  return {
    currentMonth: currentMonthRevenue,
    previousMonth: prevMonthRevenue,
    monthOverMonthGrowth: Math.round(momGrowth * 100) / 100,
    yearToDate: {
      totalRevenue: ytdAnalytics.netRevenue,
      paymentCount: ytdAnalytics.completedPayments,
      startDate: ytdStartDate,
      endDate: ytdEndDate
    },
    topCustomers: topCustomers.slice(0, 10),
    topEmployees: topEmployees.slice(0, 10)
  };
}

/**
 * Export revenue report as CSV
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {string} reportType - 'customers', 'employees', or 'summary'
 * @returns {Promise<string>} CSV content
 */
export async function exportRevenueReport(tenantId, startDate, endDate, reportType = 'summary') {
  let csv;
  
  if (reportType === 'customers') {
    const data = await getRevenuePerCustomer(tenantId, startDate, endDate);
    csv = 'Customer Name,Email,Phone,Total Revenue,Payment Count,Average Payment,First Payment,Last Payment\n';
    for (const row of data) {
      csv += `"${row.customerName}","${row.customerEmail}","${row.customerPhone}",${row.totalRevenue},${row.paymentCount},${row.averagePayment},${row.firstPaymentDate},${row.lastPaymentDate}\n`;
    }
  } else if (reportType === 'employees') {
    const data = await getRevenuePerEmployee(tenantId, startDate, endDate);
    csv = 'Employee Name,Email,Total Revenue,Job Count,Average Revenue Per Job,Hourly Rate\n';
    for (const row of data) {
      csv += `"${row.employeeName}","${row.employeeEmail}",${row.totalRevenue},${row.jobCount},${row.averageRevenuePerJob},${row.hourlyRate}\n`;
    }
  } else {
    // Summary report
    const analytics = await getPaymentsAnalytics(tenantId, startDate, endDate);
    csv = 'Metric,Value\n';
    csv += `Total Revenue,${analytics.netRevenue}\n`;
    csv += `Gross Revenue,${analytics.totalRevenue}\n`;
    csv += `Refunds,${analytics.totalRefunds}\n`;
    csv += `Completed Payments,${analytics.completedPayments}\n`;
    csv += `Pending Payments,${analytics.pendingPayments}\n`;
    csv += `Failed Payments,${analytics.failedPayments}\n`;
    csv += `Average Payment Amount,${analytics.averagePaymentAmount}\n`;
    csv += `Success Rate,${analytics.successRate}%\n`;
  }
  
  return csv;
}
