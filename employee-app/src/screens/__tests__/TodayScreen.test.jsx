import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockListEmployeeJobs = jest.fn();

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: callback => {
    const ReactModule = require("react");
    ReactModule.useEffect(callback, [callback]);
  },
}));
jest.mock("../../api/employeeJobs", () => ({
  listEmployeeJobs: (...args) => mockListEmployeeJobs(...args),
}));
jest.mock("../../context/AuthContext", () => {
  const ReactModule = require("react");
  return { AuthContext: ReactModule.createContext(null) };
});

import { AuthContext } from "../../context/AuthContext";
import TodayScreen, { groupEmployeeJobs } from "../TodayScreen";

function job(id, date, overrides = {}) {
  return {
    id,
    schedule: { date, startTime: "09:00", endTime: "11:00", scheduledAt: null },
    serviceType: "Standard Cleaning",
    customerName: `Customer ${id}`,
    address: `${id} Example Ave`,
    status: "scheduled",
    fieldStatus: "not_started",
    ...overrides,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function jobList(jobs, todayDate = "2026-09-03") {
  return { todayDate, jobs };
}

function renderToday({ employee = { uid: "employee-a" }, navigation = { navigate: jest.fn() } } = {}) {
  const result = render(
    <AuthContext.Provider value={{ employee }}>
      <TodayScreen navigation={navigation} />
    </AuthContext.Provider>
  );
  return { ...result, navigation };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 8, 4, 9, 0, 0));
});

afterEach(() => {
  jest.useRealTimers();
});

test("tenant todayDate overrides a mismatched device-local date for grouping", () => {
  const jobs = [job("tenant-today", "2026-09-03"), job("future", "2026-09-04")];
  const grouped = groupEmployeeJobs(jobs, "2026-09-03");
  expect(grouped.today.map(item => item.id)).toEqual(["tenant-today"]);
  expect(grouped.upcoming.map(item => item.id)).toEqual(["future"]);
});

test("shows loading, then renders real today and upcoming safe summaries", async () => {
  const pending = deferred();
  mockListEmployeeJobs.mockReturnValue(pending.promise);
  renderToday();

  expect(screen.getByText("Loading your jobs...")).toBeTruthy();
  expect(screen.queryByText("123 Main St")).toBeNull();

  await act(async () => pending.resolve(jobList([
    job("today", "2026-09-03"),
    job("future", "2026-09-04", { serviceType: "Deep Cleaning" }),
  ])));

  expect(screen.getByText("Today")).toBeTruthy();
  expect(screen.getByText("Upcoming")).toBeTruthy();
  expect(screen.getByText("Customer today")).toBeTruthy();
  expect(screen.getByText("Deep Cleaning")).toBeTruthy();
  expect(screen.getByText("2026-09-03")).toBeTruthy();
});

test("shows intentional empty states for both groups", async () => {
  mockListEmployeeJobs.mockResolvedValue(jobList([]));
  renderToday();

  expect(await screen.findByText("No jobs scheduled for today.")).toBeTruthy();
  expect(screen.getByText("No upcoming jobs scheduled.")).toBeTruthy();
});

test("generic error and retry issue one bounded reload", async () => {
  mockListEmployeeJobs.mockRejectedValueOnce(new Error("private detail")).mockResolvedValueOnce(jobList([]));
  renderToday();

  expect(await screen.findByText("Your jobs could not be loaded. Try again.")).toBeTruthy();
  fireEvent.press(screen.getByText("Retry"));
  await waitFor(() => expect(screen.getByText("No jobs scheduled for today.")).toBeTruthy());
  expect(mockListEmployeeJobs).toHaveBeenCalledTimes(2);
});

test("pull-to-refresh performs one list reload", async () => {
  mockListEmployeeJobs.mockResolvedValue(jobList([]));
  renderToday();
  await screen.findByText("No jobs scheduled for today.");

  const list = screen.getByTestId("employee-job-list");
  await act(async () => list.props.refreshControl.props.onRefresh());
  expect(mockListEmployeeJobs).toHaveBeenCalledTimes(2);
});

test("job card navigation passes bookingId only", async () => {
  const navigation = { navigate: jest.fn() };
  mockListEmployeeJobs.mockResolvedValue(jobList([job("booking-a", "2026-09-03")]));
  renderToday({ navigation });

  fireEvent.press(await screen.findByLabelText("Open Standard Cleaning job for Customer booking-a"));
  expect(navigation.navigate).toHaveBeenCalledWith("JobDetails", { bookingId: "booking-a" });
});

test("late prior-employee list response cannot restore stale jobs", async () => {
  const employeeARequest = deferred();
  mockListEmployeeJobs
    .mockReturnValueOnce(employeeARequest.promise)
    .mockResolvedValueOnce(jobList([job("employee-b-job", "2026-09-03")]));
  const navigation = { navigate: jest.fn() };
  const view = render(
    <AuthContext.Provider value={{ employee: { uid: "employee-a" } }}>
      <TodayScreen navigation={navigation} />
    </AuthContext.Provider>
  );

  view.rerender(
    <AuthContext.Provider value={{ employee: { uid: "employee-b" } }}>
      <TodayScreen navigation={navigation} />
    </AuthContext.Provider>
  );
  expect(await screen.findByText("Customer employee-b-job")).toBeTruthy();

  await act(async () => employeeARequest.resolve(jobList([job("employee-a-job", "2026-09-03")])));
  expect(screen.queryByText("Customer employee-a-job")).toBeNull();
  expect(screen.getByText("Customer employee-b-job")).toBeTruthy();
});
