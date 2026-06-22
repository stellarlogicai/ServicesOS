// src/components/CompressedPhotoUpload.jsx
import { useState } from 'react';
import { compressImages, formatFileSize } from '../services/imageCompressionService';

export default function CompressedPhotoUpload({ onPhotosChange, maxPhotos = 5 }) {
  const [photos, setPhotos] = useState([]);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState('');

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files).slice(0, maxPhotos);
    
    if (files.length === 0) return;
    
    setError('');
    setCompressing(true);
    
    try {
      // Compress images before storing
      const compressedFiles = await compressImages(files, {
        maxWidth: 1920,
        maxHeight: 1080,
        quality: 0.8,
        maxSizeKB: 500
      });
      
      const photoData = compressedFiles.map(f => ({
        file: f,
        name: f.name,
        url: URL.createObjectURL(f),
        originalSize: files.find(orig => orig.name === f.name.replace('_compressed', ''))?.size || f.size,
        compressedSize: f.size
      }));
      
      setPhotos(photoData);
      
      // Call parent callback with compressed files
      if (onPhotosChange) {
        onPhotosChange(compressedFiles, photoData);
      }
      
      console.log(`Compressed ${files.length} images successfully`);
      photoData.forEach(p => {
        console.log(`${p.name}: ${formatFileSize(p.originalSize)} → ${formatFileSize(p.compressedSize)}`);
      });
      
    } catch (err) {
      setError('Failed to compress images. Using original files.');
      console.error('Compression error:', err);
      
      // Fallback to original files
      const fallbackData = files.map(f => ({
        file: f,
        name: f.name,
        url: URL.createObjectURL(f),
        originalSize: f.size,
        compressedSize: f.size
      }));
      
      setPhotos(fallbackData);
      if (onPhotosChange) {
        onPhotosChange(files, fallbackData);
      }
    } finally {
      setCompressing(false);
    }
  };

  const removePhoto = (index) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    setPhotos(newPhotos);
    if (onPhotosChange) {
      onPhotosChange(newPhotos.map(p => p.file), newPhotos);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleUpload}
          disabled={compressing}
          style={{
            width: '100%',
            padding: '12px',
            border: '2px dashed #cbd5e1',
            borderRadius: 8,
            cursor: compressing ? 'not-allowed' : 'pointer',
            background: compressing ? '#f1f5f9' : 'white'
          }}
        />
        
        {compressing && (
          <div style={{ marginTop: 8, color: '#64748b', fontSize: 14 }}>
            Compressing images... ⏳
          </div>
        )}
        
        {error && (
          <div style={{ marginTop: 8, color: '#ef4444', fontSize: 14 }}>
            {error}
          </div>
        )}
      </div>

      {photos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12 }}>
          {photos.map((photo, index) => (
            <div key={index} style={{ position: 'relative' }}>
              <img
                src={photo.url}
                alt={photo.name}
                style={{
                  width: '100%',
                  height: 100,
                  objectFit: 'cover',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0'
                }}
              />
              <button
                onClick={() => removePhoto(index)}
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 'bold'
                }}
              >
                ×
              </button>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, textAlign: 'center' }}>
                {formatFileSize(photo.compressedSize)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
        {photos.length} / {maxPhotos} photos uploaded
      </div>
    </div>
  );
}
