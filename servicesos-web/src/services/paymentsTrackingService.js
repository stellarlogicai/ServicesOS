// src/services/paymentsTrackingService.js
/**
 * Payments Tracking Service
 * Handles deposit paid, balance paid, refunded, outstanding payments
 */

import { collection, doc, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// Payment status constants
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded'
};

// Payment type constants
export const PAYMENT_TYPE = {
  DEPOSIT: 'deposit',
  BALANCE: 'balance',
  FULL_PAYMENT: 'full_payment',
  REFUND: 'refund'
};

/**
 * Create a payment record
 * @param {string} tenantId - Tenant ID
 * @param {object} paymentData - Payment data
 * @returns {Promise<DocumentReference>}
 */
export async function createPayment(tenantId, paymentData) {
  const paymentsRef = collection(db, 'tenants', tenantId, 'payments');
  
  const data = {
    customerId: paymentData.customerId,
    invoiceId: paymentData.invoiceId || null,
    jobId: paymentData.jobId || null,
    
    // Payment details
    type: paymentData.type || PAYMENT_TYPE.FULL_PAYMENT,
    amount: paymentData.amount || 0,
    currency: paymentData.currency || 'USD',
    
    // Stripe details
    stripePaymentIntentId: paymentData.stripePaymentIntentId || null,
    stripePaymentMethodId: paymentData.stripePaymentMethodId || null,
    
    // Status
    status: paymentData.status || PAYMENT_STATUS.PENDING,
    
    // Refund tracking
    refundedAmount: 0,
    
    // Metadata
    description: paymentData.description || '',
    notes: paymentData.notes || '',
    
    // Timestamps
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null
  };
  
  return await addDoc(paymentsRef, data);
}

/**
 * Update payment status
 * @param {string} tenantId - Tenant ID
 * @param {string} paymentId - Payment ID
 * @param {string} status - New status
 * @param {object} metadata - Additional metadata
 * @returns {Promise<void>}
 */
export async function updatePaymentStatus(tenantId, paymentId, status, metadata = {}) {
  const paymentRef = doc(db, 'tenants', tenantId, 'payments', paymentId);
  
  const updates = {
    status,
    updatedAt: new Date().toISOString()
  };
  
  if (status === PAYMENT_STATUS.COMPLETED) {
    updates.completedAt = new Date().toISOString();
  }
  
  if (metadata) {
    Object.assign(updates, metadata);
  }
  
  await updateDoc(paymentRef, updates);
}

/**
 * Process refund
 * @param {string} tenantId - Tenant ID
 * @param {string} paymentId - Payment ID
 * @param {number} refundAmount - Amount to refund
 * @param {string} reason - Refund reason
 * @returns {Promise<void>}
 */
export async function processRefund(tenantId, paymentId, refundAmount, reason = '') {
  const paymentRef = doc(db, 'tenants', tenantId, 'payments', paymentId);
  const paymentSnap = await getDoc(paymentRef);
  
  if (!paymentSnap.exists()) {
    throw new Error('Payment not found');
  }
  
  const payment = paymentSnap.data();
  
  if (payment.status !== PAYMENT_STATUS.COMPLETED) {
    throw new Error('Can only refund completed payments');
  }
  
  if (refundAmount > payment.amount - payment.refundedAmount) {
    throw new Error('Refund amount exceeds available refundable amount');
  }
  
  const newRefundedAmount = payment.refundedAmount + refundAmount;
  const newStatus = newRefundedAmount >= payment.amount ? PAYMENT_STATUS.REFUNDED : PAYMENT_STATUS.PARTIALLY_REFUNDED;
  
  await updateDoc(paymentRef, {
    refundedAmount: newRefundedAmount,
    status: newStatus,
    refundReason: reason || payment.refundReason,
    refundedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  
  // Create refund record
  const refundsRef = collection(db, 'tenants', tenantId, 'refunds');
  await addDoc(refundsRef, {
    paymentId,
    originalPaymentId: paymentId,
    amount: refundAmount,
    reason,
    createdAt: new Date().toISOString()
  });
}

/**
 * Get payment by ID
 * @param {string} tenantId - Tenant ID
 * @param {string} paymentId - Payment ID
 * @returns {Promise<Object|null>}
 */
export async function getPayment(tenantId, paymentId) {
  const paymentRef = doc(db, 'tenants', tenantId, 'payments', paymentId);
  const paymentSnap = await getDoc(paymentRef);
  
  if (!paymentSnap.exists()) {
    return null;
  }
  
  return { id: paymentSnap.id, ...paymentSnap.data() };
}

/**
 * Get payments for a customer
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Array>}
 */
export async function getCustomerPayments(tenantId, customerId) {
  const paymentsRef = collection(db, 'tenants', tenantId, 'payments');
  const q = query(
    paymentsRef,
    where('customerId', '==', customerId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get payments for an invoice
 * @param {string} tenantId - Tenant ID
 * @param {string} invoiceId - Invoice ID
 * @returns {Promise<Array>}
 */
export async function getInvoicePayments(tenantId, invoiceId) {
  const paymentsRef = collection(db, 'tenants', tenantId, 'payments');
  const q = query(
    paymentsRef,
    where('invoiceId', '==', invoiceId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get payment summary for an invoice
 * @param {string} tenantId - Tenant ID
 * @param {string} invoiceId - Invoice ID
 * @param {number} totalAmount - Total invoice amount
 * @returns {Promise<Object>}
 */
export async function getInvoicePaymentSummary(tenantId, invoiceId, totalAmount) {
  const payments = await getInvoicePayments(tenantId, invoiceId);
  
  let totalPaid = 0;
  let totalRefunded = 0;
  let depositPaid = 0;
  let balancePaid = 0;
  
  for (const payment of payments) {
    if (payment.status === PAYMENT_STATUS.COMPLETED) {
      totalPaid += payment.amount;
      
      if (payment.type === PAYMENT_TYPE.DEPOSIT) {
        depositPaid += payment.amount;
      } else if (payment.type === PAYMENT_TYPE.BALANCE || payment.type === PAYMENT_TYPE.FULL_PAYMENT) {
        balancePaid += payment.amount;
      }
    }
    
    totalRefunded += payment.refundedAmount || 0;
  }
  
  const amountDue = Math.max(0, totalAmount - totalPaid + totalRefunded);
  const outstandingAmount = amountDue > 0 ? amountDue : 0;
  
  return {
    totalPaid,
    totalRefunded,
    depositPaid,
    balancePaid,
    amountDue,
    outstandingAmount,
    isFullyPaid: outstandingAmount === 0,
    paymentCount: payments.length
  };
}

/**
 * Get all payments for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD, optional)
 * @param {string} endDate - End date (YYYY-MM-DD, optional)
 * @returns {Promise<Array>}
 */
export async function getTenantPayments(tenantId, startDate = null, endDate = null) {
  const paymentsRef = collection(db, 'tenants', tenantId, 'payments');
  const q = query(paymentsRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  
  let payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  if (startDate || endDate) {
    payments = payments.filter(payment => {
      if (startDate && payment.createdAt < startDate) return false;
      if (endDate && payment.createdAt > endDate) return false;
      return true;
    });
  }
  
  return payments;
}

/**
 * Get payments analytics for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
export async function getPaymentsAnalytics(tenantId, startDate, endDate) {
  const payments = await getTenantPayments(tenantId, startDate, endDate);
  
  let totalRevenue = 0;
  let totalRefunds = 0;
  let depositRevenue = 0;
  let balanceRevenue = 0;
  let completedPayments = 0;
  let pendingPayments = 0;
  let failedPayments = 0;
  let refundedPayments = 0;
  
  for (const payment of payments) {
    if (payment.status === PAYMENT_STATUS.COMPLETED) {
      totalRevenue += payment.amount;
      completedPayments++;
      
      if (payment.type === PAYMENT_TYPE.DEPOSIT) {
        depositRevenue += payment.amount;
      } else if (payment.type === PAYMENT_TYPE.BALANCE || payment.type === PAYMENT_TYPE.FULL_PAYMENT) {
        balanceRevenue += payment.amount;
      }
    } else if (payment.status === PAYMENT_STATUS.PENDING || payment.status === PAYMENT_STATUS.PROCESSING) {
      pendingPayments++;
    } else if (payment.status === PAYMENT_STATUS.FAILED) {
      failedPayments++;
    } else if (payment.status === PAYMENT_STATUS.REFUNDED || payment.status === PAYMENT_STATUS.PARTIALLY_REFUNDED) {
      refundedPayments++;
      totalRefunds += payment.refundedAmount || 0;
    }
  }
  
  const netRevenue = totalRevenue - totalRefunds;
  
  return {
    totalRevenue,
    totalRefunds,
    netRevenue,
    depositRevenue,
    balanceRevenue,
    completedPayments,
    pendingPayments,
    failedPayments,
    refundedPayments,
    totalPayments: payments.length,
    averagePaymentAmount: completedPayments > 0 ? totalRevenue / completedPayments : 0,
    successRate: payments.length > 0 ? (completedPayments / payments.length) * 100 : 0
  };
}

/**
 * Get outstanding payments
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getOutstandingPayments(tenantId) {
  const paymentsRef = collection(db, 'tenants', tenantId, 'payments');
  const q = query(
    paymentsRef,
    where('status', 'in', [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.PROCESSING]),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Subscribe to payment changes
 * @param {string} tenantId - Tenant ID
 * @param {string} invoiceId - Invoice ID (optional)
 * @param {function} callback - Callback function
 * @returns {function} Unsubscribe function
 */
export function subscribeToPayments(tenantId, invoiceId = null, callback) {
  const paymentsRef = collection(db, 'tenants', tenantId, 'payments');
  let q;
  
  if (invoiceId) {
    q = query(
      paymentsRef,
      where('invoiceId', '==', invoiceId),
      orderBy('createdAt', 'desc')
    );
  } else {
    q = query(paymentsRef, orderBy('createdAt', 'desc'));
  }
  
  return onSnapshot(q, (snapshot) => {
    const payments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(payments);
  });
}

/**
 * Update invoice payment status based on payments
 * @param {string} tenantId - Tenant ID
 * @param {string} invoiceId - Invoice ID
 * @returns {Promise<void>}
 */
export async function updateInvoicePaymentStatus(tenantId, invoiceId) {
  const invoiceRef = doc(db, 'tenants', tenantId, 'invoices', invoiceId);
  const invoiceSnap = await getDoc(invoiceRef);
  
  if (!invoiceSnap.exists()) {
    throw new Error('Invoice not found');
  }
  
  const invoice = invoiceSnap.data();
  const summary = await getInvoicePaymentSummary(tenantId, invoiceId, invoice.total);
  
  let newStatus = invoice.status;
  
  if (summary.isFullyPaid) {
    newStatus = 'paid';
  } else if (summary.totalPaid > 0) {
    newStatus = 'partial';
  }
  
  await updateDoc(invoiceRef, {
    status: newStatus,
    amountPaid: summary.totalPaid,
    amountDue: summary.outstandingAmount,
    updatedAt: new Date().toISOString()
  });
}
