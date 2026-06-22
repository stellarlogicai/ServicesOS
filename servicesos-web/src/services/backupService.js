// src/services/backupService.js

/**
 * Backup Service
 * Handles exporting/importing localStorage data to/from JSON files
 * Supports local file downloads and optional Google Drive integration
 */

const BACKUP_KEYS = [
  'crm_leads_v2',
  'crm_quotes_v2',
  'crm_bookings_v2',
  'branding_config',
  'company_settings',
  'user_preferences',
];

/**
 * Export all CRM data from localStorage to JSON
 */
export function exportBackup() {
  const backup = {
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    appVersion: '1.0.0',
    data: {},
    metadata: {
      totalKeys: 0,
      dataSize: 0,
      checksum: ''
    }
  };

  BACKUP_KEYS.forEach(key => {
    const data = localStorage.getItem(key);
    if (data) {
      backup.data[key] = JSON.parse(data);
      backup.metadata.totalKeys++;
      backup.metadata.dataSize += data.length;
    }
  });

  // Generate simple checksum
  const dataString = JSON.stringify(backup.data);
  backup.metadata.checksum = simpleHash(dataString);

  return backup;
}

/**
 * Simple hash function for backup validation
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

/**
 * Import backup data from JSON to localStorage
 */
export function importBackup(backupData) {
  try {
    if (!backupData.data) {
      throw new Error('Invalid backup format');
    }

    // Validate backup if it has metadata
    if (backupData.metadata && backupData.metadata.checksum) {
      const dataString = JSON.stringify(backupData.data);
      const computedHash = simpleHash(dataString);
      if (computedHash !== backupData.metadata.checksum) {
        throw new Error('Backup integrity check failed - data may be corrupted');
      }
    }

    // Version compatibility check
    if (backupData.version) {
      const [major] = backupData.version.split('.').map(Number);
      if (major > 2) {
        console.warn('Backup version is newer than app version - some features may not work');
      }
    }

    Object.keys(backupData.data).forEach(key => {
      localStorage.setItem(key, JSON.stringify(backupData.data[key]));
    });

    return { success: true, message: 'Backup restored successfully' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Validate backup file without importing
 */
export function validateBackup(backupData) {
  try {
    if (!backupData.data) {
      return { valid: false, error: 'Invalid backup format' };
    }

    if (!backupData.version) {
      return { valid: false, error: 'Missing version information' };
    }

    if (!backupData.timestamp) {
      return { valid: false, error: 'Missing timestamp' };
    }

    // Check checksum if present
    if (backupData.metadata && backupData.metadata.checksum) {
      const dataString = JSON.stringify(backupData.data);
      const computedHash = simpleHash(dataString);
      if (computedHash !== backupData.metadata.checksum) {
        return { valid: false, error: 'Checksum mismatch - data corrupted' };
      }
    }

    return { valid: true, message: 'Backup is valid' };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Download backup as JSON file to local PC
 */
export function downloadBackup(filename = null) {
  const backup = exportBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `aunt-bs-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { success: true, message: 'Backup downloaded successfully' };
}

/**
 * Upload and restore backup from local file
 */
export function uploadBackup(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const backupData = JSON.parse(e.target.result);
        const result = importBackup(backupData);
        resolve(result);
      } catch {
        reject({ success: false, error: 'Invalid backup file' });
      }
    };
    
    reader.onerror = () => reject({ success: false, error: 'Failed to read file' });
    reader.readAsText(file);
  });
}

/**
 * Get backup statistics
 */
export function getBackupStats() {
  const stats = {
    totalLeads: 0,
    totalQuotes: 0,
    totalBookings: 0,
    lastBackup: null,
    dataSize: 0
  };

  BACKUP_KEYS.forEach(key => {
    const data = localStorage.getItem(key);
    if (data) {
      const parsed = JSON.parse(data);
      stats.dataSize += data.length;
      
      if (key.includes('leads')) stats.totalLeads = parsed.length;
      if (key.includes('quotes')) stats.totalQuotes = parsed.length;
      if (key.includes('bookings')) stats.totalBookings = parsed.length;
    }
  });

  // Get last backup time from localStorage if available
  const lastBackup = localStorage.getItem('last_backup_time');
  if (lastBackup) {
    stats.lastBackup = lastBackup;
  }

  return stats;
}

/**
 * Save backup timestamp
 */
export function saveBackupTimestamp() {
  localStorage.setItem('last_backup_time', new Date().toISOString());
}

/**
 * Auto-backup to localStorage (keeps last 5 backups)
 */
export function createAutoBackup() {
  const backup = exportBackup();
  const backups = JSON.parse(localStorage.getItem('auto_backups') || '[]');
  
  backups.unshift(backup);
  
  // Keep only last 5 backups
  if (backups.length > 5) {
    backups.pop();
  }
  
  localStorage.setItem('auto_backups', JSON.stringify(backups));
  saveBackupTimestamp();
  
  return { success: true, message: 'Auto-backup created' };
}

/**
 * Restore from auto-backup
 */
export function restoreFromAutoBackup(index = 0) {
  const backups = JSON.parse(localStorage.getItem('auto_backups') || '[]');
  
  if (backups.length === 0 || index >= backups.length) {
    return { success: false, error: 'No auto-backup found' };
  }
  
  return importBackup(backups[index]);
}

/**
 * Get list of auto-backups
 */
export function getAutoBackups() {
  return JSON.parse(localStorage.getItem('auto_backups') || '[]');
}

/**
 * Clear all data (use with caution)
 */
export function clearAllData() {
  BACKUP_KEYS.forEach(key => {
    localStorage.removeItem(key);
  });
  
  return { success: true, message: 'All data cleared' };
}

/**
 * Google Drive Integration (Optional - requires setup)
 * This is a placeholder for future Google Drive API integration
 */
export function uploadToGoogleDrive() {
  // TODO: Implement Google Drive API integration
  // Requires:
  // 1. Google Cloud Project with Drive API enabled
  // 2. OAuth 2.0 setup
  // 3. API credentials in .env
  
  console.log('Google Drive integration not yet implemented');
  return { success: false, error: 'Google Drive integration coming soon' };
}
