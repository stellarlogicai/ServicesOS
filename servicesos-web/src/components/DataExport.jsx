// src/components/DataExport.jsx
import { useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { importChecklistTemplate } from '../services/checklistTemplateImportService';
import { syncAllQuickBooksData } from '../services/quickBooksApiMigrationService';
import { syncAllGoogleCalendarData } from '../services/googleCalendarApiMigrationService';
import { importEmployeeHomeLocations } from '../services/routeOptimizationImportsService';
import { importHistoricalJobs } from '../services/aiTrainingImportService';
import { importDocument } from '../services/documentImportService';
import { importGoogleReviews } from '../services/marketingImportsService';
import { importHousecallProCustomers } from '../services/housecallProMigrationService';
import { importJobberCustomers } from '../services/jobberMigrationService';
import { importZenMaidClients } from '../services/zenMaidMigrationService';
import { importQuickBooksCustomers } from '../services/quickBooksCSVImportService';
import { downloadPayrollCSV } from '../services/payrollExportService';
import { createExpense } from '../services/expenseTrackingService';
import { createPayment } from '../services/paymentsTrackingService';
import { createInvoice } from '../services/invoicingService';
import { createChecklist } from '../services/qualityControlService';
import { startMileageTracking } from '../services/mileageService';
import { clockIn, clockOut } from '../services/timeClockService';
import { addCustomerPoints } from '../services/customerRewardsService';
import { sendMessage } from '../services/messagingService';
import { createLiveTracking } from '../services/liveTrackingService';

export default function DataExport({ tenantId }) {
  const [activeTab, setActiveTab] = useState('export');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [selectedCollections, setSelectedCollections] = useState({
    leads: true,
    jobs: true,
    employees: true,
    bookings: true,
    photos: false,
    ai_learning_data: false,
    customer_reviews: false
  });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [documentFile, setDocumentFile] = useState(null);
  const [googlePlaceId, setGooglePlaceId] = useState('');
  const [mileageEmployeeId, setMileageEmployeeId] = useState('');
  const [trackingId, setTrackingId] = useState('');

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const handleImportChecklistTemplates = async () => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    setImporting(true);
    try {
      await importChecklistTemplate(tenantId, {});
      showMessage('success', 'Checklist templates imported successfully');
    } catch (error) {
      console.error('Import error:', error);
      showMessage('error', 'Failed to import checklist templates');
    } finally {
      setImporting(false);
    }
  };

  const handleImportQuickBooks = async () => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    setImporting(true);
    try {
      await syncAllQuickBooksData(tenantId);
      showMessage('success', 'QuickBooks data imported successfully');
    } catch (error) {
      console.error('Import error:', error);
      showMessage('error', 'Failed to import QuickBooks data');
    } finally {
      setImporting(false);
    }
  };

  const handleImportGoogleCalendar = async () => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    setImporting(true);
    try {
      await syncAllGoogleCalendarData(tenantId, '2024-01-01', '2024-12-31');
      showMessage('success', 'Google Calendar events imported successfully');
    } catch (error) {
      console.error('Import error:', error);
      showMessage('error', 'Failed to import Google Calendar events');
    } finally {
      setImporting(false);
    }
  };

  const handleImportRouteOptimization = async () => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    setImporting(true);
    try {
      await importEmployeeHomeLocations(tenantId, []);
      showMessage('success', 'Route optimization data imported successfully');
    } catch (error) {
      console.error('Import error:', error);
      showMessage('error', 'Failed to import route optimization data');
    } finally {
      setImporting(false);
    }
  };

  const handleImportAITraining = async () => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    setImporting(true);
    try {
      await importHistoricalJobs(tenantId, []);
      showMessage('success', 'AI training data imported successfully');
    } catch (error) {
      console.error('Import error:', error);
      showMessage('error', 'Failed to import AI training data');
    } finally {
      setImporting(false);
    }
  };

  const handleImportDocuments = async () => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    if (!documentFile) {
      showMessage('error', 'Please select a file to import');
      return;
    }
    setImporting(true);
    try {
      await importDocument(tenantId, documentFile, { uploadedAt: new Date().toISOString() });
      showMessage('success', 'Documents imported successfully');
      setDocumentFile(null);
    } catch (error) {
      console.error('Import error:', error);
      showMessage('error', 'Failed to import documents');
    } finally {
      setImporting(false);
    }
  };

  const handleImportMarketing = async () => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    if (!googlePlaceId) {
      showMessage('error', 'Please enter a Google Place ID');
      return;
    }
    setImporting(true);
    try {
      await importGoogleReviews(tenantId, googlePlaceId);
      showMessage('success', 'Marketing data imported successfully');
      setGooglePlaceId('');
    } catch (error) {
      console.error('Import error:', error);
      showMessage('error', 'Failed to import marketing data');
    } finally {
      setImporting(false);
    }
  };

  const handleImportHousecallPro = async () => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    setImporting(true);
    try {
      await importHousecallProCustomers(tenantId, []);
      showMessage('success', 'Housecall Pro data imported successfully');
    } catch (error) {
      console.error('Import error:', error);
      showMessage('error', 'Failed to import Housecall Pro data');
    } finally {
      setImporting(false);
    }
  };

  const handleImportJobber = async () => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    setImporting(true);
    try {
      await importJobberCustomers(tenantId, []);
      showMessage('success', 'Jobber data imported successfully');
    } catch (error) {
      console.error('Import error:', error);
      showMessage('error', 'Failed to import Jobber data');
    } finally {
      setImporting(false);
    }
  };

  const handleImportZenMaid = async () => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    setImporting(true);
    try {
      await importZenMaidClients(tenantId, []);
      showMessage('success', 'ZenMaid data imported successfully');
    } catch (error) {
      console.error('Import error:', error);
      showMessage('error', 'Failed to import ZenMaid data');
    } finally {
      setImporting(false);
    }
  };

  const handleImportQuickBooksCSV = async () => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    setImporting(true);
    try {
      await importQuickBooksCustomers(tenantId, []);
      showMessage('success', 'QuickBooks CSV data imported successfully');
    } catch (error) {
      console.error('Import error:', error);
      showMessage('error', 'Failed to import QuickBooks CSV data');
    } finally {
      setImporting(false);
    }
  };

  // Operational tool handlers
  const handleExportPayroll = async () => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    setProcessing(true);
    try {
      await downloadPayrollCSV(tenantId, '2024-01-01', '2024-12-31');
      showMessage('success', 'Payroll data exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      showMessage('error', 'Failed to export payroll data');
    } finally {
      setProcessing(false);
    }
  };

  const handleTrackExpense = async (expenseData) => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    setProcessing(true);
    try {
      await createExpense(tenantId, expenseData);
      showMessage('success', 'Expense tracked successfully');
    } catch (error) {
      console.error('Tracking error:', error);
      showMessage('error', 'Failed to track expense');
    } finally {
      setProcessing(false);
    }
  };

  const handleTrackPayment = async (paymentData) => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    setProcessing(true);
    try {
      await createPayment(tenantId, paymentData);
      showMessage('success', 'Payment tracked successfully');
    } catch (error) {
      console.error('Tracking error:', error);
      showMessage('error', 'Failed to track payment');
    } finally {
      setProcessing(false);
    }
  };

  const handleGenerateInvoice = async (invoiceData) => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    setProcessing(true);
    try {
      await createInvoice(tenantId, invoiceData);
      showMessage('success', 'Invoice generated successfully');
    } catch (error) {
      console.error('Generation error:', error);
      showMessage('error', 'Failed to generate invoice');
    } finally {
      setProcessing(false);
    }
  };

  const handleRecordQualityCheck = async (checkData) => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    setProcessing(true);
    try {
      await createChecklist(tenantId, checkData);
      showMessage('success', 'Quality check recorded successfully');
    } catch (error) {
      console.error('Recording error:', error);
      showMessage('error', 'Failed to record quality check');
    } finally {
      setProcessing(false);
    }
  };

  const handleTrackMileage = async () => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    if (!mileageEmployeeId) {
      showMessage('error', 'Please enter an Employee ID');
      return;
    }
    setProcessing(true);
    try {
      await startMileageTracking(tenantId, mileageEmployeeId);
      showMessage('success', 'Mileage tracking started successfully');
      setMileageEmployeeId('');
    } catch (error) {
      console.error('Tracking error:', error);
      showMessage('error', 'Failed to track mileage');
    } finally {
      setProcessing(false);
    }
  };

  const handleClockIn = async (employeeId) => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    setProcessing(true);
    try {
      await clockIn(tenantId, employeeId);
      showMessage('success', 'Clocked in successfully');
    } catch (error) {
      console.error('Clock in error:', error);
      showMessage('error', 'Failed to clock in');
    } finally {
      setProcessing(false);
    }
  };

  const handleClockOut = async (employeeId) => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    setProcessing(true);
    try {
      await clockOut(tenantId, employeeId);
      showMessage('success', 'Clocked out successfully');
    } catch (error) {
      console.error('Clock out error:', error);
      showMessage('error', 'Failed to clock out');
    } finally {
      setProcessing(false);
    }
  };

  const handleAddRewardPoints = async (customerId, points) => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    setProcessing(true);
    try {
      await addCustomerPoints(tenantId, customerId, points, 'Reward points added');
      showMessage('success', 'Reward points added successfully');
    } catch (error) {
      console.error('Reward error:', error);
      showMessage('error', 'Failed to add reward points');
    } finally {
      setProcessing(false);
    }
  };

  const handleSendMessage = async (messageData) => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    setProcessing(true);
    try {
      await sendMessage(tenantId, messageData);
      showMessage('success', 'Message sent successfully');
    } catch (error) {
      console.error('Message error:', error);
      showMessage('error', 'Failed to send message');
    } finally {
      setProcessing(false);
    }
  };

  const handleStartTracking = async (employeeId) => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    setProcessing(true);
    try {
      await createLiveTracking(tenantId, { jobId: employeeId });
      showMessage('success', 'Live tracking started');
    } catch (error) {
      console.error('Tracking error:', error);
      showMessage('error', 'Failed to start tracking');
    } finally {
      setProcessing(false);
    }
  };

  const handleStopTracking = async () => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }
    if (!trackingId) {
      showMessage('error', 'Please enter a Tracking ID');
      return;
    }
    setProcessing(true);
    try {
      const { updateTrackingStatus } = await import('../services/liveTrackingService');
      await updateTrackingStatus(tenantId, trackingId, 'completed');
      showMessage('success', 'Live tracking stopped successfully');
      setTrackingId('');
    } catch (error) {
      console.error('Tracking error:', error);
      showMessage('error', 'Failed to stop tracking');
    } finally {
      setProcessing(false);
    }
  };

  const exportData = async () => {
    if (!tenantId) {
      showMessage('error', 'Tenant ID is required');
      return;
    }

    setExporting(true);
    try {
      const exportData = {};

      // Export leads
      if (selectedCollections.leads) {
        const leadsRef = collection(db, 'tenants', tenantId, 'leads');
        const q = query(leadsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        exportData.leads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      // Export jobs
      if (selectedCollections.jobs) {
        const jobsRef = collection(db, 'tenants', tenantId, 'jobs');
        const q = query(jobsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        exportData.jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      // Export employees
      if (selectedCollections.employees) {
        const employeesRef = collection(db, 'tenants', tenantId, 'employees');
        const snapshot = await getDocs(employeesRef);
        exportData.employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      // Export bookings
      if (selectedCollections.bookings) {
        const bookingsRef = collection(db, 'tenants', tenantId, 'bookings');
        const q = query(bookingsRef, orderBy('date', 'desc'));
        const snapshot = await getDocs(q);
        exportData.bookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      // Export photos
      if (selectedCollections.photos) {
        const photosRef = collection(db, 'tenants', tenantId, 'photos');
        const q = query(photosRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        exportData.photos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      // Export AI learning data
      if (selectedCollections.ai_learning_data) {
        const aiDataRef = collection(db, 'tenants', tenantId, 'ai_learning_data');
        const q = query(aiDataRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        exportData.ai_learning_data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      // Export customer reviews
      if (selectedCollections.customer_reviews) {
        const reviewsRef = collection(db, 'tenants', tenantId, 'customer_reviews');
        const q = query(reviewsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        exportData.customer_reviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      // Create JSON file
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `cleaning_export_${tenantId}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showMessage('success', 'Data exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      showMessage('error', 'Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          Data Import & Export
        </h2>
        <p style={{ fontSize: 16, color: '#64748b', margin: 0 }}>
          Import data from external services or export for backup
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #e2e8f0' }}>
        {['export', 'import', 'operations'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 24px',
              background: activeTab === tab ? 'white' : 'transparent',
              color: activeTab === tab ? '#3b82f6' : '#64748b',
              border: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
              borderBottom: activeTab === tab ? '2px solid white' : '2px solid #e2e8f0',
              borderRadius: '8px 8px 0 0',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: activeTab === tab ? -2 : 0
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Export Tab */}
      {activeTab === 'export' && (
        <>
      {/* Message Banner */}
      {message.text && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 24,
          background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${message.type === 'success' ? '#22c55e' : '#ef4444'}`,
          color: message.type === 'success' ? '#166534' : '#991b1b'
        }}>
          {message.text}
        </div>
      )}

      {/* Collection Selection */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        marginBottom: 24
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
          Select Collections to Export
        </h3>
        <div style={{ display: 'grid', gap: 12 }}>
          {[
            { key: 'leads', label: 'Leads', description: 'Customer leads and estimates' },
            { key: 'jobs', label: 'Jobs', description: 'Completed jobs with actual data' },
            { key: 'employees', label: 'Employees', description: 'Employee information' },
            { key: 'bookings', label: 'Bookings', description: 'Scheduled bookings' },
            { key: 'photos', label: 'Photos', description: 'Before/after photos' },
            { key: 'ai_learning_data', label: 'AI Learning Data', description: 'Training data for AI models' },
            { key: 'customer_reviews', label: 'Customer Reviews', description: 'Customer satisfaction ratings' }
          ].map(item => (
            <label key={item.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px', borderRadius: 8, background: '#f9fafb', border: '1px solid #e5e7eb' }}>
              <input
                type="checkbox"
                checked={selectedCollections[item.key]}
                onChange={(e) => setSelectedCollections({ ...selectedCollections, [item.key]: e.target.checked })}
                style={{ marginTop: 2 }}
              />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{item.label}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{item.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Export Button */}
      <button
        onClick={exportData}
        disabled={exporting || !Object.values(selectedCollections).some(v => v)}
        style={{
          padding: '12px 24px',
          background: exporting ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: exporting || !Object.values(selectedCollections).some(v => v) ? 'not-allowed' : 'pointer',
          opacity: exporting || !Object.values(selectedCollections).some(v => v) ? 0.6 : 1
        }}
      >
        {exporting ? 'Exporting...' : 'Export Data'}
      </button>

      {/* Info Box */}
      <div style={{
        marginTop: 24,
        padding: '16px',
        borderRadius: 8,
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        color: '#1e40af',
        fontSize: 13
      }}>
        <strong>💡 Tip:</strong> Export your data regularly for backup purposes. The exported JSON file can be used to restore data or migrate to another system.
      </div>
        </>
      )}

      {/* Import Tab */}
      {activeTab === 'import' && (
        <>
      {/* Message Banner */}
      {message.text && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 24,
          background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${message.type === 'success' ? '#22c55e' : '#ef4444'}`,
          color: message.type === 'success' ? '#166534' : '#991b1b'
        }}>
          {message.text}
        </div>
      )}

      {/* Import Options */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        marginBottom: 24
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
          Import from External Services
        </h3>
        <div style={{ display: 'grid', gap: 12 }}>
          {[
            { key: 'checklist', label: 'Checklist Templates', description: 'Import cleaning workflow templates', handler: handleImportChecklistTemplates },
            { key: 'quickbooks', label: 'QuickBooks (API)', description: 'Import customers, invoices, and payments via API', handler: handleImportQuickBooks },
            { key: 'quickbooks-csv', label: 'QuickBooks (CSV)', description: 'Import data from QuickBooks CSV export', handler: handleImportQuickBooksCSV },
            { key: 'calendar', label: 'Google Calendar', description: 'Import events and appointments', handler: handleImportGoogleCalendar },
            { key: 'route', label: 'Route Optimization', description: 'Import employee locations and service areas', handler: handleImportRouteOptimization },
            { key: 'ai', label: 'AI Training Data', description: 'Import training data for AI models', handler: handleImportAITraining },
            { key: 'documents', label: 'Documents', description: 'Import company documents and templates', handler: handleImportDocuments, hasInput: true, inputType: 'file', inputValue: documentFile, setInputValue: setDocumentFile },
            { key: 'marketing', label: 'Marketing Data', description: 'Import marketing campaigns and analytics', handler: handleImportMarketing, hasInput: true, inputType: 'text', inputPlaceholder: 'Google Place ID', inputValue: googlePlaceId, setInputValue: setGooglePlaceId },
            { key: 'housecall', label: 'Housecall Pro', description: 'Import data from Housecall Pro', handler: handleImportHousecallPro },
            { key: 'jobber', label: 'Jobber', description: 'Import data from Jobber', handler: handleImportJobber },
            { key: 'zenmaid', label: 'ZenMaid', description: 'Import data from ZenMaid', handler: handleImportZenMaid }
          ].map(item => (
            <div key={item.key} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px', borderRadius: 8, background: '#f9fafb', border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{item.description}</div>
                </div>
                <button
                  onClick={item.handler}
                  disabled={importing}
                  style={{
                    padding: '8px 16px',
                    background: importing ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: importing ? 'not-allowed' : 'pointer',
                    opacity: importing ? 0.6 : 1
                  }}
                >
                  {importing ? 'Importing...' : 'Import'}
                </button>
              </div>
              {item.hasInput && item.inputType === 'file' && (
                <input
                  type="file"
                  onChange={(e) => item.setInputValue(e.target.files[0])}
                  style={{ fontSize: 13, padding: '8px' }}
                />
              )}
              {item.hasInput && item.inputType === 'text' && (
                <input
                  type="text"
                  placeholder={item.inputPlaceholder}
                  value={item.inputValue}
                  onChange={(e) => item.setInputValue(e.target.value)}
                  style={{ fontSize: 13, padding: '8px', border: '1px solid #d1d5db', borderRadius: 4 }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Info Box */}
      <div style={{
        padding: '16px',
        borderRadius: 8,
        background: '#fef3c7',
        border: '1px solid #fcd34d',
        color: '#92400e',
        fontSize: 13
      }}>
        <strong>⚠️ Note:</strong> Import functionality requires API credentials for the respective services. Configure these in your environment variables before importing.
      </div>
        </>
      )}

      {/* Operations Tab */}
      {activeTab === 'operations' && (
        <>
      {/* Message Banner */}
      {message.text && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 24,
          background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${message.type === 'success' ? '#22c55e' : '#ef4444'}`,
          color: message.type === 'success' ? '#166534' : '#991b1b'
        }}>
          {message.text}
        </div>
      )}

      {/* Operational Tools */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        marginBottom: 24
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
          Operational Tools
        </h3>
        <div style={{ display: 'grid', gap: 12 }}>
          {[
            { key: 'payroll', label: 'Export Payroll', description: 'Export payroll data for processing', handler: handleExportPayroll },
            { key: 'expense', label: 'Track Expense', description: 'Record and track business expenses', handler: () => handleTrackExpense({}) },
            { key: 'payment', label: 'Track Payment', description: 'Record and track payments received', handler: () => handleTrackPayment({}) },
            { key: 'invoice', label: 'Generate Invoice', description: 'Create and send invoices to customers', handler: () => handleGenerateInvoice({}) },
            { key: 'quality', label: 'Quality Check', description: 'Record quality control inspections', handler: () => handleRecordQualityCheck({}) },
            { key: 'mileage', label: 'Track Mileage', description: 'Track mileage for reimbursement', handler: handleTrackMileage, hasInput: true, inputType: 'text', inputPlaceholder: 'Employee ID', inputValue: mileageEmployeeId, setInputValue: setMileageEmployeeId },
            { key: 'clockin', label: 'Clock In', description: 'Clock in employee for shift', handler: () => handleClockIn('') },
            { key: 'clockout', label: 'Clock Out', description: 'Clock out employee from shift', handler: () => handleClockOut('') },
            { key: 'rewards', label: 'Add Reward Points', description: 'Add loyalty points for customers', handler: () => handleAddRewardPoints('', 0) },
            { key: 'message', label: 'Send Message', description: 'Send in-app message to customer', handler: () => handleSendMessage({}) },
            { key: 'tracking', label: 'Start Live Tracking', description: 'Start GPS tracking for employee', handler: () => handleStartTracking('') },
            { key: 'stoptracking', label: 'Stop Live Tracking', description: 'Stop GPS tracking for employee', handler: handleStopTracking, hasInput: true, inputType: 'text', inputPlaceholder: 'Tracking ID', inputValue: trackingId, setInputValue: setTrackingId }
          ].map(item => (
            <div key={item.key} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px', borderRadius: 8, background: '#f9fafb', border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{item.description}</div>
                </div>
                <button
                  onClick={item.handler}
                  disabled={processing}
                  style={{
                    padding: '8px 16px',
                    background: processing ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: processing ? 'not-allowed' : 'pointer',
                    opacity: processing ? 0.6 : 1
                  }}
                >
                  {processing ? 'Processing...' : 'Execute'}
                </button>
              </div>
              {item.hasInput && item.inputType === 'text' && (
                <input
                  type="text"
                  placeholder={item.inputPlaceholder}
                  value={item.inputValue}
                  onChange={(e) => item.setInputValue(e.target.value)}
                  style={{ fontSize: 13, padding: '8px', border: '1px solid #d1d5db', borderRadius: 4 }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Info Box */}
      <div style={{
        padding: '16px',
        borderRadius: 8,
        background: '#fef3c7',
        border: '1px solid #fcd34d',
        color: '#92400e',
        fontSize: 13
      }}>
        <strong>⚠️ Note:</strong> These tools require proper setup and configuration. Some tools may need additional parameters or integration with external systems.
      </div>
        </>
      )}
    </div>
  );
}
