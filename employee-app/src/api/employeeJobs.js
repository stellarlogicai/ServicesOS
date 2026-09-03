import { auth, employeeFirebaseRuntime } from "./firebase";
import employeeJobsClient from "./employeeJobsClient";

const {
  createEmployeeJobsClient,
  isEmployeeJobAccessLossError,
} = employeeJobsClient;

const client = createEmployeeJobsClient({
  auth,
  runtimeConfig: employeeFirebaseRuntime,
  fetchImpl: (...args) => fetch(...args),
});

export const listEmployeeJobs = client.listEmployeeJobs;
export const getEmployeeJob = client.getEmployeeJob;
export { isEmployeeJobAccessLossError };
