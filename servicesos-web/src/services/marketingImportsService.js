// src/services/marketingImportsService.js
/**
 * Marketing Imports Service
 * Import Google reviews, contact lists from Mailchimp/Constant Contact
 */

import { collection, addDoc, doc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Save Mailchimp API tokens for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {Object} tokens - API tokens (apiKey, serverPrefix)
 * @returns {Promise<void>}
 */
export async function saveMailchimpTokens(tenantId, tokens) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'mailchimp'));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    await addDoc(integrationsRef, {
      provider: 'mailchimp',
      apiKey: tokens.apiKey,
      serverPrefix: tokens.serverPrefix,
      connectedAt: new Date().toISOString(),
      status: 'active'
    });
  } else {
    const docRef = doc(db, 'tenants', tenantId, 'integrations', querySnap.docs[0].id);
    await updateDoc(docRef, {
      apiKey: tokens.apiKey,
      serverPrefix: tokens.serverPrefix,
      updatedAt: new Date().toISOString(),
      status: 'active'
    });
  }
}

/**
 * Get Mailchimp tokens for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} API tokens
 */
export async function getMailchimpTokens(tenantId) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'mailchimp'));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    return null;
  }
  
  return querySnap.docs[0].data();
}

/**
 * Import Mailchimp contacts to Firestore
 * @param {string} tenantId - Tenant ID
 * @param {string} listId - Mailchimp list ID
 * @returns {Promise<Array>} Imported contacts
 */
export async function importMailchimpContacts(tenantId, listId) {
  const tokens = await getMailchimpTokens(tenantId);
  
  if (!tokens) {
    throw new Error('Mailchimp not connected');
  }
  
  const response = await fetch(`https://${tokens.serverPrefix}.api.mailchimp.com/3.0/lists/${listId}/members`, {
    headers: {
      'Authorization': `Bearer ${tokens.apiKey}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch Mailchimp contacts');
  }
  
  const data = await response.json();
  const contacts = data.members || [];
  
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  const importedContacts = [];
  
  for (const contact of contacts) {
    // Check if customer already exists by email
    const q = query(customersRef, where('email', '==', contact.email_address));
    const querySnap = await getDocs(q);
    
    if (querySnap.empty) {
      const customerData = {
        name: `${contact.merge_fields.FNAME || ''} ${contact.merge_fields.LNAME || ''}`.trim() || contact.email_address,
        email: contact.email_address,
        phone: contact.merge_fields.PHONE || '',
        address: contact.merge_fields.ADDRESS || '',
        city: contact.merge_fields.CITY || '',
        state: contact.merge_fields.STATE || '',
        zip: contact.merge_fields.ZIP || '',
        source: 'mailchimp_import',
        status: contact.status === 'subscribed' ? 'active' : 'inactive',
        createdAt: new Date().toISOString()
      };
      
      const docRef = await addDoc(customersRef, customerData);
      importedContacts.push({ id: docRef.id, ...customerData });
    } else {
      importedContacts.push({ id: querySnap.docs[0].id, existing: true });
    }
  }
  
  return importedContacts;
}

/**
 * Save Constant Contact API tokens for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {Object} tokens - API tokens (accessToken, refreshToken)
 * @returns {Promise<void>}
 */
export async function saveConstantContactTokens(tenantId, tokens) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'constant_contact'));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    await addDoc(integrationsRef, {
      provider: 'constant_contact',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      connectedAt: new Date().toISOString(),
      status: 'active'
    });
  } else {
    const docRef = doc(db, 'tenants', tenantId, 'integrations', querySnap.docs[0].id);
    await updateDoc(docRef, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      updatedAt: new Date().toISOString(),
      status: 'active'
    });
  }
}

/**
 * Get Constant Contact tokens for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} API tokens
 */
export async function getConstantContactTokens(tenantId) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'constant_contact'));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    return null;
  }
  
  return querySnap.docs[0].data();
}

/**
 * Import Constant Contact contacts to Firestore
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Imported contacts
 */
export async function importConstantContactContacts(tenantId) {
  const tokens = await getConstantContactTokens(tenantId);
  
  if (!tokens) {
    throw new Error('Constant Contact not connected');
  }
  
  const response = await fetch('https://api.cc.email/v3/contacts', {
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch Constant Contact contacts');
  }
  
  const data = await response.json();
  const contacts = data.contacts || [];
  
  const customersRef = collection(db, 'tenants', tenantId, 'customers');
  const importedContacts = [];
  
  for (const contact of contacts) {
    // Check if customer already exists by email
    const q = query(customersRef, where('email', '==', contact.email_address));
    const querySnap = await getDocs(q);
    
    if (querySnap.empty) {
      const customerData = {
        name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email_address,
        email: contact.email_address,
        phone: contact.phone_number || '',
        address: contact.address_line1 || '',
        city: contact.city || '',
        state: contact.state || '',
        zip: contact.postal_code || '',
        source: 'constant_contact_import',
        status: 'active',
        createdAt: new Date().toISOString()
      };
      
      const docRef = await addDoc(customersRef, customerData);
      importedContacts.push({ id: docRef.id, ...customerData });
    } else {
      importedContacts.push({ id: querySnap.docs[0].id, existing: true });
    }
  }
  
  return importedContacts;
}

/**
 * Import Google reviews to Firestore
 * @param {string} tenantId - Tenant ID
 * @param {string} placeId - Google Place ID
 * @returns {Promise<Array>} Imported reviews
 */
export async function importGoogleReviews(tenantId, placeId) {
  const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews&key=${window.REACT_APP_GOOGLE_PLACES_API_KEY}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch Google reviews');
  }
  
  const data = await response.json();
  const reviews = data.result?.reviews || [];
  
  const reviewsRef = collection(db, 'tenants', tenantId, 'reviews');
  const importedReviews = [];
  
  for (const review of reviews) {
    const reviewData = {
      authorName: review.author_name,
      authorUrl: review.author_url,
      rating: review.rating,
      text: review.text,
      time: new Date(review.time * 1000).toISOString(),
      relativeTimeDescription: review.relative_time_description,
      source: 'google',
      placeId,
      createdAt: new Date().toISOString()
    };
    
    const docRef = await addDoc(reviewsRef, reviewData);
    importedReviews.push({ id: docRef.id, ...reviewData });
  }
  
  return importedReviews;
}

/**
 * Get marketing integration status
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Integration status
 */
export async function getMarketingIntegrationStatus(tenantId) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const querySnap = await getDocs(integrationsRef);
  
  const status = {
    mailchimp: { connected: false, status: 'not_connected' },
    constantContact: { connected: false, status: 'not_connected' }
  };
  
  querySnap.docs.forEach(doc => {
    const data = doc.data();
    if (data.provider === 'mailchimp') {
      status.mailchimp = {
        connected: data.status === 'active',
        status: data.status,
        connectedAt: data.connectedAt
      };
    } else if (data.provider === 'constant_contact') {
      status.constantContact = {
        connected: data.status === 'active',
        status: data.status,
        connectedAt: data.connectedAt
      };
    }
  });
  
  return status;
}

/**
 * Disconnect Mailchimp integration
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<void>}
 */
export async function disconnectMailchimp(tenantId) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'mailchimp'));
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
 * Disconnect Constant Contact integration
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<void>}
 */
export async function disconnectConstantContact(tenantId) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'constant_contact'));
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
 * Get imported reviews
 * @param {string} tenantId - Tenant ID
 * @param {Object} filters - Optional filters (source, placeId)
 * @returns {Promise<Array>} Reviews
 */
export async function getImportedReviews(tenantId, filters = {}) {
  const reviewsRef = collection(db, 'tenants', tenantId, 'reviews');
  let q = reviewsRef;
  
  if (filters.source) {
    q = query(q, where('source', '==', filters.source));
  }
  
  if (filters.placeId) {
    q = query(q, where('placeId', '==', filters.placeId));
  }
  
  const querySnap = await getDocs(q);
  
  return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get review statistics
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Review statistics
 */
export async function getReviewStatistics(tenantId) {
  const reviews = await getImportedReviews(tenantId);
  
  if (reviews.length === 0) {
    return {
      totalReviews: 0,
      averageRating: 0,
      ratingDistribution: {},
      bySource: {}
    };
  }
  
  const totalRating = reviews.reduce((sum, review) => sum + (review.rating || 0), 0);
  const averageRating = totalRating / reviews.length;
  
  const ratingDistribution = {};
  reviews.forEach(review => {
    const rating = review.rating || 0;
    ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
  });
  
  const bySource = {};
  reviews.forEach(review => {
    const source = review.source || 'unknown';
    bySource[source] = (bySource[source] || 0) + 1;
  });
  
  return {
    totalReviews: reviews.length,
    averageRating: averageRating.toFixed(2),
    ratingDistribution,
    bySource
  };
}
