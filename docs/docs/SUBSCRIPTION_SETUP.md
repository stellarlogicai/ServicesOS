# Subscription Billing System Setup

## Overview
Complete hybrid subscription + transaction fee billing system (Option C) implemented for multi-tenant SaaS platform.

## Subscription Tiers

### Free Tier
- **Monthly Price:** $0
- **Transaction Fee:** 3%
- **Limits:**
  - 10 quotes/month
  - 0 payments/month (no payment processing)
  - 0 SMS/month
  - 5 AI analyses/month
  - 1 user
  - 1 location
- **Features:** Quote generation, appointment scheduling, email notifications, AI photo analysis

### Professional Tier
- **Monthly Price:** $99
- **Transaction Fee:** 1%
- **Limits:**
  - Unlimited quotes
  - Unlimited payments
  - 100 SMS/month
  - Unlimited AI analyses
  - 3 users
  - 1 location
- **Features:** All Free features + payment processing, SMS notifications, analytics

### Enterprise Tier
- **Monthly Price:** $299
- **Transaction Fee:** 0.5%
- **Limits:** Unlimited everything
- **Features:** All Pro features + custom branding, API access, multi-location, priority support

## Architecture

### 1. Subscription Configuration (`src/lib/subscriptionConfig.js`)
- Defines tier pricing, features, and limits
- Helper functions for feature checking and fee calculation
- Usage limit validation

### 2. Usage Tracking Service (`src/services/usageTrackingService.js`)
- Tracks quotes, payments, SMS, AI analysis per tenant/month
- Automatic monthly reset
- Usage limit checking before actions
- Billing summaries for monthly invoicing

### 3. Tenant Management Service (`src/services/tenantService.js`)
- Multi-tenant setup (cleaning companies)
- Subscription tier management
- Stripe customer/subscription ID tracking
- Custom branding settings
- Feature access checking

### 4. Stripe Billing Integration (`functions/stripeBilling.js`)
- Create Stripe customers
- Create/update/cancel subscriptions
- Webhook handlers for subscription events
- Automatic tenant tier updates via webhooks
- Payment success/failure tracking

### 5. Firebase Security Rules (`firestore.rules`)
- Multi-tenant data isolation
- Admin vs user access control
- Tenant-specific read/write permissions
- Billing collection protection

### 6. Feature Flags Hook (`src/hooks/useSubscriptionFeatures.js`)
- React hook for subscription-based feature access
- Real-time subscription status checking
- Usage limit validation
- Transaction fee calculation

### 7. Payment Flow Integration (`src/services/stripeService.js`)
- Automatic transaction fee calculation based on tier
- Deposit amount + transaction fee = total charged
- Metadata includes fee breakdown for tracking
- Returns fee information for display

## Database Schema

### tenants Collection
```
{
  id: string,
  businessName: string,
  businessEmail: string,
  businessPhone: string,
  subscriptionTier: 'free' | 'pro' | 'enterprise',
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  status: 'active' | 'cancelled' | 'past_due',
  adminUsers: string[],
  users: string[],
  settings: {
    customBranding: object,
    bookingUrl: string,
    emailFrom: string
  },
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### tenant_usage Collection
```
{
  tenantId: string,
  currentMonth: string (YYYY-MM),
  quotes: number,
  payments: number,
  sms: number,
  aiAnalysis: number,
  totalPaymentVolume: number,
  lastReset: timestamp,
  lastUpdated: timestamp
}
```

### tenant_billing Collection
```
{
  tenantId: string,
  customerId: string,
  invoiceId: string,
  amount: number,
  currency: string,
  status: 'paid' | 'failed',
  paidAt: timestamp | failedAt: timestamp
}
```

## Usage Examples

### Creating a New Tenant
```javascript
import { createTenant } from './services/tenantService';

await createTenant({
  businessName: 'Aunt B\'s Cleaning Services',
  businessEmail: 'contact@auntbs.com',
  businessPhone: '(555) 123-4567',
  subscriptionTier: 'pro',
  users: 3,
  locations: 1
});
```

### Checking Feature Access
```javascript
import { useSubscriptionFeatures } from './hooks/useSubscriptionFeatures';

function PaymentForm({ tenantId }) {
  const { canUseFeature, transactionFee } = useSubscriptionFeatures(tenantId);
  
  const canProcessPayments = canUseFeature('paymentProcessing');
  const fee = transactionFee; // 0.01 for pro tier
}
```

### Tracking Usage
```javascript
import { trackPaymentUsage } from './services/usageTrackingService';

await trackPaymentUsage(tenantId, 3938); // Track $39.38 payment
```

### Creating Subscription
```javascript
// Call Firebase function
const response = await fetch('https://us-central1-project.cloudfunctions.net/createSubscription', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    customerId: 'cus_xxx',
    priceId: 'price_xxx',
    tenantId: 'tenant_xxx',
    tier: 'pro'
  })
});
```

## Transaction Fee Calculation

### Example: Pro Tier (1% fee)
- Deposit amount: $39.38 (3938 cents)
- Transaction fee: 3938 * 0.01 = 39.38 cents
- Total charged: 3938 + 39 = 3977 cents ($39.77)

### Example: Free Tier (3% fee)
- Deposit amount: $39.38 (3938 cents)
- Transaction fee: 3938 * 0.03 = 118.14 cents
- Total charged: 3938 + 118 = 4056 cents ($40.56)

## Deployment Steps

1. **Deploy Firebase Security Rules**
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Deploy Stripe Billing Functions**
   ```bash
   firebase deploy --only functions
   ```

3. **Create Stripe Products and Prices**
   - Free: No product needed
   - Pro: $99/month recurring price
   - Enterprise: $299/month recurring price

4. **Configure Webhook**
   - Set up webhook in Stripe dashboard
   - Point to: `https://us-central1-project.cloudfunctions.net/stripeWebhook`
   - Events: customer.subscription.*, invoice.payment_*

5. **Update Environment Variables**
   ```bash
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

## Testing

### Test Subscription Flow
1. Create test tenant
2. Create Stripe test customer
3. Create test subscription with test price
4. Verify tenant tier updates via webhook
5. Test payment with transaction fee calculation

### Test Feature Flags
1. Create tenant with different tiers
2. Try to access features based on tier
3. Verify usage limits are enforced
4. Test upgrade/downgrade flows

## Revenue Calculation

### Monthly Recurring Revenue (MRR)
- Free tier: $0 × N_free_tiers
- Pro tier: $99 × N_pro_tiers
- Enterprise tier: $299 × N_enterprise_tiers

### Transaction Fee Revenue
- Free tier: 3% × payment_volume_free
- Pro tier: 1% × payment_volume_pro
- Enterprise tier: 0.5% × payment_volume_enterprise

### Example with 100 tenants
- 50 Free: $0 MRR + 3% fees
- 40 Pro: $3,960 MRR + 1% fees
- 10 Enterprise: $2,990 MRR + 0.5% fees
- **Total MRR: $6,950/month**
- **Plus transaction fees on payment volume**

## Next Steps

1. Deploy security rules to Firebase
2. Set up Stripe products and prices
3. Configure Stripe webhook
4. Create admin dashboard for tenant management
5. Add usage analytics dashboard
6. Implement subscription upgrade/downgrade UI
