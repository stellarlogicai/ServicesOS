import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("../../context/AuthContext", () => {
  const ReactModule = require("react");
  return { AuthContext: ReactModule.createContext(null) };
});

import { AuthContext } from "../../context/AuthContext";
import ProfileScreen from "../ProfileScreen";

function renderProfile(employee) {
  const logout = jest.fn();
  render(
    <AuthContext.Provider value={{ employee, logout }}>
      <ProfileScreen />
    </AuthContext.Provider>
  );
  return { logout };
}

test("renders only the verified employee session display fields", () => {
  renderProfile({
    uid: "private-uid",
    tenantId: "private-tenant",
    role: "employee",
    displayName: "Alex Employee",
    email: "alex@example.test",
    name: "Legacy name",
    phone: "555-0100",
    status: "active",
    companyId: "company-private",
    id: "legacy-id",
  });

  expect(screen.getByText("Alex Employee")).toBeTruthy();
  expect(screen.getByText("alex@example.test")).toBeTruthy();
  expect(screen.getByText("Employee")).toBeTruthy();
  expect(screen.queryByText("Legacy name")).toBeNull();
  expect(screen.queryByText("555-0100")).toBeNull();
  expect(screen.queryByText("active")).toBeNull();
  expect(screen.queryByText("company-private")).toBeNull();
  expect(screen.queryByText("legacy-id")).toBeNull();
  expect(screen.queryByText("private-uid")).toBeNull();
  expect(screen.queryByText("private-tenant")).toBeNull();
});

test("uses an honest minimal profile when optional display fields are absent", () => {
  const { logout } = renderProfile({ uid: "employee-a", tenantId: "tenant-a", role: "employee" });

  expect(screen.getByText("Profile")).toBeTruthy();
  expect(screen.getByText("Role")).toBeTruthy();
  expect(screen.getByText("Employee")).toBeTruthy();
  expect(screen.queryByText("Name")).toBeNull();
  expect(screen.queryByText("Email")).toBeNull();
  expect(screen.queryByText("Not set")).toBeNull();
  fireEvent.press(screen.getByText("Logout"));
  expect(logout).toHaveBeenCalledTimes(1);
});
