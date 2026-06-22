// src/utils/photoMetadata.js

/**
 * Get current geolocation
 * @returns {Promise<{latitude: number, longitude: number, timestamp: string}>}
 */
export async function getGeolocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date().toISOString()
        });
      },
      (error) => {
        console.warn('Geolocation error:', error);
        resolve(null); // Don't fail if geolocation is denied
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

/**
 * Upload photo with metadata (timestamp and geolocation)
 * @param {Object} storageRef - Firebase storage reference
 * @param {File} file - Photo file
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<string>} Download URL
 */
export async function uploadPhotoWithMetadata(storageRef, file, metadata = {}) {
  const { uploadBytes, getDownloadURL } = await import('../firebase/storage');
  
  // Get geolocation
  const location = await getGeolocation();
  
  // Create metadata object
  const uploadMetadata = {
    contentType: file.type,
    customMetadata: {
      timestamp: new Date().toISOString(),
      originalFileName: file.name,
      fileSize: file.size,
      ...metadata,
      ...(location && {
        latitude: location.latitude.toString(),
        longitude: location.longitude.toString(),
        accuracy: location.accuracy.toString()
      })
    }
  };
  
  await uploadBytes(storageRef, file, uploadMetadata);
  return await getDownloadURL(storageRef);
}

/**
 * Extract EXIF data from image (for more precise timestamp from camera)
 * @param {File} file - Image file
 * @returns {Promise<Object>} EXIF data
 */
export async function extractExifData(file) {
  // This would require a library like exif-js
  // For now, return basic file metadata
  return {
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    lastModified: new Date(file.lastModified).toISOString()
  };
}
