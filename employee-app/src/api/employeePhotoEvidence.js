import { collection, getDocs, limit, query } from "firebase/firestore";
import { db } from "./firebase";
import employeePhotoEvidenceClient from "./employeePhotoEvidenceClient";

const { createEmployeePhotoEvidenceClient, isEmployeePhotoEvidenceAccessLossError } = employeePhotoEvidenceClient;

const client = createEmployeePhotoEvidenceClient({ db, collection, getDocs, limit, query });

export const listEmployeeFieldPhotos = client.listEmployeeFieldPhotos;
export { isEmployeePhotoEvidenceAccessLossError };
