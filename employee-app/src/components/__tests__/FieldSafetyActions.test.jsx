import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, Linking } from 'react-native';
import FieldSafetyActions from '../FieldSafetyActions';

const mockSend = jest.fn();
const mockEnqueue = jest.fn();
const mockGetQueued = jest.fn();
const mockRemoveQueued = jest.fn();
const mockPermission = jest.fn();
const mockPosition = jest.fn();
jest.mock('../../api/employeeSafety', () => ({
  sendSafetyAlert: (...args) => mockSend(...args),
  isRetryableSafetyError: error => error?.retryable === true,
}));
jest.mock('../../api/employeeSafetyQueue', () => ({
  enqueueSafetyAlert: (...args) => mockEnqueue(...args),
  getQueuedSafetyAlertsForJob: (...args) => mockGetQueued(...args),
  removeQueuedSafetyAlert: (...args) => mockRemoveQueued(...args),
}));
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: (...args) => mockPermission(...args),
  getCurrentPositionAsync: (...args) => mockPosition(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'openURL').mockResolvedValue();
  mockPermission.mockResolvedValue({ status: 'denied' });
  mockSend.mockResolvedValue({ status: 'sent' });
  mockEnqueue.mockImplementation(async event => event);
  mockGetQueued.mockResolvedValue([]);
  mockRemoveQueued.mockResolvedValue();
});

afterEach(() => jest.restoreAllMocks());

test('dialer actions are explicit and owner uses only projected phone', async () => {
  render(<FieldSafetyActions bookingId="job-a" businessPhone="(555) 123-4567" employeeUid="employee-a" />);
  await act(async () => fireEvent.press(screen.getByText('Call 911')));
  await act(async () => fireEvent.press(screen.getByText('Call Owner')));
  expect(Linking.openURL).toHaveBeenNthCalledWith(1, 'tel:911');
  expect(Linking.openURL).toHaveBeenNthCalledWith(2, 'tel:5551234567');
  expect(mockSend).not.toHaveBeenCalled();
});

test('missing business phone disables owner call', () => {
  render(<FieldSafetyActions bookingId="job-a" businessPhone={null} employeeUid="employee-a" />);
  fireEvent.press(screen.getByText('Call Owner'));
  expect(Linking.openURL).not.toHaveBeenCalled();
  expect(screen.getByText(/Business phone is unavailable/)).toBeTruthy();
});

test('location denial does not block send and status waits for server confirmation', async () => {
  let resolveSend;
  mockSend.mockReturnValue(new Promise(resolve => { resolveSend = resolve; }));
  render(<FieldSafetyActions bookingId="job-a" employeeUid="employee-a" />);
  fireEvent.press(screen.getByText('Send Safety Alert'));
  await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ bookingId: 'job-a' }));
  expect(mockSend.mock.calls[0][0].location).toBeUndefined();
  expect(screen.queryByText('Safety alert sent to ServicesOS.')).toBeNull();
  await act(async () => resolveSend({ status: 'sent' }));
  expect(screen.getByText('Safety alert sent to ServicesOS.')).toBeTruthy();
});

test('retryable failure queues and explicit retry uses the same event and payload', async () => {
  mockPermission.mockResolvedValue({ status: 'granted' });
  mockPosition.mockResolvedValue({ coords: { latitude: 41.8, longitude: -87.6 }, timestamp: Date.now() });
  mockSend.mockRejectedValueOnce(Object.assign(new Error('offline'), { retryable: true }));
  render(<FieldSafetyActions bookingId="job-a" employeeUid="employee-a" />);
  await act(async () => fireEvent.press(screen.getByText('Send Safety Alert')));
  expect(screen.getByText(/queued on this device/)).toBeTruthy();
  expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({ employeeUid: 'employee-a', bookingId: 'job-a' }));
  await act(async () => fireEvent.press(screen.getByText('Retry Safety Alert')));
  expect(mockSend.mock.calls[1][0].eventId).toBe(mockSend.mock.calls[0][0].eventId);
  expect(mockSend.mock.calls[1][0].location).toEqual(mockSend.mock.calls[0][0].location);
  expect(mockPermission).toHaveBeenCalledTimes(1);
  expect(mockRemoveQueued).toHaveBeenCalledWith('employee-a', mockSend.mock.calls[0][0].eventId);
});

test('permanent authorization failure is Failed and never queued', async () => {
  mockSend.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403, retryable: false }));
  const onAccessLost = jest.fn();
  render(<FieldSafetyActions bookingId="job-a" employeeUid="employee-a" onAccessLost={onAccessLost} />);
  await act(async () => fireEvent.press(screen.getByText('Send Safety Alert')));
  expect(screen.getByText('Safety alert failed. Try again.')).toBeTruthy();
  expect(mockEnqueue).not.toHaveBeenCalled();
  expect(onAccessLost).toHaveBeenCalledTimes(1);
});

test('persisted queued event retries on mount without recollecting location', async () => {
  const queued = {
    eventId: 'safety_event_queued_123', bookingId: 'job-a',
    location: { latitude: 41.8, longitude: -87.6, capturedAt: '2026-09-26T12:00:00.000Z' },
  };
  mockGetQueued.mockResolvedValue([queued]);
  render(<FieldSafetyActions bookingId="job-a" employeeUid="employee-a" />);
  await waitFor(() => expect(mockSend).toHaveBeenCalledWith({ eventId: queued.eventId, bookingId: 'job-a', location: queued.location }));
  expect(mockPermission).not.toHaveBeenCalled();
  expect(mockRemoveQueued).toHaveBeenCalledWith('employee-a', queued.eventId);
  expect(screen.getByText('Safety alert sent to ServicesOS.')).toBeTruthy();
});

test('queued event retries when the app resumes and retains the same event ID', async () => {
  let appStateListener;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    appStateListener = listener;
    return { remove: jest.fn() };
  });
  mockSend.mockRejectedValueOnce(Object.assign(new Error('offline'), { retryable: true }));
  render(<FieldSafetyActions bookingId="job-a" employeeUid="employee-a" />);
  await act(async () => fireEvent.press(screen.getByText('Send Safety Alert')));
  const eventId = mockSend.mock.calls[0][0].eventId;
  expect(screen.getByText(/queued on this device/)).toBeTruthy();
  await act(async () => appStateListener('active'));
  expect(mockSend.mock.calls[1][0].eventId).toBe(eventId);
  expect(screen.getByText('Safety alert sent to ServicesOS.')).toBeTruthy();
});

test('successful online send leaves no queued item', async () => {
  render(<FieldSafetyActions bookingId="job-a" employeeUid="employee-a" />);
  await act(async () => fireEvent.press(screen.getByText('Send Safety Alert')));
  expect(mockEnqueue).not.toHaveBeenCalled();
  expect(mockRemoveQueued).toHaveBeenCalledTimes(1);
});

test('server-confirmed delivery remains Sent if local cleanup must retry later', async () => {
  mockRemoveQueued.mockRejectedValue(new Error('temporary file failure'));
  render(<FieldSafetyActions bookingId="job-a" employeeUid="employee-a" />);
  await act(async () => fireEvent.press(screen.getByText('Send Safety Alert')));
  expect(screen.getByText('Safety alert sent to ServicesOS.')).toBeTruthy();
  expect(screen.queryByText('Safety alert failed. Try again.')).toBeNull();
});

test('one-time valid foreground location is supplemental', async () => {
  mockPermission.mockResolvedValue({ status: 'granted' });
  mockPosition.mockResolvedValue({ coords: { latitude: 41.8, longitude: -87.6, accuracy: 10 }, timestamp: Date.now() });
  render(<FieldSafetyActions bookingId="job-a" employeeUid="employee-a" />);
  await act(async () => fireEvent.press(screen.getByText('Send Safety Alert')));
  expect(mockSend.mock.calls[0][0].location).toEqual(expect.objectContaining({ latitude: 41.8, longitude: -87.6 }));
  expect(mockPosition).toHaveBeenCalledTimes(1);
});

test('location failure still sends without location', async () => {
  mockPermission.mockResolvedValue({ status: 'granted' });
  mockPosition.mockRejectedValue(new Error('unavailable'));
  render(<FieldSafetyActions bookingId="job-a" employeeUid="employee-a" />);
  await act(async () => fireEvent.press(screen.getByText('Send Safety Alert')));
  expect(mockSend.mock.calls[0][0].location).toBeUndefined();
  expect(screen.getByText('Safety alert sent to ServicesOS.')).toBeTruthy();
});

test('dialer failure is shown rather than claiming a call was placed', async () => {
  Linking.openURL.mockRejectedValue(new Error('no dialer'));
  render(<FieldSafetyActions bookingId="job-a" employeeUid="employee-a" />);
  await act(async () => fireEvent.press(screen.getByText('Call 911')));
  expect(screen.getByText('The phone dialer could not be opened.')).toBeTruthy();
  expect(mockSend).not.toHaveBeenCalled();
});
