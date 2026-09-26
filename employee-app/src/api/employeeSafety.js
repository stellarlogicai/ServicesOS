import { auth, employeeFirebaseRuntime } from './firebase';
import employeeSafetyClient from './employeeSafetyClient';

const send = employeeSafetyClient.createEmployeeSafetyClient({
  auth,
  runtimeConfig: employeeFirebaseRuntime,
  fetchImpl: (...args) => fetch(...args),
});

export const sendSafetyAlert = send;
