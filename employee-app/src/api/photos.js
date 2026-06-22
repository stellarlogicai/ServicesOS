// src/api/photos.js
/**
 * Photo Upload API
 * 
 * Functions for uploading and managing job photos in the employee app.
 * Uses expo-image-picker for camera/gallery access and Firebase Storage for storage.
 */

import * as ImagePicker from "expo-image-picker";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { storage, db } from "./firebase";

/**
 * Pick and upload a photo for a job
 * @param {string} jobId - The job ID
 * @param {string} employeeId - The employee ID
 * @param {string} category - Photo category (before, after, damage, issue, supply)
 * @returns {Promise<string|null>} Download URL of uploaded photo, or null if canceled
 */
export async function pickAndUploadJobPhoto(jobId, employeeId, category) {
  try {
    // Request camera or library permission
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    
    if (!permissionResult.granted) {
      throw new Error("Camera permission not granted");
    }

    // Launch camera
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });

    if (result.canceled) {
      return null;
    }

    const asset = result.assets[0];
    const response = await fetch(asset.uri);
    const blob = await response.blob();

    // Upload to Firebase Storage
    const filePath = `jobPhotos/${jobId}/${Date.now()}.jpg`;
    const fileRef = ref(storage, filePath);

    await uploadBytes(fileRef, blob);

    // Get download URL
    const downloadUrl = await getDownloadURL(fileRef);

    // Store photo metadata in Firestore
    await addDoc(collection(db, "tenants", "DEFAULT", "jobs", jobId, "photos"), {
      employeeId,
      category,
      url: downloadUrl,
      createdAt: serverTimestamp(),
    });

    return downloadUrl;
  } catch (error) {
    console.error("Error uploading photo:", error);
    throw error;
  }
}

/**
 * Pick and upload a photo from gallery for a job
 * @param {string} jobId - The job ID
 * @param {string} employeeId - The employee ID
 * @param {string} category - Photo category (before, after, damage, issue, supply)
 * @returns {Promise<string|null>} Download URL of uploaded photo, or null if canceled
 */
export async function pickAndUploadJobPhotoFromLibrary(jobId, employeeId, category) {
  try {
    // Launch image library
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });

    if (result.canceled) {
      return null;
    }

    const asset = result.assets[0];
    const response = await fetch(asset.uri);
    const blob = await response.blob();

    // Upload to Firebase Storage
    const filePath = `jobPhotos/${jobId}/${Date.now()}.jpg`;
    const fileRef = ref(storage, filePath);

    await uploadBytes(fileRef, blob);

    // Get download URL
    const downloadUrl = await getDownloadURL(fileRef);

    // Store photo metadata in Firestore
    await addDoc(collection(db, "tenants", "DEFAULT", "jobs", jobId, "photos"), {
      employeeId,
      category,
      url: downloadUrl,
      createdAt: serverTimestamp(),
    });

    return downloadUrl;
  } catch (error) {
    console.error("Error uploading photo from library:", error);
    throw error;
  }
}

/**
 * Get all photos for a job
 * @param {string} jobId - The job ID
 * @returns {Promise<Array>} Array of photo objects
 */
export async function getJobPhotos(jobId) {
  try {
    const { getDocs, collection } = await import("firebase/firestore");
    
    const photosRef = collection(db, "tenants", "DEFAULT", "jobs", jobId, "photos");
    const snap = await getDocs(photosRef);

    return snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
  } catch (error) {
    console.error("Error getting job photos:", error);
    throw error;
  }
}
