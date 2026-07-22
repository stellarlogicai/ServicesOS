import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingChecklistPrep, OwnerTodayJobPrep } from '../components/BookingChecklistPrep';
import { assembleBookingChecklist, buildApprovedChecklistSnapshot } from '../core/checklists/bookingChecklistAssembly';
import { buildSystemDefaultAdoption } from '../modules/cleaning/products/cleaningProductModel';
import { getStarterCleaningMethods } from '../modules/cleaning/products/starterCleaningMethods';

const mocks = vi.hoisted(() => ({
  updateBookingAdminFields: vi.fn(),
  listTenantCleaningRecords: vi.fn(),
}));

vi.mock('../core/scheduling/schedulingService', () => ({
  updateBookingAdminFields: mocks.updateBookingAdminFields,
  BOOKING_MANUAL_PAYMENT_STATUS_LABELS: {
    not_paid: 'Not paid',
  },
  BOOKING_PAYMENT_METHOD_LABELS: {},
}));

vi.mock('../modules/cleaning/products/cleaningProductService', () => ({
  listTenantCleaningRecords: mocks.listTenantCleaningRecords,
}));

const pad = value => String(value).padStart(2, '0');
const today = new Date();
const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

const booking = (overrides = {}) => ({
  id: 'booking-a',
  customerId: 'customer-a',
  propertyId: 'property-a',
  customerName: 'Prep Customer',
  address: '100 Prep Lane',
  date: todayKey,
  startTime: '09:00',
  endTime: '11:00',
  status: 'scheduled',
  serviceType: 'standard',
  paymentStatus: 'not_paid',
  agreedPrice: 185,
  assignedEmployeeAuthUid: 'employee-a',
  propertySnapshot: {
    roomCounts: { bedrooms: 1, bathrooms: 1, kitchens: 1, livingRooms: 0, diningRooms: 0, offices: 0, closets: 0 },
    household: { petCount: 0, petHairLevel: 'none' },
  },
  requestSnapshot: {
    cleaningType: 'standard',
    frequency: 'one-time',
    accessInstructions: 'Use side door.',
    specialRequests: 'Protect the wood table.',
    serviceScope: { oven: true },
  },
  ...overrides,
});

function approvedTenantMethod(sourceId) {
  const source = getStarterCleaningMethods().find(record => record.id === sourceId);
  return {
    ...buildSystemDefaultAdoption(source, {
      id: `adopted-${sourceId}`,
      tenantId: 'tenant-a',
      actorUid: 'owner-a',
    }),
    status: 'approved',
    employeeVisible: true,
    ownerReviewNotes: 'Approved for tenant use.',
  };
}

describe('BookingChecklistPrep', () => {
  beforeEach(() => {
    mocks.updateBookingAdminFields.mockReset();
    mocks.updateBookingAdminFields.mockResolvedValue({ success: true, data: { id: 'booking-a' } });
    mocks.listTenantCleaningRecords.mockReset();
    mocks.listTenantCleaningRecords.mockResolvedValue([]);
  });

  it('automatically suggests a booking-scoped checklist and requires owner review', async () => {
    render(<BookingChecklistPrep booking={booking()} tenantId="tenant-a" reviewedBy="owner-a" />);
    expect(screen.getByText('Suggested from booking details — owner review required.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Standard One-Time Clean')).toBeInTheDocument();
    expect(screen.getByText('Interior oven cleaning')).toBeInTheDocument();
    expect(screen.getByText('Complete review')).toBeInTheDocument();
    expect(screen.queryByText(/Complete .* outcome/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('View job aid').length).toBeGreaterThan(0);
    expect(screen.getByText('Review service request')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve checklist for Field Mode' })).toBeEnabled());
  });

  it('approves an immutable snapshot and execution copy without payment fields', async () => {
    const onSaved = vi.fn();
    render(<BookingChecklistPrep booking={booking()} tenantId="tenant-a" reviewedBy="owner-a" onSaved={onSaved} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve checklist for Field Mode' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Approve checklist for Field Mode' }));

    await waitFor(() => expect(mocks.updateBookingAdminFields).toHaveBeenCalledTimes(1));
    const [tenantId, bookingId, patch] = mocks.updateBookingAdminFields.mock.calls[0];
    expect([tenantId, bookingId]).toEqual(['tenant-a', 'booking-a']);
    expect(patch.jobChecklistSnapshot).toMatchObject({ ownerApproved: true, templateId: 'standard-one-time' });
    expect(patch.fieldChecklist.length).toBeGreaterThan(0);
    expect(patch.jobChecklistSnapshot.items.some(item => item.jobAidSteps.length > 0)).toBe(true);
    expect(patch.jobChecklistSnapshot.items.every(item => Array.isArray(item.sourceReferences))).toBe(true);
    expect(patch.fieldChecklist).toHaveLength(patch.jobChecklistSnapshot.items.length);
    expect(JSON.stringify(patch)).not.toMatch(/paymentStatus|amountReceived|agreedPrice|stripe/i);
    expect(await screen.findByText('Job checklist approved and assigned to Field Mode.')).toBeInTheDocument();
  });

  it('shows approved method guidance and saves stable method IDs without adding outcomes', async () => {
    const showerMethod = approvedTenantMethod('ab-dawn-vinegar-shower-cleaner');
    mocks.listTenantCleaningRecords.mockResolvedValue([showerMethod]);
    render(<BookingChecklistPrep booking={booking()} tenantId="tenant-a" reviewedBy="owner-a" />);

    expect((await screen.findAllByText('Preferred: Dawn and Vinegar Shower Cleaner')).length).toBeGreaterThan(0);
    const beforeCount = screen.getAllByRole('button', { name: 'Remove' }).length;
    const approveButton = screen.getByRole('button', { name: 'Approve checklist for Field Mode' });
    await waitFor(() => expect(approveButton).toBeEnabled());
    fireEvent.click(approveButton);

    await waitFor(() => expect(mocks.updateBookingAdminFields).toHaveBeenCalledTimes(1));
    const patch = mocks.updateBookingAdminFields.mock.calls[0][2];
    expect(patch.jobChecklistSnapshot.items).toHaveLength(beforeCount);
    expect(patch.jobChecklistSnapshot.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'standard-one-time-bathroom-shower-or-tub-required-1',
        approvedMethodIds: [showerMethod.id],
        preferredMethodId: showerMethod.id,
      }),
    ]));
    expect(JSON.stringify(patch)).not.toMatch(/paymentStatus|amountReceived|agreedPrice|stripe/i);
  });

  it('requires explicit confirmation before removing a required task', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<BookingChecklistPrep booking={booking()} tenantId="tenant-a" reviewedBy="owner-a" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/required task/i));
    expect(screen.getByText('Review customer notes')).toBeInTheDocument();
  });

  it('renders an approved snapshot read-only', () => {
    const approvedBooking = booking();
    render(<BookingChecklistPrep
      booking={{
        ...approvedBooking,
        jobChecklistSnapshot: {
          ownerApproved: true,
          templateName: 'Standard One-Time Clean',
          reviewedAt: '2026-07-17T12:00:00.000Z',
          provenance: { sourceScopeSignature: assembleBookingChecklist(approvedBooking).sourceScopeSignature },
          items: [{
            id: 'approved-1',
            area: 'Kitchen / Countertops',
            fixtureOrSurface: 'Countertops',
            label: 'Clean countertops, edges, and corners',
            completionCriteria: 'Countertops are visibly clean.',
            jobAidSteps: [{ label: 'Remove visible residue', condition: '', note: '' }],
            warnings: ['Use only an approved surface-compatible method.'],
            required: true,
          }],
        },
      }}
      tenantId="tenant-a"
      reviewedBy="owner-a"
    />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Clean countertops, edges, and corners')).toBeInTheDocument();
    expect(screen.getByText('Countertops are visibly clean.')).toBeInTheDocument();
    expect(screen.getByText('Remove visible residue')).toBeInTheDocument();
    expect(screen.getByText('Use only an approved surface-compatible method.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve checklist for Field Mode' })).not.toBeInTheDocument();
  });
});

describe("OwnerTodayJobPrep", () => {
  it('shows today jobs in scheduled order with readiness reasons and owner-only payment status', async () => {
    const onOpenBooking = vi.fn();
    render(<OwnerTodayJobPrep
      bookings={[
        booking({ id: 'later', customerName: 'Later Customer', startTime: '13:00' }),
        booking({ id: 'earlier', customerName: 'Earlier Customer', startTime: '08:00' }),
      ]}
      employeeProfiles={[{ uid: 'employee-a', displayName: 'Field Employee' }]}
      onOpenBooking={onOpenBooking}
    />);
    const headings = screen.getAllByRole('heading', { level: 3 }).map(element => element.textContent);
    expect(headings.indexOf('Earlier Customer')).toBeLessThan(headings.indexOf('Later Customer'));
    expect(screen.getAllByText('Needs attention').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not paid').length).toBe(2);
    expect(screen.getByRole('heading', { name: 'Mix before leaving' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Commercial products' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeInTheDocument();
    expect(await screen.findByText('Approved tenant methods are unavailable until a tenant is selected.')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Review job prep' })[0]);
    expect(onOpenBooking).toHaveBeenCalledWith(expect.objectContaining({ id: 'earlier' }));
  });

  it('renders one deduplicated Daily Prep mixture with every affected job', async () => {
    const showerMethod = approvedTenantMethod('ab-dawn-vinegar-shower-cleaner');
    mocks.listTenantCleaningRecords.mockResolvedValue([showerMethod]);
    const earlier = booking({ id: 'earlier-ready', customerName: 'Earlier Ready', startTime: '08:00' });
    const later = booking({ id: 'later-ready', customerName: 'Later Ready', startTime: '13:00' });
    const showerItem = {
      id: 'standard-one-time-bathroom-shower-or-tub-required-1',
      area: 'Bathroom / Shower or Tub',
      fixtureOrSurface: 'Shower or Tub',
      label: 'Complete shower or tub',
      required: true,
      completed: false,
      approvedMethodIds: [showerMethod.id],
      preferredMethodId: showerMethod.id,
    };
    const ready = value => ({
      ...value,
      jobChecklistSnapshot: {
        ownerApproved: true,
        items: [showerItem],
        provenance: { sourceScopeSignature: assembleBookingChecklist(value).sourceScopeSignature },
      },
    });

    render(<OwnerTodayJobPrep
      bookings={[ready(later), ready(earlier)]}
      tenantId="tenant-a"
      reviewedBy="owner-a"
      onOpenBooking={vi.fn()}
    />);

    expect(await screen.findByRole('heading', { name: 'Dawn and Vinegar Shower Cleaner' })).toBeInTheDocument();
    expect(screen.getAllByText('Earlier Ready, Later Ready').length).toBeGreaterThan(0);
    expect(screen.getByText(/Dedicated 32 oz chemical-resistant Zep spray bottle/)).toBeInTheDocument();
    expect(screen.getByText(/5–10 minutes/)).toBeInTheDocument();
    expect(screen.getAllByText('Gloves')).toHaveLength(1);
    expect(screen.getAllByText(/Never mix with bleach/)).toHaveLength(1);
  });

  it('confirms an unchanged recurring packet from Today\'s Jobs with one narrow write', async () => {
    const current = booking({
      id: 'recurring-current',
      serviceType: 'recurring',
      requestSnapshot: { cleaningType: 'recurring', frequency: 'bi-weekly', serviceScope: {} },
    });
    const priorBooking = { ...current, id: 'recurring-prior', date: '2026-07-01', status: 'completed' };
    const assembly = assembleBookingChecklist(priorBooking);
    const priorSnapshot = buildApprovedChecklistSnapshot({
      booking: priorBooking,
      assembly,
      items: assembly.items,
      reviewedBy: 'owner-a',
    }).data;
    const onChecklistSaved = vi.fn();

    render(<OwnerTodayJobPrep
      bookings={[current, { ...priorBooking, jobChecklistSnapshot: priorSnapshot }]}
      tenantId="tenant-a"
      reviewedBy="owner-a"
      onOpenBooking={vi.fn()}
      onChecklistSaved={onChecklistSaved}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm recurring packet' }));
    await waitFor(() => expect(mocks.updateBookingAdminFields).toHaveBeenCalledTimes(1));
    const [tenantId, bookingId, patch] = mocks.updateBookingAdminFields.mock.calls[0];
    expect([tenantId, bookingId]).toEqual(['tenant-a', 'recurring-current']);
    expect(patch.jobChecklistSnapshot.provenance).toMatchObject({
      assemblyMethod: 'recurring_reuse',
      reusedFromBookingId: 'recurring-prior',
    });
    expect(patch.jobChecklistSnapshot.items).toEqual(priorSnapshot.items.map(item => ({ ...item, completed: false })));
    expect(JSON.stringify(patch)).not.toMatch(/paymentStatus|agreedPrice|assignedEmployeeAuthUid|stripe/i);
    expect(await screen.findByText('Recurring job packet confirmed and ready for Field Mode.')).toBeInTheDocument();
    expect(onChecklistSaved).toHaveBeenCalledWith('recurring-current', { id: 'booking-a' });
  });
});
