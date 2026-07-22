import { act, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FieldMode from '../components/FieldMode';
import { assembleBookingChecklist } from '../core/checklists/bookingChecklistAssembly';

const mocks = vi.hoisted(() => ({
  getJobs: vi.fn(),
  updateBookingFieldExecution: vi.fn(),
  listFieldPhotos: vi.fn(),
  loadFieldPhotoBlob: vi.fn(),
  uploadFieldPhoto: vi.fn(),
  validateFieldPhoto: vi.fn(),
  getEmployeeUsableCleaningRecordsByIds: vi.fn(),
  tenantId: 'tenant-a',
  user: { uid: 'field-user-1' },
  role: 'admin',
}));

vi.mock('../core/scheduling/schedulingService', () => ({
  BOOKING_FIELD_STATUS_LABELS: {
    not_started: 'Scheduled / not started',
    in_progress: 'In progress',
    completed: 'Completed',
  },
  BOOKING_MANUAL_PAYMENT_STATUS_LABELS: { not_paid: 'Not paid', paid_cash: 'Paid cash' },
  getJobs: mocks.getJobs,
  getAssignedFieldJobs: (...args) => mocks.getJobs(...args),
  bookingMatchesEmployeeFieldVisibility: (booking, employeeAuthUid) => (
    booking?.assignedEmployeeAuthUid === employeeAuthUid &&
    ['scheduled', 'completed'].includes(booking?.status) &&
    booking?.isDeleted !== true &&
    booking?.isArchived !== true
  ),
  updateBookingFieldExecution: mocks.updateBookingFieldExecution,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    isEmployee: () => mocks.role === 'employee',
    isSuperAdmin: () => mocks.role === 'super-admin',
    tenantId: mocks.tenantId,
    user: mocks.user,
    userProfile: {
      uid: mocks.user?.uid,
      role: mocks.role,
      status: 'active',
      tenantId: mocks.tenantId,
    },
  }),
}));

vi.mock('../services/fieldPhotoService', () => ({
  FIELD_PHOTO_PHASES: ['before', 'after'],
  listFieldPhotos: mocks.listFieldPhotos,
  loadFieldPhotoBlob: mocks.loadFieldPhotoBlob,
  uploadFieldPhoto: mocks.uploadFieldPhoto,
  validateFieldPhoto: mocks.validateFieldPhoto,
}));

vi.mock('../modules/cleaning/products/cleaningProductService', () => ({
  getEmployeeUsableCleaningRecordsByIds: mocks.getEmployeeUsableCleaningRecordsByIds,
}));

const pad = value => String(value).padStart(2, '0');
const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const today = new Date();
const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
const approvedChecklist = {
  jobChecklistSnapshot: {
    ownerApproved: true,
    provenance: { sourceScopeSignature: assembleBookingChecklist({}).sourceScopeSignature },
    notes: 'Pack clean microfiber cloths.',
    warnings: ['Surface/material note: sealed wood island.'],
    items: [
      {
        id: 'walkthrough', area: 'Property Arrival / Review', fixtureOrSurface: 'Review',
        label: 'Review job scope before starting', completionCriteria: 'Scope and access details have been reviewed.',
        jobAidSteps: [{ label: 'Walk through the home before starting', condition: '', note: '' }],
        required: true, completed: false,
      },
      { id: 'service-areas', area: 'Service Areas', label: 'Complete the requested cleaning areas', jobAidSteps: [], required: true, completed: false },
      { id: 'final-check', area: 'Final Walkthrough', label: 'Do a final quality check before leaving', required: true, completed: false },
      { id: 'clean-towel', area: 'Kitchen', label: 'Place a clean towel by the island', condition: 'if requested', required: false, completed: false },
    ],
  },
};

const approvedShowerMethod = {
  id: 'adopted-ab-dawn-vinegar-shower-cleaner',
  recordType: 'company_mix',
  scope: 'tenant',
  tenantId: 'tenant-a',
  name: 'Dawn and Vinegar Shower Cleaner',
  classification: 'cleaning',
  status: 'approved',
  employeeVisible: true,
  formulaVariants: [{
    id: 'standard',
    name: 'Standard',
    measurements: ['2 cups distilled white vinegar', '1 cup warm water', '2 tablespoons Dawn'],
    expectedYield: 'Approximately 25 oz',
  }],
  measurements: [],
  intendedUses: ['Soap scum'],
  compatibleSurfaces: ['Owner-approved acid-safe shower surfaces'],
  prohibitedSurfaces: ['Natural stone'],
  requiredPPE: ['Gloves'],
  requiredTools: ['Non-scratch cleaning cloth'],
  dwellTime: '5–10 minutes',
  applicationInstructions: 'Apply only to an approved surface.',
  rinseInstructions: 'Rinse thoroughly.',
  dryingInstructions: 'Dry after rinsing.',
  mixingOrder: ['Add warm water.', 'Add vinegar.', 'Add Dawn slowly.'],
  dangerousCombinations: ['Never mix with bleach.'],
};

describe('FieldMode read-only field surface', () => {
  beforeEach(() => {
    mocks.tenantId = 'tenant-a';
    mocks.user = { uid: 'field-user-1' };
    mocks.role = 'admin';
    mocks.getJobs.mockReset();
    mocks.updateBookingFieldExecution.mockReset();
    mocks.listFieldPhotos.mockReset();
    mocks.loadFieldPhotoBlob.mockReset();
    mocks.uploadFieldPhoto.mockReset();
    mocks.validateFieldPhoto.mockReset();
    mocks.getEmployeeUsableCleaningRecordsByIds.mockReset();
    mocks.getEmployeeUsableCleaningRecordsByIds.mockResolvedValue([]);
    mocks.listFieldPhotos.mockResolvedValue([]);
    mocks.validateFieldPhoto.mockReturnValue({ success: true });
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

  it('hides payment and private owner notes while showing approved instructions to an employee', async () => {
    mocks.role = 'employee';
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'employee-job',
      assignedEmployeeAuthUid: 'field-user-1',
      status: 'scheduled',
      customerName: 'Employee Field Customer',
      address: '100 Field Lane',
      date: dateKey(today),
      paymentStatus: 'not_paid',
      agreedPrice: 225,
      notes: 'Owner administration note.',
      internalNotes: 'Private owner safety review.',
      requestSnapshot: {
        accessInstructions: 'Use the side gate and lock it when leaving.',
        specialRequests: 'Use unscented products.',
      },
    }] });

    render(<FieldMode />);
    await screen.findByText('Employee Field Customer');

    expect(screen.queryByText('Not paid')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));

    const dialog = screen.getByRole('dialog', { name: 'Employee Field Customer' });
    expect(dialog).toHaveTextContent('Use the side gate and lock it when leaving.');
    expect(dialog).not.toHaveTextContent('Private owner safety review.');
    expect(dialog).not.toHaveTextContent('Owner administration note.');
    expect(dialog).not.toHaveTextContent('Not paid');
    expect(dialog).not.toHaveTextContent('$225');
    for (const name of ['Edit Payment Details', 'Create Stripe payment link', 'Delete', 'Archive', 'Reschedule', 'Edit customer']) {
      expect(within(dialog).queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('shows employees only active jobs assigned by canonical Auth UID', async () => {
    mocks.role = 'employee';
    mocks.getJobs.mockResolvedValue({ success: true, data: [
      { id: 'assigned', customerName: 'Assigned Customer', date: dateKey(today), status: 'scheduled', assignedEmployeeAuthUid: 'field-user-1' },
      { id: 'unassigned', customerName: 'Unassigned Customer', date: dateKey(today), status: 'scheduled' },
      { id: 'cancelled', customerName: 'Cancelled Customer', date: dateKey(tomorrow), status: 'cancelled', assignedEmployeeAuthUid: 'field-user-1' },
      { id: 'other', customerName: 'Other Employee Customer', date: dateKey(today), status: 'scheduled', assignedEmployeeAuthUid: 'field-user-2' },
      { id: 'legacy', customerName: 'Legacy Assignment Customer', date: dateKey(today), status: 'scheduled', assignedEmployeeId: 'field-user-1' },
    ] });

    render(<FieldMode />);

    expect(await screen.findByText('Assigned Customer')).toBeInTheDocument();
    expect(mocks.getJobs).toHaveBeenCalledWith('tenant-a', 'field-user-1');
    expect(screen.queryByText('Unassigned Customer')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancelled Customer')).not.toBeInTheDocument();
    expect(screen.queryByText('Other Employee Customer')).not.toBeInTheDocument();
    expect(screen.queryByText('Legacy Assignment Customer')).not.toBeInTheDocument();
  });

  it('shows the shared photo upload controls to a tenant admin without assigning the booking', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'owner-job', customerName: 'Owner Operator Customer', date: dateKey(today), status: 'scheduled',
    }] });

    render(<FieldMode />);
    await screen.findByText('Owner Operator Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));

    expect(await screen.findByLabelText('Add before photo')).toBeInTheDocument();
    expect(screen.getByLabelText('Add after photo')).toBeInTheDocument();
    expect(mocks.getJobs).toHaveBeenCalledWith('tenant-a');
    expect(mocks.getJobs.mock.calls[0]).not.toContain('field-user-1');
  });

  it('keeps assigned employee photo controls and hides them from a direct customer render', async () => {
    mocks.role = 'employee';
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'employee-photo-job', customerName: 'Assigned Photo Customer', date: dateKey(today),
      status: 'scheduled', assignedEmployeeAuthUid: 'field-user-1',
    }] });
    const { unmount } = render(<FieldMode />);
    await screen.findByText('Assigned Photo Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));
    expect(await screen.findByLabelText('Add before photo')).toBeInTheDocument();
    unmount();

    mocks.role = 'customer';
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'customer-direct-job', customerName: 'Denied Customer', date: dateKey(today), status: 'scheduled',
    }] });
    render(<FieldMode />);
    await screen.findByText('Denied Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));
    expect(screen.queryByLabelText('Add before photo')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add after photo')).not.toBeInTheDocument();
  });

  it('shows photo controls to a super-admin only with an explicit selected tenant', async () => {
    mocks.role = 'super-admin';
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'super-job', customerName: 'Selected Tenant Job', date: dateKey(today), status: 'scheduled',
    }] });
    render(<FieldMode />);
    await screen.findByText('Selected Tenant Job');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));
    expect(await screen.findByLabelText('Add before photo')).toBeInTheDocument();
  });

  it('shows an honest call-device message without claiming call success', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'today', customerName: 'Field Customer', customerPhone: '555-0100',
      address: '100 Field Lane', date: dateKey(today), startTime: '10:00',
    }] });
    render(<FieldMode />);
    await screen.findByText('Field Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));
    await screen.findByText('No before photos added yet.');

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
    await screen.findByText('No before photos added yet.');

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
      id: 'checklist-job', customerName: 'Checklist Customer', date: dateKey(today), paymentStatus: 'not_paid', ...approvedChecklist,
    }] });
    render(<FieldMode />);
    await screen.findByText('Checklist Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));

    expect(screen.getByText('Pack clean microfiber cloths.')).toBeInTheDocument();
    expect(screen.getByText('Surface/material note: sealed wood island.')).toBeInTheDocument();
    expect(screen.getAllByText('Required')).not.toHaveLength(0);
    expect(screen.getByText('Optional')).toBeInTheDocument();
    expect(screen.getByText('View steps')).toBeInTheDocument();
    expect(screen.getByText('Scope and access details have been reviewed.')).toBeInTheDocument();
    expect(screen.getByText('Walk through the home before starting')).toBeInTheDocument();
    expect(screen.getByText('Condition: if requested')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);

    fireEvent.click(screen.getByRole('checkbox', { name: /Review job scope before starting/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save checklist' }));

    await waitFor(() => expect(mocks.updateBookingFieldExecution).toHaveBeenCalled());
    const patch = mocks.updateBookingFieldExecution.mock.calls[0][2];
    expect(patch.fieldChecklist[0]).toMatchObject({
      id: 'walkthrough',
      label: 'Review job scope before starting',
      completed: true,
    });
    expect(patch).not.toHaveProperty('paymentStatus');
    expect(await screen.findByText('Checklist saved.')).toBeInTheDocument();
  });

  it('shows collapsed read-only guidance only for employee-usable snapshot methods', async () => {
    const methodItem = {
      id: 'standard-one-time-bathroom-shower-or-tub-required-1',
      area: 'Bathroom / Shower or tub',
      fixtureOrSurface: 'Shower or tub',
      label: 'Clean shower or tub',
      jobAidSteps: [],
      warnings: [],
      required: true,
      completed: false,
      approvedMethodIds: [approvedShowerMethod.id, 'pending-method'],
      preferredMethodId: approvedShowerMethod.id,
    };
    const snapshot = { ...approvedChecklist.jobChecklistSnapshot, items: [methodItem] };
    mocks.getEmployeeUsableCleaningRecordsByIds.mockResolvedValue([approvedShowerMethod]);
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'method-job', customerName: 'Method Customer', date: dateKey(today), paymentStatus: 'not_paid',
      jobChecklistSnapshot: snapshot,
      fieldChecklist: snapshot.items,
    }] });

    render(<FieldMode />);
    await screen.findByText('Method Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));
    const methodAction = await screen.findByText('View method');
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.click(methodAction);
    expect(screen.getByText('Dawn and Vinegar Shower Cleaner')).toBeInTheDocument();
    expect(screen.getByText('5–10 minutes')).toBeInTheDocument();
    expect(screen.getByText('Natural stone')).toBeInTheDocument();
    expect(screen.getByText('Never mix with bleach.')).toBeInTheDocument();
    expect(mocks.getEmployeeUsableCleaningRecordsByIds).toHaveBeenCalledWith(
      'tenant-a',
      [approvedShowerMethod.id, 'pending-method'],
    );
  });

  it('hides unavailable or pending method IDs without affecting checklist outcomes', async () => {
    const pendingItem = {
      id: 'standard-one-time-bathroom-mirror-required-1',
      area: 'Bathroom / Mirror',
      label: 'Clean mirror',
      jobAidSteps: [],
      warnings: [],
      required: true,
      completed: false,
      approvedMethodIds: ['pending-method'],
      preferredMethodId: 'pending-method',
    };
    const snapshot = { ...approvedChecklist.jobChecklistSnapshot, items: [pendingItem] };
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'pending-method-job', customerName: 'Pending Method Customer', date: dateKey(today),
      jobChecklistSnapshot: snapshot,
      fieldChecklist: snapshot.items,
    }] });
    render(<FieldMode />);
    await screen.findByText('Pending Method Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));
    await waitFor(() => expect(mocks.getEmployeeUsableCleaningRecordsByIds).toHaveBeenCalled());
    expect(screen.queryByText('View method')).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
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
      id: 'complete-job', customerName: 'Complete Customer', date: dateKey(today), paymentStatus: 'not_paid', ...approvedChecklist,
    }] });
    render(<FieldMode />);
    await screen.findByText('Complete Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));

    fireEvent.click(screen.getByRole('checkbox', { name: /Complete the requested cleaning areas/ }));
    fireEvent.change(screen.getByLabelText('Employee notes'), { target: { value: 'Ready for owner review.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mark Complete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete anyway' }));

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

  it('does not expose an unapproved suggested checklist to Field Mode', async () => {
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'unapproved-job', customerName: 'Unapproved Customer', date: dateKey(today), paymentStatus: 'not_paid',
    }] });
    render(<FieldMode />);
    await screen.findByText('Unapproved Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));
    expect(screen.getByText('No checklist assigned to this job.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save checklist' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Walk through the home before starting')).not.toBeInTheDocument();
  });

  it('rejects an approved checklist snapshot with duplicate item IDs', async () => {
    const duplicateSnapshot = {
      ...approvedChecklist.jobChecklistSnapshot,
      items: [
        { id: 'duplicate', area: 'Kitchen', label: 'First task', required: true, completed: false },
        { id: 'duplicate', area: 'Bathroom', label: 'Second task', required: true, completed: false },
      ],
    };
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'duplicate-job', customerName: 'Duplicate Checklist Customer', date: dateKey(today), paymentStatus: 'not_paid',
      jobChecklistSnapshot: duplicateSnapshot,
      fieldChecklist: duplicateSnapshot.items,
    }] });

    render(<FieldMode />);
    await screen.findByText('Duplicate Checklist Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));

    expect(screen.getByText('No checklist assigned to this job.')).toBeInTheDocument();
    expect(screen.queryByLabelText('First task')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Second task')).not.toBeInTheDocument();
  });

  it('degrades safely when job-aid steps are malformed', async () => {
    const malformedSnapshot = {
      ...approvedChecklist.jobChecklistSnapshot,
      items: [{
        id: 'safe-parent', area: 'Kitchen / Faucet', label: 'Clean and polish faucet',
        required: true, completed: false, completionCriteria: 'Faucet is visibly clean.', jobAidSteps: { invalid: true },
        warnings: ['Use a surface-compatible method.'],
      }],
    };
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'malformed-aid-job', customerName: 'Malformed Aid Customer', date: dateKey(today), paymentStatus: 'not_paid',
      jobChecklistSnapshot: malformedSnapshot,
      fieldChecklist: malformedSnapshot.items,
    }] });

    render(<FieldMode />);
    await screen.findByText('Malformed Aid Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));

    expect(screen.getByLabelText(/Clean and polish faucet/)).toBeInTheDocument();
    expect(screen.getByText('Faucet is visibly clean.')).toBeInTheDocument();
    expect(screen.getByText('Use a surface-compatible method.')).toBeInTheDocument();
    expect(screen.getByText('View steps').closest('details').querySelector('ol')).not.toBeInTheDocument();
  });

  it('warns an employee before completion when no uploaded after evidence exists', async () => {
    mocks.role = 'employee';
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'complete-without-photo', customerName: 'Warning Customer', date: dateKey(today), paymentStatus: 'not_paid', status: 'scheduled', assignedEmployeeAuthUid: 'field-user-1',
    }] });
    render(<FieldMode />);
    await screen.findByText('Warning Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));
    await screen.findByText('No after photos added yet.');

    fireEvent.click(screen.getByRole('button', { name: 'Mark Complete' }));

    expect(screen.getByRole('alertdialog')).toHaveTextContent('No after photos have been uploaded. Complete the job anyway?');
    expect(mocks.updateBookingFieldExecution).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Complete anyway' }));
    await waitFor(() => expect(mocks.updateBookingFieldExecution).toHaveBeenCalled());
    expect(mocks.updateBookingFieldExecution.mock.calls[0][2]).not.toHaveProperty('paymentStatus');
  });

  it('does not warn when persisted after evidence has loaded', async () => {
    mocks.role = 'employee';
    mocks.listFieldPhotos.mockResolvedValue([{
      id: 'after-1', phase: 'after', storagePath: 'safe/after-1.jpg', uploadedAt: new Date(),
    }]);
    mocks.loadFieldPhotoBlob.mockResolvedValue(new Blob(['photo'], { type: 'image/jpeg' }));
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:after-photo') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    mocks.getJobs.mockResolvedValue({ success: true, data: [{
      id: 'complete-with-photo', customerName: 'Evidence Customer', date: dateKey(today), paymentStatus: 'not_paid', status: 'scheduled', assignedEmployeeAuthUid: 'field-user-1',
    }] });
    render(<FieldMode />);
    await screen.findByText('Evidence Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));
    await screen.findByAltText('after job evidence');

    fireEvent.click(screen.getByRole('button', { name: 'Mark Complete' }));

    await waitFor(() => expect(mocks.updateBookingFieldExecution).toHaveBeenCalled());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mocks.updateBookingFieldExecution.mock.calls[0][2]).not.toHaveProperty('paymentStatus');
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

  it('clears Tenant A field records and ignores its late response after switching to Tenant B', async () => {
    mocks.role = 'employee';
    let resolveTenantA;
    mocks.getJobs.mockImplementation(tenantId => {
      if (tenantId === 'tenant-a') {
        return new Promise(resolve => { resolveTenantA = resolve; });
      }
      return Promise.resolve({
        success: true,
        data: [{ id: 'job-b', customerName: 'Tenant B Field Customer', date: dateKey(today), status: 'scheduled', assignedEmployeeAuthUid: 'field-user-1' }],
      });
    });

    const { rerender } = render(<FieldMode />);
    await waitFor(() => expect(mocks.getJobs).toHaveBeenCalledWith('tenant-a', 'field-user-1'));

    mocks.tenantId = 'tenant-b';
    rerender(<FieldMode />);
    expect(await screen.findByText('Tenant B Field Customer')).toBeInTheDocument();

    await act(async () => {
      resolveTenantA({
        success: true,
        data: [{ id: 'job-a', customerName: 'Tenant A Field Customer', date: dateKey(today), status: 'scheduled', assignedEmployeeAuthUid: 'field-user-1' }],
      });
    });

    expect(screen.queryByText('Tenant A Field Customer')).not.toBeInTheDocument();
    expect(screen.getByText('Tenant B Field Customer')).toBeInTheDocument();
  });

  it('closes the selected employee job and reloads after assignment access is lost', async () => {
    mocks.role = 'employee';
    mocks.getJobs
      .mockResolvedValueOnce({ success: true, data: [{
        id: 'reassigned-job', customerName: 'Reassigned Customer', date: dateKey(today), status: 'scheduled', assignedEmployeeAuthUid: 'field-user-1',
      }] })
      .mockResolvedValue({ success: true, data: [] });
    mocks.updateBookingFieldExecution.mockResolvedValue({ success: false, message: 'permission-denied' });

    render(<FieldMode />);
    await screen.findByText('Reassigned Customer');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Job' }));

    await waitFor(() => expect(mocks.getJobs).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Reassigned Customer')).not.toBeInTheDocument();
  });

  it('closes the Tenant A job packet and photo surface when the tenant changes', async () => {
    mocks.getJobs.mockImplementation(async tenantId => ({
      success: true,
      data: [{
        id: tenantId === 'tenant-a' ? 'field-a' : 'field-b',
        customerName: tenantId === 'tenant-a' ? 'Tenant A Job Packet' : 'Tenant B Job Packet',
        date: dateKey(today),
      }],
    }));

    const { rerender } = render(<FieldMode />);
    await screen.findByText('Tenant A Job Packet');
    fireEvent.click(screen.getByRole('button', { name: 'Open job packet' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    mocks.tenantId = 'tenant-b';
    rerender(<FieldMode />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Tenant B Job Packet')).toBeInTheDocument();
    expect(screen.queryByText('Tenant A Job Packet')).not.toBeInTheDocument();
  });
});
