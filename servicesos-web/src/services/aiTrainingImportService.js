// src/services/aiTrainingImportService.js
/**
 * AI Training History Import Service
 * Import historical jobs without photos for estimate engine
 */

import { collection, addDoc, doc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Import historical job data for AI training
 * @param {string} tenantId - Tenant ID
 * @param {Array} historicalJobs - Array of historical job objects
 * @returns {Promise<Array>} Imported training data
 */
export async function importHistoricalJobs(tenantId, historicalJobs) {
  const trainingDataRef = collection(db, 'tenants', tenantId, 'ai_training_data');
  const importedData = [];
  
  for (const job of historicalJobs) {
    const trainingData = {
      customerId: job.customerId,
      jobId: job.jobId || null,
      propertyType: job.propertyType || 'residential',
      squareFootage: job.squareFootage || 0,
      bedrooms: job.bedrooms || 0,
      bathrooms: job.bathrooms || 0,
      serviceLevel: job.serviceLevel || 'standard',
      extras: job.extras || [],
      predictedHours: job.predictedHours || 0,
      actualHours: job.actualHours || 0,
      predictionError: job.actualHours ? (job.predictedHours - job.actualHours) : 0,
      employeeId: job.employeeId || null,
      date: job.date || new Date().toISOString(),
      source: 'historical_import',
      createdAt: new Date().toISOString()
    };
    
    const docRef = await addDoc(trainingDataRef, trainingData);
    importedData.push({ id: docRef.id, ...trainingData });
  }
  
  return importedData;
}

/**
 * Import historical job data from CSV
 * @param {string} tenantId - Tenant ID
 * @param {Array} csvData - Parsed CSV data
 * @returns {Promise<Array>} Imported training data
 */
export async function importHistoricalJobsFromCSV(tenantId, csvData) {
  const trainingDataRef = collection(db, 'tenants', tenantId, 'ai_training_data');
  const importedData = [];
  
  for (const row of csvData) {
    const trainingData = {
      customerId: row.customerId || null,
      jobId: row.jobId || null,
      propertyType: row.propertyType || 'residential',
      squareFootage: parseFloat(row.squareFootage) || 0,
      bedrooms: parseInt(row.bedrooms) || 0,
      bathrooms: parseInt(row.bathrooms) || 0,
      serviceLevel: row.serviceLevel || 'standard',
      extras: row.extras ? row.extras.split(',').map(e => e.trim()) : [],
      predictedHours: parseFloat(row.predictedHours) || 0,
      actualHours: parseFloat(row.actualHours) || 0,
      predictionError: parseFloat(row.actualHours) ? (parseFloat(row.predictedHours) - parseFloat(row.actualHours)) : 0,
      employeeId: row.employeeId || null,
      date: row.date || new Date().toISOString(),
      source: 'csv_import',
      createdAt: new Date().toISOString()
    };
    
    const docRef = await addDoc(trainingDataRef, trainingData);
    importedData.push({ id: docRef.id, ...trainingData });
  }
  
  return importedData;
}

/**
 * Get AI training data statistics
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Training data statistics
 */
export async function getTrainingDataStatistics(tenantId) {
  const trainingDataRef = collection(db, 'tenants', tenantId, 'ai_training_data');
  const querySnap = await getDocs(trainingDataRef);
  
  const data = querySnap.docs.map(doc => doc.data());
  
  if (data.length === 0) {
    return {
      totalRecords: 0,
      avgPredictionError: 0,
      avgActualHours: 0,
      avgPredictedHours: 0,
      byPropertyType: {},
      byServiceLevel: {}
    };
  }
  
  const totalPredictionError = data.reduce((sum, d) => sum + Math.abs(d.predictionError), 0);
  const avgPredictionError = totalPredictionError / data.length;
  
  const totalActualHours = data.reduce((sum, d) => sum + d.actualHours, 0);
  const avgActualHours = totalActualHours / data.length;
  
  const totalPredictedHours = data.reduce((sum, d) => sum + d.predictedHours, 0);
  const avgPredictedHours = totalPredictedHours / data.length;
  
  const byPropertyType = {};
  const byServiceLevel = {};
  
  data.forEach(d => {
    byPropertyType[d.propertyType] = (byPropertyType[d.propertyType] || 0) + 1;
    byServiceLevel[d.serviceLevel] = (byServiceLevel[d.serviceLevel] || 0) + 1;
  });
  
  return {
    totalRecords: data.length,
    avgPredictionError: avgPredictionError.toFixed(2),
    avgActualHours: avgActualHours.toFixed(2),
    avgPredictedHours: avgPredictedHours.toFixed(2),
    byPropertyType,
    byServiceLevel
  };
}

/**
 * Get training data by property type
 * @param {string} tenantId - Tenant ID
 * @param {string} propertyType - Property type
 * @returns {Promise<Array>} Training data
 */
export async function getTrainingDataByPropertyType(tenantId, propertyType) {
  const trainingDataRef = collection(db, 'tenants', tenantId, 'ai_training_data');
  const q = query(trainingDataRef, where('propertyType', '==', propertyType));
  const querySnap = await getDocs(q);
  
  return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get training data by service level
 * @param {string} tenantId - Tenant ID
 * @param {string} serviceLevel - Service level
 * @returns {Promise<Array>} Training data
 */
export async function getTrainingDataByServiceLevel(tenantId, serviceLevel) {
  const trainingDataRef = collection(db, 'tenants', tenantId, 'ai_training_data');
  const q = query(trainingDataRef, where('serviceLevel', '==', serviceLevel));
  const querySnap = await getDocs(q);
  
  return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get training data by employee
 * @param {string} tenantId - Tenant ID
 * @param {string} employeeId - Employee ID
 * @returns {Promise<Array>} Training data
 */
export async function getTrainingDataByEmployee(tenantId, employeeId) {
  const trainingDataRef = collection(db, 'tenants', tenantId, 'ai_training_data');
  const q = query(trainingDataRef, where('employeeId', '==', employeeId));
  const querySnap = await getDocs(q);
  
  return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Delete training data
 * @param {string} tenantId - Tenant ID
 * @param {string} dataId - Training data ID
 * @returns {Promise<void>}
 */
export async function deleteTrainingData(tenantId, dataId) {
  const trainingDataRef = doc(db, 'tenants', tenantId, 'ai_training_data', dataId);
  await updateDoc(trainingDataRef, {
    deleted: true,
    deletedAt: new Date().toISOString()
  });
}

/**
 * Clear all training data for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<void>}
 */
export async function clearAllTrainingData(tenantId) {
  const trainingDataRef = collection(db, 'tenants', tenantId, 'ai_training_data');
  const querySnap = await getDocs(trainingDataRef);
  
  const batch = querySnap.docs.map(doc => {
    const docRef = doc(db, 'tenants', tenantId, 'ai_training_data', doc.id);
    return updateDoc(docRef, {
      deleted: true,
      deletedAt: new Date().toISOString()
    });
  });
  
  await Promise.all(batch);
}

/**
 * Export training data for external use
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Training data
 */
export async function exportTrainingData(tenantId) {
  const trainingDataRef = collection(db, 'tenants', tenantId, 'ai_training_data');
  const querySnap = await getDocs(trainingDataRef);
  
  return querySnap.docs.map(doc => doc.data());
}

/**
 * Validate training data quality
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Validation results
 */
export async function validateTrainingData(tenantId) {
  const trainingDataRef = collection(db, 'tenants', tenantId, 'ai_training_data');
  const querySnap = await getDocs(trainingDataRef);
  
  const data = querySnap.docs.map(doc => doc.data());
  
  const issues = [];
  let validCount = 0;
  
  data.forEach(d => {
    let hasIssues = false;
    
    if (!d.actualHours || d.actualHours <= 0) {
      issues.push({ id: d.id, issue: 'Invalid actual hours' });
      hasIssues = true;
    }
    
    if (!d.predictedHours || d.predictedHours <= 0) {
      issues.push({ id: d.id, issue: 'Invalid predicted hours' });
      hasIssues = true;
    }
    
    if (!d.bedrooms || d.bedrooms < 0) {
      issues.push({ id: d.id, issue: 'Invalid bedroom count' });
      hasIssues = true;
    }
    
    if (!d.bathrooms || d.bathrooms < 0) {
      issues.push({ id: d.id, issue: 'Invalid bathroom count' });
      hasIssues = true;
    }
    
    if (!hasIssues) {
      validCount++;
    }
  });
  
  return {
    totalRecords: data.length,
    validRecords: validCount,
    invalidRecords: data.length - validCount,
    issues
  };
}
