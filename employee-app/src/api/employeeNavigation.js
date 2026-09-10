import { Linking, Platform } from "react-native";
import employeeNavigationClient from "./employeeNavigationClient";

const { createEmployeeNavigationClient, usableAddress } = employeeNavigationClient;

const client = createEmployeeNavigationClient({
  platform: Platform.OS,
  openURL: url => Linking.openURL(url),
});

export const openEmployeeJobDirections = client.openDirections;
export const hasEmployeeJobDirections = address => Boolean(usableAddress(address));
