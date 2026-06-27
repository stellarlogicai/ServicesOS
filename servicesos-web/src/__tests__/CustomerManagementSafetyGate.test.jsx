// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const customerMocks = vi.hoisted(() => ({
  getCustomers: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn()
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ currentTenant: { id: 'tenant-test' } })
}));

vi.mock('../core/customers/customerService', () => customerMocks);

import CustomerManagement from '../components/CustomerManagement';

const linkedCustomer = {
  id: 'customer-linked',
  name: 'Linked Customer',
  email: 'linked@example.com',
  phone: '4175550100',
  address: '10 Customer Lane',
  city: 'Bolivar',
  state: 'MO',
  zip: '65613',
  notes: 'Existing note',
  authUid: 'auth-linked',
  propertyIds: ['property-1'],
  leadIds: ['lead-1'],
  bookingIds: ['booking-1']
};

describe('CustomerManagement restoration safety gate', () => {
  beforeEach(() => {
    Object.values(customerMocks).forEach(mock => mock.mockReset());
    customerMocks.getCustomers.mockResolvedValue({ success: true, data: [linkedCustomer] });
    customerMocks.updateCustomer.mockResolvedValue({ success: true });
    customerMocks.deleteCustomer.mockResolvedValue({
      success: false,
      message: 'Customer deletion is disabled until linked records can be verified.'
    });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('renders an explicit non-crashing state when customer loading is denied', async () => {
    customerMocks.getCustomers.mockResolvedValue({
      success: false,
      message: 'Missing or insufficient permissions.'
    });

    render(<CustomerManagement />);

    const errorState = await screen.findByRole('alert');
    expect(errorState).toHaveTextContent('Customers could not be loaded');
    expect(errorState).toHaveTextContent('Missing or insufficient permissions.');
    expect(screen.queryByText('No customers found')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
  });

  it('submits visible edits through the metadata-preserving customer service', async () => {
    const { container } = render(<CustomerManagement />);

    expect(await screen.findByText('Linked Customer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const nameInput = container.querySelector('input[name="name"]');
    expect(nameInput).not.toBeNull();
    fireEvent.change(nameInput, { target: { value: 'Updated Customer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Customer' }));

    await waitFor(() => {
      expect(customerMocks.updateCustomer).toHaveBeenCalledWith(
        'tenant-test',
        'customer-linked',
        expect.objectContaining({ name: 'Updated Customer' })
      );
    });
  });

  it('shows the safe-delete message and does not refresh as if deletion succeeded', async () => {
    render(<CustomerManagement />);

    expect(await screen.findByText('Linked Customer')).toBeInTheDocument();
    const loadCallsBeforeDelete = customerMocks.getCustomers.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(customerMocks.deleteCustomer).toHaveBeenCalledWith('tenant-test', 'customer-linked');
    });
    expect(window.alert).toHaveBeenCalledWith(
      'Customer deletion is disabled until linked records can be verified.'
    );
    expect(customerMocks.getCustomers).toHaveBeenCalledTimes(loadCallsBeforeDelete);
  });
});
