// src/navigation/AppNavigator.jsx
/**
 * App Navigation Structure
 * 
 * This file defines the navigation structure for the employee app.
 * Uses bottom tabs for main navigation and stack for nested screens.
 */

import React, { useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import LoginScreen from "../screens/LoginScreen";
import TodayScreen from "../screens/TodayScreen";
import JobDetailsScreen from "../screens/JobDetailsScreen";
import ChecklistScreen from "../screens/ChecklistScreen";
import TrainingScreen from "../screens/TrainingScreen";
import MessagesScreen from "../screens/MessagesScreen";
import ProfileScreen from "../screens/ProfileScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function JobsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Today" component={TodayScreen} options={{ title: "Today's Jobs" }} />
      <Stack.Screen name="JobDetails" component={JobDetailsScreen} options={{ title: "Job Details" }} />
      <Stack.Screen name="Checklist" component={ChecklistScreen} options={{ title: "Checklist" }} />
    </Stack.Navigator>
  );
}

function EmployeeTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Jobs" component={JobsStack} options={{ title: "Jobs" }} />
      <Tab.Screen name="Training" component={TrainingScreen} options={{ title: "Training" }} />
      <Tab.Screen name="Messages" component={MessagesScreen} options={{ title: "Messages" }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user } = useContext(AuthContext);

  return user ? <EmployeeTabs /> : <LoginScreen />;
}
