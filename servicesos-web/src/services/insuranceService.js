// src/services/insuranceService.js
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Insurance Service
 * Manages insurance information for tenants
 */

export async function getInsurance(tenantId) {
  if (!tenantId) {
    console.warn('[Insurance Service] No tenantId provided');
    return null;
  }
  
  try {
    const insuranceRef = doc(db, 'tenants', tenantId, 'insurance', 'policy');
    const insuranceDoc = await getDoc(insuranceRef);
    
    if (insuranceDoc.exists()) {
      return { id: insuranceDoc.id, ...insuranceDoc.data() };
    }
    return null;
  } catch (error) {
    console.error('Error fetching insurance:', error);
    throw error;
  }
}

export async function saveInsurance(tenantId, insuranceData) {
  if (!tenantId) {
    console.warn('[Insurance Service] No tenantId provided');
    throw new Error('Tenant ID is required');
  }
  
  try {
    const insuranceRef = doc(db, 'tenants', tenantId, 'insurance', 'policy');
    const data = {
      provider: insuranceData.provider || '',
      policyNumber: insuranceData.policyNumber || '',
      coverageAmount: insuranceData.coverageAmount || 0,
      expirationDate: insuranceData.expirationDate || '',
      certificateUrl: insuranceData.certificateUrl || '',
      updatedAt: new Date().toISOString()
    };
    
    await setDoc(insuranceRef, data, { merge: true });
    return { id: insuranceRef.id, ...data };
  } catch (error) {
    console.error('Error saving insurance:', error);
    throw error;
  }
}

export async function updateInsurance(tenantId, insuranceData) {
  if (!tenantId) {
    console.warn('[Insurance Service] No tenantId provided');
    throw new Error('Tenant ID is required');
  }
  
  try {
    const insuranceRef = doc(db, 'tenants', tenantId, 'insurance', 'policy');
    const data = {
      ...insuranceData,
      updatedAt: new Date().toISOString()
    };
    
    await updateDoc(insuranceRef, data);
    return { id: insuranceRef.id, ...data };
  } catch (error) {
    console.error('Error updating insurance:', error);
    throw error;
  }
}

export async function checkInsuranceExpiration(tenantId) {
  if (!tenantId) {
    console.warn('[Insurance Service] No tenantId provided');
    return null;
  }
  
  try {
    const insurance = await getInsurance(tenantId);
    
    if (!insurance || !insurance.expirationDate) {
      return { status: 'none', daysUntilExpiration: null, isExpiring: false, isExpired: false };
    }
    
    const expirationDate = new Date(insurance.expirationDate);
    const today = new Date();
    const diffTime = expirationDate - today;
    const daysUntilExpiration = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let status = 'active';
    let isExpiring = false;
    let isExpired = false;
    
    if (daysUntilExpiration < 0) {
      status = 'expired';
      isExpired = true;
    } else if (daysUntilExpiration <= 30) {
      status = 'expiring';
      isExpiring = true;
    }
    
    return {
      status,
      daysUntilExpiration,
      isExpiring,
      isExpired,
      expirationDate: insurance.expirationDate
    };
  } catch (error) {
    console.error('Error checking insurance expiration:', error);
    throw error;
  }
}

export async function uploadInsuranceCertificate(tenantId, file) {
  // This would integrate with Firebase Storage
  // For now, return a placeholder URL
  return `https://storage.googleapis.com/insurance-certificates/${tenantId}/${file.name}`;
}
