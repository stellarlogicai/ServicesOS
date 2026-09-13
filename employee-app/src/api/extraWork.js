import { auth,employeeFirebaseRuntime } from './firebase';
import clientModule from './extraWorkClient';
const client=clientModule.createExtraWorkClient({auth,runtimeConfig:employeeFirebaseRuntime,fetchImpl:(...args)=>fetch(...args)});
export const listActiveAddOns=client.listCatalog;
export const listExtraWorkRequests=client.listRequests;
export const submitExtraWorkRequest=client.submitRequest;
