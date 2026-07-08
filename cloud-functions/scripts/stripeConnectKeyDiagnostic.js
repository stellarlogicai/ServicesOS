const fs = require('node:fs');
const path = require('node:path');
const Stripe = require('stripe');

function loadDotEnv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^"(.*)"$/, '$1');
    if (!process.env[key]) process.env[key] = value;
  }
}

function keyMode(secretKey = '') {
  if (secretKey.startsWith('sk_test_')) return 'test';
  if (secretKey.startsWith('sk_live_')) return 'live';
  return 'unknown';
}

function last4(value = '') {
  return value.slice(-4) || 'none';
}

function safeStripeError(error) {
  return {
    type: error?.type || error?.rawType || 'unknown',
    code: error?.code || error?.raw?.code || null,
    statusCode: error?.statusCode || error?.raw?.statusCode || null,
    message: error?.message || error?.raw?.message || 'No message',
    requestId: error?.requestId || error?.raw?.requestId || null,
  };
}

async function main() {
  const envPath = path.resolve(__dirname, '..', '.env');
  loadDotEnv(envPath);

  const secretKey = process.env.STRIPE_SECRET_KEY || '';
  const mode = keyMode(secretKey);

  console.log('Stripe Connect key diagnostic');
  console.log(`keyMode=${mode}`);
  console.log(`keyLast4=${last4(secretKey)}`);

  if (!secretKey) {
    console.log('STRIPE_SECRET_KEY=missing');
    process.exitCode = 1;
    return;
  }

  const stripe = Stripe(secretKey);

  try {
    const account = await stripe.accounts.retrieve();
    console.log(`platformAccountId=${account.id}`);
    console.log(`platformEmail=${account.email || 'unavailable'}`);
    console.log(`platformBusinessName=${account.business_profile?.name || 'unavailable'}`);
    console.log(`platformChargesEnabled=${account.charges_enabled}`);
    console.log(`platformPayoutsEnabled=${account.payouts_enabled}`);
  } catch (error) {
    console.log('platformRetrieveError=' + JSON.stringify(safeStripeError(error)));
  }

  if (mode !== 'test') {
    console.log('minimalCreateSkipped=not_test_mode');
    process.exitCode = 1;
    return;
  }

  try {
    const connectedAccount = await stripe.accounts.create({
      type: 'standard',
      email: 'servicesos-connect-diagnostic@example.com',
      country: 'US',
    });
    console.log(`minimalCreateSucceeded=true`);
    console.log(`createdConnectedAccountId=${connectedAccount.id}`);
    console.log('connectPlatformCapable=true');
    console.log('firestoreWrite=false');
  } catch (error) {
    console.log('minimalCreateSucceeded=false');
    console.log('connectPlatformCapable=false');
    console.log('stripeError=' + JSON.stringify(safeStripeError(error)));
  }
}

main().catch(error => {
  console.error('diagnosticFatal=' + JSON.stringify({
    name: error?.name || 'Error',
    message: error?.message || 'Unknown error',
  }));
  process.exitCode = 1;
});
