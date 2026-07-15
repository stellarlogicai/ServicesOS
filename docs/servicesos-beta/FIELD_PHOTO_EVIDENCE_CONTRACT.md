# Field Photo Evidence Contract

## Status

This document defines the ServicesOS V1 before/after Field Mode photo evidence contract and
the local two-document Storage authorization correction. The correction is implemented on
`v1-lab-storage-rules-two-document-fix` and has not been deployed. Production still requires
separate rules review/deployment, cross-service permission approval, and photo smoke.

## V1 Purpose

An active assigned tenant employee or active tenant owner/admin can add optional before and after job photos from Field Mode. A tenant owner/admin reviews that evidence in Booking Details. Customers cannot read, upload, list, or display field photo evidence.

An owner performing the work does not need a duplicate employee account. Field Mode is the only evidence-capture surface; Booking Details remains read-only.

Photos are job evidence only. Uploading a photo or completing a job does not change booking payment status, price, schedule, customer data, or assignment data.

## Canonical Paths

Firebase Storage object:

```text
tenants/{tenantId}/bookings/{bookingId}/field-photos/{phase}/{photoId}.{extension}
```

Firestore metadata document:

```text
tenants/{tenantId}/bookings/{bookingId}/fieldPhotos/{photoId}
```

Valid phases are `before` and `after`.

The generated object name contains no customer name, address, email, or original file name. Legacy global `jobPhotos`, `tenants/DEFAULT`, property-condition, and unmounted employee-app paths are not part of this contract.

Raw image bytes are stored only in Firebase Storage. The parent booking document is not mutated with photo metadata.

## Metadata

Required Firestore fields:

- `id`
- `phase`
- `storagePath`
- `uploadedAt`
- `uploadedByUid`
- `fileName`
- `contentType`
- `sizeBytes`

Optional field:

- `clientFileLastModifiedAt`

`clientFileLastModifiedAt` is browser-provided file information and is not a verified capture timestamp.

The stored `fileName` is a generated display name such as `before-photo.jpg`; the user's original file name is not persisted. No download URL, sharing token, customer data, address, payment data, Stripe field, price, GPS coordinate, EXIF location, or arbitrary file metadata is persisted.

## Supported Files

Allowed MIME types:

- `image/jpeg`
- `image/png`
- `image/webp`

The original file must be larger than zero bytes and no larger than 10 MB. PDFs, executables, unsupported images, and arbitrary binary files are rejected before upload and again by Storage rules.

The V1 service does not compress photos. The existing shared compressor always converts output to JPEG, which would change PNG/WebP format and can remove transparency. V1 therefore uploads the validated original without mutating the user's `File`. A future compression pass must preserve or accurately record output MIME type and revalidate final size.

No GPS or EXIF location inspection is performed.

## Successful Upload Definition

An upload is successful only after:

1. The selected file passes client validation.
2. The generated tenant/booking/phase-scoped Storage object uploads successfully.
3. The matching Firestore metadata document is created successfully with a server timestamp.

The UI does not display `Photo uploaded.` until both persistence steps succeed.

If Storage upload fails, no Firestore metadata is written and the selected browser file remains available for retry.

If Storage succeeds but Firestore metadata creation fails, the service attempts to delete the uploaded object, reports failure, and retains the selected browser file for retry. Cleanup failure is logged for developer diagnostics without creating a fake success state.

Firebase Storage and Firestore cannot provide a cross-service atomic transaction. An orphan object remains possible if both metadata creation and cleanup fail; this is a documented operational risk and must not be treated as uploaded evidence.

## Authorized Display

Persisted evidence is loaded through Firebase SDK `getBlob()` using the signed-in user's Storage authorization. The app does not request or persist a permanent download URL.

The UI creates a temporary local `blob:` object URL for each authorized image and revokes it when the image changes or the component unmounts. If metadata exists but Storage content cannot be loaded, the UI displays `Photo unavailable.` without crashing.

## Access Contract

### Active employee

Photo access requires all of the following:

- An authenticated `users/{uid}` profile exists.
- `role` is exactly `employee`.
- `status` is exactly `active`.
- The profile `tenantId` matches the requested tenant path.

The employee may create and read Storage evidence only when the parent booking's
`assignedEmployeeAuthUid` equals the authenticated UID, its status is `scheduled` or
`completed`, and it is not archived or deleted. Persisted metadata and Storage objects
cannot be updated or deleted by the employee.

Firestore booking and photo-metadata rules still require membership in
`tenants/{tenantId}.users`. Storage authorization uses the protected profile plus booking
because Storage Rules permit only two Firestore documents.

### Tenant admin

An active admin whose protected profile `tenantId` matches the booking tenant may capture
Storage evidence for an existing own-tenant booking without employee assignment. Firestore
booking and metadata access still requires `tenants/{tenantId}.adminUsers` membership. The
same evidence is read-only in Booking Details. Admins cannot overwrite or delete persisted
evidence.

### Super-admin

An active super-admin may capture evidence only after the application has an explicit non-`DEFAULT` tenant selection. The selected tenant determines the Storage and Firestore path; server authorization comes from the trusted super-admin profile. Refresh clears the selection. Booking Details remains read-only.

### Customer, cross-tenant, and anonymous users

Customer, cross-tenant, inactive, disabled, suspended, tenantless, unknown-profile, and anonymous access is denied by Firestore and Storage rules. Customer Portal does not mount the field photo service or evidence components.

### Protected profile trust

Canonical Firestore rules allow users to update only `displayName`, `phone`, `photoURL`,
and `updatedAt` on their own profile. `role`, `tenantId`, and `status` are not client
writable. Client-created profiles can only be active customer profiles. Storage rules can
therefore use `users/{uid}` as the role, status, and tenant authorization source without
trusting object metadata or adding a third tenant-document lookup.

Removing a UID only from tenant membership arrays does not revoke raw Storage-object
authorization under the two-document model. Offboarding must also deactivate or otherwise
correct the protected profile and clear/reassign booking assignments. Firestore application
access continues to enforce tenant membership independently.

## Assignment Isolation

Employee Field Mode visibility and photo access use canonical `assignedEmployeeAuthUid`. Unassigned, cancelled, archived/deleted, other-employee, past, and cross-tenant jobs do not appear in the employee list. Reassignment revokes the former employee's booking and evidence access.

Tenant admin capture does not create or change employee assignment. Photo upload writes only the Storage object and approved metadata document; it does not mutate the parent booking.

## Completion Warning

Photos remain optional. When a Field Mode user with evidence-capture access selects `Mark Complete` and the current persisted metadata list contains no successful `after` photo, Field Mode asks:

> No after photos have been uploaded. Complete the job anyway?

The employee can go back or complete anyway. A locally selected, uploading, or failed photo does not count as uploaded evidence. A successfully persisted after-photo metadata document suppresses the warning.

Completion remains separate from payment truth and does not update payment fields.

## Deferred Work

- Field Job card UX: keep `Open Job` or `Continue Job` as the primary action; make
  Directions and Call Customer secondary quick actions; keep Copy Address inside the
  packet or overflow menu; never expose Start Job on the summary card; show one employee
  execution status; hide employee payment status; consolidate duplicate scheduled and
  not-started badges. This is an audit decision only and is not implemented in the
  production Storage-readiness phase.
- Full offline upload queue and background retry
- Admin evidence deletion and orphan-reconciliation operations
- Photo enlargement/download/share workflows
- Photo editing, OCR, AI analysis, facial recognition, and GPS/location capture
- Customer galleries or public sharing
- Photo notifications or messaging

## Validation and Deployment Gate

Before any deployment, run:

- ServicesOS web lint, full tests, and build
- Cloud Functions test suite
- Firestore emulator rules tests
- Storage emulator rules tests
- Authenticated employee, tenant-admin, customer, and cross-tenant browser smoke

The authenticated smoke must verify employee and owner/admin upload persistence after refresh, unsupported and oversized rejection, optional completion warning, read-only owner review, Customer Portal privacy, and unchanged payment/price/schedule/customer/assignment fields.

The two-document Storage correction is deployed to the production Storage release, and the
Firebase-managed `Firebase Rules Firestore Service Agent` permission is enabled for the
Firebase Storage managed service identity. The first production owner/admin smoke stopped
before upload because the older deployed Firestore rules do not contain the nested
`fieldPhotos` metadata rule. No object or metadata document was created.

Production photo evidence remains blocked until the canonical Firestore metadata rules are
separately reviewed/deployed and the complete owner/admin persistence, read-only review,
cross-tenant, anonymous, invalid-file, and oversized-file smoke passes.

The two-document offboarding consequence is part of the V1 contract: protected profile
role, tenant ID, and status are authoritative; admin offboarding must deactivate or correct
that profile; employee offboarding must also clear or reassign affected bookings; and
reassignment revokes the former employee's evidence access. Removing only tenant membership
array entries is not sufficient for raw Storage revocation.
