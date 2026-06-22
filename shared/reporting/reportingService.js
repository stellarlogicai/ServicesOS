// src/shared/reporting/reportingService.js
/**
 * Reporting Framework
 * Generic reporting engine that can be used across all platforms
 * Reusable across multiple SaaS products
 */

/**
 * Generate date range filter
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Object} Date range filter
 */
export function createDateRangeFilter(startDate, endDate) {
  return {
    startDate: new Date(startDate).toISOString(),
    endDate: new Date(endDate).toISOString()
  };
}

/**
 * Group data by field
 * @param {Array} data - Data to group
 * @param {string} field - Field to group by
 * @returns {Object} Grouped data
 */
export function groupByField(data, field) {
  return data.reduce((acc, item) => {
    const key = item[field] || 'unknown';
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(item);
    return acc;
  }, {});
}

/**
 * Calculate sum of field
 * @param {Array} data - Data to calculate
 * @param {string} field - Field to sum
 * @returns {number} Sum
 */
export function sumField(data, field) {
  return data.reduce((sum, item) => sum + (Number(item[field]) || 0), 0);
}

/**
 * Calculate average of field
 * @param {Array} data - Data to calculate
 * @param {string} field - Field to average
 * @returns {number} Average
 */
export function averageField(data, field) {
  if (data.length === 0) return 0;
  return sumField(data, field) / data.length;
}

/**
 * Generate time series data
 * @param {Array} data - Data with timestamps
 * @param {string} dateField - Date field name
 * @param {string} valueField - Value field name
 * @param {string} granularity - 'day' | 'week' | 'month'
 * @returns {Array} Time series data
 */
export function generateTimeSeries(data, dateField, valueField, granularity = 'day') {
  const grouped = {};
  
  data.forEach(item => {
    const date = new Date(item[dateField]);
    let key;
    
    if (granularity === 'day') {
      key = date.toISOString().split('T')[0];
    } else if (granularity === 'week') {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      key = weekStart.toISOString().split('T')[0];
    } else if (granularity === 'month') {
      key = date.toISOString().slice(0, 7);
    }
    
    if (!grouped[key]) {
      grouped[key] = 0;
    }
    grouped[key] += Number(item[valueField]) || 0;
  });
  
  return Object.entries(grouped)
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

/**
 * Generate report summary
 * @param {Array} data - Report data
 * @param {Object} config - Report configuration
 * @returns {Object} Report summary
 */
export function generateReportSummary(data, config) {
  const summary = {
    total: data.length,
    metrics: {}
  };
  
  if (config.sumFields) {
    config.sumFields.forEach(field => {
      summary.metrics[`${field}_sum`] = sumField(data, field);
    });
  }
  
  if (config.avgFields) {
    config.avgFields.forEach(field => {
      summary.metrics[`${field}_avg`] = averageField(data, field);
    });
  }
  
  if (config.groupBy) {
    summary.groups = groupByField(data, config.groupBy);
  }
  
  return summary;
}

/**
 * Export data as CSV
 * @param {Array} data - Data to export
 * @param {Array} columns - Column definitions
 * @returns {string} CSV content
 */
export function exportToCSV(data, columns) {
  const headers = columns.map(col => col.label).join(',');
  const rows = data.map(item => 
    columns.map(col => {
      const value = item[col.field] || '';
      const stringValue = String(value);
      // Escape quotes and wrap in quotes if contains comma
      if (stringValue.includes(',') || stringValue.includes('"')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    }).join(',')
  );
  
  return [headers, ...rows].join('\n');
}

/**
 * Export data as JSON
 * @param {Array} data - Data to export
 * @returns {string} JSON content
 */
export function exportToJSON(data) {
  return JSON.stringify(data, null, 2);
}

/**
 * Filter data by date range
 * @param {Array} data - Data to filter
 * @param {string} dateField - Date field name
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Array} Filtered data
 */
export function filterByDateRange(data, dateField, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  return data.filter(item => {
    const itemDate = new Date(item[dateField]);
    return itemDate >= start && itemDate <= end;
  });
}

/**
 * Calculate growth rate
 * @param {number} current - Current value
 * @param {number} previous - Previous value
 * @returns {number} Growth rate percentage
 */
export function calculateGrowthRate(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Generate comparison report
 * @param {Object} currentData - Current period data
 * @param {Object} previousData - Previous period data
 * @returns {Object} Comparison report
 */
export function generateComparisonReport(currentData, previousData) {
  const comparison = {};
  
  Object.keys(currentData).forEach(key => {
    const current = currentData[key];
    const previous = previousData[key] || 0;
    const growth = calculateGrowthRate(current, previous);
    
    comparison[key] = {
      current,
      previous,
      growth,
      trend: growth > 0 ? 'up' : growth < 0 ? 'down' : 'flat'
    };
  });
  
  return comparison;
}

/**
 * Get top N items by field
 * @param {Array} data - Data to analyze
 * @param {string} field - Field to sort by
 * @param {number} limit - Number of items to return
 * @returns {Array} Top N items
 */
export function getTopItems(data, field, limit = 10) {
  return [...data]
    .sort((a, b) => Number(b[field]) - Number(a[field]))
    .slice(0, limit);
}

/**
 * Calculate percentile
 * @param {Array} data - Data array
 * @param {number} percentile - Percentile (0-100)
 * @returns {number} Percentile value
 */
export function calculatePercentile(data, percentile) {
  if (data.length === 0) return 0;
  
  const sorted = [...data].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[index];
}
