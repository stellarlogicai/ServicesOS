// src/services/customerPortalService.js
/**
 * Customer Portal Service
 * Provides data access for customer portal features
 */

import { doc, getDoc, getDocs, collection, query, where, orderBy, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Get customer portal data
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Object>}
 */
export async function getCustomerPortalData(tenantId, customerId) {
  // Get customer details
  const customerRef = doc(db, 'tenants', tenantId, 'customers', customerId);
  const customerSnap = await getDoc(customerRef);
  
  if (!customerSnap.exists()) {
    throw new Error('Customer not found');
  }
  
  const customer = customerSnap.data();
  
  // Get customer's leads/estimates
  const leadsRef = collection(db, 'tenants', tenantId, 'leads');
  const leadsQ = query(leadsRef, where('customerId', '==', customerId), orderBy('createdAt', 'desc'));
  const leadsSnap = await getDocs(leadsQ);
  
  const leads = leadsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Get customer's jobs
  const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
  const jobsQ = query(jobsRef, where('customerId', '==', customerId), orderBy('date', 'desc'));
  const jobsSnap = await getDocs(jobsQ);
  
  const jobs = jobsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Get customer's invoices
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  const invoicesQ = query(invoicesRef, where('customerId', '==', customerId), orderBy('createdAt', 'desc'));
  const invoicesSnap = await getDocs(invoicesQ);
  
  const invoices = invoicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Get customer's contracts
  const contractsRef = collection(db, 'tenants', tenantId, 'contracts');
  const contractsQ = query(contractsRef, where('customerId', '==', customerId), orderBy('createdAt', 'desc'));
  const contractsSnap = await getDocs(contractsQ);
  
  const contracts = contractsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  return {
    customer,
    leads,
    jobs,
    invoices,
    contracts
  };
}

/**
 * Get customer estimate details
 * @param {string} tenantId - Tenant ID
 * @param {string} leadId - Lead ID
 * @returns {Promise<Object>}
 */
export async function getCustomerEstimate(tenantId, leadId) {
  const leadRef = doc(db, 'tenants', tenantId, 'leads', leadId);
  const leadSnap = await getDoc(leadRef);
  
  if (!leadSnap.exists()) {
    throw new Error('Estimate not found');
  }
  
  return { id: leadSnap.id, ...leadSnap.data() };
}

/**
 * Get customer contract details
 * @param {string} tenantId - Tenant ID
 * @param {string} contractId - Contract ID
 * @returns {Promise<Object>}
 */
export async function getCustomerContract(tenantId, contractId) {
  const contractRef = doc(db, 'tenants', tenantId, 'contracts', contractId);
  const contractSnap = await getDoc(contractRef);
  
  if (!contractSnap.exists()) {
    throw new Error('Contract not found');
  }
  
  return { id: contractSnap.id, ...contractSnap.data() };
}

/**
 * Get customer invoice details
 * @param {string} tenantId - Tenant ID
 * @param {string} invoiceId - Invoice ID
 * @returns {Promise<Object>}
 */
export async function getCustomerInvoice(tenantId, invoiceId) {
  const invoiceRef = doc(db, 'tenants', tenantId, 'invoices', invoiceId);
  const invoiceSnap = await getDoc(invoiceRef);
  
  if (!invoiceSnap.exists()) {
    throw new Error('Invoice not found');
  }
  
  return { id: invoiceSnap.id, ...invoiceSnap.data() };
}

/**
 * Get customer job details with photos
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>}
 */
export async function getCustomerJobWithPhotos(tenantId, jobId) {
  const jobRef = doc(db, 'tenants', tenantId, 'jobs', jobId);
  const jobSnap = await getDoc(jobRef);
  
  if (!jobSnap.exists()) {
    throw new Error('Job not found');
  }
  
  const job = { id: jobSnap.id, ...jobSnap.data() };
  
  // Get job completion data with photos
  const completionRef = doc(db, 'tenants', tenantId, 'job_completions', jobId);
  const completionSnap = await getDoc(completionRef);
  
  if (completionSnap.exists()) {
    job.completion = completionSnap.data();
  }
  
  return job;
}

/**
 * Get customer appointment details
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>}
 */
export async function getCustomerAppointment(tenantId, jobId) {
  const jobRef = doc(db, 'tenants', tenantId, 'jobs', jobId);
  const jobSnap = await getDoc(jobRef);
  
  if (!jobSnap.exists()) {
    throw new Error('Appointment not found');
  }
  
  const job = { id: jobSnap.id, ...jobSnap.data() };
  
  // Get assigned employees
  if (job.assignedEmployees && job.assignedEmployees.length > 0) {
    const employeesRef = collection(db, 'tenants', tenantId, 'employees');
    const employeesQ = query(employeesRef, where('__name__', 'in', job.assignedEmployees.map(e => e.id)));
    const employeesSnap = await getDocs(employeesQ);
    
    job.employees = employeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
  
  return job;
}

/**
 * Get customer payment status
 * @param {string} tenantId - Tenant ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Object>}
 */
export async function getCustomerPaymentStatus(tenantId, customerId) {
  const invoicesRef = collection(db, 'tenants', tenantId, 'invoices');
  const invoicesQ = query(invoicesRef, where('customerId', '==', customerId), orderBy('createdAt', 'desc'));
  const invoicesSnap = await getDocs(invoicesQ);
  
  const invoices = invoicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  let totalOutstanding = 0;
  let totalPaid = 0;
  let outstandingInvoices = [];
  
  for (const invoice of invoices) {
    const amountDue = invoice.amountDue || 0;
    const balancePaid = invoice.balancePaid || 0;
    const outstanding = amountDue - balancePaid;
    
    if (outstanding > 0) {
      totalOutstanding += outstanding;
      outstandingInvoices.push({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amountDue: outstanding,
        dueDate: invoice.dueDate
      });
    }
    
    totalPaid += balancePaid;
  }
  
  return {
    totalOutstanding,
    totalPaid,
    outstandingInvoices,
    hasOutstandingPayments: totalOutstanding > 0
  };
}

/**
 * Pay deposit for estimate
 * @param {string} tenantId - Tenant ID
 * @param {string} leadId - Lead ID
 * @param {number} amount - Payment amount
 * @param {string} paymentMethodId - Stripe payment method ID
 * @returns {Promise<Object>}
 */
export async function payDeposit(tenantId, leadId, amount, paymentMethodId) { // eslint-disable-line no-unused-vars
  const leadRef = doc(db, 'tenants', tenantId, 'leads', leadId);
  const leadSnap = await getDoc(leadRef);
  
  if (!leadSnap.exists()) {
    throw new Error('Lead not found');
  }
  
  // In production, this would create a Stripe payment intent
  // For now, update the lead with deposit paid status
  await updateDoc(leadRef, {
    depositPaid: true,
    depositPaidAt: new Date().toISOString(),
    depositAmountPaid: amount
  });
  
  return { success: true, amount };
}

/**
 * Pay remaining balance for invoice
 * @param {string} tenantId - Tenant ID
 * @param {string} invoiceId - Invoice ID
 * @param {number} amount - Payment amount
 * @param {string} paymentMethodId - Stripe payment method ID
 * @returns {Promise<Object>}
 */
export async function payRemainingBalance(tenantId, invoiceId, amount, paymentMethodId) { // eslint-disable-line no-unused-vars
  const invoiceRef = doc(db, 'tenants', tenantId, 'invoices', invoiceId);
  const invoiceSnap = await getDoc(invoiceRef);
  
  if (!invoiceSnap.exists()) {
    throw new Error('Invoice not found');
  }
  
  const invoice = invoiceSnap.data();
  const currentBalancePaid = invoice.balancePaid || 0;
  const newBalancePaid = currentBalancePaid + amount;
  const amountDue = invoice.amountDue || 0;
  
  // Update invoice with payment
  await updateDoc(invoiceRef, {
    balancePaid: newBalancePaid,
    lastPaymentDate: new Date().toISOString(),
    status: newBalancePaid >= amountDue ? 'paid' : 'partial'
  });
  
  return { success: true, amount, newBalancePaid };
}

/**
 * Request job reschedule
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @param {string} requestedDate - New requested date
 * @param {string} reason - Reason for reschedule
 * @returns {Promise<Object>}
 */
export async function requestJobReschedule(tenantId, jobId, requestedDate, reason) {
  const jobRef = doc(db, 'tenants', tenantId, 'jobs', jobId);
  const jobSnap = await getDoc(jobRef);
  
  if (!jobSnap.exists()) {
    throw new Error('Job not found');
  }
  
  // Update job with reschedule request
  await updateDoc(jobRef, {
    rescheduleRequested: true,
    rescheduleRequestedAt: new Date().toISOString(),
    requestedDate,
    rescheduleReason: reason,
    rescheduleStatus: 'pending'
  });
  
  return { success: true, requestedDate };
}

/**
 * Confirm reschedule (admin action)
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @param {string} newDate - Confirmed new date
 * @param {string} newStartTime - New start time
 * @returns {Promise<Object>}
 */
export async function confirmReschedule(tenantId, jobId, newDate, newStartTime) {
  const jobRef = doc(db, 'tenants', tenantId, 'jobs', jobId);
  const jobSnap = await getDoc(jobRef);
  
  if (!jobSnap.exists()) {
    throw new Error('Job not found');
  }
  
  // Update job with confirmed reschedule
  await updateDoc(jobRef, {
    date: newDate,
    startTime: newStartTime,
    rescheduleRequested: false,
    rescheduleStatus: 'confirmed',
    rescheduleConfirmedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  
  return { success: true, newDate, newStartTime };
}

/**
 * Sign contract
 * @param {string} tenantId - Tenant ID
 * @param {string} contractId - Contract ID
 * @param {string} signatureData - Signature data (base64 or URL)
 * @param {string} signerName - Name of signer
 * @returns {Promise<Object>}
 */
export async function signContract(tenantId, contractId, signatureData, signerName) {
  const contractRef = doc(db, 'tenants', tenantId, 'contracts', contractId);
  const contractSnap = await getDoc(contractRef);
  
  if (!contractSnap.exists()) {
    throw new Error('Contract not found');
  }
  
  // Update contract with signature
  await updateDoc(contractRef, {
    customerSignature: signatureData,
    customerSignedAt: new Date().toISOString(),
    customerSignerName: signerName,
    status: 'signed'
  });
  
  return { success: true, contractId };
}

/**
 * Sign job completion form
 * @param {string} tenantId - Tenant ID
 * @param {string} jobId - Job ID
 * @param {string} signatureData - Signature data (base64 or URL)
 * @param {string} signerName - Name of signer
 * @returns {Promise<Object>}
 */
export async function signJobCompletion(tenantId, jobId, signatureData, signerName) {
  const completionRef = doc(db, 'tenants', tenantId, 'job_completions', jobId);
  const completionSnap = await getDoc(completionRef);
  
  if (!completionSnap.exists()) {
    throw new Error('Job completion not found');
  }
  
  // Update completion with signature
  await updateDoc(completionRef, {
    customerSignature: signatureData,
    customerSignedAt: new Date().toISOString(),
    customerSignerName: signerName,
    status: 'signed'
  });
  
  return { success: true, jobId };
}
