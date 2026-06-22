/**
 * Cleaning Module - Room Templates Service
 * 
 * This service handles cleaning-specific room templates
 * that are unique to the cleaning vertical.
 * 
 * Room templates define standard cleaning requirements
 * for different types of rooms (bedroom, bathroom, kitchen, etc.)
 */

import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../../firebase';
import { addSchemaVersion } from '../../../shared/schemas/schemaVersioning';
import { successResponse, errorResponse } from '../../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../../shared/logging/errorLoggingStandard';

const COLLECTION_NAME = 'room_templates';
const SCHEMA_TYPE = 'ROOM_TEMPLATE';

/**
 * Get all room templates for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getRoomTemplates(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const templatesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(templatesRef, orderBy('name'));
    const snapshot = await getDocs(q);
    
    const templatesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(templatesData);
  } catch (error) {
    logError({
      message: 'Failed to load room templates',
      module: 'cleaning',
      feature: 'roomTemplates',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load room templates', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get room templates by room type
 * @param {string} tenantId - The tenant ID
 * @param {string} roomType - The room type
 * @returns {Promise<object>} - Standardized API response
 */
export async function getTemplatesByRoomType(tenantId, roomType) {
  try {
    if (!tenantId || !roomType) {
      return errorResponse('Tenant ID and room type are required', 'VALIDATION_ERROR');
    }

    const templatesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(templatesRef, where('roomType', '==', roomType), orderBy('name'));
    const snapshot = await getDocs(q);
    
    const templatesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(templatesData);
  } catch (error) {
    logError({
      message: 'Failed to load templates by room type',
      module: 'cleaning',
      feature: 'roomTemplates',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load templates by room type', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get a single room template by ID
 * @param {string} tenantId - The tenant ID
 * @param {string} templateId - The template ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getRoomTemplateById(tenantId, templateId) {
  try {
    if (!tenantId || !templateId) {
      return errorResponse('Tenant ID and Template ID are required', 'VALIDATION_ERROR');
    }

    const templateRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, templateId);
    const snapshot = await getDoc(templateRef);
    
    if (!snapshot.exists()) {
      return errorResponse('Room template not found', ERROR_CODES.NOT_FOUND);
    }

    return successResponse({ id: snapshot.id, ...snapshot.data() });
  } catch (error) {
    logError({
      message: 'Failed to load room template',
      module: 'cleaning',
      feature: 'roomTemplates',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load room template', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Create a new room template
 * @param {string} tenantId - The tenant ID
 * @param {object} templateData - The template data
 * @returns {Promise<object>} - Standardized API response
 */
export async function createRoomTemplate(tenantId, templateData) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Add schema version
    const templateWithVersion = addSchemaVersion(templateData, SCHEMA_TYPE);

    const templatesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const docRef = await addDoc(templatesRef, {
      ...templateWithVersion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: docRef.id, ...templateWithVersion }, 'Room template created successfully');
  } catch (error) {
    logError({
      message: 'Failed to create room template',
      module: 'cleaning',
      feature: 'roomTemplates',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to create room template', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update a room template
 * @param {string} tenantId - The tenant ID
 * @param {string} templateId - The template ID
 * @param {object} templateData - The updated template data
 * @returns {Promise<object>} - Standardized API response
 */
export async function updateRoomTemplate(tenantId, templateId, templateData) {
  try {
    if (!tenantId || !templateId) {
      return errorResponse('Tenant ID and Template ID are required', 'VALIDATION_ERROR');
    }

    const templateRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, templateId);
    
    // Preserve schema version if it exists
    const existingDoc = await getDoc(templateRef);
    let templateWithVersion = templateData;
    
    if (existingDoc.exists()) {
      const existingData = existingDoc.data();
      templateWithVersion = {
        ...templateData,
        schemaVersion: existingData.schemaVersion || 1
      };
    } else {
      templateWithVersion = addSchemaVersion(templateData, SCHEMA_TYPE);
    }

    await updateDoc(templateRef, {
      ...templateWithVersion,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: templateId, ...templateWithVersion }, 'Room template updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update room template',
      module: 'cleaning',
      feature: 'roomTemplates',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update room template', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Delete a room template
 * @param {string} tenantId - The tenant ID
 * @param {string} templateId - The template ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function deleteRoomTemplate(tenantId, templateId) {
  try {
    if (!tenantId || !templateId) {
      return errorResponse('Tenant ID and Template ID are required', 'VALIDATION_ERROR');
    }

    const templateRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, templateId);
    await deleteDoc(templateRef);

    return successResponse({ id: templateId }, 'Room template deleted successfully');
  } catch (error) {
    logError({
      message: 'Failed to delete room template',
      module: 'cleaning',
      feature: 'roomTemplates',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to delete room template', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get default room templates for new tenants
 * @returns {object[]} - Array of default room templates
 */
export function getDefaultRoomTemplates() {
  return [
    {
      name: 'Standard Bedroom',
      roomType: 'bedroom',
      tasks: [
        'Dust all surfaces',
        'Clean mirrors',
        'Vacuum carpets',
        'Make bed',
        'Empty trash',
        'Clean nightstands'
      ],
      estimatedTime: 30, // minutes
      basePrice: 25.00
    },
    {
      name: 'Master Bedroom',
      roomType: 'bedroom',
      tasks: [
        'Dust all surfaces',
        'Clean mirrors',
        'Vacuum carpets',
        'Make bed',
        'Empty trash',
        'Clean nightstands',
        'Clean dressers',
        'Vacuum under bed'
      ],
      estimatedTime: 45,
      basePrice: 35.00
    },
    {
      name: 'Standard Bathroom',
      roomType: 'bathroom',
      tasks: [
        'Clean toilet',
        'Clean sink and vanity',
        'Clean mirrors',
        'Clean bathtub/shower',
        'Clean floors',
        'Empty trash',
        'Restock supplies'
      ],
      estimatedTime: 20,
      basePrice: 20.00
    },
    {
      name: 'Master Bathroom',
      roomType: 'bathroom',
      tasks: [
        'Clean toilet',
        'Clean sink and vanity',
        'Clean mirrors',
        'Clean bathtub/shower',
        'Clean floors',
        'Empty trash',
        'Restock supplies',
        'Clean tile grout',
        'Polish fixtures'
      ],
      estimatedTime: 30,
      basePrice: 30.00
    },
    {
      name: 'Kitchen',
      roomType: 'kitchen',
      tasks: [
        'Clean sink and faucet',
        'Clean countertops',
        'Clean appliances exterior',
        'Clean microwave interior',
        'Clean stovetop',
        'Clean cabinet fronts',
        'Empty trash',
        'Clean floors'
      ],
      estimatedTime: 45,
      basePrice: 40.00
    },
    {
      name: 'Living Room',
      roomType: 'living_room',
      tasks: [
        'Dust all surfaces',
        'Clean mirrors',
        'Vacuum carpets',
        'Empty trash',
        'Clean coffee table',
        'Dust electronics'
      ],
      estimatedTime: 25,
      basePrice: 20.00
    },
    {
      name: 'Dining Room',
      roomType: 'dining_room',
      tasks: [
        'Dust all surfaces',
        'Clean mirrors',
        'Vacuum carpets',
        'Empty trash',
        'Clean dining table',
        'Clean chairs'
      ],
      estimatedTime: 20,
      basePrice: 18.00
    },
    {
      name: 'Hallway',
      roomType: 'hallway',
      tasks: [
        'Dust all surfaces',
        'Vacuum carpets',
        'Clean baseboards'
      ],
      estimatedTime: 10,
      basePrice: 10.00
    },
    {
      name: 'Stairs',
      roomType: 'stairs',
      tasks: [
        'Dust all surfaces',
        'Vacuum stairs',
        'Clean handrails',
        'Clean baseboards'
      ],
      estimatedTime: 15,
      basePrice: 15.00
    },
    {
      name: 'Basement',
      roomType: 'basement',
      tasks: [
        'Dust all surfaces',
        'Vacuum floors',
        'Clean windows',
        'Empty trash',
        'Sweep concrete areas'
      ],
      estimatedTime: 30,
      basePrice: 25.00
    }
  ];
}
