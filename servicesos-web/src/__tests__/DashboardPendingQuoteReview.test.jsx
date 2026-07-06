// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dashboardMocks = vi.hoisted(() => ({
  getLeads: vi.fn(),
  setLeadStatus: vi.fn(),
  deleteLead: vi.fn(),
  getJobs: vi.fn(),
  approveQuoteRequestAndCreateBooking: vi.fn(),
  checkInsuranceExpiration: vi.fn(),
  getRemainingCredits: vi.fn()
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    currentTenant: { id: 'tenant-test' },
    user: { uid: 'admin-test' }
  })
}));

vi.mock('../services/crmService', () => ({
  getLeads: dashboardMocks.getLeads,
  setLeadStatus: dashboardMocks.setLeadStatus,
  deleteLead: dashboardMocks.deleteLead
}));

vi.mock('../services/quoteBookingConversionService', () => ({
  approveQuoteRequestAndCreateBooking: dashboardMocks.approveQuoteRequestAndCreateBooking
}));

vi.mock('../core/scheduling/schedulingService', () => ({
  BOOKING_MANUAL_PAYMENT_STATUS_LABELS: {},
  getJobs: dashboardMocks.getJobs
}));

vi.mock('../services/insuranceService', () => ({
  checkInsuranceExpiration: dashboardMocks.checkInsuranceExpiration
}));

vi.mock('../services/aiUsageEngineService', () => ({
  getRemainingCredits: dashboardMocks.getRemainingCredits
}));

import Dashboard from '../pages/Dashboard';

const pendingQuoteRequest = {
  id: 'lead-test',
  tenantId: 'tenant-test',
  type: 'quote_request',
  source: 'customer-portal',
  status: 'new',
  customerId: 'customer-test',
  propertyId: 'property-test',
  customerSnapshot: {
    fullName: 'Snapshot Customer',
    email: 'snapshot@example.com',
    phone: '555-0100'
  },
  propertySnapshot: {
    address: '123 Snapshot Lane',
    bedrooms: 3,
    bathrooms: 2,
    squareFootage: 1450
  },
  requestSnapshot: {
    cleaningType: 'deep',
    frequency: 'one-time',
    preferredDate: '2026-07-15',
    preferredTime: '10:30'
  },
  formData: {
    fullName: 'Legacy Customer',
    address: '999 Legacy Road',
    bedrooms: 0,
    bathrooms: 0
  },
  estimate: {
    priceLow: 0,
    priceHigh: 0,
    appointmentDuration: 3,
    requiresReview: true,
    status: 'pending_owner_review'
  },
  review: { requiresOwnerReview: true },
  appointmentRequest: {
    preferredDate: '2026-07-15',
    preferredTime: '10:30',
    status: 'pending_review'
  },
  booking: null,
  createdAt: '2026-06-23T12:00:00.000Z'
};

const bookedLead = {
  ...pendingQuoteRequest,
  id: 'booked-lead',
  type: 'lead',
  source: 'admin',
  status: 'booked',
  customerSnapshot: { ...pendingQuoteRequest.customerSnapshot, fullName: 'Booked Customer' },
  review: { requiresOwnerReview: false, status: 'approved' },
  estimate: {
    priceLow: 245,
    priceHigh: 245,
    appointmentDuration: 3,
    requiresReview: false,
    status: 'approved'
  },
  appointmentRequest: null,
  booking: {
    bookingId: 'booking-existing',
    scheduledAt: '2026-07-15T15:30:00.000Z',
    agreedPrice: 245,
    status: 'scheduled'
  }
};

describe('Dashboard pending quote review', () => {
  beforeEach(() => {
    Object.values(dashboardMocks).forEach(mock => mock.mockReset());
    dashboardMocks.getLeads.mockResolvedValue([pendingQuoteRequest, bookedLead]);
    dashboardMocks.getJobs.mockResolvedValue({ success: true, data: [] });
    dashboardMocks.checkInsuranceExpiration.mockResolvedValue(null);
    dashboardMocks.getRemainingCredits.mockResolvedValue(null);
    dashboardMocks.approveQuoteRequestAndCreateBooking.mockResolvedValue({
      leadPatch: {
        status: 'booked',
        booking: {
          bookingId: 'booking-test',
          scheduledAt: '2026-07-15T15:30:00.000Z',
          agreedPrice: 245,
          status: 'scheduled'
        }
      }
    });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('shows snapshot data and uses explicit owner approval instead of generic booking status', async () => {
    const { container } = render(<Dashboard />);

    expect(await screen.findByText('Snapshot Customer')).toBeInTheDocument();
    expect(screen.getAllByText('3 bed, 2 bath')).toHaveLength(2);
    expect(screen.getByText('Pending owner review.')).toBeInTheDocument();
    expect(screen.queryByText('$0 - $0')).not.toBeInTheDocument();
    expect(screen.queryByText('0 hrs labor')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve / Create Booking' })).toBeInTheDocument();
    expect(screen.getByText('Total leads').nextElementSibling).toHaveTextContent('2');
    expect(screen.getByText('Booked jobs').nextElementSibling).toHaveTextContent('1');
    expect(screen.getByText('Booked revenue').nextElementSibling).toHaveTextContent('$245');
    expect(screen.getByText('Expected from booked jobs')).toBeInTheDocument();
    expect(screen.getByText('Booked revenue (14 days)')).toBeInTheDocument();
    expect(screen.getByText('Expected revenue by scheduled job date')).toBeInTheDocument();
    expect(screen.queryByText('Confirmed revenue')).not.toBeInTheDocument();
    expect(screen.queryByText('From booked jobs')).not.toBeInTheDocument();
    expect(screen.queryByText('Revenue (14 days)')).not.toBeInTheDocument();
    expect(screen.queryByText('Scheduled booked jobs by appointment date')).not.toBeInTheDocument();
    expect(screen.getAllByText('$245').length).toBeGreaterThan(0);
    expect(dashboardMocks.checkInsuranceExpiration).not.toHaveBeenCalled();
    expect(dashboardMocks.getRemainingCredits).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Snapshot Customer'));
    expect(screen.getAllByText('Pending owner review').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Mark booked' })).not.toBeInTheDocument();
    expect(screen.getByText('Requested for owner review, not a confirmed booking.')).toBeInTheDocument();
    expect(screen.queryByText('0 sq ft')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Approve / Create Booking' })[0]);
    expect(screen.getByRole('heading', { name: 'Approve quote and create booking' })).toBeInTheDocument();
    expect(screen.queryByText(/Estimate range: \$0/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '245' } });
    const dateInput = container.querySelector('input[type="date"]');
    expect(dateInput.value).toBe('2026-07-15');
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve / Create Booking' }).at(-1));

    await waitFor(() => {
      expect(dashboardMocks.approveQuoteRequestAndCreateBooking).toHaveBeenCalledWith({
        tenantId: 'tenant-test',
        lead: pendingQuoteRequest,
        bookingData: expect.objectContaining({ agreedPrice: 245 }),
        reviewedBy: 'admin-test'
      });
    });
  });
});

describe('Dashboard null-safety', () => {
  beforeEach(() => {
    Object.values(dashboardMocks).forEach(mock => mock.mockReset());
    dashboardMocks.getJobs.mockResolvedValue({ success: true, data: [] });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('renders when a lead is missing estimate', async () => {
    const leadWithoutEstimate = {
      id: 'lead-no-estimate',
      tenantId: 'tenant-test',
      status: 'new',
      customerSnapshot: {
        fullName: 'No Estimate Customer',
        email: 'noestimate@example.com',
        phone: '555-0101'
      },
      propertySnapshot: {
        address: '456 No Estimate St',
        bedrooms: 2,
        bathrooms: 1
      },
      formData: {
        fullName: 'No Estimate Customer',
        address: '456 No Estimate St',
        bedrooms: 2,
        bathrooms: 1
      },
      estimate: null,
      booking: null,
      createdAt: '2026-06-23T12:00:00.000Z'
    };

    dashboardMocks.getLeads.mockResolvedValue([leadWithoutEstimate]);

    render(<Dashboard />);

    expect(await screen.findByText('No Estimate Customer')).toBeInTheDocument();
    expect(screen.getByText('Total leads').nextElementSibling).toHaveTextContent('1');
    expect(screen.getByText('Pipeline value').nextElementSibling).toHaveTextContent('$0');
  });

  it('renders a saved admin manual estimate without treating it as booked', async () => {
    dashboardMocks.getLeads.mockResolvedValue([{
      id: 'lead-manual',
      type: 'lead',
      source: 'admin',
      status: 'new',
      formData: {
        fullName: 'Manual Estimate Customer',
        phone: '555-0199',
        address: '27 Beta Lane',
        bedrooms: 3,
        bathrooms: 2,
        cleaningType: 'standard',
        frequency: 'one-time'
      },
      estimate: {
        laborHours: 3,
        appointmentDuration: 3,
        priceLow: 120,
        priceHigh: 150,
        aiEnhanced: false
      },
      booking: null,
      createdAt: '2026-06-27T12:00:00.000Z'
    }]);

    render(<Dashboard />);

    expect(await screen.findByText('Manual Estimate Customer')).toBeInTheDocument();
    expect(screen.getByText('$120 - $150')).toBeInTheDocument();
    expect(screen.getByText('Booked jobs').nextElementSibling).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: 'Create Booking' })).toBeInTheDocument();
  });

  it('can create a booking from a manual estimate that stores a time bucket', async () => {
    const manualEstimate = {
      id: 'lead-manual-time-bucket',
      type: 'lead',
      source: 'admin',
      status: 'new',
      tenantId: 'tenant-test',
      formData: {
        fullName: 'Manual Time Bucket Customer',
        phone: '555-0200',
        address: '629 Golden Path Lane',
        preferredTime: 'morning',
        bedrooms: 3,
        bathrooms: 2,
        cleaningType: 'standard',
        frequency: 'one-time'
      },
      estimate: {
        laborHours: 4.5,
        appointmentDuration: 4.5,
        priceLow: 180,
        priceHigh: 225,
        aiEnhanced: false
      },
      booking: null,
      createdAt: '2026-06-29T12:00:00.000Z'
    };

    dashboardMocks.getLeads.mockResolvedValue([manualEstimate]);
    dashboardMocks.approveQuoteRequestAndCreateBooking.mockResolvedValue({
      leadPatch: {
        status: 'booked',
        booking: {
          bookingId: 'booking-manual-time-bucket',
          scheduledAt: '2026-07-02T09:00:00.000Z',
          agreedPrice: 180,
          status: 'scheduled'
        }
      }
    });

    const { container } = render(<Dashboard />);

    expect(await screen.findByText('Manual Time Bucket Customer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create Booking' }));

    const dateInput = container.querySelector('input[type="date"]');
    const timeInput = container.querySelector('input[type="time"]');
    expect(timeInput.value).toBe('09:00');

    fireEvent.change(dateInput, { target: { value: '2026-07-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }));

    await waitFor(() => {
      expect(dashboardMocks.approveQuoteRequestAndCreateBooking).toHaveBeenCalledWith({
        tenantId: 'tenant-test',
        lead: manualEstimate,
        bookingData: expect.objectContaining({
          scheduledAt: '2026-07-02T14:00:00.000Z',
          agreedPrice: 180
        }),
        reviewedBy: 'admin-test'
      });
    });
  });

  it('warns on a tenant booking conflict and schedules only after explicit override', async () => {
    const lead = {
      id: 'lead-conflict',
      tenantId: 'tenant-test',
      status: 'new',
      formData: {
        fullName: 'Conflict Candidate',
        address: '10 New Job Lane',
        cleaningType: 'standard',
        preferredDate: '2026-07-15',
        preferredTime: '10:00'
      },
      estimate: { priceLow: 200, priceHigh: 225, appointmentDuration: 2 },
      booking: null,
      createdAt: '2026-06-30T12:00:00.000Z'
    };
    dashboardMocks.getLeads.mockResolvedValue([lead]);
    dashboardMocks.getJobs.mockResolvedValue({
      success: true,
      data: [{
        id: 'existing-booking',
        customerName: 'Existing Customer',
        serviceType: 'Deep Clean',
        date: '2026-07-15',
        startTime: '09:30',
        endTime: '11:30',
        address: '20 Existing Lane',
        status: 'scheduled'
      }]
    });
    dashboardMocks.approveQuoteRequestAndCreateBooking.mockResolvedValue({ leadPatch: { status: 'booked' } });

    render(<Dashboard />);
    expect(await screen.findByText('Conflict Candidate')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create Booking' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }));

    expect(await screen.findByText('Booking conflict')).toBeInTheDocument();
    expect(screen.getByText(/Existing Customer · Deep Clean/)).toBeInTheDocument();
    expect(dashboardMocks.approveQuoteRequestAndCreateBooking).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Choose another time' }));
    expect(screen.getByRole('heading', { name: 'Create booking' })).toBeInTheDocument();
    expect(dashboardMocks.approveQuoteRequestAndCreateBooking).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }));
    await screen.findByText('Booking conflict');
    fireEvent.click(screen.getByRole('button', { name: 'Schedule anyway' }));

    await waitFor(() => expect(dashboardMocks.approveQuoteRequestAndCreateBooking).toHaveBeenCalledTimes(1));
  });

  it('blocks booking when the tenant conflict check fails', async () => {
    const lead = {
      id: 'lead-check-failure',
      tenantId: 'tenant-test',
      status: 'new',
      formData: {
        fullName: 'Check Failure Customer',
        address: '30 Safety Lane',
        preferredDate: '2026-07-16',
        preferredTime: '09:00'
      },
      estimate: { priceLow: 200, priceHigh: 225, appointmentDuration: 2 },
      booking: null,
      createdAt: '2026-06-30T12:00:00.000Z'
    };
    dashboardMocks.getLeads.mockResolvedValue([lead]);
    dashboardMocks.getJobs.mockResolvedValue({ success: false, message: 'permission-denied' });

    render(<Dashboard />);
    expect(await screen.findByText('Check Failure Customer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create Booking' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not check for booking conflicts');
    expect(dashboardMocks.approveQuoteRequestAndCreateBooking).not.toHaveBeenCalled();
  });

  it('renders when a lead is missing formData', async () => {
    const leadWithoutFormData = {
      id: 'lead-no-formdata',
      tenantId: 'tenant-test',
      status: 'new',
      customerSnapshot: {
        fullName: 'No FormData Customer',
        email: 'noformdata@example.com',
        phone: '555-0102'
      },
      propertySnapshot: {
        address: '789 No FormData Ave',
        bedrooms: 3,
        bathrooms: 2
      },
      estimate: {
        priceLow: 200,
        priceHigh: 250,
        appointmentDuration: 2
      },
      booking: null,
      createdAt: '2026-06-23T12:00:00.000Z'
    };

    dashboardMocks.getLeads.mockResolvedValue([leadWithoutFormData]);

    render(<Dashboard />);

    expect(await screen.findByText('No FormData Customer')).toBeInTheDocument();
    expect(screen.getByText('Total leads').nextElementSibling).toHaveTextContent('1');
  });

  it('search/filter does not crash when lead is missing formData', async () => {
    const leadWithoutFormData = {
      id: 'lead-no-formdata',
      tenantId: 'tenant-test',
      status: 'new',
      customerSnapshot: {
        fullName: 'Search Test Customer',
        email: 'search@example.com',
        phone: '555-0103'
      },
      propertySnapshot: {
        address: '999 Search Blvd',
        bedrooms: 2,
        bathrooms: 1
      },
      estimate: null,
      booking: null,
      createdAt: '2026-06-23T12:00:00.000Z'
    };

    dashboardMocks.getLeads.mockResolvedValue([leadWithoutFormData]);

    render(<Dashboard />);

    expect(await screen.findByText('Search Test Customer')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText('Search name, address, phone…');
    fireEvent.change(searchInput, { target: { value: 'Search' } });

    expect(screen.getByText('Search Test Customer')).toBeInTheDocument();
  });

  it('renders when booking is missing scheduledAt', async () => {
    const leadWithPartialBooking = {
      id: 'lead-partial-booking',
      tenantId: 'tenant-test',
      status: 'booked',
      customerSnapshot: {
        fullName: 'Partial Booking Customer',
        email: 'partial@example.com',
        phone: '555-0104'
      },
      propertySnapshot: {
        address: '111 Partial Way',
        bedrooms: 2,
        bathrooms: 1
      },
      estimate: {
        priceLow: 150,
        priceHigh: 200,
        appointmentDuration: 2
      },
      booking: {
        agreedPrice: 175
      },
      createdAt: '2026-06-23T12:00:00.000Z'
    };

    dashboardMocks.getLeads.mockResolvedValue([leadWithPartialBooking]);

    render(<Dashboard />);

    expect(await screen.findByText('Partial Booking Customer')).toBeInTheDocument();
    expect(screen.getByText('Booked jobs').nextElementSibling).toHaveTextContent('1');
  });
});
