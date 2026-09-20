import { auth } from '../firebase';
import { resolveOwnerOnboardingGatewayUrl } from './ownerOnboardingService';

export class ServiceCatalogServiceError extends Error {
  constructor(message, code = 'catalog_unavailable') { super(message); this.name='ServiceCatalogServiceError'; this.code=code; }
}

function project(value) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id.trim() ||
      typeof value.name !== 'string' || !value.name.trim() ||
      !['standard','deep','moveout','construction'].includes(value.serviceType) ||
      typeof value.active !== 'boolean' || !Number.isInteger(value.priceCents) || value.priceCents < 1 ||
      !Number.isInteger(value.durationMinutes) || value.durationMinutes < 1) {
    throw new ServiceCatalogServiceError('The service catalog returned invalid data.', 'invalid_response');
  }
  return { id:value.id.trim(), name:value.name.trim(), serviceType:value.serviceType, active:value.active, priceCents:value.priceCents, durationMinutes:value.durationMinutes };
}

async function callCatalog(body,{user=auth.currentUser,fetchImpl=fetch}={}) {
  if(!user||typeof user.getIdToken!=='function') throw new ServiceCatalogServiceError('Sign in to manage services.','unauthenticated');
  const response=await fetchImpl(resolveOwnerOnboardingGatewayUrl(import.meta.env,'serviceCatalogGateway'),{method:'POST',headers:{Authorization:`Bearer ${await user.getIdToken()}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  let payload; try{payload=await response.json();}catch{throw new ServiceCatalogServiceError('Service catalog is temporarily unavailable.');}
  if(!response.ok) throw new ServiceCatalogServiceError('Service catalog could not be updated.',typeof payload?.code==='string'?payload.code:'catalog_unavailable');
  return payload;
}

export async function listOwnerServices(options){const payload=await callCatalog({action:'owner_list'},options);return (payload.services||[]).map(project);}
export async function listActiveServices(options){return (await listOwnerServices(options)).filter(service=>service.active);}
export async function createService(values,options){const payload=await callCatalog({action:'owner_create',...values},options);return project(payload.service);}
export async function updateService(serviceId,values,options){const payload=await callCatalog({action:'owner_update',serviceId,...values},options);return project(payload.service);}
