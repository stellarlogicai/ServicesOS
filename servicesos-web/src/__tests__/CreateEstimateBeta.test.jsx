// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  analyzePhotos: vi.fn(),
  saveQuote: vi.fn(),
  sendQuoteEmail: vi.fn(),
  sendSMS: vi.fn(),
  compressImages: vi.fn(),
  currentTenant: { id: 'tenant-test' }
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ currentTenant: mocks.currentTenant })
}));

vi.mock('../services/aiService', () => ({ analyzePhotos: mocks.analyzePhotos }));
vi.mock('../services/crmService', () => ({ saveQuote: mocks.saveQuote }));
vi.mock('../services/emailService', () => ({
  sendQuoteEmail: mocks.sendQuoteEmail
}));
vi.mock('../services/notificationService', () => ({ sendSMS: mocks.sendSMS }));
vi.mock('../services/imageCompressionService', () => ({
  compressImages: mocks.compressImages
}));
vi.mock('../services/pdfService', () => ({ downloadQuotePDF: vi.fn() }));
vi.mock('../components/PhotoGrid', () => ({ PhotoGrid: () => <div>Photo preview</div> }));

import AIPhotoEstimateSystem from '../AIPhotoEstimateSystem';

function completeRequiredFields() {
  fireEvent.change(screen.getByLabelText('First Name *'), { target: { value: 'Manual' } });
  fireEvent.change(screen.getByLabelText('Last Name *'), { target: { value: 'Customer' } });
  fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'manual@example.com' } });
  fireEvent.change(screen.getByLabelText('Phone *'), { target: { value: '555-0199' } });
}

function getPreferredTimeSelect() {
  return document.querySelector('select[name="preferredTime"]');
}

describe('Create Estimate wife-beta flow', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(mock => {
      if (typeof mock?.mockReset === 'function') mock.mockReset();
    });
    mocks.saveQuote.mockResolvedValue({ id: 'lead-manual' });
    mocks.sendQuoteEmail.mockResolvedValue({ success: true });
    mocks.compressImages.mockImplementation(async files => files);
    mocks.currentTenant = { id: 'tenant-test' };
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:preview') });
  });

  it('renders and saves a manual estimate without AI, booking, or payment actions', async () => {
    const onLeadSaved = vi.fn().mockResolvedValue({ id: 'lead-manual' });
    render(<AIPhotoEstimateSystem onLeadSaved={onLeadSaved} />);

    expect(screen.getByRole('heading', { name: 'Create Estimate' })).toBeInTheDocument();
    completeRequiredFields();
    fireEvent.change(screen.getByLabelText('Preferred Date'), { target: { value: '2026-08-12' } });
    fireEvent.change(getPreferredTimeSelect(), { target: { value: 'afternoon' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review & Generate Estimate' }));

    expect(screen.getByRole('button', { name: 'Save Manual Estimate' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save Manual Estimate' }));

    expect(await screen.findByRole('heading', { name: 'Estimate Results' })).toBeInTheDocument();
    expect(onLeadSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Manual',
        lastName: 'Customer',
        email: 'manual@example.com',
        phone: '555-0199',
        preferredDate: '2026-08-12',
        preferredTime: 'afternoon'
      }),
      expect.objectContaining({ priceLow: expect.any(Number), priceHigh: expect.any(Number), aiEnhanced: false }),
      null
    );
    expect(onLeadSaved.mock.calls[0]).toHaveLength(3);
    expect(onLeadSaved.mock.calls[0][0]).not.toHaveProperty('bookingId');
    expect(onLeadSaved.mock.calls[0][0]).not.toHaveProperty('scheduledDate');
    expect(onLeadSaved.mock.calls[0][0]).not.toHaveProperty('scheduledTime');
    expect(screen.queryByRole('button', { name: 'Proceed to Payment' })).not.toBeInTheDocument();
    expect(JSON.stringify(onLeadSaved.mock.calls)).not.toMatch(/booking|payment/i);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Estimate saved successfully. Customer notification sent.'
    );
    expect(mocks.sendQuoteEmail).toHaveBeenCalledWith(
      'tenant-test',
      expect.objectContaining({ id: 'lead-manual', email: 'manual@example.com' }),
      expect.objectContaining({ priceLow: expect.any(Number), priceHigh: expect.any(Number) }),
    );
  });

  it('keeps the native Preferred Date control accessible and preserves broad time windows', () => {
    render(<AIPhotoEstimateSystem />);

    const preferredDate = screen.getByLabelText('Preferred Date');
    const preferredTime = getPreferredTimeSelect();

    expect(preferredTime).not.toBeNull();
    expect(preferredDate).toHaveAttribute('id', 'create-estimate-preferred-date');
    expect(preferredDate).toHaveAttribute('type', 'date');
    expect(preferredDate).toHaveAttribute('name', 'preferredDate');
    expect(preferredDate).toHaveAttribute('min', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(preferredDate).toHaveClass('create-estimate-date-field');

    fireEvent.change(preferredDate, { target: { value: '2026-08-12' } });
    expect(preferredDate).toHaveValue('2026-08-12');

    expect(Array.from(preferredTime.options, option => [option.value, option.textContent])).toEqual([
      ['', 'Select a time'],
      ['morning', 'Morning (8AM - 12PM)'],
      ['afternoon', 'Afternoon (12PM - 5PM)'],
      ['evening', 'Evening (5PM - 8PM)'],
    ]);
  });

  it('prefills only saved customer and property fields for a new estimate', async () => {
    const onLeadSaved = vi.fn().mockResolvedValue({ id: 'lead-repeat-customer' });
    const existingCustomerContext = { customerId: 'customer-existing' };
    render(
      <AIPhotoEstimateSystem
        onLeadSaved={onLeadSaved}
        existingCustomerContext={existingCustomerContext}
        initialCustomerPrefill={{
          firstName: 'Repeat', lastName: 'Customer', email: 'repeat@example.com', phone: '555-0161',
          address: '110 Example Lane', city: 'Test City', state: 'TX', zip: '00000',
        }}
      />
    );

    expect(screen.getByLabelText('First Name *')).toHaveValue('Repeat');
    expect(screen.getByLabelText('Last Name *')).toHaveValue('Customer');
    expect(screen.getByLabelText('Email *')).toHaveValue('repeat@example.com');
    expect(screen.getByLabelText('Street Address')).toHaveValue('110 Example Lane');
    expect(screen.getByLabelText('City')).toHaveValue('Test City');
    expect(screen.getByLabelText('State')).toHaveValue('TX');
    expect(screen.getByLabelText('ZIP')).toHaveValue('00000');
    expect(screen.getByLabelText('Preferred Date')).toHaveValue('');
    expect(getPreferredTimeSelect()).toHaveValue('');
    expect(document.querySelector('select[name="cleaningType"]')).toHaveValue('standard');
    expect(screen.getByLabelText('Inside Oven (+1h)')).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Review & Generate Estimate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Manual Estimate' }));
    await screen.findByRole('heading', { name: 'Estimate Results' });

    expect(onLeadSaved).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Repeat', address: '110 Example Lane', city: 'Test City', state: 'TX', zip: '00000', preferredDate: '', extras: expect.any(Object) }),
      expect.any(Object),
      null,
      existingCustomerContext,
    );
  });

  it('keeps every estimate input available in the scoped owner layout', () => {
    const { container } = render(<AIPhotoEstimateSystem />);

    expect(container.querySelector('.create-estimate-page')).toBeInTheDocument();
    expect(container.querySelector('.create-estimate-form-layout')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Customer Information' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Property Address' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Appointment Preference' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Service Details' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Room Details' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Property Condition' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Additional Services' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Photos Preview only' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Special Requests' })).toBeInTheDocument();

    [
      'firstName', 'lastName', 'email', 'phone', 'address', 'city', 'state', 'zip',
      'preferredDate', 'preferredTime', 'bedroomCount', 'bathroomCount', 'kitchenCount',
      'livingRoomCount', 'diningRoomCount', 'officeCount', 'basementCount', 'stairsCount',
      'petHairLevel', 'clutterLevel', 'lastCleaned', 'cleaningType', 'frequency',
      'marketType', 'specialRequests'
    ].forEach((name) => {
      expect(container.querySelector(`[name="${name}"]`)).toBeInTheDocument();
    });

    expect(screen.getByRole('checkbox', { name: 'Has stairs' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Inside Oven (+1h)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Upload estimate photos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review & Generate Estimate' })).toBeInTheDocument();
  });

  it('does not expose the removed payment form or fake payment success flow by default', async () => {
    render(<AIPhotoEstimateSystem />);

    completeRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Review & Generate Estimate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Manual Estimate' }));

    expect(await screen.findByRole('heading', { name: 'Estimate Results' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Proceed to Payment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Payment Successful/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Payment ID/i)).not.toBeInTheDocument();
  });

  it('selects all owner add-ons and allows an individual add-on to be removed', async () => {
    const onLeadSaved = vi.fn().mockResolvedValue({ id: 'lead-add-ons' });
    render(<AIPhotoEstimateSystem onLeadSaved={onLeadSaved} />);
    completeRequiredFields();

    fireEvent.click(screen.getByLabelText('Select all additional services'));
    const oven = screen.getByRole('checkbox', { name: 'Inside Oven (+1h)' });
    const fridge = screen.getByRole('checkbox', { name: 'Inside Fridge (+0.75h)' });
    expect(oven).toBeChecked();
    expect(fridge).toBeChecked();
    fireEvent.click(oven);
    expect(screen.getByLabelText('Select all additional services')).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Review & Generate Estimate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Manual Estimate' }));
    await screen.findByRole('heading', { name: 'Estimate Results' });

    expect(onLeadSaved.mock.calls[0][0].extras.oven).toBe(false);
    expect(onLeadSaved.mock.calls[0][0].extras.fridge).toBe(true);
  });

  it('uses an explicit Aunt B pricing profile without changing manual save semantics', async () => {
    mocks.currentTenant = {
      id: 'tenant-aunt-b',
      pricingProfileId: 'aunt-bs-cleaning-services'
    };
    const onLeadSaved = vi.fn().mockResolvedValue({ id: 'lead-aunt-b-profile' });
    render(<AIPhotoEstimateSystem onLeadSaved={onLeadSaved} />);
    completeRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: 'Review & Generate Estimate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Manual Estimate' }));

    expect(await screen.findByRole('heading', { name: 'Estimate Results' })).toBeInTheDocument();
    expect(onLeadSaved).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        tenantPricingProfileId: 'aunt-bs-cleaning-services',
        priceLow: 190,
        priceSuggested: 205,
        priceHigh: 220,
        requiresManualReview: false,
        customerSummary: expect.stringContaining('3 bed / 2 bath')
      }),
      null
    );
    expect(onLeadSaved.mock.calls[0]).toHaveLength(3);
    expect(JSON.stringify(onLeadSaved.mock.calls)).not.toMatch(/booking|payment/i);
    expect(screen.queryByRole('button', { name: 'Proceed to Payment' })).not.toBeInTheDocument();
  });

  it('keeps the saved estimate successful and warns when notification reports failure', async () => {
    mocks.sendQuoteEmail.mockResolvedValue({ success: false, error: 'Failed to fetch' });
    const onLeadSaved = vi.fn().mockResolvedValue({ id: 'lead-notification-failed' });
    render(<AIPhotoEstimateSystem onLeadSaved={onLeadSaved} />);
    completeRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: 'Review & Generate Estimate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Manual Estimate' }));

    expect(await screen.findByRole('heading', { name: 'Estimate Results' })).toBeInTheDocument();
    expect(onLeadSaved).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Estimate saved successfully. Customer notification could not be sent. Please contact the customer manually for now.'
    );
    expect(screen.queryByText('Customer notification sent.')).not.toBeInTheDocument();
  });

  it('keeps the saved estimate successful when notification throws', async () => {
    mocks.sendQuoteEmail.mockRejectedValue(new Error('network unavailable'));
    const onLeadSaved = vi.fn().mockResolvedValue({ id: 'lead-notification-threw' });
    render(<AIPhotoEstimateSystem onLeadSaved={onLeadSaved} />);
    completeRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: 'Review & Generate Estimate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Manual Estimate' }));

    expect(await screen.findByRole('heading', { name: 'Estimate Results' })).toBeInTheDocument();
    expect(onLeadSaved).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Estimate saved successfully. Customer notification could not be sent.'
    );
  });

  it('shows conservative status when email delivery is unavailable', async () => {
    mocks.sendQuoteEmail.mockResolvedValue({ success: null, reason: 'not_configured' });
    const onLeadSaved = vi.fn().mockResolvedValue({ id: 'lead-notification-unknown' });
    render(<AIPhotoEstimateSystem onLeadSaved={onLeadSaved} />);
    completeRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: 'Review & Generate Estimate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Manual Estimate' }));

    expect(await screen.findByRole('heading', { name: 'Estimate Results' })).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Estimate saved successfully. Customer notification status could not be confirmed. Please contact the customer manually if needed.'
    );
  });

  it('disables optional browser AI analysis and keeps manual saving available', async () => {
    const onLeadSaved = vi.fn().mockResolvedValue({ id: 'lead-manual' });
    render(<AIPhotoEstimateSystem onLeadSaved={onLeadSaved} />);
    completeRequiredFields();

    const photo = new File(['photo'], 'kitchen.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Upload estimate photos'), {
      target: { files: [photo] }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Review & Generate Estimate' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'AI Analysis Unavailable' })).toBeDisabled());

    expect(screen.getByRole('status')).toHaveTextContent(
      'AI photo analysis is unavailable in this release. You can still save a manual estimate.'
    );
    expect(mocks.analyzePhotos).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save Manual Estimate' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Save Manual Estimate' }));
    expect(await screen.findByRole('heading', { name: 'Estimate Results' })).toBeInTheDocument();
    expect(onLeadSaved).toHaveBeenCalledTimes(1);
  });
});
