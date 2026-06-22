// src/services/invoicingService.js
/**
 * Invoicing Service
 * Handles invoice creation, management, and tracking for cleaning companies
 */

import { collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// Invoice statuses
export const INVOICE_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  VIEWED: 'viewed',
  PARTIAL: 'partial',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled'
};

/**
 * Create a new invoice
 * @param {string} tenantId - Tenant ID
 * @param {object} invoiceData - Invoice data
 * @returns {Promise<DocumentReference>}
 */
export async function createInvoice(tenantId, invoiceData) {
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  
  // Generate invoice number
  const invoiceNumber = await generateInvoiceNumber(tenantId);
  
  const data = {
    invoiceNumber,
    customerId: invoiceData.customerId,
    customerName: invoiceData.customerName,
    customerAddress: invoiceData.customerAddress,
    customerEmail: invoiceData.customerEmail,
    customerPhone: invoiceData.customerPhone,
    
    // Job reference
    jobId: invoiceData.jobId || null,
    recurringServiceId: invoiceData.recurringServiceId || null,
    
    // Invoice details
    invoiceDate: invoiceData.invoiceDate || new Date().toISOString().split('T')[0],
    dueDate: invoiceData.dueDate || calculateDueDate(invoiceData.invoiceDate || new Date().toISOString().split('T')[0]),
    
    // Line items
    lineItems: invoiceData.lineItems || [],
    
    // Amounts
    subtotal: calculateSubtotal(invoiceData.lineItems || []),
    taxRate: invoiceData.taxRate || 0,
    taxAmount: calculateTax(invoiceData.lineItems || [], invoiceData.taxRate || 0),
    discountAmount: invoiceData.discountAmount || 0,
    total: calculateTotal(
      invoiceData.lineItems || [],
      invoiceData.taxRate || 0,
      invoiceData.discountAmount || 0
    ),
    
    // Payment tracking
    depositAmount: invoiceData.depositAmount || 0,
    balancePaid: invoiceData.balancePaid || 0,
    amountDue: 0, // Calculated below
    
    // Status
    status: invoiceData.status || INVOICE_STATUS.DRAFT,
    
    // Notes
    notes: invoiceData.notes || '',
    terms: invoiceData.terms || 'Payment due within 30 days',
    
    // Metadata
    sentAt: null,
    viewedAt: null,
    paidAt: null,
    
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  // Calculate amount due
  data.amountDue = data.total - data.depositAmount - data.balancePaid;
  
  return await addDoc(invoicesRef, data);
}

/**
 * Update an invoice
 * @param {string} tenantId - Tenant ID
 * @param {string} invoiceId - Invoice ID
 * @param {object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updateInvoice(tenantId, invoiceId, updates) {
  const invoiceRef = doc(db, 'tenants', tenantId, 'invoices', invoiceId);
  
  // Recalculate totals if line items, tax, or discount changed
  let finalUpdates = { ...updates };
  
  if (updates.lineItems !== undefined || updates.taxRate !== undefined || updates.discountAmount !== undefined) {
    const currentInvoice = await getInvoice(tenantId, invoiceId);
    if (currentInvoice) {
      const lineItems = updates.lineItems !== undefined ? updates.lineItems : currentInvoice.lineItems;
      const taxRate = updates.taxRate !== undefined ? updates.taxRate : currentInvoice.taxRate;
      const discountAmount = updates.discountAmount !== undefined ? updates.discountAmount : currentInvoice.discountAmount;
      const depositAmount = currentInvoice.depositAmount || 0;
      const balancePaid = currentInvoice.balancePaid || 0;
      
      finalUpdates.subtotal = calculateSubtotal(lineItems);
      finalUpdates.taxAmount = calculateTax(lineItems, taxRate);
      finalUpdates.total = calculateTotal(lineItems, taxRate, discountAmount);
      finalUpdates.amountDue = finalUpdates.total - depositAmount - balancePaid;
    }
  }
  
  await updateDoc(invoiceRef, {
    ...finalUpdates,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Delete an invoice
 * @param {string} tenantId - Tenant ID
 * @param {string} invoiceId - Invoice ID
 * @returns {Promise<void>}
 */
export async function deleteInvoice(tenantId, invoiceId) {
  const invoiceRef = doc(db, 'tenants', tenantId, 'invoices', invoiceId);
  await deleteDoc(invoiceRef);
}

/**
 * Get an invoice by ID
 * @param {string} tenantId - Tenant ID
 * @param {string} invoiceId - Invoice ID
 * @returns {Promise<object|null>}
 */
export async function getInvoice(tenantId, invoiceId) {
  const invoiceRef = doc(db, 'tenants', tenantId, 'invoices', invoiceId);
  const docSnap = await getDoc(invoiceRef);
  
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  }
  return null;
}

/**
 * Get all invoices for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getInvoices(tenantId) {
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  const q = query(invoicesRef, orderBy('invoiceDate', 'desc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Get invoices for a specific customer
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Array>}
 */
export async function getCustomerInvoices(tenantId, customerId) {
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  const q = query(
    invoicesRef,
    where('customerId', '==', customerId),
    orderBy('invoiceDate', 'desc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Get outstanding invoices
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getOutstandingInvoices(tenantId) {
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  const q = query(
    invoicesRef,
    where('status', 'in', [INVOICE_STATUS.SENT, INVOICE_STATUS.VIEWED, INVOICE_STATUS.PARTIAL, INVOICE_STATUS.OVERDUE]),
    orderBy('dueDate', 'asc')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Get overdue invoices
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getOverdueInvoices(tenantId) {
  const today = new Date().toISOString().split('T')[0];
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  const q = query(
    invoicesRef,
    where('status', 'in', [INVOICE_STATUS.SENT, INVOICE_STATUS.VIEWED, INVOICE_STATUS.PARTIAL]),
    where('dueDate', '<', today),
    orderBy('dueDate', 'asc')
  );
  const snapshot = await getDocs(q);
  
  // Update status to overdue
  const updates = snapshot.docs.map(doc => 
    updateDoc(doc.ref, { status: INVOICE_STATUS.OVERDUE })
  );
  await Promise.all(updates);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Record a payment on an invoice
 * @param {string} tenantId - Tenant ID
 * @param {string} invoiceId - Invoice ID
 * @param {object} paymentData - Payment data
 * @returns {Promise<void>}
 */
export async function recordPayment(tenantId, invoiceId, paymentData) {
  const invoice = await getInvoice(tenantId, invoiceId);
  if (!invoice) return;
  
  const paymentAmount = paymentData.amount || 0;
  const newBalancePaid = (invoice.balancePaid || 0) + paymentAmount;
  const newAmountDue = invoice.total - (invoice.depositAmount || 0) - newBalancePaid;
  
  let newStatus = invoice.status;
  if (newAmountDue <= 0) {
    newStatus = INVOICE_STATUS.PAID;
  } else if (newBalancePaid > 0) {
    newStatus = INVOICE_STATUS.PARTIAL;
  }
  
  await updateInvoice(tenantId, invoiceId, {
    balancePaid: newBalancePaid,
    amountDue: newAmountDue,
    status: newStatus,
    paidAt: newStatus === INVOICE_STATUS.PAID ? new Date().toISOString() : invoice.paidAt
  });
  
  // Record payment transaction
  const paymentsRef = collection(db, 'tenants', tenantId, 'payments');
  await addDoc(paymentsRef, {
    invoiceId,
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    amount: paymentAmount,
    paymentMethod: paymentData.paymentMethod || 'card',
    paymentDate: paymentData.paymentDate || new Date().toISOString().split('T')[0],
    reference: paymentData.reference || '',
    notes: paymentData.notes || '',
    createdAt: new Date().toISOString()
  });
}

/**
 * Mark invoice as sent
 * @param {string} tenantId - Tenant ID
 * @param {string} invoiceId - Invoice ID
 * @returns {Promise<void>}
 */
export async function markInvoiceSent(tenantId, invoiceId) {
  await updateInvoice(tenantId, invoiceId, {
    status: INVOICE_STATUS.SENT,
    sentAt: new Date().toISOString()
  });
}

/**
 * Mark invoice as viewed
 * @param {string} tenantId - Tenant ID
 * @param {string} invoiceId - Invoice ID
 * @returns {Promise<void>}
 */
export async function markInvoiceViewed(tenantId, invoiceId) {
  await updateInvoice(tenantId, invoiceId, {
    status: INVOICE_STATUS.VIEWED,
    viewedAt: new Date().toISOString()
  });
}

/**
 * Generate invoice number
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<string>}
 */
async function generateInvoiceNumber(tenantId) {
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  const q = query(invoicesRef, orderBy('invoiceNumber', 'desc'));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return 'INV-0001';
  }
  
  const lastInvoice = snapshot.docs[0].data();
  const lastNumber = parseInt(lastInvoice.invoiceNumber.replace('INV-', ''), 10);
  const nextNumber = lastNumber + 1;
  
  return `INV-${String(nextNumber).padStart(4, '0')}`;
}

/**
 * Calculate due date
 * @param {string} invoiceDate - Invoice date (YYYY-MM-DD)
 * @param {number} daysUntilDue - Days until due (default 30)
 * @returns {string} Due date (YYYY-MM-DD)
 */
function calculateDueDate(invoiceDate, daysUntilDue = 30) {
  const date = new Date(invoiceDate);
  date.setDate(date.getDate() + daysUntilDue);
  return date.toISOString().split('T')[0];
}

/**
 * Calculate subtotal from line items
 * @param {Array} lineItems - Array of line items
 * @returns {number} Subtotal
 */
function calculateSubtotal(lineItems) {
  return lineItems.reduce((sum, item) => sum + (item.quantity || 1) * (item.price || 0), 0);
}

/**
 * Calculate tax amount
 * @param {Array} lineItems - Array of line items
 * @param {number} taxRate - Tax rate as percentage
 * @returns {number} Tax amount
 */
function calculateTax(lineItems, taxRate) {
  const subtotal = calculateSubtotal(lineItems);
  return subtotal * (taxRate / 100);
}

/**
 * Calculate total
 * @param {Array} lineItems - Array of line items
 * @param {number} taxRate - Tax rate as percentage
 * @param {number} discountAmount - Discount amount
 * @returns {number} Total
 */
function calculateTotal(lineItems, taxRate, discountAmount) {
  const subtotal = calculateSubtotal(lineItems);
  const tax = calculateTax(lineItems, taxRate);
  return subtotal + tax - discountAmount;
}

/**
 * Subscribe to invoices changes
 * @param {string} tenantId - Tenant ID
 * @param {function} callback - Callback function
 * @returns {function} Unsubscribe function
 */
export function subscribeToInvoices(tenantId, callback) {
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  const q = query(invoicesRef, orderBy('invoiceDate', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const invoices = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(invoices);
  });
}

/**
 * Get invoice statistics
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<object>} Invoice statistics
 */
export async function getInvoiceStatistics(tenantId) {
  const invoices = await getInvoices(tenantId);
  
  const totalRevenue = invoices
    .filter(inv => inv.status === INVOICE_STATUS.PAID)
    .reduce((sum, inv) => sum + (inv.total || 0), 0);
  
  const outstandingAmount = invoices
    .filter(inv => inv.status !== INVOICE_STATUS.PAID && inv.status !== INVOICE_STATUS.CANCELLED)
    .reduce((sum, inv) => sum + (inv.amountDue || 0), 0);
  
  const overdueAmount = invoices
    .filter(inv => inv.status === INVOICE_STATUS.OVERDUE)
    .reduce((sum, inv) => sum + (inv.amountDue || 0), 0);
  
  const pendingCount = invoices.filter(inv => 
    inv.status === INVOICE_STATUS.SENT || 
    inv.status === INVOICE_STATUS.VIEWED || 
    inv.status === INVOICE_STATUS.PARTIAL
  ).length;
  
  const overdueCount = invoices.filter(inv => inv.status === INVOICE_STATUS.OVERDUE).length;
  
  return {
    totalRevenue,
    outstandingAmount,
    overdueAmount,
    pendingCount,
    overdueCount,
    totalInvoices: invoices.length
  };
}
