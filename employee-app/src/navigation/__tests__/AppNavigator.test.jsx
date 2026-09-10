import React from "react";
import { render, screen } from "@testing-library/react-native";

jest.mock("firebase/auth", () => ({
  onAuthStateChanged: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock("../../api/firebase", () => ({ auth: { currentUser: null } }));
jest.mock("../../api/employeeSession", () => ({ verifyEmployeeSession: jest.fn() }));

jest.mock("@react-navigation/bottom-tabs", () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children }) => {
      const ReactModule = require("react");
      const { View: NativeView } = require("react-native");
      return ReactModule.createElement(NativeView, { testID: "employee-tabs" }, children);
    },
    Screen: () => null,
  }),
}));

jest.mock("@react-navigation/native-stack", () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }) => {
      const ReactModule = require("react");
      const { View: NativeView } = require("react-native");
      return ReactModule.createElement(NativeView, null, children);
    },
    Screen: () => null,
  }),
}));

jest.mock("../../screens/TodayScreen", () => () => null);
jest.mock("../../screens/JobDetailsScreen", () => () => null);
jest.mock("../../screens/WorkAssistantScreen", () => () => null);
jest.mock("../../screens/TrainingScreen", () => () => null);
jest.mock("../../screens/MessagesScreen", () => () => null);
jest.mock("../../screens/ProfileScreen", () => () => null);

import { AuthContext } from "../../context/AuthContext";
import AppNavigator from "../AppNavigator";

function renderNavigator(overrides = {}) {
  const value = {
    user: null,
    employee: null,
    tenantId: null,
    loading: false,
    accessError: "",
    login: jest.fn(),
    logout: jest.fn(),
    ...overrides,
  };
  return render(
    <AuthContext.Provider value={value}>
      <AppNavigator />
    </AuthContext.Provider>
  );
}

test("signed-out state renders the employee login", () => {
  renderNavigator();
  expect(screen.getByText("ServicesOS Employee Login")).toBeTruthy();
  expect(screen.queryByTestId("employee-tabs")).toBeNull();
});

test("Firebase authenticated user alone cannot render employee tabs", () => {
  renderNavigator({ user: { uid: "employee-a" }, employee: null });
  expect(screen.getByText("ServicesOS Employee Login")).toBeTruthy();
  expect(screen.queryByTestId("employee-tabs")).toBeNull();
});

test("verification loading state blocks login and employee tabs", () => {
  renderNavigator({ loading: true, user: { uid: "employee-a" } });
  expect(screen.getByText("Verifying employee account...")).toBeTruthy();
  expect(screen.queryByText("ServicesOS Employee Login")).toBeNull();
  expect(screen.queryByTestId("employee-tabs")).toBeNull();
});

test("verified employee session renders employee tabs", () => {
  renderNavigator({
    user: { uid: "employee-a" },
    employee: { uid: "employee-a", tenantId: "tenant-a", role: "employee" },
    tenantId: "tenant-a",
  });
  expect(screen.getByTestId("employee-tabs")).toBeTruthy();
  expect(screen.queryByText("ServicesOS Employee Login")).toBeNull();
});

test("safe access error is visible on the login screen", () => {
  renderNavigator({
    accessError: "Your employee account is not available. Contact your business administrator.",
  });
  expect(screen.getByText(
    "Your employee account is not available. Contact your business administrator."
  )).toBeTruthy();
});

test("jobs stack keeps Today and Job Details, adds Work Assistant, and retires the obsolete Checklist route", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.resolve(__dirname, "..", "AppNavigator.jsx"), "utf8");
  expect(source).toMatch(/name="Today"/);
  expect(source).toMatch(/name="JobDetails"/);
  expect(source).toMatch(/name="WorkAssistant"/);
  expect(source).not.toMatch(/name="Checklist"/);
  expect(source).not.toMatch(/import ChecklistScreen/);
});
