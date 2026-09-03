import { auth, employeeFirebaseRuntime } from "./firebase";
import employeeSessionClient from "./employeeSessionClient";

const { createEmployeeSessionClient } = employeeSessionClient;

export const verifyEmployeeSession = createEmployeeSessionClient({
  auth,
  runtimeConfig: employeeFirebaseRuntime,
  fetchImpl: (...args) => fetch(...args),
});
