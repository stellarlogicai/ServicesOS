import { auth } from '../firebase';
import { resolveEmployeeGatewayBaseUrl } from './employeeFieldGatewayService';

const FUNCTION_NAME = 'jobScopeGateway';
export class JobScopeServiceError extends Error { constructor(message, code = 'scope_unavailable') { super(message); this.code = code; } }

function sanitizeSnapshot(value) {
  const snapshot = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const schedule = snapshot.schedule && typeof snapshot.schedule === 'object' ? snapshot.schedule : {};
  return {
    schemaVersion: snapshot.schemaVersion === 1 ? 1 : 0,
    bookingId: typeof snapshot.bookingId === 'string' ? snapshot.bookingId : '',
    bookingType: ['residential','commercial','legacy'].includes(snapshot.bookingType) ? snapshot.bookingType : 'legacy',
    customerName: typeof snapshot.customerName === 'string' ? snapshot.customerName : '',
    serviceLocation: typeof snapshot.serviceLocation === 'string' ? snapshot.serviceLocation : '',
    serviceType: typeof snapshot.serviceType === 'string' ? snapshot.serviceType : '',
    schedule: Object.fromEntries(['date','startTime','endTime','scheduledAt'].map(key => [key, typeof schedule[key] === 'string' ? schedule[key] : ''])),
    serviceItems: Array.isArray(snapshot.serviceItems) ? snapshot.serviceItems.map(item => ({ id: String(item?.id || ''), label: String(item?.label || ''), area: String(item?.area || ''), required: item?.required === true })).filter(item => item.id && item.label) : [],
    selectedAddOns: Array.isArray(snapshot.selectedAddOns) ? snapshot.selectedAddOns.filter(item => typeof item === 'string') : [],
    price: Number.isFinite(snapshot.price) ? snapshot.price : null,
    estimatedDuration: Number.isFinite(snapshot.estimatedDuration) ? snapshot.estimatedDuration : null,
    accessInstructions: typeof snapshot.accessInstructions === 'string' ? snapshot.accessInstructions : '',
    scopeNotes: typeof snapshot.scopeNotes === 'string' ? snapshot.scopeNotes : '',
    exclusions: typeof snapshot.exclusions === 'string' ? snapshot.exclusions : '',
  };
}

export function sanitizeScope(value) {
  if (!value || typeof value !== 'object' || !Number.isInteger(value.version) || !['draft','awaiting_approval','approved','approval_required'].includes(value.state)) throw new JobScopeServiceError('Service agreement returned an invalid response.','invalid_response');
  return { version:value.version, state:value.state, approvedVersion:Number.isInteger(value.approvedVersion)?value.approvedVersion:null, approvedAt:typeof value.approvedAt==='string'?value.approvedAt:null, scopeHash:typeof value.scopeHash==='string'?value.scopeHash:'', snapshot:sanitizeSnapshot(value.snapshot) };
}

async function request(body, { user = auth.currentUser, fetchImpl = fetch } = {}) {
  if (!user?.getIdToken) throw new JobScopeServiceError('Sign in to view the service agreement.','unauthenticated');
  const token=await user.getIdToken(); const response=await fetchImpl(`${resolveEmployeeGatewayBaseUrl(import.meta.env)}/${FUNCTION_NAME}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  let payload; try{payload=await response.json();}catch{throw new JobScopeServiceError('Service agreement is temporarily unavailable.');}
  if(!response.ok) throw new JobScopeServiceError('Service agreement could not be processed.',payload?.code);
  if(body.action==='customer_list') return Array.isArray(payload.scopes)?payload.scopes.map(sanitizeScope):[];
  return sanitizeScope(payload.scope);
}

export const getOwnerJobScope = (bookingId, options) => request({action:'owner_get',bookingId},options);
export const requestCustomerScopeApproval = (bookingId, options) => request({action:'owner_request',bookingId},options);
export const listCustomerJobScopes = options => request({action:'customer_list'},options);
export const approveCustomerJobScope = (bookingId,version,options) => request({action:'customer_approve',bookingId,version,affirmativeAcceptance:true},options);
