import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerJobScopeAgreements, OwnerJobScopeAgreement } from '../components/JobScopeAgreement';

const mocks = vi.hoisted(() => ({ getOwner: vi.fn(), request: vi.fn(), list: vi.fn(), approve: vi.fn() }));
vi.mock('../services/jobScopeService', () => ({
  getOwnerJobScope: mocks.getOwner,
  requestCustomerScopeApproval: mocks.request,
  listCustomerJobScopes: mocks.list,
  approveCustomerJobScope: mocks.approve,
}));

const scope = (state = 'awaiting_approval') => ({
  version: 1, state, approvedAt: state === 'approved' ? '2026-09-12T12:00:00.000Z' : null,
  snapshot: { bookingId: 'booking-a', bookingType: 'residential', customerName: 'Customer', serviceLocation: '1 Main St', serviceType: 'Deep clean', schedule: { date: '2026-09-20', startTime: '09:00' }, price: 200, serviceItems: [{ id: 'task-a', label: 'Clean kitchen', required: true }], selectedAddOns: ['oven'], scopeNotes: '', accessInstructions: '', exclusions: '' },
});

describe('job scope agreement UI', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getOwner.mockResolvedValue(scope('draft')); mocks.list.mockResolvedValue([scope()]); });
  it('owner reviews canonical scope and requests customer approval without approving it', async () => {
    mocks.request.mockResolvedValue(scope());
    render(<OwnerJobScopeAgreement bookingId="booking-a" />);
    expect(await screen.findByText('Draft')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Request customer approval' }));
    expect(mocks.request).toHaveBeenCalledWith('booking-a');
    expect(await screen.findByText('Awaiting approval')).toBeInTheDocument();
  });
  it('customer explicitly approves the exact awaiting version', async () => {
    mocks.approve.mockResolvedValue(scope('approved'));
    render(<CustomerJobScopeAgreements />);
    await userEvent.click(await screen.findByRole('button', { name: 'I approve this service scope' }));
    expect(mocks.approve).toHaveBeenCalledWith('booking-a', 1);
    await waitFor(() => expect(screen.getByText('Approved')).toBeInTheDocument());
  });
});
