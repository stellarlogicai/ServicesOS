import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { createCsv, csvFileName, downloadCsv } from '../utils/csvExport';
import { CSV_EXPORTS, buildExportRows, loadTenantExportData } from '../services/dataExportService';
import './DataExport.css';

const emptyExportData = {
  customers: [],
  leads: [],
  bookings: [],
};

export default function DataExport() {
  const { role, tenantId } = useAuth();
  const isOwnerAdmin = role === 'admin' || role === 'super-admin';
  const [exportData, setExportData] = useState(emptyExportData);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeExport, setActiveExport] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  const loadRecords = useCallback(async () => {
    if (!isOwnerAdmin) {
      setLoading(false);
      return;
    }

    if (!tenantId) {
      setExportData(emptyExportData);
      setLoadError('Select an active tenant before exporting records.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError('');
    setMessage('');
    try {
      setExportData(await loadTenantExportData(tenantId));
    } catch {
      setExportData(emptyExportData);
      setLoadError('Export records could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [isOwnerAdmin, tenantId]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) loadRecords();
    });
    return () => { active = false; };
  }, [loadRecords]);

  const exportRecords = (definition) => {
    const records = exportData[definition.dataKey] || [];
    if (!records.length) return;

    setActiveExport(definition.id);
    setMessage('');
    try {
      const rows = buildExportRows(definition.id, records);
      downloadCsv(
        createCsv(definition.columns, rows),
        csvFileName(definition.filePrefix),
      );
      setMessage(`${definition.label} CSV downloaded.`);
      setMessageType('success');
    } catch {
      setMessage(`${definition.label} CSV could not be downloaded. Please try again.`);
      setMessageType('error');
    } finally {
      setActiveExport('');
    }
  };

  if (!isOwnerAdmin) {
    return (
      <section className="v1-page data-export-page" aria-labelledby="data-export-title">
        <h1 className="v1-page-title" id="data-export-title">Data Export</h1>
        <p className="v1-page-subtitle">Data Export is available to tenant owners and admins only.</p>
      </section>
    );
  }

  return (
    <section className="v1-page data-export-page" aria-labelledby="data-export-title">
      <div className="v1-page-header" style={{ marginBottom: 24 }}>
        <h1 className="v1-page-title" id="data-export-title">Data Export</h1>
        <p className="v1-page-subtitle">Download tenant-scoped records as CSV files. This is a manual data export, not a full account backup.</p>
      </div>

      {loading && <p role="status">Loading export records...</p>}
      {!loading && loadError && (
        <div className="data-export-message" data-state="error" role="alert">
          <p>{loadError}</p>
          {tenantId && <button className="v1-button v1-button-secondary" type="button" onClick={loadRecords}>Try again</button>}
        </div>
      )}
      {!loading && !loadError && message && (
        <div className="data-export-message" data-state={messageType === 'error' ? 'error' : 'success'} role={messageType === 'error' ? 'alert' : 'status'}>
          {message}
        </div>
      )}

      {!loading && !loadError && (
        <div className="data-export-grid">
          {CSV_EXPORTS.map(definition => {
            const recordCount = exportData[definition.dataKey]?.length || 0;
            const isEmpty = recordCount === 0;
            const isExporting = activeExport === definition.id;

            return (
              <article className="data-export-card" key={definition.id}>
                <div>
                  <h2>{definition.label}</h2>
                  <p>{definition.description}</p>
                </div>
                <div className="data-export-count">{recordCount} {recordCount === 1 ? 'record' : 'records'} available</div>
                {isEmpty && <div className="data-export-empty">{definition.emptyMessage}</div>}
                <button
                  className="v1-button v1-button-primary"
                  type="button"
                  onClick={() => exportRecords(definition)}
                  disabled={isEmpty || Boolean(activeExport)}
                >
                  {isExporting ? 'Preparing CSV...' : `Export ${definition.label} CSV`}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
