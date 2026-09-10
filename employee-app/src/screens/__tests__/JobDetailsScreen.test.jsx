import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockGetEmployeeJob = jest.fn();
const mockIsAccessLoss = jest.fn(error => ["job_unavailable", "unauthenticated", "forbidden"].includes(error?.code));
const mockStartEmployeeJob = jest.fn();
const mockSaveEmployeeChecklist = jest.fn();
const mockSaveEmployeeNotes = jest.fn();
const mockCompleteEmployeeJob = jest.fn();
const mockListEmployeeFieldPhotos = jest.fn();
const mockGetEmployeeMethodsByIds = jest.fn();
const mockOpenEmployeeJobDirections = jest.fn();
const mockHasEmployeeJobDirections = jest.fn(address => (
  typeof address === "string" && address.trim() && address.trim().toLowerCase() !== "address not provided"
));

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
jest.mock("../../api/employeePhotoEvidence", () => ({
  listEmployeeFieldPhotos: (...args) => mockListEmployeeFieldPhotos(...args),
}));
jest.mock("../../api/employeeMethods", () => ({
  getEmployeeMethodsByIds: (...args) => mockGetEmployeeMethodsByIds(...args),
}));
jest.mock("../../api/employeeNavigation", () => ({
  openEmployeeJobDirections: (...args) => mockOpenEmployeeJobDirections(...args),
  hasEmployeeJobDirections: (...args) => mockHasEmployeeJobDirections(...args),
}));
jest.mock("../../components/FieldPhotoCapture", () => {
  const ReactModule = require("react");
  const { Text } = require("react-native");
  return function FieldPhotoCapture({ phase, photos, disabled }) {
    return <Text>{`${phase}: ${photos.length} uploaded${disabled ? " disabled" : " enabled"}`}</Text>;
  };
});
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
    safety: {
      hazards: [],
      surfaceNotes: "",
      allergyOrProductRestrictions: "",
      pets: { present: false, count: 0, types: [], hairLevel: "none" },
    },
    accessSecurity: { instructions: "Use the side entrance." },
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
    <AuthContext.Provider value={{ employee: employeeUid ? { uid: employeeUid } : null, tenantId: employeeUid ? "tenant-a" : null }}>
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
  mockListEmployeeFieldPhotos.mockResolvedValue([]);
  mockGetEmployeeMethodsByIds.mockResolvedValue([]);
  mockOpenEmployeeJobDirections.mockResolvedValue({ opened: true });
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
  expect(screen.getAllByText("Use the side entrance.")).toHaveLength(2);
  expect(screen.getByText("Clean counter")).toBeTruthy();
  expect(screen.getByText("Required")).toBeTruthy();
  expect(screen.getAllByText("Condition: If accessible")).toHaveLength(2);
  expect(screen.getAllByText("Complete when: Counter is clean")).toHaveLength(2);
  expect(screen.getAllByText("Warning: Use approved product")).toHaveLength(2);
  expect(screen.getAllByText("1. Wipe surface - Use a clean cloth (When dry)")).toHaveLength(2);
  expect(screen.queryByText("method-private-to-ui")).toBeNull();
  expect(screen.getByLabelText("Field Notes")).toBeTruthy();
  expect(screen.getByLabelText("Reported Issue")).toBeTruthy();
  expect(await screen.findByText("before: 0 uploaded enabled")).toBeTruthy();
  expect(screen.getByText("after: 0 uploaded disabled")).toBeTruthy();
});

test("shows Get Directions beside a valid safe address before Start and while in progress", async () => {
  renderDetail();

  expect(await screen.findByText("100 Example Ave")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Get Directions" })).toBeTruthy();
  expect(screen.getByText("Start Job")).toBeTruthy();

  await act(async () => fireEvent.press(screen.getByText("Start Job")));
  expect(await screen.findByText("Field status: In Progress")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Get Directions" })).toBeTruthy();
});

test("omits Get Directions when the current packet has no usable address", async () => {
  mockGetEmployeeJob.mockResolvedValue(packet("booking-a", { location: { address: "Address not provided" } }));
  renderDetail();

  expect(await screen.findByText("Address not provided")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Get Directions" })).toBeNull();
});

test("opens directions with only the current JobPacket address", async () => {
  renderDetail();
  const directions = await screen.findByRole("button", { name: "Get Directions" });
  await act(async () => fireEvent.press(directions));

  expect(mockOpenEmployeeJobDirections).toHaveBeenCalledTimes(1);
  expect(mockOpenEmployeeJobDirections.mock.calls[0][0]).toBe("100 Example Ave");
});

test("navigation failure shows a safe message without interrupting job work", async () => {
  mockOpenEmployeeJobDirections.mockRejectedValue(new Error("private navigation detail"));
  renderDetail();

  const directions = await screen.findByRole("button", { name: "Get Directions" });
  await act(async () => fireEvent.press(directions));
  expect(await screen.findByText("Unable to open directions. Please open your maps app and enter the service address manually.")).toBeTruthy();
  expect(screen.getByText("Standard Cleaning")).toBeTruthy();
  expect(screen.getByText("Start Job")).toBeTruthy();
});

test("a replaced JobPacket invalidates an earlier navigation callback", async () => {
  const pending = deferred();
  mockOpenEmployeeJobDirections.mockReturnValue(pending.promise);
  const view = renderDetail();
  const directions = await screen.findByRole("button", { name: "Get Directions" });
  act(() => {
    fireEvent.press(directions);
  });
  const firstCall = mockOpenEmployeeJobDirections.mock.calls[0];

  mockGetEmployeeJob.mockResolvedValueOnce(packet("booking-b", {
    customer: { name: "Customer B", phone: "555-0200" },
    location: { address: "200 New Address" },
  }));
  view.rerender(
    <AuthContext.Provider value={{ employee: { uid: "employee-a" }, tenantId: "tenant-a" }}>
      <JobDetailsScreen route={{ params: { bookingId: "booking-b" } }} navigation={{ goBack: jest.fn() }} />
    </AuthContext.Provider>
  );
  expect(await screen.findByText("Customer B")).toBeTruthy();
  expect(firstCall[1].isCurrent()).toBe(false);

  await act(async () => {
    pending.reject(new Error("late native failure"));
    await Promise.resolve();
  });
  mockOpenEmployeeJobDirections.mockResolvedValueOnce({ opened: true });
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Get Directions" })));
  expect(mockOpenEmployeeJobDirections.mock.calls[1][0]).toBe("200 New Address");
});

test("renders recorded safety and access before Start without inferring safety or requiring acknowledgment", async () => {
  mockGetEmployeeJob.mockResolvedValue(packet("booking-a", {
    safety: {
      hazards: ["Loose stair rail"],
      surfaceNotes: "Natural stone counter",
      allergyOrProductRestrictions: "Unscented products only",
      pets: { present: true, count: 2, types: ["dog", "cat"], hairLevel: "heavy" },
    },
    accessSecurity: { instructions: "Use the current booking gate instructions." },
  }));
  const view = renderDetail();

  expect(await screen.findByText("Safety & Method")).toBeTruthy();
  expect(screen.getByText("Hazard: Loose stair rail")).toBeTruthy();
  expect(screen.getByText("Surface / material: Natural stone counter")).toBeTruthy();
  expect(screen.getByText("Allergy / Product Restrictions: Unscented products only")).toBeTruthy();
  expect(screen.getByText(/Pets: 2 pets/)).toBeTruthy();
  expect(screen.getByText("Use the current booking gate instructions.")).toBeTruthy();
  const rendered = JSON.stringify(view.toJSON());
  expect(rendered.indexOf("Safety & Method")).toBeLessThan(rendered.indexOf("Start Job"));
  expect(screen.queryByText("This job is safe.")).toBeNull();
  expect(screen.queryByRole("checkbox", { name: /safety/i })).toBeNull();
  expect(screen.getByText("Start Job")).toBeTruthy();
});

test("empty safety remains neutral and the section stays visible while in progress", async () => {
  mockGetEmployeeJob.mockResolvedValue(packet("booking-a", { fieldStatus: "in_progress" }));
  renderDetail();

  expect(await screen.findByText("Safety & Method")).toBeTruthy();
  expect(screen.getByText("No job-specific safety notes recorded.")).toBeTruthy();
  expect(screen.getByText(/If conditions differ from the recorded job information/)).toBeTruthy();
  expect(screen.queryByText("Start Job")).toBeNull();
});

test("approved and restricted live methods remain associated with their checklist task", async () => {
  mockGetEmployeeMethodsByIds.mockResolvedValue([
    {
      id: "method-private-to-ui",
      name: "Approved Counter Method",
      classification: "cleaning",
      status: "restricted",
      intendedUses: ["Sealed counters"],
      compatibleSurfaces: ["Sealed laminate"],
      prohibitedSurfaces: ["Natural stone"],
      requiredPPE: ["Gloves"],
      requiredTools: ["Clean cloth"],
      dwellTime: "Five minutes",
      contactTime: "",
      applicationInstructions: "Apply to the cloth.",
      labelDirections: "",
      rinseInstructions: "Rinse clean.",
      dryingInstructions: "Dry immediately.",
      ingredients: ["Water"],
      measurements: ["One cup"],
      formulaVariants: [],
      dilutionInstructions: "",
      mixingOrder: [],
      dangerousCombinations: ["Never combine with another cleaner."],
    },
  ]);
  renderDetail();

  expect(await screen.findAllByText("Approved Counter Method (Preferred)")).toHaveLength(2);
  expect(screen.getAllByText("Restricted | Cleaning")).toHaveLength(2);
  expect(screen.getAllByText("Clean counter")).toHaveLength(2);
  expect(mockGetEmployeeMethodsByIds).toHaveBeenCalledWith("tenant-a", ["method-private-to-ui"]);
});

test("unavailable referenced methods show neutral supervisor fallback", async () => {
  mockGetEmployeeMethodsByIds.mockResolvedValue([]);
  renderDetail();

  expect(await screen.findAllByText(/Approved method guidance is currently unavailable/)).toHaveLength(2);
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
  await screen.findByText("before: 0 uploaded enabled");
  fireEvent(toggle, "valueChange", true);
  fireEvent.changeText(screen.getByLabelText("Field Notes"), "Finished safely");
  fireEvent.changeText(screen.getByLabelText("Reported Issue"), "");
  await act(async () => fireEvent.press(screen.getByText("Complete Job")));

  expect(screen.getByText("No after photos have been uploaded. Complete the job anyway?")).toBeTruthy();
  expect(mockCompleteEmployeeJob).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Go Back"));
  expect(screen.queryByText("No after photos have been uploaded. Complete the job anyway?")).toBeNull();
  await act(async () => fireEvent.press(screen.getByText("Complete Job")));
  await act(async () => fireEvent.press(screen.getByText("Complete Anyway")));

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

test("uploaded metadata controls the phase counts and removes the completion warning", async () => {
  mockListEmployeeFieldPhotos.mockResolvedValue([
    { id: "before-photo", phase: "before", roomLabel: "Kitchen", note: "Before" },
    { id: "after-photo", phase: "after", roomLabel: "Kitchen", note: "After" },
  ]);
  renderDetail();
  const toggle = await screen.findByTestId("checklist-toggle-required-item");
  await screen.findByText("after: 1 uploaded disabled");
  fireEvent(toggle, "valueChange", true);
  await act(async () => fireEvent.press(screen.getByText("Complete Job")));
  expect(mockCompleteEmployeeJob).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("No after photos have been uploaded. Complete the job anyway?")).toBeNull();
});

test("duplicate completion is blocked while the first request is pending", async () => {
  const pending = deferred();
  mockCompleteEmployeeJob.mockReturnValue(pending.promise);
  mockListEmployeeFieldPhotos.mockResolvedValue([
    { id: "after-photo", phase: "after", roomLabel: "Kitchen", note: "After" },
  ]);
  renderDetail();
  const toggle = await screen.findByTestId("checklist-toggle-required-item");
  await screen.findByText("after: 1 uploaded disabled");
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
    <AuthContext.Provider value={{ employee: { uid: "employee-a" }, tenantId: "tenant-a" }}>
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
    <AuthContext.Provider value={{ employee: null, tenantId: null }}>
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
