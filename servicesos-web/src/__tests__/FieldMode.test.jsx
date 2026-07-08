import { createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FieldMode from '../components/FieldMode';

const mocks = vi.hoisted(() => ({ getJobs: vi.fn(), tenantId: 'tenant-a' }));

vi.mock('../core/scheduling/schedulingService', () => ({
  BOOKING_MANUAL_PAYMENT_STATUS_LABELS: { not_paid: 'Not paid', paid_cash: 'Paid cash' },
  getJobs: mocks.getJobs,
}));

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ tenantId: mocks.tenantId }) }));

const pad = value => String(value).padStart(2, '0');
const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const today = new Date();
const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

describe('FieldMode read-only field surface', () => {
  beforeEach(() => {
    mocks.tenantId = 'tenant-a';
    mocks.getJobs.mockReset();
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

  it('requires an active tenant and performs no booking read without one', async () => {
    mocks.tenantId = '';
    render(<FieldMode />);
    expect(await screen.findByRole('alert')).toHaveTextContent('tenant is unavailable');
    expect(mocks.getJobs).not.toHaveBeenCalled();
  });

  it('exposes no write, payment collection, employee, route, or safety controls', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [{ id: 'today', customerName: 'Safe Customer', date: dateKey(today) }] });
    render(<FieldMode />);
    await screen.findByText('Safe Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));

    for (const name of ['Arrived', 'In Progress', 'Complete', 'Edit', 'Edit Payment Details', 'Create Stripe payment link', 'Delete', 'Pay', 'Collect payment', 'Refund', 'Assign', 'Reschedule', 'Upload photo', 'Start route', 'Panic']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });
});
