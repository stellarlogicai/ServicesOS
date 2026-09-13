import { auth } from '../firebase';
import { resolveOwnerOnboardingGatewayUrl } from './ownerOnboardingService';

export class AddOnCatalogServiceError extends Error {
  constructor(message, code = 'catalog_unavailable') { super(message); this.name = 'AddOnCatalogServiceError'; this.code = code; }
}

function projectAddOn(value, owner = true) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id.trim() ||
      typeof value.label !== 'string' || !value.label.trim() || !Number.isInteger(value.priceCents) ||
      value.priceCents < 0 || !Number.isInteger(value.durationMinutes) || value.durationMinutes < 1 ||
      (owner && typeof value.active !== 'boolean')) throw new AddOnCatalogServiceError('The add-on catalog returned invalid data.', 'invalid_response');
  const result = { id:value.id.trim(), label:value.label.trim(), priceCents:value.priceCents, durationMinutes:value.durationMinutes };
  if (owner) { result.description = typeof value.description === 'string' ? value.description.trim() : ''; result.active = value.active; }
  return result;
}

async function callCatalog(body, { user = auth.currentUser, fetchImpl = fetch } = {}) {
  if (!user || typeof user.getIdToken !== 'function') throw new AddOnCatalogServiceError('Sign in to manage add-ons.', 'unauthenticated');
  const response = await fetchImpl(resolveOwnerOnboardingGatewayUrl(import.meta.env, 'addOnCatalogGateway'), {
    method:'POST', headers:{ Authorization:`Bearer ${await user.getIdToken()}`, 'Content-Type':'application/json' }, body:JSON.stringify(body),
  });
  let payload; try { payload=await response.json(); } catch { throw new AddOnCatalogServiceError('Add-on catalog is temporarily unavailable.'); }
  if(!response.ok) throw new AddOnCatalogServiceError('Add-on catalog could not be updated.', typeof payload?.code==='string'?payload.code:'catalog_unavailable');
  return payload;
}

export async function listOwnerAddOns(options) { const payload=await callCatalog({action:'owner_list'},options); return (payload.addOns || []).map(value=>projectAddOn(value)); }
export async function listEmployeeActiveAddOns(options) { const payload=await callCatalog({action:'employee_list_active'},options); return (payload.addOns || []).map(value=>projectAddOn(value,false)); }
export async function createAddOn(values, options) { const payload=await callCatalog({action:'owner_create',...values},options); return projectAddOn(payload.addOn); }
export async function updateAddOn(addOnId, values, options) { const payload=await callCatalog({action:'owner_update',addOnId,...values},options); return projectAddOn(payload.addOn); }
