import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DataExport from '../components/DataExport';

const mocks = vi.hoisted(() => ({
  auth: { role: 'admin', currentTenant: { id: 'tenant-a' }, tenantId: 'tenant-a' },
  loadTenantExportData: vi.fn(),
  buildExportRows: vi.fn(),
  createCsv: vi.fn(),
  csvFileName: vi.fn(),
  downloadCsv: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../services/dataExportService', () => ({
  CSV_EXPORTS: [
    { id: 'customers', dataKey: 'customers', label: 'Customers', description: 'Download your active and archived customer records as a CSV file.', emptyMessage: 'No customer records to export.', filePrefix: 'customers', columns: [{ key: 'customerId', label: 'customerId' }] },
    { id: 'leads', dataKey: 'leads', label: 'Leads and quote requests', description: 'Download your leads and quote requests as a CSV file.', emptyMessage: 'No leads or quote requests to export.', filePrefix: 'leads', columns: [{ key: 'leadId', label: 'leadId' }] },
    { id: 'bookings', dataKey: 'bookings', label: 'Bookings', description: 'Download your booking records, including schedule and status information.', emptyMessage: 'No booking records to export.', filePrefix: 'bookings', columns: [{ key: 'bookingId', label: 'bookingId' }] },
    { id: 'payments', dataKey: 'bookings', label: 'Payment records', description: 'Download booking payment status and owner-recorded payment details.', emptyMessage: 'No booking payment records to export.', filePrefix: 'payments', columns: [{ key: 'bookingId', label: 'bookingId' }] },
  ],
  loadTenantExportData: mocks.loadTenantExportData,
  buildExportRows: mocks.buildExportRows,
}));
vi.mock('../utils/csvExport', () => ({
  createCsv: mocks.createCsv,
  csvFileName: mocks.csvFileName,
  downloadCsv: mocks.downloadCsv,
}));

describe('DataExport', () => {
  beforeEach(() => {
    mocks.auth = { role: 'admin', currentTenant: { id: 'tenant-a' }, tenantId: 'tenant-a' };
    mocks.loadTenantExportData.mockReset().mockResolvedValue({
      customers: [{ id: 'customer-a' }], leads: [{ id: 'lead-a' }], bookings: [{ id: 'booking-a' }],
    });
    mocks.buildExportRows.mockReset().mockReturnValue([{ customerId: 'customer-a' }]);
    mocks.createCsv.mockReset().mockReturnValue('customerId\r\ncustomer-a');
    mocks.csvFileName.mockReset().mockReturnValue('servicesos-customers-2026-07-13.csv');
    mocks.downloadCsv.mockReset();
  });

  it('loads tenant-scoped records and lets an admin download a CSV', async () => {
    render(<DataExport />);

    expect(await screen.findByRole('button', { name: 'Export Customers CSV' })).toBeEnabled();
    expect(mocks.loadTenantExportData).toHaveBeenCalledWith('tenant-a');
    fireEvent.click(screen.getByRole('button', { name: 'Export Customers CSV' }));

    await waitFor(() => expect(mocks.downloadCsv).toHaveBeenCalledWith(
      'customerId\r\ncustomer-a', 'servicesos-customers-2026-07-13.csv',
    ));
    expect(screen.getByRole('status')).toHaveTextContent('Customers CSV downloaded.');
    expect(screen.queryByText(/backup/i)).toHaveTextContent('not a full account backup');
  });

  it('disables empty exports with an honest empty state', async () => {
    mocks.loadTenantExportData.mockResolvedValue({ customers: [], leads: [], bookings: [] });
    render(<DataExport />);

    expect(await screen.findByText('No customer records to export.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export Customers CSV' })).toBeDisabled();
  });

  it('shows an honest inline error instead of claiming an export succeeded', async () => {
    mocks.loadTenantExportData.mockRejectedValue(new Error('permission-denied'));
    render(<DataExport />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Export records could not be loaded. Please try again.');
    expect(screen.queryByText(/CSV downloaded/)).not.toBeInTheDocument();
  });

  it.each(['customer', 'employee'])('does not load or expose exports to a %s user', async (role) => {
    mocks.auth = { role, currentTenant: { id: 'tenant-a' }, tenantId: 'tenant-a' };
    render(<DataExport />);

    expect(screen.getByText('Data Export is available to tenant owners and admins only.')).toBeInTheDocument();
    expect(mocks.loadTenantExportData).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Export .* CSV/ })).not.toBeInTheDocument();
  });
});
