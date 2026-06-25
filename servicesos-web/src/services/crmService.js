/**
 * crmService.js
 * Firebase-backed CRM service.
 *
 * This service now uses the core leadService to save leads to Firestore
 * instead of localStorage for production data persistence.
 *
 * DATA SHAPE:
 * {
 *   id:        string          — "lead_<timestamp>"
 *   createdAt: ISO string
 *   status:    "new" | "quoted" | "booked" | "lost"
 *   formData:  { fullName, phone, email, address, bedrooms, bathrooms,
 *                halfBaths, squareFootage, pets, petCount, children,
 *                cleaningType, frequency, preferredDays, condition, photos }
 *   estimate:  { laborHours, appointmentDuration, priceLow, priceHigh, aiEnhanced }
 *   booking:   { scheduledAt, agreedPrice, notes } | null
 *   aiAnalysis: object | null
 * }
 */

import { createLead as createLeadFirestore, getLeads as getLeadsFirestore, updateLead as updateLeadFirestore, deleteLead as deleteLeadFirestore } from '../core/leads/leadService';

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Save a new lead from the intake form.
 * Returns the saved lead object (with generated id + timestamps).
 */
export async function saveLead(tenantId, formData, estimate, aiAnalysis = null) {
  if (!tenantId) {
    console.error('[CRM Service] Tenant ID is required for saving leads');
    throw new Error('Tenant ID is required');
  }

  const normalizedFormData = {
    ...formData,
    fullName: formData.fullName ||
      [formData.firstName, formData.lastName].filter(Boolean).join(' ').trim(),
    bedrooms: formData.bedrooms ?? formData.bedroomCount ?? null,
    bathrooms: formData.bathrooms ?? formData.bathroomCount ?? null,
    condition: formData.condition || formData.clutterLevel || '',
  };
  const normalizedEstimate = {
    ...estimate,
    aiEnhanced: !!(aiAnalysis && !aiAnalysis.error)
  };
  const leadData = {
    type: 'lead',
    source: 'admin',
    formData: normalizedFormData,
    estimate: normalizedEstimate,
    aiAnalysis: aiAnalysis || null,
    booking: null,
  };

  const result = await createLeadFirestore(tenantId, leadData);
  
  if (result.success) {
    return {
      id: result.data.id,
      createdAt: result.data.createdAt,
      updatedAt: result.data.updatedAt,
      status: result.data.status,
      type: 'lead',
      source: 'admin',
      formData: normalizedFormData,
      estimate: normalizedEstimate,
      booking: null,
      aiAnalysis: aiAnalysis || null,
    };
  } else {
    console.error('[CRM Service] Failed to save lead:', result.error);
    throw new Error(result.error || 'Failed to save lead');
  }
}

/**
 * Alias for saveLead for backwards compatibility
 */
export async function saveQuote(tenantId, formData, estimate, aiAnalysis = null) {
  return saveLead(tenantId, formData, estimate, aiAnalysis);
}

/**
 * Alias for getLeads for backwards compatibility (CustomerPortal uses this)
 */
export async function getQuotes(tenantId) {
  return getLeads(tenantId);
}

/**
 * Retrieve all leads, newest first.
 */
export async function getLeads(tenantId) {
  if (!tenantId) {
    console.error('[CRM Service] Tenant ID is required for getting leads');
    return [];
  }

  const result = await getLeadsFirestore(tenantId);
  
  if (result.success) {
    return result.data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else {
    console.error('[CRM Service] Failed to get leads:', result.error);
    return [];
  }
}

/**
 * Get a single lead by id.
 */
export async function getLeadById(tenantId, id) {
  if (!tenantId) {
    console.error('[CRM Service] Tenant ID is required for getting lead');
    return null;
  }

  const result = await getLeadsFirestore(tenantId);
  
  if (result.success) {
    return result.data.find(l => l.id === id) || null;
  } else {
    console.error('[CRM Service] Failed to get lead:', result.error);
    return null;
  }
}

/**
 * Update any fields on a lead.
 * Returns the updated lead.
 */
export async function updateLead(tenantId, id, patch) {
  if (!tenantId) {
    console.error('[CRM Service] Tenant ID is required for updating lead');
    throw new Error('Tenant ID is required');
  }

  const result = await updateLeadFirestore(tenantId, id, patch);
  
  if (result.success) {
    return result.data;
  } else {
    console.error('[CRM Service] Failed to update lead:', result.error);
    throw new Error(result.error || 'Failed to update lead');
  }
}

/**
 * Convert a lead to a booked job.
 *
 * @param {string} tenantId
 * @param {string} id
 * @param {{ scheduledAt: string, agreedPrice: number, notes?: string }} booking
 */
export async function bookLead(tenantId, id, booking) {
  return updateLead(tenantId, id, { status: "booked", booking });
}

/**
 * Mark a lead's status.
 * @param {string} tenantId
 * @param {string} id
 * @param {"new"|"quoted"|"booked"|"lost"} status
 */
export async function setLeadStatus(tenantId, id, status) {
  return updateLead(tenantId, id, { status });
}

/**
 * Delete a lead permanently.
 */
export async function deleteLead(tenantId, id) {
  if (!tenantId) {
    console.error('[CRM Service] Tenant ID is required for deleting lead');
    throw new Error('Tenant ID is required');
  }

  const result = await deleteLeadFirestore(tenantId, id);
  
  if (!result.success) {
    console.error('[CRM Service] Failed to delete lead:', result.error);
    throw new Error(result.error || 'Failed to delete lead');
  }
}

// ─── Analytics helpers ────────────────────────────────────────────────────────

/**
 * Summary stats for the dashboard.
 */
export async function getStats(tenantId) {
  if (!tenantId) {
    console.error('[CRM Service] Tenant ID is required for getting stats');
    return {
      total: 0,
      byStatus: { new: 0, quoted: 0, booked: 0, lost: 0 },
      revenue: 0,
      pipeline: 0,
      conversionRate: 0,
      avgJobValue: 0,
    };
  }

  const leads = await getLeads(tenantId);

  const booked  = leads.filter(l => l.status === "booked");
  const revenue = booked.reduce((s, l) => s + (l.booking?.agreedPrice || 0), 0);
  const pipeline = leads
    .filter(l => l.status !== "lost")
    .reduce((s, l) => s + ((l.estimate?.priceLow + l.estimate?.priceHigh) / 2 || 0), 0);

  return {
    total:          leads.length,
    byStatus: {
      new:    leads.filter(l => l.status === "new").length,
      quoted: leads.filter(l => l.status === "quoted").length,
      booked: booked.length,
      lost:   leads.filter(l => l.status === "lost").length,
    },
    revenue:         Math.round(revenue),
    pipeline:        Math.round(pipeline),
    conversionRate:  leads.length > 0 ? Math.round((booked.length / leads.length) * 100) : 0,
    avgJobValue:     booked.length > 0 ? Math.round(revenue / booked.length) : 0,
  };
}

/**
 * Revenue grouped by date (last N days).
 * Returns [{ date: "Jun 1", revenue: 340 }, …]
 */
export async function getRevenueByDay(tenantId, days = 14) {
  if (!tenantId) {
    console.error('[CRM Service] Tenant ID is required for getting revenue');
    return [];
  }

  const leads  = await getLeads(tenantId);
  const booked = leads.filter(l => l.status === "booked" && l.booking?.agreedPrice);

  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const dateStr = d.toDateString();

    const revenue = booked
      .filter(l => new Date(l.booking.scheduledAt).toDateString() === dateStr)
      .reduce((s, l) => s + l.booking.agreedPrice, 0);

    return {
      date:    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      revenue,
    };
  });
}
