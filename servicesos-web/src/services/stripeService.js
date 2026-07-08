/**
 * Stripe Service for payment processing
 */

import { calculateTransactionFee } from '../lib/subscriptionConfig';
import { getTenantSubscription } from './tenantService';
import { auth } from '../firebase';

let stripeInstance = null;

async function getStripe() {
  if (!stripeInstance) {
    const stripeModule = await import('@stripe/stripe-js');
    stripeInstance = await stripeModule.loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
  }
  return stripeInstance;
}

/**
 * Calculate deposit amount based on estimate range
 */
export function calculateDepositAmount(priceLow, priceHigh, percentage = 25) {
  const midPrice = (priceLow + priceHigh) / 2;
  return Math.round(midPrice * (percentage / 100) * 100); // Convert to cents
}

/**
 * Format amount for display
 */
export function formatAmount(amount) {
  return (amount / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD'
  });
}

/**
 * Validate card details
 */
export function validateCardDetails(cardElement) {
  if (!cardElement) {
    return { valid: false, error: 'Card element not found' };
  }
  return { valid: true };
}

/**
 * Create a payment intent for a quote
 * Calls Firebase Cloud Functions backend
 * @param {Object} estimate - Price estimate
 * @param {Object} formData - Customer form data
 * @param {number} depositPercentage - Deposit percentage (default 25%)
 * @returns {Promise<Object>} Payment intent details
 */
export async function createPaymentIntent(estimate, formData, depositPercentage = 25, tenantId = null) {
  try {
    // Calculate deposit amount in cents for display consistency
    const depositAmount = Math.round(((estimate.priceLow + estimate.priceHigh) / 2) * (depositPercentage / 100) * 100);
    
    // Calculate transaction fee based on tenant subscription
    let transactionFee = 0;
    let subscriptionTier = 'free';
    
    if (tenantId) {
      try {
        const subscription = await getTenantSubscription(tenantId);
        subscriptionTier = subscription.tier;
        transactionFee = Math.round(calculateTransactionFee(subscriptionTier, depositAmount));
      } catch (error) {
        console.error('[Stripe] Error getting subscription, using default tier:', error);
      }
    }
    
    // Total amount including transaction fee
    const totalAmount = depositAmount + transactionFee;

    // Get Firebase Functions URL
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
    const region = 'us-central1';
    const isLocal = import.meta.env.DEV;

    // Use local emulator in development, deployed functions in production
    const functionUrl = isLocal
      ? 'http://127.0.0.1:5001/cleaning-intake-system/us-central1/createPaymentIntent'
      : `https://${region}-${projectId}.cloudfunctions.net/createPaymentIntent`;

    console.log('[Stripe] Calling Firebase Function:', functionUrl);
    console.log('[Stripe] Deposit amount:', depositAmount, 'Transaction fee:', transactionFee, 'Total:', totalAmount);

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: totalAmount, // Send in cents (Stripe expects cents)
        currency: 'usd',
        metadata: {
          leadId: formData.leadId || `lead_${Date.now()}`,
          customerEmail: formData.email,
          customerName: `${formData.firstName} ${formData.lastName}`,
          address: formData.address,
          serviceType: formData.cleaningType,
          priceRange: `${estimate.priceLow}-${estimate.priceHigh}`,
          depositAmount: depositAmount,
          transactionFee: transactionFee,
          subscriptionTier: subscriptionTier,
          tenantId: tenantId
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create payment intent');
    }

    const { clientSecret, paymentIntentId } = await response.json();

    return {
      clientSecret,
      paymentIntentId,
      amount: totalAmount,
      depositAmount: depositAmount,
      transactionFee: transactionFee,
      subscriptionTier: subscriptionTier,
      currency: 'usd'
    };
  } catch (error) {
    console.error('[Stripe] Error creating payment intent:', error);
    throw error;
  }
}

/**
 * Process payment using Stripe Elements
 * @param {Object} cardElement - Stripe card element
 * @param {string} clientSecret - Payment intent client secret
 * @param {Object} billingDetails - Customer billing details
 * @returns {Promise<Object>} Payment result
 */
export async function processPayment(cardElement, clientSecret, billingDetails) {
  try {
    const stripe = await getStripe();

    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardElement,
        billing_details: billingDetails
      }
    });

    if (error) {
      console.error('[Stripe] Payment error:', error);
      return { success: false, error: error.message };
    }

    if (paymentIntent.status === 'succeeded') {
      console.log('[Stripe] Payment succeeded:', paymentIntent.id);
      return {
        success: true,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount
      };
    }

    return { success: false, error: 'Payment not completed' };
  } catch (error) {
    console.error('[Stripe] Error processing payment:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create a Stripe Checkout session for deposit payment
 * @param {Object} estimate - Price estimate
 * @param {Object} formData - Customer form data
 * @param {number} depositPercentage - Deposit percentage (default 25%)
 * @param {string} tenantId - Tenant ID for multi-tenant
 * @returns {Promise<Object>} Checkout session details
 */
export async function createCheckoutSession(estimate, formData, depositPercentage = 25, tenantId = null) {
  try {
    // Calculate deposit amount in cents
    const depositAmount = Math.round(((estimate.priceLow + estimate.priceHigh) / 2) * (depositPercentage / 100) * 100);
    
    // Calculate transaction fee based on tenant subscription
    let transactionFee = 0;
    let subscriptionTier = 'free';
    
    if (tenantId) {
      try {
        const subscription = await getTenantSubscription(tenantId);
        subscriptionTier = subscription.tier;
        transactionFee = Math.round(calculateTransactionFee(subscriptionTier, depositAmount));
      } catch (error) {
        console.error('[Stripe] Error getting subscription, using default tier:', error);
      }
    }
    
    // Total amount including transaction fee
    const totalAmount = depositAmount + transactionFee;

    // Get Firebase Functions URL
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
    const region = 'us-central1';
    const isLocal = import.meta.env.DEV;

    // Use local emulator in development, deployed functions in production
    const functionUrl = isLocal
      ? 'http://127.0.0.1:5001/cleaning-intake-system/us-central1/createCheckoutSession'
      : `https://${region}-${projectId}.cloudfunctions.net/createCheckoutSession`;

    console.log('[Stripe] Calling Checkout session function:', functionUrl);
    console.log('[Stripe] Deposit amount:', depositAmount, 'Transaction fee:', transactionFee, 'Total:', totalAmount);

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: totalAmount,
        currency: 'usd',
        customerEmail: formData.email,
        customerName: `${formData.firstName} ${formData.lastName}`,
        metadata: {
          leadId: formData.leadId || `lead_${Date.now()}`,
          address: formData.address,
          serviceType: formData.cleaningType,
          priceRange: `${estimate.priceLow}-${estimate.priceHigh}`,
          depositAmount: depositAmount,
          transactionFee: transactionFee,
          subscriptionTier: subscriptionTier,
          tenantId: tenantId
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create checkout session');
    }

    const { sessionId, url } = await response.json();

    return {
      sessionId,
      url,
      amount: totalAmount,
      depositAmount: depositAmount,
      transactionFee: transactionFee,
      subscriptionTier: subscriptionTier
    };
  } catch (error) {
    console.error('[Stripe] Error creating checkout session:', error);
    throw error;
  }
}

/**
 * Create a Stripe Checkout session for an existing booking.
 * This creates a pending Stripe checkout only. Payment is confirmed by webhook.
 */
export async function createBookingCheckoutSession(tenantId, bookingId) {
  try {
    if (!tenantId || !bookingId) {
      throw new Error('tenantId and bookingId are required');
    }

    const user = auth.currentUser;
    if (!user) {
      throw new Error('Authentication required');
    }

    const token = await user.getIdToken();
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
    const region = 'us-central1';
    const isLocal = import.meta.env.DEV;
    const functionUrl = isLocal
      ? 'http://127.0.0.1:5001/cleaning-intake-system/us-central1/createBookingCheckoutSession'
      : `https://${region}-${projectId}.cloudfunctions.net/createBookingCheckoutSession`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tenantId, bookingId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create booking checkout session');
    }

    const { sessionId, url, amount, currency, stripeAccountId, platformFee, platformFeePercentage } = await response.json();
    return {
      sessionId,
      url,
      amount,
      currency,
      stripeAccountId,
      platformFee,
      platformFeePercentage,
    };
  } catch (error) {
    console.error('[Stripe] Error creating booking checkout session:', error);
    throw error;
  }
}

/**
 * Redirect to Stripe Checkout
 * @param {string} sessionId - Checkout session ID
 */
export async function redirectToCheckout(sessionId) {
  try {
    const stripe = await getStripe();
    const { error } = await stripe.redirectToCheckout({ sessionId });
    
    if (error) {
      console.error('[Stripe] Checkout redirect error:', error);
      throw error;
    }
  } catch (error) {
    console.error('[Stripe] Error redirecting to checkout:', error);
    throw error;
  }
}
