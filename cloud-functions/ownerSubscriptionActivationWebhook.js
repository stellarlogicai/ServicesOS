const { membershipContains, normalizedText } = require('./ownerOnboardingBootstrapGateway');
const { BILLING_PURPOSE } = require('./ownerOnboardingBillingGateway');
const { firestoreServerTimestamp } = require('./firebaseAdminCompat');
const { OPERATIONAL_SETUP_STATE } = require('./ownerOnboardingState');
const { configuredOwnerSubscriptionPrices, ownerSubscriptionIntervalForPrice } = require('./ownerSubscriptionPrices');

const BILLING_SCHEMA_VERSION = '1';
const CURE_SECONDS = 7 * 24 * 60 * 60;

class ActivationError extends Error {
  constructor(message = 'Owner subscription activation was rejected.', status = 409) {
    super(message);
    this.name = 'ActivationError';
    this.status = status;
  }
}

function objectId(value) {
  return normalizedText(typeof value === 'string' ? value : value?.id);
}

function subscriptionIdFromInvoice(invoice) {
  const parent = invoice?.parent;
  if (parent !== undefined && parent !== null) {
    if (parent.type !== 'subscription_details') return '';
    return objectId(parent.subscription_details?.subscription);
  }
  return objectId(invoice?.subscription);
}

function verifiedSubscriptionFacts({ invoice, subscription, priceIds }) {
  let canonicalPrices;
  try { canonicalPrices = configuredOwnerSubscriptionPrices(priceIds); } catch { throw new ActivationError(); }
  if (!invoice || invoice.status !== 'paid' || (invoice.paid !== undefined && invoice.paid !== true)) {
    throw new ActivationError();
  }
  const invoiceSubscriptionId = subscriptionIdFromInvoice(invoice);
  if (!invoiceSubscriptionId || subscription?.id !== invoiceSubscriptionId) throw new ActivationError();
  if (subscription.status !== 'active') throw new ActivationError();

  const tenantId = normalizedText(subscription.metadata?.tenantId);
  if (!tenantId || tenantId === 'DEFAULT' ||
    subscription.metadata?.billingPurpose !== BILLING_PURPOSE ||
    subscription.metadata?.onboardingSchemaVersion !== BILLING_SCHEMA_VERSION) throw new ActivationError();

  const customerId = objectId(subscription.customer);
  if (!customerId || objectId(invoice.customer) !== customerId) throw new ActivationError();
  const items = subscription.items?.data;
  const priceId = objectId(items?.[0]?.price);
  const billingInterval = ownerSubscriptionIntervalForPrice(canonicalPrices, priceId);
  if (!Array.isArray(items) || items.length !== 1 || !billingInterval || items[0]?.quantity !== 1 ||
    (subscription.metadata?.priceId !== undefined && subscription.metadata.priceId !== priceId) ||
    (subscription.metadata?.billingInterval !== undefined && subscription.metadata.billingInterval !== billingInterval)) {
    throw new ActivationError();
  }
  const currentPeriodEnd = Number.isSafeInteger(subscription.current_period_end)
    ? subscription.current_period_end
    : items[0]?.current_period_end;
  if (!Number.isSafeInteger(currentPeriodEnd) || currentPeriodEnd <= 0) throw new ActivationError();
  if (!normalizedText(invoice.id) || !Number.isSafeInteger(invoice.created) || invoice.created <= 0) throw new ActivationError();

  return {
    tenantId,
    customerId,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    subscriptionPriceId: priceId,
    billingInterval,
    currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    latestInvoiceId: invoice.id,
    latestInvoiceCreated: invoice.created,
  };
}

function ownerRelationshipIsValid({ tenant, owner }) {
  const ownerUid = normalizedText(tenant.onboardingOwnerUid);
  return Boolean(ownerUid && ownerUid !== 'DEFAULT' && owner &&
    owner.role === 'admin' && owner.status === 'active' && owner.tenantId === tenant.id &&
    membershipContains(tenant.adminUsers, ownerUid));
}

function lifecycleFacts(subscription, priceIds) {
  let canonicalPrices;
  try { canonicalPrices = configuredOwnerSubscriptionPrices(priceIds); } catch { throw new ActivationError(); }
  const tenantId = normalizedText(subscription?.metadata?.tenantId);
  const customerId = objectId(subscription?.customer);
  const items = subscription?.items?.data;
  const priceId = objectId(items?.[0]?.price);
  const billingInterval = ownerSubscriptionIntervalForPrice(canonicalPrices, priceId);
  if (!tenantId || tenantId === 'DEFAULT' || !customerId || !normalizedText(subscription?.id) ||
    subscription.metadata?.billingPurpose !== BILLING_PURPOSE ||
    subscription.metadata?.onboardingSchemaVersion !== BILLING_SCHEMA_VERSION ||
    !Array.isArray(items) || items.length !== 1 || !billingInterval || items[0]?.quantity !== 1 ||
    (subscription.metadata?.priceId !== undefined && subscription.metadata.priceId !== priceId) ||
    (subscription.metadata?.billingInterval !== undefined && subscription.metadata.billingInterval !== billingInterval)) throw new ActivationError();
  const currentPeriodEnd = Number.isSafeInteger(subscription.current_period_end)
    ? subscription.current_period_end : items[0]?.current_period_end;
  if (!Number.isSafeInteger(currentPeriodEnd) || currentPeriodEnd <= 0) throw new ActivationError();
  return { tenantId, customerId, subscriptionId: subscription.id, subscriptionPriceId: priceId, billingInterval, currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true };
}

async function applyOwnerSubscriptionLifecycle({ admin, subscription, priceIds, eventType, invoice, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const facts = lifecycleFacts(subscription, priceIds);
  if (eventType === 'invoice.payment_failed' &&
    (subscriptionIdFromInvoice(invoice) !== facts.subscriptionId ||
      objectId(invoice?.customer) !== facts.customerId ||
      !normalizedText(invoice?.id) || !Number.isSafeInteger(invoice?.created))) throw new ActivationError();
  const db = admin.firestore();
  const tenantRef = db.collection('tenants').doc(facts.tenantId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(tenantRef);
    if (!snapshot.exists) throw new ActivationError();
    const tenant = snapshot.data() || {};
    if (tenant.onboardingSchemaVersion !== 1 || tenant.stripeCustomerId !== facts.customerId ||
      tenant.stripeSubscriptionId !== facts.subscriptionId || tenant.subscriptionPriceId !== facts.subscriptionPriceId ||
      tenant.status !== 'active' || ![OPERATIONAL_SETUP_STATE, 'active'].includes(tenant.onboardingState)) {
      throw new ActivationError();
    }
    const ownerUid = normalizedText(tenant.onboardingOwnerUid);
    const ownerSnapshot = ownerUid ? await transaction.get(db.collection('users').doc(ownerUid)) : null;
    if (!ownerSnapshot?.exists ||
      !ownerRelationshipIsValid({ tenant: { ...tenant, id: facts.tenantId }, owner: ownerSnapshot.data() || {} })) {
      throw new ActivationError();
    }
    let patch;
    if (eventType === 'invoice.payment_failed') {
      if (Number.isSafeInteger(tenant.latestInvoiceCreated) && invoice.created < tenant.latestInvoiceCreated) return { stale: true };
      if (tenant.subscriptionStatus === 'canceled' || subscription.status === 'canceled') return { stale: true };
      const firstFailure = Number.isSafeInteger(tenant.paymentFailureAt) ? tenant.paymentFailureAt : nowSeconds;
      patch = {
        subscriptionStatus: 'past_due', paymentFailureAt: firstFailure,
        cureDeadline: firstFailure + CURE_SECONDS,
        latestInvoiceId: invoice.id, latestInvoiceCreated: invoice.created,
        currentPeriodEnd: facts.currentPeriodEnd, cancelAtPeriodEnd: facts.cancelAtPeriodEnd,
      };
    } else if (subscription.status === 'canceled' || eventType === 'customer.subscription.deleted') {
      if (subscription.status !== 'canceled') throw new ActivationError();
      patch = { subscriptionStatus: 'canceled', cancelAtPeriodEnd: false,
        currentPeriodEnd: facts.currentPeriodEnd, paymentFailureAt: null, cureDeadline: null };
    } else if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
      const firstFailure = Number.isSafeInteger(tenant.paymentFailureAt) ? tenant.paymentFailureAt : nowSeconds;
      patch = { subscriptionStatus: 'past_due', paymentFailureAt: firstFailure,
        cureDeadline: firstFailure + CURE_SECONDS, currentPeriodEnd: facts.currentPeriodEnd,
        cancelAtPeriodEnd: facts.cancelAtPeriodEnd };
    } else if (subscription.status === 'active') {
      if (tenant.subscriptionStatus === 'canceled') throw new ActivationError();
      patch = { currentPeriodEnd: facts.currentPeriodEnd, cancelAtPeriodEnd: facts.cancelAtPeriodEnd };
    } else {
      throw new ActivationError();
    }
    if (Object.entries(patch).every(([key, value]) => tenant[key] === value)) return { unchanged: true };
    transaction.update(tenantRef, { ...patch, billingUpdatedAt: firestoreServerTimestamp(admin) });
    return { updated: true };
  });
}

async function activateOwnerSubscription({ admin, invoice, subscription, priceIds }) {
  const facts = verifiedSubscriptionFacts({ invoice, subscription, priceIds });
  const db = admin.firestore();
  const tenantRef = db.collection('tenants').doc(facts.tenantId);

  return db.runTransaction(async transaction => {
    const tenantSnapshot = await transaction.get(tenantRef);
    if (!tenantSnapshot.exists) throw new ActivationError();
    const tenant = { id: facts.tenantId, ...(tenantSnapshot.data() || {}) };
    const ownerUid = normalizedText(tenant.onboardingOwnerUid);
    const ownerSnapshot = ownerUid
      ? await transaction.get(db.collection('users').doc(ownerUid))
      : null;
    if (tenant.onboardingSchemaVersion !== 1 || !ownerSnapshot?.exists ||
      !ownerRelationshipIsValid({ tenant, owner: ownerSnapshot.data() || {} }) ||
      tenant.stripeCustomerId !== facts.customerId) throw new ActivationError();

    const firstActivation = tenant.status === 'onboarding' && tenant.onboardingState === 'billing_required';
    const alreadyActive = tenant.status === 'active' &&
      [OPERATIONAL_SETUP_STATE, 'active'].includes(tenant.onboardingState);
    if (!firstActivation && !alreadyActive) throw new ActivationError();
    if (alreadyActive && (tenant.stripeSubscriptionId !== facts.subscriptionId ||
      tenant.subscriptionPriceId !== facts.subscriptionPriceId || tenant.stripeCustomerId !== facts.customerId)) {
      throw new ActivationError();
    }
    if (alreadyActive && tenant.subscriptionStatus === 'canceled') throw new ActivationError();
    if (Number.isSafeInteger(tenant.latestInvoiceCreated) && tenant.latestInvoiceCreated > facts.latestInvoiceCreated) {
      return { success: true, activated: false, stale: true };
    }

    const activationPatch = {
      stripeSubscriptionId: facts.subscriptionId,
      subscriptionStatus: facts.subscriptionStatus,
      subscriptionPriceId: facts.subscriptionPriceId,
      currentPeriodEnd: facts.currentPeriodEnd,
      cancelAtPeriodEnd: facts.cancelAtPeriodEnd,
      latestInvoiceId: facts.latestInvoiceId,
      latestInvoiceCreated: facts.latestInvoiceCreated,
      billingUpdatedAt: firestoreServerTimestamp(admin),
      status: 'active',
      ownerSubscriptionCheckout: null,
      paymentFailureAt: null,
      cureDeadline: null,
    };
    if (firstActivation) activationPatch.onboardingState = OPERATIONAL_SETUP_STATE;
    transaction.update(tenantRef, activationPatch);
    return { success: true, activated: firstActivation, stale: false };
  });
}

function createOwnerSubscriptionActivationWebhookHandler({ admin, getStripe, getWebhookSecret, getPriceIds }) {
  return async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    let event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.rawBody, req.headers?.['stripe-signature'], getWebhookSecret());
      const supported = ['invoice.paid', 'invoice.payment_failed', 'customer.subscription.updated', 'customer.subscription.deleted'];
      if (!supported.includes(event.type)) return res.status(200).json({ received: true });
      const eventObject = event.data?.object;
      const subscriptionId = event.type.startsWith('invoice.')
        ? subscriptionIdFromInvoice(eventObject) : normalizedText(eventObject?.id);
      if (!subscriptionId) return res.status(200).json({ received: true });
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (event.type === 'invoice.paid') {
        await activateOwnerSubscription({ admin, invoice: eventObject, subscription, priceIds: getPriceIds() });
      } else {
        let failureInvoice = event.type === 'invoice.payment_failed' ? eventObject : undefined;
        if (failureInvoice) {
          failureInvoice = await stripe.invoices.retrieve(failureInvoice.id);
          if (failureInvoice?.status === 'paid') return res.status(200).json({ received: true });
          if (failureInvoice?.status !== 'open' || failureInvoice?.id !== eventObject.id ||
            objectId(subscription.latest_invoice) !== failureInvoice.id) throw new ActivationError();
        }
        await applyOwnerSubscriptionLifecycle({ admin, subscription, priceIds: getPriceIds(),
          eventType: event.type, invoice: failureInvoice });
      }
      return res.status(200).json({ received: true });
    } catch (error) {
      if (error instanceof ActivationError) {
        return res.status(error.status).json({ error: 'Owner subscription activation was rejected.' });
      }
      return res.status(400).json({ error: 'Webhook verification failed.' });
    }
  };
}

module.exports = {
  ActivationError,
  activateOwnerSubscription,
  applyOwnerSubscriptionLifecycle,
  createOwnerSubscriptionActivationWebhookHandler,
  subscriptionIdFromInvoice,
  verifiedSubscriptionFacts,
};
