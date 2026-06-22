# Subscription Flow Testing Guide

This guide explains how to test the subscription flow using Stripe's test mode.

## Prerequisites

1. **Stripe Test Mode Enabled**
   - Go to Stripe Dashboard
   - Toggle "Test mode" in the left sidebar
   - Use test API keys (not live keys)

2. **Environment Variables**
   - Ensure `STRIPE_SECRET_KEY` is set to your test secret key (starts with `sk_test_`)
   - Ensure `STRIPE_WEBHOOK_SECRET` is set to your test webhook secret

## Test Cards

Use these Stripe test cards for testing different scenarios:

### Successful Payment
- **Card Number**: `4242 4242 4242 4242`
- **Expiry**: Any future date
- **CVC**: Any 3 digits
- **ZIP**: Any 5 digits

### Card Declined
- **Card Number**: `4000 0000 0000 0002`
- **Expiry**: Any future date
- **CVC**: Any 3 digits
- **ZIP**: Any 5 digits

### Insufficient Funds
- **Card Number**: `4000 0000 0000 9995`
- **Expiry**: Any future date
- **CVC**: Any 3 digits
- **ZIP**: Any 5 digits

### Card Requires Authentication (3D Secure)
- **Card Number**: `4000 0025 0000 3155`
- **Expiry**: Any future date
- **CVC**: Any 3 digits
- **ZIP**: Any 5 digits

## Testing Steps

### 1. Create a New Tenant (Super Admin)

1. Log in as a super-admin user
2. Navigate to "Tenant Management"
3. Click "Add New Tenant"
4. Fill in tenant details:
   - Company name
   - Admin email
   - Subscription tier (Starter, Professional, Enterprise)
5. Click "Create Tenant"

### 2. Test Subscription Creation

**Scenario A: New Subscription**

1. After creating a tenant, you should see a subscription created automatically
2. Check Stripe Dashboard → Subscriptions to verify:
   - Customer created
   - Subscription created with correct price
   - Status is `active`

**Scenario B: Upgrade Subscription**

1. Navigate to "Tenant Management"
2. Select a tenant
3. Change subscription tier to a higher tier
4. Verify in Stripe:
   - New subscription created
   - Old subscription cancelled
   - Proration calculated correctly

**Scenario C: Downgrade Subscription**

1. Navigate to "Tenant Management"
2. Select a tenant
3. Change subscription tier to a lower tier
4. Verify in Stripe:
   - Subscription updated at period end
   - Correct proration applied

### 3. Test Webhooks

1. In Stripe Dashboard → Webhooks
2. Add webhook endpoint: `https://your-project.cloudfunctions.net/stripeWebhook`
3. Select events to test:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Click "Send test webhook" for each event
5. Verify webhook handler processes correctly:
   - Check Firestore for subscription updates
   - Check logs in Firebase Functions console

### 4. Test Payment Failures

1. Use card `4000 0000 0000 0002` (declined)
2. Attempt to create a subscription
3. Verify:
   - Error message shown to user
   - Subscription not created
   - Retry mechanism works

### 5. Test Invoice Generation

1. Wait for subscription period to end (or manually trigger)
2. Verify invoice generated in Stripe
3. Check invoice includes:
   - Base subscription fee
   - Transaction fees (if applicable)
   - Prorations (if tier changed)

## Verification Checklist

- [ ] New tenant creates subscription correctly
- [ ] Subscription upgrade/downgrade works
- [ ] Webhooks are received and processed
- [ ] Firestore subscription data updated
- [ ] Feature flags work based on tier
- [ ] Payment failures handled gracefully
- [ ] Invoices generated correctly
- [ ] Prorations calculated accurately
- [ ] Transaction fees applied correctly

## Troubleshooting

### Webhook Not Received
- Check webhook URL is correct
- Verify webhook secret matches
- Check Firebase Functions logs

### Subscription Not Created
- Check Stripe API key is test key
- Verify price exists in Stripe
- Check Firebase Functions logs for errors

### Feature Flags Not Working
- Verify subscription tier in Firestore
- Check role-based access control
- Ensure feature flag logic is correct

## Clean Up

After testing:
1. Delete test customers from Stripe
2. Cancel test subscriptions
3. Remove test data from Firestore
4. Switch Stripe back to live mode when ready for production
