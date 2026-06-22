// src/services/contractService.js
import { collection, addDoc, doc, updateDoc, query, where, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

/**
 * Create a service agreement contract
 */
export async function createServiceContract(tenantId, lead, estimate, signatureData) {
  try {
    // Upload signature to Firebase Storage
    const signatureId = `signature_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const signatureRef = ref(storage, `tenants/${tenantId}/signatures/${signatureId}`);
    
    const response = await fetch(signatureData);
    const blob = await response.blob();
    await uploadBytes(signatureRef, blob);
    const signatureUrl = await getDownloadURL(signatureRef);

    // Calculate deposit (25% of low estimate)
    const depositAmount = Math.round(estimate.priceLow * 0.25);

    // Create contract document
    const contractData = {
      companyId: tenantId,
      customerId: lead.id,
      customerName: `${lead.firstName} ${lead.lastName}`,
      customerEmail: lead.email,
      customerPhone: lead.phone || '',
      quoteId: lead.id,
      contractType: 'service_agreement',
      signed: true,
      signedAt: new Date().toISOString(),
      signatureUrl,
      agreementTerms: {
        scopeOfWork: estimate.rooms.map(r => `${r.type}: ${r.quantity}`).join(', '),
        priceLow: estimate.priceLow,
        priceHigh: estimate.priceHigh,
        depositRequired: true,
        depositAmount,
        depositPercentage: 25,
        cancellationPolicy: '24 hours notice required for cancellation',
        liabilityLimit: 'Company not responsible for pre-existing damage',
        accessInstructions: 'Safe access to property required'
      },
      rooms: estimate.rooms,
      extras: estimate.extras || [],
      createdAt: new Date().toISOString()
    };

    const contractRef = await addDoc(collection(db, 'tenants', tenantId, 'contracts'), contractData);

    // Update lead with contract reference
    await updateDoc(doc(db, 'tenants', tenantId, 'leads', lead.id), {
      contractId: contractRef.id,
      contractSigned: true,
      contractSignedAt: new Date().toISOString(),
      status: 'agreement_signed',
      depositAmount
    });

    return contractRef.id;
  } catch (error) {
    console.error('Error creating service contract:', error);
    throw error;
  }
}

/**
 * Create a SaaS agreement for tenant sign-up
 */
export async function createSaaSContract(tenantId, companyName, adminEmail, adminName, signatureData) {
  try {
    // Upload signature
    const signatureId = `saas_signature_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const signatureRef = ref(storage, `tenants/${tenantId}/signatures/${signatureId}`);
    
    const response = await fetch(signatureData);
    const blob = await response.blob();
    await uploadBytes(signatureRef, blob);
    const signatureUrl = await getDownloadURL(signatureRef);

    // Create SaaS contract
    const contractData = {
      companyId: tenantId,
      companyName,
      adminEmail,
      adminName,
      contractType: 'saas_agreement',
      signed: true,
      signedAt: new Date().toISOString(),
      signatureUrl,
      agreementTerms: {
        termsAccepted: true,
        subscriptionAccepted: true,
        billingAuthorized: true,
        autoRenewal: true,
        cancellationNotice: '30 days'
      },
      createdAt: new Date().toISOString()
    };

    const contractRef = await addDoc(collection(db, 'tenants', tenantId, 'contracts'), contractData);

    return contractRef.id;
  } catch (error) {
    console.error('Error creating SaaS contract:', error);
    throw error;
  }
}

/**
 * Get contracts for a tenant
 */
export async function getTenantContracts(tenantId) {
  try {
    const contractsRef = collection(db, 'tenants', tenantId, 'contracts');
    const snapshot = await getDocs(contractsRef);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting contracts:', error);
    throw error;
  }
}

/**
 * Get contract by ID
 */
export async function getContractById(tenantId, contractId) {
  try {
    const contractRef = doc(db, 'tenants', tenantId, 'contracts', contractId);
    const snapshot = await getDoc(contractRef);
    if (snapshot.exists()) {
      return { id: snapshot.id, ...snapshot.data() };
    }
    return null;
  } catch (error) {
    console.error('Error getting contract:', error);
    throw error;
  }
}

/**
 * Get contracts for a specific customer
 */
export async function getCustomerContracts(tenantId, customerId) {
  try {
    const contractsRef = collection(db, 'tenants', tenantId, 'contracts');
    const q = query(contractsRef, where('customerId', '==', customerId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting customer contracts:', error);
    throw error;
  }
}
