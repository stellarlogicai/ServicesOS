import { auth, employeeFirebaseRuntime } from './firebase';
import workAssistantClient from './employeeWorkAssistantClient';

const {
  createEmployeeWorkAssistantClient,
  createEmployeeWorkAssistantRequestId,
  isEmployeeWorkAssistantAccessLoss,
} = workAssistantClient;

const client = createEmployeeWorkAssistantClient({
  auth,
  runtimeConfig: employeeFirebaseRuntime,
  fetchImpl: (...args) => fetch(...args),
});

export const askEmployeeWorkAssistant = client;
export { createEmployeeWorkAssistantRequestId, isEmployeeWorkAssistantAccessLoss };
