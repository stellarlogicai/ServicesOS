// src/services/calendlyIntegrationService.js
/**
 * Calendly Integration Service
 * Calendar sync, automatic reminders, customer self-booking
 */

import { collection, addDoc, doc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Calendly API configuration
const CALENDLY_API_URL = 'https://api.calendly.com';

/**
 * Save Calendly OAuth tokens for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {Object} tokens - OAuth tokens (accessToken, refreshToken)
 * @returns {Promise<void>}
 */
export async function saveCalendlyTokens(tenantId, tokens) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'calendly'));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    await addDoc(integrationsRef, {
      provider: 'calendly',
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
 * Get Calendly tokens for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} OAuth tokens
 */
export async function getCalendlyTokens(tenantId) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'calendly'));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    return null;
  }
  
  return querySnap.docs[0].data();
}

/**
 * Get Calendly user info
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} User info
 */
export async function getCalendlyUserInfo(tenantId) {
  const tokens = await getCalendlyTokens(tenantId);
  
  if (!tokens) {
    throw new Error('Calendly not connected');
  }
  
  const response = await fetch(`${CALENDLY_API_URL}/users/me`, {
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to get Calendly user info');
  }
  
  const data = await response.json();
  return data.resource;
}

/**
 * Get Calendly event types
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Event types
 */
export async function getCalendlyEventTypes(tenantId) {
  const tokens = await getCalendlyTokens(tenantId);
  
  if (!tokens) {
    throw new Error('Calendly not connected');
  }
  
  const userInfo = await getCalendlyUserInfo(tenantId);
  const response = await fetch(`${CALENDLY_API_URL}/event_types?user=${userInfo.uri}`, {
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to get Calendly event types');
  }
  
  const data = await response.json();
  return data.collection;
}

/**
 * Create a Calendly event type
 * @param {string} tenantId - Tenant ID
 * @param {Object} eventType - Event type data
 * @returns {Promise<Object>} Created event type
 */
export async function createCalendlyEventType(tenantId, eventType) {
  const tokens = await getCalendlyTokens(tenantId);
  
  if (!tokens) {
    throw new Error('Calendly not connected');
  }
  
  const response = await fetch(`${CALENDLY_API_URL}/event_types`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(eventType)
  });
  
  if (!response.ok) {
    throw new Error('Failed to create Calendly event type');
  }
  
  const data = await response.json();
  return data.resource;
}

/**
 * Sync Calendly events to Firestore
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<void>}
 */
export async function syncCalendlyEvents(tenantId) {
  const tokens = await getCalendlyTokens(tenantId);
  
  if (!tokens) {
    throw new Error('Calendly not connected');
  }
  
  const userInfo = await getCalendlyUserInfo(tenantId);
  const response = await fetch(`${CALENDLY_API_URL}/scheduled_events?user=${userInfo.uri}&status=active`, {
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to sync Calendly events');
  }
  
  const data = await response.json();
  const events = data.collection;
  
  const appointmentsRef = collection(db, 'tenants', tenantId, 'appointments');
  
  for (const event of events) {
    const q = query(appointmentsRef, where('calendlyEventUri', '==', event.uri));
    const querySnap = await getDocs(q);
    
    if (querySnap.empty) {
      await addDoc(appointmentsRef, {
        calendlyEventUri: event.uri,
        customerName: event.name,
        customerEmail: event.email,
        date: event.start_time,
        endTime: event.end_time,
        status: 'scheduled',
        notes: event.notes || '',
        createdAt: new Date().toISOString()
      });
    }
  }
}

/**
 * Create a booking link for customer self-booking
 * @param {string} tenantId - Tenant ID
 * @param {string} eventTypeId - Event type ID
 * @returns {Promise<string>} Booking link
 */
export async function createBookingLink(tenantId, eventTypeId) {
  const tokens = await getCalendlyTokens(tenantId);
  
  if (!tokens) {
    throw new Error('Calendly not connected');
  }
  
  // Calendly booking links are typically in the format: https://calendly.com/{user}/{event_type}
  // We'll return the event type URI which can be used to construct the booking link
  const eventTypes = await getCalendlyEventTypes(tenantId);
  const eventType = eventTypes.find(et => et.id === eventTypeId);
  
  if (!eventType) {
    throw new Error('Event type not found');
  }
  
  return eventType.scheduling_url;
}

/**
 * Cancel a Calendly event
 * @param {string} tenantId - Tenant ID
 * @param {string} eventUri - Event URI
 * @returns {Promise<void>}
 */
export async function cancelCalendlyEvent(tenantId, eventUri) {
  const tokens = await getCalendlyTokens(tenantId);
  
  if (!tokens) {
    throw new Error('Calendly not connected');
  }
  
  const response = await fetch(`${CALENDLY_API_URL}/scheduled_events/${encodeURIComponent(eventUri)}/cancellation`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      reason: 'Cancelled by cleaning company'
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to cancel Calendly event');
  }
}

/**
 * Get Calendly webhook subscriptions
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Webhook subscriptions
 */
export async function getCalendlyWebhooks(tenantId) {
  const tokens = await getCalendlyTokens(tenantId);
  
  if (!tokens) {
    throw new Error('Calendly not connected');
  }
  
  const userInfo = await getCalendlyUserInfo(tenantId);
  const response = await fetch(`${CALENDLY_API_URL}/webhook_subscriptions?user=${userInfo.uri}`, {
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to get Calendly webhooks');
  }
  
  const data = await response.json();
  return data.collection;
}

/**
 * Create a Calendly webhook subscription
 * @param {string} tenantId - Tenant ID
 * @param {string} webhookUrl - Webhook URL
 * @returns {Promise<Object>} Webhook subscription
 */
export async function createCalendlyWebhook(tenantId, webhookUrl) {
  const tokens = await getCalendlyTokens(tenantId);
  
  if (!tokens) {
    throw new Error('Calendly not connected');
  }
  
  const userInfo = await getCalendlyUserInfo(tenantId);
  
  const response = await fetch(`${CALENDLY_API_URL}/webhook_subscriptions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: webhookUrl,
      events: ['invitee.created', 'invitee.canceled'],
      organization: userInfo.organization,
      user: userInfo.uri
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to create Calendly webhook');
  }
  
  const data = await response.json();
  return data.resource;
}

/**
 * Delete a Calendly webhook subscription
 * @param {string} tenantId - Tenant ID
 * @param {string} webhookId - Webhook ID
 * @returns {Promise<void>}
 */
export async function deleteCalendlyWebhook(tenantId, webhookId) {
  const tokens = await getCalendlyTokens(tenantId);
  
  if (!tokens) {
    throw new Error('Calendly not connected');
  }
  
  const response = await fetch(`${CALENDLY_API_URL}/webhook_subscriptions/${webhookId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to delete Calendly webhook');
  }
}

/**
 * Handle Calendly webhook event
 * @param {string} tenantId - Tenant ID
 * @param {Object} webhookData - Webhook event data
 * @returns {Promise<void>}
 */
export async function handleCalendlyWebhook(tenantId, webhookData) {
  const eventType = webhookData.event;
  const payload = webhookData.payload;
  
  if (eventType === 'invitee.created') {
    // New booking created
    const appointmentsRef = collection(db, 'tenants', tenantId, 'appointments');
    await addDoc(appointmentsRef, {
      calendlyEventUri: payload.event,
      customerName: payload.email,
      customerEmail: payload.email,
      date: payload.start_time,
      endTime: payload.end_time,
      status: 'scheduled',
      notes: payload.questions_and_answers || [],
      createdAt: new Date().toISOString()
    });
    
    // Send confirmation email
    // This would integrate with your email service
  } else if (eventType === 'invitee.canceled') {
    // Booking canceled
    const appointmentsRef = collection(db, 'tenants', tenantId, 'appointments');
    const q = query(appointmentsRef, where('calendlyEventUri', '==', payload.event));
    const querySnap = await getDocs(q);
    
    if (!querySnap.empty) {
      const docRef = doc(db, 'tenants', tenantId, 'appointments', querySnap.docs[0].id);
      await updateDoc(docRef, {
        status: 'canceled',
        canceledAt: new Date().toISOString()
      });
    }
  }
}

/**
 * Disconnect Calendly integration
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<void>}
 */
export async function disconnectCalendly(tenantId) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'calendly'));
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
 * Get Calendly integration status
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Integration status
 */
export async function getCalendlyIntegrationStatus(tenantId) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'calendly'));
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
    connectedAt: data.connectedAt
  };
}
