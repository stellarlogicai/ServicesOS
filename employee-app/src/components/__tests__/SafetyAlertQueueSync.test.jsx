import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import SafetyAlertQueueSync from '../SafetyAlertQueueSync';

const mockSend = jest.fn();
const mockGetQueued = jest.fn();
const mockRemove = jest.fn();

jest.mock('../../api/employeeSafety', () => ({
  sendSafetyAlert: (...args) => mockSend(...args),
  isRetryableSafetyError: error => error?.retryable === true,
}));
jest.mock('../../api/employeeSafetyQueue', () => ({
  getQueuedSafetyAlertsForEmployee: (...args) => mockGetQueued(...args),
  removeQueuedSafetyAlert: (...args) => mockRemove(...args),
}));

const queued = {
  eventId: 'safety_event_queued_123',
  bookingId: 'job-a',
  location: { latitude: 41.8, longitude: -87.6, capturedAt: '2026-09-26T12:00:00.000Z' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetQueued.mockResolvedValue([queued]);
  mockSend.mockResolvedValue({ status: 'sent' });
  mockRemove.mockResolvedValue();
});

test('verified app open retries queued payload unchanged and removes it after confirmation', async () => {
  render(<SafetyAlertQueueSync employeeUid="employee-a" />);
  await waitFor(() => expect(mockSend).toHaveBeenCalledWith({
    eventId: queued.eventId, bookingId: queued.bookingId, location: queued.location,
  }));
  expect(mockGetQueued).toHaveBeenCalledWith('employee-a');
  expect(mockRemove).toHaveBeenCalledWith('employee-a', queued.eventId);
});

test('resume retries queued alerts without creating a new event identity', async () => {
  let listener;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => {
    listener = callback;
    return { remove: jest.fn() };
  });
  mockGetQueued.mockResolvedValueOnce([]).mockResolvedValueOnce([queued]);
  render(<SafetyAlertQueueSync employeeUid="employee-a" />);
  await waitFor(() => expect(mockGetQueued).toHaveBeenCalledTimes(1));
  await act(async () => listener('active'));
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ eventId: queued.eventId }));
});

test('retryable failure remains queued while permanent rejection is removed', async () => {
  mockSend.mockRejectedValueOnce(Object.assign(new Error('offline'), { retryable: true }));
  const view = render(<SafetyAlertQueueSync employeeUid="employee-a" />);
  await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
  expect(mockRemove).not.toHaveBeenCalled();
  view.unmount();

  jest.clearAllMocks();
  mockGetQueued.mockResolvedValue([queued]);
  mockSend.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403, retryable: false }));
  render(<SafetyAlertQueueSync employeeUid="employee-a" />);
  await waitFor(() => expect(mockRemove).toHaveBeenCalledWith('employee-a', queued.eventId));
});
