# Stripe Connect Testing Guide

## Prerequisites

Before testing Stripe Connect, ensure you have:

1. **Stripe Account**
   - Stripe account in test mode
   - Stripe Secret Key (test mode)
   - Stripe Webhook Secret (test mode)
   - Stripe Publishable Key (test mode)

2. **Environment Variables**
   Set these in Firebase Functions environment:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_SUBSCRIPTION_WEBHOOK_SECRET=whsec_...
   APP_URL=http://localhost:5173 (or your deployed URL)
   ```

3. **Firebase Functions Deployed**
   - Deploy updated functions with Stripe Connect support
   - Verify webhook endpoints are accessible

## Testing Checklist

### Phase 1: Backend API Testing

#### Test 1: Create Connected Account
```bash
curl -X POST https://your-functions-url/api/stripe-connect/create-account \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "test-tenant-id",
    "businessEmail": "test@example.com",
    "businessName": "Test Cleaning Co"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "accountId": "acct_...",
  "message": "Connected account created successfully"
}
```

**Verify:**
- Account created in Stripe Dashboard (Test mode)
- Tenant document updated with stripeAccountId
- stripeAccountStatus set to "pending"

#### Test 2: Generate Onboarding Link
```bash
curl -X POST https://your-functions-url/api/stripe-connect/onboarding-link \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "test-tenant-id",
    "refreshUrl": "http://localhost:5173/settings",
    "returnUrl": "http://localhost:5173/settings"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "url": "https://connect.stripe.com/...",
  "accountId": "acct_..."
}
```

**Verify:**
- URL is valid Stripe Connect onboarding link
- Opens Stripe onboarding flow
- Can complete KYC verification

#### Test 3: Get Account Status
```bash
curl "https://your-functions-url/api/stripe-connect/account-status?tenantId=test-tenant-id"
```

**Expected Response:**
```json
{
  "accountId": "acct_...",
  "status": "pending" or "active",
  "chargesEnabled": false or true,
  "payoutsEnabled": false or true,
  "detailsSubmitted": false or true
}
```

**Verify:**
- Returns correct account status
- Reflects Stripe account state
- Updates after onboarding completion

### Phase 2: Payment Flow Testing

#### Test 4: Create Payment Intent with Connected Account
```bash
curl -X POST https://your-functions-url/api/create-payment-intent \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10000,
    "currency": "usd",
    "tenantId": "test-tenant-id",
    "metadata": {
      "customerId": "customer-123",
      "jobId": "job-456"
    }
  }'
```

**Expected Response:**
```json
{
  "clientSecret": "pi_...",
  "paymentIntentId": "pi_...",
  "stripeAccountId": "acct_...",
  "platformFee": 5.00,
  "platformFeePercentage": 5
}
```

**Verify:**
- Payment intent created on connected account
- Platform fee calculated correctly (5% for Professional tier)
- Platform fee amount correct ($5 on $100)

#### Test 5: Create Checkout Session with Connected Account
```bash
curl -X POST https://your-functions-url/api/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10000,
    "currency": "usd",
    "customerEmail": "customer@example.com",
    "customerName": "John Doe",
    "tenantId": "test-tenant-id",
    "metadata": {
      "address": "123 Main St",
      "jobId": "job-456"
    }
  }'
```

**Expected Response:**
```json
{
  "sessionId": "cs_...",
  "url": "https://checkout.stripe.com/...",
  "stripeAccountId": "acct_...",
  "platformFee": 5.00,
  "platformFeePercentage": 5
}
```

**Verify:**
- Checkout session created on connected account
- Platform fee applied correctly
- URL opens Stripe Checkout

#### Test 6: Create Subscription with Connected Account
```bash
curl -X POST https://your-functions-url/api/createSubscription \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cus_...",
    "priceId": "price_...",
    "tenantId": "test-tenant-id",
    "tier": "professional"
  }'
```

**Expected Response:**
```json
{
  "subscriptionId": "sub_...",
  "clientSecret": "pi_...",
  "status": "incomplete",
  "stripeAccountId": "acct_..."
}
```

**Verify:**
- Subscription created on connected account
- Application fee percentage applied (3% for Professional tier)
- Subscription status correct

### Phase 3: Webhook Testing

#### Test 7: Account Updated Webhook
1. Complete Stripe Connect onboarding in test mode
2. Wait for webhook to fire
3. Check tenant document in Firestore

**Verify:**
- stripeAccountStatus updated to "active"
- chargesEnabled set to true
- payoutsEnabled set to true
- onboardingProgress recalculated
- onboardingCompleted set to true (if all steps complete)

### Phase 4: Frontend Integration Testing

#### Test 8: Stripe Connect Onboarding Component
1. Navigate to Settings → Integrations
2. Verify Stripe Connect onboarding component loads
3. Click "Create Connected Account"
4. Verify account creation succeeds
5. Click "Generate Onboarding Link"
6. Verify link opens Stripe onboarding
7. Complete onboarding in Stripe
8. Verify account status updates to "Connected"

#### Test 9: Payment Flow in UI
1. Create a new quote/job
2. Add payment information
3. Process payment
4. Verify payment intent uses connected account
5. Verify platform fee deducted
6. Check Stripe Dashboard for transaction

#### Test 10: Onboarding Progress Display
1. Check tenant onboarding progress
2. Verify progress percentage calculated correctly
3. Verify onboardingCompleted field updates
4. Verify progress displays in dashboard (if implemented)

### Phase 5: Tiered Platform Fee Testing

#### Test 11: Starter Tier (5%)
```bash
# Set tenant subscriptionTier to "starter"
# Test payment with $100 amount
# Expected platform fee: $5
```

#### Test 12: Professional Tier (3%)
```bash
# Set tenant subscriptionTier to "professional"
# Test payment with $100 amount
# Expected platform fee: $3
```

#### Test 13: Enterprise Tier (1%)
```bash
# Set tenant subscriptionTier to "enterprise"
# Test payment with $100 amount
# Expected platform fee: $1
```

### Phase 6: Edge Cases

#### Test 14: Tenant Without Connected Account
```bash
# Test payment with tenant that has no stripeAccountId
# Expected: Falls back to platform account processing
```

#### Test 15: Invalid Tenant ID
```bash
# Test with non-existent tenantId
# Expected: Appropriate error handling
```

#### Test 16: Webhook Signature Verification
```bash
# Test webhook with invalid signature
# Expected: Webhook rejected
```

## Success Criteria

✅ All backend API endpoints return correct responses
✅ Stripe Connect onboarding flow completes successfully
✅ Payments process through connected accounts
✅ Platform fees calculated correctly for each tier
✅ Webhooks update tenant status correctly
✅ Frontend components integrate properly
✅ Onboarding progress tracks accurately
✅ Fallback to platform account works when needed

## Troubleshooting

### Common Issues

**Issue: Account creation fails**
- Verify Stripe Secret Key is correct
- Check Firebase Functions logs
- Ensure tenantId exists in Firestore

**Issue: Onboarding link doesn't work**
- Verify refreshUrl and returnUrl are valid
- Check APP_URL environment variable
- Ensure connected account exists

**Issue: Payments fail**
- Verify connected account is active
- Check chargesEnabled is true
- Verify platform fee calculation
- Check Stripe Dashboard for errors

**Issue: Webhooks not firing**
- Verify webhook endpoint is accessible
- Check webhook secrets match
- Ensure Stripe can reach your functions URL
- Check Firebase Functions logs

**Issue: Platform fee incorrect**
- Verify tenant subscriptionTier is set
- Check getPlatformFee function logic
- Verify fee calculation in payment functions

## Next Steps After Testing

1. **Fix any issues** discovered during testing
2. **Deploy to production** with live Stripe keys
3. **Monitor transactions** in Stripe Dashboard
4. **Track onboarding progress** of new tenants
5. **Gather feedback** from users on payment flow
6. **Optimize** based on real-world usage
