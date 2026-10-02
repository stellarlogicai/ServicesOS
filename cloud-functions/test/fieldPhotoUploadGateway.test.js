const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const {
  FIELD_PHOTO_LEGACY_READ_LIMIT,
  FIELD_PHOTO_MAX_PER_BOOKING,
  FieldPhotoUploadError,
  createFieldPhotoUploadGatewayHandler,
  finalizeFieldPhotoUpload,
  normalizeGatewayRequest,
  reserveFieldPhotoUpload,
  slotIdentity,
} = require('../fieldPhotoUploadGateway');

function clone(value) {
  return value == null ? value : structuredClone(value);
}

class Snapshot {
  constructor(value) {
    this.value = value;
    this.exists = value !== undefined;
  }

  data() {
    return clone(this.value);
  }
}

class QuerySnapshot {
  constructor(values) {
    this.docs = values.map(value => new Snapshot(value));
    this.size = this.docs.length;
  }
}

class Query {
  constructor(db, path, max) {
    this.db = db;
    this.path = path;
    this.max = max;
  }
}

class CollectionReference {
  constructor(db, path) {
    this.db = db;
    this.path = path;
  }

  doc(id) {
    return new Reference(this.db, `${this.path}/${id}`);
  }

  limit(max) {
    return new Query(this.db, this.path, max);
  }
}

class Reference {
  constructor(db, path) {
    this.db = db;
    this.path = path;
  }

  collection(name) {
    return new CollectionReference(this.db, `${this.path}/${name}`);
  }

  async get() {
    return new Snapshot(this.db.documents.get(this.path));
  }
}

class FakeFirestore {
  constructor(documents = {}) {
    this.documents = new Map(Object.entries(documents).map(([path, value]) => [path, clone(value)]));
    this.lastQueryLimit = null;
    this._lock = Promise.resolve();
  }

  collection(name) {
    return new CollectionReference(this, name);
  }

  querySnapshot(query) {
    this.lastQueryLimit = query.max;
    const prefix = `${query.path}/`;
    const values = [...this.documents.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .slice(0, query.max)
      .map(([, value]) => value);
    return new QuerySnapshot(values);
  }

  runTransaction(callback) {
    const run = this._lock.then(async () => callback({
      get: async reference => reference instanceof Query
        ? this.querySnapshot(reference)
        : new Snapshot(this.documents.get(reference.path)),
      set: (reference, value) => this.documents.set(reference.path, clone(value)),
      create: (reference, value) => {
        if (this.documents.has(reference.path)) throw new Error('already exists');
        this.documents.set(reference.path, clone(value));
      },
      update: (reference, patch) => {
        if (!this.documents.has(reference.path)) throw new Error('missing document');
        this.documents.set(reference.path, { ...this.documents.get(reference.path), ...clone(patch) });
      },
    }));
    this._lock = run.catch(() => {});
    return run;
  }
}

function baseDocuments() {
  return {
    'users/admin-a': { role: 'admin', status: 'active', tenantId: 'tenant-a' },
    'users/admin-b': { role: 'admin', status: 'active', tenantId: 'tenant-b' },
    'users/admin-no-membership': { role: 'admin', status: 'active', tenantId: 'tenant-a' },
    'users/employee-a': { role: 'employee', status: 'active', tenantId: 'tenant-a' },
    'users/customer-a': { role: 'customer', status: 'active', tenantId: 'tenant-a' },
    'users/super-admin': { role: 'super-admin', status: 'active', tenantId: null },
    'tenants/tenant-a': { adminUsers: ['admin-a'], users: ['admin-a', 'employee-a'] },
    'tenants/tenant-b': { adminUsers: ['admin-b'], users: ['admin-b'] },
    'tenants/tenant-a/bookings/booking-a': {
      tenantId: 'tenant-a', status: 'scheduled', assignedEmployeeAuthUid: 'employee-a',
    },
    'tenants/tenant-a/bookings/unassigned': { tenantId: 'tenant-a', status: 'scheduled' },
    'tenants/tenant-a/bookings/archived': {
      tenantId: 'tenant-a', status: 'scheduled', assignedEmployeeAuthUid: 'employee-a', isArchived: true,
    },
    'tenants/tenant-a/bookings/deleted': {
      tenantId: 'tenant-a', status: 'scheduled', assignedEmployeeAuthUid: 'employee-a', isDeleted: true,
    },
  };
}

function fakeAdmin(documents = baseDocuments()) {
  const db = new FakeFirestore(documents);
  const objects = new Map();
  return {
    db,
    objects,
    admin: {
      auth: () => ({ verifyIdToken: async token => {
        if (!token || token === 'invalid') throw new Error('invalid token');
        return { uid: token };
      } }),
      firestore: Object.assign(() => db, {
        FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
      }),
      storage: () => ({
        bucket: () => ({
          file: storagePath => ({
            getMetadata: async () => {
              if (!objects.has(storagePath)) throw Object.assign(new Error('missing'), { code: 404 });
              return [clone(objects.get(storagePath))];
            },
          }),
        }),
      }),
    },
  };
}

function reserveRequest(overrides = {}) {
  return {
    action: 'reserve',
    tenantId: 'tenant-a',
    bookingId: 'booking-a',
    clientUploadId: 'upload-identifier-0001',
    phase: 'before',
    roomLabel: 'Kitchen',
    note: 'Grease near stove',
    contentType: 'image/jpeg',
    sizeBytes: 128,
    clientFileLastModifiedAt: 1710000000000,
    ...overrides,
  };
}

function finalizeRequest(source = reserveRequest()) {
  return {
    action: 'finalize',
    tenantId: source.tenantId,
    bookingId: source.bookingId,
    clientUploadId: source.clientUploadId,
  };
}

function slotPath(request, uid = 'admin-a') {
  const { slotId } = slotIdentity(request);
  return `tenants/${request.tenantId}/bookings/${request.bookingId}/fieldPhotoUploadSlots/${slotId}`;
}

async function reserve(env, request = reserveRequest(), uid = 'admin-a') {
  return reserveFieldPhotoUpload({ admin: env.admin, requestBody: request, uid });
}

async function reserveAndStore(env, request = reserveRequest(), uid = 'admin-a') {
  const result = await reserve(env, request, uid);
  const slot = env.db.documents.get(slotPath(request, uid));
  env.objects.set(slot.storagePath, {
    name: slot.storagePath,
    contentType: slot.contentType,
    size: String(slot.sizeBytes),
  });
  return result;
}

describe('field photo upload gateway', () => {
  test('handler denies anonymous and invalid tokens', async () => {
    const env = fakeAdmin();
    const handler = createFieldPhotoUploadGatewayHandler({ admin: env.admin });
    const invoke = async authorization => {
      const response = {
        statusCode: 0,
        payload: null,
        set() {},
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; },
        send() { return this; },
      };
      await handler({ method: 'POST', headers: authorization ? { authorization } : {}, body: reserveRequest() }, response);
      return response;
    };
    assert.equal((await invoke()).statusCode, 401);
    assert.equal((await invoke('Bearer invalid')).statusCode, 401);
  });

  test('denies customers, wrong-tenant admins, and admins without tenant membership', async () => {
    for (const uid of ['customer-a', 'admin-b', 'admin-no-membership']) {
      const env = fakeAdmin();
      await assert.rejects(reserve(env, reserveRequest(), uid), error => error.code === 'forbidden');
    }
  });

  test('allows a tenant admin and an active super-admin for an existing booking', async () => {
    for (const uid of ['admin-a', 'super-admin']) {
      const env = fakeAdmin();
      const result = await reserve(env, reserveRequest({ clientUploadId: `upload-${uid}-00000001` }), uid);
      assert.equal(result.reservation.status, 'reserved');
    }
  });

  test('allows only the assigned active employee on active booking states', async () => {
    const env = fakeAdmin();
    await assert.rejects(reserve(env, reserveRequest({ bookingId: 'unassigned' }), 'employee-a'), error => error.code === 'forbidden');
    await assert.rejects(reserve(env, reserveRequest({ bookingId: 'archived' }), 'employee-a'), error => error.code === 'forbidden');
    await assert.rejects(reserve(env, reserveRequest({ bookingId: 'deleted' }), 'employee-a'), error => error.code === 'forbidden');
    const result = await reserve(env, reserveRequest(), 'employee-a');
    assert.equal(result.reservation.status, 'reserved');
  });

  test('rejects invalid phase, MIME, zero size, and objects over 10 MB', () => {
    for (const changes of [
      { phase: 'during' },
      { contentType: 'application/pdf' },
      { sizeBytes: 0 },
      { sizeBytes: (10 * 1024 * 1024) + 1 },
    ]) {
      assert.throws(() => normalizeGatewayRequest(reserveRequest(changes)), error => error.code === 'invalid_request');
    }
  });

  test('first reservation initializes and increments quota exactly once', async () => {
    const env = fakeAdmin();
    const result = await reserve(env);
    const control = env.db.documents.get('tenants/tenant-a/bookings/booking-a/fieldPhotoUploadControl/current');
    assert.equal(result.reused, false);
    assert.equal(control.basePhotoCount, 0);
    assert.equal(control.issuedSlotCount, 1);
    assert.equal(result.reservation.usedSlots, 1);
  });

  test('same client upload retry is idempotent and conflicting reuse is rejected', async () => {
    const env = fakeAdmin();
    const first = await reserve(env);
    const second = await reserve(env);
    assert.equal(second.reused, true);
    assert.equal(second.reservation.photoId, first.reservation.photoId);
    assert.equal(env.db.documents.get('tenants/tenant-a/bookings/booking-a/fieldPhotoUploadControl/current').issuedSlotCount, 1);
    await assert.rejects(
      reserve(env, reserveRequest({ roomLabel: 'Bathroom' })),
      error => error.code === 'upload_conflict',
    );
  });

  test('permits exactly 20 issued slots and denies the twenty-first', async () => {
    const env = fakeAdmin();
    for (let index = 0; index < FIELD_PHOTO_MAX_PER_BOOKING; index += 1) {
      await reserve(env, reserveRequest({ clientUploadId: `upload-identifier-${String(index).padStart(4, '0')}` }));
    }
    await assert.rejects(
      reserve(env, reserveRequest({ clientUploadId: 'upload-identifier-0020' })),
      error => error.code === 'photo_quota_exceeded',
    );
  });

  test('legacy photos count toward quota and initialization reads no more than 21 records', async () => {
    const documents = baseDocuments();
    for (let index = 0; index < 19; index += 1) {
      documents[`tenants/tenant-a/bookings/booking-a/fieldPhotos/legacy-${index}`] = { id: `legacy-${index}` };
    }
    const env = fakeAdmin(documents);
    const result = await reserve(env);
    assert.equal(result.reservation.usedSlots, 20);
    assert.equal(env.db.lastQueryLimit, FIELD_PHOTO_LEGACY_READ_LIMIT);
    await assert.rejects(
      reserve(env, reserveRequest({ clientUploadId: 'upload-identifier-0002' })),
      error => error.code === 'photo_quota_exceeded',
    );
  });

  test('legacy bookings already at or above the limit cannot reserve', async () => {
    const documents = baseDocuments();
    for (let index = 0; index < 25; index += 1) {
      documents[`tenants/tenant-a/bookings/booking-a/fieldPhotos/legacy-${index}`] = { id: `legacy-${index}` };
    }
    const env = fakeAdmin(documents);
    await assert.rejects(reserve(env), error => error.code === 'photo_quota_exceeded');
    assert.equal(env.db.lastQueryLimit, 21);
  });

  test('concurrent reservations cannot exceed 20 total slots', async () => {
    const env = fakeAdmin();
    const results = await Promise.allSettled(Array.from({ length: 21 }, (_, index) => reserve(
      env,
      reserveRequest({ clientUploadId: `concurrent-upload-${String(index).padStart(4, '0')}` }),
    )));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 20);
    assert.equal(results.filter(result => result.status === 'rejected' && result.reason.code === 'photo_quota_exceeded').length, 1);
  });

  test('finalize rejects a missing Storage object', async () => {
    const env = fakeAdmin();
    await reserve(env);
    await assert.rejects(
      finalizeFieldPhotoUpload({ admin: env.admin, requestBody: finalizeRequest(), uid: 'admin-a' }),
      error => error.code === 'photo_object_missing',
    );
  });

  test('finalize rejects mismatched Storage MIME, size, and path metadata', async () => {
    for (const metadataPatch of [
      { contentType: 'image/png' },
      { size: '127' },
      { name: 'tenants/tenant-a/bookings/booking-a/field-photos/before/other.jpg' },
    ]) {
      const env = fakeAdmin();
      await reserveAndStore(env);
      const slot = env.db.documents.get(slotPath(reserveRequest()));
      env.objects.set(slot.storagePath, { ...env.objects.get(slot.storagePath), ...metadataPatch });
      await assert.rejects(
        finalizeFieldPhotoUpload({ admin: env.admin, requestBody: finalizeRequest(), uid: 'admin-a' }),
        error => error.code === 'photo_object_mismatch',
      );
    }
  });

  test('finalize writes canonical immutable metadata and marks the slot projection finalized', async () => {
    const env = fakeAdmin();
    await reserveAndStore(env);
    const photo = await finalizeFieldPhotoUpload({ admin: env.admin, requestBody: finalizeRequest(), uid: 'admin-a' });
    const metadataPath = `tenants/tenant-a/bookings/booking-a/fieldPhotos/${photo.id}`;
    const metadata = env.db.documents.get(metadataPath);
    const slot = env.db.documents.get(slotPath(reserveRequest()));
    const booking = env.db.documents.get('tenants/tenant-a/bookings/booking-a');
    assert.deepEqual(metadata, {
      id: photo.id,
      phase: 'before',
      roomLabel: 'Kitchen',
      note: 'Grease near stove',
      storagePath: slot.storagePath,
      uploadedAt: 'SERVER_TIMESTAMP',
      uploadedByUid: 'admin-a',
      fileName: 'before-photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 128,
      clientFileLastModifiedAt: new Date(1710000000000),
    });
    assert.equal(slot.status, 'finalized');
    assert.equal(booking.fieldPhotoUploadReservations[slot.fileName].status, 'finalized');
  });

  test('repeated finalize is idempotent and creates no duplicate metadata', async () => {
    const env = fakeAdmin();
    await reserveAndStore(env);
    const first = await finalizeFieldPhotoUpload({ admin: env.admin, requestBody: finalizeRequest(), uid: 'admin-a' });
    const second = await finalizeFieldPhotoUpload({ admin: env.admin, requestBody: finalizeRequest(), uid: 'admin-a' });
    assert.equal(second.id, first.id);
    assert.equal([...env.db.documents.keys()].filter(path => path.includes('/fieldPhotos/')).length, 1);
  });

  test('finalize rejects conflicting existing metadata', async () => {
    const env = fakeAdmin();
    const reservation = await reserveAndStore(env);
    env.db.documents.set(`tenants/tenant-a/bookings/booking-a/fieldPhotos/${reservation.reservation.photoId}`, {
      id: reservation.reservation.photoId,
      phase: 'after',
    });
    await assert.rejects(
      finalizeFieldPhotoUpload({ admin: env.admin, requestBody: finalizeRequest(), uid: 'admin-a' }),
      error => error.code === 'metadata_conflict',
    );
  });
});
