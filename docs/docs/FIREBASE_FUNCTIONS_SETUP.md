# Firebase Cloud Functions Setup Guide

This guide walks you through setting up Firebase Cloud Functions for Stripe payment processing.

---

## Prerequisites

1. **Firebase Project** - Already created: `cleaning-intake-system`
2. **Node.js** - Version 18 or higher
3. **Firebase CLI** - Install if not already installed:
   ```bash
   npm install -g firebase-tools
   ```
4. **Stripe Account** - Get your secret key from Stripe Dashboard

---

## Step 1: Install Firebase CLI (if not installed)

```bash
npm install -g firebase-tools
```

---

## Step 2: Login to Firebase

```bash
firebase login
```

This will open a browser window to authenticate with your Google account.

---

## Step 3: Initialize Firebase Functions

Navigate to your project directory:

```bash
cd c:\Users\merce\Documents\AuntBsCleaningServices\Cleaning-intake-system\Cleaning-intake-system
```

Initialize Firebase (if not already done):

```bash
firebase init
```

**Select the following options:**
- **Which Firebase features do you want to set up?** → `Functions: Configure a Cloud Functions directory`
- **What language would you like to use to write Cloud Functions?** → `JavaScript`
- **Do you want to use ESLint?** → `Yes`
- **File functions/index.js already exists. Overwrite?** → `No` (we already created it)
- **File functions/package.json already exists. Overwrite?** → `No` (we already created it)

---

## Step 4: Install Dependencies

Navigate to the functions directory:

```bash
cd functions
```

Install dependencies:

```bash
npm install
```

---

## Step 5: Configure Environment Variables

Edit `functions/.env` and add your Stripe credentials:

```env
# Stripe Secret Key (get from Stripe Dashboard → Developers → API Keys)
STRIPE_SECRET_KEY=sk_test_your_actual_stripe_secret_key_here

# Stripe Webhook Secret (get from Stripe Dashboard after creating webhook)
STRIPE_WEBHOOK_SECRET=whsec_your_actual_webhook_secret_here
```

**To get your Stripe Secret Key:**
1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Navigate to Developers → API Keys
3. Copy the "Secret key" (starts with `sk_test_` for test mode)

---

## Step 6: Deploy Firebase Functions

From the project root directory:

```bash
firebase deploy --only functions
```

This will deploy your functions to Firebase. You'll see output like:

```
i  functions: ensuring necessary APIs are enabled...
i  functions: preparing functions directory for uploading...
i  functions: packaged functions (X.XX KB) for uploading
✔  functions: functions folder uploaded successfully
i  functions: creating Node.js 18 function createPaymentIntent(us-central1)...
✔  functions[createPaymentIntent(us-central1)]: Successful create operation.
i  functions: creating Node.js 18 function confirmPayment(us-central1)...
✔  functions[confirmPayment(us-central1)]: Successful create operation.
i  functions: creating Node.js 18 function stripeWebhook(us-central1)...
✔  functions[stripeWebhook(us-central1)]: Successful create operation.
```

**Note your function URLs:**
- `https://us-central1-cleaning-intake-system.cloudfunctions.net/createPaymentIntent`
- `https://us-central1-cleaning-intake-system.cloudfunctions.net/confirmPayment`
- `https://us-central1-cleaning-intake-system.cloudfunctions.net/stripeWebhook`

---

## Step 7: Set Up Stripe Webhook

### 7.1 Get Your Function URL

Your webhook URL will be:
```
https://us-central1-cleaning-intake-system.cloudfunctions.net/stripeWebhook
```

### 7.2 Create Webhook in Stripe Dashboard

1. Go to [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Paste your function URL
4. Select events to listen for:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
5. Click "Add endpoint"

### 7.3 Get Webhook Secret

After creating the webhook:
1. Click on the webhook endpoint you just created
2. Click "Reveal" next to "Signing secret"
3. Copy the secret (starts with `whsec_`)
4. Add it to `functions/.env`:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_your_actual_webhook_secret_here
   ```

### 7.4 Redeploy Functions

After adding the webhook secret, redeploy:

```bash
firebase deploy --only functions
```

---

## Step 8: Test Locally (Optional)

To test functions locally before deploying:

```bash
firebase emulators:start
```

This will start local emulators for Functions, Firestore, and other Firebase services.

Your local function URLs will be:
- `http://localhost:5001/cleaning-intake-system/us-central1/createPaymentIntent`
- `http://localhost:5001/cleaning-intake-system/us-central1/confirmPayment`
- `http://localhost:5001/cleaning-intake-system/us-central1/stripeWebhook`

---

## Step 9: Update Frontend Environment

The frontend is already configured to use Firebase Functions. The `stripeService.js` will automatically use:
- Local URLs when `import.meta.env.DEV` is true
- Production URLs when deployed

---

## Step 10: Test Payment Flow

### Test Mode (Stripe Test Mode)

1. Use Stripe test card numbers:
   - **Success:** `4242 4242 4242 4242`
   - **Decline:** `4000 0000 0000 0002`
   - **Insufficient Funds:** `4000 0025 0000 3155`

2. Test expiration: Any future date
3. Test CVC: Any 3 digits
4. Test ZIP: Any 5 digits

### Verify in Stripe Dashboard

1. Go to [Stripe Dashboard → Payments](https://dashboard.stripe.com/payments)
2. You should see your test payments
3. Check that webhooks were delivered (Developers → Webhooks → Your webhook)

---

## Monitoring & Logs

### View Function Logs

```bash
firebase functions:log
```

### View Specific Function Logs

```bash
firebase functions:log --only createPaymentIntent
```

### Monitor in Firebase Console

1. Go to [Firebase Console → Functions](https://console.firebase.google.com/project/cleaning-intake-system/functions)
2. View logs, invocations, and execution times

---

## Troubleshooting

### "Functions deployment failed"

- Check that you're logged in: `firebase login`
- Check your project ID matches: `cleaning-intake-system`
- Check Node.js version: `node --version` (should be 18+)

### "Webhook signature verification failed"

- Ensure `STRIPE_WEBHOOK_SECRET` is set in `functions/.env`
- Redeploy functions after adding the secret
- Check that the webhook URL in Stripe matches your deployed function URL

### "CORS error" in browser

- Functions already have CORS enabled
- Check that you're calling the correct URL (local vs production)
- Check browser console for specific error

### "Payment intent creation failed"

- Check function logs: `firebase functions:log`
- Verify Stripe secret key is correct
- Check that amount is valid (positive number)

---

## Cost Estimate

### Firebase Functions (Blaze Plan)

- **Free tier:** 125,000 invocations/month
- **Your usage:** ~100-1,000 payments/month
- **Estimated cost:** <$0.50/month

### Stripe

- **Test mode:** Free
- **Live mode:** 2.9% + 30¢ per transaction
- **No monthly fees**

---

## Security Notes

1. **Never commit secrets to git**
   - `functions/.env` is in `.gitignore`
   - Use Firebase environment config for production secrets

2. **Use test mode during development**
   - Stripe test mode uses test card numbers
   - No real money is processed

3. **Enable Firebase Security Rules**
   - Set up Firestore security rules
   - Restrict who can read/write payment data

4. **Monitor for fraud**
   - Set up Stripe Radar (included with Stripe)
   - Monitor unusual payment patterns

---

## Next Steps

After deployment is complete:

1. ✅ Test payment flow with Stripe test cards
2. ✅ Verify webhooks are received in Stripe Dashboard
3. ✅ Check Firebase Functions logs for errors
4. ✅ Test in production with small amounts
5. ✅ Set up monitoring and alerts

---

## Support

- **Firebase Documentation:** https://firebase.google.com/docs/functions
- **Stripe Documentation:** https://stripe.com/docs/api
- **Firebase Console:** https://console.firebase.google.com/project/cleaning-intake-system
- **Stripe Dashboard:** https://dashboard.stripe.com
