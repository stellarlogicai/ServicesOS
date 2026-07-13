import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FieldMode from '../components/FieldMode';

const mocks = vi.hoisted(() => ({
  getJobs: vi.fn(),
  updateBookingFieldExecution: vi.fn(),
  tenantId: 'tenant-a',
  user: { uid: 'field-user-1' },
}));

vi.mock('../core/scheduling/schedulingService', () => ({
  BOOKING_FIELD_STATUS_LABELS: {
    not_started: 'Scheduled / not started',
    in_progress: 'In progress',
    completed: 'Completed',
  },
  BOOKING_MANUAL_PAYMENT_STATUS_LABELS: { not_paid: 'Not paid', paid_cash: 'Paid cash' },
  getJobs: mocks.getJobs,
  updateBookingFieldExecution: mocks.updateBookingFieldExecution,
}));

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ tenantId: mocks.tenantId, user: mocks.user }) }));

const pad = value => String(value).padStart(2, '0');
const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const today = new Date();
const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

describe('FieldMode read-only field surface', () => {
  beforeEach(() => {
    mocks.tenantId = 'tenant-a';
    mocks.user = { uid: 'field-user-1' };
    mocks.getJobs.mockReset();
    mocks.updateBookingFieldExecution.mockReset();
    mocks.updateBookingFieldExecution.mockImplementation(async (_tenantId, bookingId, patch) => ({
      success: true,
      data: { id: bookingId, ...patch },
    }));
    delete window.__SERVICESOS_ALLOW_MAPS_AUTO_OPEN__;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads tenant jobs and groups only today and upcoming bookings', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [
      { id: 'past', customerName: 'Past Customer', date: dateKey(yesterday), startTime: '09:00' },
      { id: 'today', customerName: 'Today Customer', date: dateKey(today), startTime: '10:00', serviceType: 'Deep clean' },
      { id: 'future', customerName: 'Upcoming Customer', date: dateKey(tomorrow), startTime: '11:00' },
    ] });

    render(<FieldMode />);

    expect(await screen.findByText('Today Customer')).toBeInTheDocument();
    expect(screen.getByText('Upcoming Customer')).toBeInTheDocument();
    expect(screen.queryByText('Past Customer')).not.toBeInTheDocument();
    expect(mocks.getJobs).toHaveBeenCalledWith('tenant-a');
    expect(within(screen.getByRole('region', { name: 'Today' })).getByText('Deep clean')).toBeInTheDocument();
  });

  it('opens a read-only job packet with call and maps links when data exists', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'today', customerName: 'Field Customer', customerPhone: '555-0100',
      address: '100 Field Lane', date: dateKey(today), startTime: '10:00',
      serviceType: 'Standard clean', notes: 'Use side entrance.', status: 'scheduled', paymentStatus: 'not_paid',
    }] });
    render(<FieldMode />);
    await screen.findByText('Field Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));

    const dialog = screen.getByRole('dialog', { name: 'Field Customer' });
    expect(dialog).toHaveTextContent('Use side entrance.');
    expect(dialog).toHaveTextContent('Not paid');
    expect(within(dialog).getByRole('link', { name: 'Call customer' })).toHaveAttribute('href', 'tel:555-0100');
    expect(within(dialog).getByRole('button', { name: 'Open in maps' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Copy address' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Field actions' })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Maps opens in a new tab/window where supported. Calls require a phone-capable device.');
  });

  it('shows an honest call-device message without claiming call success', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'today', customerName: 'Field Customer', customerPhone: '555-0100',
      address: '100 Field Lane', date: dateKey(today), startTime: '10:00',
    }] });
    render(<FieldMode />);
    await screen.findByText('Field Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));

    fireEvent.click(screen.getByRole('link', { name: 'Call customer' }));

    expect(screen.getByRole('status')).toHaveTextContent('If nothing opened, your device/browser may not support phone calls from this page.');
    expect(screen.queryByText('Call started')).not.toBeInTheDocument();
    expect(screen.queryByText('Calling customer')).not.toBeInTheDocument();
  });

  it('opens maps externally without navigating the ServicesOS tab', async () => {
    window.__SERVICESOS_ALLOW_MAPS_AUTO_OPEN__ = true;
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => ({ closed: false }));
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'today', customerName: 'Field Customer', customerPhone: '555-0100',
      address: '100 Field Lane', date: dateKey(today), startTime: '10:00',
    }] });
    render(<FieldMode />);
    await screen.findByText('Field Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));

    const mapsButton = screen.getByRole('button', { name: 'Open in maps' });
    const click = createEvent.click(mapsButton, { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(click, 'preventDefault');
    const stopPropagationSpy = vi.spyOn(click, 'stopPropagation');
    fireEvent(mapsButton, click);

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('100%20Field%20Lane'),
      '_blank',
      'noopener,noreferrer',
    );
    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it('shows copy-address fallback when maps cannot open automatically', async () => {
    vi.spyOn(window, 'open').mockImplementation(() => null);
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'today', customerName: 'Field Customer',
      address: '100 Field Lane', date: dateKey(today), startTime: '10:00',
    }] });
    render(<FieldMode />);
    await screen.findByText('Field Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));

    fireEvent.click(screen.getByRole('button', { name: 'Open in maps' }));
    expect(screen.getByRole('status')).toHaveTextContent('Maps could not open automatically. Copy the address and open it in your maps app.');

    fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('100 Field Lane');
    expect(await screen.findByText('Address copied.')).toBeInTheDocument();
  });

  it('shows honest unavailable text and no links when phone and address are missing', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [{ id: 'missing', customerName: 'Missing Contact Customer', date: dateKey(today) }] });
    render(<FieldMode />);
    await screen.findByText('Missing Contact Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Phone not provided');
    expect(dialog).toHaveTextContent('Address not provided');
    expect(dialog).toHaveTextContent('Call unavailable');
    expect(dialog).toHaveTextContent('Maps unavailable');
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Open in maps' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Copy address' })).not.toBeInTheDocument();
  });

  it('starts a job through the tenant-scoped field execution update path', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'start-job', customerName: 'Start Customer', date: dateKey(today), paymentStatus: 'not_paid',
    }] });
    render(<FieldMode />);
    await screen.findByText('Start Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));

    fireEvent.click(screen.getByRole('button', { name: 'Start Job' }));

    await waitFor(() => expect(mocks.updateBookingFieldExecution).toHaveBeenCalledWith(
      'tenant-a',
      'start-job',
      { fieldStatus: 'in_progress' },
      { updatedBy: 'field-user-1' },
    ));
    expect(await screen.findByText('Job started.')).toBeInTheDocument();
    expect(JSON.stringify(mocks.updateBookingFieldExecution.mock.calls[0][2])).not.toMatch(/payment|stripe|customer/i);
  });

  it('saves checklist progress without changing payment status', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'checklist-job', customerName: 'Checklist Customer', date: dateKey(today), paymentStatus: 'not_paid',
    }] });
    render(<FieldMode />);
    await screen.findByText('Checklist Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));

    fireEvent.click(screen.getByLabelText('Walk through the home before starting'));
    fireEvent.click(screen.getByRole('button', { name: 'Save checklist' }));

    await waitFor(() => expect(mocks.updateBookingFieldExecution).toHaveBeenCalled());
    const patch = mocks.updateBookingFieldExecution.mock.calls[0][2];
    expect(patch.fieldChecklist[0]).toMatchObject({
      id: 'walkthrough',
      label: 'Walk through the home before starting',
      completed: true,
    });
    expect(patch).not.toHaveProperty('paymentStatus');
    expect(await screen.findByText('Checklist saved.')).toBeInTheDocument();
  });

  it('saves employee notes and issue text for owner review', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'notes-job', customerName: 'Notes Customer', date: dateKey(today), paymentStatus: 'not_paid',
    }] });
    render(<FieldMode />);
    await screen.findByText('Notes Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));

    fireEvent.change(screen.getByLabelText('Employee notes'), { target: { value: 'Finished upstairs first.' } });
    fireEvent.change(screen.getByLabelText('Issue/problem to flag'), { target: { value: 'Back door lock sticks.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));

    await waitFor(() => expect(mocks.updateBookingFieldExecution).toHaveBeenCalledWith(
      'tenant-a',
      'notes-job',
      { fieldNotes: 'Finished upstairs first.', fieldIssue: 'Back door lock sticks.' },
      { updatedBy: 'field-user-1' },
    ));
    expect(await screen.findByText('Notes saved.')).toBeInTheDocument();
  });

  it('marks a job complete without marking it paid', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'complete-job', customerName: 'Complete Customer', date: dateKey(today), paymentStatus: 'not_paid',
    }] });
    render(<FieldMode />);
    await screen.findByText('Complete Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));

    fireEvent.click(screen.getByLabelText('Complete the requested cleaning areas'));
    fireEvent.change(screen.getByLabelText('Employee notes'), { target: { value: 'Ready for owner review.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mark Complete' }));

    await waitFor(() => expect(mocks.updateBookingFieldExecution).toHaveBeenCalled());
    const patch = mocks.updateBookingFieldExecution.mock.calls[0][2];
    expect(patch).toMatchObject({
      fieldStatus: 'completed',
      fieldNotes: 'Ready for owner review.',
      fieldIssue: '',
    });
    expect(patch.fieldChecklist.some(item => item.id === 'service-areas' && item.completed)).toBe(true);
    expect(patch).not.toHaveProperty('paymentStatus');
    expect(patch).not.toHaveProperty('amountReceived');
    expect(await screen.findByText('Job marked complete.')).toBeInTheDocument();
  });

  it('requires an active tenant and performs no booking read without one', async () => {
    mocks.tenantId = '';
    render(<FieldMode />);
    expect(await screen.findByRole('alert')).toHaveTextContent('tenant is unavailable');
    expect(mocks.getJobs).not.toHaveBeenCalled();
  });

  it('exposes no payment collection, admin edit, route, or safety controls', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [{ id: 'today', customerName: 'Safe Customer', date: dateKey(today) }] });
    render(<FieldMode />);
    await screen.findByText('Safe Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));

    expect(screen.getByRole('button', { name: 'Start Job' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark Complete' })).toBeInTheDocument();

    for (const name of ['Arrived', 'In Progress', 'Edit', 'Edit Payment Details', 'Create Stripe payment link', 'Delete', 'Pay', 'Collect payment', 'Refund', 'Assign', 'Reschedule', 'Upload photo', 'Start route', 'Panic']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });
});
