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

const secondCustomer = {
  id: 'customer-second',
  name: 'Second Customer',
  email: 'second@example.com',
  phone: '(417) 555-0200',
  address: '20 Customer Lane',
  city: 'Bolivar',
  state: 'MO',
  zip: '65613',
  notes: 'Second note'
};

describe('CustomerManagement restoration safety gate', () => {
  beforeEach(() => {
    Object.values(customerMocks).forEach(mock => mock.mockReset());
    customerMocks.getCustomers.mockResolvedValue({ success: true, data: [linkedCustomer, secondCustomer] });
    customerMocks.createCustomer.mockResolvedValue({ success: true });
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

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

  it('allows adding a unique customer through the active tenant service boundary', async () => {
    const { container } = render(<CustomerManagement />);

    expect(await screen.findByText('Linked Customer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Add Customer' }));

    fireEvent.change(container.querySelector('input[name="name"]'), {
      target: { value: 'Duplicate Check Unique 0630' }
    });
    fireEvent.change(container.querySelector('input[name="email"]'), {
      target: { value: 'unique.0630@example.com' }
    });
    fireEvent.change(container.querySelector('input[name="phone"]'), {
      target: { value: '417-555-0630' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Customer' }));

    await waitFor(() => {
      expect(customerMocks.createCustomer).toHaveBeenCalledWith(
        'tenant-test',
        expect.objectContaining({
          name: 'Duplicate Check Unique 0630',
          email: 'unique.0630@example.com',
          phone: '417-555-0630'
        })
      );
    });
  });

  it('blocks adding a same-tenant duplicate email with case and whitespace differences', async () => {
    const { container } = render(<CustomerManagement />);

    expect(await screen.findByText('Linked Customer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Add Customer' }));

    fireEvent.change(container.querySelector('input[name="name"]'), {
      target: { value: 'Duplicate Email Customer' }
    });
    fireEvent.change(container.querySelector('input[name="email"]'), {
      target: { value: '  LINKED@example.com  ' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Customer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Possible duplicate customer found. A customer with this email or phone already exists.'
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Existing customer: Linked Customer');
    expect(customerMocks.createCustomer).not.toHaveBeenCalled();
  });

  it('blocks adding a same-tenant duplicate phone with formatting differences', async () => {
    const { container } = render(<CustomerManagement />);

    expect(await screen.findByText('Linked Customer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Add Customer' }));

    fireEvent.change(container.querySelector('input[name="name"]'), {
      target: { value: 'Duplicate Phone Customer' }
    });
    fireEvent.change(container.querySelector('input[name="phone"]'), {
      target: { value: '(417) 555-0100' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Customer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Possible duplicate customer found. A customer with this email or phone already exists.'
    );
    expect(customerMocks.createCustomer).not.toHaveBeenCalled();
  });

  it('does not flag the edited customer as its own duplicate', async () => {
    const { container } = render(<CustomerManagement />);

    expect(await screen.findByText('Linked Customer')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    fireEvent.change(container.querySelector('input[name="name"]'), {
      target: { value: 'Linked Customer Updated' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Customer' }));

    await waitFor(() => {
      expect(customerMocks.updateCustomer).toHaveBeenCalledWith(
        'tenant-test',
        'customer-linked',
        expect.objectContaining({
          name: 'Linked Customer Updated',
          email: 'linked@example.com',
          phone: '4175550100'
        })
      );
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('blocks editing a customer to another customer email and does not call update', async () => {
    const { container } = render(<CustomerManagement />);

    expect(await screen.findByText('Second Customer')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
    fireEvent.change(container.querySelector('input[name="email"]'), {
      target: { value: ' linked@example.com ' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Customer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Possible duplicate customer found. A customer with this email or phone already exists.'
    );
    expect(customerMocks.updateCustomer).not.toHaveBeenCalled();
  });

  it('blocks editing a customer to another customer phone and does not call update', async () => {
    const { container } = render(<CustomerManagement />);

    expect(await screen.findByText('Second Customer')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
    fireEvent.change(container.querySelector('input[name="phone"]'), {
      target: { value: '+1 417 555 0100' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Customer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Possible duplicate customer found. A customer with this email or phone already exists.'
    );
    expect(customerMocks.updateCustomer).not.toHaveBeenCalled();
  });

  it('shows the safe-delete message and does not refresh as if deletion succeeded', async () => {
    render(<CustomerManagement />);

    expect(await screen.findByText('Linked Customer')).toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 0));
    customerMocks.getCustomers.mockClear();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    await waitFor(() => {
      expect(customerMocks.deleteCustomer).toHaveBeenCalledWith('tenant-test', 'customer-linked');
    });
    expect(window.alert).toHaveBeenCalledWith(
      'Customer deletion is disabled until linked records can be verified.'
    );
    expect(customerMocks.getCustomers).not.toHaveBeenCalled();
  });
});
