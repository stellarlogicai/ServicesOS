import { auth, employeeFirebaseRuntime } from "./firebase";
import employeeFieldExecutionClient from "./employeeFieldExecutionClient";

const { createEmployeeFieldExecutionClient } = employeeFieldExecutionClient;

const client = createEmployeeFieldExecutionClient({
  auth,
  runtimeConfig: employeeFirebaseRuntime,
  fetchImpl: (...args) => fetch(...args),
});

export const startEmployeeJob = client.startEmployeeJob;
export const saveEmployeeChecklist = client.saveEmployeeChecklist;
export const saveEmployeeNotes = client.saveEmployeeNotes;
export const completeEmployeeJob = client.completeEmployeeJob;
