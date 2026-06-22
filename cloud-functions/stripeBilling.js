/**
 * Stripe Billing integration for subscription management
 * Handles subscription creation, updates, cancellation, and webhooks
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors')({ origin: true });

admin.initializeApp();

/**
 * Create a Stripe customer for a tenant
 */
exports.createStripeCustomer = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { email, name, tenantId } = req.body;

      const customer = await stripe.customers.create({
        email,
        name,
        metadata: { tenantId }
      });

      res.json({ customerId: customer.id });
    } catch (error) {
      console.error('[Stripe Billing] Error creating customer:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Create a subscription for a tenant
 */
exports.createSubscription = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { customerId, priceId, tenantId, tier } = req.body;

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        metadata: { tenantId, tier },
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent']
      });

      res.json({
        subscriptionId: subscription.id,
        clientSecret: subscription.latest_invoice.payment_intent.client_secret,
        status: subscription.status
      });
    } catch (error) {
      console.error('[Stripe Billing] Error creating subscription:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Update subscription tier
 */
exports.updateSubscription = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { subscriptionId, priceId, newTier } = req.body;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      
      // Update the subscription item
      await stripe.subscriptionItems.update(subscription.items.data[0].id, {
        price: priceId
      });

      // Update metadata
      await stripe.subscriptions.update(subscriptionId, {
        metadata: { ...subscription.metadata, tier: newTier }
      });

      res.json({ success: true });
    } catch (error) {
      console.error('[Stripe Billing] Error updating subscription:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Cancel subscription
 */
exports.cancelSubscription = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { subscriptionId } = req.body;

      const subscription = await stripe.subscriptions.cancel(subscriptionId);

      res.json({ success: true, status: subscription.status });
    } catch (error) {
      console.error('[Stripe Billing] Error cancelling subscription:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Get subscription details
 */
exports.getSubscription = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { subscriptionId } = req.query;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      res.json({
        id: subscription.id,
        status: subscription.status,
        tier: subscription.metadata.tier,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end
      });
    } catch (error) {
      console.error('[Stripe Billing] Error getting subscription:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Stripe webhook handler for subscription events
 */
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('[Stripe Webhook] Error verifying webhook signature:', err);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  const db = admin.firestore();

  try {
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object, db);
        break;
      
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object, db);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object, db);
        break;
      
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object, db);
        break;
      
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object, db);
        break;
      
      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Error processing webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Handle subscription created
 */
async function handleSubscriptionCreated(subscription, db) {
  const tenantId = subscription.metadata.tenantId;
  
  await db.collection('tenants').doc(tenantId).update({
    stripeSubscriptionId: subscription.id,
    subscriptionTier: subscription.metadata.tier,
    status: 'active',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log(`[Stripe Webhook] Subscription created for tenant ${tenantId}`);
}

/**
 * Handle subscription updated
 */
async function handleSubscriptionUpdated(subscription, db) {
  const tenantId = subscription.metadata.tenantId;
  
  await db.collection('tenants').doc(tenantId).update({
    subscriptionTier: subscription.metadata.tier,
    status: subscription.status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log(`[Stripe Webhook] Subscription updated for tenant ${tenantId}`);
}

/**
 * Handle subscription deleted/cancelled
 */
async function handleSubscriptionDeleted(subscription, db) {
  const tenantId = subscription.metadata.tenantId;
  
  await db.collection('tenants').doc(tenantId).update({
    subscriptionTier: 'free',
    stripeSubscriptionId: null,
    status: 'cancelled',
    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log(`[Stripe Webhook] Subscription cancelled for tenant ${tenantId}`);
}

/**
 * Handle successful invoice payment
 */
async function handleInvoicePaymentSucceeded(invoice, db) {
  const customerId = invoice.customer;
  
  // Find tenant by Stripe customer ID
  const tenantsSnapshot = await db.collection('tenants')
    .where('stripeCustomerId', '==', customerId)
    .get();

  if (!tenantsSnapshot.empty) {
    const tenantDoc = tenantsSnapshot.docs[0];
    const tenantId = tenantDoc.id;

    // Track payment for billing
    await db.collection('tenant_billing').add({
      tenantId,
      customerId,
      invoiceId: invoice.id,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: 'paid',
      paidAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`[Stripe Webhook] Invoice payment succeeded for tenant ${tenantId}`);
  }
}

/**
 * Handle failed invoice payment
 */
async function handleInvoicePaymentFailed(invoice, db) {
  const customerId = invoice.customer;
  
  const tenantsSnapshot = await db.collection('tenants')
    .where('stripeCustomerId', '==', customerId)
    .get();

  if (!tenantsSnapshot.empty) {
    const tenantDoc = tenantsSnapshot.docs[0];
    const tenantId = tenantDoc.id;

    // Track failed payment
    await db.collection('tenant_billing').add({
      tenantId,
      customerId,
      invoiceId: invoice.id,
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: 'failed',
      failedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Send notification about failed payment
    console.log(`[Stripe Webhook] Invoice payment failed for tenant ${tenantId}`);
  }
}
