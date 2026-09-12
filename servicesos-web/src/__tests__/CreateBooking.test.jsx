// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getCustomers: vi.fn(), createBooking: vi.fn() }));

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ tenantId: 'tenant-a', user: { uid: 'admin-a' } }) }));
vi.mock('../core/customers/customerService', () => ({ getCustomers: mocks.getCustomers }));
vi.mock('../services/existingCustomerBookingService', async importOriginal => ({
  ...(await importOriginal()),
  createExistingCustomerBooking: mocks.createBooking,
}));

import CreateBooking from '../components/CreateBooking';

describe('Create Booking intake', () => {
  beforeEach(() => {
    mocks.getCustomers.mockReset().mockResolvedValue({ success: true, data: [{ id: 'customer-a', name: 'Ada Customer' }] });
    mocks.createBooking.mockReset().mockResolvedValue({ success: true, data: { id: 'booking-a' } });
  });

  it('requires an explicit Residential or Commercial choice', async () => {
    render(<CreateBooking />);
    expect(await screen.findByRole('option', { name: 'Ada Customer' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Residential' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Commercial' })).not.toBeChecked();
  });

  it('submits residential work through the canonical customer booking service', async () => {
    const onCreated = vi.fn();
    render(<CreateBooking onCreated={onCreated} />);
    await screen.findByRole('option', { name: 'Ada Customer' });
    fireEvent.change(screen.getByLabelText('Saved customer *'), { target: { value: 'customer-a' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Residential' }));
    fireEvent.change(screen.getByLabelText('Service type or job title *'), { target: { value: 'Standard clean' } });
    fireEvent.change(screen.getByLabelText('Scheduled date *'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Scheduled time *'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Approved price ($) *'), { target: { value: '180' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create booking' }));
    await waitFor(() => expect(mocks.createBooking).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-a', customerId: 'customer-a', createdBy: 'admin-a',
      bookingInput: expect.objectContaining({ bookingType: 'residential', serviceType: 'Standard clean' }),
    })));
    expect(onCreated).toHaveBeenCalledWith({ id: 'booking-a' });
  });

  it('shows and submits commercial fields through the same service', async () => {
    render(<CreateBooking />);
    await screen.findByRole('option', { name: 'Ada Customer' });
    fireEvent.change(screen.getByLabelText('Saved customer *'), { target: { value: 'customer-a' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Commercial' }));
    fireEvent.change(screen.getByLabelText('Service type or job title *'), { target: { value: 'Office maintenance' } });
    fireEvent.change(screen.getByLabelText('Scheduled date *'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Scheduled time *'), { target: { value: '18:00' } });
    fireEvent.change(screen.getByLabelText('Approved price ($) *'), { target: { value: '900' } });
    fireEvent.change(screen.getByLabelText('Business name *'), { target: { value: 'Example Office' } });
    fireEvent.change(screen.getByLabelText('Primary contact name *'), { target: { value: 'Ada Cruz' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '555-0100' } });
    fireEvent.change(screen.getByLabelText('Service address *'), { target: { value: '500 Commerce Drive' } });
    fireEvent.change(screen.getByLabelText('Facility type'), { target: { value: 'Office' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create booking' }));
    await waitFor(() => expect(mocks.createBooking).toHaveBeenCalledWith(expect.objectContaining({
      bookingInput: expect.objectContaining({
        bookingType: 'commercial',
        commercialDetails: expect.objectContaining({ businessName: 'Example Office', primaryContactName: 'Ada Cruz', facilityType: 'Office' }),
      }),
    })));
  });
});
