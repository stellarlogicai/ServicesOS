// src/services/quickBooksApiMigrationService.js
/**
 * QuickBooks API Migration Service
 * OAuth, pull customers/invoices/payments via API
 */

import { collection, addDoc, doc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

// QuickBooks OAuth configuration
const QUICKBOOKS_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QUICKBOOKS_API_URL = 'https://sandbox-quickbooks.api.intuit.com/v3';

/**
 * Save QuickBooks OAuth tokens for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {Object} tokens - OAuth tokens (accessToken, refreshToken, realmId)
 * @returns {Promise<void>}
 */
export async function saveQuickBooksOAuthTokens(tenantId, tokens) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'quickbooks_api'));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    await addDoc(integrationsRef, {
      provider: 'quickbooks_api',
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
 * Get QuickBooks OAuth tokens for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} OAuth tokens
 */
export async function getQuickBooksOAuthTokens(tenantId) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'quickbooks_api'));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    return null;
  }
  
  return querySnap.docs[0].data();
}

/**
 * Refresh QuickBooks access token
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} New tokens
 */
export async function refreshQuickBooksToken(tenantId) {
  const tokens = await getQuickBooksOAuthTokens(tenantId);
  
  if (!tokens) {
    throw new Error('QuickBooks not connected');
  }
  
  const response = await fetch(QUICKBOOKS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${btoa(window.REACT_APP_QUICKBOOKS_CLIENT_ID + ':' + window.REACT_APP_QUICKBOOKS_CLIENT_SECRET)}`
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to refresh token');
  }
  
  const data = await response.json();
  
  await saveQuickBooksOAuthTokens(tenantId, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    realmId: tokens.realmId
  });
  
  return data;
}

/**
 * Pull customers from QuickBooks API
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Imported customers
 */
export async function pullQuickBooksCustomers(tenantId) {
  const tokens = await getQuickBooksOAuthTokens(tenantId);
  
  if (!tokens) {
    throw new Error('QuickBooks not connected');
  }
  
  const response = await fetch(`${QUICKBOOKS_API_URL}/company/${tokens.realmId}/query?query=SELECT * FROM Customer`, {
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch QuickBooks customers');
  }
  
  const data = await response.json();
  const customers = data.QueryResponse.Customer || [];
  
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  const importedCustomers = [];
  
  for (const customer of customers) {
    const q = query(customersRef, where('email', '==', customer.PrimaryEmail?.Addr));
    const querySnap = await getDocs(q);
    
    if (querySnap.empty) {
      const customerData = {
        name: customer.DisplayName || customer.GivenName + ' ' + customer.FamilyName,
        email: customer.PrimaryEmail?.Addr || '',
        phone: customer.PrimaryPhone?.FreeFormNumber || '',
        address: customer.BillAddr?.Line1 || '',
        city: customer.BillAddr?.City || '',
        state: customer.BillAddr?.CountrySubDivisionCode || '',
        zip: customer.BillAddr?.PostalCode || '',
        source: 'quickbooks_api',
        quickbooksId: customer.Id,
        status: 'active',
        createdAt: new Date().toISOString()
      };
      
      const docRef = await addDoc(customersRef, customerData);
      importedCustomers.push({ id: docRef.id, ...customerData });
    } else {
      importedCustomers.push({ id: querySnap.docs[0].id, existing: true });
    }
  }
  
  return importedCustomers;
}

/**
 * Pull invoices from QuickBooks API
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Imported invoices
 */
export async function pullQuickBooksInvoices(tenantId) {
  const tokens = await getQuickBooksOAuthTokens(tenantId);
  
  if (!tokens) {
    throw new Error('QuickBooks not connected');
  }
  
  const response = await fetch(`${QUICKBOOKS_API_URL}/company/${tokens.realmId}/query?query=SELECT * FROM Invoice`, {
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch QuickBooks invoices');
  }
  
  const data = await response.json();
  const invoices = data.QueryResponse.Invoice || [];
  
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  const importedInvoices = [];
  
  for (const invoice of invoices) {
    const invoiceData = {
      invoiceNumber: invoice.DocNumber || '',
      customerId: invoice.CustomerRef?.value || null,
      amount: invoice.TotalAmt || 0,
      dueDate: invoice.DueDate || '',
      status: mapQuickBooksInvoiceStatus(invoice),
      quickbooksId: invoice.Id,
      lineItems: invoice.Line || [],
      createdAt: new Date().toISOString()
    };
    
    const docRef = await addDoc(invoicesRef, invoiceData);
    importedInvoices.push({ id: docRef.id, ...invoiceData });
  }
  
  return importedInvoices;
}

/**
 * Pull payments from QuickBooks API
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Imported payments
 */
export async function pullQuickBooksPayments(tenantId) {
  const tokens = await getQuickBooksOAuthTokens(tenantId);
  
  if (!tokens) {
    throw new Error('QuickBooks not connected');
  }
  
  const response = await fetch(`${QUICKBOOKS_API_URL}/company/${tokens.realmId}/query?query=SELECT * FROM Payment`, {
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch QuickBooks payments');
  }
  
  const data = await response.json();
  const payments = data.QueryResponse.Payment || [];
  
  const paymentsRef = collection(db, 'tenants', tenantId, 'payments');
  const importedPayments = [];
  
  for (const payment of payments) {
    const paymentData = {
      customerId: payment.CustomerRef?.value || null,
      amount: payment.TotalAmt || 0,
      paymentDate: payment.TxnDate || '',
      paymentMethod: payment.PaymentMethodRef?.name || '',
      quickbooksId: payment.Id,
      referenceNumber: payment.PrivateNote || '',
      createdAt: new Date().toISOString()
    };
    
    const docRef = await addDoc(paymentsRef, paymentData);
    importedPayments.push({ id: docRef.id, ...paymentData });
  }
  
  return importedPayments;
}

/**
 * Map QuickBooks invoice status to internal status
 * @param {Object} invoice - QuickBooks invoice
 * @returns {string} Internal status
 */
function mapQuickBooksInvoiceStatus(invoice) {
  if (invoice.Balance === 0) {
    return 'paid';
  } else if (invoice.Balance < invoice.TotalAmt) {
    return 'partial';
  } else {
    return 'outstanding';
  }
}

/**
 * Disconnect QuickBooks API integration
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<void>}
 */
export async function disconnectQuickBooksAPI(tenantId) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'quickbooks_api'));
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
 * Check QuickBooks API connection status
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Connection status
 */
export async function checkQuickBooksAPIStatus(tenantId) {
  const tokens = await getQuickBooksOAuthTokens(tenantId);
  
  if (!tokens) {
    return { connected: false, status: 'not_connected' };
  }
  
  try {
    const response = await fetch(`${QUICKBOOKS_API_URL}/company/${tokens.realmId}/companyinfo/${tokens.realmId}`, {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`
      }
    });
    
    if (response.ok) {
      return {
        connected: true,
        status: 'active',
        connectedAt: tokens.connectedAt,
        realmId: tokens.realmId
      };
    } else {
      return { connected: false, status: 'token_expired' };
    }
  } catch {
    return { connected: false, status: 'error' };
  }
}

/**
 * Sync all QuickBooks data
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Sync results
 */
export async function syncAllQuickBooksData(tenantId) {
  const results = {
    customers: [],
    invoices: [],
    payments: [],
    errors: []
  };
  
  try {
    results.customers = await pullQuickBooksCustomers(tenantId);
  } catch (error) {
    results.errors.push({ type: 'customers', error: error.message });
  }
  
  try {
    results.invoices = await pullQuickBooksInvoices(tenantId);
  } catch (error) {
    results.errors.push({ type: 'invoices', error: error.message });
  }
  
  try {
    results.payments = await pullQuickBooksPayments(tenantId);
  } catch (error) {
    results.errors.push({ type: 'payments', error: error.message });
  }
  
  return results;
}
