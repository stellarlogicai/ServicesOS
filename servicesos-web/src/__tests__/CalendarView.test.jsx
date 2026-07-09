import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CalendarView from '../components/CalendarView';

const mocks = vi.hoisted(() => ({ getJobs: vi.fn(), tenantId: 'tenant-a' }));

vi.mock('../core/scheduling/schedulingService', () => ({
  BOOKING_MANUAL_PAYMENT_STATUS_LABELS: {},
  getJobs: mocks.getJobs,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ tenantId: mocks.tenantId }),
}));

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth();
const daysInMonth = new Date(year, month + 1, 0).getDate();
const bookedDay = Math.min(now.getDate() + 1, daysInMonth);
const emptyDay = bookedDay === daysInMonth ? bookedDay - 1 : bookedDay + 1;
const pad = value => String(value).padStart(2, '0');
const dateForDay = day => `${year}-${pad(month + 1)}-${pad(day)}`;
const monthHeading = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const dayLabel = day => new Date(year, month, day).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

describe('CalendarView month calendar read-only boundary', () => {
  beforeEach(() => {
    mocks.tenantId = 'tenant-a';
    mocks.getJobs.mockReset();
  });

  it('renders a month grid and loads active-tenant bookings through getJobs', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [] });
    render(<CalendarView />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading calendar');
    expect(await screen.findByRole('heading', { name: monthHeading })).toBeInTheDocument();
    expect(screen.getByText('Read-only schedule view. Change bookings and payment details from Bookings.')).toBeInTheDocument();
    expect(mocks.getJobs).toHaveBeenCalledWith('tenant-a');
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
      expect(screen.getByText(day)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(`${monthHeading} month calendar`)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('groups bookings by date and shows booked-day markers and selected-day details', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [
      { id: 'booking-a', customerName: 'Tenant A Customer', serviceType: 'Deep clean', date: dateForDay(bookedDay), startTime: '10:00', address: '1 Tenant Lane', agreedPrice: 225, status: 'scheduled' },
      { id: 'booking-b', customerName: 'Second Customer', serviceType: 'Standard clean', date: dateForDay(bookedDay), startTime: '13:00', address: '2 Tenant Lane', agreedPrice: 150, status: 'scheduled' },
    ] });
    render(<CalendarView />);

    await screen.findByRole('heading', { name: monthHeading });
    const bookedDayButton = screen.getByRole('button', { name: `Select ${dayLabel(bookedDay)}, 2 bookings` });
    expect(within(bookedDayButton).getByText('2 bookings')).toBeInTheDocument();
    expect(within(bookedDayButton).getByText('Tenant A Customer')).toBeInTheDocument();

    fireEvent.click(bookedDayButton);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('2 bookings scheduled');
    expect(dialog).toHaveTextContent(new Date(year, month, bookedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }));
    expect(screen.getByRole('heading', { name: 'Tenant A Customer' })).toBeInTheDocument();
    expect(screen.getByText('Deep clean')).toBeInTheDocument();
    expect(screen.getByText('1 Tenant Lane')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('10:00');
    expect(screen.queryByText('$225.00')).not.toBeInTheDocument();
    expect(screen.getAllByText('Payment status not set').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a clear message when an empty day is selected', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [] });
    render(<CalendarView />);
    await screen.findByRole('heading', { name: monthHeading });

    fireEvent.click(screen.getByRole('button', { name: `Select ${dayLabel(emptyDay)}, 0 bookings` }));
    expect(screen.getByRole('dialog')).toHaveTextContent('No bookings scheduled');
    expect(screen.getByRole('dialog')).toHaveTextContent('New jobs appear here after they are created in Bookings.');
  });

  it('changes the visible month with Previous Month and Next Month controls', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [] });
    render(<CalendarView />);
    await screen.findByRole('heading', { name: monthHeading });

    fireEvent.click(screen.getByRole('button', { name: 'Next Month' }));
    const nextHeading = new Date(year, month + 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    expect(screen.getByRole('heading', { name: nextHeading })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous Month' }));
    expect(screen.getByRole('heading', { name: monthHeading })).toBeInTheDocument();
  });

  it('renders incomplete selected-day records with shared booking fallbacks', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [{ id: 'incomplete', date: dateForDay(bookedDay) }] });
    render(<CalendarView />);
    await screen.findByRole('heading', { name: monthHeading });
    fireEvent.click(screen.getByRole('button', { name: `Select ${dayLabel(bookedDay)}, 1 booking` }));

    expect(screen.getByRole('heading', { name: 'Unknown customer' })).toBeInTheDocument();
    expect(screen.getByText('Service not specified')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('Time not set');
    expect(screen.getByText('Address not provided')).toBeInTheDocument();
    expect(screen.getByText('Booked')).toBeInTheDocument();
    expect(screen.queryByText('Price not set')).not.toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(mocks.getJobs).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('heading', { name: monthHeading })).toBeInTheDocument();
  });

  it('exposes navigation only and no booking mutation, payment, or employee controls', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [{ id: 'booking-a', date: dateForDay(bookedDay) }] });
    render(<CalendarView />);
    await screen.findByRole('heading', { name: monthHeading });

    for (const label of ['Create', 'Edit', 'Delete', 'Pay', 'Payment', 'Refund', 'Assign', 'Reschedule', 'Update status', 'Staff', 'Route']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Previous Month' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next Month' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Date & Notes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Payment Status' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Payment Details' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Stripe payment link' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View Details' })).not.toBeInTheDocument();
  });
});
