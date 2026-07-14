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

Employee booking access is tenant-level in V1. The application and rules do not yet enforce assigned-worker-only visibility.

The repository contains inconsistent legacy assignment fields, including `assignedEmployeeId` and `assignedEmployees`. Neither is canonical across booking creation and conversion. Canonical assignment and assigned-worker filtering are deferred to V1.1.

## Firestore contract

An employee is a tenant field user only when all of the following are true:

- an authenticated `users/{uid}` profile exists
- profile role is `employee`
- profile status is `active`
- profile `tenantId` matches the requested tenant path
- the UID is present in the tenant's existing `users` array

Employee booking writes remain limited to the approved Field Mode execution keys. Employees cannot use temporary legacy rules for tenant creation, tenant usage, quotes, jobs, properties, legacy photos, appointments, employee management, tenant payment records, time clock data, or equivalent unrelated surfaces.

The legacy broad rules retained for recognized non-employee roles still require future module-by-module hardening. This employee slice does not claim those rules are fully production-hardened for every role.

## Deferred work

- employee invitation and management UI
- canonical assignment and assigned-worker-only filtering
- full employee mobile application
- offline-safe field execution queue
- before/after field photo evidence
- broader legacy Firestore rules cleanup

Field photo evidence is the next separate V1 slice after employee access is validated.
