// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dashboardMocks = vi.hoisted(() => ({
  getLeads: vi.fn(),
  setLeadStatus: vi.fn(),
  deleteLead: vi.fn(),
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
