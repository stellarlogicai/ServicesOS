import * as FileSystem from "expo-file-system";
import { auth, employeeFirebaseRuntime } from "./firebase";
import fieldPhotosClient from "./fieldPhotosClient";

const { createFieldPhotoClient, createFieldPhotoClientUploadId } = fieldPhotosClient;

const client = createFieldPhotoClient({
  auth,
  runtimeConfig: employeeFirebaseRuntime,
  fetchImpl: (...args) => fetch(...args),
  uploadFileAsync: (...args) => FileSystem.uploadAsync(...args),
  binaryUploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
  foregroundSessionType: FileSystem.FileSystemSessionType.FOREGROUND,
});

export { createFieldPhotoClientUploadId };
export const reserveFieldPhotoUpload = client.reserveFieldPhotoUpload;
export const createFieldPhotoUploadSession = client.createFieldPhotoUploadSession;
export const uploadReservedFieldPhotoBinary = client.uploadReservedFieldPhotoBinary;
export const finalizeFieldPhotoUpload = client.finalizeFieldPhotoUpload;
export const uploadFieldPhoto = client.uploadFieldPhoto;
