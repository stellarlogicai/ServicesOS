/**
 * Cleaning Module - Supplies Service
 * 
 * This service handles cleaning-specific supplies
 * that are unique to the cleaning vertical.
 * 
 * Supplies track cleaning chemicals, equipment, and materials
 * needed for different cleaning jobs.
 */

import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../../firebase';
import { addSchemaVersion } from '../../../shared/schemas/schemaVersioning';
import { successResponse, errorResponse } from '../../../shared/api/apiResponseStandard';
import { logError, ERROR_CODES, SEVERITY } from '../../../shared/logging/errorLoggingStandard';

const COLLECTION_NAME = 'cleaning_supplies';
const SCHEMA_TYPE = 'SUPPLY';

/**
 * Get all supplies for a tenant
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getSupplies(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const suppliesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(suppliesRef, orderBy('name'));
    const snapshot = await getDocs(q);
    
    const suppliesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(suppliesData);
  } catch (error) {
    logError({
      message: 'Failed to load supplies',
      module: 'cleaning',
      feature: 'supplies',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load supplies', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get supplies by category
 * @param {string} tenantId - The tenant ID
 * @param {string} category - The supply category
 * @returns {Promise<object>} - Standardized API response
 */
export async function getSuppliesByCategory(tenantId, category) {
  try {
    if (!tenantId || !category) {
      return errorResponse('Tenant ID and category are required', 'VALIDATION_ERROR');
    }

    const suppliesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(suppliesRef, where('category', '==', category), orderBy('name'));
    const snapshot = await getDocs(q);
    
    const suppliesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(suppliesData);
  } catch (error) {
    logError({
      message: 'Failed to load supplies by category',
      module: 'cleaning',
      feature: 'supplies',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load supplies by category', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get low stock supplies
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getLowStockSupplies(tenantId) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    const suppliesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const q = query(suppliesRef, where('quantity', '<=', 'reorderLevel'));
    const snapshot = await getDocs(q);
    
    const suppliesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return successResponse(suppliesData);
  } catch (error) {
    logError({
      message: 'Failed to load low stock supplies',
      module: 'cleaning',
      feature: 'supplies',
      severity: SEVERITY.MEDIUM,
      tenantId,
      error
    });
    return errorResponse('Failed to load low stock supplies', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get a single supply by ID
 * @param {string} tenantId - The tenant ID
 * @param {string} supplyId - The supply ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function getSupplyById(tenantId, supplyId) {
  try {
    if (!tenantId || !supplyId) {
      return errorResponse('Tenant ID and Supply ID are required', 'VALIDATION_ERROR');
    }

    const supplyRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, supplyId);
    const snapshot = await getDoc(supplyRef);
    
    if (!snapshot.exists()) {
      return errorResponse('Supply not found', ERROR_CODES.NOT_FOUND);
    }

    return successResponse({ id: snapshot.id, ...snapshot.data() });
  } catch (error) {
    logError({
      message: 'Failed to load supply',
      module: 'cleaning',
      feature: 'supplies',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to load supply', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Create a new supply
 * @param {string} tenantId - The tenant ID
 * @param {object} supplyData - The supply data
 * @returns {Promise<object>} - Standardized API response
 */
export async function createSupply(tenantId, supplyData) {
  try {
    if (!tenantId) {
      return errorResponse('Tenant ID is required', 'VALIDATION_ERROR');
    }

    // Add schema version
    const supplyWithVersion = addSchemaVersion(supplyData, SCHEMA_TYPE);

    const suppliesRef = collection(db, 'tenants', tenantId, COLLECTION_NAME);
    const docRef = await addDoc(suppliesRef, {
      ...supplyWithVersion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: docRef.id, ...supplyWithVersion }, 'Supply created successfully');
  } catch (error) {
    logError({
      message: 'Failed to create supply',
      module: 'cleaning',
      feature: 'supplies',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to create supply', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update a supply
 * @param {string} tenantId - The tenant ID
 * @param {string} supplyId - The supply ID
 * @param {object} supplyData - The updated supply data
 * @returns {Promise<object>} - Standardized API response
 */
export async function updateSupply(tenantId, supplyId, supplyData) {
  try {
    if (!tenantId || !supplyId) {
      return errorResponse('Tenant ID and Supply ID are required', 'VALIDATION_ERROR');
    }

    const supplyRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, supplyId);
    
    // Preserve schema version if it exists
    const existingDoc = await getDoc(supplyRef);
    let supplyWithVersion = supplyData;
    
    if (existingDoc.exists()) {
      const existingData = existingDoc.data();
      supplyWithVersion = {
        ...supplyData,
        schemaVersion: existingData.schemaVersion || 1
      };
    } else {
      supplyWithVersion = addSchemaVersion(supplyData, SCHEMA_TYPE);
    }

    await updateDoc(supplyRef, {
      ...supplyWithVersion,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: supplyId, ...supplyWithVersion }, 'Supply updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update supply',
      module: 'cleaning',
      feature: 'supplies',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update supply', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Update supply quantity
 * @param {string} tenantId - The tenant ID
 * @param {string} supplyId - The supply ID
 * @param {number} quantityChange - The quantity change (positive or negative)
 * @returns {Promise<object>} - Standardized API response
 */
export async function updateSupplyQuantity(tenantId, supplyId, quantityChange) {
  try {
    if (!tenantId || !supplyId) {
      return errorResponse('Tenant ID and Supply ID are required', 'VALIDATION_ERROR');
    }

    const supplyRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, supplyId);
    const snapshot = await getDoc(supplyRef);
    
    if (!snapshot.exists()) {
      return errorResponse('Supply not found', ERROR_CODES.NOT_FOUND);
    }

    const currentQuantity = snapshot.data().quantity || 0;
    const newQuantity = Math.max(0, currentQuantity + quantityChange);
    
    await updateDoc(supplyRef, {
      quantity: newQuantity,
      updatedAt: new Date().toISOString()
    });

    return successResponse({ id: supplyId, quantity: newQuantity }, 'Supply quantity updated successfully');
  } catch (error) {
    logError({
      message: 'Failed to update supply quantity',
      module: 'cleaning',
      feature: 'supplies',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to update supply quantity', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Delete a supply
 * @param {string} tenantId - The tenant ID
 * @param {string} supplyId - The supply ID
 * @returns {Promise<object>} - Standardized API response
 */
export async function deleteSupply(tenantId, supplyId) {
  try {
    if (!tenantId || !supplyId) {
      return errorResponse('Tenant ID and Supply ID are required', 'VALIDATION_ERROR');
    }

    const supplyRef = doc(db, 'tenants', tenantId, COLLECTION_NAME, supplyId);
    await deleteDoc(supplyRef);

    return successResponse({ id: supplyId }, 'Supply deleted successfully');
  } catch (error) {
    logError({
      message: 'Failed to delete supply',
      module: 'cleaning',
      feature: 'supplies',
      severity: SEVERITY.HIGH,
      tenantId,
      error
    });
    return errorResponse('Failed to delete supply', ERROR_CODES.FIRESTORE_ERROR, error);
  }
}

/**
 * Get default cleaning supplies for new tenants
 * @returns {object[]} - Array of default supplies
 */
export function getDefaultSupplies() {
  return [
    {
      name: 'All-Purpose Cleaner',
      category: 'chemicals',
      quantity: 10,
      unit: 'gallons',
      reorderLevel: 2,
      costPerUnit: 15.00
    },
    {
      name: 'Glass Cleaner',
      category: 'chemicals',
      quantity: 8,
      unit: 'bottles',
      reorderLevel: 2,
      costPerUnit: 5.00
    },
    {
      name: 'Bathroom Cleaner',
      category: 'chemicals',
      quantity: 10,
      unit: 'bottles',
      reorderLevel: 2,
      costPerUnit: 6.00
    },
    {
      name: 'Floor Cleaner',
      category: 'chemicals',
      quantity: 12,
      unit: 'bottles',
      reorderLevel: 3,
      costPerUnit: 8.00
    },
    {
      name: 'Microfiber Cloths',
      category: 'materials',
      quantity: 50,
      unit: 'pieces',
      reorderLevel: 10,
      costPerUnit: 2.00
    },
    {
      name: 'Trash Bags',
      category: 'materials',
      quantity: 100,
      unit: 'bags',
      reorderLevel: 20,
      costPerUnit: 0.15
    },
    {
      name: 'Paper Towels',
      category: 'materials',
      quantity: 20,
      unit: 'rolls',
      reorderLevel: 5,
      costPerUnit: 2.50
    },
    {
      name: 'Vacuum Cleaner',
      category: 'equipment',
      quantity: 3,
      unit: 'units',
      reorderLevel: 1,
      costPerUnit: 150.00
    },
    {
      name: 'Mop',
      category: 'equipment',
      quantity: 5,
      unit: 'units',
      reorderLevel: 2,
      costPerUnit: 25.00
    },
    {
      name: 'Broom',
      category: 'equipment',
      quantity: 5,
      unit: 'units',
      reorderLevel: 2,
      costPerUnit: 15.00
    },
    {
      name: 'Dustpan',
      category: 'equipment',
      quantity: 5,
      unit: 'units',
      reorderLevel: 2,
      costPerUnit: 8.00
    },
    {
      name: 'Sponges',
      category: 'materials',
      quantity: 30,
      unit: 'pieces',
      reorderLevel: 10,
      costPerUnit: 1.00
    },
    {
      name: 'Rubber Gloves',
      category: 'safety',
      quantity: 20,
      unit: 'pairs',
      reorderLevel: 5,
      costPerUnit: 3.00
    },
    {
      name: 'Safety Goggles',
      category: 'safety',
      quantity: 5,
      unit: 'pairs',
      reorderLevel: 2,
      costPerUnit: 10.00
    }
  ];
}
