import React, { useContext } from "react";
import { Button, Text, View } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
const mockVerifyEmployeeSession = jest.fn();
let mockAuthStateListener;

jest.mock("firebase/auth", () => ({
  onAuthStateChanged: jest.fn((_auth, listener) => {
    mockAuthStateListener = listener;
    return jest.fn();
  }),
  signInWithEmailAndPassword: (...args) => mockSignIn(...args),
  signOut: (...args) => mockSignOut(...args),
}));

jest.mock("../../api/firebase", () => ({ auth: { currentUser: null } }));
jest.mock("../../api/employeeSession", () => ({
  verifyEmployeeSession: (...args) => mockVerifyEmployeeSession(...args),
}));

import {
  AuthContext,
  AuthProvider,
  EMPLOYEE_ACCESS_MESSAGE,
  EMPLOYEE_VERIFICATION_MESSAGE,
} from "../AuthContext";

const { auth: mockAuth } = require("../../api/firebase");

function AuthProbe() {
  const auth = useContext(AuthContext);
  return (
    <View>
      <Text testID="loading">{String(auth.loading)}</Text>
      <Text testID="user">{auth.user?.uid || "none"}</Text>
      <Text testID="employee">{auth.employee?.uid || "none"}</Text>
      <Text testID="tenant">{auth.tenantId || "none"}</Text>
      <Text testID="access-error">{auth.accessError || "none"}</Text>
      <Button title="Logout" onPress={auth.logout} />
    </View>
  );
}

function deferred() {
  let resolve;
  const promise = new Promise((resolver) => { resolve = resolver; });
  return { promise, resolve };
}

const employeeA = {
  uid: "employee-a",
  tenantId: "tenant-a",
  role: "employee",
  displayName: "Employee A",
  email: "employee-a@servicesos.test",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.currentUser = null;
  mockAuthStateListener = undefined;
  mockSignOut.mockResolvedValue(undefined);
});

test("signed-out auth state clears the employee session", async () => {
  render(<AuthProvider><AuthProbe /></AuthProvider>);

  await act(async () => mockAuthStateListener(null));

  expect(screen.getByTestId("loading").props.children).toBe("false");
  expect(screen.getByTestId("user").props.children).toBe("none");
  expect(screen.getByTestId("employee").props.children).toBe("none");
  expect(screen.getByTestId("tenant").props.children).toBe("none");
});

test("verified employee session supplies user and server tenant scope", async () => {
  const firebaseUser = { uid: "employee-a", getIdToken: jest.fn() };
  mockAuth.currentUser = firebaseUser;
  mockVerifyEmployeeSession.mockResolvedValue(employeeA);
  render(<AuthProvider><AuthProbe /></AuthProvider>);

  await act(async () => mockAuthStateListener(firebaseUser));

  expect(screen.getByTestId("user").props.children).toBe("employee-a");
  expect(screen.getByTestId("employee").props.children).toBe("employee-a");
  expect(screen.getByTestId("tenant").props.children).toBe("tenant-a");
});

test("authorization failure clears session, signs out, and exposes only safe access text", async () => {
  const firebaseUser = { uid: "employee-a", getIdToken: jest.fn() };
  const error = Object.assign(new Error("private authorization detail"), {
    code: "employee_access_denied",
  });
  mockAuth.currentUser = firebaseUser;
  mockVerifyEmployeeSession.mockRejectedValue(error);
  render(<AuthProvider><AuthProbe /></AuthProvider>);

  await act(async () => mockAuthStateListener(firebaseUser));

  expect(mockSignOut).toHaveBeenCalledWith(mockAuth);
  expect(screen.getByTestId("employee").props.children).toBe("none");
  expect(screen.getByTestId("tenant").props.children).toBe("none");
  expect(screen.getByTestId("access-error").props.children).toBe(EMPLOYEE_ACCESS_MESSAGE);
  expect(screen.queryByText(/private authorization detail/)).toBeNull();
});

test("verification failure signs out and exposes only the safe retry text", async () => {
  const firebaseUser = { uid: "employee-a", getIdToken: jest.fn() };
  mockAuth.currentUser = firebaseUser;
  mockVerifyEmployeeSession.mockRejectedValue(new Error("private server detail"));
  render(<AuthProvider><AuthProbe /></AuthProvider>);

  await act(async () => mockAuthStateListener(firebaseUser));

  expect(mockSignOut).toHaveBeenCalledWith(mockAuth);
  expect(screen.getByTestId("access-error").props.children).toBe(EMPLOYEE_VERIFICATION_MESSAGE);
  expect(screen.queryByText(/private server detail/)).toBeNull();
});

test("logout immediately clears verified session state", async () => {
  const firebaseUser = { uid: "employee-a", getIdToken: jest.fn() };
  mockAuth.currentUser = firebaseUser;
  mockVerifyEmployeeSession.mockResolvedValue(employeeA);
  render(<AuthProvider><AuthProbe /></AuthProvider>);
  await act(async () => mockAuthStateListener(firebaseUser));

  await act(async () => fireEvent.press(screen.getByText("Logout")));

  expect(screen.getByTestId("user").props.children).toBe("none");
  expect(screen.getByTestId("employee").props.children).toBe("none");
  expect(screen.getByTestId("tenant").props.children).toBe("none");
  expect(mockSignOut).toHaveBeenCalledWith(mockAuth);
});

test("stale verification cannot replace the current employee session", async () => {
  const firstVerification = deferred();
  const userA = { uid: "employee-a", getIdToken: jest.fn() };
  const userB = { uid: "employee-b", getIdToken: jest.fn() };
  const employeeB = { ...employeeA, uid: "employee-b", tenantId: "tenant-b" };
  mockVerifyEmployeeSession
    .mockImplementationOnce(() => firstVerification.promise)
    .mockResolvedValueOnce(employeeB);
  render(<AuthProvider><AuthProbe /></AuthProvider>);

  let pendingA;
  await act(async () => {
    mockAuth.currentUser = userA;
    pendingA = mockAuthStateListener(userA);
    await Promise.resolve();
  });
  await act(async () => {
    mockAuth.currentUser = userB;
    await mockAuthStateListener(userB);
  });

  expect(screen.getByTestId("employee").props.children).toBe("employee-b");
  expect(screen.getByTestId("tenant").props.children).toBe("tenant-b");

  firstVerification.resolve(employeeA);
  await act(async () => pendingA);

  expect(screen.getByTestId("employee").props.children).toBe("employee-b");
  expect(screen.getByTestId("tenant").props.children).toBe("tenant-b");
});

test("a new auth transition immediately hides the previously verified employee", async () => {
  const nextVerification = deferred();
  const userA = { uid: "employee-a", getIdToken: jest.fn() };
  const userB = { uid: "employee-b", getIdToken: jest.fn() };
  const employeeB = { ...employeeA, uid: "employee-b", tenantId: "tenant-b" };
  mockVerifyEmployeeSession
    .mockResolvedValueOnce(employeeA)
    .mockImplementationOnce(() => nextVerification.promise);
  render(<AuthProvider><AuthProbe /></AuthProvider>);

  await act(async () => {
    mockAuth.currentUser = userA;
    await mockAuthStateListener(userA);
  });
  expect(screen.getByTestId("employee").props.children).toBe("employee-a");

  let pendingB;
  await act(async () => {
    mockAuth.currentUser = userB;
    pendingB = mockAuthStateListener(userB);
    await Promise.resolve();
  });

  expect(screen.getByTestId("loading").props.children).toBe("true");
  expect(screen.getByTestId("user").props.children).toBe("none");
  expect(screen.getByTestId("employee").props.children).toBe("none");
  expect(screen.getByTestId("tenant").props.children).toBe("none");

  nextVerification.resolve(employeeB);
  await act(async () => pendingB);
  expect(screen.getByTestId("employee").props.children).toBe("employee-b");
});
