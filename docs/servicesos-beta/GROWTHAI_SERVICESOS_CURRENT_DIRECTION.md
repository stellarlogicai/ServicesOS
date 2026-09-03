# ServicesOS GrowthAI Current Direction

Updated: 2026-08-25

This document is the authoritative current product direction for GrowthAI inside
ServicesOS. It supersedes older GrowthAI UI and product assumptions when they
conflict. Planning for a future standalone GrowthAI product is separate and must
not drive ServicesOS implementation without explicit approval.

## Product identity

GrowthAI is a ServicesOS feature. It helps a service-business owner understand,
operate, and grow the business using canonical ServicesOS data.

Core rule:

> AI notices. AI suggests. Human approves. System records.

GrowthAI must not silently send messages, change prices, book jobs, take
payments, publish marketing, contact leads, change business rules, or perform
other consequential actions.

ServicesOS remains the active product priority.

## Role-aware landing direction

The eventual owner/admin landing experience is GrowthAI Home. It should provide
a friendly, deterministic business briefing, positive outcomes, items needing
attention, noticed opportunities, and suggested actions. The existing Dashboard
remains the operational command center.

Do not change login routing until a separate approved release slice proves that
GrowthAI Home is ready to become the default owner/admin destination.

GrowthAI remains owner/admin-only. Employees will eventually have a separate My
Day / Work Assistant experience based on assigned work, approved job knowledge,
and Field Mode. Employee access, route optimization, knowledge management, and
incident reporting are not part of the GrowthAI workspace.

## Permanent workspace

The permanent GrowthAI interface should stay simple as capabilities grow:

- Home
- Drafts
- Activity
- contextual business briefing
- deterministic opportunities
- goal-oriented suggested actions
- a guided conversational workspace
- a future universal composer with typed canonical context

**GrowthAI Home is conversation-first. The conversation is the primary
interface and replaces most permanent capability panels. GrowthAI capabilities
should normally be invoked through conversational intent, quick actions, and
typed rich results rather than permanently displayed as separate Home tools.**

Home must remain simple as capabilities increase. Existing Marketing, customer
response, opportunity, brand-preference, and future capabilities should migrate
into the conversation workspace instead of accumulating as permanent panels.
Drafts remains the reliable persisted review workspace, and Activity remains the
truthful selected-draft audit view.

The eventual owner/admin post-login experience combines this assistant with a
deterministic business briefing. Today's Wins, Needs Attention, and
Today/Week/Month business intelligence are later layers and are not prerequisites
for the conversation-first shell.

FIND, ATTRACT, CONVERT, RETAIN, and REPUTATION remain useful internal
classification metadata. Owners should interact through goals such as helping
with an estimate, following up, creating marketing, finding rebooking
opportunities, or understanding business performance.

GrowthAI responses should support typed ServicesOS result cards rather than being
limited to plain text. New capabilities should plug into a capability/action
registry and result-renderer architecture instead of adding permanent panels to
the Home page.

## First-run GrowthAI onboarding

The first eligible owner/admin visit to GrowthAI should introduce the assistant
through the same conversation-first workspace used afterward, not through a
generic tooltip tour or disconnected carousel.

The first-run guide is deterministic and free. It should explain current
capabilities, the human-approval boundary, and the difference between included
ServicesOS intelligence and explicit credit-using AI generation or analysis.
The guide may safely personalize with canonical tenant setup context already
available to the page, but it must not fabricate business facts or call an AI
provider merely to generate onboarding copy.

The guide should be skippable and resumable, should not repeatedly relaunch after
completion or a deliberate skip, and should provide a subtle way to reopen the
guide later. Completion should transition directly into real supported GrowthAI
workflows instead of redirecting to another page. Only capabilities that are
actually reachable should be presented as active actions; planned capabilities
must be described honestly as planned or in progress.

Minimal first-run state may be stored as a versioned, tenant-and-user-scoped
browser preference while the general conversation remains session-local. This is
not a general conversation-history contract and should not require AI credits,
provider calls, or new business mutations.

## Deterministic intelligence and credits

Canonical retrieval and deterministic calculations are free. Examples include
jobs, scheduled revenue, completed work, open estimates, unpaid completed work,
rebooking candidates, leads needing attention, opportunity counts, and credit
balance.

AI credits apply only to explicit AI generation, analysis, interpretation, or
research. The cost must be shown before invocation. Insufficient credits must
not block deterministic ServicesOS functionality.

The existing server gateway, provider adapter, credit reservation/finalization,
failure restoration, idempotency, persisted drafts, approval boundaries, and
immutable audit records are established foundations and should be reused.

## Human review and records

Generated customer messages, marketing content, estimate recommendations,
review responses, and outreach remain drafts until a human reviews them.
Approval is internal unless a separate supported action explicitly performs a
business mutation. Draft activity should be presented in human-readable form,
without claiming broader history than the persisted audit supports.

Conversation state must be bounded and tenant scoped. It should reference
canonical records using typed references such as `{ type, id }`; it must not copy
uncontrolled CRM records or raw provider payloads into conversation history.
Server-side context builders remain responsible for authorization and data
minimization.

## AI Estimate Assistance

`estimate_assistance` is the first planned rich paid workflow for the permanent
workspace. ServicesOS deterministic pricing remains authoritative and free. An
owner may explicitly spend one AI credit to receive an advisory recommendation,
reasoning, assumptions, add-ons, scope suggestions, and complexity factors.

The recommendation remains unapproved until human review and must not
automatically change an estimate, create a booking, send a message, or initiate a
payment.

## Marketing and brand context

Marketing is broader than completed-job content. Future workflows may include
original branded posts, humor and engagement, before/after content, service and
availability posts, seasonal content, promotions, tips, testimonials, milestones,
behind-the-scenes material, uploaded photos, generated imagery, platform variants,
weekly plans, and an eventual human-approved publishing path.

A completed job or job photo is not required to create marketing content.

Current Marketing text generation produces captions, a call to action, and
hashtags for one AI credit. A future `Generate post + image` action may produce
the same text package plus a finished image for five credits total. Its internal
visual instruction is not an owner-facing draft field. Image generation,
storage, charging, retries, and attachments are outside the current V1 scope.

Tenant brand context should derive business identity from canonical Business
Settings and store only GrowthAI-specific preferences or missing brand assets.
Do not duplicate business identity fields into a second source of truth.

## Attachments and photos

The future composer may reference customers, estimates, bookings, jobs, leads,
reviews, authorized job photos, owner-uploaded photos, brand assets, and later
approved files. Each capability declares the context types it accepts.

Existing Field Mode evidence photos may later be referenced through their
authorized tenant/booking records. Their Storage path must not become the generic
GrowthAI marketing upload system. General marketing assets require a separate
tenant-scoped lifecycle, privacy, retention, and authorization contract.

## Deferred systems

Do not fold these into the current workspace without separate approved slices:

- owner/admin default-login routing
- business briefing calculations
- persisted conversation history
- AI Estimate Assistance UI
- general attachment uploads
- Marketing expansion or publishing
- employee My Day / Work Assistant
- route optimization
- tenant knowledge management
- incident reporting
- model training or autonomous actions

The implementation sequence remains small and controlled: permanent shell,
deterministic briefing and opportunities, bounded conversation/context, rich AI
Estimate Assistance, attachment support, then broader brand and Marketing work.
