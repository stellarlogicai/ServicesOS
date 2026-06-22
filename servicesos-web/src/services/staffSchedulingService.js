// src/services/staffSchedulingService.js

/**
 * Staff Scheduling Service
 * Handles employee scheduling, route planning, and job check-in functionality
 */

const EMPLOYEES_KEY = 'staff_employees_v1';
const SHIFTS_KEY = 'staff_shifts_v1';

// ==================== Employee Management ====================

/**
 * Get all employees
 */
export function getEmployees() {
  const data = localStorage.getItem(EMPLOYEES_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Add new employee
 */
export function addEmployee(employee) {
  const employees = getEmployees();
  const newEmployee = {
    id: 'emp_' + Date.now(),
    ...employee,
    createdAt: new Date().toISOString(),
    status: 'active'
  };
  employees.push(newEmployee);
  localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(employees));
  return newEmployee;
}

/**
 * Update employee
 */
export function updateEmployee(id, updates) {
  const employees = getEmployees();
  const index = employees.findIndex(e => e.id === id);
  if (index !== -1) {
    employees[index] = { ...employees[index], ...updates, updatedAt: new Date().toISOString() };
    localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(employees));
    return employees[index];
  }
  return null;
}

/**
 * Delete employee
 */
export function deleteEmployee(id) {
  const employees = getEmployees().filter(e => e.id !== id);
  localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(employees));
}

/**
 * Get available employees for a date/time
 */
export function getAvailableEmployees(date, startTime, endTime) {
  const employees = getEmployees().filter(e => e.status === 'active');
  const shifts = getShifts();
  
  // Filter out employees who already have shifts during this time
  const unavailableIds = shifts
    .filter(shift => {
      return shift.date === date && 
             ((shift.startTime >= startTime && shift.startTime < endTime) ||
              (shift.endTime > startTime && shift.endTime <= endTime) ||
              (shift.startTime <= startTime && shift.endTime >= endTime));
    })
    .map(shift => shift.employeeId);
  
  return employees.filter(e => !unavailableIds.includes(e.id));
}

// ==================== Shift Management ====================

/**
 * Get all shifts
 */
export function getShifts() {
  const data = localStorage.getItem(SHIFTS_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Create new shift
 */
export function createShift(shift) {
  const shifts = getShifts();
  const newShift = {
    id: 'shift_' + Date.now(),
    ...shift,
    status: 'scheduled',
    createdAt: new Date().toISOString()
  };
  shifts.push(newShift);
  localStorage.setItem(SHIFTS_KEY, JSON.stringify(shifts));
  return newShift;
}

/**
 * Update shift status
 */
export function updateShiftStatus(id, status, metadata = {}) {
  const shifts = getShifts();
  const index = shifts.findIndex(s => s.id === id);
  if (index !== -1) {
    shifts[index].status = status;
    shifts[index].updatedAt = new Date().toISOString();
    shifts[index] = { ...shifts[index], ...metadata };
    localStorage.setItem(SHIFTS_KEY, JSON.stringify(shifts));
    return shifts[index];
  }
  return null;
}

/**
 * Employee check-in
 */
export function checkIn(shiftId, location = null, notes = '') {
  return updateShiftStatus(shiftId, 'in_progress', {
    checkInTime: new Date().toISOString(),
    checkInLocation: location,
    checkInNotes: notes
  });
}

/**
 * Employee check-out
 */
export function checkOut(shiftId, notes = '', afterPhotos = []) {
  return updateShiftStatus(shiftId, 'completed', {
    checkOutTime: new Date().toISOString(),
    checkOutNotes: notes,
    afterPhotos
  });
}

/**
 * Get shifts for employee
 */
export function getEmployeeShifts(employeeId, startDate = null, endDate = null) {
  const shifts = getShifts().filter(s => s.employeeId === employeeId);
  
  if (startDate && endDate) {
    return shifts.filter(s => s.date >= startDate && s.date <= endDate);
  }
  
  return shifts;
}

/**
 * Get shifts for date range
 */
export function getShiftsByDateRange(startDate, endDate) {
  const shifts = getShifts();
  return shifts.filter(s => s.date >= startDate && s.date <= endDate);
}

// ==================== Route Planning ====================

/**
 * Optimize route for multiple jobs
 * Uses simple nearest-neighbor algorithm for route optimization
 */
export function optimizeRoute(jobs) {
  if (jobs.length <= 1) return jobs;
  
  const optimized = [jobs[0]];
  const remaining = [...jobs.slice(1)];
  
  while (remaining.length > 0) {
    const current = optimized[optimized.length - 1];
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    
    remaining.forEach((job, index) => {
      const distance = calculateDistance(current.address, job.address);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    
    optimized.push(remaining[nearestIndex]);
    remaining.splice(nearestIndex, 1);
  }
  
  return optimized;
}

/**
 * Calculate distance between two addresses (simplified)
 * In production, use Google Maps Distance Matrix API
 */
export function calculateDistance(address1, address2) {
  // Simplified distance calculation based on address string similarity
  // In production, use actual geocoding and distance calculation
  const similarity = stringSimilarity(address1, address2);
  return (1 - similarity) * 10; // Return estimated distance in miles
}

/**
 * Simple string similarity for distance estimation
 */
function stringSimilarity(s1, s2) {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Levenshtein distance for string similarity
 */
function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  
  return dp[m][n];
}

/**
 * Calculate estimated travel time between jobs
 */
export function calculateTravelTime(distance, trafficFactor = 1.0) {
  // Assume average speed of 30 mph in city
  const avgSpeed = 30; // mph
  const timeHours = distance / avgSpeed * trafficFactor;
  return Math.round(timeHours * 60); // Return minutes
}

/**
 * Generate route summary
 */
export function generateRouteSummary(jobs) {
  let totalDistance = 0;
  let totalTravelTime = 0;
  
  for (let i = 0; i < jobs.length - 1; i++) {
    const distance = calculateDistance(jobs[i].address, jobs[i + 1].address);
    totalDistance += distance;
    totalTravelTime += calculateTravelTime(distance);
  }
  
  return {
    totalJobs: jobs.length,
    totalDistance: Math.round(totalDistance * 10) / 10,
    totalTravelTime,
    estimatedFuelCost: Math.round(totalDistance * 0.15 * 100) / 100 // Assume $0.15 per mile
  };
}

// ==================== Analytics ====================

/**
 * Get employee productivity stats
 */
export function getEmployeeStats(employeeId, startDate = null, endDate = null) {
  const shifts = getEmployeeShifts(employeeId, startDate, endDate);
  const completedShifts = shifts.filter(s => s.status === 'completed');
  
  const totalJobs = completedShifts.length;
  const totalHours = completedShifts.reduce((sum, s) => {
    if (s.checkInTime && s.checkOutTime) {
      const duration = new Date(s.checkOutTime) - new Date(s.checkInTime);
      return sum + (duration / (1000 * 60 * 60));
    }
    return sum;
  }, 0);
  
  const onTimeShifts = completedShifts.filter(s => {
    if (!s.checkInTime || !s.startTime) return false;
    const checkIn = new Date(s.checkInTime);
    const scheduled = new Date(`${s.date}T${s.startTime}`);
    return checkIn <= scheduled;
  }).length;
  
  return {
    totalJobs,
    totalHours: Math.round(totalHours * 10) / 10,
    onTimePercentage: totalJobs > 0 ? Math.round((onTimeShifts / totalJobs) * 100) : 0,
    averageJobDuration: totalJobs > 0 ? Math.round((totalHours / totalJobs) * 60) : 0
  };
}

/**
 * Get scheduling conflicts
 */
export function getSchedulingConflicts(date) {
  const shifts = getShifts().filter(s => s.date === date);
  const conflicts = [];
  
  for (let i = 0; i < shifts.length; i++) {
    for (let j = i + 1; j < shifts.length; j++) {
      const s1 = shifts[i];
      const s2 = shifts[j];
      
      // Check for time overlap
      const overlap = (s1.startTime < s2.endTime && s1.endTime > s2.startTime);
      
      if (overlap) {
        conflicts.push({
          type: 'time_overlap',
          shift1: s1,
          shift2: s2
        });
      }
      
      // Check for double booking
      if (s1.employeeId === s2.employeeId && overlap) {
        conflicts.push({
          type: 'double_booking',
          employeeId: s1.employeeId,
          shift1: s1,
          shift2: s2
        });
      }
    }
  }
  
  return conflicts;
}
