import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OwnerBillingPortalSection from '../components/OwnerBillingPortalSection';

describe('OwnerBillingPortalSection', () => {
  it('shows Manage billing and redirects only after a successful server response', async () => {
    let resolve;
    const openPortal = vi.fn().mockReturnValue(new Promise(value => { resolve = value; }));
    const redirect = vi.fn();
    const user = { uid: 'owner-a' };
    render(<OwnerBillingPortalSection user={user} openPortal={openPortal} redirect={redirect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Manage billing' }));
    expect(screen.getByRole('button', { name: 'Opening billing…' })).toBeDisabled();
    expect(openPortal).toHaveBeenCalledWith({ user });
    expect(redirect).not.toHaveBeenCalled();
    resolve('https://billing.stripe.com/p/session/test_fixture');
    await waitFor(() => expect(redirect).toHaveBeenCalledWith('https://billing.stripe.com/p/session/test_fixture'));
  });

  it('shows a recoverable safe error', async () => {
    const openPortal = vi.fn(() => { throw new Error('private Stripe detail'); });
    const redirect = vi.fn();
    render(<OwnerBillingPortalSection user={{ uid: 'owner-a' }} openPortal={openPortal} redirect={redirect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Manage billing' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Billing management could not be opened. Try again.');
    expect(screen.queryByText('private Stripe detail')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage billing' })).toBeEnabled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
