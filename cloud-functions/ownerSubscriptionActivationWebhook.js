const { membershipContains, normalizedText } = require('./ownerOnboardingBootstrapGateway');
const { BILLING_PURPOSE } = require('./ownerOnboardingBillingGateway');

const BILLING_SCHEMA_VERSION = '1';

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

function verifiedSubscriptionFacts({ invoice, subscription, priceId }) {
  if (!invoice || invoice.paid !== true || invoice.status !== 'paid') throw new ActivationError();
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
  if (!Array.isArray(items) || items.length !== 1 || objectId(items[0]?.price) !== priceId || items[0]?.quantity !== 1) {
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

async function activateOwnerSubscription({ admin, invoice, subscription, priceId }) {
  const facts = verifiedSubscriptionFacts({ invoice, subscription, priceId });
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
    const alreadyActive = tenant.status === 'active' && tenant.onboardingState === 'active';
    if (!firstActivation && !alreadyActive) throw new ActivationError();
    if (alreadyActive && (tenant.stripeSubscriptionId !== facts.subscriptionId ||
      tenant.subscriptionPriceId !== facts.subscriptionPriceId || tenant.stripeCustomerId !== facts.customerId)) {
      throw new ActivationError();
    }
    if (Number.isSafeInteger(tenant.latestInvoiceCreated) && tenant.latestInvoiceCreated > facts.latestInvoiceCreated) {
      return { success: true, activated: false, stale: true };
    }

    transaction.update(tenantRef, {
      stripeSubscriptionId: facts.subscriptionId,
      subscriptionStatus: facts.subscriptionStatus,
      subscriptionPriceId: facts.subscriptionPriceId,
      currentPeriodEnd: facts.currentPeriodEnd,
      cancelAtPeriodEnd: facts.cancelAtPeriodEnd,
      latestInvoiceId: facts.latestInvoiceId,
      latestInvoiceCreated: facts.latestInvoiceCreated,
      billingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'active',
      onboardingState: 'active',
      ownerSubscriptionCheckout: null,
    });
    return { success: true, activated: firstActivation, stale: false };
  });
}

function createOwnerSubscriptionActivationWebhookHandler({ admin, getStripe, getWebhookSecret, getPriceId }) {
  return async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    let event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.rawBody, req.headers?.['stripe-signature'], getWebhookSecret());
      if (event.type !== 'invoice.paid') return res.status(200).json({ received: true });
      const invoice = event.data?.object;
      const subscriptionId = subscriptionIdFromInvoice(invoice);
      if (!subscriptionId) return res.status(200).json({ received: true });
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await activateOwnerSubscription({ admin, invoice, subscription, priceId: normalizedText(getPriceId()) });
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
  createOwnerSubscriptionActivationWebhookHandler,
  subscriptionIdFromInvoice,
  verifiedSubscriptionFacts,
};
