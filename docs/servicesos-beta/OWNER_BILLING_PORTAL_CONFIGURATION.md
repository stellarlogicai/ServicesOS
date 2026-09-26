# Owner Billing Portal Configuration Contract

The owner billing Portal gateway requires the server-side Firebase string parameter
`SERVICESOS_OWNER_BILLING_PORTAL_CONFIGURATION_ID` in each deployment environment.
It must reference an active Stripe Billing Portal Configuration on the platform
account. The gateway retrieves the configuration before every session and fails
closed unless the configuration has:

- payment method update enabled;
- invoice history enabled;
- subscription cancellation enabled with mode `at_period_end`;
- subscription updates disabled (no monthly/annual switching or quantity edits);
- subscription pause and customer profile update disabled.

The gateway passes this exact configuration ID, the tenant's verified canonical
Stripe Customer, and a server-derived `SERVICESOS_APP_URL` return URL to Stripe.
The browser supplies none of these. The existing subscription webhook remains
the authority for cancellation, paid renewal, recovery, and access state.

Before controlled test or production use, create and inspect separate test/live
Portal Configurations in the matching Stripe accounts. Confirm the features
above, absence of product switching, coupons, trials, and unrelated subscription
purchase options, then set the corresponding server parameter. Verify the trusted
application return origin, payment method and invoice views, scheduled cancellation
at period end, and webhook-driven state on return. This repository does not create
or change Stripe Portal Configurations or production parameters.
