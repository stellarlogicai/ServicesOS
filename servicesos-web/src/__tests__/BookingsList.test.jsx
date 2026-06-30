// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getJobs: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ tenantId: 'tenant-a' }),
}));

vi.mock('../core/scheduling/schedulingService', () => ({
  getJobs: mocks.getJobs,
}));

import BookingsList from '../components/BookingsList';

describe('read-only Bookings admin list', () => {
  beforeEach(() => {
    mocks.getJobs.mockReset();
  });

  it('loads bookings through the active tenant service boundary', async () => {
    let resolveLoad;
    mocks.getJobs.mockReturnValue(new Promise(resolve => {
      resolveLoad = resolve;
    }));

    render(<BookingsList />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading bookings');
    await waitFor(() => expect(mocks.getJobs).toHaveBeenCalledWith('tenant-a'));

    resolveLoad({ success: true, data: [] });
    expect(await screen.findByText('No bookings yet. Approved quote requests will appear here.')).toBeInTheDocument();
  });

  it('renders a clear retryable error when loading fails', async () => {
    mocks.getJobs.mockResolvedValue({ success: false, message: 'permission-denied' });

    render(<BookingsList />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Bookings could not be loaded. Please try again.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('renders incomplete bookings with safe fallbacks and no mutation controls', async () => {
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{ id: 'booking-partial' }],
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Unknown customer' })).toBeInTheDocument();
    expect(screen.getByText('Service not specified')).toBeInTheDocument();
    expect(screen.getByText('Address not provided')).toBeInTheDocument();
    expect(screen.getByText('Not scheduled')).toBeInTheDocument();
    expect(screen.getByText('Price not set')).toBeInTheDocument();
    expect(screen.getByText('Booked')).toBeInTheDocument();

    await waitFor(() => {
      ['Create', 'Edit', 'Delete', 'Pay', 'Assign', 'Reschedule'].forEach(name => {
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      });
    });
  });

  it('displays common booking fields without requiring payment or employee data', async () => {
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        agreedPrice: 245,
        address: '10 Main Street',
        customerSnapshot: { firstName: 'Booked', lastName: 'Customer' },
        date: '2026-07-01',
        id: 'booking-complete',
        serviceType: 'Standard clean',
        startTime: '09:00',
        status: 'scheduled',
      }],
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Booked Customer' })).toBeInTheDocument();
    expect(screen.getByText('Standard clean')).toBeInTheDocument();
    expect(screen.getByText('10 Main Street')).toBeInTheDocument();
    expect(screen.getByText('$245.00')).toBeInTheDocument();
    expect(screen.getByText('scheduled')).toBeInTheDocument();
  });

  it('displays customerName for admin-created estimate bookings without exposing mutation controls', async () => {
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-admin-created',
        customerName: 'Customer Name Display Smoke 0630',
        customerSnapshot: {
          name: 'Customer Name Display Smoke 0630',
          email: 'display-smoke@example.com',
          phone: '555-0630',
        },
        address: '630 Display Lane',
        agreedPrice: 205,
        date: '2026-07-02',
        startTime: '09:00',
        serviceType: 'standard',
        status: 'scheduled',
      }],
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Customer Name Display Smoke 0630' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Unknown customer' })).not.toBeInTheDocument();
    expect(screen.getByText('630 Display Lane')).toBeInTheDocument();
    expect(screen.getByText('$205.00')).toBeInTheDocument();

    await waitFor(() => {
      ['Create', 'Edit', 'Delete', 'Pay', 'Assign', 'Refund', 'Reschedule'].forEach(name => {
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      });
    });
  });
});
