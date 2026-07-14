# Field Photo Evidence Contract

## Status

This document defines the ServicesOS V1 before/after Field Mode photo evidence slice implemented on the separated lab branch `v1-lab-field-photo-evidence-mvp`.

The rules and application changes in this branch have not been deployed. Production and the protected July 20 smoke-test candidate remain unchanged.

## V1 Purpose

An active tenant employee can add optional before and after job photos from Field Mode. A tenant owner/admin can review that evidence in Booking Details. Customers cannot read, upload, list, or display field photo evidence.

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

The employee may create and read evidence in the matching tenant. Persisted metadata and Storage objects cannot be updated or deleted by the employee.

### Tenant admin

A matching active tenant admin in `tenants/{tenantId}.adminUsers` may read evidence in Booking Details. This slice does not add owner/admin upload or deletion controls.

### Super-admin

Super-admin may read evidence under the existing user-profile role model. This slice does not add super-admin write controls.

### Customer, cross-tenant, and anonymous users

Customer, cross-tenant, inactive, disabled, suspended, tenantless, unknown-profile, and anonymous access is denied by Firestore and Storage rules. Customer Portal does not mount the field photo service or evidence components.

## Current Tenant-Level Limitation

Employee Field Mode visibility remains tenant-level in current V1 because booking assignment fields are not canonical. Photo access follows the same tenant-level limitation.

Assigned-worker-only booking and photo filtering is deferred to V1.1. This implementation does not claim assignment isolation.

## Completion Warning

Photos remain optional. When an active employee selects `Mark Complete` and the current persisted metadata list contains no successful `after` photo, Field Mode asks:

> No after photos have been uploaded. Complete the job anyway?

The employee can go back or complete anyway. A locally selected, uploading, or failed photo does not count as uploaded evidence. A successfully persisted after-photo metadata document suppresses the warning.

Completion remains separate from payment truth and does not update payment fields.

## Deferred Work

- Assigned-worker-only isolation after a canonical assignment contract exists
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

The authenticated smoke must verify upload persistence after refresh, unsupported and oversized rejection, optional completion warning, read-only owner review, Customer Portal privacy, and unchanged payment/price/schedule/customer/assignment fields.

No Firebase or Storage rules from this lab slice are deployed yet.
