import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockGetEmployeeJob = jest.fn();
const mockAskEmployeeWorkAssistant = jest.fn();
const mockIsEmployeeJobAccessLossError = jest.fn(error => error?.code === 'job_unavailable');
const mockIsEmployeeWorkAssistantAccessLoss = jest.fn(error => error?.code === 'job_unavailable');
let mockRequestSequence = 0;

jest.mock('../../api/employeeJobs', () => ({
  getEmployeeJob: (...args) => mockGetEmployeeJob(...args),
  isEmployeeJobAccessLossError: error => mockIsEmployeeJobAccessLossError(error),
}));
jest.mock('../../api/employeeWorkAssistant', () => ({
  askEmployeeWorkAssistant: (...args) => mockAskEmployeeWorkAssistant(...args),
  createEmployeeWorkAssistantRequestId: () => `request-12345678-${++mockRequestSequence}`,
  isEmployeeWorkAssistantAccessLoss: error => mockIsEmployeeWorkAssistantAccessLoss(error),
}));
jest.mock('../../context/AuthContext', () => {
  const ReactModule = require('react');
  return { AuthContext: ReactModule.createContext(null) };
});

import { AuthContext } from '../../context/AuthContext';
import WorkAssistantScreen from '../WorkAssistantScreen';

function job() {
  return {
    id: 'booking-a',
    checklist: {
      ready: true,
      items: [
        { id: 'task-a', label: 'Clean counter', completed: false },
        { id: 'task-b', label: 'Clean floor', completed: true },
      ],
    },
  };
}

function renderScreen({ employee = { uid: 'employee-a' }, bookingId = 'booking-a' } = {}) {
  const navigation = { popToTop: jest.fn() };
  const value = { employee };
  const result = render(
    <AuthContext.Provider value={value}>
      <WorkAssistantScreen navigation={navigation} route={{ params: { bookingId } }} />
    </AuthContext.Provider>,
  );
  return { ...result, navigation };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestSequence = 0;
  mockGetEmployeeJob.mockResolvedValue(job());
  mockAskEmployeeWorkAssistant.mockResolvedValue({ kind: 'deterministic', answer: 'Clean counter is next.', requestId: 'request-12345678-1' });
});

test('loads the current job before rendering the assistant', async () => {
  let resolve;
  mockGetEmployeeJob.mockReturnValue(new Promise(value => { resolve = value; }));
  renderScreen();
  expect(screen.getByText('Loading Work Assistant...')).toBeTruthy();
  expect(screen.queryByLabelText('Ask Work Assistant')).toBeNull();
  await act(async () => resolve(job()));
  expect(await screen.findByLabelText('Ask Work Assistant')).toBeTruthy();
  expect(mockGetEmployeeJob).toHaveBeenCalledWith('booking-a');
});

test('quick deterministic prompt sends no checklist context', async () => {
  renderScreen();
  await screen.findByLabelText('Ask Work Assistant');
  fireEvent.press(screen.getByText('What task is next?'));
  await waitFor(() => expect(mockAskEmployeeWorkAssistant).toHaveBeenCalledTimes(1));
  expect(mockAskEmployeeWorkAssistant).toHaveBeenCalledWith({
    bookingId: 'booking-a', question: 'What task is next?', requestId: 'request-12345678-1',
  });
  expect(await screen.findByText('Clean counter is next.')).toBeTruthy();
});

test('selected checklist explanation sends only its ID', async () => {
  mockAskEmployeeWorkAssistant.mockResolvedValue({ kind: 'explanation', answer: 'Use even passes.', requestId: 'request-12345678-1' });
  renderScreen();
  await screen.findByLabelText('Ask Work Assistant');
  fireEvent.press(screen.getByText('Clean floor'));
  fireEvent.press(screen.getByText('Explain selected checklist item'));
  await waitFor(() => expect(mockAskEmployeeWorkAssistant).toHaveBeenCalledWith({
    bookingId: 'booking-a',
    question: 'Explain this checklist item in simpler language.',
    requestId: 'request-12345678-1',
    checklistItemId: 'task-b',
  }));
  expect(await screen.findByText('Use even passes.')).toBeTruthy();
});

test('duplicate submissions are blocked while a request is pending', async () => {
  let resolve;
  mockAskEmployeeWorkAssistant.mockReturnValue(new Promise(value => { resolve = value; }));
  renderScreen();
  const input = await screen.findByLabelText('Ask Work Assistant');
  fireEvent.changeText(input, 'What is the schedule?');
  fireEvent.press(screen.getByText('Send'));
  fireEvent.press(screen.getByText('Sending...'));
  expect(mockAskEmployeeWorkAssistant).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ kind: 'deterministic', answer: 'At 9.', requestId: 'request-123456789' }));
});

test('access loss clears the session and returns to My Day without revealing stale Job Detail', async () => {
  mockAskEmployeeWorkAssistant.mockRejectedValue(Object.assign(new Error('lost'), { code: 'job_unavailable' }));
  const { navigation } = renderScreen();
  await screen.findByLabelText('Ask Work Assistant');
  fireEvent.press(screen.getByText('What task is next?'));
  expect(await screen.findByText('This job is no longer available.')).toBeTruthy();
  fireEvent.press(screen.getByText('Back to Jobs'));
  expect(navigation.popToTop).toHaveBeenCalledTimes(1);
});

test('provider unavailable and escalation results remain safe visible states', async () => {
  mockAskEmployeeWorkAssistant
    .mockResolvedValueOnce({ kind: 'unavailable', answer: 'AI explanation is temporarily unavailable. Job details and deterministic help are still available.', requestId: 'request-123456789' })
    .mockResolvedValueOnce({ kind: 'escalation', answer: 'Stop and contact the owner/supervisor before proceeding.', requestId: 'request-123456789' });
  renderScreen();
  await screen.findByLabelText('Ask Work Assistant');
  fireEvent.press(screen.getByText('What task is next?'));
  expect(await screen.findByText(/AI explanation is temporarily unavailable/)).toBeTruthy();
  fireEvent.press(screen.getByText('What safety information is recorded?'));
  expect(await screen.findByText(/Stop and contact/)).toBeTruthy();
});

test('a late response cannot enter a different booking session', async () => {
  let resolve;
  mockAskEmployeeWorkAssistant.mockReturnValue(new Promise(value => { resolve = value; }));
  const view = renderScreen();
  await screen.findByLabelText('Ask Work Assistant');
  fireEvent.press(screen.getByText('What task is next?'));
  view.rerender(
    <AuthContext.Provider value={{ employee: { uid: 'employee-a' } }}>
      <WorkAssistantScreen navigation={view.navigation} route={{ params: { bookingId: 'booking-b' } }} />
    </AuthContext.Provider>,
  );
  await act(async () => resolve({ kind: 'deterministic', answer: 'STALE ANSWER', requestId: 'request-123456789' }));
  expect(screen.queryByText('STALE ANSWER')).toBeNull();
});

test('employee logout clears the in-memory assistant session', async () => {
  const view = renderScreen();
  await screen.findByLabelText('Ask Work Assistant');
  fireEvent.press(screen.getByText('What task is next?'));
  expect(await screen.findByText('Clean counter is next.')).toBeTruthy();
  view.rerender(
    <AuthContext.Provider value={{ employee: null }}>
      <WorkAssistantScreen navigation={view.navigation} route={{ params: { bookingId: 'booking-a' } }} />
    </AuthContext.Provider>,
  );
  await waitFor(() => expect(screen.queryByText('Clean counter is next.')).toBeNull());
});

test('source contains no persistent transcript or action gateway imports', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'WorkAssistantScreen.jsx'), 'utf8');
  expect(source).not.toMatch(/AsyncStorage|Firestore|employeeFieldExecution|fieldPhotos|employeeNavigation/);
});
