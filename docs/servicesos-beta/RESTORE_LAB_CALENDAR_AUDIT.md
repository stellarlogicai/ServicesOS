# Restore Lab Calendar Audit

Date: June 30, 2026  
Branch: `restore-lab`  
Status: Audit and design only; no Calendar route or UI restored

> Stage 1 update — June 30, 2026: the existing `CalendarView` was hardened into a tenant-context, read-only booking display using `getJobs(tenantId)` and the shared booking fallback helpers. Employee and direct Firestore dependencies were removed. Calendar remains hidden from normal-admin navigation.

> Exposure update — June 30, 2026: after explicit product approval, the hardened read-only Calendar was added to normal-admin navigation for wife beta. `StaffScheduling`, full scheduling workflows, employee assignment, and every Calendar mutation remain deferred and hidden.

## Scope and conclusion

The smallest safe restoration is a new read-only Upcoming Jobs calendar/list that consumes the existing tenant-scoped `getJobs(tenantId)` boundary and the existing `bookingDisplay.js` fallback helpers. It must not reuse or expose the current full `CalendarView` directly.

Normal-admin navigation remains Dashboard, Create Estimate, Customers, and Bookings. Calendar, Schedule, and Staff Scheduling remain hidden.

## Existing components and services

| File | Current responsibility | Reads | Writes/mutations | Calendar restoration assessment |
| --- | --- | --- | --- | --- |
| `src/components/CalendarView.jsx` | Month/week/day calendar with employee names and status colors | `tenants/{tenantId}/bookings`; `tenants/{tenantId}/employees` | None directly | Not safe to expose directly. It requires `tenantId`, reads deferred employee data, assumes assignment/status fields, and bypasses the established scheduling-service and display-fallback boundaries. |
| `src/components/StaffScheduling.jsx` | Employee CRUD, job scheduling, check-in, and check-out | Employees through `employeeService`; bookings through `getJobsByDate(tenantId, date)` | Creates bookings; updates booking status to `in_progress`/`completed`; creates, edits, and deletes employees | Explicitly out of scope. This is a staff workflow and mutation surface, not a read-only calendar. |
| `src/components/BookingsList.jsx` | Current owner/admin booking list and detail surface | `getJobs(tenantId)` | Limited date/time/notes and manual payment-status wrappers | Best reference for loading, tenant handling, errors, refresh behavior, and safe display formatting. Do not copy its edit controls into Calendar. |
| `src/components/bookingDisplay.js` | Messy-data display adapters | Booking object only | None | Reuse for customer, service, schedule, address, price, and status fallbacks. |
| `src/core/scheduling/schedulingService.js` | Tenant booking service | `tenants/{tenantId}/bookings`; single booking documents | Broad `createJob`, `updateJob`, `updateJobStatus`, `deleteJob`, and `assignEmployeeToJob`, plus limited approved wrappers | `getJobs(tenantId)` is the approved CAL-A read boundary. Calendar must not import or call the broad mutation functions. |
| `src/services/customerPortalService.js` | Legacy customer portal data and actions | Legacy `tenants/{tenantId}/jobs`, plus leads, invoices, contracts, completions, and employees | Updates legacy `jobs` for reschedule and other portal records | Do not use. It is on the old `jobs` path and includes deferred reschedule, payment, completion, employee, and portal behavior. |
| `src/services/rebookingService.js` | Recurring-service automation and notifications | Tenant bookings, recurring services, tenant, customers, and logs | Generates bookings, writes rebooking logs/email/SMS records, and updates tenant settings | Do not couple to Calendar. It is automation with multiple side effects. |
| `src/services/employeeAssignmentService.js` | Employee scoring/availability calculations | In-memory employee/job arrays | No persistence directly | Deferred. It assumes employee assignments and contains placeholder/random distance scoring unsuitable for an owner read-only calendar. |
| `src/services/staffSchedulingService.js` | Legacy local employee/shift/route workflow | Browser `localStorage` keys `staff_employees_v1` and `staff_shifts_v1` | Writes those unscoped local-storage keys and shift statuses | Do not use. Data is not tenant-scoped and includes check-in/out and route optimization. |

## Current booking read architecture

`getJobs(tenantId)`:

- Requires a tenant ID.
- Reads only `tenants/{tenantId}/bookings`.
- Orders by `date` descending.
- Returns the scheduling service's standardized success/error response.
- Does not read a global `bookings` or `jobs` collection.
- Is already used and tested by `BookingsList`.

`getJobsByDate(tenantId, date)` also reads `tenants/{tenantId}/bookings`, filtered by `date` and ordered by `startTime`. It is currently used by the mutating `StaffScheduling` component. CAL-A should prefer one `getJobs(tenantId)` read and derive the visible date/week client-side unless data volume later proves that a dedicated read-only range query is needed.

## Legacy `jobs` path

The active owner/admin booking path is `tenants/{tenantId}/bookings`. The following audited customer-portal functions still use `tenants/{tenantId}/jobs`:

- Customer portal job history and individual job/appointment reads.
- Job photos/completion lookup.
- Reschedule request and confirmation writes.

Those legacy paths must not be imported into the restored calendar. CAL-A must not attempt to merge `jobs` and `bookings`.

## Existing CalendarView risks

1. **Missing tenant wiring:** `CalendarView` requires a `tenantId` prop, but App currently renders `<CalendarView />` without one. Direct exposure would render without loading data.
2. **Bypasses the service boundary:** It queries Firestore directly instead of using `getJobs(tenantId)`, duplicating tenant/loading/error logic.
3. **Deferred employee dependency:** It always queries `tenants/{tenantId}/employees` and renders employee names.
4. **Assignment-field mismatch:** It reads `booking.employeeId`, while the scheduling assignment helper writes `assignedEmployeeId`. Existing records may use other shapes.
5. **Unsafe messy-data rendering:** It directly renders `startTime`, `endTime`, `address`, and status instead of the established fallback adapters.
6. **Status semantics are ahead of V1:** It colors `scheduled`, `in_progress`, `completed`, and `cancelled`; `in_progress` is rejected by the limited owner/admin update whitelist and belongs to deferred staff workflow.
7. **Query/index risk:** The month query combines date range filters with `orderBy('date')` and `orderBy('startTime')`, potentially requiring an index not exercised by the current Bookings flow.
8. **Weak failure state:** Firestore errors are logged but not presented as a stable owner-facing error/empty state.
9. **Product wording mismatch:** The component says “View and manage scheduled jobs,” although the safe restoration must be read-only.
10. **No focused isolation/read-only tests:** Existing tests verify Calendar stays hidden but do not validate Calendar data access or incomplete records.

## Existing StaffScheduling risks

`StaffScheduling` must remain deferred because it combines several capabilities that are explicitly outside CAL-A:

- Employee list/create/edit/delete.
- New booking creation through broad `createJob`.
- Booking status writes through broad `updateJobStatus`.
- `in_progress` check-in and `completed` check-out workflow.
- Employee assignment fields and staff availability assumptions.
- A “Schedule New Job” owner workflow that would duplicate current booking creation semantics.

Exposing it would make Calendar restoration a booking/staff-management expansion rather than a read-only view.

## Smallest safe future restoration

### Stage CAL-A — read-only Upcoming Jobs

Build a new, narrowly named component rather than adapting the full `CalendarView` in place.

Required boundaries:

1. Obtain the active tenant ID through the same authenticated context pattern as `BookingsList`.
2. Call only `getJobs(tenantId)` from the scheduling service.
3. Normalize display values with `bookingDisplay.js` helpers.
4. Filter to records with a usable appointment date and show the current/upcoming date range.
5. Sort deterministically by appointment date and time in the presentation layer.
6. Render a simple read-only day/week grouping or list.
7. Provide safe loading, empty, missing-tenant, and read-error states.
8. Keep incomplete records non-crashing; unscheduled records may be summarized separately or omitted from the date grid with an explicit count.
9. Expose no controls for create, edit, delete, drag/drop, reschedule, status, payment, assignment, route, or recurring work.
10. Do not read employees, legacy `jobs`, leads, customers, payments, invoices, routes, or recurring-service collections.

Normal-admin route exposure should occur only after focused tests and Tenant A/B manual isolation verification. This audit does not authorize that exposure.

### Stage CAL-B — read-only week/month visualization

After CAL-A is stable, add a simple responsive week/month visual layout over the same read-only data boundary. Keep navigation between date ranges client-side where practical. Continue using the same fallback adapters and retain a usable mobile list alternative.

Do not introduce drag/drop, appointment creation, editing, rescheduling, employee lanes, or route views.

### Stage CAL-C — optional status colors

Only after booking status semantics are explicitly reconciled across Dashboard, Bookings, and staff workflows, optionally add status color indicators. Colors must be display-only and derived from a documented status mapping. Do not expose status mutation.

## Future tests required

Before any normal-admin Calendar exposure, add focused coverage for:

1. Normal-admin route visibility is added intentionally while all other deferred routes remain hidden.
2. The Calendar receives/uses the active tenant ID.
3. The Calendar calls only `getJobs(activeTenantId)`.
4. Reads remain under `tenants/{tenantId}/bookings`; no global or legacy `jobs` reads occur.
5. No Firestore write, broad scheduling mutation, delete, payment, or assignment helper is imported/called.
6. No create/edit/delete/payment/status/assignment/reschedule/drag-drop controls render.
7. Incomplete booking records use safe customer/service/schedule/address/price/status fallbacks.
8. Empty, missing-tenant, permission-denied, and rejected-read states render safely.
9. Tenant A never displays Tenant B bookings and Tenant B never displays Tenant A bookings.
10. Refresh preserves active-tenant data and sign-out clears Calendar data.
11. Date sorting and date/week filtering are deterministic around local-date boundaries.
12. Mobile layout remains usable without clipped jobs or controls.
13. Existing Dashboard, Customers, Create Estimate, and Bookings route tests remain green.

## Capabilities that remain deferred

- Existing full `CalendarView` exposure.
- Schedule and Staff Scheduling.
- Employee CRUD, assignment, check-in/out, and staff availability.
- Booking creation, edit, delete, cancellation, or reschedule from Calendar.
- Drag/drop and recurring automation.
- Customer Portal schedule/reschedule integration.
- Route optimization, GPS, payroll, training, and mobile employee workflows.
- Payments, Stripe, payment links, refunds, invoices, and collection controls.
- Settings and all other hidden modules.

## Recommended next restore-lab task

Prepare a code-level CAL-A implementation plan for a new read-only Upcoming Jobs component, including its component contract, use of `getJobs(tenantId)`, reuse of `bookingDisplay.js`, exact route/nav gate, and focused test matrix. Do not implement or expose it until that plan is approved.
