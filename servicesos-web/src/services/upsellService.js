// src/services/upsellService.js
/**
 * Upsell Engine Service
 * Handles add-on services, upsell suggestions, and acceptance rate tracking
 */

import { collection, doc, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Create an upsell offer
 * @param {string} tenantId - Tenant ID
 * @param {object} offerData - Upsell offer data
 * @returns {Promise<DocumentReference>}
 */
export async function createUpsellOffer(tenantId, offerData) {
  const offersRef = collection(db, 'tenants', tenantId, 'upsell_offers');
  
  const data = {
    name: offerData.name,
    description: offerData.description || '',
    price: offerData.price || 0,
    category: offerData.category || 'add-on',
    
    // Targeting rules
    applicableServiceTypes: offerData.applicableServiceTypes || [],
    minPrice: offerData.minPrice || 0,
    maxPrice: offerData.maxPrice || null,
    
    // Display settings
    showOnEstimate: offerData.showOnEstimate !== false,
    showOnBooking: offerData.showOnBooking !== false,
    showOnJobCompletion: offerData.showOnJobCompletion || false,
    
    // Analytics
    timesShown: 0,
    timesAccepted: 0,
    totalRevenue: 0,
    
    // Status
    active: offerData.active !== false,
    
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  return await addDoc(offersRef, data);
}

/**
 * Get active upsell offers for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>}
 */
export async function getActiveUpsellOffers(tenantId) {
  const offersRef = collection(db, 'tenants', tenantId, 'upsell_offers');
  const q = query(
    offersRef,
    where('active', '==', true),
    orderBy('name')
  );
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Get relevant upsell offers for a specific job/estimate
 * @param {string} tenantId - Tenant ID
 * @param {object} jobData - Job/estimate data
 * @returns {Promise<Array>}
 */
export async function getRelevantUpsellOffers(tenantId, jobData) {
  const allOffers = await getActiveUpsellOffers(tenantId);
  
  // Filter offers based on job data
  return allOffers.filter(offer => {
    // Check service type applicability
    if (offer.applicableServiceTypes && offer.applicableServiceTypes.length > 0) {
      if (!offer.applicableServiceTypes.includes(jobData.serviceType)) {
        return false;
      }
    }
    
    // Check price range
    if (offer.minPrice && jobData.price < offer.minPrice) {
      return false;
    }
    
    if (offer.maxPrice && jobData.price > offer.maxPrice) {
      return false;
    }
    
    // Check display context
    if (jobData.context === 'estimate' && !offer.showOnEstimate) {
      return false;
    }
    
    if (jobData.context === 'booking' && !offer.showOnBooking) {
      return false;
    }
    
    if (jobData.context === 'completion' && !offer.showOnJobCompletion) {
      return false;
    }
    
    return true;
  });
}

/**
 * Record upsell impression (shown to customer)
 * @param {string} tenantId - Tenant ID
 * @param {string} offerId - Offer ID
 * @param {string} jobId - Job ID
 * @returns {Promise<void>}
 */
export async function recordUpsellImpression(tenantId, offerId, jobId) {
  const offerRef = doc(db, 'tenants', tenantId, 'upsell_offers', offerId);
  const offerSnap = await getDoc(offerRef);
  
  if (offerSnap.exists()) {
    const currentTimesShown = offerSnap.data().timesShown || 0;
    await updateDoc(offerRef, {
      timesShown: currentTimesShown + 1,
      updatedAt: new Date().toISOString()
    });
  }
  
  // Log the impression
  const impressionsRef = collection(db, 'tenants', tenantId, 'upsell_impressions');
  await addDoc(impressionsRef, {
    offerId,
    jobId,
    timestamp: new Date().toISOString()
  });
}

/**
 * Record upsell acceptance (customer accepted)
 * @param {string} tenantId - Tenant ID
 * @param {string} offerId - Offer ID
 * @param {string} jobId - Job ID
 * @param {number} amount - Amount charged
 * @returns {Promise<void>}
 */
export async function recordUpsellAcceptance(tenantId, offerId, jobId, amount) {
  const offerRef = doc(db, 'tenants', tenantId, 'upsell_offers', offerId);
  const offerSnap = await getDoc(offerRef);
  
  if (offerSnap.exists()) {
    const currentTimesAccepted = offerSnap.data().timesAccepted || 0;
    const currentTotalRevenue = offerSnap.data().totalRevenue || 0;
    await updateDoc(offerRef, {
      timesAccepted: currentTimesAccepted + 1,
      totalRevenue: currentTotalRevenue + (amount || 0),
      updatedAt: new Date().toISOString()
    });
  }
  
  // Log the acceptance
  const acceptancesRef = collection(db, 'tenants', tenantId, 'upsell_acceptances');
  await addDoc(acceptancesRef, {
    offerId,
    jobId,
    amount: amount || 0,
    timestamp: new Date().toISOString()
  });
}

/**
 * Get upsell analytics for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>}
 */
export async function getUpsellAnalytics(tenantId, startDate, endDate) {
  const offers = await getActiveUpsellOffers(tenantId);
  
  // Get acceptances in date range
  const acceptancesRef = collection(db, 'tenants', tenantId, 'upsell_acceptances');
  const acceptancesSnap = await getDocs(acceptancesRef);
  const acceptances = acceptancesSnap.docs
    .map(doc => doc.data())
    .filter(acc => acc.timestamp >= startDate && acc.timestamp <= endDate);
  
  // Calculate analytics
  const totalRevenue = acceptances.reduce((sum, acc) => sum + (acc.amount || 0), 0);
  const totalAcceptances = acceptances.length;
  
  // Calculate acceptance rate per offer
  const offerAnalytics = offers.map(offer => {
    const offerAcceptances = acceptances.filter(acc => acc.offerId === offer.id);
    const offerRevenue = offerAcceptances.reduce((sum, acc) => sum + (acc.amount || 0), 0);
    const acceptanceRate = offer.timesShown > 0 
      ? (offer.timesAccepted / offer.timesShown) * 100 
      : 0;
    
    return {
      id: offer.id,
      name: offer.name,
      timesShown: offer.timesShown || 0,
      timesAccepted: offer.timesAccepted || 0,
      acceptanceRate: Math.round(acceptanceRate * 100) / 100,
      totalRevenue: offer.totalRevenue || 0,
      periodRevenue: offerRevenue,
      periodAcceptances: offerAcceptances.length
    };
  });
  
  // Sort by revenue in period
  offerAnalytics.sort((a, b) => b.periodRevenue - a.periodRevenue);
  
  return {
    totalRevenue,
    totalAcceptances,
    offerAnalytics,
    averageAcceptanceRate: offers.length > 0
      ? Math.round((offers.reduce((sum, o) => sum + (o.timesShown > 0 ? (o.timesAccepted / o.timesShown) : 0, 0) / offers.length) * 10000) / 100)
      : 0
  };
}

/**
 * Get upsell suggestions based on job characteristics
 * @param {string} tenantId - Tenant ID
 * @param {object} jobData - Job data
 * @returns {Promise<Array>} Suggested upsells with scores
 */
export async function getUpsellSuggestions(tenantId, jobData) {
  const relevantOffers = await getRelevantUpsellOffers(tenantId, jobData);
  
  // Score each offer based on relevance
  const scoredOffers = relevantOffers.map(offer => {
    let score = 50; // Base score
    
    // Boost score based on historical acceptance rate
    if (offer.timesShown > 0) {
      const acceptanceRate = offer.timesAccepted / offer.timesShown;
      score += acceptanceRate * 30; // Up to 30 points for high acceptance
    }
    
    // Boost score for higher-priced jobs (customers more likely to add on)
    if (jobData.price > 200) {
      score += 10;
    }
    
    // Boost score for deep clean services
    if (jobData.serviceType === 'deep_clean') {
      score += 15;
    }
    
    // Boost score for move-out services
    if (jobData.serviceType === 'move_out') {
      score += 20;
    }
    
    return {
      ...offer,
      suggestionScore: Math.min(100, Math.round(score))
    };
  });
  
  // Sort by suggestion score
  scoredOffers.sort((a, b) => b.suggestionScore - a.suggestionScore);
  
  // Return top 3 suggestions
  return scoredOffers.slice(0, 3);
}

/**
 * Update upsell offer
 * @param {string} tenantId - Tenant ID
 * @param {string} offerId - Offer ID
 * @param {object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updateUpsellOffer(tenantId, offerId, updates) {
  const offerRef = doc(db, 'tenants', tenantId, 'upsell_offers', offerId);
  await updateDoc(offerRef, {
    ...updates,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Delete upsell offer
 * @param {string} tenantId - Tenant ID
 * @param {string} offerId - Offer ID
 * @returns {Promise<void>}
 */
export async function deleteUpsellOffer(tenantId, offerId) {
  const offerRef = doc(db, 'tenants', tenantId, 'upsell_offers', offerId);
  await updateDoc(offerRef, {
    active: false,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Subscribe to upsell offers changes
 * @param {string} tenantId - Tenant ID
 * @param {function} callback - Callback function
 * @returns {function} Unsubscribe function
 */
export function subscribeToUpsellOffers(tenantId, callback) {
  const offersRef = collection(db, 'tenants', tenantId, 'upsell_offers');
  const q = query(offersRef, orderBy('name'));
  
  return onSnapshot(q, (snapshot) => {
    const offers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(offers);
  });
}

/**
 * Get pre-defined upsell templates
 * @returns {Array} Common upsell offers for cleaning companies
 */
export function getUpsellTemplates() {
  return [
    {
      name: 'Deep Clean Fridge',
      description: 'Thorough cleaning of refrigerator interior, shelves, and drawers',
      price: 35,
      category: 'add-on',
      applicableServiceTypes: ['standard', 'deep_clean'],
      showOnEstimate: true,
      showOnBooking: true
    },
    {
      name: 'Oven Cleaning',
      description: 'Professional oven deep cleaning including racks and door',
      price: 45,
      category: 'add-on',
      applicableServiceTypes: ['standard', 'deep_clean'],
      showOnEstimate: true,
      showOnBooking: true
    },
    {
      name: 'Window Cleaning',
      description: 'Interior window cleaning (up to 10 windows)',
      price: 50,
      category: 'add-on',
      applicableServiceTypes: ['standard', 'deep_clean'],
      showOnEstimate: true,
      showOnBooking: true
    },
    {
      name: 'Baseboard Cleaning',
      description: 'Detailed cleaning of all baseboards throughout the home',
      price: 40,
      category: 'add-on',
      applicableServiceTypes: ['deep_clean'],
      showOnEstimate: true,
      showOnBooking: true
    },
    {
      name: 'Blind Cleaning',
      description: 'Dusting and cleaning of window blinds',
      price: 30,
      category: 'add-on',
      applicableServiceTypes: ['standard', 'deep_clean'],
      showOnEstimate: true,
      showOnBooking: true
    },
    {
      name: 'Cabinet Interior',
      description: 'Cleaning inside kitchen and bathroom cabinets',
      price: 55,
      category: 'add-on',
      applicableServiceTypes: ['deep_clean', 'move_out'],
      showOnEstimate: true,
      showOnBooking: true
    },
    {
      name: 'Appliance Detailing',
      description: 'Exterior cleaning of all kitchen appliances',
      price: 35,
      category: 'add-on',
      applicableServiceTypes: ['standard', 'deep_clean'],
      showOnEstimate: true,
      showOnBooking: true
    },
    {
      name: 'Carpet Deodorizing',
      description: 'Professional carpet deodorizing treatment',
      price: 60,
      category: 'add-on',
      applicableServiceTypes: ['standard', 'deep_clean'],
      showOnEstimate: true,
      showOnBooking: true
    },
    {
      name: 'Move-Out Deep Clean',
      description: 'Comprehensive deep clean for move-out situations',
      price: 150,
      category: 'service_upgrade',
      applicableServiceTypes: ['standard'],
      minPrice: 100,
      showOnEstimate: true,
      showOnBooking: true
    },
    {
      name: 'Post-Construction Clean',
      description: 'Specialized cleaning after construction or renovation',
      price: 200,
      category: 'service_upgrade',
      applicableServiceTypes: ['standard', 'deep_clean'],
      minPrice: 150,
      showOnEstimate: true,
      showOnBooking: true
    }
  ];
}

/**
 * Create upsell offers from templates
 * @param {string} tenantId - Tenant ID
 * @param {Array} templateIds - Template IDs to create
 * @returns {Promise<Array>} Created offers
 */
export async function createOffersFromTemplates(tenantId, templateIds) {
  const templates = getUpsellTemplates();
  const selectedTemplates = templates.filter(t => templateIds.includes(t.name));
  
  const createdOffers = [];
  for (const template of selectedTemplates) {
    const offerRef = await createUpsellOffer(tenantId, template);
    createdOffers.push({ id: offerRef.id, ...template });
  }
  
  return createdOffers;
}
