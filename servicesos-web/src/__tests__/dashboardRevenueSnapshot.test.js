import { describe, expect, it } from 'vitest';
import {
  bookingCollectedAmount,
  bookingExpectedAmount,
  calculateDashboardRevenueSnapshot,
} from '../services/dashboardRevenueSnapshot';

describe('dashboard revenue snapshot', () => {
  it('calculates expected, collected, and outstanding booking revenue', () => {
    const snapshot = calculateDashboardRevenueSnapshot([
      {
        id: 'stripe-paid',
        agreedPrice: 190,
        amountReceived: 190,
        paymentStatus: 'paid_in_full',
        paymentMethod: 'stripe',
        paymentStatusUpdatedBy: 'stripe_webhook',
      },
      {
        id: 'manual-partial',
        price: 300,
        amountReceived: 75,
        paymentStatus: 'partial',
        paymentMethod: 'cash',
      },
      {
        id: 'unpaid',
        agreedPrice: 250,
        amountReceived: 250,
        paymentStatus: 'not_paid',
      },
      {
        id: 'old-missing-payment-fields',
        totalAmount: 125,
      },
    ]);

    expect(snapshot).toEqual({
      expectedRevenue: 865,
      collectedRevenue: 265,
      outstandingBalance: 600,
    });
  });

  it('ignores invalid and unconfirmed received amounts', () => {
    expect(bookingExpectedAmount({ agreedPrice: '205' })).toBe(205);
    expect(bookingExpectedAmount({ agreedPrice: null, finalPrice: 'not-number' })).toBe(0);
    expect(bookingCollectedAmount({ amountReceived: 80, paymentStatus: 'deposit_requested' })).toBe(0);
    expect(bookingCollectedAmount({ amountReceived: '50', paymentStatus: 'deposit_paid' })).toBe(50);
    expect(bookingCollectedAmount({ amountReceived: 40, paymentMethod: 'venmo' })).toBe(40);
    expect(calculateDashboardRevenueSnapshot([{ agreedPrice: 100, amountReceived: 125, paymentStatus: 'paid_in_full' }]).outstandingBalance).toBe(0);
  });
});
