// src/services/franchiseManagementService.js

/**
 * Franchise Management Service
 * Enterprise features for multi-location cleaning businesses
 * Handles franchise locations, performance tracking, and enterprise reporting
 */

const FRANCHISES_KEY = 'franchises_v1';
const LOCATIONS_KEY = 'franchise_locations_v1';

// ==================== Franchise Management ====================

/**
 * Get all franchises
 */
export function getFranchises() {
  const data = localStorage.getItem(FRANCHISES_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Add new franchise
 */
export function addFranchise(franchise) {
  const franchises = getFranchises();
  const newFranchise = {
    id: 'franchise_' + Date.now(),
    ...franchise,
    status: 'active',
    createdAt: new Date().toISOString(),
    locations: [],
    metrics: {
      totalRevenue: 0,
      totalJobs: 0,
      averageRating: 0,
      activeLocations: 0
    }
  };
  franchises.push(newFranchise);
  localStorage.setItem(FRANCHISES_KEY, JSON.stringify(franchises));
  return newFranchise;
}

/**
 * Update franchise
 */
export function updateFranchise(franchiseId, updates) {
  const franchises = getFranchises();
  const index = franchises.findIndex(f => f.id === franchiseId);
  if (index !== -1) {
    franchises[index] = { ...franchises[index], ...updates, updatedAt: new Date().toISOString() };
    localStorage.setItem(FRANCHISES_KEY, JSON.stringify(franchises));
    return franchises[index];
  }
  return null;
}

/**
 * Delete franchise
 */
export function deleteFranchise(franchiseId) {
  const franchises = getFranchises().filter(f => f.id !== franchiseId);
  localStorage.setItem(FRANCHISES_KEY, JSON.stringify(franchises));
  
  // Also delete associated locations
  const locations = getLocations().filter(l => l.franchiseId !== franchiseId);
  localStorage.setItem(LOCATIONS_KEY, JSON.stringify(locations));
}

/**
 * Get franchise by ID
 */
export function getFranchise(franchiseId) {
  const franchises = getFranchises();
  return franchises.find(f => f.id === franchiseId) || null;
}

// ==================== Location Management ====================

/**
 * Get all locations
 */
export function getLocations() {
  const data = localStorage.getItem(LOCATIONS_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Get locations by franchise
 */
export function getLocationsByFranchise(franchiseId) {
  const locations = getLocations();
  return locations.filter(l => l.franchiseId === franchiseId);
}

/**
 * Add new location
 */
export function addLocation(location) {
  const locations = getLocations();
  const newLocation = {
    id: 'location_' + Date.now(),
    ...location,
    status: 'active',
    createdAt: new Date().toISOString(),
    metrics: {
      revenue: 0,
      jobs: 0,
      employees: 0,
      rating: 0
    }
  };
  locations.push(newLocation);
  localStorage.setItem(LOCATIONS_KEY, JSON.stringify(locations));
  
  // Update franchise location count
  updateFranchiseLocationCount(location.franchiseId);
  
  return newLocation;
}

/**
 * Update location
 */
export function updateLocation(locationId, updates) {
  const locations = getLocations();
  const index = locations.findIndex(l => l.id === locationId);
  if (index !== -1) {
    locations[index] = { ...locations[index], ...updates, updatedAt: new Date().toISOString() };
    localStorage.setItem(LOCATIONS_KEY, JSON.stringify(locations));
    return locations[index];
  }
  return null;
}

/**
 * Delete location
 */
export function deleteLocation(locationId) {
  const locations = getLocations();
  const location = locations.find(l => l.id === locationId);
  const updatedLocations = locations.filter(l => l.id !== locationId);
  localStorage.setItem(LOCATIONS_KEY, JSON.stringify(updatedLocations));
  
  if (location) {
    updateFranchiseLocationCount(location.franchiseId);
  }
}

/**
 * Update franchise location count
 */
function updateFranchiseLocationCount(franchiseId) {
  const locations = getLocationsByFranchise(franchiseId);
  const activeCount = locations.filter(l => l.status === 'active').length;
  updateFranchise(franchiseId, { 
    activeLocations: activeCount,
    totalLocations: locations.length 
  });
}

// ==================== Performance Metrics ====================

/**
 * Get franchise metrics
 */
export function getFranchiseMetrics(franchiseId, startDate = null, endDate = null) {
  const locations = getLocationsByFranchise(franchiseId);
  
  const metrics = {
    totalRevenue: 0,
    totalJobs: 0,
    averageRating: 0,
    totalEmployees: 0,
    locationMetrics: []
  };
  
  locations.forEach(location => {
    const locationMetrics = getLocationMetrics(location.id, startDate, endDate);
    metrics.totalRevenue += locationMetrics.revenue;
    metrics.totalJobs += locationMetrics.jobs;
    metrics.totalEmployees += locationMetrics.employees;
    metrics.locationMetrics.push(locationMetrics);
  });
  
  // Calculate average rating
  const ratedLocations = metrics.locationMetrics.filter(l => l.rating > 0);
  if (ratedLocations.length > 0) {
    metrics.averageRating = ratedLocations.reduce((sum, l) => sum + l.rating, 0) / ratedLocations.length;
  }
  
  return metrics;
}

/**
 * Get location metrics
 */
export function getLocationMetrics(locationId) {
  const locations = getLocations();
  const location = locations.find(l => l.id === locationId);
  
  if (!location) {
    return { revenue: 0, jobs: 0, employees: 0, rating: 0 };
  }
  
  // In production, this would query actual data from the date range
  // For now, return stored metrics
  return {
    revenue: location.metrics.revenue || 0,
    jobs: location.metrics.jobs || 0,
    employees: location.metrics.employees || 0,
    rating: location.metrics.rating || 0
  };
}

/**
 * Update location metrics
 */
export function updateLocationMetrics(locationId, metricsUpdate) {
  const locations = getLocations();
  const index = locations.findIndex(l => l.id === locationId);
  
  if (index !== -1) {
    locations[index].metrics = {
      ...locations[index].metrics,
      ...metricsUpdate
    };
    localStorage.setItem(LOCATIONS_KEY, JSON.stringify(locations));
    return locations[index];
  }
  
  return null;
}

/**
 * Get enterprise-wide metrics
 */
export function getEnterpriseMetrics() {
  const franchises = getFranchises();
  const locations = getLocations();
  
  const metrics = {
    totalFranchises: franchises.length,
    totalLocations: locations.length,
    totalRevenue: 0,
    totalJobs: 0,
    totalEmployees: 0,
    averageRating: 0,
    topPerformers: {
      franchises: [],
      locations: []
    }
  };
  
  // Aggregate metrics
  franchises.forEach(franchise => {
    const franchiseMetrics = getFranchiseMetrics(franchise.id);
    metrics.totalRevenue += franchiseMetrics.totalRevenue;
    metrics.totalJobs += franchiseMetrics.totalJobs;
    metrics.totalEmployees += franchiseMetrics.totalEmployees;
    
    // Track top performers
    metrics.topPerformers.franchises.push({
      id: franchise.id,
      name: franchise.name,
      revenue: franchiseMetrics.totalRevenue,
      jobs: franchiseMetrics.totalJobs
    });
  });
  
  locations.forEach(location => {
    metrics.topPerformers.locations.push({
      id: location.id,
      name: location.name,
      revenue: location.metrics.revenue,
      jobs: location.metrics.jobs,
      rating: location.metrics.rating
    });
  });
  
  // Calculate average rating
  const ratedLocations = locations.filter(l => l.metrics.rating > 0);
  if (ratedLocations.length > 0) {
    metrics.averageRating = ratedLocations.reduce((sum, l) => sum + l.metrics.rating, 0) / ratedLocations.length;
  }
  
  // Sort top performers
  metrics.topPerformers.franchises.sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  metrics.topPerformers.locations.sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  
  return metrics;
}

// ==================== Reporting ====================

/**
 * Generate franchise performance report
 */
export function generateFranchiseReport(franchiseId, startDate, endDate) {
  console.log('Generating franchise report for:', franchiseId, 'from', startDate, 'to', endDate);
  const franchise = getFranchise(franchiseId);
  if (!franchise) {
    return { success: false, error: 'Franchise not found' };
  }
  
  const metrics = getFranchiseMetrics(franchiseId, startDate, endDate);
  const locations = getLocationsByFranchise(franchiseId);
  
  const report = {
    franchise: {
      id: franchise.id,
      name: franchise.name,
      owner: franchise.owner
    },
    period: {
      startDate,
      endDate
    },
    summary: {
      totalRevenue: metrics.totalRevenue,
      totalJobs: metrics.totalJobs,
      averageJobValue: metrics.totalJobs > 0 ? metrics.totalRevenue / metrics.totalJobs : 0,
      averageRating: metrics.averageRating,
      activeLocations: locations.filter(l => l.status === 'active').length
    },
    locationBreakdown: metrics.locationMetrics,
    trends: {
      revenueGrowth: calculateGrowthRate(franchiseId, 'revenue'),
      jobGrowth: calculateGrowthRate(franchiseId, 'jobs'),
      ratingTrend: calculateRatingTrend(franchiseId)
    },
    recommendations: generateFranchiseRecommendations(metrics)
  };
  
  return { success: true, report };
}

/**
 * Calculate growth rate for a metric
 */
function calculateGrowthRate(franchiseId, metric) {
  // In production, this would compare current period with previous period
  console.log('Calculating growth rate for:', franchiseId, 'metric:', metric);
  // For now, return simulated growth
  return (Math.random() * 20 - 5).toFixed(1); // -5% to +15%
}

/**
 * Calculate rating trend
 */
function calculateRatingTrend(franchiseId) {
  // In production, this would analyze rating changes over time
  console.log('Calculating rating trend for:', franchiseId);
  return 'stable';
}

/**
 * Generate franchise recommendations
 */
function generateFranchiseRecommendations(metrics) {
  const recommendations = [];
  
  if (metrics.averageRating < 4.0) {
    recommendations.push({
      priority: 'high',
      category: 'quality',
      action: 'Focus on improving customer satisfaction',
      details: 'Average rating below 4.0 suggests service quality issues'
    });
  }
  
  if (metrics.totalJobs < 50) {
    recommendations.push({
      priority: 'medium',
      category: 'growth',
      action: 'Increase marketing efforts',
      details: 'Low job count indicates need for customer acquisition'
    });
  }
  
  if (metrics.totalEmployees < metrics.totalJobs / 10) {
    recommendations.push({
      priority: 'high',
      category: 'staffing',
      action: 'Hire additional staff',
      details: 'Staffing levels may be insufficient for current workload'
    });
  }
  
  return recommendations;
}

/**
 * Generate enterprise report
 */
export function generateEnterpriseReport(startDate, endDate) {
  console.log('Generating enterprise report from', startDate, 'to', endDate);
  const metrics = getEnterpriseMetrics();
  const franchises = getFranchises();
  
  const report = {
    period: {
      startDate,
      endDate
    },
    executiveSummary: {
      totalFranchises: metrics.totalFranchises,
      totalLocations: metrics.totalLocations,
      totalRevenue: metrics.totalRevenue,
      totalJobs: metrics.totalJobs,
      averageRating: metrics.averageRating
    },
    franchisePerformance: franchises.map(f => {
      const franchiseMetrics = getFranchiseMetrics(f.id);
      return {
        id: f.id,
        name: f.name,
        revenue: franchiseMetrics.totalRevenue,
        jobs: franchiseMetrics.totalJobs,
        rating: franchiseMetrics.averageRating,
        locations: franchiseMetrics.locationMetrics.length
      };
    }),
    topPerformers: metrics.topPerformers,
    marketAnalysis: {
      averageRevenuePerFranchise: metrics.totalFranchises > 0 ? metrics.totalRevenue / metrics.totalFranchises : 0,
      averageRevenuePerLocation: metrics.totalLocations > 0 ? metrics.totalRevenue / metrics.totalLocations : 0,
      averageJobsPerLocation: metrics.totalLocations > 0 ? metrics.totalJobs / metrics.totalLocations : 0
    }
  };
  
  return { success: true, report };
}

// ==================== Territory Management ====================

/**
 * Check for territory conflicts
 */
export function checkTerritoryConflicts(franchiseId, newLocation) {
  const allLocations = getLocations();
  const conflicts = [];
  
  allLocations.forEach(location => {
    if (location.franchiseId !== franchiseId) {
      // Check if locations are too close (simplified - use actual geocoding in production)
      const distance = calculateDistance(location.address, newLocation.address);
      if (distance < 5) { // 5 miles
        conflicts.push({
          conflictingLocation: location,
          distance: distance,
          severity: distance < 2 ? 'high' : 'medium'
        });
      }
    }
  });
  
  return conflicts;
}

/**
 * Simple distance calculation (placeholder)
 */
function calculateDistance(address1, address2) {
  // In production, use geocoding and actual distance calculation
  console.log('Calculating distance between:', address1, 'and', address2);
  // For now, return simulated distance
  return Math.random() * 10;
}

/**
 * Define franchise territory
 */
export function defineFranchiseTerritory(franchiseId, territory) {
  const franchise = getFranchise(franchiseId);
  if (!franchise) {
    return { success: false, error: 'Franchise not found' };
  }
  
  return updateFranchise(franchiseId, {
    territory: {
      ...territory,
      definedAt: new Date().toISOString()
    }
  });
}

// ==================== Compliance & Reporting ====================

/**
 * Get compliance status for franchise
 */
export function getFranchiseCompliance(franchiseId) {
  const franchise = getFranchise(franchiseId);
  if (!franchise) {
    return { success: false, error: 'Franchise not found' };
  }
  
  const compliance = {
    overallStatus: 'compliant',
    items: [
      {
        category: 'insurance',
        status: 'compliant',
        expiryDate: franchise.insuranceExpiry || '2025-12-31',
        lastVerified: new Date().toISOString()
      },
      {
        category: 'licensing',
        status: 'compliant',
        expiryDate: franchise.licenseExpiry || '2025-12-31',
        lastVerified: new Date().toISOString()
      },
      {
        category: 'training',
        status: franchise.trainingComplete ? 'compliant' : 'pending',
        lastVerified: franchise.trainingDate || null
      },
      {
        category: 'branding',
        status: 'compliant',
        lastVerified: new Date().toISOString()
      }
    ]
  };
  
  // Check for any non-compliant items
  const nonCompliant = compliance.items.filter(item => item.status !== 'compliant');
  if (nonCompliant.length > 0) {
    compliance.overallStatus = 'attention_needed';
  }
  
  return { success: true, compliance };
}

/**
 * Generate compliance report
 */
export function generateComplianceReport(franchiseId) {
  const complianceResult = getFranchiseCompliance(franchiseId);
  if (!complianceResult.success) {
    return complianceResult;
  }
  
  const report = {
    franchiseId,
    generatedAt: new Date().toISOString(),
    overallStatus: complianceResult.compliance.overallStatus,
    complianceItems: complianceResult.compliance.items,
    actionItems: complianceResult.compliance.items
      .filter(item => item.status !== 'compliant')
      .map(item => ({
        category: item.category,
        requiredAction: `Complete ${item.category} requirements`,
        deadline: item.expiryDate || 'ASAP'
      }))
  };
  
  return { success: true, report };
}
