// src/services/googleCalendarApiMigrationService.js
/**
 * Google Calendar API Migration Service
 * Pull events, appointments, recurring jobs via API
 */

import { collection, addDoc, doc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Google Calendar API configuration
const GOOGLE_CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_OAUTH_URL = 'https://accounts.google.com/o/oauth2/v4/token';

/**
 * Save Google Calendar OAuth tokens for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {Object} tokens - OAuth tokens (accessToken, refreshToken, calendarId)
 * @returns {Promise<void>}
 */
export async function saveGoogleCalendarOAuthTokens(tenantId, tokens) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'google_calendar_api'));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    await addDoc(integrationsRef, {
      provider: 'google_calendar_api',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      calendarId: tokens.calendarId || 'primary',
      connectedAt: new Date().toISOString(),
      status: 'active'
    });
  } else {
    const docRef = doc(db, 'tenants', tenantId, 'integrations', querySnap.docs[0].id);
    await updateDoc(docRef, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      calendarId: tokens.calendarId || 'primary',
      updatedAt: new Date().toISOString(),
      status: 'active'
    });
  }
}

/**
 * Get Google Calendar OAuth tokens for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} OAuth tokens
 */
export async function getGoogleCalendarOAuthTokens(tenantId) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'google_calendar_api'));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    return null;
  }
  
  return querySnap.docs[0].data();
}

/**
 * Refresh Google Calendar access token
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} New tokens
 */
export async function refreshGoogleCalendarToken(tenantId) {
  const tokens = await getGoogleCalendarOAuthTokens(tenantId);
  
  if (!tokens) {
    throw new Error('Google Calendar not connected');
  }
  
  const response = await fetch(GOOGLE_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: window.REACT_APP_GOOGLE_CLIENT_ID,
      client_secret: window.REACT_APP_GOOGLE_CLIENT_SECRET,
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token'
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to refresh token');
  }
  
  const data = await response.json();
  
  await saveGoogleCalendarOAuthTokens(tenantId, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokens.refreshToken,
    calendarId: tokens.calendarId
  });
  
  return data;
}

/**
 * Pull events from Google Calendar API
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (ISO format)
 * @param {string} endDate - End date (ISO format)
 * @returns {Promise<Array>} Imported events
 */
export async function pullGoogleCalendarEvents(tenantId, startDate, endDate) {
  const tokens = await getGoogleCalendarOAuthTokens(tenantId);
  
  if (!tokens) {
    throw new Error('Google Calendar not connected');
  }
  
  const response = await fetch(`${GOOGLE_CALENDAR_API_URL}/calendars/${tokens.calendarId}/events?timeMin=${startDate}&timeMax=${endDate}&singleEvents=true`, {
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch Google Calendar events');
  }
  
  const data = await response.json();
  const events = data.items || [];
  
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const importedEvents = [];
  
  for (const event of events) {
    const jobData = {
      title: event.summary || 'Untitled Event',
      description: event.description || '',
      date: event.start?.date || event.start?.dateTime?.split('T')[0] || '',
      startTime: event.start?.dateTime?.split('T')[1]?.substring(0, 5) || '09:00',
      endTime: event.end?.dateTime?.split('T')[1]?.substring(0, 5) || '10:00',
      estimatedHours: calculateEstimatedHours(event.start, event.end),
      location: event.location || '',
      status: 'scheduled',
      source: 'google_calendar_api',
      googleCalendarEventId: event.id,
      customerId: null,
      assignedEmployees: [],
      createdAt: new Date().toISOString()
    };
    
    const docRef = await addDoc(jobsRef, jobData);
    importedEvents.push({ id: docRef.id, ...jobData });
  }
  
  return importedEvents;
}

/**
 * Calculate estimated hours from event start/end times
 * @param {Object} start - Start time object
 * @param {Object} end - End time object
 * @returns {number} Estimated hours
 */
function calculateEstimatedHours(start, end) {
  if (start.dateTime && end.dateTime) {
    const startTime = new Date(start.dateTime);
    const endTime = new Date(end.dateTime);
    const diffMs = endTime - startTime;
    return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
  }
  return 1;
}

/**
 * Pull recurring events from Google Calendar API
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Imported recurring events
 */
export async function pullGoogleCalendarRecurringEvents(tenantId) {
  const tokens = await getGoogleCalendarOAuthTokens(tenantId);
  
  if (!tokens) {
    throw new Error('Google Calendar not connected');
  }
  
  const response = await fetch(`${GOOGLE_CALENDAR_API_URL}/calendars/${tokens.calendarId}/events`, {
    headers: {
      'Authorization': `Bearer ${tokens.accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch Google Calendar recurring events');
  }
  
  const data = await response.json();
  const events = data.items || [];
  
  const recurringRef = collection(db, 'tenants', tenantId, 'recurring_services');
  const importedRecurring = [];
  
  for (const event of events) {
    if (!event.recurrence) {
      continue;
    }
    
    const recurringData = {
      title: event.summary || 'Untitled Recurring',
      description: event.description || '',
      frequency: parseRecurrenceRule(event.recurrence[0]),
      interval: 1,
      dayOfWeek: parseDayOfWeek(event.recurrence[0]),
      startDate: event.start?.date || event.start?.dateTime?.split('T')[0] || '',
      status: 'active',
      source: 'google_calendar_api',
      googleCalendarEventId: event.id,
      customerId: null,
      createdAt: new Date().toISOString()
    };
    
    const docRef = await addDoc(recurringRef, recurringData);
    importedRecurring.push({ id: docRef.id, ...recurringData });
  }
  
  return importedRecurring;
}

/**
 * Parse Google Calendar recurrence rule to frequency
 * @param {string} rule - Recurrence rule
 * @returns {string} Frequency
 */
function parseRecurrenceRule(rule) {
  if (rule.includes('DAILY')) return 'daily';
  if (rule.includes('WEEKLY')) return 'weekly';
  if (rule.includes('MONTHLY')) return 'monthly';
  return 'weekly';
}

/**
 * Parse day of week from recurrence rule
 * @param {string} rule - Recurrence rule
 * @returns {string} Day of week
 */
function parseDayOfWeek(rule) {
  const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  for (const day of days) {
    if (rule.includes(day)) {
      return day;
    }
  }
  return 'MO';
}

/**
 * Sync all Google Calendar data
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {Promise<Object>} Sync results
 */
export async function syncAllGoogleCalendarData(tenantId, startDate, endDate) {
  const results = {
    events: [],
    recurring: [],
    errors: []
  };
  
  try {
    results.events = await pullGoogleCalendarEvents(tenantId, startDate, endDate);
  } catch (error) {
    results.errors.push({ type: 'events', error: error.message });
  }
  
  try {
    results.recurring = await pullGoogleCalendarRecurringEvents(tenantId);
  } catch (error) {
    results.errors.push({ type: 'recurring', error: error.message });
  }
  
  return results;
}

/**
 * Disconnect Google Calendar API integration
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<void>}
 */
export async function disconnectGoogleCalendarAPI(tenantId) {
  const integrationsRef = collection(db, 'tenants', tenantId, 'integrations');
  const q = query(integrationsRef, where('provider', '==', 'google_calendar_api'));
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
 * Check Google Calendar API connection status
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Connection status
 */
export async function checkGoogleCalendarAPIStatus(tenantId) {
  const tokens = await getGoogleCalendarOAuthTokens(tenantId);
  
  if (!tokens) {
    return { connected: false, status: 'not_connected' };
  }
  
  try {
    const response = await fetch(`${GOOGLE_CALENDAR_API_URL}/calendars/${tokens.calendarId}`, {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`
      }
    });
    
    if (response.ok) {
      return {
        connected: true,
        status: 'active',
        connectedAt: tokens.connectedAt,
        calendarId: tokens.calendarId
      };
    } else {
      return { connected: false, status: 'token_expired' };
    }
  } catch {
    return { connected: false, status: 'error' };
  }
}
