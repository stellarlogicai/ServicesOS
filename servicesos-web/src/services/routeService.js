// src/services/routeService.js
/**
 * Route Service
 * Handles travel time estimation and route optimization using OpenRouteService
 */

// OpenRouteService API configuration
const ORS_API_KEY = import.meta.env.VITE_ORS_API_KEY || '';
const ORS_BASE_URL = 'https://api.openrouteservice.org';

/**
 * Get travel time between two locations
 * @param {Object} origin - Origin location {lat, lng} or address string
 * @param {Object} destination - Destination location {lat, lng} or address string
 * @returns {Promise<Object>} Travel time and distance
 */
export async function getTravelTime(origin, destination) {
  try {
    // Convert addresses to coordinates if needed
    let originCoords = origin;
    let destCoords = destination;
    
    if (typeof origin === 'string') {
      originCoords = await geocodeAddress(origin);
    }
    
    if (typeof destination === 'string') {
      destCoords = await geocodeAddress(destination);
    }
    
    if (!originCoords || !destCoords) {
      throw new Error('Failed to geocode locations');
    }
    
    // Call OpenRouteService API
    const response = await fetch(
      `${ORS_BASE_URL}/v2/directions/driving-car?start=${originCoords.lng},${originCoords.lat}&end=${destCoords.lng},${destCoords.lat}`,
      {
        headers: {
          'Authorization': ORS_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`ORS API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.features || data.features.length === 0) {
      throw new Error('No route found');
    }
    
    const route = data.features[0];
    const distance = route.properties.segments[0].distance; // meters
    const duration = route.properties.segments[0].duration; // seconds
    
    return {
      distance: Math.round(distance / 1609.34 * 100) / 100, // miles
      duration: Math.round(duration / 60), // minutes
      distanceMeters: distance,
      durationSeconds: duration,
      geometry: route.geometry
    };
    
  } catch (error) {
    console.error('Travel time calculation error:', error);
    // Return fallback estimates
    return getFallbackTravelTime(origin, destination);
  }
}

/**
 * Geocode address to coordinates
 * @param {string} address - Address string
 * @returns {Promise<Object|null>} Coordinates {lat, lng}
 */
async function geocodeAddress(address) {
  try {
    const response = await fetch(
      `${ORS_BASE_URL}/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(address)}`,
      {
        headers: {
          'Authorization': ORS_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Geocoding error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.features || data.features.length === 0) {
      return null;
    }
    
    const coords = data.features[0].geometry.coordinates;
    return {
      lat: coords[1],
      lng: coords[0]
    };
    
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

/**
 * Get fallback travel time estimation (straight-line distance)
 * @param {Object} origin - Origin location
 * @param {Object} destination - Destination location
 * @returns {Object} Estimated travel time and distance
 */
function getFallbackTravelTime(origin, destination) {
  // Simple fallback: estimate based on straight-line distance
  // This is less accurate but provides a reasonable estimate
  
  let originCoords = origin;
  let destCoords = destination;
  
  if (typeof origin === 'string' || typeof destination === 'string') {
    // If we have addresses but no geocoding, return a default estimate
    return {
      distance: 5, // 5 miles default
      duration: 15, // 15 minutes default
      distanceMeters: 8047,
      durationSeconds: 900,
      geometry: null,
      fallback: true
    };
  }
  
  // Calculate straight-line distance (Haversine formula)
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(destCoords.lat - originCoords.lat);
  const dLon = toRad(destCoords.lng - originCoords.lng);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(originCoords.lat)) * Math.cos(toRad(destCoords.lat)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  // Estimate duration (assume average 30 mph in urban areas)
  const duration = Math.round((distance / 30) * 60);
  
  return {
    distance: Math.round(distance * 100) / 100,
    duration: duration,
    distanceMeters: distance * 1609.34,
    durationSeconds: duration * 60,
    geometry: null,
    fallback: true
  };
}

/**
 * Convert degrees to radians
 * @param {number} degrees - Degrees
 * @returns {number} Radians
 */
function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Get travel time matrix for multiple locations
 * @param {Array} locations - Array of locations {lat, lng}
 * @returns {Promise<Array>} Travel time matrix
 */
export async function getTravelTimeMatrix(locations) {
  if (locations.length < 2) {
    return [];
  }
  
  try {
    // Format coordinates for ORS
    const coordinates = locations.map(loc => [loc.lng, loc.lat]);
    
    const response = await fetch(
      `${ORS_BASE_URL}/v2/matrix/driving-car`,
      {
        method: 'POST',
        headers: {
          'Authorization': ORS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          locations: coordinates,
          metrics: ['duration', 'distance']
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`Matrix API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return data.durations.map((row, i) => 
      row.map((duration, j) => ({
        from: i,
        to: j,
        duration: Math.round(duration / 60), // minutes
        distance: Math.round(data.distances[i][j] / 1609.34 * 100) / 100 // miles
      }))
    );
    
  } catch (error) {
    console.error('Travel time matrix error:', error);
    // Fallback: calculate pairwise distances
    return calculateFallbackMatrix(locations);
  }
}

/**
 * Calculate fallback travel time matrix
 * @param {Array} locations - Array of locations
 * @returns {Array} Travel time matrix
 */
function calculateFallbackMatrix(locations) {
  const matrix = [];
  
  for (let i = 0; i < locations.length; i++) {
    const row = [];
    for (let j = 0; j < locations.length; j++) {
      if (i === j) {
        row.push({ from: i, to: j, duration: 0, distance: 0 });
      } else {
        const result = getFallbackTravelTime(locations[i], locations[j]);
        row.push({
          from: i,
          to: j,
          duration: result.duration,
          distance: result.distance
        });
      }
    }
    matrix.push(row);
  }
  
  return matrix;
}

/**
 * Optimize route for multiple stops (simple nearest neighbor)
 * @param {Array} stops - Array of stops {lat, lng, name}
 * @param {Object} start - Starting location {lat, lng}
 * @returns {Promise<Object>} Optimized route
 */
export async function optimizeRoute(stops, start) {
  if (stops.length === 0) {
    return { route: [], totalDistance: 0, totalDuration: 0 };
  }
  
  try {
    const allLocations = [start, ...stops];
    const matrix = await getTravelTimeMatrix(allLocations);
    
    // Simple nearest neighbor algorithm
    const visited = new Set([0]);
    const route = [0];
    let currentIndex = 0;
    let totalDistance = 0;
    let totalDuration = 0;
    
    while (visited.size < allLocations.length) {
      let nearestIndex = -1;
      let shortestDuration = Infinity;
      
      for (let i = 0; i < allLocations.length; i++) {
        if (!visited.has(i)) {
          const duration = matrix[currentIndex][i].duration;
          if (duration < shortestDuration) {
            shortestDuration = duration;
            nearestIndex = i;
          }
        }
      }
      
      if (nearestIndex !== -1) {
        visited.add(nearestIndex);
        route.push(nearestIndex);
        totalDistance += matrix[currentIndex][nearestIndex].distance;
        totalDuration += matrix[currentIndex][nearestIndex].duration;
        currentIndex = nearestIndex;
      } else {
        break;
      }
    }
    
    // Return to start
    if (route.length > 1) {
      totalDistance += matrix[currentIndex][0].distance;
      totalDuration += matrix[currentIndex][0].duration;
      route.push(0);
    }
    
    return {
      route: route.map(index => ({
        ...allLocations[index],
        order: route.indexOf(index)
      })),
      totalDistance: Math.round(totalDistance * 100) / 100,
      totalDuration: totalDuration
    };
    
  } catch (error) {
    console.error('Route optimization error:', error);
    // Return stops in original order
    return {
      route: [start, ...stops],
      totalDistance: 0,
      totalDuration: 0
    };
  }
}

/**
 * Calculate total travel time for a job sequence
 * @param {Array} jobs - Array of jobs with locations
 * @param {Object} startLocation - Starting location
 * @returns {Promise<Object>} Total travel time and distance
 */
export async function calculateTotalTravelTime(jobs, startLocation) {
  if (jobs.length === 0) {
    return { totalDistance: 0, totalDuration: 0 };
  }
  
  let totalDistance = 0;
  let totalDuration = 0;
  let currentLocation = startLocation;
  
  for (const job of jobs) {
    const result = await getTravelTime(currentLocation, job.location);
    totalDistance += result.distance;
    totalDuration += result.duration;
    currentLocation = job.location;
  }
  
  return {
    totalDistance: Math.round(totalDistance * 100) / 100,
    totalDuration: totalDuration
  };
}

/**
 * Check if location is within service radius
 * @param {Object} employeeLocation - Employee home location {lat, lng}
 * @param {Object} jobLocation - Job location {lat, lng}
 * @param {number} serviceRadius - Service radius in miles
 * @returns {Promise<boolean>} Whether job is within service radius
 */
export async function isWithinServiceRadius(employeeLocation, jobLocation, serviceRadius) {
  const result = await getTravelTime(employeeLocation, jobLocation);
  return result.distance <= serviceRadius;
}

/**
 * Get estimated arrival time
 * @param {Object} origin - Origin location
 * @param {Object} destination - Destination location
 * @param {Date} departureTime - Departure time
 * @returns {Promise<Date>} Estimated arrival time
 */
export async function getEstimatedArrival(origin, destination, departureTime = new Date()) {
  const result = await getTravelTime(origin, destination);
  const arrivalTime = new Date(departureTime.getTime() + result.durationSeconds * 1000);
  return arrivalTime;
}
