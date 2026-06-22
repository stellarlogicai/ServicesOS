# Stripe Testing Checklist

## Current Stripe Implementation

### Firebase Cloud Functions (functions/index.js)
- `createPaymentIntent` - Create a Stripe payment intent
- `createCheckoutSession` - Create a Stripe Checkout session for deposit payment
- `confirmPayment` - Confirm a payment
- `stripeWebhook` - Handle Stripe webhook events (payment_intent.succeeded, payment_intent.payment_failed, charge.refunded)
- `createStripeCustomer` - Create a Stripe customer for a tenant
- `createSubscription` - Create a subscription for a tenant
- `updateSubscription` - Update subscription tier
- `cancelSubscription` - Cancel subscription
- `getSubscription` - Get subscription details
- `subscriptionWebhook` - Handle subscription webhook events

### Frontend Components
- `PaymentForm.jsx` - Payment form component
- `PaymentLinks.jsx` - Payment links component
- `AICreditPurchase.jsx` - AI credit purchase component

## Testing Scenarios

### 1. Successful Payment Flow
- [ ] Create payment intent with valid amount
- [ ] Complete payment with valid card
- [ ] Verify payment_intent.succeeded webhook fires
- [ ] Verify lead status updates to 'paid'
- [ ] Verify payment amount recorded correctly
- [ ] Verify paymentIntentId stored in lead

### 2. Failed Payment Flow
- [ ] Create payment intent with valid amount
- [ ] Attempt payment with declined card
- [ ] Verify payment_intent.payment_failed webhook fires
- [ ] Verify lead status updates to 'failed'
- [ ] Verify paymentIntentId stored in lead
- [ ] Verify failedAt timestamp recorded

### 3. Refund Flow
- [ ] Process a successful payment first
- [ ] Issue full refund via Stripe dashboard
- [ ] Verify charge.refunded webhook fires
- [ ] Verify payment status updates to 'refunded'
- [ ] Verify refund amount recorded correctly
- [ ] Verify refundedAt timestamp recorded

### 4. Partial Refund Flow
- [ ] Process a successful payment first
- [ ] Issue partial refund via Stripe dashboard
- [ ] Verify charge.refunded webhook fires
- [ ] Verify payment status updates to 'refunded'
- [ ] Verify partial refund amount recorded correctly

### 5. Tip Payment Flow
- [ ] Create payment intent with base amount
- [ ] Add tip amount during payment
- [ ] Verify total amount includes tip
- [ ] Verify tip amount recorded separately (if supported)

### 6. Saved Card Flow
- [ ] Complete initial payment with card
- [ ] Save card for future use
- [ ] Create payment intent with saved card
- [ ] Verify payment processes without re-entering card details

### 7. Subscription Billing Flow
- [ ] Create Stripe customer for tenant
- [ ] Create subscription with valid price
- [ ] Verify customer.subscription.created webhook fires
- [ ] Verify tenant subscriptionId and tier updated
- [ ] Verify tenant status set to 'active'

### 8. Subscription Update Flow
- [ ] Update subscription to different tier
- [ ] Verify customer.subscription.updated webhook fires
- [ ] Verify tenant subscriptionTier updated
- [ ] Verify subscription status updated

### 9. Subscription Cancel Flow
- [ ] Cancel subscription
- [ ] Verify customer.subscription.deleted webhook fires
- [ ] Verify tenant subscriptionTier set to 'free'
- [ ] Verify tenant stripeSubscriptionId cleared
- [ ] Verify tenant status set to 'cancelled'
- [ ] Verify cancelledAt timestamp recorded

### 10. Invoice Payment Succeeded Flow
- [ ] Wait for subscription invoice to be generated
- [ ] Verify invoice.payment_succeeded webhook fires
- [ ] Verify payment recorded in tenant_billing collection
- [ ] Verify payment status set to 'paid'
- [ ] Verify paidAt timestamp recorded

### 11. Invoice Payment Failed Flow
- [ ] Force invoice payment failure (e.g., insufficient funds)
- [ ] Verify invoice.payment_failed webhook fires
- [ ] Verify failed payment recorded in tenant_billing collection
- [ ] Verify payment status set to 'failed'
- [ ] Verify failedAt timestamp recorded

### 12. Stripe Connect Scenarios (if implemented)
- [ ] Business onboarding flow
- [ ] Payout processing
- [ ] Disconnected account handling
- [ ] Verification failure handling

## Test Data Requirements

### Stripe Test Cards
- **Success Card**: 4242 4242 4242 4242
- **Decline Card**: 4000 0000 0000 0002
- **Insufficient Funds**: 4000 0025 0000 3155
- **Expired Card**: 4000 0000 0000 0069
- **CVC Failure**: 4000 0025 0000 3155

### Test Amounts
- Small amount: $10.00
- Medium amount: $100.00
- Large amount: $1000.00
- Tip amount: $5.00, $10.00

## Environment Variables Required

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SUBSCRIPTION_WEBHOOK_SECRET=whsec_...
APP_URL=http://localhost:5173
```

## Manual Testing Steps

### Setup
1. Ensure Firebase functions are deployed locally or to test environment
2. Configure Stripe webhook endpoints in Stripe dashboard
3. Set up test environment variables

### Execution
1. Run through each testing scenario
2. Document results in this checklist
3. Capture screenshots of Stripe dashboard
4. Verify Firestore database updates
5. Check webhook logs in Firebase functions

### Cleanup
1. Cancel test subscriptions
2. Refund test payments
3. Delete test customers
4. Clear test data from Firestore

## Known Issues / Notes

- Webhook signature verification requires proper secret configuration
- Payment intent metadata must include leadId for proper lead updates
- Subscription webhooks require tenantId in metadata for proper tenant updates
- Invoice webhooks require customerId lookup to find associated tenant

## Automation Opportunities

- Create automated tests using Stripe Test Mode API
- Mock webhook events for testing webhook handlers
- Create test fixtures for common payment scenarios
- Set up CI/CD pipeline with Stripe test environment
