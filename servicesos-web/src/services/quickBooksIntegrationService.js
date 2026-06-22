// src/services/quickBooksIntegrationService.js
/**
 * QuickBooks Integration Service
 * Invoice sync, payment tracking, customer records, expense categorization
 */

import { collection, addDoc, doc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

// QuickBooks API configuration
const QUICKBOOKS_API_URL = 'https://sandbox-quickbooks.api.intuit.com/v3';

/**
 * Save QuickBooks OAuth tokens for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {Object} tokens - OAuth tokens (accessToken, refreshToken, realmId)
 * @returns {Promise<void>}
 */
export async function saveQuickBooksTokens(tenantId, tokens) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'quickbooks'));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    await addDoc(integrationsRef, {
      provider: 'quickbooks',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      realmId: tokens.realmId,
      connectedAt: new Date().toISOString(),
      status: 'active'
    });
  } else {
    const docRef = doc(db, 'tenants', tenantId, 'integrations', querySnap.docs[0].id);
    await updateDoc(docRef, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      realmId: tokens.realmId,
      updatedAt: new Date().toISOString(),
      status: 'active'
    });
  }
}

/**
 * Get QuickBooks tokens for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} OAuth tokens
 */
export async function getQuickBooksTokens(tenantId) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'quickbooks'));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    return null;
  }
  
  return querySnap.docs[0].data();
}

/**
 * Create a QuickBooks invoice
 * @param {string} tenantId - Tenant ID
 * @param {Object} invoiceData - Invoice data
 * @returns {Promise<Object>} Created invoice
 */
export async function createQuickBooksInvoice(tenantId, invoiceData) {
  const tokens = await getQuickBooksTokens(tenantId);
  
  if (!tokens) {
    throw new Error('QuickBooks not connected');
  }
  
  const response = await fetch(`${QUICKBOOKS_API_URL}/${tokens.realmId}/invoice`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(invoiceData)
  });
  
  if (!response.ok) {
    throw new Error('Failed to create QuickBooks invoice');
  }
  
  const data = await response.json();
  return data.Invoice;
}

/**
 * Sync invoice to QuickBooks
 * @param {string} tenantId - Tenant ID
 * @param {string} invoiceId - Invoice ID from Firestore
 * @returns {Promise<Object>} QuickBooks invoice
 */
export async function syncInvoiceToQuickBooks(tenantId, invoiceId) {
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  const q = query(invoicesRef, where('__name__', '==', invoiceId));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    throw new Error('Invoice not found');
  }
  
  const invoice = querySnap.docs[0].data();
  
  // Get customer
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  const customerQ = query(customersRef, where('__name__', '==', invoice.customerId));
  const customerSnap = await getDocs(customerQ);
  
  if (customerSnap.empty) {
    throw new Error('Customer not found');
  }
  
  const customer = customerSnap.docs[0].data();
  
  // Create QuickBooks invoice
  const qbInvoiceData = {
    Line: [
      {
        Description: invoice.description || 'Cleaning Service',
        Amount: invoice.amount,
        DetailType: 'SalesItemLineDetail'
      }
    ],
    CustomerRef: {
      value: customer.quickBooksCustomerId || '1'
    },
    DueDate: invoice.dueDate,
    TxnDate: invoice.date
  };
  
  const qbInvoice = await createQuickBooksInvoice(tenantId, qbInvoiceData);
  
  // Update invoice with QuickBooks ID
  const invoiceRef = doc(db, 'tenants', tenantId, 'invoices', invoiceId);
  await updateDoc(invoiceRef, {
    quickBooksInvoiceId: qbInvoice.Id,
    syncedAt: new Date().toISOString()
  });
  
  return qbInvoice;
}

/**
 * Get QuickBooks customer
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Object>} QuickBooks customer
 */
export async function getQuickBooksCustomer(tenantId, customerId) {
  const tokens = await getQuickBooksTokens(tenantId);
  
  if (!tokens) {
    throw new Error('QuickBooks not connected');
  }
  
  const response = await fetch(`${QUICKBOOKS_API_URL}/${tokens.realmId}/customer/${customerId}`, {
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to get QuickBooks customer');
  }
  
  const data = await response.json();
  return data.Customer;
}

/**
 * Create a QuickBooks customer
 * @param {string} tenantId - Tenant ID
 * @param {Object} customerData - Customer data
 * @returns {Promise<Object>} Created customer
 */
export async function createQuickBooksCustomer(tenantId, customerData) {
  const tokens = await getQuickBooksTokens(tenantId);
  
  if (!tokens) {
    throw new Error('QuickBooks not connected');
  }
  
  const response = await fetch(`${QUICKBOOKS_API_URL}/${tokens.realmId}/customer`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(customerData)
  });
  
  if (!response.ok) {
    throw new Error('Failed to create QuickBooks customer');
  }
  
  const data = await response.json();
  return data.Customer;
}

/**
 * Sync customer to QuickBooks
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID from Firestore
 * @returns {Promise<Object>} QuickBooks customer
 */
export async function syncCustomerToQuickBooks(tenantId, customerId) {
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  const q = query(customersRef, where('__name__', '==', customerId));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    throw new Error('Customer not found');
  }
  
  const customer = querySnap.docs[0].data();
  
  // Create QuickBooks customer
  const qbCustomerData = {
    DisplayName: customer.name,
    PrimaryEmailAddr: {
      Address: customer.email
    },
    PrimaryPhone: {
      FreeFormNumber: customer.phone
    },
    BillAddr: {
      Line1: customer.address,
      City: customer.city,
      CountrySubDivisionCode: customer.state,
      PostalCode: customer.zip
    }
  };
  
  const qbCustomer = await createQuickBooksCustomer(tenantId, qbCustomerData);
  
  // Update customer with QuickBooks ID
  const customerRef = doc(db, 'tenants', tenantId, 'customers', customerId);
  await updateDoc(customerRef, {
    quickBooksCustomerId: qbCustomer.Id,
    syncedAt: new Date().toISOString()
  });
  
  return qbCustomer;
}

/**
 * Record payment in QuickBooks
 * @param {string} tenantId - Tenant ID
 * @param {Object} paymentData - Payment data
 * @returns {Promise<Object>} Created payment
 */
export async function recordQuickBooksPayment(tenantId, paymentData) {
  const tokens = await getQuickBooksTokens(tenantId);
  
  if (!tokens) {
    throw new Error('QuickBooks not connected');
  }
  
  const response = await fetch(`${QUICKBOOKS_API_URL}/${tokens.realmId}/payment`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(paymentData)
  });
  
  if (!response.ok) {
    throw new Error('Failed to record QuickBooks payment');
  }
  
  const data = await response.json();
  return data.Payment;
}

/**
 * Sync payment to QuickBooks
 * @param {string} tenantId - Tenant ID
 * @param {string} paymentId - Payment ID from Firestore
 * @returns {Promise<Object>} QuickBooks payment
 */
export async function syncPaymentToQuickBooks(tenantId, paymentId) {
  const paymentsRef = collection(db, 'tenants', tenantId, 'payments');
  const q = query(paymentsRef, where('__name__', '==', paymentId));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    throw new Error('Payment not found');
  }
  
  const payment = querySnap.docs[0].data();
  
  // Get invoice
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  const invoiceQ = query(invoicesRef, where('__name__', '==', payment.invoiceId));
  const invoiceSnap = await getDocs(invoiceQ);
  
  if (invoiceSnap.empty) {
    throw new Error('Invoice not found');
  }
  
  const invoice = invoiceSnap.docs[0].data();
  
  // Create QuickBooks payment
  const qbPaymentData = {
    TotalAmt: payment.amount,
    CustomerRef: {
      value: invoice.customerId
    },
    Line: [
      {
        Amount: payment.amount,
        LinkedTxn: [
          {
            TxnId: invoice.quickBooksInvoiceId,
            TxnType: 'Invoice'
          }
        ]
      }
    ]
  };
  
  const qbPayment = await recordQuickBooksPayment(tenantId, qbPaymentData);
  
  // Update payment with QuickBooks ID
  const paymentRef = doc(db, 'tenants', tenantId, 'payments', paymentId);
  await updateDoc(paymentRef, {
    quickBooksPaymentId: qbPayment.Id,
    syncedAt: new Date().toISOString()
  });
  
  return qbPayment;
}

/**
 * Create an expense in QuickBooks
 * @param {string} tenantId - Tenant ID
 * @param {Object} expenseData - Expense data
 * @returns {Promise<Object>} Created expense
 */
export async function createQuickBooksExpense(tenantId, expenseData) {
  const tokens = await getQuickBooksTokens(tenantId);
  
  if (!tokens) {
    throw new Error('QuickBooks not connected');
  }
  
  const response = await fetch(`${QUICKBOOKS_API_URL}/${tokens.realmId}/purchase`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(expenseData)
  });
  
  if (!response.ok) {
    throw new Error('Failed to create QuickBooks expense');
  }
  
  const data = await response.json();
  return data.Purchase;
}

/**
 * Sync expense to QuickBooks
 * @param {string} tenantId - Tenant ID
 * @param {string} expenseId - Expense ID from Firestore
 * @returns {Promise<Object>} QuickBooks expense
 */
export async function syncExpenseToQuickBooks(tenantId, expenseId) {
  const expensesRef = collection(db, 'tenants', tenantId, 'expenses');
  const q = query(expensesRef, where('__name__', '==', expenseId));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    throw new Error('Expense not found');
  }
  
  const expense = querySnap.docs[0].data();
  
  // Create QuickBooks expense
  const qbExpenseData = {
    PaymentType: 'Cash',
    TotalAmt: expense.amount,
    AccountRef: {
      value: expense.quickBooksAccountId || '1'
    },
    Line: [
      {
        Description: expense.description,
        Amount: expense.amount,
        DetailType: 'ExpenseLineDetail',
        AccountRef: {
          value: expense.quickBooksCategoryId || '1'
        }
      }
    ],
    TxnDate: expense.date
  };
  
  const qbExpense = await createQuickBooksExpense(tenantId, qbExpenseData);
  
  // Update expense with QuickBooks ID
  const expenseRef = doc(db, 'tenants', tenantId, 'expenses', expenseId);
  await updateDoc(expenseRef, {
    quickBooksExpenseId: qbExpense.Id,
    syncedAt: new Date().toISOString()
  });
  
  return qbExpense;
}

/**
 * Get QuickBooks accounts
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} QuickBooks accounts
 */
export async function getQuickBooksAccounts(tenantId) {
  const tokens = await getQuickBooksTokens(tenantId);
  
  if (!tokens) {
    throw new Error('QuickBooks not connected');
  }
  
  const response = await fetch(`${QUICKBOOKS_API_URL}/${tokens.realmId}/query?query=select * from Account`, {
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to get QuickBooks accounts');
  }
  
  const data = await response.json();
  return data.QueryResponse.Account;
}

/**
 * Get QuickBooks expense categories
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} QuickBooks expense categories
 */
export async function getQuickBooksExpenseCategories(tenantId) {
  const tokens = await getQuickBooksTokens(tenantId);
  
  if (!tokens) {
    throw new Error('QuickBooks not connected');
  }
  
  const response = await fetch(`${QUICKBOOKS_API_URL}/${tokens.realmId}/query?query=select * from Account where AccountType='Expense'`, {
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to get QuickBooks expense categories');
  }
  
  const data = await response.json();
  return data.QueryResponse.Account;
}

/**
 * Disconnect QuickBooks integration
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<void>}
 */
export async function disconnectQuickBooks(tenantId) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'quickbooks'));
  const querySnap = await getDocs(q);
  
  if (!querySnap.empty) {
    const docRef = doc(db, 'tenants', tenantId, 'integrations', querySnap.docs[0].id);
    await updateDoc(docRef, {
      status: 'disconnected',
      disconnectedAt: new Date().toISOString()
    });
  }
}

/**
 * Get QuickBooks integration status
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Integration status
 */
export async function getQuickBooksIntegrationStatus(tenantId) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'quickbooks'));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    return {
      connected: false,
      status: 'not_connected'
    };
  }
  
  const data = querySnap.docs[0].data();
  return {
    connected: data.status === 'active',
    status: data.status,
    connectedAt: data.connectedAt,
    realmId: data.realmId
  };
}
