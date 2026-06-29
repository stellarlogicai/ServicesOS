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
  sendQuoteEmail: mocks.sendQuoteEmail,
  sendPaymentConfirmationEmail: vi.fn()
}));
vi.mock('../services/notificationService', () => ({ sendSMS: mocks.sendSMS }));
vi.mock('../services/imageCompressionService', () => ({
  compressImages: mocks.compressImages
}));
vi.mock('../services/pdfService', () => ({ downloadQuotePDF: vi.fn() }));
vi.mock('../services/stripeService', () => ({ formatAmount: vi.fn() }));
vi.mock('../components/PaymentForm', () => ({ default: () => null }));
vi.mock('../components/PhotoGrid', () => ({ PhotoGrid: () => <div>Photo preview</div> }));

import AIPhotoEstimateSystem from '../AIPhotoEstimateSystem';

function completeRequiredFields() {
  fireEvent.change(screen.getByLabelText('First Name *'), { target: { value: 'Manual' } });
  fireEvent.change(screen.getByLabelText('Last Name *'), { target: { value: 'Customer' } });
  fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'manual@example.com' } });
  fireEvent.change(screen.getByLabelText('Phone *'), { target: { value: '555-0199' } });
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
    render(<AIPhotoEstimateSystem enablePayments={false} onLeadSaved={onLeadSaved} />);

    expect(screen.getByRole('heading', { name: 'Create Estimate' })).toBeInTheDocument();
    completeRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Review & Generate Estimate' }));

    expect(screen.getByRole('button', { name: 'Save Manual Estimate' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save Manual Estimate' }));

    expect(await screen.findByRole('heading', { name: 'Estimate Results' })).toBeInTheDocument();
    expect(onLeadSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Manual',
        lastName: 'Customer',
        email: 'manual@example.com',
        phone: '555-0199'
      }),
      expect.objectContaining({ priceLow: expect.any(Number), priceHigh: expect.any(Number), aiEnhanced: false }),
      null
    );
    expect(onLeadSaved.mock.calls[0]).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Proceed to Payment' })).not.toBeInTheDocument();
    expect(JSON.stringify(onLeadSaved.mock.calls)).not.toMatch(/booking|payment/i);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Estimate saved successfully. Customer notification sent.'
    );
  });

  it('uses an explicit Aunt B pricing profile without changing manual save semantics', async () => {
    mocks.currentTenant = {
      id: 'tenant-aunt-b',
      pricingProfileId: 'aunt-bs-cleaning-services'
    };
    const onLeadSaved = vi.fn().mockResolvedValue({ id: 'lead-aunt-b-profile' });
    render(<AIPhotoEstimateSystem enablePayments={false} onLeadSaved={onLeadSaved} />);
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
    render(<AIPhotoEstimateSystem enablePayments={false} onLeadSaved={onLeadSaved} />);
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
    render(<AIPhotoEstimateSystem enablePayments={false} onLeadSaved={onLeadSaved} />);
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
    render(<AIPhotoEstimateSystem enablePayments={false} onLeadSaved={onLeadSaved} />);
    completeRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: 'Review & Generate Estimate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Manual Estimate' }));

    expect(await screen.findByRole('heading', { name: 'Estimate Results' })).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Estimate saved successfully. Customer notification status could not be confirmed. Please contact the customer manually if needed.'
    );
  });

  it('keeps manual saving available after optional AI analysis fails', async () => {
    mocks.analyzePhotos.mockRejectedValue(new Error('AI unavailable'));
    const onLeadSaved = vi.fn().mockResolvedValue({ id: 'lead-manual' });
    render(<AIPhotoEstimateSystem enablePayments={false} onLeadSaved={onLeadSaved} />);
    completeRequiredFields();

    const photo = new File(['photo'], 'kitchen.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Upload estimate photos'), {
      target: { files: [photo] }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Review & Generate Estimate' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run AI Analysis' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Run AI Analysis' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'AI photo analysis is unavailable. You can still save a manual estimate.'
    );
    expect(screen.getByRole('button', { name: 'Save Manual Estimate' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Save Manual Estimate' }));
    expect(await screen.findByRole('heading', { name: 'Estimate Results' })).toBeInTheDocument();
    expect(onLeadSaved).toHaveBeenCalledTimes(1);
  });
});
