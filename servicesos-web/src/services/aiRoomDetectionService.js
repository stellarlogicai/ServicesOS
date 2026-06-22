// src/services/aiRoomDetectionService.js
/**
 * AI Room Detection Service
 * Detects room types from photos (kitchen, bath, garage, office, closet, laundry)
 */

import { collection, addDoc, doc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

// AI Backend configuration
const AI_BACKEND_URL = window.REACT_APP_AI_BACKEND_URL || 'http://localhost:5000';

/**
 * Detect room type from photo using AI
 * @param {string} imageUrl - URL of the photo to analyze
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Room detection result
 */
export async function detectRoomFromPhoto(imageUrl, tenantId) {
  try {
    // Call AI backend for room detection
    const response = await fetch(`${AI_BACKEND_URL}/detect-room`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageUrl,
        tenantId
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to detect room from photo');
    }
    
    const result = await response.json();
    
    return {
      roomType: result.roomType || 'unknown',
      confidence: result.confidence || 0,
      detectedRooms: result.detectedRooms || [],
      metadata: result.metadata || {}
    };
  } catch (error) {
    console.error('Error detecting room from photo:', error);
    return {
      roomType: 'unknown',
      confidence: 0,
      detectedRooms: [],
      metadata: { error: error.message }
    };
  }
}

/**
 * Batch detect rooms from multiple photos
 * @param {Array} photos - Array of photo objects with imageUrl
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Array of room detection results
 */
export async function batchDetectRooms(photos, tenantId) {
  const results = await Promise.all(
    photos.map(async (photo) => {
      const detection = await detectRoomFromPhoto(photo.imageUrl, tenantId);
      return {
        photoId: photo.id,
        photoUrl: photo.imageUrl,
        ...detection
      };
    })
  );
  
  return results;
}

/**
 * Save room detection result to Firestore
 * @param {string} tenantId - Tenant ID
 * @param {string} photoId - Photo ID
 * @param {Object} detectionResult - Detection result
 * @returns {Promise<string>} Document ID
 */
export async function saveRoomDetection(tenantId, photoId, detectionResult) {
  const detectionsRef = collection(db, 'tenants', tenantId, 'room_detections');
  const docRef = await addDoc(detectionsRef, {
    photoId,
    roomType: detectionResult.roomType,
    confidence: detectionResult.confidence,
    detectedRooms: detectionResult.detectedRooms,
    metadata: detectionResult.metadata,
    createdAt: new Date().toISOString()
  });
  return docRef.id;
}

/**
 * Get room detection history for a photo
 * @param {string} tenantId - Tenant ID
 * @param {string} photoId - Photo ID
 * @returns {Promise<Object>} Detection result
 */
export async function getRoomDetectionForPhoto(tenantId, photoId) {
  const detectionsRef = collection(db, 'tenants', tenantId, 'room_detections');
  const q = query(detectionsRef, where('photoId', '==', photoId));
  const querySnap = await getDocs(q);
  
  if (querySnap.empty) {
    return null;
  }
  
  const doc = querySnap.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Get room detection statistics for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Room detection statistics
 */
export async function getRoomDetectionStats(tenantId) {
  const detectionsRef = collection(db, 'tenants', tenantId, 'room_detections');
  const querySnap = await getDocs(detectionsRef);
  
  const detections = querySnap.docs.map(doc => doc.data());
  
  const roomTypeCounts = {};
  const totalDetections = detections.length;
  const avgConfidence = detections.reduce((sum, d) => sum + (d.confidence || 0), 0) / totalDetections;
  
  detections.forEach(detection => {
    const roomType = detection.roomType || 'unknown';
    roomTypeCounts[roomType] = (roomTypeCounts[roomType] || 0) + 1;
  });
  
  return {
    totalDetections,
    avgConfidence,
    roomTypeCounts,
    roomTypeDistribution: Object.entries(roomTypeCounts).map(([roomType, count]) => ({
      roomType,
      count,
      percentage: (count / totalDetections) * 100
    }))
  };
}

/**
 * Get room detection statistics by date range
 * @param {string} tenantId - Tenant ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Room detection statistics for date range
 */
export async function getRoomDetectionStatsByDateRange(tenantId, startDate, endDate) {
  const detectionsRef = collection(db, 'tenants', tenantId, 'room_detections');
  const querySnap = await getDocs(detectionsRef);
  
  const detections = querySnap.docs
    .map(doc => doc.data())
    .filter(detection => {
      const date = detection.createdAt.split('T')[0];
      return date >= startDate && date <= endDate;
    });
  
  const roomTypeCounts = {};
  const totalDetections = detections.length;
  const avgConfidence = detections.length > 0 
    ? detections.reduce((sum, d) => sum + (d.confidence || 0), 0) / detections.length 
    : 0;
  
  detections.forEach(detection => {
    const roomType = detection.roomType || 'unknown';
    roomTypeCounts[roomType] = (roomTypeCounts[roomType] || 0) + 1;
  });
  
  return {
    totalDetections,
    avgConfidence,
    roomTypeCounts,
    roomTypeDistribution: Object.entries(roomTypeCounts).map(([roomType, count]) => ({
      roomType,
      count,
      percentage: totalDetections > 0 ? (count / totalDetections) * 100 : 0
    }))
  };
}

/**
 * Update room detection result
 * @param {string} tenantId - Tenant ID
 * @param {string} detectionId - Detection ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updateRoomDetection(tenantId, detectionId, updates) {
  const detectionRef = doc(db, 'tenants', tenantId, 'room_detections', detectionId);
  await setDoc(detectionRef, {
    ...updates,
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

/**
 * Manually correct room detection
 * @param {string} tenantId - Tenant ID
 * @param {string} photoId - Photo ID
 * @param {string} correctRoomType - Correct room type
 * @returns {Promise<void>}
 */
export async function correctRoomDetection(tenantId, photoId, correctRoomType) {
  const existingDetection = await getRoomDetectionForPhoto(tenantId, photoId);
  
  if (existingDetection) {
    await updateRoomDetection(tenantId, existingDetection.id, {
      roomType: correctRoomType,
      manuallyCorrected: true,
      originalRoomType: existingDetection.roomType
    });
  } else {
    await saveRoomDetection(tenantId, photoId, {
      roomType: correctRoomType,
      confidence: 100,
      detectedRooms: [correctRoomType],
      metadata: { manuallyCorrected: true }
    });
  }
}

/**
 * Get room type suggestions based on detected rooms
 * @param {Array} detectedRooms - Array of detected room types
 * @returns {Promise<Array>} Suggested room types with confidence
 */
export async function getRoomTypeSuggestions(detectedRooms) {
  const roomTypeMap = {
    'kitchen': { basePrice: 50, baseTime: 1.5 },
    'bath': { basePrice: 30, baseTime: 0.75 },
    'bathroom': { basePrice: 30, baseTime: 0.75 },
    'garage': { basePrice: 40, baseTime: 1.0 },
    'office': { basePrice: 25, baseTime: 0.5 },
    'closet': { basePrice: 15, baseTime: 0.25 },
    'laundry': { basePrice: 20, baseTime: 0.5 },
    'bedroom': { basePrice: 35, baseTime: 0.75 },
    'living': { basePrice: 40, baseTime: 1.0 },
    'dining': { basePrice: 30, baseTime: 0.75 }
  };
  
  return detectedRooms.map(roomType => {
    const normalizedRoomType = roomType.toLowerCase();
    const roomInfo = roomTypeMap[normalizedRoomType] || { basePrice: 25, baseTime: 0.5 };
    
    return {
      roomType,
      basePrice: roomInfo.basePrice,
      baseTime: roomInfo.baseTime,
      confidence: 85
    };
  });
}

/**
 * Analyze photo for room features (counters, appliances, fixtures)
 * @param {string} imageUrl - URL of the photo to analyze
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Room features analysis
 */
export async function analyzeRoomFeatures(imageUrl, tenantId) {
  try {
    const response = await fetch(`${AI_BACKEND_URL}/analyze-features`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageUrl,
        tenantId
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to analyze room features');
    }
    
    const result = await response.json();
    
    return {
      features: result.features || [],
      appliances: result.appliances || [],
      fixtures: result.fixtures || [],
      surfaceArea: result.surfaceArea || 0,
      complexity: result.complexity || 'medium'
    };
  } catch (error) {
    console.error('Error analyzing room features:', error);
    return {
      features: [],
      appliances: [],
      fixtures: [],
      surfaceArea: 0,
      complexity: 'medium',
      error: error.message
    };
  }
}
