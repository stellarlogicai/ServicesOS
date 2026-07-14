// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getJobs: vi.fn(),
  createBookingCheckoutSession: vi.fn(),
  updateBookingAdminFields: vi.fn(),
  updateBookingManualPaymentStatus: vi.fn(),
  listFieldPhotos: vi.fn(),
  loadFieldPhotoBlob: vi.fn(),
  getActiveTenantEmployeeProfiles: vi.fn(),
  tenantId: 'tenant-a',
  adminAccess: true,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ tenantId: mocks.tenantId, isAdmin: () => mocks.adminAccess }),
}));

vi.mock('../core/scheduling/schedulingService', () => ({
  BOOKING_FIELD_STATUS_LABELS: {
    not_started: 'Scheduled / not started',
    in_progress: 'In progress',
    completed: 'Completed',
  },
  BOOKING_MANUAL_PAYMENT_STATUS_LABELS: {
    not_paid: 'Not paid',
    deposit_requested: 'Deposit requested',
    deposit_paid: 'Deposit paid',
    final_due: 'Final due',
    partial: 'Partial',
    paid_in_full: 'Paid in full',
    paid_cash: 'Paid cash',
    paid_check: 'Paid check',
    paid_external_app: 'Paid external app',
    waived_family_discount: 'Waived / family discount',
    payment_issue: 'Payment issue',
  },
  BOOKING_PAYMENT_METHOD_LABELS: {
    cash: 'Cash',
    check: 'Check',
    venmo: 'Venmo',
    cash_app: 'Cash App',
    zelle: 'Zelle',
    facebook_pay: 'Facebook Pay',
    paypal: 'PayPal',
    card: 'Card',
    stripe_manual_reference: 'Stripe manual reference',
    waived: 'Waived',
    other: 'Other',
  },
  getJobs: mocks.getJobs,
  updateBookingAdminFields: mocks.updateBookingAdminFields,
  updateBookingManualPaymentStatus: mocks.updateBookingManualPaymentStatus,
}));

vi.mock('../services/stripeService', () => ({
  createBookingCheckoutSession: mocks.createBookingCheckoutSession,
}));

vi.mock('../services/fieldPhotoService', () => ({
  FIELD_PHOTO_PHASES: ['before', 'after'],
  listFieldPhotos: mocks.listFieldPhotos,
  loadFieldPhotoBlob: mocks.loadFieldPhotoBlob,
}));

vi.mock('../services/employeeProfileService', () => ({
  getActiveTenantEmployeeProfiles: mocks.getActiveTenantEmployeeProfiles,
  employeeAssignmentLabel: employee => employee.displayName || employee.email || employee.uid,
}));

import BookingsList from '../components/BookingsList';

describe('read-only Bookings admin list', () => {
  beforeEach(() => {
    mocks.tenantId = 'tenant-a';
    mocks.adminAccess = true;
    mocks.getJobs.mockReset();
    mocks.createBookingCheckoutSession.mockReset();
    mocks.updateBookingAdminFields.mockReset();
    mocks.updateBookingManualPaymentStatus.mockReset();
    mocks.listFieldPhotos.mockReset();
    mocks.loadFieldPhotoBlob.mockReset();
    mocks.getActiveTenantEmployeeProfiles.mockReset();
    mocks.getActiveTenantEmployeeProfiles.mockResolvedValue({ success: true, data: [] });
    mocks.listFieldPhotos.mockResolvedValue([]);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('identifies Bookings as the job management surface', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [] });
    render(<BookingsList />);

    expect(await screen.findByText('Your job management page. Update booked job details, create Stripe payment links, and copy customer-ready messages.')).toBeInTheDocument();
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
    expect(await screen.findByText('No bookings yet')).toBeInTheDocument();
    expect(await screen.findByText('Approve a quote request or create a booking from an estimate to schedule the first job.')).toBeInTheDocument();
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
      ['Create', 'Delete', 'Pay', 'Assign', 'Refund', 'Reschedule'].forEach(name => {
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
      ['Create', 'Delete', 'Pay', 'Assign', 'Refund', 'Reschedule'].forEach(name => {
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      });
    });
  });

  it('opens and closes a read-only booking detail view with complete booking fields', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-detail-complete',
        leadId: 'lead-detail-complete',
        customerName: 'Customer Name Display Smoke 0630',
        customerSnapshot: {
          email: 'display-smoke@example.com',
          phone: '555-0630',
        },
        address: '630 Display Lane',
        agreedPrice: 205,
        date: '2026-07-02',
        startTime: '09:00',
        serviceType: 'standard',
        status: 'scheduled',
        paymentStatus: 'paid_cash',
        notes: 'Bring blue microfiber cloths.'
      }],
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Customer Name Display Smoke 0630' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));

    const dialog = await screen.findByRole('dialog', { name: 'Customer Name Display Smoke 0630' });
    expect(dialog).toHaveTextContent('display-smoke@example.com');
    expect(dialog).toHaveTextContent('555-0630');
    expect(dialog).toHaveTextContent('standard');
    expect(dialog).toHaveTextContent('scheduled');
    expect(dialog).toHaveTextContent('Payment status');
    expect(dialog).toHaveTextContent('Paid cash');
    expect(dialog).toHaveTextContent('Payment details');
    expect(dialog).toHaveTextContent('Amount received');
    expect(dialog).toHaveTextContent('Still owed');
    expect(dialog).toHaveTextContent('Jul 2, 2026 at 09:00');
    expect(dialog).toHaveTextContent('630 Display Lane');
    expect(dialog).toHaveTextContent('$205.00');
    expect(dialog).toHaveTextContent('Bring blue microfiber cloths.');
    expect(dialog).toHaveTextContent('lead-detail-complete');

    expect(screen.getByRole('button', { name: 'Edit Date & Notes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Payment Details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Stripe payment link' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/payment status/i)).not.toBeInTheDocument();
    ['Delete', 'Pay', 'Assign', 'Refund', 'Reschedule', 'Update status', 'Cancel booking', 'Collect payment', 'Create payment link', 'Stripe checkout', 'Invoice'].forEach(name => {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Close booking details' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows safe fallbacks in the read-only detail view for incomplete bookings', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{ id: 'booking-partial' }],
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Unknown customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));

    const dialog = await screen.findByRole('dialog', { name: 'Unknown customer' });
    expect(dialog).toHaveTextContent('Email not provided');
    expect(dialog).toHaveTextContent('Phone not provided');
    expect(dialog).toHaveTextContent('Service not specified');
    expect(dialog).toHaveTextContent('Booked');
    expect(dialog).toHaveTextContent('Payment status');
    expect(dialog).toHaveTextContent('Payment status not set');
    expect(dialog).toHaveTextContent('Not scheduled');
    expect(dialog).toHaveTextContent('Address not provided');
    expect(dialog).toHaveTextContent('Price not set');
    expect(dialog).toHaveTextContent('No field completion details recorded yet.');
    expect(dialog).toHaveTextContent('No notes provided');
    expect(dialog).toHaveTextContent('booking-partial');
  });

  it('assigns a booking using only an active tenant employee Auth UID', async () => {
    const user = userEvent.setup();
    mocks.getActiveTenantEmployeeProfiles.mockResolvedValue({
      success: true,
      data: [
        { uid: 'employee-a', displayName: 'Employee A', role: 'employee', status: 'active', tenantId: 'tenant-a' },
        { uid: 'employee-a-2', displayName: 'Employee B', role: 'employee', status: 'active', tenantId: 'tenant-a' },
      ],
    });
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'booking-assignment', customerName: 'Assignment Customer', date: '2026-07-20', status: 'scheduled',
    }] });
    mocks.updateBookingAdminFields.mockResolvedValue({
      success: true,
      data: { id: 'booking-assignment', assignedEmployeeAuthUid: 'employee-a' },
    });

    render(<BookingsList />);
    await user.click(await screen.findByRole('button', { name: 'View Details' }));
    await waitFor(() => expect(mocks.getActiveTenantEmployeeProfiles).toHaveBeenCalledWith('tenant-a'));
    const assignmentSelect = screen.getByLabelText('Assigned employee');
    expect(within(assignmentSelect).getByRole('option', { name: 'Employee A' })).toHaveValue('employee-a');
    expect(within(assignmentSelect).queryByRole('option', { name: /admin|customer/i })).not.toBeInTheDocument();

    await user.selectOptions(assignmentSelect, 'employee-a');
    await user.click(screen.getByRole('button', { name: 'Save assignment' }));

    expect(mocks.updateBookingAdminFields).toHaveBeenCalledWith(
      'tenant-a',
      'booking-assignment',
      { assignedEmployeeAuthUid: 'employee-a' },
    );
    expect(JSON.stringify(mocks.updateBookingAdminFields.mock.calls[0][2])).not.toMatch(/payment|stripe|price|customer|schedule|date/i);
    expect(await screen.findByText('Employee assignment saved.')).toBeInTheDocument();
  });

  it('unassigns with null and does not expose assignment controls without admin access', async () => {
    const user = userEvent.setup();
    mocks.getActiveTenantEmployeeProfiles.mockResolvedValue({
      success: true,
      data: [{ uid: 'employee-a', displayName: 'Employee A' }],
    });
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'booking-unassign', customerName: 'Unassign Customer', date: '2026-07-20', status: 'scheduled', assignedEmployeeAuthUid: 'employee-a',
    }] });
    mocks.updateBookingAdminFields.mockResolvedValue({ success: true, data: { assignedEmployeeAuthUid: null } });

    const view = render(<BookingsList />);
    await user.click(await screen.findByRole('button', { name: 'View Details' }));
    await user.selectOptions(screen.getByLabelText('Assigned employee'), '');
    await user.click(screen.getByRole('button', { name: 'Save assignment' }));
    expect(mocks.updateBookingAdminFields).toHaveBeenCalledWith('tenant-a', 'booking-unassign', { assignedEmployeeAuthUid: null });

    view.unmount();
    mocks.adminAccess = false;
    render(<BookingsList />);
    await user.click(await screen.findByRole('button', { name: 'View Details' }));
    expect(screen.queryByLabelText('Assigned employee')).not.toBeInTheDocument();
  });

  it('does not show false assignment success when the save fails', async () => {
    const user = userEvent.setup();
    mocks.getActiveTenantEmployeeProfiles.mockResolvedValue({ success: true, data: [{ uid: 'employee-a', displayName: 'Employee A' }] });
    mocks.getJobs.mockResolvedValue({ success: true, data: [{ id: 'booking-fail', customerName: 'Failure Customer', date: '2026-07-20', status: 'scheduled' }] });
    mocks.updateBookingAdminFields.mockResolvedValue({ success: false, message: 'permission-denied' });

    render(<BookingsList />);
    await user.click(await screen.findByRole('button', { name: 'View Details' }));
    await user.selectOptions(screen.getByLabelText('Assigned employee'), 'employee-a');
    await user.click(screen.getByRole('button', { name: 'Save assignment' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Booking assignment could not be saved. Please try again.');
    expect(screen.queryByText('Employee assignment saved.')).not.toBeInTheDocument();
  });

  it('shows in-progress field completion details for owner review', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-field-progress',
        customerName: 'Field Progress Customer',
        date: '2026-07-02',
        startTime: '09:00',
        fieldStatus: 'in_progress',
        fieldStartedAt: '2026-07-02T14:00:00.000Z',
        fieldStatusUpdatedAt: '2026-07-02T14:05:00.000Z',
        fieldChecklist: [
          { id: 'kitchen', label: 'Kitchen', completed: true },
          { id: 'bathrooms', label: 'Bathrooms', completed: false },
        ],
        fieldNotes: 'Kitchen finished. Bathrooms in progress.',
        paymentStatus: 'final_due',
      }],
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Field Progress Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));

    const dialog = await screen.findByRole('dialog', { name: 'Field Progress Customer' });
    expect(dialog).toHaveTextContent('Field status');
    expect(dialog).toHaveTextContent('In progress');
    expect(dialog).toHaveTextContent('Started');
    expect(dialog).toHaveTextContent('Last field update');
    expect(dialog).toHaveTextContent('1 of 2 complete');
    expect(dialog).toHaveTextContent('Kitchen finished. Bathrooms in progress.');
    expect(dialog).toHaveTextContent('No issue flagged');
    expect(dialog).toHaveTextContent('Final due');
    expect(dialog).not.toHaveTextContent('Issue flagged by field worker');
  });

  it('shows read-only field completion details for owner review', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-field-complete',
        customerName: 'Field Complete Customer',
        date: '2026-07-02',
        startTime: '09:00',
        fieldStatus: 'completed',
        fieldStartedAt: '2026-07-02T14:00:00.000Z',
        fieldStatusUpdatedAt: '2026-07-02T16:30:00.000Z',
        completedAt: '2026-07-02T16:30:00.000Z',
        fieldChecklistSummary: { completed: 2, total: 3 },
        fieldNotes: 'Finished upstairs first.',
        fieldIssue: 'Back door lock sticks.',
        paymentStatus: 'not_paid',
      }],
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Field Complete Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));

    const dialog = await screen.findByRole('dialog', { name: 'Field Complete Customer' });
    expect(dialog).toHaveTextContent('Field completion');
    expect(dialog).toHaveTextContent('Completed');
    expect(dialog).toHaveTextContent('Started');
    expect(dialog).toHaveTextContent('Last field update');
    expect(dialog).toHaveTextContent('2 of 3 complete');
    expect(dialog).toHaveTextContent('Finished upstairs first.');
    expect(dialog).toHaveTextContent('Issue flagged by field worker');
    expect(dialog).toHaveTextContent('Back door lock sticks.');
    expect(dialog).toHaveTextContent('Field completion is worker-entered job progress. It does not change payment status.');
    expect(dialog).toHaveTextContent('Not paid');
    expect(screen.queryByRole('button', { name: 'Mark Complete' })).not.toBeInTheDocument();
  });

  it('shows tenant-scoped before and after evidence read-only without changing payment state', async () => {
    const user = userEvent.setup();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(blob => `blob:${blob.type}`) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    mocks.listFieldPhotos.mockResolvedValue([
      { id: 'before-1', phase: 'before', storagePath: 'safe/before-1.jpg', uploadedAt: new Date('2026-07-13T14:00:00Z') },
      { id: 'after-1', phase: 'after', storagePath: 'safe/after-1.jpg', uploadedAt: new Date('2026-07-13T16:00:00Z') },
    ]);
    mocks.loadFieldPhotoBlob.mockResolvedValue(new Blob(['photo'], { type: 'image/jpeg' }));
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'booking-photo-review',
      customerName: 'Photo Review Customer',
      paymentStatus: 'not_paid',
    }] });

    render(<BookingsList />);
    await screen.findByRole('heading', { name: 'Photo Review Customer' });
    await user.click(screen.getByRole('button', { name: 'View Details' }));

    const dialog = await screen.findByRole('dialog', { name: 'Photo Review Customer' });
    expect(await within(dialog).findByAltText('before job evidence')).toBeInTheDocument();
    expect(within(dialog).getByAltText('after job evidence')).toBeInTheDocument();
    expect(within(dialog).getByText('Field photos')).toBeInTheDocument();
    expect(within(dialog).getByText('Not paid')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Add .* photo/)).not.toBeInTheDocument();
    expect(mocks.listFieldPhotos).toHaveBeenCalledWith('tenant-a', 'booking-photo-review');
    expect(mocks.updateBookingManualPaymentStatus).not.toHaveBeenCalled();
  });

  it('cancels a scheduled booking without changing payment history', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-cancel-safe',
        customerName: 'Cancel Safe Customer',
        status: 'scheduled',
        paymentStatus: 'deposit_paid',
        paymentMethod: 'cash',
        amountReceived: 50,
        agreedPrice: 200,
      }],
    });
    mocks.updateBookingAdminFields.mockResolvedValue({
      success: true,
      data: {
        id: 'booking-cancel-safe',
        status: 'cancelled',
        updatedAt: '2026-07-20T12:00:00.000Z',
      },
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Cancel Safe Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancel Safe Customer' });
    expect(dialog).toHaveTextContent('Deposit paid');
    expect(dialog).toHaveTextContent('$50.00');

    await user.click(screen.getByRole('button', { name: 'Cancel Booking' }));
    expect(await screen.findByText('Cancel this booking?')).toBeInTheDocument();
    expect(screen.getByText(/Payment history and notes will be preserved./)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Cancel Booking' })[1]);

    await waitFor(() => {
      expect(mocks.updateBookingAdminFields).toHaveBeenCalledWith(
        'tenant-a',
        'booking-cancel-safe',
        { status: 'cancelled' }
      );
    });
    expect(mocks.updateBookingAdminFields.mock.calls[0][2]).not.toMatchObject({
      paymentStatus: expect.anything(),
      paymentMethod: expect.anything(),
      amountReceived: expect.anything(),
      stripePaymentIntentId: expect.anything(),
    });
    expect(await screen.findByText('Booking cancelled. Payment history was preserved.')).toBeInTheDocument();
  });

  it('does not show cancel controls for completed bookings', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-completed-no-cancel',
        customerName: 'Completed No Cancel Customer',
        status: 'completed',
        paymentStatus: 'not_paid',
      }],
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Completed No Cancel Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));

    expect(await screen.findByRole('dialog', { name: 'Completed No Cancel Customer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel Booking' })).not.toBeInTheDocument();
  });

  it('renders customer messages and copies estimate, booking confirmation, follow-up, and review text', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-customer-messages',
        customerName: 'Message Customer',
        date: '2026-07-02',
        startTime: '09:00',
        agreedPrice: 185,
        paymentStatus: 'not_paid',
      }],
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Message Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));

    const dialog = await screen.findByRole('dialog', { name: 'Message Customer' });
    expect(dialog).toHaveTextContent('Customer messages');
    expect(dialog).toHaveTextContent('Copy-ready customer wording only.');
    expect(dialog).toHaveTextContent('Create a payment link first, then you can copy a customer message.');
    expect(screen.queryByRole('button', { name: 'Copy payment message' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copy estimate message' }));
    expect(writeText).toHaveBeenLastCalledWith(
      'Hi Message Customer, your cleaning estimate is ready. The estimated total is $185.00. Please let us know if you have any questions or would like to schedule.'
    );
    expect(await screen.findByText('Message copied.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copy booking confirmation' }));
    expect(writeText).toHaveBeenLastCalledWith(
      'Hi Message Customer, your cleaning is confirmed for Jul 2, 2026 at 09:00. We look forward to helping you.'
    );

    await user.click(screen.getByRole('button', { name: 'Copy follow-up' }));
    expect(writeText).toHaveBeenLastCalledWith(
      'Hi Message Customer, I wanted to follow up on your cleaning estimate. Let us know if you would like to schedule or have any questions.'
    );

    await user.click(screen.getByRole('button', { name: 'Copy review request' }));
    expect(writeText).toHaveBeenLastCalledWith(
      'Hi Message Customer, thank you for choosing us for your cleaning. If you were happy with the service, we would really appreciate a review.'
    );
    expect(mocks.updateBookingManualPaymentStatus).not.toHaveBeenCalled();
    expect(mocks.updateBookingAdminFields).not.toHaveBeenCalled();
  });

  it('copies fallback customer messages when name, amount, and schedule are missing', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{ id: 'booking-message-fallback' }],
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Unknown customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));

    await user.click(screen.getByRole('button', { name: 'Copy estimate message' }));
    expect(writeText).toHaveBeenLastCalledWith(
      'Hi, your cleaning estimate is ready. Please let us know if you have any questions or would like to schedule.'
    );

    await user.click(screen.getByRole('button', { name: 'Copy booking confirmation' }));
    expect(writeText).toHaveBeenLastCalledWith(
      'Hi, your cleaning is confirmed. We look forward to helping you.'
    );
  });

  it('creates a booking-scoped Stripe payment link and does not mark the booking paid in frontend', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-stripe-link',
        customerName: 'Stripe Link Customer',
        paymentStatus: 'final_due',
        agreedPrice: 205,
      }],
    });
    mocks.createBookingCheckoutSession.mockResolvedValue({
      sessionId: 'cs_test_booking',
      url: 'https://checkout.stripe.test/pay/cs_test_booking',
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Stripe Link Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    await user.click(screen.getByRole('button', { name: 'Create Stripe payment link' }));

    expect(mocks.createBookingCheckoutSession).toHaveBeenCalledWith('tenant-a', 'booking-stripe-link');
    expect(await screen.findByText('Payment link created. This booking will be marked paid after Stripe confirms payment.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://checkout.stripe.test/pay/cs_test_booking')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open payment link' })).toHaveAttribute('href', 'https://checkout.stripe.test/pay/cs_test_booking');
    expect(screen.getByRole('button', { name: 'Copy payment link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy payment message' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy payment message' }));
    expect(writeText).toHaveBeenCalledWith(
      'Hi Stripe Link Customer, here is your payment link for your upcoming cleaning: https://checkout.stripe.test/pay/cs_test_booking'
    );
    expect(await screen.findByText('Message copied.')).toBeInTheDocument();
    expect(screen.queryByText('Paid in full')).not.toBeInTheDocument();
    expect(mocks.updateBookingManualPaymentStatus).not.toHaveBeenCalled();
  });

  it('copies a created Stripe payment link when clipboard is available', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-stripe-copy',
        customerName: 'Stripe Copy Customer',
        paymentStatus: 'final_due',
        agreedPrice: 205,
      }],
    });
    mocks.createBookingCheckoutSession.mockResolvedValue({
      sessionId: 'cs_test_copy',
      url: 'https://checkout.stripe.test/pay/cs_test_copy',
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Stripe Copy Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    await user.click(screen.getByRole('button', { name: 'Create Stripe payment link' }));
    await user.click(await screen.findByRole('button', { name: 'Copy payment link' }));

    expect(writeText).toHaveBeenCalledWith('https://checkout.stripe.test/pay/cs_test_copy');
    expect(await screen.findByText('Payment link copied.')).toBeInTheDocument();
  });

  it('handles clipboard failure without claiming copy success', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValueOnce(new Error('blocked'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-stripe-copy-fail',
        customerName: 'Stripe Copy Fail Customer',
        paymentStatus: 'final_due',
        agreedPrice: 205,
      }],
    });
    mocks.createBookingCheckoutSession.mockResolvedValue({
      sessionId: 'cs_test_copy_fail',
      url: 'https://checkout.stripe.test/pay/cs_test_copy_fail',
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Stripe Copy Fail Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    await user.click(screen.getByRole('button', { name: 'Create Stripe payment link' }));
    await user.click(await screen.findByRole('button', { name: 'Copy payment link' }));

    expect(await screen.findByText('Payment link could not be copied automatically. You can copy it from the field above.')).toBeInTheDocument();
    expect(screen.queryByText('Payment link copied.')).not.toBeInTheDocument();
  });

  it('shows an honest Stripe payment link error without exposing backend details', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-stripe-error',
        customerName: 'Stripe Error Customer',
        paymentStatus: 'final_due',
        agreedPrice: 205,
      }],
    });
    mocks.createBookingCheckoutSession.mockRejectedValue(new Error('sk_test_secret backend failure'));

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Stripe Error Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    await user.click(screen.getByRole('button', { name: 'Create Stripe payment link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Stripe payment link could not be created. You can still mark this booking paid another way.');
    expect(screen.queryByText(/sk_test_secret/)).not.toBeInTheDocument();
    expect(screen.queryByText(/backend failure/)).not.toBeInTheDocument();
  });

  it('renders known manual payment status labels and falls back for unknown values', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'booking-deposit-requested',
          customerName: 'Deposit Requested Customer',
          paymentStatus: 'deposit_requested',
        },
        {
          id: 'booking-unknown-payment-status',
          customerName: 'Unknown Payment Customer',
          paymentStatus: 'stripe_paid',
        },
      ],
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Deposit Requested Customer' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'View Details' })[0]);
    let dialog = await screen.findByRole('dialog', { name: 'Deposit Requested Customer' });
    expect(dialog).toHaveTextContent('Payment status');
    expect(dialog).toHaveTextContent('Deposit requested');
    expect(screen.queryByLabelText(/payment status/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close booking details' }));
    await user.click(screen.getAllByRole('button', { name: 'View Details' })[1]);
    dialog = await screen.findByRole('dialog', { name: 'Unknown Payment Customer' });
    expect(dialog).toHaveTextContent('Payment status');
    expect(dialog).toHaveTextContent('Payment status not set');
  });

  it('opens manual payment details edit UI with only allowed payment status and method options', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-payment-edit',
        customerName: 'Payment Edit Customer',
        paymentStatus: 'deposit_requested',
      }],
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Payment Edit Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    await user.click(screen.getByRole('button', { name: 'Edit Payment Details' }));

    const form = screen.getByRole('form', { name: 'Edit booking payment details' });
    expect(form).toBeInTheDocument();
    const paymentSelect = within(form).getByLabelText('Payment status');
    expect(paymentSelect).toHaveValue('deposit_requested');
    [
      'Not paid',
      'Deposit requested',
      'Deposit paid',
      'Final due',
      'Partial',
      'Paid in full',
      'Paid cash',
      'Paid check',
      'Paid external app',
      'Waived / family discount',
      'Payment issue',
    ].forEach(label => {
      expect(within(form).getByRole('option', { name: label })).toBeInTheDocument();
    });
    [
      'Cash',
      'Check',
      'Venmo',
      'Cash App',
      'Zelle',
      'Facebook Pay',
      'PayPal',
      'Card',
      'Stripe manual reference',
      'Waived',
      'Other',
    ].forEach(label => {
      expect(within(form).getByRole('option', { name: label })).toBeInTheDocument();
    });

    expect(within(form).queryByLabelText('Date')).not.toBeInTheDocument();
    expect(within(form).queryByLabelText('Start time')).not.toBeInTheDocument();
    expect(within(form).queryByLabelText('Notes')).not.toBeInTheDocument();
    expect(within(form).queryByLabelText(/price/i)).not.toBeInTheDocument();
    expect(within(form).queryByLabelText(/^status$/i)).not.toBeInTheDocument();
    ['Pay', 'Refund', 'Stripe checkout', 'Create payment link', 'Invoice', 'Collect payment'].forEach(name => {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    });
  });

  it('saves manual payment details through updateBookingManualPaymentStatus then reloads bookings', async () => {
    const user = userEvent.setup();
    mocks.getJobs
      .mockResolvedValueOnce({
        success: true,
        data: [{
          id: 'booking-payment-save',
          customerName: 'Payment Save Customer',
          paymentStatus: 'not_paid',
          agreedPrice: 245,
        }],
      })
      .mockResolvedValueOnce({
        success: true,
        data: [{
          id: 'booking-payment-save',
          customerName: 'Payment Save Customer',
          paymentStatus: 'paid_cash',
          paymentMethod: 'cash',
          amountReceived: 200,
          receivedAt: '2026-07-07',
          paymentNote: 'Paid at walkthrough',
          agreedPrice: 245,
        }],
      });
    mocks.updateBookingManualPaymentStatus.mockResolvedValue({
      success: true,
      data: {
        id: 'booking-payment-save',
        paymentStatus: 'paid_cash',
        paymentMethod: 'cash',
        amountReceived: 200,
        receivedAt: '2026-07-07',
        paymentNote: 'Paid at walkthrough',
        paymentStatusUpdatedAt: '2026-06-30T12:00:00.000Z',
      },
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Payment Save Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    await user.click(screen.getByRole('button', { name: 'Edit Payment Details' }));
    await user.selectOptions(screen.getByLabelText('Payment status'), 'paid_cash');
    await user.selectOptions(screen.getByLabelText('Payment method'), 'cash');
    await user.clear(screen.getByLabelText('Amount received'));
    await user.type(screen.getByLabelText('Amount received'), '200');
    await user.clear(screen.getByLabelText('Received date'));
    await user.type(screen.getByLabelText('Received date'), '2026-07-07');
    await user.type(screen.getByLabelText('Payment note'), '  Paid at walkthrough  ');
    await user.click(screen.getByRole('button', { name: 'Save payment details' }));

    await waitFor(() => {
      expect(mocks.updateBookingManualPaymentStatus).toHaveBeenCalledWith(
        'tenant-a',
        'booking-payment-save',
        {
          paymentStatus: 'paid_cash',
          paymentMethod: 'cash',
          amountReceived: 200,
          receivedAt: '2026-07-07',
          paymentNote: 'Paid at walkthrough',
        }
      );
    });
    expect(JSON.stringify(mocks.updateBookingManualPaymentStatus.mock.calls[0][2])).not.toMatch(/deposit|balance|tip|fee|stripe|refund|paymentLink|invoice|lead|customer/i);
    await waitFor(() => expect(mocks.getJobs).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('status')).toHaveTextContent('Booking payment details updated.');
    expect(screen.queryByRole('form', { name: 'Edit booking payment details' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Paid cash').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$200.00').length).toBeGreaterThan(0);
    expect(screen.getByText('$45.00')).toBeInTheDocument();
  });

  it('sends blank optional payment details when admin clears existing values', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-payment-clear',
        customerName: 'Payment Clear Customer',
        paymentStatus: 'partial',
        paymentMethod: 'cash',
        amountReceived: 75,
        receivedAt: '2026-07-07',
        paymentNote: 'Deposit taken',
        agreedPrice: 245,
      }],
    });
    mocks.updateBookingManualPaymentStatus.mockResolvedValue({
      success: true,
      data: {
        id: 'booking-payment-clear',
        paymentStatus: 'payment_issue',
      },
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Payment Clear Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    await user.click(screen.getByRole('button', { name: 'Edit Payment Details' }));
    await user.selectOptions(screen.getByLabelText('Payment status'), 'payment_issue');
    await user.selectOptions(screen.getByLabelText('Payment method'), '');
    await user.clear(screen.getByLabelText('Amount received'));
    await user.clear(screen.getByLabelText('Received date'));
    await user.clear(screen.getByLabelText('Payment note'));
    await user.click(screen.getByRole('button', { name: 'Save payment details' }));

    await waitFor(() => {
      expect(mocks.updateBookingManualPaymentStatus).toHaveBeenCalledWith(
        'tenant-a',
        'booking-payment-clear',
        {
          paymentStatus: 'payment_issue',
          paymentMethod: '',
          amountReceived: '',
          receivedAt: '',
          paymentNote: '',
        }
      );
    });
  });

  it('shows amount received and owed as unavailable when job price is missing', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-payment-no-price',
        customerName: 'No Price Payment Customer',
        paymentStatus: 'partial',
        paymentMethod: 'venmo',
        amountReceived: 50,
        receivedAt: '2026-07-07',
      }],
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'No Price Payment Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));

    const dialog = await screen.findByRole('dialog', { name: 'No Price Payment Customer' });
    expect(dialog).toHaveTextContent('Amount received');
    expect(dialog).toHaveTextContent('$50.00');
    expect(dialog).toHaveTextContent('Still owed');
    expect(dialog).toHaveTextContent('Unavailable');
    expect(dialog).toHaveTextContent('Venmo (manual/outside ServicesOS)');
  });

  it('displays Stripe-confirmed payment method without exposing Stripe as a manual method option', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-stripe-confirmed',
        customerName: 'Stripe Confirmed Customer',
        paymentStatus: 'paid_in_full',
        paymentMethod: 'stripe',
        amountReceived: 190,
        agreedPrice: 190,
      }],
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Stripe Confirmed Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));

    const dialog = await screen.findByRole('dialog', { name: 'Stripe Confirmed Customer' });
    expect(dialog).toHaveTextContent('Stripe (confirmed by Stripe)');

    await user.click(screen.getByRole('button', { name: 'Edit Payment Details' }));
    const methodOptions = Array.from(screen.getByLabelText('Payment method').querySelectorAll('option')).map(option => option.value);
    expect(methodOptions).not.toContain('stripe');
  });

  it('defaults amount received and received date when a paid status is selected', async () => {
    const user = userEvent.setup();
    const today = new Date();
    const todayInput = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-payment-defaults',
        customerName: 'Payment Defaults Customer',
        paymentStatus: 'not_paid',
        agreedPrice: 245,
      }],
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Payment Defaults Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    await user.click(screen.getByRole('button', { name: 'Edit Payment Details' }));
    await user.selectOptions(screen.getByLabelText('Payment status'), 'paid_in_full');

    expect(screen.getByLabelText('Amount received')).toHaveValue(245);
    expect(screen.getByLabelText('Received date')).toHaveValue(todayInput);
  });

  it('blocks negative amount received before calling updateBookingManualPaymentStatus', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-payment-negative',
        customerName: 'Negative Payment Customer',
        paymentStatus: 'not_paid',
      }],
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Negative Payment Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    await user.click(screen.getByRole('button', { name: 'Edit Payment Details' }));
    fireEvent.change(screen.getByLabelText('Amount received'), { target: { value: '-1' } });
    await user.click(screen.getByRole('button', { name: 'Save payment details' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Amount received must be a non-negative number.');
    expect(mocks.updateBookingManualPaymentStatus).not.toHaveBeenCalled();
  });

  it('keeps payment status edit mode open and displays update failures', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-payment-fail',
        customerName: 'Payment Failure Customer',
        paymentStatus: 'not_paid',
      }],
    });
    mocks.updateBookingManualPaymentStatus.mockResolvedValue({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Booking manual payment status is not allowed.',
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Payment Failure Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    await user.click(screen.getByRole('button', { name: 'Edit Payment Details' }));
    await user.click(screen.getByRole('button', { name: 'Save payment details' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Booking manual payment status is not allowed.');
    expect(screen.getByRole('form', { name: 'Edit booking payment details' })).toBeInTheDocument();
    expect(screen.queryByText('Booking payment details updated.')).not.toBeInTheDocument();
    expect(mocks.getJobs).toHaveBeenCalledTimes(1);
  });

  it('cancels payment status edit mode without calling updateBookingManualPaymentStatus', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-payment-cancel',
        customerName: 'Payment Cancel Customer',
        paymentStatus: 'not_paid',
      }],
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Payment Cancel Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    await user.click(screen.getByRole('button', { name: 'Edit Payment Details' }));
    await user.selectOptions(screen.getByLabelText('Payment status'), 'paid_cash');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mocks.updateBookingManualPaymentStatus).not.toHaveBeenCalled();
    expect(screen.queryByRole('form', { name: 'Edit booking payment details' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Not paid').length).toBeGreaterThan(0);
  });

  it('opens limited date, start time, and notes edit UI from booking details', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-editable',
        customerName: 'Editable Customer',
        date: '2026-07-02',
        startTime: '09:00',
        endTime: '11:00',
        notes: 'Original notes',
      }],
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Editable Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    await user.click(screen.getByRole('button', { name: 'Edit Date & Notes' }));

    const form = screen.getByRole('form', { name: 'Edit booking date and notes' });
    expect(form).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toHaveValue('2026-07-02');
    expect(screen.getByLabelText('Start time')).toHaveValue('09:00');
    expect(screen.getByLabelText('Notes')).toHaveValue('Original notes');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    expect(screen.queryByLabelText(/price/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/payment/i)).not.toBeInTheDocument();
    ['Payment', 'Pay', 'Delete', 'Assign', 'Refund', 'Reschedule', 'Cancel booking', 'Collect payment', 'Create payment link', 'Stripe checkout', 'Invoice'].forEach(name => {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    });
  });

  it('saves date, computed end time, and trimmed notes through updateBookingAdminFields then reloads bookings', async () => {
    const user = userEvent.setup();
    mocks.getJobs
      .mockResolvedValueOnce({
        success: true,
        data: [{
          id: 'booking-editable',
          customerName: 'Editable Customer',
          date: '2026-07-02',
          startTime: '09:00',
          endTime: '11:00',
          notes: 'Original notes',
        }],
      })
      .mockResolvedValueOnce({
        success: true,
        data: [{
          id: 'booking-editable',
          customerName: 'Editable Customer',
          date: '2026-07-05',
          startTime: '10:30',
          endTime: '12:30',
          notes: 'Updated owner note',
        }],
      });
    mocks.updateBookingAdminFields.mockResolvedValue({
      success: true,
      data: {
        id: 'booking-editable',
        date: '2026-07-05',
        startTime: '10:30',
        endTime: '12:30',
        notes: 'Updated owner note',
      },
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Editable Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    await user.click(screen.getByRole('button', { name: 'Edit Date & Notes' }));
    await user.clear(screen.getByLabelText('Date'));
    await user.type(screen.getByLabelText('Date'), '2026-07-05');
    await user.clear(screen.getByLabelText('Start time'));
    await user.type(screen.getByLabelText('Start time'), '10:30');
    await user.clear(screen.getByLabelText('Notes'));
    await user.type(screen.getByLabelText('Notes'), '  Updated owner note  ');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mocks.updateBookingAdminFields).toHaveBeenCalledWith('tenant-a', 'booking-editable', {
        date: '2026-07-05',
        startTime: '10:30',
        endTime: '12:30',
        notes: 'Updated owner note',
      });
    });
    expect(mocks.updateBookingAdminFields.mock.calls[0][2]).not.toMatchObject({
      agreedPrice: expect.anything(),
      status: expect.anything(),
      customerName: expect.anything(),
      customerSnapshot: expect.anything(),
      leadId: expect.anything(),
      sourceLeadId: expect.anything(),
      tenantId: expect.anything(),
    });
    await waitFor(() => expect(mocks.getJobs).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('status')).toHaveTextContent('Booking date and notes updated.');
    expect(screen.queryByRole('form', { name: 'Edit booking date and notes' })).not.toBeInTheDocument();
  });

  it('uses a conservative two-hour end time when existing duration cannot be determined', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-default-duration',
        customerName: 'Default Duration Customer',
        date: '2026-07-02',
        startTime: '09:00',
      }],
    });
    mocks.updateBookingAdminFields.mockResolvedValue({
      success: true,
      data: { id: 'booking-default-duration', date: '2026-07-03', startTime: '08:15', endTime: '10:15', notes: '' },
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Default Duration Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    await user.click(screen.getByRole('button', { name: 'Edit Date & Notes' }));
    await user.clear(screen.getByLabelText('Date'));
    await user.type(screen.getByLabelText('Date'), '2026-07-03');
    await user.clear(screen.getByLabelText('Start time'));
    await user.type(screen.getByLabelText('Start time'), '08:15');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mocks.updateBookingAdminFields).toHaveBeenCalledWith('tenant-a', 'booking-default-duration', {
        date: '2026-07-03',
        startTime: '08:15',
        endTime: '10:15',
        notes: '',
      });
    });
  });

  it('keeps edit mode open and displays validation errors without reloading as success', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-invalid',
        customerName: 'Invalid Edit Customer',
        date: '2026-07-02',
        startTime: '09:00',
        endTime: '11:00',
      }],
    });
    mocks.updateBookingAdminFields.mockResolvedValue({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Booking date and startTime must produce a valid scheduledAt value.',
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Invalid Edit Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    await user.click(screen.getByRole('button', { name: 'Edit Date & Notes' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Booking date and startTime must produce a valid scheduledAt value.');
    expect(screen.getByRole('form', { name: 'Edit booking date and notes' })).toBeInTheDocument();
    expect(screen.queryByText('Booking date and notes updated.')).not.toBeInTheDocument();
    expect(mocks.getJobs).toHaveBeenCalledTimes(1);
  });

  it('keeps edit mode open and displays update failures without reloading as success', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-update-fail',
        customerName: 'Update Failure Customer',
        date: '2026-07-02',
        startTime: '09:00',
        endTime: '11:00',
      }],
    });
    mocks.updateBookingAdminFields.mockResolvedValue({
      success: false,
      error: 'FIRESTORE_ERROR',
      message: 'Failed to update booking admin fields',
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Update Failure Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    await user.click(screen.getByRole('button', { name: 'Edit Date & Notes' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to update booking admin fields');
    expect(screen.getByRole('form', { name: 'Edit booking date and notes' })).toBeInTheDocument();
    expect(screen.queryByText('Booking date and notes updated.')).not.toBeInTheDocument();
    expect(mocks.getJobs).toHaveBeenCalledTimes(1);
  });

  it('cancels limited edit mode without calling updateBookingAdminFields', async () => {
    const user = userEvent.setup();
    mocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'booking-cancel-edit',
        customerName: 'Cancel Edit Customer',
        date: '2026-07-02',
        startTime: '09:00',
        notes: 'Keep this note',
      }],
    });

    render(<BookingsList />);

    expect(await screen.findByRole('heading', { name: 'Cancel Edit Customer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Details' }));
    await user.click(screen.getByRole('button', { name: 'Edit Date & Notes' }));
    await user.clear(screen.getByLabelText('Notes'));
    await user.type(screen.getByLabelText('Notes'), 'Unsaved note');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mocks.updateBookingAdminFields).not.toHaveBeenCalled();
    expect(screen.queryByRole('form', { name: 'Edit booking date and notes' })).not.toBeInTheDocument();
    expect(screen.getByText('Keep this note')).toBeInTheDocument();
  });

  it('clears Tenant A bookings and ignores its late response after switching to Tenant B', async () => {
    let resolveTenantA;
    mocks.getJobs.mockImplementation(tenantId => {
      if (tenantId === 'tenant-a') {
        return new Promise(resolve => { resolveTenantA = resolve; });
      }
      return Promise.resolve({
        success: true,
        data: [{ id: 'booking-b', customerName: 'Tenant B Customer', date: '2026-07-20' }],
      });
    });

    const { rerender } = render(<BookingsList />);
    await waitFor(() => expect(mocks.getJobs).toHaveBeenCalledWith('tenant-a'));

    mocks.tenantId = 'tenant-b';
    rerender(<BookingsList />);
    expect(await screen.findByRole('heading', { name: 'Tenant B Customer' })).toBeInTheDocument();

    await act(async () => {
      resolveTenantA({
        success: true,
        data: [{ id: 'booking-a', customerName: 'Tenant A Customer', date: '2026-07-20' }],
      });
    });

    expect(screen.queryByRole('heading', { name: 'Tenant A Customer' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tenant B Customer' })).toBeInTheDocument();
  });

  it('closes Tenant A booking actions and field-photo review when the tenant changes', async () => {
    mocks.getJobs.mockImplementation(async tenantId => ({
      success: true,
      data: [{
        id: tenantId === 'tenant-a' ? 'booking-a' : 'booking-b',
        customerName: tenantId === 'tenant-a' ? 'Tenant A Selected Customer' : 'Tenant B Replacement Customer',
        date: '2026-07-20',
      }],
    }));

    const { rerender } = render(<BookingsList />);
    expect(await screen.findByRole('heading', { name: 'Tenant A Selected Customer' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View Details' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(mocks.listFieldPhotos).toHaveBeenCalledWith('tenant-a', 'booking-a');

    mocks.tenantId = 'tenant-b';
    rerender(<BookingsList />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Payment Details' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Stripe payment link' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Tenant B Replacement Customer' })).toBeInTheDocument();
  });
});
