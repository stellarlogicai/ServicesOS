// src/components/BackupPanel.jsx
import { useState, useRef } from 'react';
import {
  downloadBackup,
  uploadBackup,
  getBackupStats,
  createAutoBackup,
  getAutoBackups,
  restoreFromAutoBackup,
  clearAllData
} from '../services/backupService';

export default function BackupPanel() {
  const [stats, setStats] = useState(() => getBackupStats());
  const [autoBackups, setAutoBackups] = useState(() => getAutoBackups());
  const [message, setMessage] = useState({ type: '', text: '' });
  const fileInputRef = useRef(null);

  const loadStats = () => {
    setStats(getBackupStats());
    setAutoBackups(getAutoBackups());
  };

  const handleDownload = () => {
    const result = downloadBackup();
    setMessage({ type: 'success', text: result.message });
    loadStats();
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const result = await uploadBackup(file);
      if (result.success) {
        setMessage({ type: 'success', text: result.message });
        loadStats();
      } else {
        setMessage({ type: 'error', text: result.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to upload backup: ' + error.message });
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAutoBackup = () => {
    const result = createAutoBackup();
    setMessage({ type: 'success', text: result.message });
    loadStats();
  };

  const handleRestoreAutoBackup = (index) => {
    if (window.confirm('Are you sure you want to restore from this backup? Current data will be replaced.')) {
      const result = restoreFromAutoBackup(index);
      if (result.success) {
        setMessage({ type: 'success', text: result.message });
        loadStats();
      } else {
        setMessage({ type: 'error', text: result.error });
      }
    }
  };

  const handleClearData = () => {
    if (window.confirm('Are you sure you want to clear ALL data? This cannot be undone!')) {
      const result = clearAllData();
      setMessage({ type: 'success', text: result.message });
      loadStats();
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          Backup & Restore
        </h1>
        <p style={{ fontSize: 16, color: '#64748b', margin: 0 }}>
          Manage your data backups and restore from local files
        </p>
      </div>

      {/* Message Banner */}
      {message.text && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 24,
          background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: message.type === 'success' ? '1px solid #bbf7d0' : '1px solid #fecaca',
          color: message.type === 'success' ? '#166534' : '#991b1b',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{message.text}</span>
          <button
            onClick={() => setMessage({ type: '', text: '' })}
            style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 32
      }}>
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>Total Leads</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#0f172a' }}>{stats?.totalLeads || 0}</div>
        </div>

        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>Data Size</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#0f172a' }}>{formatBytes(stats?.dataSize || 0)}</div>
        </div>

        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>Last Backup</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>{formatDate(stats?.lastBackup)}</div>
        </div>

        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>Auto-Backups</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#0f172a' }}>{autoBackups.length}</div>
        </div>
      </div>

      {/* Backup Actions */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        marginBottom: 24
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>Backup Actions</h2>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <button
            onClick={handleDownload}
            style={{
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            📥 Download Backup
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '12px 24px',
              background: 'white',
              color: '#0f172a',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            📤 Upload Backup
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleUpload}
            style={{ display: 'none' }}
          />

          <button
            onClick={handleAutoBackup}
            style={{
              padding: '12px 24px',
              background: 'white',
              color: '#0f172a',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            💾 Create Auto-Backup
          </button>

          <button
            onClick={handleClearData}
            style={{
              padding: '12px 24px',
              background: '#fef2f2',
              color: '#991b1b',
              border: '1px solid #fecaca',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            🗑️ Clear All Data
          </button>
        </div>
      </div>

      {/* Auto-Backups List */}
      {autoBackups.length > 0 && (
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>Auto-Backups</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {autoBackups.map((backup, index) => (
              <div
                key={index}
                style={{
                  padding: '16px',
                  background: '#f8fafc',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>
                    {formatDate(backup.timestamp)}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Version {backup.version} · {Object.keys(backup.data).length} data types
                  </div>
                </div>
                <button
                  onClick={() => handleRestoreAutoBackup(index)}
                  style={{
                    padding: '8px 16px',
                    background: 'white',
                    color: '#0f172a',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Section */}
      <div style={{
        marginTop: 24,
        padding: '16px',
        background: '#f0f9ff',
        borderRadius: 8,
        border: '1px solid #bae6fd'
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0369a1', marginBottom: 8 }}>💡 Backup Tips</h3>
        <ul style={{ fontSize: 14, color: '#0c4a6e', margin: 0, paddingLeft: 20 }}>
          <li style={{ marginBottom: 4 }}>Download backups regularly to your PC for safekeeping</li>
          <li style={{ marginBottom: 4 }}>Store backup files in a cloud service like Google Drive or Dropbox</li>
          <li style={{ marginBottom: 4 }}>Keep multiple backup versions in case you need to restore to a specific point</li>
          <li>Auto-backups are stored locally and keep the last 5 versions</li>
        </ul>
      </div>
    </div>
  );
}
