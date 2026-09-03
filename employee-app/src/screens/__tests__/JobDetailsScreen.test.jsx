import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockGetEmployeeJob = jest.fn();
const mockIsAccessLoss = jest.fn(error => ["job_unavailable", "unauthenticated", "forbidden"].includes(error?.code));

jest.mock("../../api/employeeJobs", () => ({
  getEmployeeJob: (...args) => mockGetEmployeeJob(...args),
  isEmployeeJobAccessLossError: (...args) => mockIsAccessLoss(...args),
}));
jest.mock("../../context/AuthContext", () => {
  const ReactModule = require("react");
  return { AuthContext: ReactModule.createContext(null) };
});

import { AuthContext } from "../../context/AuthContext";
import JobDetailsScreen from "../JobDetailsScreen";

function packet(id = "booking-a", overrides = {}) {
  return {
    id,
    schedule: { date: "2026-09-03", startTime: "09:00", endTime: "11:00", scheduledAt: null },
    serviceType: "Standard Cleaning",
    customer: { name: "Sample Customer", phone: "555-0100" },
    location: { address: "100 Example Ave" },
    status: "scheduled",
    fieldStatus: "not_started",
    instructions: "Use the side entrance.",
    checklist: { ready: true, items: [], completed: 3, total: 8, notes: "", warnings: [] },
    fieldNotes: "Entry confirmed.",
    fieldIssue: "Loose step reported.",
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

function renderDetail({ bookingId = "booking-a", employeeUid = "employee-a", navigation } = {}) {
  const resolvedNavigation = navigation || { goBack: jest.fn() };
  const result = render(
    <AuthContext.Provider value={{ employee: { uid: employeeUid } }}>
      <JobDetailsScreen route={{ params: { bookingId } }} navigation={resolvedNavigation} />
    </AuthContext.Provider>
  );
  return { ...result, navigation: resolvedNavigation };
}

beforeEach(() => jest.clearAllMocks());

test("performs a fresh GET and hides detail until it resolves", async () => {
  const pending = deferred();
  mockGetEmployeeJob.mockReturnValue(pending.promise);
  renderDetail();

  expect(mockGetEmployeeJob).toHaveBeenCalledWith("booking-a");
  expect(screen.getByText("Loading job details...")).toBeTruthy();
  expect(screen.queryByText("Sample Customer")).toBeNull();

  await act(async () => pending.resolve(packet()));
  expect(screen.getByText("Sample Customer")).toBeTruthy();
});

test("renders only safe read-only job detail sections", async () => {
  mockGetEmployeeJob.mockResolvedValue(packet());
  renderDetail();

  expect(await screen.findByText("Standard Cleaning")).toBeTruthy();
  expect(screen.getByText("2026-09-03")).toBeTruthy();
  expect(screen.getByText("09:00 - 11:00")).toBeTruthy();
  expect(screen.getByText("555-0100")).toBeTruthy();
  expect(screen.getByText("100 Example Ave")).toBeTruthy();
  expect(screen.getByText("Use the side entrance.")).toBeTruthy();
  expect(screen.getByText("Checklist ready")).toBeTruthy();
  expect(screen.getByText("3 of 8 complete")).toBeTruthy();
  expect(screen.getByText("Entry confirmed.")).toBeTruthy();
  expect(screen.getByText("Loose step reported.")).toBeTruthy();
  expect(screen.queryByText("Start Job")).toBeNull();
  expect(screen.queryByText("View Checklist")).toBeNull();
  expect(screen.queryByText("Upload Photos")).toBeNull();
  expect(screen.queryByText("Complete Job")).toBeNull();
});

test("unready checklist shows owner review without stale task content", async () => {
  mockGetEmployeeJob.mockResolvedValue(packet("booking-a", {
    checklist: {
      ready: false,
      items: [{ id: "stale", label: "Stale private task" }],
      completed: 0,
      total: 0,
      notes: "",
      warnings: [],
    },
  }));
  renderDetail();

  expect(await screen.findByText("Owner review required")).toBeTruthy();
  expect(screen.queryByText("Stale private task")).toBeNull();
});

test("job_unavailable clears detail and returns through the native back action", async () => {
  const navigation = { goBack: jest.fn() };
  mockGetEmployeeJob.mockRejectedValue({ code: "job_unavailable" });
  renderDetail({ navigation });

  expect(await screen.findByText("This job is no longer available.")).toBeTruthy();
  fireEvent.press(screen.getByText("Back to My Day"));
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});

test("generic detail failure offers a safe retry", async () => {
  mockGetEmployeeJob.mockRejectedValueOnce(new Error("private detail")).mockResolvedValueOnce(packet());
  renderDetail();

  expect(await screen.findByText("This job could not be loaded. Try again.")).toBeTruthy();
  fireEvent.press(screen.getByText("Retry"));
  expect(await screen.findByText("Sample Customer")).toBeTruthy();
  expect(mockGetEmployeeJob).toHaveBeenCalledTimes(2);
});

test("late job A response cannot replace newer job B detail", async () => {
  const jobARequest = deferred();
  mockGetEmployeeJob
    .mockReturnValueOnce(jobARequest.promise)
    .mockResolvedValueOnce(packet("booking-b", { customer: { name: "Customer B", phone: "555-0200" } }));
  const navigation = { goBack: jest.fn() };
  const view = renderDetail({ bookingId: "booking-a", navigation });

  view.rerender(
    <AuthContext.Provider value={{ employee: { uid: "employee-a" } }}>
      <JobDetailsScreen route={{ params: { bookingId: "booking-b" } }} navigation={navigation} />
    </AuthContext.Provider>
  );
  expect(await screen.findByText("Customer B")).toBeTruthy();

  await act(async () => jobARequest.resolve(packet("booking-a", {
    customer: { name: "Customer A", phone: "555-0100" },
  })));
  expect(screen.queryByText("Customer A")).toBeNull();
  expect(screen.getByText("Customer B")).toBeTruthy();
});

test("payment and raw snapshot fields never render", async () => {
  mockGetEmployeeJob.mockResolvedValue({
    ...packet(),
    agreedPrice: "$999",
    paymentStatus: "Secret payment state",
    booking: { notes: "Private owner note" },
    customerSnapshot: { email: "private@example.test" },
  });
  renderDetail();

  await screen.findByText("Sample Customer");
  expect(screen.queryByText("$999")).toBeNull();
  expect(screen.queryByText("Secret payment state")).toBeNull();
  expect(screen.queryByText("Private owner note")).toBeNull();
  expect(screen.queryByText("private@example.test")).toBeNull();
});
