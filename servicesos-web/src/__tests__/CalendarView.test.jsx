import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CalendarView from '../components/CalendarView';

const mocks = vi.hoisted(() => ({
  getJobs: vi.fn(),
  tenantId: 'tenant-a',
}));

vi.mock('../core/scheduling/schedulingService', () => ({
  BOOKING_MANUAL_PAYMENT_STATUS_LABELS: {},
  getJobs: mocks.getJobs,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ tenantId: mocks.tenantId }),
}));

describe('CalendarView read-only boundary', () => {
  beforeEach(() => {
    mocks.tenantId = 'tenant-a';
    mocks.getJobs.mockReset();
  });

  it('loads active-tenant bookings through getJobs and renders safe display fields', async () => {
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-a',
        customerName: 'Tenant A Customer',
        serviceType: 'Deep clean',
        date: '2026-07-02',
        startTime: '10:00',
        address: '1 Tenant Lane',
        agreedPrice: 225,
        status: 'scheduled',
      }],
    });

    render(<CalendarView />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading calendar');
    expect(await screen.findByText('Tenant A Customer')).toBeInTheDocument();
    expect(mocks.getJobs).toHaveBeenCalledWith('tenant-a');
    expect(screen.getByText('Deep clean')).toBeInTheDocument();
    expect(screen.getByText('1 Tenant Lane')).toBeInTheDocument();
    expect(screen.getByText('$225.00')).toBeInTheDocument();
  });

  it('renders incomplete records with shared booking fallbacks', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [{ id: 'incomplete' }] });

    render(<CalendarView />);

    expect(await screen.findByText('Unknown customer')).toBeInTheDocument();
    expect(screen.getByText('Service not specified')).toBeInTheDocument();
    expect(screen.getByText('Not scheduled')).toBeInTheDocument();
    expect(screen.getByText('Address not provided')).toBeInTheDocument();
    expect(screen.getByText('Price not set')).toBeInTheDocument();
    expect(screen.getByText('Booked')).toBeInTheDocument();
  });

  it('renders an empty state', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [] });
    render(<CalendarView />);
    expect(await screen.findByText('No bookings to display.')).toBeInTheDocument();
  });

  it('does not read without a tenant or offer a retry that cannot succeed', async () => {
    mocks.tenantId = '';
    render(<CalendarView />);

    expect(await screen.findByRole('alert')).toHaveTextContent('tenant is unavailable');
    expect(mocks.getJobs).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('renders a retryable service error', async () => {
    mocks.getJobs
      .mockResolvedValueOnce({ success: false, message: 'permission-denied' })
      .mockResolvedValueOnce({ success: true, data: [] });
    render(<CalendarView />);

    const retry = await screen.findByRole('button', { name: 'Try again' });
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.getJobs).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('No bookings to display.')).toBeInTheDocument();
  });

  it('exposes no booking mutation or employee controls', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [{ id: 'booking-a' }] });
    render(<CalendarView />);
    await screen.findByText('Unknown customer');

    for (const label of ['Create', 'Edit', 'Delete', 'Pay', 'Assign', 'Reschedule', 'Update status']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/employee/i)).not.toBeInTheDocument();
  });
});
