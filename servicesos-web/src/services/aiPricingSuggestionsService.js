// src/services/aiPricingSuggestionsService.js
/**
 * AI Pricing Suggestions Service
 * Provides pricing suggestions (low risk, market, premium) based on local market
 */

import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../firebase';

// AI Backend configuration
const AI_BACKEND_URL = window.REACT_APP_AI_BACKEND_URL || 'http://localhost:5000';

/**
 * Get pricing suggestions based on property details and local market
 * @param {Object} propertyData - Property details (rooms, sqft, location, etc.)
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Pricing suggestions
 */
export async function getPricingSuggestions(propertyData, tenantId) {
  try {
    const response = await fetch(`${AI_BACKEND_URL}/pricing-suggestions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        propertyData,
        tenantId
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to get pricing suggestions');
    }
    
    const result = await response.json();
    
    return {
      lowRisk: result.lowRisk || {},
      market: result.market || {},
      premium: result.premium || {},
      confidence: result.confidence || 0,
      factors: result.factors || []
    };
  } catch (error) {
    console.error('Error getting pricing suggestions:', error);
    // Fallback to local calculation
    return calculateLocalPricingSuggestions(propertyData, tenantId);
  }
}

/**
 * Calculate pricing suggestions locally (fallback)
 * @param {Object} propertyData - Property details
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Pricing suggestions
 */
async function calculateLocalPricingSuggestions(propertyData) {
  const rooms = propertyData.rooms || [];
  const sqft = propertyData.sqft || 0;
  const location = propertyData.location || '';
  
  // Base pricing per room type
  const roomBasePrices = {
    kitchen: { low: 40, market: 50, premium: 65 },
    bath: { low: 25, market: 30, premium: 40 },
    bathroom: { low: 25, market: 30, premium: 40 },
    bedroom: { low: 30, market: 35, premium: 45 },
    living: { low: 35, market: 40, premium: 55 },
    dining: { low: 25, market: 30, premium: 40 },
    office: { low: 20, market: 25, premium: 35 },
    garage: { low: 30, market: 40, premium: 50 },
    basement: { low: 40, market: 50, premium: 70 },
    laundry: { low: 15, market: 20, premium: 25 },
    closet: { low: 10, market: 15, premium: 20 }
  };
  
  // Calculate totals for each tier
  let lowRiskTotal = 0;
  let marketTotal = 0;
  let premiumTotal = 0;
  
  rooms.forEach(room => {
    const roomType = room.type?.toLowerCase() || 'unknown';
    const pricing = roomBasePrices[roomType] || { low: 25, market: 30, premium: 40 };
    
    // Adjust for room size
    const sizeMultiplier = room.sqft ? room.sqft / 100 : 1;
    
    lowRiskTotal += pricing.low * sizeMultiplier;
    marketTotal += pricing.market * sizeMultiplier;
    premiumTotal += pricing.premium * sizeMultiplier;
  });
  
  // Adjust for property size
  const sizeMultiplier = sqft > 0 ? Math.sqrt(sqft / 1000) : 1;
  
  // Adjust for location (simplified)
  const locationMultiplier = location.toLowerCase().includes('downtown') ? 1.2 : 1.0;
  
  return {
    lowRisk: {
      estimatedPrice: Math.round(lowRiskTotal * sizeMultiplier * locationMultiplier),
      estimatedHours: Math.round(lowRiskTotal / 30),
      pricePerSqft: sqft > 0 ? Math.round((lowRiskTotal * sizeMultiplier * locationMultiplier) / sqft * 100) / 100 : 0
    },
    market: {
      estimatedPrice: Math.round(marketTotal * sizeMultiplier * locationMultiplier),
      estimatedHours: Math.round(marketTotal / 30),
      pricePerSqft: sqft > 0 ? Math.round((marketTotal * sizeMultiplier * locationMultiplier) / sqft * 100) / 100 : 0
    },
    premium: {
      estimatedPrice: Math.round(premiumTotal * sizeMultiplier * locationMultiplier),
      estimatedHours: Math.round(premiumTotal / 30),
      pricePerSqft: sqft > 0 ? Math.round((premiumTotal * sizeMultiplier * locationMultiplier) / sqft * 100) / 100 : 0
    },
    confidence: 70,
    factors: [
      { name: 'Room Count', value: rooms.length, impact: 'high' },
      { name: 'Property Size', value: sqft, impact: 'medium' },
      { name: 'Location', value: location, impact: 'medium' }
    ]
  };
}

/**
 * Get market pricing data for a location
 * @param {string} location - Location (city, zip code, etc.)
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Market pricing data
 */
export async function getMarketPricingData(location, tenantId) {
  try {
    const response = await fetch(`${AI_BACKEND_URL}/market-pricing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        location,
        tenantId
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to get market pricing data');
    }
    
    const result = await response.json();
    
    return {
      averagePrice: result.averagePrice || 0,
      priceRange: result.priceRange || { min: 0, max: 0 },
      pricePerSqft: result.pricePerSqft || 0,
      competitorCount: result.competitorCount || 0,
      marketTrend: result.marketTrend || 'stable'
    };
  } catch (error) {
    console.error('Error getting market pricing data:', error);
    return {
      averagePrice: 150,
      priceRange: { min: 100, max: 250 },
      pricePerSqft: 0.15,
      competitorCount: 5,
      marketTrend: 'stable'
    };
  }
}

/**
 * Get historical pricing data for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Historical pricing data
 */
export async function getHistoricalPricingData(tenantId) {
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const querySnap = await getDocs(jobsRef);
  
  const jobs = querySnap.docs.map(doc => doc.data());
  const completedJobs = jobs.filter(job => job.status === 'completed' && job.finalPrice);
  
  if (completedJobs.length === 0) {
    return {
      averagePrice: 0,
      priceRange: { min: 0, max: 0 },
      pricePerSqft: 0,
      totalJobs: 0
    };
  }
  
  const prices = completedJobs.map(job => job.finalPrice);
  const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  
  // Calculate average price per sqft
  const sqftData = completedJobs.filter(job => job.sqft);
  const avgPricePerSqft = sqftData.length > 0
    ? sqftData.reduce((sum, job) => sum + (job.finalPrice / job.sqft), 0) / sqftData.length
    : 0;
  
  return {
    averagePrice: Math.round(averagePrice),
    priceRange: { min: minPrice, max: maxPrice },
    pricePerSqft: Math.round(avgPricePerSqft * 100) / 100,
    totalJobs: completedJobs.length
  };
}

/**
 * Compare pricing suggestion to historical data
 * @param {Object} suggestion - Pricing suggestion
 * @param {Object} historicalData - Historical pricing data
 * @returns {Promise<Object>} Comparison result
 */
export async function comparePricingToHistory(suggestion, historicalData) {
  const marketPrice = suggestion.market?.estimatedPrice || 0;
  const historicalAvg = historicalData.averagePrice || 0;
  
  const difference = marketPrice - historicalAvg;
  const percentage = historicalAvg > 0 ? (difference / historicalAvg) * 100 : 0;
  
  let recommendation = 'market';
  if (percentage > 20) {
    recommendation = 'low_risk';
  } else if (percentage < -10) {
    recommendation = 'premium';
  }
  
  return {
    difference,
    percentage: Math.round(percentage * 10) / 10,
    recommendation,
    historicalAverage: historicalAvg,
    suggestedPrice: marketPrice
  };
}

/**
 * Get pricing factors analysis
 * @param {Object} propertyData - Property details
 * @returns {Promise<Array>} Array of pricing factors
 */
export async function getPricingFactors(propertyData) {
  const factors = [];
  
  // Room count factor
  const roomCount = propertyData.rooms?.length || 0;
  factors.push({
    name: 'Room Count',
    value: roomCount,
    impact: roomCount > 5 ? 'high' : roomCount > 2 ? 'medium' : 'low',
    description: `${roomCount} rooms to clean`
  });
  
  // Property size factor
  const sqft = propertyData.sqft || 0;
  factors.push({
    name: 'Property Size',
    value: sqft,
    impact: sqft > 2000 ? 'high' : sqft > 1000 ? 'medium' : 'low',
    description: `${sqft} sqft property`
  });
  
  // Location factor
  const location = propertyData.location || '';
  const isPremiumLocation = location.toLowerCase().includes('downtown') || 
                            location.toLowerCase().includes('luxury') ||
                            location.toLowerCase().includes('high-end');
  factors.push({
    name: 'Location',
    value: location,
    impact: isPremiumLocation ? 'high' : 'medium',
    description: isPremiumLocation ? 'Premium location' : 'Standard location'
  });
  
  // Condition factor
  const condition = propertyData.condition || 'standard';
  factors.push({
    name: 'Property Condition',
    value: condition,
    impact: condition === 'poor' ? 'high' : condition === 'excellent' ? 'low' : 'medium',
    description: `${condition} condition`
  });
  
  // Frequency factor
  const frequency = propertyData.frequency || 'one-time';
  factors.push({
    name: 'Service Frequency',
    value: frequency,
    impact: frequency === 'weekly' ? 'low' : frequency === 'one-time' ? 'high' : 'medium',
    description: `${frequency} service`
  });
  
  return factors;
}

/**
 * Save pricing suggestion to Firestore
 * @param {string} tenantId - Tenant ID
 * @param {string} leadId - Lead ID
 * @param {Object} suggestion - Pricing suggestion
 * @returns {Promise<void>}
 */
export async function savePricingSuggestion(tenantId, leadId, suggestion) {
  const suggestionsRef = collection(db, 'tenants', tenantId, 'pricing_suggestions');
  await addDoc(suggestionsRef, {
    leadId,
    lowRisk: suggestion.lowRisk,
    market: suggestion.market,
    premium: suggestion.premium,
    confidence: suggestion.confidence,
    factors: suggestion.factors,
    createdAt: new Date().toISOString()
  });
}

/**
 * Get saved pricing suggestion for a lead
 * @param {string} tenantId - Tenant ID
 * @param {string} leadId - Lead ID
 * @returns {Promise<Object>} Pricing suggestion
 */
export async function getPricingSuggestionForLead(tenantId, leadId) {
  const suggestionsRef = collection(db, 'tenants', tenantId, 'pricing_suggestions');
  const q = query(suggestionsRef, where('leadId', '==', leadId));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    return null;
  }
  
  const doc = querySnap.docs[0];
  return { id: doc.id, ...doc.data() };
}
