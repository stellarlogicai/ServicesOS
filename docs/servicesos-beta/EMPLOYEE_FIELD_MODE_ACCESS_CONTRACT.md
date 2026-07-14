# Employee Field Mode Access Contract

## V1 status

ServicesOS V1 recognizes `employee` as a canonical application role. Employee accounts are manually provisioned during beta. Employee invitation and employee-management interfaces are not part of this slice.

Nothing in this lab branch has been deployed.

## Canonical identity

Employee authentication uses the existing profile document:

```text
users/{uid}
```

An employee profile must include:

```text
role: employee
status: active
tenantId: a non-empty tenant ID
```

The authenticated UID must also be listed in the tenant's existing `users` membership array for Firestore Field Mode access.

Missing profiles, unknown roles, tenantless employees, and employees marked `suspended`, `inactive`, or `disabled` are denied application access. A missing employee status is also denied. Roles are never inferred from email, navigation state, or tenant membership.

## Application access

Field Mode is the only normal ServicesOS application area available to an employee. Employee navigation contains:

- Field Mode
- Sign out

Dashboard, estimates, customers, booking administration, Calendar, scheduling administration, Business Settings, Data Export, Customer Portal, payment tools, Stripe setup, tenant administration, and super-admin tools remain unavailable.

Admins and super-admins retain their existing Field Mode access for testing and owner-operated workflows.

## Field Mode boundaries

Employees can use the existing narrow field-execution workflow:

- Start Job
- update the checklist
- save field notes
- flag an issue
- Mark Complete

Employee Field Mode hides payment status and private owner/internal notes. It displays only field-safe operational instructions already present on the booking, such as customer-provided access instructions, special requests, or technician instructions.

Field execution does not change payment status, price, schedule, customer data, lead data, Stripe data, archive state, or assignment fields.

## Tenant and assignment scope

Employee booking access is assigned-worker-only in V1. The canonical booking field is:

```text
assignedEmployeeAuthUid
```

Its value is exactly the assigned employee's Firebase Auth UID and `users/{uid}` document ID. Legacy fields such as `assignedEmployeeId`, `assignedEmployeeUid`, `assignedEmployees`, and `employeeId` remain non-authoritative because existing code uses mixed employee-record and UID semantics.

Owner/admin Booking Detail is the V1 assignment surface. It lists only profiles where `role == employee`, `status == active`, and `tenantId` matches the active tenant. A booking may remain unassigned for planning, but it is invisible to employees until explicitly assigned.

Employee Field Mode uses a Firestore query constrained by canonical assignment UID and booking status. `scheduled` and current-date `completed` jobs are eligible; `cancelled`, unassigned, another employee's, archived/deleted, past, and cross-tenant jobs do not render. The required composite booking index is `assignedEmployeeAuthUid ASC`, `status ASC`, `date DESC`.

## Firestore contract

An employee is a tenant field user only when all of the following are true:

- an authenticated `users/{uid}` profile exists
- profile role is `employee`
- profile status is `active`
- profile `tenantId` matches the requested tenant path
- the UID is present in the tenant's existing `users` array
- the booking's `assignedEmployeeAuthUid` equals the authenticated UID

Employee booking writes remain limited to the approved Field Mode execution keys and require the same booking assignment. Firestore field-photo metadata and Storage evidence access also require the parent booking assignment. Reassignment immediately transfers booking and photo access without deleting existing field progress or evidence.

Tenant admins retain tenant-wide booking visibility and may capture before/after evidence while personally operating in Field Mode without assigning themselves as employees. An explicitly tenant-scoped super-admin may do the same under the existing selected-tenant model. Booking Detail remains read-only for evidence review. Only booking managers can set, change, or clear assignment, and an assigned UID must resolve to an active employee profile in the same tenant membership.

Owner/admin evidence capture does not weaken employee access: employees still require parent-booking assignment for booking reads, field execution writes, metadata reads/creates, and Storage reads/creates. Admin uploads do not create or change `assignedEmployeeAuthUid`.

The legacy broad rules retained for recognized non-employee roles still require future module-by-module hardening. This employee slice does not claim those rules are fully production-hardened for every role.

## Deferred work

- employee invitation and richer employee profile management
- assignment notifications and multi-worker crews
- full employee mobile application
- offline-safe field execution queue
- broader legacy Firestore rules cleanup
