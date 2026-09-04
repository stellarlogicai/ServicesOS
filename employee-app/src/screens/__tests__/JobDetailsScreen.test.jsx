import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockGetEmployeeJob = jest.fn();
const mockIsAccessLoss = jest.fn(error => ["job_unavailable", "unauthenticated", "forbidden"].includes(error?.code));
const mockStartEmployeeJob = jest.fn();
const mockSaveEmployeeChecklist = jest.fn();
const mockSaveEmployeeNotes = jest.fn();
const mockCompleteEmployeeJob = jest.fn();

jest.mock("../../api/employeeJobs", () => ({
  getEmployeeJob: (...args) => mockGetEmployeeJob(...args),
  isEmployeeJobAccessLossError: (...args) => mockIsAccessLoss(...args),
}));
jest.mock("../../api/employeeFieldExecution", () => ({
  startEmployeeJob: (...args) => mockStartEmployeeJob(...args),
  saveEmployeeChecklist: (...args) => mockSaveEmployeeChecklist(...args),
  saveEmployeeNotes: (...args) => mockSaveEmployeeNotes(...args),
  completeEmployeeJob: (...args) => mockCompleteEmployeeJob(...args),
}));
jest.mock("../../context/AuthContext", () => {
  const ReactModule = require("react");
  return { AuthContext: ReactModule.createContext(null) };
});

import { AuthContext } from "../../context/AuthContext";
import JobDetailsScreen from "../JobDetailsScreen";

function checklistItem(overrides = {}) {
  return {
    id: "required-item",
    area: "Kitchen",
    fixtureOrSurface: "Counter",
    label: "Clean counter",
    completionCriteria: "Counter is clean",
    jobAidSteps: [{ label: "Wipe surface", note: "Use a clean cloth", condition: "When dry" }],
    warnings: ["Use approved product"],
    note: "Follow the approved packet",
    condition: "If accessible",
    required: true,
    completed: false,
    approvedMethodIds: ["method-private-to-ui"],
    preferredMethodId: "method-private-to-ui",
    ...overrides,
  };
}

function packet(id = "booking-a", overrides = {}) {
  const { checklist: checklistOverrides = {}, ...jobOverrides } = overrides;
  const items = checklistOverrides.items || [
    checklistItem(),
    checklistItem({ id: "optional-item", label: "Polish fixture", required: false }),
  ];
  return {
    id,
    schedule: { date: "2026-09-03", startTime: "09:00", endTime: "11:00", scheduledAt: null },
    serviceType: "Standard Cleaning",
    customer: { name: "Sample Customer", phone: "555-0100" },
    location: { address: "100 Example Ave" },
    status: "scheduled",
    fieldStatus: "not_started",
    instructions: "Use the side entrance.",
    checklist: {
      ready: true,
      items,
      completed: items.filter(item => item.completed).length,
      total: items.length,
      notes: "Approved packet note",
      warnings: ["Packet warning"],
      ...checklistOverrides,
    },
    fieldNotes: "Entry confirmed.",
    fieldIssue: "Loose step reported.",
    ...jobOverrides,
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
    <AuthContext.Provider value={{ employee: employeeUid ? { uid: employeeUid } : null }}>
      <JobDetailsScreen route={{ params: { bookingId } }} navigation={resolvedNavigation} />
    </AuthContext.Provider>
  );
  return { ...result, navigation: resolvedNavigation };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetEmployeeJob.mockResolvedValue(packet());
  mockStartEmployeeJob.mockResolvedValue(packet("booking-a", { fieldStatus: "in_progress" }));
  mockSaveEmployeeChecklist.mockResolvedValue(packet());
  mockSaveEmployeeNotes.mockResolvedValue(packet());
  mockCompleteEmployeeJob.mockResolvedValue(packet("booking-a", {
    fieldStatus: "completed",
    checklist: {
      items: [checklistItem({ completed: true }), checklistItem({ id: "optional-item", label: "Polish fixture", required: false })],
    },
  }));
});

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

test("renders safe job data and read-only checklist structure", async () => {
  renderDetail();

  expect(await screen.findByText("Standard Cleaning")).toBeTruthy();
  expect(screen.getByText("2026-09-03")).toBeTruthy();
  expect(screen.getByText("09:00 - 11:00")).toBeTruthy();
  expect(screen.getByText("Use the side entrance.")).toBeTruthy();
  expect(screen.getByText("Clean counter")).toBeTruthy();
  expect(screen.getByText("Required")).toBeTruthy();
  expect(screen.getAllByText("Condition: If accessible")).toHaveLength(2);
  expect(screen.getAllByText("Complete when: Counter is clean")).toHaveLength(2);
  expect(screen.getAllByText("Warning: Use approved product")).toHaveLength(2);
  expect(screen.getAllByText("1. Wipe surface - Use a clean cloth (When dry)")).toHaveLength(2);
  expect(screen.queryByText("method-private-to-ui")).toBeNull();
  expect(screen.getByLabelText("Field Notes")).toBeTruthy();
  expect(screen.getByLabelText("Reported Issue")).toBeTruthy();
  expect(screen.queryByText("Upload Photos")).toBeNull();
});

test("Start Job submits once and replaces the packet with in-progress state", async () => {
  const pending = deferred();
  mockStartEmployeeJob.mockReturnValue(pending.promise);
  renderDetail();
  const start = await screen.findByText("Start Job");

  await act(async () => {
    fireEvent.press(start);
    fireEvent.press(start);
  });
  expect(mockStartEmployeeJob).toHaveBeenCalledTimes(1);
  expect(mockStartEmployeeJob).toHaveBeenCalledWith("booking-a");

  await act(async () => pending.resolve(packet("booking-a", { fieldStatus: "in_progress" })));
  expect(screen.getByText("Field status: In Progress")).toBeTruthy();
  expect(screen.getByText("Job started.")).toBeTruthy();
  expect(screen.queryByText("Start Job")).toBeNull();
});

test("completed jobs cannot restart or complete again", async () => {
  mockGetEmployeeJob.mockResolvedValue(packet("booking-a", { fieldStatus: "completed" }));
  renderDetail();

  expect(await screen.findByText("Field status: Completed")).toBeTruthy();
  expect(screen.queryByText("Start Job")).toBeNull();
  expect(screen.getByRole("button", { name: "Completed" })).toBeDisabled();
});

test("checklist toggle changes completion only and Save sends every narrow state", async () => {
  mockSaveEmployeeChecklist.mockResolvedValue(packet());
  renderDetail();
  const toggle = await screen.findByTestId("checklist-toggle-required-item");

  fireEvent(toggle, "valueChange", true);
  await act(async () => fireEvent.press(screen.getByText("Save Checklist")));

  expect(mockSaveEmployeeChecklist).toHaveBeenCalledWith("booking-a", [
    { id: "required-item", completed: true },
    { id: "optional-item", completed: false },
  ]);
  expect(await screen.findByText("Checklist saved.")).toBeTruthy();
  expect(screen.getByTestId("checklist-toggle-required-item").props.value).toBe(false);
});

test("unready checklist exposes no tasks and blocks checklist/completion actions", async () => {
  mockGetEmployeeJob.mockResolvedValue(packet("booking-a", {
    checklist: { ready: false, items: [], completed: 0, total: 0, notes: "", warnings: [] },
  }));
  renderDetail();

  expect(await screen.findByText("Owner review is required before this checklist can be used.")).toBeTruthy();
  expect(screen.queryByText("Clean counter")).toBeNull();
  expect(screen.queryByText("Save Checklist")).toBeNull();
  expect(screen.getByRole("button", { name: "Complete Job" })).toBeDisabled();
});

test("Field Notes and Reported Issue are editable, bounded, and saved together", async () => {
  mockSaveEmployeeNotes.mockImplementation(async (_id, notes, issue) => packet("booking-a", {
    fieldNotes: notes,
    fieldIssue: issue,
  }));
  renderDetail();
  const notes = await screen.findByLabelText("Field Notes");
  const issue = screen.getByLabelText("Reported Issue");
  expect(notes.props.value).toBe("Entry confirmed.");
  expect(issue.props.value).toBe("Loose step reported.");

  fireEvent.changeText(notes, "n".repeat(1005));
  fireEvent.changeText(issue, "i".repeat(755));
  expect(screen.getByLabelText("Field Notes").props.value).toHaveLength(1000);
  expect(screen.getByLabelText("Reported Issue").props.value).toHaveLength(750);
  await act(async () => fireEvent.press(screen.getByText("Save Notes")));

  expect(mockSaveEmployeeNotes).toHaveBeenCalledWith(
    "booking-a",
    "n".repeat(1000),
    "i".repeat(750)
  );
  expect(await screen.findByText("Notes saved.")).toBeTruthy();
});

test("incomplete required checklist blocks completion locally", async () => {
  renderDetail();
  await screen.findByText("Clean counter");

  expect(screen.getByText("1 required checklist item must be completed first.")).toBeTruthy();
  fireEvent.press(screen.getByText("Complete Job"));
  expect(mockCompleteEmployeeJob).not.toHaveBeenCalled();
});

test("complete sends checklist, notes, and issue then keeps completed detail visible", async () => {
  renderDetail();
  const toggle = await screen.findByTestId("checklist-toggle-required-item");
  fireEvent(toggle, "valueChange", true);
  fireEvent.changeText(screen.getByLabelText("Field Notes"), "Finished safely");
  fireEvent.changeText(screen.getByLabelText("Reported Issue"), "");
  await act(async () => fireEvent.press(screen.getByText("Complete Job")));

  expect(mockCompleteEmployeeJob).toHaveBeenCalledWith(
    "booking-a",
    [{ id: "required-item", completed: true }, { id: "optional-item", completed: false }],
    "Finished safely",
    ""
  );
  expect(await screen.findByText("Field status: Completed")).toBeTruthy();
  expect(screen.getByText("Job completed.")).toBeTruthy();
  expect(screen.getByText("Completed")).toBeTruthy();
});

test("duplicate completion is blocked while the first request is pending", async () => {
  const pending = deferred();
  mockCompleteEmployeeJob.mockReturnValue(pending.promise);
  renderDetail();
  const toggle = await screen.findByTestId("checklist-toggle-required-item");
  fireEvent(toggle, "valueChange", true);
  const complete = screen.getByText("Complete Job");
  await act(async () => {
    fireEvent.press(complete);
    fireEvent.press(complete);
    await Promise.resolve();
  });
  expect(mockCompleteEmployeeJob).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(packet("booking-a", { fieldStatus: "completed" })));
});

test("mutation access loss clears packet and unsaved drafts", async () => {
  mockStartEmployeeJob.mockRejectedValue({ code: "job_unavailable" });
  renderDetail();
  fireEvent.changeText(await screen.findByLabelText("Field Notes"), "Unsaved private draft");
  await act(async () => fireEvent.press(screen.getByText("Start Job")));

  expect(await screen.findByText("This job is no longer available.")).toBeTruthy();
  expect(screen.queryByText("Unsaved private draft")).toBeNull();
  expect(screen.queryByText("Sample Customer")).toBeNull();
});

test("generic mutation and checklist-unavailable failures use safe messages", async () => {
  mockSaveEmployeeChecklist.mockRejectedValueOnce(new Error("private detail"));
  renderDetail();
  const saveChecklist = await screen.findByText("Save Checklist");
  await act(async () => fireEvent.press(saveChecklist));
  expect(await screen.findByText("Your job update could not be saved. Try again.")).toBeTruthy();

  mockSaveEmployeeChecklist.mockRejectedValueOnce({ code: "checklist_unavailable" });
  await act(async () => fireEvent.press(screen.getByText("Save Checklist")));
  expect(await screen.findByText("Owner review is required before this checklist can be used.")).toBeTruthy();
});

test("late job and mutation responses cannot restore a prior job", async () => {
  const mutation = deferred();
  mockStartEmployeeJob.mockReturnValue(mutation.promise);
  const navigation = { goBack: jest.fn() };
  const view = renderDetail({ bookingId: "booking-a", navigation });
  const startJob = await screen.findByText("Start Job");
  await act(async () => {
    fireEvent.press(startJob);
    await Promise.resolve();
  });

  mockGetEmployeeJob.mockResolvedValueOnce(packet("booking-b", {
    customer: { name: "Customer B", phone: "555-0200" },
  }));
  view.rerender(
    <AuthContext.Provider value={{ employee: { uid: "employee-a" } }}>
      <JobDetailsScreen route={{ params: { bookingId: "booking-b" } }} navigation={navigation} />
    </AuthContext.Provider>
  );
  expect(await screen.findByText("Customer B")).toBeTruthy();

  await act(async () => mutation.resolve(packet("booking-a", {
    fieldStatus: "in_progress",
    customer: { name: "Customer A", phone: "555-0100" },
  })));
  expect(screen.queryByText("Customer A")).toBeNull();
  expect(screen.getByText("Customer B")).toBeTruthy();
});

test("employee logout clears packet and local drafts before late work resolves", async () => {
  const mutation = deferred();
  mockStartEmployeeJob.mockReturnValue(mutation.promise);
  const navigation = { goBack: jest.fn() };
  const view = renderDetail({ navigation });
  fireEvent.changeText(await screen.findByLabelText("Field Notes"), "Unsaved draft");
  await act(async () => {
    fireEvent.press(screen.getByText("Start Job"));
    await Promise.resolve();
  });

  view.rerender(
    <AuthContext.Provider value={{ employee: null }}>
      <JobDetailsScreen route={{ params: { bookingId: "booking-a" } }} navigation={navigation} />
    </AuthContext.Provider>
  );
  expect(screen.queryByText("Unsaved draft")).toBeNull();
  expect(screen.queryByText("Sample Customer")).toBeNull();

  await act(async () => mutation.resolve(packet("booking-a", { fieldStatus: "in_progress" })));
  expect(screen.queryByText("Sample Customer")).toBeNull();
});

test("job_unavailable GET clears detail and returns through native back", async () => {
  const navigation = { goBack: jest.fn() };
  mockGetEmployeeJob.mockRejectedValue({ code: "job_unavailable" });
  renderDetail({ navigation });

  expect(await screen.findByText("This job is no longer available.")).toBeTruthy();
  fireEvent.press(screen.getByText("Back to My Day"));
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});

test("generic GET failure retries without exposing internal details", async () => {
  mockGetEmployeeJob.mockRejectedValueOnce(new Error("private detail")).mockResolvedValueOnce(packet());
  renderDetail();

  expect(await screen.findByText("This job could not be loaded. Try again.")).toBeTruthy();
  fireEvent.press(screen.getByText("Retry"));
  expect(await screen.findByText("Sample Customer")).toBeTruthy();
  expect(mockGetEmployeeJob).toHaveBeenCalledTimes(2);
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
