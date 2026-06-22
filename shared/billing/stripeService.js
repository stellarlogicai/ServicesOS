// src/shared/billing/stripeService.js
/**
 * Stripe Service for payment processing
 * Reusable across all SaaS platforms
 */

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
 * Create a payment intent
 * @param {number} amount - Amount in cents
 * @param {string} currency - Currency code (default 'usd')
 * @param {object} metadata - Payment metadata
 * @param {string} tenantId - Tenant ID for multi-tenant
 * @returns {Promise<Object>} Payment intent details
 */
export async function createPaymentIntent(amount, currency = 'usd', metadata = {}, tenantId = null) {
  try {
    // Get Firebase Functions URL
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
    const region = 'us-central1';
    const isLocal = import.meta.env.DEV;

    const functionUrl = isLocal
      ? 'http://127.0.0.1:5001/cleaning-intake-system/us-central1/createPaymentIntent'
      : `https://${region}-${projectId}.cloudfunctions.net/createPaymentIntent`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        currency,
        metadata: { ...metadata, tenantId }
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
      amount,
      currency
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
 * Create a Stripe Checkout session
 * @param {number} amount - Amount in cents
 * @param {string} currency - Currency code (default 'usd')
 * @param {object} metadata - Session metadata
 * @param {string} customerEmail - Customer email
 * @param {string} tenantId - Tenant ID for multi-tenant
 * @returns {Promise<Object>} Checkout session details
 */
export async function createCheckoutSession(amount, currency = 'usd', metadata = {}, customerEmail = '', tenantId = null) {
  try {
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
    const region = 'us-central1';
    const isLocal = import.meta.env.DEV;

    const functionUrl = isLocal
      ? 'http://127.0.0.1:5001/cleaning-intake-system/us-central1/createCheckoutSession'
      : `https://${region}-${projectId}.cloudfunctions.net/createCheckoutSession`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        currency,
        customerEmail,
        metadata: { ...metadata, tenantId }
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
      amount,
      currency
    };
  } catch (error) {
    console.error('[Stripe] Error creating checkout session:', error);
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

/**
 * Create subscription
 * @param {string} priceId - Stripe price ID
 * @param {string} customerEmail - Customer email
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Subscription details
 */
export async function createSubscription(priceId, customerEmail, tenantId) {
  try {
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
    const region = 'us-central1';
    const isLocal = import.meta.env.DEV;

    const functionUrl = isLocal
      ? 'http://127.0.0.1:5001/cleaning-intake-system/us-central1/createSubscription'
      : `https://${region}-${projectId}.cloudfunctions.net/createSubscription`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceId,
        customerEmail,
        tenantId
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create subscription');
    }

    return await response.json();
  } catch (error) {
    console.error('[Stripe] Error creating subscription:', error);
    throw error;
  }
}

/**
 * Cancel subscription
 * @param {string} subscriptionId - Stripe subscription ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Cancellation result
 */
export async function cancelSubscription(subscriptionId, tenantId) {
  try {
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
    const region = 'us-central1';
    const isLocal = import.meta.env.DEV;

    const functionUrl = isLocal
      ? 'http://127.0.0.1:5001/cleaning-intake-system/us-central1/cancelSubscription'
      : `https://${region}-${projectId}.cloudfunctions.net/cancelSubscription`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscriptionId,
        tenantId
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to cancel subscription');
    }

    return await response.json();
  } catch (error) {
    console.error('[Stripe] Error cancelling subscription:', error);
    throw error;
  }
}
