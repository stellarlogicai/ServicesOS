# Production Deployment Guide

This guide explains how to deploy the Cleaning Intake System to production using the CI/CD pipeline.

## Prerequisites

### GitHub Secrets

Configure the following secrets in your GitHub repository (Settings → Secrets and variables → Actions):

**Firebase Secrets:**
- `FIREBASE_API_KEY` - Firebase API key
- `FIREBASE_AUTH_DOMAIN` - Firebase auth domain
- `FIREBASE_PROJECT_ID` - Firebase project ID
- `FIREBASE_STORAGE_BUCKET` - Firebase storage bucket
- `FIREBASE_MESSAGING_SENDER_ID` - Firebase messaging sender ID
- `FIREBASE_APP_ID` - Firebase app ID
- `FIREBASE_SERVICE_ACCOUNT` - Base64 encoded service account JSON
- `FIREBASE_TOKEN` - Firebase CLI token (run `firebase login:ci`)

**Stripe Secrets:**
- `STRIPE_SECRET_KEY` - Stripe secret key (use test key for testing)
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret

**Email Secrets:**
- `RESEND_API_KEY` - Resend API key
- `EMAIL_FROM` - From email address
- `BUSINESS_NAME` - Business name for emails

**Application Secrets:**
- `BOOKING_URL` - Public URL for booking
- `APP_URL` - Application URL (e.g., https://your-app.com)

### Firebase Project Setup

1. Enable Firebase Hosting:
   ```bash
   firebase init hosting
   ```

2. Enable Firebase Functions:
   ```bash
   firebase init functions
   ```

3. Enable Firestore:
   ```bash
   firebase init firestore
   ```

4. Deploy security rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

5. Deploy indexes:
   ```bash
   firebase deploy --only firestore:indexes
   ```

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/deploy.yml`) automatically:

1. **Builds the React app** with production environment variables
2. **Runs tests** (if configured)
3. **Deploys to Firebase Hosting** for the frontend
4. **Deploys Firebase Functions** for the backend
5. **Deploys Firestore rules and indexes**

### Triggering Deployment

Deployment is triggered automatically on:
- Push to `main` branch
- Manual trigger via GitHub Actions UI

### Manual Deployment

If you need to deploy manually:

```bash
# Install dependencies
npm ci

# Build the app
npm run build

# Deploy to Firebase
firebase deploy
```

## Environment Configuration

### Development
```bash
# .env.development
VITE_FIREBASE_API_KEY=your_dev_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-dev-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-dev-project
# ... other dev variables
```

### Production
Production variables are set via GitHub Secrets and injected during the CI/CD build.

## Post-Deployment Checklist

- [ ] Verify frontend loads at production URL
- [ ] Test authentication flow
- [ ] Test quote creation
- [ ] Test payment flow with Stripe test card
- [ ] Test email sending
- [ ] Verify Firebase Functions are deployed
- [ ] Check Firestore security rules are active
- [ ] Verify indexes are created
- [ ] Test webhooks are receiving events
- [ ] Monitor Firebase Functions logs for errors

## Monitoring

### Firebase Console
- **Hosting**: Check deployment status
- **Functions**: Monitor function logs and errors
- **Firestore**: Monitor database usage and performance
- **Storage**: Check storage usage

### Stripe Dashboard
- Monitor subscription events
- Check webhook delivery status
- Review payment failures

## Rollback

If you need to rollback:

```bash
# Rollback Firebase Hosting
firebase hosting:rollback

# Rollback Functions
firebase deploy --only functions --force
```

## Troubleshooting

### Build Failures
- Check Node.js version matches `NODE_VERSION` in workflow
- Verify all secrets are configured
- Check build logs in GitHub Actions

### Deployment Failures
- Verify Firebase token is valid (tokens expire)
- Check service account has correct permissions
- Ensure project exists in Firebase console

### Webhook Issues
- Verify webhook URL is accessible
- Check webhook secret matches Stripe
- Test webhook delivery in Stripe Dashboard
