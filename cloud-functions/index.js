const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors')({ origin: true });
const {
  createBookingCheckoutSessionHandler,
  handleBookingCheckoutCompleted,
  handleBookingPaymentSucceeded,
} = require('./bookingStripe');
const {
  createConnectedAccountHandler,
  generateOnboardingLinkHandler,
  getConnectedAccountStatusHandler,
} = require('./connectStripe');
const {
  createSendCustomerEmailHandler,
} = require('./sendCustomerEmail');

admin.initializeApp();

// Platform fee percentage by subscription tier
const PLATFORM_FEE_PERCENTAGE = {
  starter: 0.05,      // 5%
  professional: 0.03, // 3%
  enterprise: 0.01,   // 1%
};

// Get platform fee for a tenant based on their subscription tier
const getPlatformFee = (subscriptionTier) => {
  return PLATFORM_FEE_PERCENTAGE[subscriptionTier] || PLATFORM_FEE_PERCENTAGE.professional;
};

exports.createBookingCheckoutSession = functions.https.onRequest(createBookingCheckoutSessionHandler({
  admin,
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  cors,
  getPlatformFee,
  secretKey: process.env.STRIPE_SECRET_KEY,
  stripe,
}));

/**
 * AI/ML Backend: Analyze cleaning photos for condition assessment
 * POST /api/analyze-image
 */
exports.analyzeImage = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { imageUrl, roomType } = req.body;

      if (!imageUrl) {
        return res.status(400).json({ error: 'Image URL is required' });
      }

      // Simulate AI analysis (in production, integrate with Google Cloud Vision API or similar)
      // This is a placeholder that returns mock analysis results
      const analysis = {
        roomType: roomType || 'unknown',
        cleanliness: Math.random() * 0.4 + 0.6, // 0.6 to 1.0
        clutterLevel: Math.random() * 0.5, // 0.0 to 0.5
        estimatedCleaningTime: Math.floor(Math.random() * 60) + 30, // 30-90 minutes
        detectedItems: ['furniture', 'flooring', 'walls'],
        confidence: 0.85,
        timestamp: new Date().toISOString()
      };

      // Calculate difficulty multiplier based on analysis
      const difficultyMultiplier = 1 + (analysis.clutterLevel * 0.5);
      const adjustedTime = Math.round(analysis.estimatedCleaningTime * difficultyMultiplier);

      res.json({
        analysis,
        adjustedCleaningTime: adjustedTime,
        difficultyLevel: analysis.clutterLevel > 0.3 ? 'high' : analysis.clutterLevel > 0.15 ? 'medium' : 'low'
      });
    } catch (error) {
      console.error('Image Analysis Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Custom Model Training Pipeline
 * POST /api/train-model
 */
exports.trainModel = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { tenantId, modelType = 'cleaning_time' } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'Tenant ID is required' });
      }

      // In production, this would:
      // 1. Fetch training data from ai_learning_data collection
      // 2. Preprocess the data (normalize, feature engineering)
      // 3. Train a model using TensorFlow.js or similar
      // 4. Evaluate model performance
      // 5. Save the model to storage

      // Simulate training process
      const trainingData = {
        samples: Math.floor(Math.random() * 500) + 100,
        epochs: Math.floor(Math.random() * 50) + 10,
        accuracy: 0.85 + Math.random() * 0.1,
        loss: 0.1 + Math.random() * 0.05
      };

      const modelMetrics = {
        modelId: `model_${Date.now()}`,
        tenantId,
        modelType,
        trainingData,
        createdAt: new Date().toISOString(),
        status: 'completed',
        performance: {
          mae: Math.random() * 0.5,
          rmse: Math.random() * 0.7,
          r2: 0.8 + Math.random() * 0.15
        }
      };

      // Save model metadata to Firestore
      const db = admin.firestore();
      await db.collection('tenants').doc(tenantId).collection('ai_models').add(modelMetrics);

      res.json({
        success: true,
        modelMetrics,
        message: 'Model training completed successfully'
      });
    } catch (error) {
      console.error('Model Training Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Create a Stripe Payment Intent (with Stripe Connect support)
 * POST /api/create-payment-intent
 */
exports.createPaymentIntent = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { amount, currency = 'usd', metadata = {}, tenantId } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }

      let stripeAccountId = null;
      let subscriptionTier = 'professional'; // default

      // Check if tenant has a connected Stripe account
      if (tenantId) {
        const db = admin.firestore();
        const tenantDoc = await db.collection('tenants').doc(tenantId).get();
        
        if (tenantDoc.exists) {
          const tenantData = tenantDoc.data();
          if (tenantData.stripeAccountId) {
            stripeAccountId = tenantData.stripeAccountId;
          }
          if (tenantData.subscriptionTier) {
            subscriptionTier = tenantData.subscriptionTier;
          }
        }
      }

      // Calculate platform fee based on subscription tier
      const platformFeePercentage = getPlatformFee(subscriptionTier);
      const platformFeeAmount = Math.round(amount * platformFeePercentage);

      // Create payment intent with or without connected account
      const paymentIntentParams = {
        amount: Math.round(amount),
        currency,
        metadata,
        automatic_payment_methods: {
          enabled: true
        }
      };

      // If using Stripe Connect, add application fee
      if (stripeAccountId) {
        paymentIntentParams.application_fee_amount = platformFeeAmount;
      }

      const paymentIntent = await stripe.paymentIntents.create(
        paymentIntentParams,
        stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
      );

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        stripeAccountId: stripeAccountId,
        platformFee: platformFeeAmount / 100,
        platformFeePercentage: platformFeePercentage * 100
      });
    } catch (error) {
      console.error('Payment Intent Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Create a Stripe Checkout session for deposit payment (with Stripe Connect support)
 * POST /api/create-checkout-session
 */
exports.createCheckoutSession = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { amount, currency = 'usd', customerEmail, customerName, metadata = {}, tenantId } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }

      let stripeAccountId = null;
      let subscriptionTier = 'professional'; // default

      // Check if tenant has a connected Stripe account
      if (tenantId) {
        const db = admin.firestore();
        const tenantDoc = await db.collection('tenants').doc(tenantId).get();
        
        if (tenantDoc.exists) {
          const tenantData = tenantDoc.data();
          if (tenantData.stripeAccountId) {
            stripeAccountId = tenantData.stripeAccountId;
          }
          if (tenantData.subscriptionTier) {
            subscriptionTier = tenantData.subscriptionTier;
          }
        }
      }

      // Calculate platform fee based on subscription tier
      const platformFeePercentage = getPlatformFee(subscriptionTier);
      const platformFeeAmount = Math.round(amount * platformFeePercentage);

      // Create Stripe Checkout session params
      const sessionParams = {
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency,
            product_data: {
              name: 'Cleaning Service Deposit',
              description: `Deposit for cleaning service at ${metadata.address || 'your location'}`,
            },
            unit_amount: Math.round(amount),
          },
          quantity: 1,
        }],
        mode: 'payment',
        customer_email: customerEmail,
        success_url: `${process.env.APP_URL || 'http://localhost:5173'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.APP_URL || 'http://localhost:5173'}/payment-cancelled`,
        metadata: {
          ...metadata,
          customerName: customerName || '',
          tenantId: tenantId || ''
        }
      };

      // If using Stripe Connect, add application fee
      if (stripeAccountId) {
        sessionParams.payment_intent_data = {
          application_fee_amount: platformFeeAmount
        };
      }

      const session = await stripe.checkout.sessions.create(
        sessionParams,
        stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
      );

      res.json({
        sessionId: session.id,
        url: session.url,
        stripeAccountId: stripeAccountId,
        platformFee: platformFeeAmount / 100,
        platformFeePercentage: platformFeePercentage * 100
      });
    } catch (error) {
      console.error('Checkout Session Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Confirm a payment
 * POST /api/confirm-payment
 */
exports.confirmPayment = functions.https.onRequest(async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

    try {
      const { paymentIntentId } = req.body;

      if (!paymentIntentId) {
        return res.status(400).json({ error: 'Payment intent ID required' });
      }

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      res.json({ 
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100
      });
    } catch (error) {
      console.error('Confirm Payment Error:', error);
      res.status(500).json({ error: error.message });
    }
});

/**
 * Stripe Webhook Handler (with Stripe Connect support)
 * POST /api/webhooks/stripe
 */
exports.stripeWebhook = functions.runWith({ invoker: 'public' }).https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', {
      message: err.message,
      hasSignature: Boolean(sig),
      hasWebhookSecret: Boolean(webhookSecret),
      hasRawBody: Boolean(req.rawBody),
      rawBodyLength: req.rawBody?.length || 0,
    });
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleBookingCheckoutCompleted(session, {
          admin,
          nowIso: new Date().toISOString(),
        });
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        await handlePaymentSucceeded(paymentIntent);
        break;
      }

      case 'payment_intent.payment_failed': {
        const failedPayment = event.data.object;
        await handlePaymentFailed(failedPayment);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        await handleRefund(charge);
        break;
      }

      // Stripe Connect events
      case 'account.updated': {
        const account = event.data.object;
        await handleAccountUpdated(account);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(paymentIntent) {
  const bookingPaymentResult = await handleBookingPaymentSucceeded(paymentIntent, {
    admin,
    nowIso: new Date().toISOString(),
  });
  if (bookingPaymentResult.handled) {
    return;
  }

  const { metadata, amount, id } = paymentIntent;
  const leadId = metadata.leadId;

  if (!leadId) {
    console.log('No lead ID in payment intent metadata');
    return;
  }

  try {
    // Update lead in Firestore with payment status
    const db = admin.firestore();
    const leadRef = db.collection('leads').doc(leadId);
    
    await leadRef.update({
      'payment.status': 'succeeded',
      'payment.amount': amount / 100,
      'payment.paymentIntentId': id,
      'payment.paidAt': admin.firestore.FieldValue.serverTimestamp(),
      status: 'paid'
    });

    console.log(`Payment succeeded for lead ${leadId}`);
  } catch (error) {
    console.error('Error updating lead payment status:', error);
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(paymentIntent) {
  const { metadata, id } = paymentIntent;
  const leadId = metadata.leadId;

  if (!leadId) {
    console.log('No lead ID in payment intent metadata');
    return;
  }

  try {
    const db = admin.firestore();
    const leadRef = db.collection('leads').doc(leadId);
    
    await leadRef.update({
      'payment.status': 'failed',
      'payment.paymentIntentId': id,
      'payment.failedAt': admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`Payment failed for lead ${leadId}`);
  } catch (error) {
    console.error('Error updating lead payment status:', error);
  }
}

/**
 * Handle refund
 */
async function handleRefund(charge) {
  const { payment_intent, amount } = charge;

  try {
    const db = admin.firestore();
    const leadsRef = db.collection('leads');
    
    const snapshot = await leadsRef
      .where('payment.paymentIntentId', '==', payment_intent)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const leadDoc = snapshot.docs[0];
      await leadDoc.ref.update({
        'payment.status': 'refunded',
        'payment.refundAmount': amount / 100,
        'payment.refundedAt': admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`Refund processed for payment intent ${payment_intent}`);
    }
  } catch (error) {
    console.error('Error processing refund:', error);
  }
}

/**
 * Handle Stripe Connect account updated event
 */
async function handleAccountUpdated(account) {
  try {
    const db = admin.firestore();
    
    // Find tenant by stripeAccountId
    const tenantsRef = db.collection('tenants');
    const snapshot = await tenantsRef
      .where('stripeAccountId', '==', account.id)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const tenantDoc = snapshot.docs[0];
      const status = account.details_submitted ? 'active' : 'pending';
      
      // Calculate onboarding progress
      const tenantData = tenantDoc.data();
      const onboardingProgress = calculateOnboardingProgress(tenantData);
      const onboardingCompleted = onboardingProgress >= 100;
      
      await tenantDoc.ref.update({
        stripeAccountStatus: status,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        stripeAccountUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        onboardingProgress: onboardingProgress,
        onboardingCompleted: onboardingCompleted
      });

      console.log(`Stripe Connect account ${account.id} updated for tenant ${tenantDoc.id}, status: ${status}, onboarding: ${onboardingProgress}%`);
    }
  } catch (error) {
    console.error('Error handling account updated event:', error);
  }
}

/**
 * Calculate tenant onboarding progress percentage
 */
function calculateOnboardingProgress(tenantData) {
  let completedSteps = 0;
  const totalSteps = 6; // Company, Stripe, Services, Branding, Employees, Customers

  // Company created
  if (tenantData.businessName) completedSteps++;

  // Stripe connected
  if (tenantData.stripeAccountId && tenantData.chargesEnabled) completedSteps++;

  // Services configured
  if (tenantData.services && tenantData.services.length > 0) completedSteps++;

  // Branding added
  if (tenantData.branding && (tenantData.branding.logo || tenantData.branding.primaryColor)) completedSteps++;

  // Employees added
  if (tenantData.employees && tenantData.employees.length > 0) completedSteps++;

  // Customers imported or created
  if (tenantData.customerCount > 0) completedSteps++;

  return Math.round((completedSteps / totalSteps) * 100);
}

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
 * Create a subscription for a tenant (with Stripe Connect support)
 */
exports.createSubscription = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { customerId, priceId, tenantId, tier } = req.body;

      let stripeAccountId = null;
      let subscriptionTier = tier || 'professional'; // default

      // Check if tenant has a connected Stripe account
      if (tenantId) {
        const db = admin.firestore();
        const tenantDoc = await db.collection('tenants').doc(tenantId).get();
        
        if (tenantDoc.exists) {
          const tenantData = tenantDoc.data();
          if (tenantData.stripeAccountId) {
            stripeAccountId = tenantData.stripeAccountId;
          }
          if (tenantData.subscriptionTier) {
            subscriptionTier = tenantData.subscriptionTier;
          }
        }
      }

      // For subscriptions, platform fees are handled differently
      // We'll use application_fee_percent on the subscription
      const subscriptionParams = {
        customer: customerId,
        items: [{ price: priceId }],
        metadata: { tenantId, tier: subscriptionTier },
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent']
      };

      // If using Stripe Connect, add application fee percentage
      if (stripeAccountId) {
        const platformFeePercentage = getPlatformFee(subscriptionTier);
        subscriptionParams.application_fee_percent = Math.round(platformFeePercentage * 100); // 5% = 500 basis points
      }

      const subscription = await stripe.subscriptions.create(
        subscriptionParams,
        stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
      );

      res.json({
        subscriptionId: subscription.id,
        clientSecret: subscription.latest_invoice.payment_intent.client_secret,
        status: subscription.status,
        stripeAccountId: stripeAccountId
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
 * Stripe Connect: Create a connected account for a tenant
 * POST /createConnectedAccount
 */
exports.createConnectedAccount = functions.https.onRequest((req, res) => {
  return createConnectedAccountHandler({
    admin,
    secretKey: process.env.STRIPE_SECRET_KEY,
    stripe,
  })(req, res);
});

/**
 * Stripe Connect: Generate onboarding link for connected account
 * POST /generateOnboardingLink
 */
exports.generateOnboardingLink = functions.https.onRequest((req, res) => {
  return generateOnboardingLinkHandler({
    admin,
    appUrl: process.env.APP_URL || 'http://localhost:5173',
    stripe,
  })(req, res);
});

/**
 * Stripe Connect: Get connected account status
 * GET /getConnectedAccountStatus?tenantId=xxx
 */
exports.getConnectedAccountStatus = functions.https.onRequest((req, res) => {
  return getConnectedAccountStatusHandler({ admin, stripe })(req, res);
});

/**
 * Send customer email via Resend
 * POST /sendCustomerEmail
 */
exports.sendCustomerEmail = functions.https.onRequest(
  createSendCustomerEmailHandler({ admin, cors })
);

/**
 * Stripe webhook handler for subscription events
 */
exports.subscriptionWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('[Subscription Webhook] Error verifying webhook signature:', err);
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
        console.log(`[Subscription Webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[Subscription Webhook] Error processing webhook:', error);
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

  console.log(`[Subscription Webhook] Subscription created for tenant ${tenantId}`);
}

/**
 * Handle subscription updated
 */
async function handleSubscriptionUpdated(subscription, db) {
  const tenantId = subscription.metadata.tier;
  
  await db.collection('tenants').doc(tenantId).update({
    subscriptionTier: subscription.metadata.tier,
    status: subscription.status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log(`[Subscription Webhook] Subscription updated for tenant ${tenantId}`);
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

  console.log(`[Subscription Webhook] Subscription cancelled for tenant ${tenantId}`);
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

    console.log(`[Subscription Webhook] Invoice payment succeeded for tenant ${tenantId}`);
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
    console.log(`[Subscription Webhook] Invoice payment failed for tenant ${tenantId}`);
  }
}

/**
 * Employee Mobile API Endpoints
 * These endpoints support the React Native employee app
 */

/**
 * GET /employee/jobs - Get today's jobs for an employee
 */
exports.getEmployeeJobs = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { employeeId, tenantId } = req.query;

    if (!employeeId || !tenantId) {
      return res.status(400).json({ error: 'employeeId and tenantId are required' });
    }

    const db = admin.firestore();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const jobsSnapshot = await db.collection('tenants').doc(tenantId)
      .collection('jobs')
      .where('assignedEmployeeId', '==', employeeId)
      .where('scheduledDate', '>=', today.toISOString())
      .where('scheduledDate', '<', tomorrow.toISOString())
      .where('status', '==', 'scheduled')
      .get();

    const jobs = jobsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({ jobs });
  } catch (error) {
    console.error('[Employee API] Error getting jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /employee/job/:id - Get job details
 */
exports.getEmployeeJob = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobId, tenantId } = req.query;

    if (!jobId || !tenantId) {
      return res.status(400).json({ error: 'jobId and tenantId are required' });
    }

    const db = admin.firestore();
    const jobDoc = await db.collection('tenants').doc(tenantId)
      .collection('jobs')
      .doc(jobId)
      .get();

    if (!jobDoc.exists) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ job: { id: jobDoc.id, ...jobDoc.data() } });
  } catch (error) {
    console.error('[Employee API] Error getting job:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /employee/checkin - Employee check-in for a job
 */
exports.employeeCheckIn = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobId, tenantId, employeeId, location } = req.body;

    if (!jobId || !tenantId || !employeeId) {
      return res.status(400).json({ error: 'jobId, tenantId, and employeeId are required' });
    }

    const db = admin.firestore();
    const jobRef = db.collection('tenants').doc(tenantId).collection('jobs').doc(jobId);

    await jobRef.update({
      status: 'in-progress',
      checkInTime: admin.firestore.FieldValue.serverTimestamp(),
      checkInLocation: location || null,
      checkInEmployeeId: employeeId
    });

    res.json({ success: true, message: 'Checked in successfully' });
  } catch (error) {
    console.error('[Employee API] Error checking in:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /employee/checkout - Employee check-out from a job
 */
exports.employeeCheckOut = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobId, tenantId, employeeId, location, notes, duration } = req.body;

    if (!jobId || !tenantId || !employeeId) {
      return res.status(400).json({ error: 'jobId, tenantId, and employeeId are required' });
    }

    const db = admin.firestore();
    const jobRef = db.collection('tenants').doc(tenantId).collection('jobs').doc(jobId);

    await jobRef.update({
      status: 'completed',
      checkOutTime: admin.firestore.FieldValue.serverTimestamp(),
      checkOutLocation: location || null,
      checkOutEmployeeId: employeeId,
      completionNotes: notes || null,
      actualDuration: duration || null
    });

    res.json({ success: true, message: 'Checked out successfully' });
  } catch (error) {
    console.error('[Employee API] Error checking out:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /employee/photos - Upload job photos
 */
exports.uploadJobPhotos = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobId, tenantId, employeeId, photos } = req.body;

    if (!jobId || !tenantId || !employeeId || !photos || !Array.isArray(photos)) {
      return res.status(400).json({ error: 'jobId, tenantId, employeeId, and photos array are required' });
    }

    const db = admin.firestore();
    const jobRef = db.collection('tenants').doc(tenantId).collection('jobs').doc(jobId);

    // Add photos to job document
    const photoRecords = photos.map((photo, index) => ({
      url: photo.url,
      caption: photo.caption || '',
      uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
      uploadedBy: employeeId,
      order: index
    }));

    await jobRef.update({
      photos: admin.firestore.FieldValue.arrayUnion(...photoRecords)
    });

    res.json({ success: true, message: 'Photos uploaded successfully' });
  } catch (error) {
    console.error('[Employee API] Error uploading photos:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /employee/signature - Upload customer signature
 */
exports.uploadSignature = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobId, tenantId, employeeId, signatureData, customerName } = req.body;

    if (!jobId || !tenantId || !employeeId || !signatureData) {
      return res.status(400).json({ error: 'jobId, tenantId, employeeId, and signatureData are required' });
    }

    const db = admin.firestore();
    const jobRef = db.collection('tenants').doc(tenantId).collection('jobs').doc(jobId);

    await jobRef.update({
      signature: {
        data: signatureData,
        customerName: customerName || '',
        signedAt: admin.firestore.FieldValue.serverTimestamp(),
        signedBy: employeeId
      }
    });

    res.json({ success: true, message: 'Signature uploaded successfully' });
  } catch (error) {
    console.error('[Employee API] Error uploading signature:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /employee/payment - Record payment collected by employee
 */
exports.recordEmployeePayment = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobId, tenantId, employeeId, amount, paymentMethod, tipAmount } = req.body;

    if (!jobId || !tenantId || !employeeId || !amount) {
      return res.status(400).json({ error: 'jobId, tenantId, employeeId, and amount are required' });
    }

    const db = admin.firestore();
    
    // Record payment
    const paymentRef = await db.collection('tenants').doc(tenantId).collection('payments').add({
      jobId,
      amount: parseFloat(amount),
      tipAmount: tipAmount ? parseFloat(tipAmount) : 0,
      paymentMethod: paymentMethod || 'cash',
      collectedBy: employeeId,
      collectedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'completed'
    });

    // Update job status
    await db.collection('tenants').doc(tenantId).collection('jobs').doc(jobId).update({
      paymentStatus: 'paid',
      paymentId: paymentRef.id
    });

    res.json({ success: true, message: 'Payment recorded successfully', paymentId: paymentRef.id });
  } catch (error) {
    console.error('[Employee API] Error recording payment:', error);
    res.status(500).json({ error: error.message });
  }
});
