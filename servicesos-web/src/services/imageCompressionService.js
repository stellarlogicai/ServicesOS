// src/services/imageCompressionService.js

/**
 * Compress an image file
 * @param {File} file - Original image file
 * @param {Object} options - Compression options
 * @param {number} options.maxWidth - Maximum width (default 1920)
 * @param {number} options.maxHeight - Maximum height (default 1080)
 * @param {number} options.quality - JPEG quality 0-1 (default 0.8)
 * @param {number} options.maxSizeKB - Maximum file size in KB (default 500)
 * @returns {Promise<File>} Compressed image file
 */
export async function compressImage(file, options = {}) {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 0.8,
    maxSizeKB = 500
  } = options;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        
        // Create canvas for resizing
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Compress with decreasing quality until size is acceptable
        let currentQuality = quality;
        const compress = (attempt = 0) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to compress image'));
                return;
              }
              
              const sizeKB = blob.size / 1024;
              
              // If size is acceptable or we've tried too many times, return the result
              if (sizeKB <= maxSizeKB || attempt >= 5) {
                const compressedFile = new File(
                  [blob],
                  file.name.replace(/\.[^.]+$/, '_compressed.jpg'),
                  { type: 'image/jpeg', lastModified: Date.now() }
                );
                resolve(compressedFile);
                return;
              }
              
              // Reduce quality and try again
              currentQuality -= 0.1;
              if (currentQuality < 0.1) currentQuality = 0.1;
              compress(attempt + 1);
            },
            'image/jpeg',
            currentQuality
          );
        };
        
        compress();
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compress multiple image files
 * @param {File[]} files - Array of image files
 * @param {Object} options - Compression options
 * @returns {Promise<File[]>} Array of compressed image files
 */
export async function compressImages(files, options = {}) {
  const compressionPromises = files.map(file => compressImage(file, options));
  return Promise.all(compressionPromises);
}

/**
 * Get image dimensions without loading the full image
 * @param {File} file - Image file
 * @returns {Promise<{width: number, height: number}>} Image dimensions
 */
export async function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Get file size in human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Validate image file
 * @param {File} file - File to validate
 * @param {Object} constraints - Validation constraints
 * @param {number} constraints.maxSizeMB - Maximum file size in MB (default 10)
 * @param {string[]} constraints.allowedTypes - Allowed MIME types (default common image types)
 * @returns {Object} Validation result
 */
export function validateImageFile(file, constraints = {}) {
  const {
    maxSizeMB = 10,
    allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  } = constraints;
  
  const errors = [];
  
  // Check file type
  if (!allowedTypes.includes(file.type)) {
    errors.push(`File type ${file.type} is not allowed. Allowed types: ${allowedTypes.join(', ')}`);
  }
  
  // Check file size
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    errors.push(`File size exceeds ${maxSizeMB}MB limit`);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Convert file to base64 string
 * @param {File} file - File to convert
 * @returns {Promise<string>} Base64 string
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to convert file to base64'));
    reader.readAsDataURL(file);
  });
}

/**
 * Create a thumbnail from an image
 * @param {File} file - Original image file
 * @param {Object} options - Thumbnail options
 * @param {number} options.width - Thumbnail width (default 200)
 * @param {number} options.height - Thumbnail height (default 200)
 * @param {number} options.quality - JPEG quality (default 0.7)
 * @returns {Promise<string>} Thumbnail data URL
 */
export async function createThumbnail(file, options = {}) {
  const { width = 200, height = 200, quality = 0.7 } = options;
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        
        // Calculate aspect ratio
        const ratio = Math.min(width / img.width, height / img.height);
        const thumbWidth = img.width * ratio;
        const thumbHeight = img.height * ratio;
        
        // Center the image
        const x = (width - thumbWidth) / 2;
        const y = (height - thumbHeight) / 2;
        
        ctx.drawImage(img, x, y, thumbWidth, thumbHeight);
        
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
