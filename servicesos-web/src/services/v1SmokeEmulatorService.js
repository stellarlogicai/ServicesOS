import { getTenant } from './tenantService';

const V1_SMOKE_PROJECT_ID = 'demo-servicesos-v1-smoke-local';
const V1_SMOKE_TENANT_IDS = ['tenant-smoke-a', 'tenant-smoke-b'];

export function isV1SmokeEmulatorEnvironment({ enabled, projectId }) {
  return enabled === true && projectId === V1_SMOKE_PROJECT_ID;
}

export async function loadV1SmokeTenants(environment) {
  if (!isV1SmokeEmulatorEnvironment(environment)) return null;

  return Promise.all(V1_SMOKE_TENANT_IDS.map((tenantId) => getTenant(tenantId)));
}
