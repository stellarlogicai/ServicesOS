import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BusinessSettings from '../components/BusinessSettings';

const mocks = vi.hoisted(() => ({
  tenantId: 'tenant-a',
  getBusinessSettings: vi.fn(),
  saveBusinessSettings: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ currentTenant: mocks.tenantId ? { id: mocks.tenantId } : null }),
}));

vi.mock('../services/businessSettingsService', () => ({
  BUSINESS_DAYS: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
  getBusinessSettings: mocks.getBusinessSettings,
  saveBusinessSettings: mocks.saveBusinessSettings,
}));

const settings = {
  businessName: 'Aunt B Cleaning',
  businessPhone: '555-0100',
  businessEmail: 'owner@example.com',
  serviceArea: 'Bolivar, MO',
  availability: { availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] },
};

describe('BusinessSettings', () => {
  beforeEach(() => {
    mocks.tenantId = 'tenant-a';
    mocks.getBusinessSettings.mockReset().mockResolvedValue(settings);
    mocks.saveBusinessSettings.mockReset().mockImplementation(async (_tenantId, form) => form);
  });

  it('loads active-tenant business settings without unsafe fields', async () => {
    render(<BusinessSettings />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(await screen.findByDisplayValue('Aunt B Cleaning')).toBeInTheDocument();
    expect(mocks.getBusinessSettings).toHaveBeenCalledWith('tenant-a');
    expect(screen.getByLabelText('Monday')).toBeChecked();
    expect(screen.getByLabelText('Saturday')).not.toBeChecked();
    for (const unsafe of ['Stripe', 'Payment', 'Staff', 'Portal', 'Pricing', 'API key']) {
      expect(screen.queryByText(unsafe)).not.toBeInTheDocument();
    }
  });

  it('changes available days and saves only through the tenant service', async () => {
    render(<BusinessSettings />);
    await screen.findByDisplayValue('Aunt B Cleaning');
    fireEvent.click(screen.getByLabelText('Saturday'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Business Settings' }));

    await waitFor(() => expect(mocks.saveBusinessSettings).toHaveBeenCalledWith(
      'tenant-a',
      expect.objectContaining({ availability: { availableDays: expect.arrayContaining(['monday', 'saturday']) } }),
    ));
    expect(await screen.findByText('Business settings saved.')).toBeInTheDocument();
  });

  it('rejects an empty available-day selection', async () => {
    mocks.getBusinessSettings.mockResolvedValue({ ...settings, availability: { availableDays: ['monday'] } });
    render(<BusinessSettings />);
    await screen.findByDisplayValue('Aunt B Cleaning');
    fireEvent.click(screen.getByLabelText('Monday'));
    expect(screen.getByRole('button', { name: 'Save Business Settings' })).toBeDisabled();
    expect(mocks.saveBusinessSettings).not.toHaveBeenCalled();
  });

  it('shows an honest save failure without success', async () => {
    mocks.saveBusinessSettings.mockRejectedValue(new Error('permission-denied'));
    render(<BusinessSettings />);
    await screen.findByDisplayValue('Aunt B Cleaning');
    fireEvent.click(screen.getByRole('button', { name: 'Save Business Settings' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved');
    expect(screen.queryByText('Business settings saved.')).not.toBeInTheDocument();
  });

  it('requires an active tenant', async () => {
    mocks.tenantId = '';
    render(<BusinessSettings />);
    expect(await screen.findByRole('alert')).toHaveTextContent('tenant is unavailable');
    expect(mocks.getBusinessSettings).not.toHaveBeenCalled();
  });
});
