import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import FieldSafetyActions from '../FieldSafetyActions';

const mockSend = jest.fn();
const mockPermission = jest.fn();
const mockPosition = jest.fn();
jest.mock('../../api/employeeSafety', () => ({ sendSafetyAlert: (...args) => mockSend(...args) }));
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

test('failure permits explicit retry with the same event ID', async () => {
  mockSend.mockRejectedValueOnce(new Error('offline'));
  render(<FieldSafetyActions bookingId="job-a" employeeUid="employee-a" />);
  await act(async () => fireEvent.press(screen.getByText('Send Safety Alert')));
  expect(screen.getByText('Safety alert failed. Try again.')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByText('Retry Safety Alert')));
  expect(mockSend.mock.calls[1][0].eventId).toBe(mockSend.mock.calls[0][0].eventId);
  expect(mockPermission).toHaveBeenCalledTimes(1);
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
