// src/services/expenseTrackingService.js
/**
 * Expense Tracking Service
 * Handles supplies, payroll, fuel, equipment, insurance expenses
 */

import { collection, doc, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// Expense category constants
export const EXPENSE_CATEGORY = {
  SUPPLIES: 'supplies',
  PAYROLL: 'payroll',
  FUEL: 'fuel',
  EQUIPMENT: 'equipment',
  INSURANCE: 'insurance',
  MARKETING: 'marketing',
  UTILITIES: 'utilities',
  RENT: 'rent',
  SOFTWARE: 'software',
  OTHER: 'other'
};

// Expense status constants
export const EXPENSE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  PAID: 'paid',
  REJECTED: 'rejected'
};

/**
 * Create an expense record
 * @param {string} tenantId - Tenant ID
 * @param {object} expenseData - Expense data
 * @returns {Promise<DocumentReference>}
 */
export async function createExpense(tenantId, expenseData) {
  const expensesRef = collection(db, 'tenants', tenantId, 'expenses');
  
  const data = {
    category: expenseData.category || EXPENSE_CATEGORY.OTHER,
    amount: expenseData.amount || 0,
    currency: expenseData.currency || 'USD',
    
    // Description
    description: expenseData.description || '',
    notes: expenseData.notes || '',
    
    // Vendor/Provider
    vendor: expenseData.vendor || '',
    vendorId: expenseData.vendorId || null,
    
    // Related entities
    jobId: expenseData.jobId || null,
    employeeId: expenseData.employeeId || null,
    
    // Receipt
    receiptUrl: expenseData.receiptUrl || null,
    receiptDate: expenseData.receiptDate || null,
    
    // Dates
    expenseDate: expenseData.expenseDate || new Date().toISOString().split('T')[0],
    dueDate: expenseData.dueDate || null,
    paidDate: null,
    
    // Status
    status: expenseData.status || EXPENSE_STATUS.PENDING,
    
    // Payment method
    paymentMethod: expenseData.paymentMethod || '',
    
    // Reimbursement (for employee expenses)
    isReimbursable: expenseData.isReimbursable || false,
    reimbursedAmount: 0,
    
    // Timestamps
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  return await addDoc(expensesRef, data);
}

/**
 * Update expense
 * @param {string} tenantId - Tenant ID
 * @param {string} expenseId - Expense ID
 * @param {object} updates - Updates to apply
 * @returns {Promise<void>}
 */
export async function updateExpense(tenantId, expenseId, updates) {
  const expenseRef = doc(db, 'tenants', tenantId, 'expenses', expenseId);
  await updateDoc(expenseRef, {
    ...updates,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Update expense status
 * @param {string} tenantId - Tenant ID
 * @param {string} expenseId - Expense ID
 * @param {string} status - New status
 * @returns {Promise<void>}
 */
export async function updateExpenseStatus(tenantId, expenseId, status) {
  const expenseRef = doc(db, 'tenants', tenantId, 'expenses', expenseId);
  const updates = {
    status,
    updatedAt: new Date().toISOString()
  };
  
  if (status === EXPENSE_STATUS.PAID) {
    updates.paidDate = new Date().toISOString();
  }
  
  await updateDoc(expenseRef, updates);
}

/**
 * Get expense by ID
 * @param {string} tenantId - Tenant ID
 * @param {string} expenseId - Expense ID
 * @returns {Promise<Object|null>}
 */
export async function getExpense(tenantId, expenseId) {
  const expenseRef = doc(db, 'tenants', tenantId, 'expenses', expenseId);
  const expenseSnap = await getDoc(expenseRef);
  
  if (!expenseSnap.exists()) {
    return null;
  }
  
  return { id: expenseSnap.id, ...expenseSnap.data() };
}

/**
 * Get expenses for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD, optional)
 * @param {string} endDate - End date (YYYY-MM-DD, optional)
 * @param {string} category - Category filter (optional)
 * @returns {Promise<Array>}
 */
export async function getExpenses(tenantId, startDate = null, endDate = null, category = null) {
  const expensesRef = collection(db, 'tenants', tenantId, 'expenses');
  const q = query(expensesRef, orderBy('expenseDate', 'desc'));
  const snapshot = await getDocs(q);
  
  let expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  if (startDate || endDate) {
    expenses = expenses.filter(expense => {
      if (startDate && expense.expenseDate < startDate) return false;
      if (endDate && expense.expenseDate > endDate) return false;
      return true;
    });
  }
  
  if (category) {
    expenses = expenses.filter(expense => expense.category === category);
  }
  
  return expenses;
}

/**
 * Get expenses by category
 * @param {string} tenantId - Tenant ID
 * @param {string} category - Category
 * @param {string} startDate - Start date (YYYY-MM-DD, optional)
 * @param {string} endDate - End date (YYYY-MM-DD, optional)
 * @returns {Promise<Array>}
 */
export async function getExpensesByCategory(tenantId, category, startDate = null, endDate = null) {
  return await getExpenses(tenantId, startDate, endDate, category);
}

/**
 * Get expenses for an employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @returns {Promise<Array>}
 */
export async function getEmployeeExpenses(tenantId, employeeId) {
  const expensesRef = collection(db, 'tenants', tenantId, 'expenses');
  const q = query(
    expensesRef,
    where('employeeId', '==', employeeId),
    orderBy('expenseDate', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get expenses for a job
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Array>}
 */
export async function getJobExpenses(tenantId, jobId) {
  const expensesRef = collection(db, 'tenants', tenantId, 'expenses');
  const q = query(
    expensesRef,
    where('jobId', '==', jobId),
    orderBy('expenseDate', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get expense summary by category
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
export async function getExpenseSummaryByCategory(tenantId, startDate, endDate) {
  const expenses = await getExpenses(tenantId, startDate, endDate);
  
  const summary = {};
  
  for (const expense of expenses) {
    if (!summary[expense.category]) {
      summary[expense.category] = {
        category: expense.category,
        totalAmount: 0,
        count: 0,
        paidAmount: 0,
        pendingAmount: 0
      };
    }
    
    summary[expense.category].totalAmount += expense.amount || 0;
    summary[expense.category].count += 1;
    
    if (expense.status === EXPENSE_STATUS.PAID) {
      summary[expense.category].paidAmount += expense.amount || 0;
    } else {
      summary[expense.category].pendingAmount += expense.amount || 0;
    }
  }
  
  return Object.values(summary).sort((a, b) => b.totalAmount - a.totalAmount);
}

/**
 * Get expense analytics for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
export async function getExpenseAnalytics(tenantId, startDate, endDate) {
  const expenses = await getExpenses(tenantId, startDate, endDate);
  
  let totalExpenses = 0;
  let paidExpenses = 0;
  let pendingExpenses = 0;
  let rejectedExpenses = 0;
  
  const categoryBreakdown = {};
  
  for (const expense of expenses) {
    totalExpenses += expense.amount || 0;
    
    if (expense.status === EXPENSE_STATUS.PAID) {
      paidExpenses += expense.amount || 0;
    } else if (expense.status === EXPENSE_STATUS.PENDING || expense.status === EXPENSE_STATUS.APPROVED) {
      pendingExpenses += expense.amount || 0;
    } else if (expense.status === EXPENSE_STATUS.REJECTED) {
      rejectedExpenses += expense.amount || 0;
    }
    
    if (!categoryBreakdown[expense.category]) {
      categoryBreakdown[expense.category] = 0;
    }
    categoryBreakdown[expense.category] += expense.amount || 0;
  }
  
  return {
    totalExpenses,
    paidExpenses,
    pendingExpenses,
    rejectedExpenses,
    totalExpenseCount: expenses.length,
    averageExpenseAmount: expenses.length > 0 ? totalExpenses / expenses.length : 0,
    categoryBreakdown
  };
}

/**
 * Get monthly expense trends
 * @param {string} tenantId - Tenant ID
 * @param {number} year - Year
 * @returns {Promise<Array>}
 */
export async function getMonthlyExpenseTrends(tenantId, year) {
  const trends = [];
  
  for (let month = 1; month <= 12; month++) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    
    const analytics = await getExpenseAnalytics(tenantId, startDate, endDate);
    
    trends.push({
      year,
      month,
      startDate,
      endDate,
      totalExpenses: analytics.totalExpenses,
      paidExpenses: analytics.paidExpenses,
      pendingExpenses: analytics.pendingExpenses,
      expenseCount: analytics.totalExpenseCount
    });
  }
  
  return trends;
}

/**
 * Process employee expense reimbursement
 * @param {string} tenantId - Tenant ID
 * @param {string} expenseId - Expense ID
 * @param {number} reimbursementAmount - Amount to reimburse
 * @returns {Promise<void>}
 */
export async function processReimbursement(tenantId, expenseId, reimbursementAmount) {
  const expenseRef = doc(db, 'tenants', tenantId, 'expenses', expenseId);
  const expenseSnap = await getDoc(expenseRef);
  
  if (!expenseSnap.exists()) {
    throw new Error('Expense not found');
  }
  
  const expense = expenseSnap.data();
  
  if (!expense.isReimbursable) {
    throw new Error('Expense is not reimbursable');
  }
  
  if (reimbursementAmount > expense.amount) {
    throw new Error('Reimbursement amount exceeds expense amount');
  }
  
  await updateDoc(expenseRef, {
    reimbursedAmount: reimbursementAmount,
    status: EXPENSE_STATUS.PAID,
    paidDate: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

/**
 * Subscribe to expense changes
 * @param {string} tenantId - Tenant ID
 * @param {function} callback - Callback function
 * @returns {function} Unsubscribe function
 */
export function subscribeToExpenses(tenantId, callback) {
  const expensesRef = collection(db, 'tenants', tenantId, 'expenses');
  const q = query(expensesRef, orderBy('expenseDate', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const expenses = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(expenses);
  });
}

/**
 * Get profit margin (revenue - expenses)
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
export async function getProfitMargin(tenantId, startDate, endDate) {
  const { getPaymentsAnalytics } = await import('./paymentsTrackingService');
  
  const revenueAnalytics = await getPaymentsAnalytics(tenantId, startDate, endDate);
  const expenseAnalytics = await getExpenseAnalytics(tenantId, startDate, endDate);
  
  const totalRevenue = revenueAnalytics.netRevenue;
  const totalExpenses = expenseAnalytics.paidExpenses;
  const profit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
  
  return {
    totalRevenue,
    totalExpenses,
    profit,
    profitMargin: Math.round(profitMargin * 100) / 100
  };
}

/**
 * Export expenses as CSV
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<string>} CSV content
 */
export async function exportExpensesCSV(tenantId, startDate, endDate) {
  const expenses = await getExpenses(tenantId, startDate, endDate);
  
  let csv = 'Date,Category,Description,Vendor,Amount,Status,Payment Method,Job ID,Employee ID\n';
  
  for (const expense of expenses) {
    csv += `"${expense.expenseDate}","${expense.category}","${expense.description}","${expense.vendor}",${expense.amount},"${expense.status}","${expense.paymentMethod}","${expense.jobId || ''}","${expense.employeeId || ''}"\n`;
  }
  
  return csv;
}
