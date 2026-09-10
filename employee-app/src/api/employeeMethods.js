import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import employeeMethodsClient from "./employeeMethodsClient";

const { createEmployeeMethodsClient } = employeeMethodsClient;

const client = createEmployeeMethodsClient({
  async getRecord(tenantId, recordId) {
    const snapshot = await getDoc(doc(db, "tenants", tenantId, "cleaningProductsMethods", recordId));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  },
});

export const getEmployeeMethodsByIds = client.getEmployeeMethodsByIds;
