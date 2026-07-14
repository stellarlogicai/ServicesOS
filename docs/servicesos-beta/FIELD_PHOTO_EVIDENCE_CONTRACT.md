# Field Photo Evidence Contract

## Status

This document defines the ServicesOS V1 before/after Field Mode photo evidence slice implemented on the separated lab branch `v1-lab-field-photo-evidence-mvp`.

The rules and application changes in this branch have not been deployed. Production and the protected July 20 smoke-test candidate remain unchanged.

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
- The UID is present in `tenants/{tenantId}.users`.

The employee may create and read evidence only when the parent booking's `assignedEmployeeAuthUid` equals the authenticated UID. Persisted metadata and Storage objects cannot be updated or deleted by the employee.

### Tenant admin

A matching active tenant admin in `tenants/{tenantId}.adminUsers` may capture evidence for an own-tenant booking from Field Mode without employee assignment. The same evidence is read-only in Booking Details. Admins cannot overwrite or delete persisted evidence.

### Super-admin

An active super-admin may capture evidence only after the application has an explicit non-`DEFAULT` tenant selection. The selected tenant determines the Storage and Firestore path; server authorization comes from the trusted super-admin profile. Refresh clears the selection. Booking Details remains read-only.

### Customer, cross-tenant, and anonymous users

Customer, cross-tenant, inactive, disabled, suspended, tenantless, unknown-profile, and anonymous access is denied by Firestore and Storage rules. Customer Portal does not mount the field photo service or evidence components.

## Assignment Isolation

Employee Field Mode visibility and photo access use canonical `assignedEmployeeAuthUid`. Unassigned, cancelled, archived/deleted, other-employee, past, and cross-tenant jobs do not appear in the employee list. Reassignment revokes the former employee's booking and evidence access.

Tenant admin capture does not create or change employee assignment. Photo upload writes only the Storage object and approved metadata document; it does not mutate the parent booking.

## Completion Warning

Photos remain optional. When a Field Mode user with evidence-capture access selects `Mark Complete` and the current persisted metadata list contains no successful `after` photo, Field Mode asks:

> No after photos have been uploaded. Complete the job anyway?

The employee can go back or complete anyway. A locally selected, uploading, or failed photo does not count as uploaded evidence. A successfully persisted after-photo metadata document suppresses the warning.

Completion remains separate from payment truth and does not update payment fields.

## Deferred Work

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

No Firebase or Storage rules from this lab slice are deployed yet.
