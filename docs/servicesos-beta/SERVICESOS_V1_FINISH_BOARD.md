# ServicesOS V1 Finish Board

## Assistant approved financial obligation handoff (2026-10-08)

- **REPAIRED — READY FOR REVIEW**; automatically validated, uncommitted, not
  integrated-release or payment certified. Base $200 plus approved additions $210
  yields valid hash-bound scope v2 total $410 / 41,000 canonical cents.
- Before repair, the rendered Assistant reported $200. Modern and legacy answers
  now report $410; the original $200 remains separate base evidence/stored history.
- Reuse `bookingObligationCents`; validate sorted-JSON SHA-256/approved version
  binding and revalidate booking/tenant identity. Invalid, stale, missing,
  contradictory or unverified evidence fails closed, never falling back to $200.
  Browser hashing unavailable also fails closed. Partial payments/refunds/reversals
  affect canonical balance, not total obligation; formulas and history are unchanged.
- Zero provider/router/generation calls and unchanged credits are asserted.
  Validation: financial/rendered 34/34; GrowthAI/composer 24 files / 1,120/1,120;
  related web 15 files / 197/197; accounting/approval 37/37; Functions 523/523.
  Final unfiltered suites: zero failures/skips. Lint/build/diff-check passed.
- Keep open: no-ID/manual Checkout reconciliation and controlled Stripe/provider
  acceptance, combined integrated acceptance,
  owner/customer workflow, Agreement Lite signing/presentation/PDF, physical
  employee-device/photos, Stripe provider acceptance, IW-04 fee decision, deployed
  security and release validation. Wife beta/payments/release are not certified.
- IW-01/IW-02/IW-03 remain intact. Existing build/import/CRLF warnings remain;
  no provider/deployment/production action occurred. Tap to Pay remains post-V1.

## IW-02 approved extra-work financial handoff (2026-10-08)

- Repaired, ready for review; not deployed or full payment/release certified.
- Preserve original base price; validated customer-approved versioned scope is
  the revised accounting obligation ($200 + $210 = $410, without double count).
- Unapproved/stale proposals cannot change collectible balance. Existing paid,
  refund and reversal formulas and immutable records remain unchanged.
- Financial approval and collection serialize transactionally. Unresolved
  collection/legacy Checkout blocks approval even after local expiry; provider
  cancellation/replacement and automatic recovery are not implemented.
- Owner review uses exact integer cents, rejecting invalid precision; payment
  details show original price, approved total and canonical remaining balance.
- Validation: accounting/approval 37/37; Functions 523/523; affected web 17 files,
  612/612; financial UI subset 59/59; lint/build passed. Initial sandbox rename
  failure ran no web tests; unchanged elevated run passed. Existing build/CRLF
  warnings remain.
- IW-01 and unrelated dirty work preserved; no historical migration or provider
  action. Review this slice, then resume integrated acceptance. Controlled
  payment/provider, device, deployment and wife-beta gates remain open.
- Tap to Pay remains post-V1; no broader release readiness is claimed.

## IW-01 tenant-local scheduling handoff repair (2026-10-08)

IW-01 is repaired and ready for review, not deployed. Booking creation, estimate
conversion and rescheduling now derive the canonical instant from the configured
tenant timezone through one pure scheduling helper. The booking modal's conflict
and availability checks use that same timezone instead of the host timezone.
No booking schema or historical record was migrated.

Employee authorization checks are unchanged. Only scheduling timezone propagation
changed: configured UTC remains UTC; missing or invalid timezone is unavailable.
The shared credit-entitlement timezone policy is unchanged. JobPacket dates,
scheduled instants and visibility fail closed on unavailable timezone, incomplete
start evidence, DST gaps/folds and invalid/conflicting persisted timestamps.

Failing regressions preceded the fixes: the new web handoff suite failed 9/17 on
Chicago and 14/17 on UTC; the backend handoff suite failed 8/12. The broader UTC
rendered run then exposed two host-local conflict-check failures, also repaired.
Final new handoff coverage passes 19/19 web and 12/12 backend. Each host in UTC,
America/Chicago, America/Los_Angeles, Asia/Tokyo and Pacific/Kiritimati passed
542/542 tests across 10 web files and 59/59 employee/backend tests. Chicago
October 8, 2026 at 10:00 consistently produces 2026-10-08T15:00:00.000Z;
00:30 remains October 8 and produces 05:30Z. Valid DST boundaries pass; ambiguous
or nonexistent local starts are rejected rather than guessed.

Full Functions validation passes 508/508; complete GrowthAI/composer validation
passes 23 files / 1,086 tests. Lint, production build and git diff --check pass.
Existing bundle-size, Firestore dynamic-import and CRLF warnings remain.
Assistant scheduling/evidence semantics, employee UID/role/membership decisions,
payment authority and security rules are unchanged. Safety, extra-work and Terminal
test fixtures now supply valid schedule/timezone evidence; their production logic
was not changed.

Historical invalid/conflicting bookings remain refused, not silently repaired.
This is local automated evidence, not physical-device or real-cloud acceptance.
IW-02 and Stripe work were not started. Integrated owner/employee acceptance,
physical-device checks, provider acceptance, controlled deployment, wife beta and
final release gates remain open; mobile Tap to Pay remains post-V1.

## Final intelligence freeze verification (2026-10-07)

The accumulated Assistant intelligence batch is ready for commit review after the
remaining factual inventory, host-timezone matrix, lifecycle/cost checks and dirty-tree
review. This is an intelligence freeze decision; owner/device/provider and release
acceptance remain open. Nothing was staged, committed, pushed or deployed.

Eight additional P1 wording probes reproduced lost explicit customer identity or
incorrect contextual selection before repair. Four unrecognized "that job/appointment
for Synthetic B" forms now clarify locally instead of answering from selected A.
The modern interpreter honors that specific refusal. Existing charging, appointment
and history parsers retain explicit B in four other reproduced forms. Named current
references use the selected record; "last work" cannot silently select the last list
position. Established independent named reads remain supported. No writer, schema,
provider, credit, payment, Auth/rule or new business capability changed.

Final validation: 23 GrowthAI/composer files / 1,086 passing tests, including 236
rendered composer cases and 46 shared blocker regressions; zero final failures/skips.
All 1,072 checkpoint tests remain and 14 regressions were added. The four factual/
temporal files passed 466/466 under each host TZ: UTC, America/Chicago,
America/Los_Angeles, Asia/Tokyo and Pacific/Kiritimati. Backend provider/seed tests
passed 17/17. Lint, production build and tracked/untracked whitespace checks pass.
Existing bundle, Firestore dynamic-import and CRLF warnings remain. An intermediate
focused run had an unexplained Vitest worker exit (607 tests completed, one file
absent); it was stopped and disclosed. The absent file passed independently, and
final complete-suite/matrix runs completed without errors or altered test settings.

Legacy replies still bypass the modern evidence gate. Direct legacy and forced
fallback tests verify canonical customer/booking/estimate relationships, requested
fields, honest missing evidence, and tenant-local dates. Tested deterministic reads
make zero router/generation calls, consume zero credits and leave synthetic business
data unchanged. Tenant/identity switching, reset, stale/foreign/suspended context,
coherent replacement and conflicting explicit identity remain covered.

At the 2026-10-07 checkpoint, 29 intentional dirty/untracked paths remained. The protected
sistant_Beta_UX_WIP.patch SHA-256 remains
1C5E11D80DE54D4D5B7D84A0A3093CE68B12FD65BC1CC9666934C95E5556818B.
Review the intelligence code/tests together; keep emulator/provider-test support,
checkpoint documentation and pre-existing responsive CSS work in coherent separate
boundaries. Never include the protected patch in the implementation commit.

## Shared factual-integrity freeze-blocker repair (2026-10-07)

The six reproduced P1 cases are repaired: explicit-customer summary, history,
estimate creation date, alternate price/service wording, and invalid sub-cent
saved booking amounts. Before production edits, the new regression matrix had
17 failures / 9 passes. A related explicit-name suffix on estimate creation was
also reproduced with a failing regression before its shared-boundary correction.

Explicit identity is retained separately from booking-dependent references.
The existing canonical customer/reference coherence check now covers the affected
reads, including quotes. B plus A's "that job" clarifies; coherent B references
use B's canonical records. Independent explicit B quote requests still resolve
B even when A was previously active. This clarified contract supersedes the
earlier quote-repair assumption that explicit B could override a conflicting
"that job". Only directly contradictory quote-test inputs were updated;
their canonical-value and tenant-scope assertions remain, with new conflict tests.

Estimate creation reads require actual estimate creation evidence. A booking
appointment cannot substitute; a booking-to-estimate read requires one matching
canonical customer relationship. Missing/invalid creation evidence or timezone
is unavailable, and mismatched links clarify. Modern interpretation declines
these existing legacy fields to the local owner-context path, not provider
generation. The related "that estimate ... for B" form also preserves identity.

Saved booking amounts must have safe integer-cent precision. Invalid agreedPrice
does not round into a valid amount or fall back to another price field.
No booking/estimate schema, writer, payment authority or stored record changed.

Validation: new blocker matrix 34/34; rendered composer 234/234; complete relevant
GrowthAI/composer suite 23 files / 1,072 tests, zero failures/skips. All 1,033
previous tests remain; 39 regressions were added. Lint and production build pass.
Rendered checks cover coherent values, conflicting refs, forced legacy fallback,
conversation reset, tenant/identity changes, zero provider-router/generation
calls, unchanged credit balance and unchanged synthetic business data.
Existing large-chunk, Firestore dynamic-import and CRLF warnings remain.

Only this bounded repair is validated. The whole intelligence freeze remains
uncertified and the accumulated batch remains uncommitted. Resume the remaining
factual-path/evidence inventory, then temporal/host-timezone and final commit-boundary
certification; do not add another capability. Owner/device/provider and release
acceptance remain open. Mobile Tap to Pay remains post-V1.



## Contact-info entity-association integrity repair (2026-10-04)

The exact blocker, "What is Synthetic B's contact info for that job?", was
reproduced before editing: modern intelligence returned active A's 555-0110 with
answerable/sufficient confidence and no explicit entity in its plan; legacy returned
A's booking summary. An executable regression failed before the production repair.

The existing contextual contact parser now retains explicitName, current reference
and field=phone for contact info, reusing the phone/email booking-coherence guard.
Clean named contact-info interpretation also preserves the explicit customer and
uses the established deterministic phone lookup. No compound contact capability was
added. Legacy clean contact output retains its existing phone/email behavior;
legacy contextual explicit contact info uses the existing phone field, while
context-only legacy booking-summary behavior is unchanged.

The fact_lookup plan now requires explicit_customer_identity,
canonical_customer_relationship, coherent_contextual_booking and saved_phone for
named contextual requests. Planner, evidence gate, owner-context resolver and
composer production code are unchanged. Independent gate regressions reject
wrong-customer operands, conflicting context and substituted output values.

B plus A's contextual booking clarifies without displaying A's phone as B's contact.
B-only lookup replaces active A where uniquely resolvable; B plus selected B's job
returns 555-0111. Same-customer and context-only behavior remain intact.
Unknown/ambiguous names, missing canonical identity and missing/reset/stale/foreign/
suspended contextual references fail safely. Missing B phone is unavailable, never
replaced with A's phone or B's email. Rendered regressions cover modern execution,
forced unsupported-to-legacy fallback, conversation reset, tenant/identity switch
and coherent context replacement, with zero provider-router/generation calls,
unchanged credits and unchanged synthetic business data.

Validation: vocabulary 145/145; intelligence 140/140; planner 42/42; evidence 48/48;
owner context 232/232; rendered composer 229/229 (six focused files, 836/836).
The complete relevant GrowthAI/composer suite passed 22 files / 1,033 tests with
zero failures/skips, preserving all 1,000 previous tests. Lint, production build
and diff-check passed. Existing large-chunk, Firestore dynamic-import and CRLF
warnings remain; npm also displayed its upgrade notice. No assertions were
removed/weakened, skips added or arbitrary timeout changes introduced.

This is a contact-info entity-association integrity repair, not a new capability.
No schema, storage, stored records, writers, scheduling, database, payments/Stripe,
auth/rules, mobile, provider infrastructure or production behavior changed.
Only this demonstrated blocker is resolved. The interrupted freeze audit can resume
from the contact-info boundary; the remaining audit was not performed in this repair.
The accumulated intelligence batch remains uncommitted and not freeze-certified.
Integrated owner/device/provider and release acceptance remain required.
Mobile Tap to Pay remains post-V1.


## Email entity-association integrity repair (2026-10-04)

The exact blocker, "What is Synthetic B's email address for that job?", was
reproduced before the production repair: modern intelligence returned active A's
a@example.test with answerable/sufficient confidence; legacy returned A's booking
summary. The new executable regression also failed before production editing.

The existing contextual contact parser now retains explicitName, current reference
and field=email alongside its repaired phone contract. Interpretation uses the
existing booking lookup and explicit-customer/contextual-booking coherence guard.
The fact_lookup plan requires saved_email, unique_resolved_record,
explicit_customer_identity, canonical_customer_relationship and
coherent_contextual_booking. Planner and evidence-gate production code are unchanged;
independent gate tests reject wrong-customer operands, conflicting context and
substituted email values. Legacy reuses the same identity/coherence resolver without
migrating to modern evidence validation or rematching a selected coherent booking.

Clean B-only contact lookup preserves its established current-list behavior:
uniquely resolvable B returns b@example.test even with A active. B plus selected B's
job returns B's email; B plus A's contextual job clarifies and never substitutes
A's email. Same-customer and context-only A behavior remains intact, including the
existing legacy context-only summary. Unknown/ambiguous names, missing canonical
identity and missing/reset/stale/foreign/suspended booking references fail safely.
Missing B email is unavailable, never borrowed from A.

Validation: vocabulary 144/144; intelligence 131/131; planner 41/41; evidence 47/47;
owner context 223/223; rendered composer 217/217 (six focused files, 803/803).
The complete relevant GrowthAI/composer suite passed 22 files / 1,000 tests with
zero failures/skips, preserving all 970 previous tests and every earlier integrity
repair, including phone. Nine new rendered cases verify correct values/refusals,
conversation reset, tenant/identity switch and context replacement, zero
provider-router/generation calls, unchanged credits and unchanged synthetic business
data. Lint and production build passed; existing large-chunk and Firestore
dynamic-import warnings remain. No assertions were removed/weakened, skips added,
or arbitrary timeout changes introduced.

This is an email entity-association integrity repair, not a new capability or
generalized resolver. No schema, stored record, storage, writer, scheduling, database,
provider, payment, auth/rules or mobile behavior changed. Only this demonstrated
blocker is resolved. The interrupted freeze audit may resume from the email boundary;
it was not completed during this repair. The accumulated batch remains uncommitted,
and integrated owner/device/provider and release acceptance remain required.
Mobile Tap to Pay remains post-V1.


## Contact/phone entity-association integrity repair (2026-10-04)

The exact blocker, "What is Synthetic B's phone number for that job?", was
reproduced before the production repair: modern intelligence returned active A's
555-0110 with sufficient confidence; legacy fallback returned A's booking summary.
The bounded contextual phone vocabulary now retains explicitName, current reference
and field=phone. Interpretation uses the existing booking lookup and shared
explicit-customer/contextual-booking coherence guard, not a new contact capability.

The existing fact_lookup plan requires saved_phone, unique_resolved_record,
explicit_customer_identity, canonical_customer_relationship and
coherent_contextual_booking. Planner and evidence-gate production code are unchanged.
Independent gate tests reject wrong-customer operands, conflicting context and
substituted phone output. Legacy fallback reuses the existing identity/coherence
resolver without migrating to the modern evidence architecture or rematching a
canonically selected coherent booking by name.

Clean B-only contact lookup retains its existing current-list resolution behavior:
uniquely resolvable B returns 555-0111 with A active. Explicit B plus selected B's job
returns B's phone; explicit B plus A's contextual job clarifies, never substitutes
555-0110. Same-customer and context-only A behavior is preserved, including the
existing legacy context-only summary behavior. Unknown/ambiguous names, missing
canonical identity and missing/reset/stale/foreign/suspended booking references
fail safely. Missing B phone is unavailable, not borrowed from A.

Validation: vocabulary 143/143; intelligence 122/122; planner 40/40; evidence 46/46;
owner context 214/214; rendered composer 208/208 (six focused files, 773/773).
The complete relevant GrowthAI/composer suite passed 22 files / 970 tests with
zero failures/skips, preserving all 940 previous tests and earlier scheduling,
temporal, estimate, amount, status, appointment and service integrity repairs.
Nine new rendered cases verify phone values/refusals, reset, tenant/identity switch
and context replacement, zero provider-router/generation calls, unchanged credits
and unchanged synthetic business data. Lint and production build passed; existing
large-chunk and Firestore dynamic-import warnings remain. No assertions were removed
or weakened; no skips or arbitrary timeout changes were added.

This contact/phone entity-association integrity repair resolves only the demonstrated
phone blocker. The interrupted freeze audit may resume from that boundary; it was
not completed during this repair. No generalized resolver, schema, stored record,
writer, scheduling, database, provider, payment, auth/rules or mobile change occurred.
The accumulated batch remains uncommitted; integrated owner/device/provider and
release acceptance remain required. Mobile Tap to Pay remains post-V1.


## Booking-service entity-association integrity repair (2026-10-04)

The demonstrated service-association blocker is repaired. Before editing, "What is
Synthetic B's service for that job?" discarded explicit B: modern intelligence
returned active A's Standard Cleaning with sufficient confidence, and legacy
fallback returned A's booking summary. B's separate booking was Deep Cleaning.
The exact failing regression was reproduced before changing production code.

The bounded vocabulary now retains explicitName, current/none reference and service
intent. Service lookup reuses the existing explicit-customer/booking-coherence guard
used for amount, status and appointment. The existing fact_lookup plan requires
saved_service, unique_resolved_record, explicit_customer_identity and
canonical_customer_relationship, plus coherent_contextual_booking for contextual
booking requests. Planner/evidence production code is unchanged; forged wrong-customer
operands, conflicting context and substituted service output remain rejected.
Legacy shares only the existing identity/coherence resolver, not the modern evidence gate.

A uniquely resolved B-only request returns Deep Cleaning even with A active. B plus
B's selected job returns Deep Cleaning. B plus A's contextual job clarifies, never
returns A's Standard Cleaning and never guesses a replacement booking. Same-customer
and context-only A requests retain their existing behavior. Unknown/ambiguous names,
multiple unselected bookings, missing canonical identity and reset/stale/foreign/
suspended context fail safely. Missing B service is reported unavailable, not borrowed
from A. Existing scheduling and canonical service-resolution semantics are unchanged.

Validation: vocabulary 142/142; intelligence 113/113; planner 39/39; evidence 45/45;
owner context 205/205; rendered composer 199/199 (six focused files, 743/743).
The complete relevant GrowthAI/composer suite passed 22 files / 940 tests, zero
failures/skips, preserving the previous 906-test checkpoint. Booking facts, canonical
service resolution and all earlier temporal, scheduling, estimate, amount, status
and appointment integrity repairs remain green. Diff check passed with existing
CRLF warnings; no skips, assertion weakening or timeout changes were introduced.
Nine new rendered service/lifecycle cases prove correct canonical values or refusal,
zero provider-router/generation calls, unchanged credits and unchanged synthetic
business data. Conversation reset, tenant/identity switch and customer/booking context
replacement remain covered. Lint and production build passed; existing large-chunk
and Firestore dynamic-import warnings remain.

This is a booking-service entity-association integrity repair, not a new capability
or generalized resolver. No schema, stored record, writer, scheduling, database,
provider, payment, authentication, rules or mobile behavior was changed.
Only this blocker is closed. The interrupted freeze audit may resume at the service-
field boundary; the wider audit was not performed here. Overall batch freeze and
manual owner/wife, physical-device, provider, staging/security and release gates
remain open. Mobile Tap to Pay remains post-V1.

## Appointment/date entity-association integrity repair (2026-10-04)

The exact appointment-date blocker is repaired: "When is Synthetic B's appointment
for that job?" previously lost explicit B and returned active A's October 5, 2026
at 10:00 through both modern intelligence and legacy fallback. The exact regression
failed before the production fix.

The bounded vocabulary now retains explicitName, current/none reference and date
intent. Date lookup reuses the existing explicit-customer/booking-coherence guard
already used for amount and status. The existing fact_lookup plan/evidence contract
requires saved_date, explicit_customer_identity, canonical_customer_relationship,
unique_resolved_record and, for contextual booking language, coherent_contextual_booking.
Planner/evidence production code is unchanged; legacy remains outside the modern
evidence gate and shares only the existing identity/coherence resolver.

A unique B-only request returns October 6, 2026 at 13:00 even with A active. B plus
B's selected job returns the same appointment. B plus A's current job clarifies,
never substitutes A's date and never guesses another booking. Same-customer and
context-only requests retain A's October 5 at 10:00. Unknown/ambiguous customers,
multiple unselected bookings, missing canonical identity and stale/foreign/suspended
context fail safely. Invalid or conflicting scheduling evidence remains refused
under the established tenant-aware date authority. No scheduling writer or stored
record changed. Existing ordered customer references are not parsed as names.

Validation: vocabulary 139/139; intelligence 103/103; planner 37/37; evidence 44/44;
owner context 196/196; rendered composer 190/190 (six focused files, 709/709).
The complete relevant GrowthAI/composer suite passed 22 files / 906 tests, zero
failures/skips, preserving the previous 870-test checkpoint. Booking facts, service
resolution and the earlier temporal, estimate, amount and status repairs remain green.
Nine new rendered appointment/lifecycle cases cover both "When" and "What" forms,
canonical values or clarification, zero provider-router/generation calls, unchanged
credits and unchanged synthetic business data. Reset, tenant/identity switch and
customer/booking replacement remain covered. Lint and production build passed;
existing large-chunk and Firestore dynamic-import warnings remain.

This is an appointment/date entity-association integrity repair, not a new capability,
generalized resolver, scheduling change or legacy evidence-gate migration. Only this
blocker is closed. The interrupted freeze audit may resume from this appointment-date
boundary; it was not performed in this repair. Overall batch freeze and manual
owner/wife, physical-device, provider, staging/security and release gates remain open.
Mobile Tap to Pay remains post-V1.

## Explicit customer and contextual booking status integrity repair (2026-10-04)

The demonstrated booking-status association blocker is repaired. Before editing,
"What's Synthetic B's status for that job?" with Synthetic A active discarded B
and the requested status field. Modern intelligence selected a generic upcoming
booking summary with sufficient confidence; legacy fallback returned A's scheduled
status. The new exact regression failed before the production edit.

The existing vocabulary now retains explicitName, current/none reference and status
intent for this bounded possessive request. The existing fact_lookup plan carries
booking status as its terminal field; it requires saved_status,
explicit_customer_identity, canonical_customer_relationship and, when contextual,
coherent_contextual_booking. Status uses the existing lookup/resolver and evidence
gate, not a new capability or resolver. Formatting reads the gated status value.

A uniquely resolved B-only request returns B's completed status even with A active.
B plus B's selected job also returns completed. B plus A's current job clarifies
rather than borrowing A's scheduled status or guessing another B booking. Same-
customer and context-only requests retain scheduled. Unknown/ambiguous customers,
missing identity, multiple unselected bookings, and missing/stale/foreign/suspended
booking context fail safely. Missing canonical status is insufficient evidence.
Legacy fallback shares the explicit customer/booking coherence guard; it remains
outside the modern evidence architecture and cannot silently substitute A for B.

Validation: intelligence 91/91; planner 35/35; evidence 43/43; vocabulary 136/136;
owner context 187/187; rendered composer 181/181 (six focused files, 673/673).
The complete relevant GrowthAI/composer suite passed 22 files / 870 tests, with
zero failures/skips. It includes booking facts and canonical service resolution,
and preserves the prior 835-test checkpoint. Eight new rendered status/lifecycle
cases prove canonical values or clarification, zero provider-router/generation
calls, unchanged credits and unchanged synthetic business data. Reset, tenant/
identity switch and customer/booking replacement remain covered.
Lint, production build and diff check passed. Existing large-chunk, Firestore
dynamic-import and CRLF warnings remain; no skips, timeout changes or weakened
assertions were introduced.

No persistent state, database access, schema, booking writer, scheduling, provider,
payment, authentication, rules or mobile changes were made. This is a supported
booking-status integrity repair, not generalized entity resolution or legacy
evidence-gate migration. Only this blocker is closed: the interrupted freeze audit
can resume at this status boundary, not restart previously certified boundaries.
Overall batch freeze and manual owner/wife, physical-device, provider and staging/
security/release acceptance remain open. Mobile Tap to Pay remains post-V1.

## Explicit customer and contextual booking amount integrity repair (2026-10-04)

The modern wrong-customer amount blocker is repaired. Before the production edit,
active Synthetic A ($180) plus "How much are we charging Synthetic B for that job?"
produced an answerable current-context plan with no explicit entities, sufficient
evidence for A and the visible $180 answer. The new regression failed while the
70 existing intelligence tests passed.

The existing vocabulary boundary now retains the explicit name and current/none
reference for this bounded charging-request family. The modern lookup plan carries
both explicit customer and contextual booking, using existing fields and fact_lookup.
A name-only request requires one canonical customer and one booking; explicit B
can replace active A and return B's saved amount. With "that job/booking/appointment"
or "their job", the current selected booking must agree with the explicit canonical
customer. A conflicting, absent, foreign, suspended or removed booking reference
clarifies; the resolver does not guess a different booking. Same-customer and
context-only requests retain their valid amounts. Multiple customer identities
or unresolved names clarify. Multiple bookings require explicit current selection.

The existing planner declares explicit_customer_identity,
canonical_customer_relationship and, for dual references,
coherent_contextual_booking evidence requirements. The existing evidence gate
independently rejects wrong-customer operands and contradictory context even when
an executor result is supplied directly. Legacy amount fallback uses the same
retained identity/relationship check rather than silently substituting active A.
No new capability, generalized entity resolver, memory, evidence architecture,
database access, schema, writer, scheduling or provider behavior was introduced.

Validation: intelligence 81/81; planner 33/33; evidence 42/42; owner context 178/178;
vocabulary 131/131 (five focused files, 465/465). Booking facts 48/48 and service
resolution 10/10 passed separately. Six new rendered amount/lifecycle cases passed;
the complete composer passed 173/173. The complete relevant GrowthAI suite passed
22 files / 835 tests with zero failures/skips. Rendered tests verify correct B-only
values or clarification, unchanged credits and synthetic data, and zero provider
router/generation calls. Reset, tenant/identity switch and context replacement
regressions pass. Lint, production build and diff check passed; existing React
act(...), large-chunk, Firestore dynamic-import and CRLF warnings remain.

Only this specific association blocker is closed. The interrupted freeze audit
may resume from this blocker location; it was not rerun during this repair.
Overall batch freeze and manual owner/wife, physical-device, provider and
staging/security/release acceptance remain open. Mobile Tap to Pay remains post-V1.


## Legacy contextual linked-estimate integrity repair (2026-10-04)

The contextual linked-estimate blocker is repaired. Before the production edit,
the actual packet/router/resolver path selected Synthetic A's booking but returned
Synthetic B's $240-$260 estimate for "What did we quote them for that job?".
The regression failed with answer instead of clarify; the other 162 owner-context
tests passed. The old consistency check incorrectly depended on explicitName.

Both explicit and contextual booking quote reads now require a non-empty canonical
booking customerId and agreement with each matched estimate's non-empty customerId.
leadId/sourceLeadId identifies an estimate, not proof of customer ownership.
Mismatches or missing required identity clarify without selecting another estimate
or customer. A valid same-customer link preserves the saved range and selected
booking, including when the customer has multiple bookings. Explicit uniquely
resolved customer precedence remains intact. Missing linked records retain the
existing unavailable response; an absent link retains only the existing unique
canonical-customer lookup, with multiple candidates clarifying.

Quotes remain on existing legacy routing, outside the modern evidence gate.
No capability, traversal, memory, database path, schema, writer, provider or
scheduling change was introduced. Current-packet tenant filtering and relationship
revalidation remain required; reset and tenant/identity switch behavior remains
covered. This closes only the demonstrated contextual association blocker.

Validation: owner context 177/177; vocabulary 131/131 (308/308 focused);
booking facts 48/48; service resolution 10/10; evidence 39/39; planner 31/31;
intelligence 70/70 (198/198 additional focused). Eight selected rendered quote
cases passed, including five new contextual/lifecycle cases and three existing
explicit cases. The complete composer passed 167/167; the complete relevant
GrowthAI suite passed 22 files / 812 tests with zero failures/skips. Rendered
checks assert no provider-router/generation calls, unchanged credits and unchanged
synthetic business data. Lint, production build and diff check passed. Existing
React act(...), large-chunk, Firestore dynamic-import and CRLF warnings remain.

Resume the interrupted freeze audit from the contextual quote path after this
repair; the audit was not rerun here. Overall batch freeze and manual owner/wife,
physical-device, provider and staging/security/release acceptance remain open.
Mobile Tap to Pay remains post-V1.


## Legacy estimate creation-date timezone repair (2026-10-04)

The host-dependent estimate creation-date blocker is repaired. With the saved
absolute createdAt 2026-10-04T04:00:00Z and an America/Chicago tenant, the actual
selected-estimate legacy response previously showed Created 10/4/2026 under UTC.
It now shows Created 10/3/2026 under UTC, Chicago, Los Angeles, Tokyo and Kiritimati
hosts. Presentation uses the current authorized packet's tenant/business timezone
and the existing localDateParts utility, never a host timezone or implicit UTC.

The estimate writer's absolute ISO timestamp remains authoritative. Existing
Date, epoch-millisecond and Firestore timestamp representations remain supported.
Missing, malformed, non-finite, date-only or timezone-less creation timestamps,
and missing/invalid tenant timezones, return the existing unavailable-date response.
No stored estimate, writer, booking or scheduling behavior was changed. Selection,
saved pricing, linked references and explicit/context behavior are preserved.
This is a legacy presentation repair, not a new capability or evidence-gate migration.

Validation: owner context 162/162; booking facts 48/48; service resolution 10/10;
evidence 39/39; planner 31/31; intelligence 70/70 (six focused files, 360/360).
Owner-context plus booking-fact tests passed 210/210 on each of the five hosts.
Eight new rendered cases cover tenant calendars, invalid evidence and
conversation/tenant/identity resets; the complete composer passed 162/162.
The complete relevant GrowthAI suite passed 22 files / 792 tests, zero failures
or skips. Rendered assertions verify zero provider-router/generation calls,
unchanged credits and unchanged synthetic business data. Lint, production build
and diff check passed; existing React act(...), bundle-size, Firestore
dynamic-import and CRLF warnings remain.

Only this blocker is closed. The interrupted freeze audit may resume at the
remaining legacy-bypass inventory; it was not resumed in this repair. Overall
batch freeze, integrated owner/wife acceptance, physical-device, provider and
staging/security/release gates remain open. Mobile Tap to Pay remains post-V1.


## Legacy quote explicit-customer integrity repair (2026-10-04)

The freeze-blocking wrong-customer quote is repaired. Before editing, the exact
request "What did we quote Synthetic B for that job?" returned active A's
$170-$190 estimate instead of B's $240-$260 range. The existing quote request
now retains the explicit name in explicitName. Exact name resolution requires
one canonical customer ID in the current authorized packet and one quote-bearing
booking (or, without a booking, one eligible estimate). Explicit identity outranks
active, stale or foreign conversation references; "that job" cannot substitute
A for B. Missing/duplicate names, multiple candidate bookings, missing canonical
customer identity and mismatched linked-estimate identity clarify locally.
Opaque quote wording also clarifies rather than discarding a possible explicit
customer. Context-only and same-customer quote requests retain existing behavior.

No new quote capability, database access, memory or evidence architecture was
introduced. Modern quote interpretation remains unsupported; existing legacy
routing/linked-estimate lookup supplies the response. Legacy evidence-gate
migration remains deferred. Stored quotes/bookings and scheduling writers were
not changed. Existing conversation/tenant/identity reset tests remain green.

Validation: vocabulary 131/131; owner context 132/132 (263/263 focused);
booking facts 48/48; service resolution 10/10; evidence 39/39; planner 31/31;
intelligence 70/70 (198/198 additional focused). Three new rendered quote cases
passed, including B's correct visible range and unresolved/ambiguous clarification;
the complete composer passed 154/154 in the final relevant suite: 22 files,
754/754 tests, zero failures/skips. Rendered checks prove zero provider-router
and generation calls, unchanged credits and unchanged synthetic business data.
Lint, production build and diff check passed; existing React act(...), bundle-size,
Firestore dynamic-import and CRLF warnings remain. The final aggregate was rerun
after the last quote guard/test edits; the earlier intermediate run was 752/752.

This specific explicit-reference blocker is repaired. Resume the interrupted
freeze audit at the remaining legacy-bypass inventory; this task did not perform
that audit or certify overall batch freeze/release readiness. Physical-device,
provider, staging/security, integrated workflow and wife-beta gates remain open.
Mobile Tap to Pay remains post-V1.

## Legacy historical scheduling integrity repair (2026-10-04)

The reproduced legacy history defect is repaired: a completed booking with
2026-02-30, scheduleError and null scheduledMillis can no longer produce
"Most recent: 2026-02-30." Historical dates reuse the strict calendar-component
validator and must also have no projected scheduling error and a finite
scheduledMillis. Raw dates never resurrect scheduling rejected by the projection.
The existing tenant-local scheduled-start authority remains unchanged; no host
calendar fallback, stored booking migration or scheduling-writer change was made.

Only usable completed records participate in most-recent selection, ordered by
their canonical scheduled instant. Mixed valid/invalid history reports the latest
valid date; all-invalid history retains the existing unknown-most-recent wording.
The completed-record count still describes records present, not valid date evidence.
Completed/field-completed eligibility, tenant/customer scope, explicit context
selection and lifecycle invalidation remain unchanged.

Validation: owner context 121/121; booking facts 48/48; intelligence 70/70;
evidence 39/39; planner 31/31; service resolution 10/10 (319/319 focused).
UTC, America/Chicago, America/Los_Angeles and Asia/Tokyo each passed 169/169
booking/context tests. Three new rendered history cases passed; the complete
composer file passed 151/151 as part of the relevant GrowthAI/composer suite:
22 files / 734 tests, zero failures/skips. Rendered cases confirm zero provider,
provider-router and generation calls, unchanged credits and unchanged business
data. Lint and production build passed; existing React act(...), chunk-size,
Firestore dynamic-import and CRLF warnings remain.

This specific legacy-history blocker is resolved; the broader freeze audit may
resume but has not been completed by this repair. History remains a legacy
owner-context response outside the modern evidence/confidence gate, not a new
history capability. Overall batch freeze and release acceptance remain pending.
Physical-device, provider, staging/security, integrated workflow and wife-beta
gates remain open; mobile Tap to Pay remains post-V1.

## Canonical booking scheduled-start repair (2026-10-04)

The owner-approved authority contract now governs Assistant booking projection:
valid saved date + startTime + current tenant/business timezone defines the
scheduled start. Every present scheduledAt must be a valid absolute timestamp
representing exactly that instant; malformed, null or conflicting timestamps
are insufficient evidence, never ignored. Timestamp-only records require a valid
absolute scheduledAt; calendar fields are derived only with a valid tenant timezone.
Date-only records without a valid timestamp are insufficient evidence. Invalid
local dates/times, missing timezone for local scheduling and DST gaps/folds fail
closed rather than fabricating noon, midnight or a host/browser timezone.

The existing growthAITemporalConstraint.js supplies the pure local-clock conversion
using explicit-zone Intl parts and uniquely round-tripped UTC instants.
growthAIBookingFacts.js resolves scheduling once for the scoped owner projection.
The same scheduledMillis drives upcoming eligibility and next-booking ordering
for modern and legacy routes. Scheduled bookings require start > reference;
cancelled/completed/archived/deleted exclusions and the existing valid in-progress
exception remain. Invalid active scheduling cannot produce a sufficient empty
booking result: both routes return an honest insufficient-evidence limitation.
No stored booking, scheduling writer, schema, provider or database authority changed.

Reproduction: Chicago at 2026-10-04T16:30:00Z is 11:30 local. The old projection
assigned all October 4 bookings host-local noon, ignoring 10:00/13:00/16:00.
The repaired starts are 15:00Z/18:00Z/21:00Z; only 13:00 and 16:00 qualify, with
13:00 selected next. UTC, Los Angeles, Chicago, Tokyo and Kiritimati host runs
each passed 147/147 booking/context tests with identical projected selection.
Boundary coverage includes tenant midnight, positive/negative and fractional
offsets, exact-start exclusion, valid/invalid/conflicting timestamps, optional
absolute-timestamp history and modern/legacy agreement.

Validation: booking facts 48/48; owner context 99/99; intelligence 70/70;
evidence 39/39; planner 31/31; service resolution 10/10 (297/297 focused).
Composer 148/148; complete relevant GrowthAI/composer suite 22 files / 709 tests,
zero failures/skips. Three new rendered cases also passed under UTC and Kiritimati
(3/3 per host; other cases deselected for these extra focused runs), proving
correct next/compound output and honest timestamp rejection with zero provider,
router/generation calls, unchanged credits and unchanged synthetic business data.
Date-only success fixtures now carry valid start times; invalid-data coverage remains.
An initial composer run reported those stale fixture failures and an unexpected
worker exit; the worker error did not recur in the clean composer or aggregate run.
Lint, production build and diff check passed. Existing act(...), large-chunk,
Firestore dynamic-import and CRLF warnings remain.

This scheduling blocker is repaired under the approved contract. Existing writer
timestamps can conflict with tenant-local fields and will now require review;
the Assistant does not repair or rewrite historical scheduling truth.
The broader freeze audit may resume but was not performed here. Other legacy
context replies still bypass the full evidence gate and remain audit limitations.
No batch-freeze, integrated owner/wife acceptance or release readiness is claimed.
Manual/device/provider/deployment gates stay open; mobile Tap to Pay stays post-V1.
No staging, commit, push, deployment or provider/production action occurred.

## Legacy tenant-local temporal repair (2026-10-04)

A focused regression reproduced the freeze blocker before the repair. At
2026-10-04T04:00:00Z, a Chicago tenant's local date is October 3. The modern
"What do I have tomorrow?" selected October 4, but the legacy
"What am I doing tomorrow?" used host-local Date methods and selected October 5
on a UTC host.

The existing pure temporal range resolver is now extracted into
growthAITemporalConstraint.js and shared by both routes. Timezone authority stays
with the current authorized owner packet, projected from tenant businessSettings
timeZone or the existing tenant timeZone field. Legacy today, tomorrow and this
week filter saved booking dates using the same tenant-local ranges as modern
intelligence, including the Monday-start week. Missing/invalid timezone returns
local clarification, never a host/UTC fallback. No routing vocabulary, canonical
booking eligibility, context lifecycle, planner, provider or database authority
was changed; no temporal state was added.

Validation: owner context 91/91; intelligence 70/70; service resolution 10/10;
evidence 39/39; planner 31/31. These five focused files passed 241/241 on a
Los Angeles host timezone. Owner context, intelligence and the full rendered
composer passed 306/306 on a UTC host timezone (composer 145/145).
The complete relevant GrowthAI/composer suite passed 22 files / 659 tests with
zero failures/skips, preserving the 645-test baseline and adding 14 regressions.
Coverage includes Chicago/Tokyo date differences, tenant midnight, today/tomorrow,
Monday-start week, missing/invalid timezone, foreign prior context and modern/legacy
selection agreement. Rendered legacy output selects October 4, not October 5,
with zero provider/router/generation calls, unchanged credits and business fixtures.
Lint and production build passed; existing act(...), large-chunk, Firestore
dynamic-import and CRLF warnings remain.

The specific legacy relative-date blocker is repaired. The broader freeze audit
may resume but was not resumed in this slice. Other legacy context replies still
bypass the new evidence gate and require the remaining freeze review; this is not
a certification of all legacy paths or overall release readiness. All manual,
device, provider and deployment acceptance gates remain open; Tap to Pay remains
post-V1. No commit, push, deployment or production/provider action occurred.

## Named service operand integrity repair (2026-10-04)

The freeze audit reproduced an incorrect sufficient-confidence answer: an explicit
Canonical Deep + Standard total included Other Deep because it shared the deep
classification. The old union/substring matching returned $450 instead of $250.

Named calculations now extract bounded independent selectors from the existing
calculation framing. A shared resolver, reused by comparison and calculation,
prefers one unique exact canonical name over classification fallback. Classification
fallback must itself be unique; missing, ambiguous or repeated operands fail closed.
No category aggregate, fuzzy search, new operation or larger operand bound was added.
Operand order now follows selector order rather than incidental catalog order.

Plans declare intended_service_selectors and selector entities. The evidence gate
re-resolves those selectors against the current scoped packet and requires the exact
ordered operand references; valid arithmetic alone cannot bless extra, substituted
or omitted operands. Field provenance includes the requested selector and exact-name
or classification match. Established contextual comparison-pair totals retain their
existing two-reference authority. No context state or provider behavior was changed.

Validation: shared service resolution 10/10, intelligence 70/70, evidence 39/39,
planner 31/31 (focused total 150/150); full composer file 144/144; complete relevant
GrowthAI/composer suite 22 files / 645 tests passed with zero failures/skips. Lint,
production build and diff check passed. Existing act(...), large-chunk, Firestore
dynamic-import and CRLF warnings remain. Rendered regression proves the intended
two names and $250 total, rejects the unwanted third service/$450, and retains zero
provider/router/generation calls, unchanged credits and no informational mutations.
Scoped-packet, stale/foreign pair and existing lifecycle tests remain green.

This specific canonical-selection blocker is repaired. Resume the broader freeze
audit before committing the accumulated batch; no full freeze acceptance or V1
release readiness is claimed. Legacy context replies still bypass the new evidence
gate; that limitation was deliberately not migrated in this repair. Unrelated dirty
work and the protected patch remain preserved. No payment, Stripe, auth, rules,
mobile, provider, production, commit, push or deployment action occurred.
Tap to Pay remains post-V1; manual/device/provider release gates remain open.

## Bounded canonical evidence gate checkpoint (2026-10-04)

Existing deterministic capability plans now pass through a stateless evidence gate.
Descriptors identify source class, typed canonical reference, requested field/value,
current tenant scope and provenance without copying entire records. Classes are
canonical field, canonical relationship, context reference, derived deterministic
value and temporal constraint. Interpretation and context select records; neither
is an independent factual authority. Current scoped packet data remains authoritative.

Priority preserves explicit unique selectors over active context, canonical customer
ID relationships over name rematching, and exact unique service names over broader
classification matches. Context references are revalidated on every request; stale,
foreign or ambiguous references fail closed. A valid explicit replacement is not an
unresolved conflict. Confidence states are sufficient, needs_clarification,
insufficient_evidence, unsupported and invalid_stale_evidence, with no scores or
percentages and no separate persistent state. Existing conversation, tenant and
identity resets remain unchanged.

The gate consumes plan evidence requirements, validates required canonical inputs,
and checks compound fields against one booking chain. Calculations retain the exact
bounded operands and integer cents; comparisons retain configured price operands.
Temporal descriptors retain the tenant-local range but do not prove bookings exist.
Derived outputs and selected record sets must agree with the canonical inputs.
Missing required fields do not become zero or a partial compound answer.
Supported ambiguous/missing facts stay local as clarification or honest limitation;
unsupported plans retain the existing workflow/provider fallback. Sufficient
deterministic requests remain read-only and consume no provider calls or credits.

Validation: evidence 35/35, planner 30/30, intelligence 65/65; two new focused rendered
checks passed; complete relevant GrowthAI/composer suite 21 files / 624 tests passed,
including all 587 baseline tests. Lint and production build passed. Existing
act(...), large-chunk and Firestore dynamic-import warnings remain. Rendered coverage
retains customer facts, relationships, comparisons, calculations, temporal compounds
and lifecycle resets, and adds explicit contact replacement plus missing-amount
compound refusal. Saved contact information remains a loaded-record snapshot, not a
verified current customer profile. The gate trusts the existing authorized packet
projection; it adds no database access or independent real-world verification.

Next: manual owner acceptance and final review before freezing the full dirty
intelligence batch. No full-web aggregate or release acceptance is claimed here.
Payment, Stripe, auth, rules, mobile and provider infrastructure were untouched.
All real-cloud/device/provider release gates remain open; Tap to Pay stays post-V1.
No commit, push or deployment.

## Bounded capability planning checkpoint (2026-10-04)

The deterministic Assistant's existing fact, temporal, traversal, comparison and
calculation operations now share one bounded plan contract. It declares selectors,
typed context references, constraints, terminal fields, required capabilities,
execution stages and canonical evidence requirements. Existing executors remain
authoritative; unsupported compositions fall through to existing routing. Planning
success remains separate from evidence sufficiency and clarification.

Supported compositions: fact, temporal fact, traversal fact, temporal traversal
fact, comparison, calculation and temporal calculation. Traversal plus calculation
is not implemented and remains rejected. Limits: three capabilities, six stages,
seven relationship transitions, five explicit comparison selectors and five
calculation operands. No planner memory, provider/tool selection or new business
capability was introduced. Explicit contextual pair totals retain pair authority
instead of being interpreted as whole-catalog totals.

Validation: planner 30/30; intelligence 65/65; focused composer 3/3; complete
relevant GrowthAI suite 20 files / 587 tests; lint and production build passed.
Canonical visible values, zero-credit execution and existing conversation/tenant/
identity reset semantics remain covered. Existing test/build warnings remain.
Next: manual owner acceptance and final review of the full uncommitted intelligence
batch. All device, real-cloud, provider and release gates remain unchanged.
Tap to Pay remains post-V1. No commit/push/deployment.

## Bounded temporal reasoning checkpoint (2026-10-04)

The deterministic intelligence layer now normalizes only today, tomorrow, this
week, a weekday, and a simple numeric or named month/day into a tenant-local
date-key range before using the existing authorized booking packet. The business
timezone and injectable reference instant are required; no machine timezone is
used as authority. The V1 week starts Monday. A weekday means the next occurrence
including the reference local day, and a month/day uses the reference local year.

Temporal ranges compose with existing booking count/first-booking context,
relationship traversal and bounded booking sum/average operations. Filtering is
inclusive at the local start date and exclusive at the following date boundary,
then uses existing canonical eligibility and ordering. Missing/invalid timezone
or date, unavailable records and bounds failures remain honest; unsupported
periods, scheduling recommendations, optimization and arbitrary date ranges are
not intercepted.

Validation: focused intelligence tests 65/65 passed, including injected
America/Chicago day/week/weekday/date boundaries, tenant filtering, temporal
calculations and the workflow-versus-temporal interception boundary. The relevant
GrowthAI suite passed 19 files / 555 tests; lint, production build and diff check
passed. No provider, router, generation, credit or mutation path was added. React
act(...) test-hygiene warnings remain. No backend, payment, auth, rules, mobile,
production or provider changes occurred; Tap to Pay remains post-V1.

## Bounded deterministic calculations checkpoint (2026-10-04)

The deterministic intelligence layer now supports one explicit `calculate`
operation over a small set of already-authorized canonical records. It can total
two explicitly resolved configured services, reuse an established two-service
comparison pair for a total, average a bounded configured service set, and total
or average an explicit next 1-5 upcoming bookings. Calculation inputs retain
only canonical references and validated integer-cent values as evidence.

Booking amounts are converted once to validated cents before aggregation; sums,
differences and nearest-cent averages use integer arithmetic. Missing, malformed
or stale amounts, unavailable catalogs, ambiguous context, fewer bookings than
requested, and sets larger than five fail closed with clarification or insufficient
evidence. The Assistant does not substitute zero, infer a service, select a pair,
or use historical/reporting data. This extends the existing comparison primitive;
it does not create an estimate-range comparison, second natural-language system,
analytics engine, query path, memory, recommendation or action capability.

Validation: focused calculation/intelligence tests 62/62; focused rendered
composer calculation test passed; relevant GrowthAI suite 19 files / 552 tests;
lint, production build and diff check passed. Local synthetic owner-browser
checks confirmed next-two-booking total, direct configured-service total and
comparison-pair follow-up total, with unchanged five-credit balance, no provider
routing/mutations and no console errors. Existing build bundle/dynamic-import
warnings remain. No full-web aggregate, real-cloud/device/provider or release
acceptance is claimed.

Only the existing intelligence module, focused unit/composer tests and these
three status documents changed for this capability; prior dirty work remains
preserved. No backend, payment, Stripe, auth, rules, mobile, production or
provider changes occurred. Tap to Pay remains post-V1. Next: manual owner
acceptance of bounded calculations; extend only through a separately defined
canonical operation and bounded evidence contract. No commit/push/deployment.

## Bounded relationship traversal checkpoint (2026-10-04)

The deterministic intelligence layer now supports a small reusable multi-hop plan:
start from the next booking or one uniquely matched current customer booking,
then traverse only approved booking relationships to customer, service, saved
booking amount, schedule and saved contact phone. Plans carry explicit ordered
hops and terminal fields; answers retain only the selected booking reference and
field names as evidence. No graph engine, persistent memory or new query path was
introduced.

Supported combined reads include next customer + service + amount, next booking +
customer payment, next customer + phone, uniquely named current customer service +
amount, and the booking after a uniquely named current customer's single booking.
Direct service configured-price lookup and comparison remain separate capabilities.
A customer with multiple current bookings cannot anchor an "after" request: the
Assistant asks for the exact booking. Missing/ambiguous customer names, absent next
booking, missing canonical customer link, missing terminal field, stale context and
unauthorized packets fail closed without borrowing data from another record.

Validation: focused traversal/intelligence plus composer tests 196/196; relevant
GrowthAI suite 19 files / 547 tests; lint, build and diff check passed. Local
browser checks verified next booking → customer/service/amount, ordered traversal
from a unique booking, missing-phone honesty and multiple-booking clarification,
with no console errors, router/generation calls, credit changes or mutations.
Existing bundle/dynamic-import build warnings remain. No full-web aggregate or
real-cloud/device/provider/release acceptance is claimed.

Only the existing intelligence module and focused/page tests changed alongside
these three status documents. Existing context/vocabulary behavior and unrelated
working-tree changes remain preserved. No backend, payment, auth, rules, mobile,
production or provider changes occurred. This is not generalized customer search,
historical relationship traversal, recommendation/ranking, arbitrary graph
reasoning or autonomous action. Tap to Pay remains post-V1.

Next: manual owner acceptance. A later slice may add another explicitly bounded
canonical relationship only after defining its start, hop, evidence and ambiguity
rules; do not broaden traversal automatically. No commit/push/deployment.

## Canonical service comparison checkpoint (2026-10-04)

The existing deterministic intelligence layer now supports configured service-price
comparison: typed service/compare/price plans, exact canonical-name or unique
classification resolution, integer-cent comparison, canonical evidence and visible
formatted prices/differences. Two-service follow-ups reuse the existing service
list; explicit multi-service requests report prices and the min/max difference.
Ties state equal configured prices rather than inventing a winner.

Missing/ambiguous services, duplicate selections, invalid/missing prices and
stale/foreign/suspended context clarify or report insufficient evidence. A "two"
reference never chooses an arbitrary pair from a larger list. The authorized
packet intentionally omits unpriced/invalid services, so absent named matches
report "service or configured price unavailable", not an inferred price.
Customer/booking topic return survives comparison through the unchanged resolver.

Validation: focused intelligence 51/51; relevant GrowthAI/composer regressions
19 files / 539 tests; lint/build passed with existing bundle/dynamic-import
warnings. Twelve local synthetic browser turns verified configured $250/$180
prices and $70 difference, contextual follow-ups, customer return, unknown service
and reset. Zero router/generation calls, unchanged five-credit balance, no
informational mutations; no browser console errors observed. No full-web
aggregate or real-cloud/device/provider/release acceptance is claimed.

Only the intelligence module, its focused tests, composer tests and these three
status documents changed in this slice. Existing context/vocabulary, Home
integration and unrelated dirty work were preserved. No new data access/memory,
recommendation/ranking, duration/profit comparison, backend/payment/auth/rules/
mobile changes or provider generation. No commit/push/deployment. Remaining
release gates stay open; Tap to Pay remains post-V1.

Next: manual owner acceptance; a separately authorized next capability could
compare canonical saved estimate ranges without assuming booking/catalog price
equivalence. Do not start it automatically.

## Deterministic business intelligence checkpoint (2026-10-04)

A reusable local question interpreter now produces entity/operation/field/reference/
temporal query plans before existing workflow routing. A deterministic query layer
consumes the authorized owner packet and the existing typed context resolver;
results distinguish answerable, needs clarification, insufficient evidence and
unsupported. Minimal canonical references/evidence and validated values drive
visible answers. No second memory, new database access or provider is introduced.

Supported classes: upcoming booking counts (including schedule paraphrases), next
booking/customer, selected customer name and saved email/phone, booking service/
amount/date/time, active canonical service lists and selected configured prices.
Today/tomorrow use the existing bounded booking-date resolver. Missing or ambiguous
fields are honest/clarified; stale/foreign/reset references remain guarded.
Unsupported workflows continue through existing context/skill routing.

Validation: focused intelligence/composer 171/171; complete relevant GrowthAI
suite 19 files / 522 tests; lint, build and diff check passed. Existing bundle/
dynamic-import build warnings remain. Eighteen synthetic local composer turns
verified rendered values, catalog selection, topic return, missing contacts and
reset with zero router/generation calls and unchanged five-credit balance. One
existing tomorrow-count expectation was updated from generic clarification to
an explicit canonical zero result; no assertions were removed.

Prior conversational-context/vocabulary modules and tests remain byte-identical
to the starting dirty tree. Prior dirty work remains uncommitted. No backend,
payment/auth/rules/mobile/provider architecture changed. No full-web aggregate
or real-cloud/device/release acceptance is claimed. Tap to Pay remains post-V1.

Limits: only loaded authorized records; saved contacts are not verified live CRM
profiles. No arbitrary dates, historical customer usage, urgency/ranking, service
comparison, calculations or autonomous actions. Home/session teardown still ends
local references. Next: owner acceptance of this query layer, then separately
scope canonical service comparison if requested. No commit/push/deployment.

## Adversarial Assistant discovery checkpoint (2026-10-04)

Twenty synthetic local browser scenarios exercised 357 conversational turns:
193 initial turns plus 164 repair/recheck turns, including a 26-turn freeform
session. Actual replies were reviewed. Bounded aliases repaired existing payment
wording, contact review, next-customer traversal, corrections, catalog price/
duration wording, messy references and past-contact wording. Explicit list
positions now recover suspended context while implicit pronouns remain guarded.
No new capability, persistent memory, backend, auth, rules, payment or provider
architecture was added. Complete repaired chains continued at least four turns.

Booking/estimate/service returns, saved contact, missing-data honesty, reset,
Tenant A/B isolation and guarded handoffs passed their checked paths. No external
provider/generation, credit use or informational business mutation was observed.
Initial wording misses reached the existing local mock router; repaired
continuations were deterministic. This is not universal language coverage.

Remaining quality limits: service comparison still falls back; follow-up advice
is thin and mentions future bookings even when reviewing an estimate; Save/Send/
Improve utterances clarify generically. Urgency/promotion ranking, reply tracking
and full CRM history remain unavailable, not invented. Leaving Home for Drafts/
Activity still ends its bounded local context.

Validation: `npm run test -- --run growthAI GrowthAI` passed 18 files / 484 tests;
lint/build passed with existing bundle/dynamic-import warnings. No full-web
aggregate rerun is claimed. Exact transcripts/classifications are in external
local `assistant-adversarial-qa.json`. Next: manual owner conversation evaluation.
All cloud/device/provider/release gates remain open; Tap to Pay is post-V1.
Prior dirty work is preserved. No commit/push/deployment in this slice.

Last updated: 2026-09-28

This document is the authoritative progress board for the defined customer-facing ServicesOS V1 finish line.

## Scope rule

ServicesOS remains priority one. The frozen wife-beta build proved the baseline owner workflow and exposed real cleaning-business friction; the active V1 branch incorporates that feedback and is now the source for remaining V1 work.

Do not expand V1 because legacy, prototype, or future code exists in the repository. Build only the already-defined customer-facing V1 requirements.

The Employee App is part of customer-facing V1. Mobile Tap to Pay is post-V1 because its native-platform migration would put the current release at material risk. Completed backend/payment foundations remain frozen in this branch and are not to be discarded.

The legacy `ImprovedOnboarding.jsx` / CleanOps-style flow is reference material only. Do not restore it as the production onboarding. New onboarding must use current canonical ServicesOS models and settings.

## V1 basic-capability rule

For V1, a feature family does not need its most advanced future form. V1 ships the smallest safe, useful, connected version of the capability that lets a real service business operate end to end.

Examples:

- routing/navigation V1 = ordered daily work, clear next-job progression, and reliable directions handoff; not route optimization, continuous GPS, fleet telemetry, or mileage automation,
- field safety V1 = emergency actions, tenant-scoped alerting, limited job-safety location when permitted, honest delivery state, and owner review; not a monitoring center, direct police dispatch, or all-day surveillance,
- offline V1 = targeted resilience only where required for safety/critical field actions; not a general offline-first employee platform,
- mobile Tap to Pay = post-V1 Employee App upgrade and native Terminal integration; V1 keeps the completed server/accounting foundations but does not require mobile card-present collection,
- extra-work V1 = employee request → owner/customer approval → authoritative scope refresh; not advanced field quoting or autonomous pricing.

Do not turn a basic V1 capability into a broad platform while trying to finish the release.

## Small-slice execution rule

Protect the late-October launch target by implementing V1 in small, heavily defined slices.

Each coding prompt should contain only one controlled capability delta and must define:

- exact goal,
- exact scope,
- task-specific exclusions,
- files/areas to avoid where relevant,
- acceptance criteria,
- tests/build/validation,
- stop conditions,
- required report-back.

Do not combine owner onboarding, mobile routing, field safety, post-V1 Tap to Pay, and release hardening into one coding task. Complete and validate one slice before promoting the next.

## Current checkpoint

Active V1 branch: `feature/owner-onboarding-v1`

Current branch checkpoint: `f0f287412d4c58316fb85317e0475386452236d6` — `Fix existing customer booking rules`

This board is being reconciled at that current branch HEAD. Historical reports and old test totals are not current-head release validation.

The deployed wife-beta build is older than this branch and cannot validate the newer V1 work.

### Accepted selective PR #9 hardening checkpoint

Selective PR #9 hardening is complete. The implementation record is the three
accepted commits `b3014a5` (customer email boundary), `b760850` (GrowthAI
provider kill switch), and `7337306` (Cloud Function deployment guardrails).
The final reconciliation found no accepted-scope protection still missing.
PR #9 and `hardening/firebase-cost-guardrails` are superseded reference
material and must not be merged or cherry-picked wholesale. The five existing
Stripe/Connect scaling exceptions remain intentional until payment/load
acceptance evidence exists; `stripeWebhook` retains its public invoker policy.
See `PR9_HARDENING_RECONCILIATION.md` for the detailed matrix.

## Overall status

| Area | Status |
| --- | --- |
| ServicesOS Core V1 | ✅ Complete |
| GrowthAI / SLAI Assistant V1 | 🟡 Foundations and first factual-answer fast path implemented; provider acceptance and freeze remain |
| Employee App core field workflow | 🟡 Implemented; integrated physical-device acceptance remains |
| Employee App routing/navigation basic V1 | 🟡 Day progression and directions implemented; human/device acceptance remains |
| Employee App field safety basic V1 | 🟡 Alert flow and bounded offline queue implemented; device/network acceptance remains |
| Employee App Tap to Pay | ⏭️ Post-V1 mobile platform migration and UI |
| Owner/business onboarding | ✅ Canonical stages and explicit final acceptance implemented; end-to-end release acceptance remains |
| Owner SaaS billing | ✅ Monthly/annual lifecycle and Portal code implemented; Stripe environment acceptance remains |
| Customer-job payments / Stripe Connect | ✅ Canonical accounting and shared collection lease implemented; controlled provider acceptance remains |
| Selective PR #9 hardening | ✅ Complete; broader current-head release validation remains |
| Limited local owner-web wife beta | 🟡 Ready with minor non-blocking issues using synthetic emulator data; not release-ready or staging acceptance |
| Customer-ready release | ⬜ Final target |

---

# 1. ServicesOS Core V1 — ✅ COMPLETE

- [x] Multi-tenant architecture
- [x] Authentication and role foundation
- [x] Customer management
- [x] Leads
- [x] Deterministic estimates and pricing foundation
- [x] Bookings
- [x] Residential and commercial booking intake
- [x] Calendar and scheduling foundation
- [x] Repeat-customer workflows
- [x] Web Field Mode
- [x] Required checklist completion controls
- [x] Field photos
- [x] Owner/admin field-photo review foundation
- [x] Business Settings foundation
- [x] Stripe / Stripe Connect foundation
- [x] Firestore / Storage security foundation
- [x] Tenant-isolation foundation
- [x] Customer-approved job scope control
- [x] Canonical tenant add-on catalog
- [x] Employee extra-work request submission and owner review foundation

---

# 2. GrowthAI / SLAI Assistant V1 — 🟡 ACCEPTANCE / FREEZE REMAINS

The V1 foundations and existing workflows are implemented; do not add new product scope or autonomous behavior. The founder-found question “How many bookings do I have coming up?” now uses a narrowly bounded, deterministic factual fast path over the existing authorized tenant booking workspace. It responds naturally, performs no mutation, bypasses provider routing, and consumes no AI credits.

Current focused factual/conversation/page validation passed `118/118`; web lint and production build passed. The earlier free-briefing assertion failure no longer reproduces after the Vitest worker storage fix. Provider-backed test-mode acceptance remains open. Deterministic tenant-scoped retrieval/calculation stays free; credits apply only to explicit provider-backed generation, analysis, interpretation, or research. Consequential actions remain human-approved.

2026-10-04 actual conversation-path verification: a count-only matcher caused "do i have any upcoming jobs" to fall through to the existing Functions router/mock clarification. The bounded existence-question correction now answers that wording and "Are there any upcoming bookings?" locally. Authenticated Tenant A browser checks returned three upcoming bookings for both the exact existence question and the original count question, with no additional conversation-route/generation executions and unchanged 5-credit balance. Focused factual/conversation/page tests passed 123/123; relevant GrowthAI regressions passed 170/170; lint, build, and diff check passed. Booking eligibility and tenant-scoped data authority are unchanged. Provider-backed and broader manual/release acceptance remain open.

Owner vocabulary checkpoint (2026-10-04): 14 intent definitions now route existing information, review, action, help, and navigation surfaces deterministically. Follow-up review is distinct from message drafting; unsupported/ambiguous/colliding requests clarify safely. Corpus: 77 positive examples and 39 negative/ambiguity cases, plus 16 new composer/navigation integrations and three existing booking-fact integrations. Focused GrowthAI validation passed 344/344 across 17 files; lint/build/diff check passed. Browser QA: 11 successful destinations, two expected clarifications, one safely unsupported request; no new router/generation executions or credit usage. No new business capability, data authority, UI architecture, or autonomous action was introduced. Named-customer auto-selection and arbitrary date windows remain intentionally unsupported. Manual owner acceptance and provider/release gates remain open.

- [x] Conversation-first Home
- [x] Business briefing
- [x] Marketing workflows
- [x] Customer communication workflows
- [x] Retention / rebooking detection
- [x] Reputation assistance
- [x] Brand intelligence
- [x] Drafts / Activity
- [x] Human review / approval boundaries
- [x] Provider gateway and tenant isolation
- [x] Credit ledger and customer-facing credit UX
- [x] First-run guide and responsive UI pass
- [x] Answer supported upcoming-booking count questions naturally from the existing bounded, authorized canonical tenant booking workspace; cancelled, archived, deleted, and completed bookings are excluded and recognized questions bypass provider/credits
- [ ] Expand factual business questions only through separately scoped, bounded authorized-evidence slices
- [ ] Re-verify provider-backed behavior only in an explicitly approved non-production/test environment; prior production evidence is historical
- [ ] Re-test inside the current integrated V1 branch/release candidate
- [ ] Close any V1-specific regression findings
- [ ] GrowthAI V1 freeze

The founder/manual owner-web acceptance pass is complete for now; wife beta has not yet been completed on this V1 candidate. It also identified UI polish (not new capability scope) for Services & Pricing, Add-on Catalog, Booking Details, and Edit Customer. See `SERVICESOS_V1_PRE_RESET_HANDOFF_2026-09-28.md` for findings and sequence.

---

# 3. Employee App V1 — 🟡 SUBSTANTIALLY IMPLEMENTED, FIELD CAPABILITIES REMAIN

Project path: `employee-app/`

The Employee App must remain a field-execution client for ServicesOS, not a second independent operating system. Web/admin owns planning and approval; mobile confirms, navigates, executes, and records. Mobile payment collection is post-V1.

## A. Core field workflow — substantially implemented

- [x] React Native Expo application
- [x] Canonical employee authentication through server verification
- [x] Session-gated app shell
- [x] My Day / assigned current and upcoming jobs
- [x] Fresh employee-safe JobPacket
- [x] Job details and approved instructions
- [x] Safety and method guidance
- [x] Start work
- [x] Required checklist progress
- [x] Employee notes / issue reporting
- [x] Before photo evidence
- [x] After photo evidence
- [x] Complete job through server-owned execution path
- [x] SLAI Work Assistant for current authorized work
- [x] Verified employee profile / logout
- [x] Extra-work request UI and server flow foundation
- [x] Tenant add-on catalog consumption in extra-work requests

## B. Basic routing / day progression — V1

V1 routing is the useful field-worker version, not a route-optimization platform.

- [x] Today / upcoming assigned-job list
- [x] Job address available in employee-safe projection
- [x] Native/Google/Apple Maps directions handoff foundation
- [x] Deterministic Today/Upcoming order by date, start time, and booking ID
- [x] Current-job / next-job progression and finished-day state
- [x] Refresh shows changed safe summaries; removal uses a generic workday-change notice
- [x] Directions handoff foundation
- [ ] Owner/admin ↔ employee assignment/day acceptance
- [ ] Physical-device acceptance for directions, refresh, and next-job flow

No generalized messaging or push system is included. Assignment, cancellation, reschedule, and reassignment must be confirmed in integrated acceptance; employee visibility remains enforced by server JobPacket authority.

Explicitly deferred unless re-scoped:

- advanced route optimization
- continuous route telemetry
- all-day/background GPS tracking
- fleet management
- automatic mileage calculation
- broad crew roll call / complex multi-crew logistics

## C. Field Safety / Emergency — basic V1 capability

This is a field-safety tool, not a guaranteed emergency-response system.

- [x] Safety actions in Job Detail and explicit Call 911 dialer handoff
- [x] Call Owner uses only the bounded server-projected business phone
- [x] One optional foreground-location attempt; failure does not block the alert
- [x] Tenant-scoped server-authorized safety alert with job context and event-ID idempotency
- [x] Truthful Sent / Queued / Failed delivery states
- [x] Bounded persistent safety-alert queue, same-event retry on app open/resume, and successful-delivery cleanup
- [x] Read-only owner/admin recent-alert panel
- [x] Tenant/permission tests and Firestore client-denial coverage
- [ ] Physical-device/network/location acceptance

The accepted V1 slice does not add alert acknowledgement/resolution state, missed-check-in monitoring, push notifications, or background GPS. Do not resurrect these from an older checklist without an explicit scope decision.

Explicitly deferred unless re-scoped:

- monitoring center
- direct police/public-safety dispatch integration
- guaranteed emergency-response claims
- hidden recording
- constant live GPS
- all-day employee surveillance
- advanced escalation trees

## D. Extra work / scope refresh — V1

- [x] Tenant add-ons available to employee
- [x] Bounded custom extra-work request
- [x] Employee context/note
- [x] Submitted request reaches owner review foundation
- [x] Owner review creates an approval-ready request using owner-reviewed terms
- [x] Verified customer approval is required before authoritative scope mutation
- [x] Exactly one immutable scope revision is created; duplicate approval is idempotent
- [x] Employee JobPacket reads the new canonical scope on the next normal fetch
- [x] Declined, stale, cancelled, and unapproved requests cannot revise scope
- [ ] Integrated owner → employee → customer → refreshed-job acceptance

## E. Booking payments and Terminal backend — implemented; mobile Tap to Pay post-V1

- [x] Canonical server-owned booking payment/refund/reversal accounting
- [x] Shared Checkout/manual/terminal collection lease
- [x] Employee-specific `canCollectPayments`, owner/admin controlled and default deny
- [x] Employee Terminal backend gateway with assignment/permission checks, server-derived amount/account, idempotency, recovery, and canonical `card_present` reconciliation
- [x] Owner-visible canonical payment/audit history
- [ ] Controlled Stripe test-mode acceptance for booking payment paths
- [ ] Controlled Stripe production acceptance before customer release
- [ ] Employee App Expo/RN migration, Terminal SDK, mobile transport/UI, and physical Tap to Pay acceptance (POST-V1; not a current V1 blocker)

## F. Mobile acceptance / hardening

- [ ] Current V1 Android physical-device pass
- [ ] Session persistence / auth expiration / recovery pass
- [ ] Camera/photo permission pass
- [ ] Foreground location permission behavior for Field Safety
- [ ] Network failure/retry pass
- [ ] Duplicate-submit/idempotency pass
- [ ] Reassignment-away denial
- [ ] Cross-tenant denial
- [ ] Owner → assign → employee execute → owner review physical workflow
- [ ] Real field-workflow acceptance including safety queue recovery

Training-library expansion, office messaging, push notifications, general offline-first sync, payroll/break management, advanced employee management, advanced route optimization, and continuous GPS do not become V1 blockers unless Jamie explicitly re-scopes them.

---

# 4. Owner / business onboarding — ✅ IMPLEMENTED; ACCEPTANCE REMAINS

## Completed secure activation spine

- [x] Server-owned owner/tenant bootstrap
- [x] Verified admin/tenant relationship
- [x] Basic business profile gateway and UI
- [x] Versioned immutable SaaS agreement delivery
- [x] Typed signer + explicit affirmation
- [x] Immutable agreement acceptance evidence
- [x] Owner subscription checkout gateway
- [x] Server-owned Stripe Customer relationship
- [x] Verified `invoice.paid` activation path
- [x] Exact tenant/customer/subscription/Price/quantity validation
- [x] Idempotent/stale-event protections

## Canonical V1 onboarding implementation

The customer must go through onboarding that gathers the information ServicesOS needs to operate correctly. Subscription payment and onboarding completion are separate states.

### Business basics

- [x] Business name
- [x] Phone
- [x] Email
- [x] Timezone
- [x] Business address field exists
- [x] Current canonical business profile/settings boundary is reused

### Services & pricing

- [x] Canonical service catalog and deterministic configured pricing
- [x] Legacy/static fallback remains compatible but cannot satisfy schema-managed onboarding

### Availability / scheduling rules

- [x] Working-day model exists in Business Settings
- [x] Canonical availability days gate onboarding progression
- [x] Other detailed availability/scheduling settings remain in existing Business Settings; no new scheduling architecture was added

### Brand basics

- [x] Valid default branding completes the stage; canonical custom branding is validated and saved through the gateway
- [x] Logo and color customization remain optional

### Customer-payment setup

- [x] Stripe Connect component/foundation exists
- [x] Stripe Connect stage is included and advances only from fresh canonical readiness
- [x] Connect setup can be resumed; no permanent skip completes the stage

### Team

- [x] `owner_only` completes without a fake employee
- [x] `employees` requires a qualifying canonical UID employee and usable delivered activation state
- [x] Canonical employee provisioning uses the server identity gateway

### Finish / resume

- [x] Server-derived progress and resume behavior
- [x] Billing entitlement remains separate from operational `onboardingState`
- [x] Explicit Finish setup revalidates prerequisites and fresh subscription/Connect state before setting operational state active
- [x] Completed schema-managed tenants bypass onboarding; legacy tenants retain compatibility behavior
- [ ] New-owner end-to-end acceptance test without founder/developer help

## Explicitly not required for initial V1 onboarding

- legacy CleanOps `ImprovedOnboarding.jsx` restoration
- data migration/import from multiple platforms
- AI setup wizard
- AI-recommended pricing as authority
- elaborate preview/celebration systems

These may be future improvements after the required operational onboarding works cleanly.

---

# 5. Owner SaaS subscription billing — ✅ IMPLEMENTED; PROVIDER ACCEPTANCE REMAINS

Company platform pricing is:

- $100/month
- $1,000/year
- same normal entitlement either way

## Complete

- [x] Secure platform-account subscription Checkout
- [x] Server-owned tenant/customer metadata
- [x] Quantity locked to 1
- [x] No Connect destination/transfer/application fee on SLAI subscription billing
- [x] Verified paid-invoice activation
- [x] Active linked subscription required before activation

## Implemented contract

- [x] $100 monthly and $1,000 annual plans map to two server-configured canonical Price IDs; browser supplies only the interval
- [x] Checkout quantity is one and both terms grant the same normal entitlement
- [x] Renewal, payment failure/seven-day cure, recovery, scheduled cancellation, and actual termination are handled through canonical webhook state
- [x] Owner billing Portal is available through a server gateway; allowed capabilities are checked before session creation
- [x] Portal supports payment-method updates, invoice history, and cancel-at-period-end; plan switching/pause are disabled

## Release gates

- [ ] Verify separate test/live Price IDs and billing Portal configurations in controlled Stripe environments
- [ ] Test Checkout, renewal, failure/recovery, scheduled cancellation/termination, return routing, and webhook synchronization in test mode
- [ ] Complete live-mode controlled acceptance before customer release

---

# 6. Customer-job payments / Stripe Connect — ✅ ACCOUNTING IMPLEMENTED; PROVIDER ACCEPTANCE REMAINS

This is separate from the owner SaaS subscription.

- [x] Stripe Connect foundation
- [x] Canonical booking checkout foundation
- [x] Honest public return-state behavior
- [x] Webhook-confirmed payment truth foundation
- [x] Manual-payment separation
- [x] Immutable canonical payment, refund, and reversal records with idempotent reconciliation
- [x] Shared server-owned collection lease excludes competing Checkout/manual/Terminal collection
- [x] Cutover tooling is explicit-booking, emulator-only, and dry-run by default; no production cutover occurred
- [ ] Controlled test-mode Connect/Checkout/refund/webhook, fee, tenant-isolation, and failure/retry acceptance
- [ ] Production Connect and booking-payment verification before customer release

Mobile Tap to Pay is post-V1; see Employee App section E. Its backend foundations are complete and remain frozen.

---

# 7. Job scope / extra-work flow — ✅ IMPLEMENTED; INTEGRATED ACCEPTANCE REMAINS

- [x] Residential/commercial intake
- [x] Customer-approved job scope control
- [x] Canonical tenant add-on catalog
- [x] Employee extra-work request submission
- [x] Owner review foundation
- [x] Owner-approved terms transition to customer approval-ready state
- [x] Verified customer approval creates one immutable authoritative scope revision
- [x] Employee JobPacket reads the updated scope on subsequent fetch
- [x] Declined, stale, cancelled, or unapproved requests cannot revise scope
- [ ] Full integrated owner → employee → customer → updated-job acceptance

---

# 8. Security / release hardening — 🟡 CURRENT-HEAD VALIDATION REQUIRED

The code-level slices below are implemented, but prior branch totals and July production reports are not evidence for this HEAD. The selective PR #9 hardening checkpoint is complete; do not merge/cherry-pick that branch wholesale.

- [x] Full current-head web test suite: `npm run test -- --run --reporter=verbose` passed `94/94` files and `844/844` tests, with `0` failures and `0` skipped (exit code `0`, 104.50 seconds). `AppOnboardingRouter`, `GrowthAIPage`, and Field Mode passed in the aggregate run; the earlier aggregate stall did not reproduce. React `act(...)` warnings remain test-hygiene debt, not an established V1 release blocker.
- [x] Full current-head Cloud Functions suite: `495/495` passed, including onboarding/billing lifecycle, payment/refund accounting, shared collection lease, employee provisioning, Terminal backend authority, JobPacket, extra work, Field Safety, and GrowthAI provider controls.
- [x] Employee App API/unit and React Native/auth suites: `95/95` and `99/99` passed.
- [x] Firestore rules suite: `64/64` passed.
- [x] Storage rules suite: `21/21` passed.
- [x] Rules parity and Cloud Function syntax checks passed.
- [x] Web lint passed.
- [x] Web production build passed.
- [x] Expo Doctor: `17/17` checks passed; dependency check is current/compatible and public config resolved.
- [x] Focused Field Mode: `39/39` passed.
- [x] Focused router/auth/onboarding and GrowthAI checks passed: router `24/24`, adjacent auth/onboarding `73/73`, GrowthAI `59/59`, and combined router + GrowthAI `83/83`; the invalid `--localstorage-file` warning is gone.
- Historical targeted web set previously reported as `140/165`: exact file selection was not recorded and cannot be reproduced; it is historical context, not the current acceptance result.
- [ ] Customer identity ownership verification
- [ ] Customer-to-tenant matching
- [ ] Duplicate/cross-tenant `authUid` checks
- [ ] Customer privacy smoke
- [ ] Cross-tenant denial smoke
- [ ] Employee assignment/authorization smoke
- [ ] Field-photo authorization smoke
- [ ] Field-safety tenant/permission and physical-device/network acceptance
- [ ] Current payment/security integration smoke
- [ ] Reproduce and classify known fixed-date/JSDOM failures on current HEAD; fix only current-slice regressions
- [ ] Verify current production Firestore/Storage rules, rules parity, indexes, Storage setup/CORS, object-prefix compatibility, and identity/assignment readiness before promotion
- [ ] Capture current Netlify commit/build and Cloud Functions deployed-revision evidence
- [ ] Verify test/live Stripe Prices, Portal configuration, Connect, booking Checkout, fees, and webhook synchronization
- [ ] Controlled test deployment, wife acceptance, beta-critical fixes, UI fine-tuning, and final release smoke

### Staging infrastructure checkpoint (2026-09-28)

- [x] Isolated Firebase staging project and `ServicesOS Staging Web` app registered; staging `(default)` Firestore database created in `nam5`.
- [x] Deploy reviewed Firestore rules to `servicesos-v1-staging`; CLI reported successful compilation/release, with warnings involving `request`, an unused helper, and `exists` pending review. No rules release/version identifier was exposed; effective deployed-rule correspondence remains unverified.
- [x] Deploy Firestore indexes to `servicesos-v1-staging`; post-deploy listing returned 22 definitions matching source, including the employee-assignment composite index.
- [x] Verify staging composite-index readiness in Firebase Console: 22/22 indexes show `Enabled`, with none Building or Missing. The `bookings` index on `assignedEmployeeAuthUid ASC`, `status ASC`, and `date DESC` (Collection scope) is `Enabled`.
- [x] Run local Firestore rules tests (64/64) and rules parity (passed).
- [x] Read-only staging anonymous-access smoke: unauthenticated GET for a synthetic nonexistent user document returned HTTP 403 `PERMISSION_DENIED`; no staging data was written.
- [ ] Verify authenticated staging same-tenant admin/customer access, customer ownership, assigned-employee access and unassigned-employee denial, cross-tenant denial, spoofed identity/tenant attempts, and authenticated direct-client write restrictions. Representative staging identities and tenant/booking data do not exist and safe bootstrap was unavailable; these remain unverified, not failed. Emulator results do not prove deployed behavior.
- [ ] Review staging rules warnings and verify effective deployed rules correspond to candidate source. Warnings trace to an unused field-photo metadata-create helper chain; active `fieldPhotos` rules deny direct client creates and no active allow rule calls that helper. No code change was made; warnings remain pending review, and this does not prove effective deployed-rule correspondence. These tasks can proceed on Spark and do not require Blaze.
- [x] Enable staging Email/Password Auth and authorize `servicesos-v1-staging.netlify.app`; no staging users were created and production Auth was untouched.
- [x] Enable Google Auth for current web sign-in with approved public-facing name `ServicesOS by Stellar Logic AI` and support email `stellar.logic.ai@gmail.com`.
- [ ] Initialize staging Storage in the approved matching region (`us-east1`); blocked until staging is upgraded to Blaze.
- [x] Configure the six Firebase client variables on the isolated `servicesos-v1-staging` Netlify site. Manual dashboard verification confirmed all six names and `VITE_FIREBASE_PROJECT_ID=servicesos-v1-staging`; configuration was performed manually because connector writes did not persist. No application build/deploy was triggered, no production configuration changed, and no `VITE_FUNCTIONS_URL` or provider/server-secret variable was added.
- [ ] Confirm staging deployment controls, then deploy only a reviewed application candidate. Firestore rules/indexes alone have been deployed; no Functions, Storage rules, Hosting, or web application deployment has occurred.

### Local wife-beta emulator verification (2026-09-28)

- [x] Functions discovery succeeded on two actual starts; both reached “All emulators ready.” The earlier timeout did not reproduce, its root cause remains unknown, and no code fix is justified by current evidence.
- [x] Reset/seed against `demo-servicesos-v1-smoke-local`: five synthetic personas, 22 Firestore documents, and local upload fixtures. Tenant A admin login, business data, and bookings rendered; the Tenant B business marker was absent from normal Tenant A dashboard/bookings views.
- [x] Local service-catalog, add-on-catalog, and owner-safety-alert reads executed through Functions.
- [x] Business Settings automatically invoked `getConnectedAccountStatus`; the seeded tenant had no Stripe account pointer, and the local handler returned before any Stripe request. No provider request occurred. Keep local beta synthetic and do not add real Stripe/Connect state or credentials.
- [x] Firebase CLI may inject its signed-in user credential-file path into the Functions child. Runtime used the demo project and loopback Auth/Firestore/Storage hosts; no real Firebase project or external provider access was observed. Credential-file contents were not inspected.
- [x] Close the existing-customer booking rules/schema mismatch found during founder/manual acceptance (`f0f287412d4c58316fb85317e0475386452236d6`, `Fix existing customer booking rules`). Residential booking works; bounded commercial shape is supported; commercial-only residential fields and unknown/untrusted fields remain denied; tenant/role/payment protections remain intact. Firestore rules passed `65/65`, parity passed, focused web tests passed `26/26`, and a seeded Tenant A local transaction succeeded; the temporary booking was removed.
- [x] Jamie completed the founder/manual owner-web pass to catch obvious workflow blockers and operational/UI friction before wife beta.
- [ ] Complete the limited owner-web wife-beta session using synthetic emulator data for usability, navigation, customer/booking workflows, and UI-friction discovery. Wife beta has not yet been completed on this V1 candidate. Status: **ready with minor non-blocking issues**; this is not release-ready or Blaze-backed staging acceptance.
- [ ] Review minor local warnings: stale `.env.v1-smoke` Functions comment; repeated “multiple emulator instances” warning that did not prevent discovery; existing Functions-version warning; missing local email configuration. None is established as a local wife-beta blocker.
- [ ] Complete Blaze-backed Storage/real-cloud Functions acceptance, authenticated staging tenant/security smoke, Stripe/provider acceptance, physical-device acceptance, integrated owner/employee/customer workflow, and final release gates.

No local application/code change is implied by this verification. The previous discovery timeout remains unexplained. The owner-web smoke also incidentally invokes the Connect-status endpoint, which is safe for the seeded tenant only because its canonical Stripe account pointer is absent and the handler exits before contacting Stripe.

The staging project remains on Spark. Blaze is temporarily deferred because Google requires a temporary card authorization hold; this is an operational/cash-flow sequencing decision, not a code or product defect, and no V1 feature scope is being removed. The current plan is to enable Blaze when the business can comfortably absorb the hold, at or after the first paying customer. No billing upgrade has occurred. Storage initialization and real-cloud Functions deployment remain blocked until then.

Work that does not require Blaze may continue: authenticated staging Firestore security smoke once safe representative identities/data are available; review of the pending rules warnings and effective deployed-rule correspondence; Firebase Auth verification; Netlify staging configuration; local/emulator Functions and Storage validation; and non-provider acceptance work. Local rules tests (64/64) and parity passed, and anonymous staging access was denied as expected; these do not prove authenticated deployed-rule behavior. Production Firebase and Netlify remain untouched. Stripe staging/test-mode setup, physical-device acceptance, and wife beta remain open; mobile Tap to Pay remains post-V1. Staging resource creation does not mean ServicesOS V1 is release-ready.

Still required before controlled integrated/device/provider wife-beta acceptance: implement the identified SLAI Assistant natural factual-conversation gap, assistant responsive UI cleanup, owner-web UI polish, a short Jamie regression pass, controlled test deployment, physical Employee App acceptance, and real owner/employee/customer end-to-end workflow acceptance. The founder/manual pass is complete; wife beta is still pending. The aggregate web suite is clean, but React `act(...)` warnings remain test-hygiene debt. Focused GrowthAI passes; provider-backed test-mode acceptance remains open. Android auth persistence/recovery, camera/photos, directions handoff, foreground location, Field Safety queue/recovery/idempotent owner alert, and Stripe Checkout/refund/webhook/Connect/Portal behavior remain manual/device/provider acceptance work.

Still required before customer release: current production-readiness re-audit; deployed Firestore/Storage rules and revision evidence; required indexes; Storage CORS and object-path compatibility; identity/membership and assignment readiness; Netlify/Functions deployment evidence; customer privacy/tenant smoke; and controlled Stripe test/live acceptance. Physical/device acceptance remains open, including Android auth, camera/photos, directions, foreground location, and Field Safety retry/recovery. Mobile Tap to Pay remains post-V1 and is not a V1 or wife-beta blocker.

---

# 9. Wife V1 acceptance — ⬜ PENDING CURRENT-CANDIDATE ACCEPTANCE

The original wife beta has already served as discovery/UX validation and helped define this V1. Jamie has completed a separate founder/manual owner-web pass on the current candidate; wife beta itself is not yet complete. Do not re-test solved beta issues merely because the old build is still deployed. Begin outcome-based wife-beta tasks after the next functional/UI slices and Jamie's short regression pass, using an approved controlled environment.

After the current V1 branch passes integration/release validation and is deployed to a controlled test environment:

- [ ] Give outcome-based tasks, not click-by-click instructions
- [ ] New-owner onboarding
- [ ] Business setup
- [ ] Customer / estimate / booking workflow
- [ ] Customer-approved scope
- [ ] Add-on / extra-work workflow
- [ ] Employee field workflow
- [ ] Basic day/next-job navigation flow
- [ ] Basic field-safety flow
- [ ] Customer-job web/manual payment flow
- [ ] GrowthAI / SLAI Assistant
- [ ] Confirm assignment changes and day progression are understandable
- [ ] Record hesitation/confusion/blockers
- [ ] Fix V1-specific findings
- [ ] Re-test

---

# 10. Customer-ready ServicesOS V1 — ⬜ FINAL TARGET

- [ ] Remaining V1 workflow edges complete
- [ ] Full owner onboarding complete
- [ ] Monthly + annual SaaS billing complete
- [ ] Required post-activation subscription lifecycle complete
- [ ] Employee App core field workflow accepted
- [ ] Employee App basic routing/day progression accepted
- [ ] Employee App basic field-safety capability accepted
- [ ] Integrated security/tests/build green
- [ ] Controlled V1 deployment green
- [ ] Wife V1 acceptance critical findings closed
- [ ] UI fine-tuning pass
- [ ] Customer-facing release smoke green
- [ ] Feature freeze
- [ ] Final release candidate
- [ ] Customer-facing ServicesOS V1

Mobile Tap to Pay is not part of this V1 acceptance checklist; it is explicitly post-V1 work.

---

# Deferred / not allowed to move the V1 finish line

Unless Jamie explicitly changes scope, these do not become V1 blockers merely because code or ideas exist:

- legacy CleanOps flows
- abandoned prototype endpoints
- autonomous AI actions
- unlimited/persistent general chat history
- broad data-import/migration platform
- AI pricing authority
- Training Library expansion
- office messaging
- push notifications
- general/full offline queue beyond narrow critical V1 safety resilience
- payroll/break management
- route optimization beyond the basic approved V1 field flow
- continuous/all-day GPS tracking
- fleet telemetry
- expenses and mileage
- advanced crew-management/roll-call systems
- advanced employee management
- photo deletion/retention automation
- monitoring-center or direct emergency-dispatch platform
- future standalone SLAI products
- Employee App Expo/RN migration, Stripe Terminal SDK, mobile Tap to Pay UX, and physical card-present acceptance (post-V1)

---

# Board maintenance rule

After each validated GitHub push that changes ServicesOS V1 progress:

1. update the relevant checkboxes/status,
2. update the current checkpoint,
3. record the capability just completed,
4. identify the next locked-scope V1 task,
5. do not add new V1 scope without Jamie's explicit decision.

The concise chat progress view should be derived from this document after confirming it still matches the actual active branch.

## Latest bounded Assistant checkpoint

- [x] Local owner context bridge: authorized bookings, canonical customer links,
  eligible open estimates, active canonical service pricing/duration/classification.
- [x] Current-conversation tenant-bound list/selection references; ambiguity and
  stale/foreign-reference denial; identity/tenant/new-conversation reset.
- [x] Information/action separation and existing guarded form handoffs; repaired
  open-estimate and review-response routing collisions.
- [x] Focused current slice validation: 18 files / 376 GrowthAI tests, 6/6 seed
  fixture tests, lint/build/diff check, required synthetic browser chains A-E.
- [x] Local tenant evidence: own booking read 200; foreign booking/customer/lead/
  service reads 403. No generation, credits, or informational writes in the
  required context chains. An extra unsupported paraphrase used mock clarification.
- [ ] Jamie conversational review and separately scoped observed wording polish.

This implementation is uncommitted from `00546f48be98308020d7bc8497122598a4817231`;
it does not supersede earlier aggregate evidence with a new full-suite claim.
Context remains bounded to loaded records and canonical fields, not unrestricted
CRM/history/service knowledge. See the direction document for exact limitations.
Cloud/provider/device/tenant-security/integrated workflow acceptance, wife beta,
and final release gates remain open. Mobile Tap to Pay remains post-V1.

### Result-set continuity follow-up (uncommitted)

- [x] Browser-reproduced count -> first-booking failure repaired through existing
  ordered owner-reference context; count/list use the same own-tenant records.
- [x] Quote preserves booking anchor; next/after-that traversal and stale ordinal
  positions remain safe; no second conversation memory or fixture changes.
- [x] Current focused evidence: Page/context 113/113; 18 GrowthAI files / 379 tests;
  lint/build/diff check. Ten-turn booking chain and broader record continuity were
  inspected semantically; service/group ambiguity clarified instead of guessing.
- [x] Browser identity switching and new-conversation reset cleared old references;
  foreign named lookup denied. Required context chains used no router/generation,
  credits, or informational writes.
- [ ] Seven natural wording/ambiguity gaps and thin briefing/customer-detail/
  follow-up responses require separately bounded triage; do not label generic
  fallback or a rendered workflow as complete conversational acceptance.

The unsupported wording probes still used the existing mock router, without
generation. Exact local response/verdict evidence is outside the repository in
`assistant-result-context-qa.json`. No current full-web aggregate rerun is claimed.
All cloud/provider/device/integrated wife-beta/release gates remain open;
Tap to Pay remains post-V1. No commit, push, or deployment in this slice.

### Conversation-quality triage follow-up

- [x] Reproduce and repair the seven prior wording/ambiguity gaps; contextual
  choices replace generic fallback for plate/sitting/cracks questions.
- [x] Improve the two thin briefings with existing bookings/estimates and useful
  session references; richer selected-record details preserve missing-data limits.
- [x] Continue after every repair; verify booking/estimate/reference chains and
  explicit service selection before guarded marketing handoff.
- [x] Recheck Tenant B isolation and discarded prior/foreign references.
- [x] GrowthAI regression: 18 files / 410 tests; lint/build/diff check passed.
- [ ] Broader natural-language acceptance: fresh sweep had 6 useful replies and
  11 remaining wording, response-quality, ambiguity/priority-limit findings.
  Do not declare generic fallback complete or invent missing urgency/history data.

Repaired deterministic paths had no router/generation calls, credits or business
writes. Fresh unsupported probes still reached the existing mock router without
generation. External assistant-conversation-quality-qa.json records exact replies
and semantic verdicts. All cloud/device/provider/wife-beta/release gates remain
unchanged; mobile Tap to Pay remains post-V1. No commit/push/deployment authorized.

### Natural-conversation follow-up

- [x] Reproduce and classify all eleven prior findings before repair.
- [x] Support bounded booking/customer/price/history/review language families.
- [x] Handle urgency wording with an honest limitation and recorded-work review,
  not a new priority engine.
- [x] Extend original-list traversal to previous/go-back; resolve other-one only
  for two distinct live records, otherwise give actual tenant-safe choices.
- [x] Repair browser-discovered typed-reference mismatch without changing authority.
- [x] Continue all eleven repairs; recheck booking/estimate/reference chains,
  selected-service marketing and tenant-switch rejection of prior/foreign context.
- [x] GrowthAI 18 files / 457 tests; final resolver 58/58; lint/build/diff check.
- [ ] Fresh sweep: two of seventeen remain quality/limitation findings (talk-to
  ambiguity and unavailable reply history); no new communication capability.
- [ ] Jamie manual conversational acceptance and existing release gates.

Repaired deterministic paths used no router/generation, credits or business writes.
Fresh misses reached existing mock routing without generation. Exact local evidence
is in external assistant-natural-conversation-qa.json. No full-web rerun or release
readiness claim; cloud/provider/device/wife-beta gates remain open, Tap to Pay
remains post-V1. Existing uncommitted work preserved; no commit/push/deployment.

### Context-sensitive contact follow-up

- [x] Resolve talk-to/contact language using existing tenant-bound session records.
- [x] Clarify fresh and unselected multi-person review context using actual choices.
- [x] Prefer explicit type/name references; names select only unique current-list
  records, never authorize new/global lookups. Other-customer ambiguity fails closed.
- [x] Read only bounded saved snapshot phone/email; missing fields stay unavailable.
- [x] Continue booking/estimate contact through guarded drafting; repair who-else
  repetition while preserving the selected anchor; verify Tenant B resets.
- [ ] Jamie manual conversational acceptance; reply history and urgency inference
  remain unsupported, not newly accepted capabilities.

Synthetic exact replies/verdicts are in external assistant-context-contact-qa.json.
No provider/generation, credits or informational mutations occurred on required
paths. No new memory/customer API/authority architecture. Cloud/provider/device/
wife-beta/release gates remain open; mobile Tap to Pay remains post-V1.

Focused validation: 18 GrowthAI files / 473 tests; resolver 70/70; lint/build/
diff check passed with existing build warnings. Sixty-five browser turns include
the downstream repetition and final successful repair. No full-web aggregate
rerun, commit, push or deployment in this slice.

### Topic-change continuity follow-up

- [x] Keep the existing session owner reference independent of rendered workflow.
- [x] Preserve latest typed result sets/person anchor and six recent ID references,
  without persistent storage, transcript retrieval or provider context.
- [x] Verify A-D, marketing/reputation/customer returns, estimate-service returns,
  long continuation, explicit replacements and original ordered-list positions.
- [x] New-conversation and tenant switches clear prior context; stale/foreign
  references and ambiguous multi-person pronouns fail closed.
- [x] GrowthAI 18 files / 480 tests; lint/build/diff check, existing warnings only.
- [ ] Jamie manual conversational acceptance and existing release gates.

Bounded current-session conversational context preserves tenant-bound entity
references across supported topic changes while allowing explicit references to
replace active context. Home unmount still ends that session. No promotion ranking,
urgency/reply history or unrestricted understanding added. Exact local evidence:
external assistant-topic-continuity-qa.json. Repaired paths used no router/
generation, credits or informational writes. No full-web rerun or release-ready
claim; cloud/device/provider/wife-beta gates stay open, Tap to Pay remains post-V1.
