import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentUser: { getIdToken: vi.fn(async () => 'employee-token') },
}));

vi.mock('../firebase', () => ({
  auth: {
    get currentUser() {
      return mocks.currentUser;
    },
  },
}));

import {
  completeEmployeeJob,
  EmployeeFieldGatewayError,
  loadEmployeeJobPacket,
  isEmployeeFieldAccessLossError,
  listEmployeeJobs,
  resolveEmployeeGatewayBaseUrl,
  sanitizeEmployeeJobPacket,
  saveEmployeeChecklist,
  saveEmployeeNotes,
  startEmployeeJob,
} from '../services/employeeFieldGatewayService';

const safeSummary = {
  id: 'job-1',
  schedule: { date: '2026-09-03', startTime: '09:00', endTime: '11:00', scheduledAt: null },
  serviceType: 'Standard',
  customerName: 'Field Customer',
  address: '100 Field Lane',
  status: 'scheduled',
  fieldStatus: 'not_started',
};

const safePacket = {
  id: 'job-1',
  schedule: safeSummary.schedule,
  serviceType: 'Standard',
  customer: { name: 'Field Customer', phone: '555-0100' },
  location: { address: '100 Field Lane' },
  status: 'scheduled',
  fieldStatus: 'not_started',
  instructions: 'Use side entrance.',
  checklist: {
    ready: true,
    items: [{
      id: 'item-1', area: 'Kitchen', fixtureOrSurface: 'Sink', label: 'Clean sink',
      completionCriteria: 'Sink is clean.', jobAidSteps: [], warnings: [], note: '', condition: '',
      required: true, completed: false, approvedMethodIds: ['method-1'], preferredMethodId: 'method-1',
    }],
    completed: 0,
    total: 1,
    notes: '',
    warnings: [],
  },
  fieldNotes: '',
  fieldIssue: '',
};

function mockResponse(payload, { ok = true, status = 200 } = {}) {
  globalThis.fetch = vi.fn(async () => ({ ok, status, json: async () => payload }));
}

function lastRequestBody() {
  return JSON.parse(globalThis.fetch.mock.calls.at(-1)[1].body);
}

describe('employeeFieldGatewayService', () => {
  beforeEach(() => {
    mocks.currentUser = { getIdToken: vi.fn(async () => 'employee-token') };
    globalThis.fetch = vi.fn();
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'demo-servicesos-v1-smoke-local');
    vi.stubEnv('VITE_FUNCTIONS_URL', 'http://127.0.0.1:5001/demo-servicesos-v1-smoke-local/us-central1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('fails locally when no Firebase user is authenticated', async () => {
    mocks.currentUser = null;
    await expect(listEmployeeJobs()).rejects.toMatchObject({ code: 'unauthenticated', status: 401 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('uses only a sanctioned local emulator URL for the demo project', () => {
    expect(resolveEmployeeGatewayBaseUrl()).toBe(
      'http://127.0.0.1:5001/demo-servicesos-v1-smoke-local/us-central1',
    );
    vi.stubEnv('VITE_FUNCTIONS_URL', 'https://us-central1-cleaning-intake-system.cloudfunctions.net');
    expect(() => resolveEmployeeGatewayBaseUrl()).toThrow('unsafe');
  });

  it('derives the production URL from the validated Firebase project', () => {
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'false');
    vi.stubEnv('VITE_FUNCTIONS_URL', '');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'servicesos-project');
    expect(resolveEmployeeGatewayBaseUrl()).toBe(
      'https://us-central1-servicesos-project.cloudfunctions.net',
    );
  });

  it('lists safe summaries with an authenticated exact request', async () => {
    mockResponse({
      success: true,
      todayDate: '2026-09-03',
      jobs: [{ ...safeSummary, agreedPrice: 300, assignedEmployeeAuthUid: 'uid' }],
    });
    await expect(listEmployeeJobs()).resolves.toEqual({
      todayDate: '2026-09-03',
      jobs: [safeSummary],
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/employeeJobPacketGateway$/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer employee-token' }),
      }),
    );
    expect(lastRequestBody()).toEqual({ action: 'list' });
  });

  it('fails closed when the authoritative tenant date is missing or malformed', async () => {
    mockResponse({ success: true, jobs: [safeSummary] });
    await expect(listEmployeeJobs()).rejects.toThrow('invalid employee job response');

    mockResponse({ success: true, todayDate: 'September 3', jobs: [safeSummary] });
    await expect(listEmployeeJobs()).rejects.toThrow('invalid employee job response');
  });

  it('gets and recursively allowlists the employee packet', async () => {
    mockResponse({
      success: true,
      job: {
        ...safePacket,
        agreedPrice: 300,
        paymentStatus: 'paid',
        assignedEmployeeAuthUid: 'employee-1',
        customerSnapshot: { email: 'private@example.com' },
        checklist: {
          ...safePacket.checklist,
          sourceScopeSignature: 'private',
          items: [{ ...safePacket.checklist.items[0], sourceReferences: ['private'] }],
        },
      },
    });
    const result = await loadEmployeeJobPacket('job-1');
    expect(lastRequestBody()).toEqual({ action: 'get', bookingId: 'job-1' });
    expect(JSON.stringify(result)).not.toMatch(
      /agreedPrice|paymentStatus|assignedEmployeeAuthUid|customerSnapshot|sourceScopeSignature|sourceReferences/,
    );
    expect(result).toEqual(safePacket);
  });

  it('maps start to the exact execution request without identity fields', async () => {
    mockResponse({ success: true, job: { ...safePacket, fieldStatus: 'in_progress' } });
    await startEmployeeJob('job-1');
    expect(lastRequestBody()).toEqual({ action: 'start', bookingId: 'job-1' });
  });

  it('maps checklist completion state without structural fields', async () => {
    mockResponse({ success: true, job: safePacket });
    await saveEmployeeChecklist('job-1', [{ id: 'item-1', completed: true }]);
    expect(lastRequestBody()).toEqual({
      action: 'save_checklist',
      bookingId: 'job-1',
      checklist: [{ id: 'item-1', completed: true }],
    });
  });

  it('maps notes and completion to their exact execution contracts', async () => {
    mockResponse({ success: true, job: safePacket });
    await saveEmployeeNotes('job-1', 'Done', 'Loose handle');
    expect(lastRequestBody()).toEqual({
      action: 'save_notes', bookingId: 'job-1', fieldNotes: 'Done', fieldIssue: 'Loose handle',
    });
    await completeEmployeeJob('job-1', [{ id: 'item-1', completed: true }], 'Done', '');
    expect(lastRequestBody()).toEqual({
      action: 'complete',
      bookingId: 'job-1',
      checklist: [{ id: 'item-1', completed: true }],
      fieldNotes: 'Done',
      fieldIssue: '',
    });
  });

  it('normalizes access-loss and generic server errors without internal details', async () => {
    mockResponse({ success: false, code: 'job_unavailable', error: 'internal assignment detail' }, { ok: false, status: 404 });
    let error;
    try {
      await loadEmployeeJobPacket('job-1');
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(EmployeeFieldGatewayError);
    expect(error.message).not.toContain('assignment');
    expect(isEmployeeFieldAccessLossError(error)).toBe(true);
  });

  it('normalizes token and network failures without exposing their details', async () => {
    mocks.currentUser.getIdToken.mockRejectedValue(new Error('private token diagnostic'));
    await expect(listEmployeeJobs()).rejects.toMatchObject({
      message: 'Field Mode could not reach the employee service.',
      code: 'gateway_unavailable',
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('fails closed when an unready packet contains stale checklist items', () => {
    const result = sanitizeEmployeeJobPacket({
      ...safePacket,
      checklist: { ...safePacket.checklist, ready: false },
    });
    expect(result.checklist.ready).toBe(false);
    expect(result.checklist.items).toEqual([]);
  });
});
