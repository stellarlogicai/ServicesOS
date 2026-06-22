// src/screens/ProfileScreen.jsx
/**
 * Profile Screen
 * 
 * This screen displays the employee's profile information.
 * Shows employee details and allows logout.
 */

import React, { useContext } from "react";
import { View, Text, Button, StyleSheet, ScrollView } from "react-native";
import { AuthContext } from "../context/AuthContext";

export default function ProfileScreen() {
  const { employee, logout } = useContext(AuthContext);

  async function handleLogout() {
    try {
      await logout();
    } catch (error) {
      console.error("Error logging out:", error);
    }
  }

  if (!employee) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No employee profile found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.section}>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{employee.name || "Not set"}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{employee.email || "Not set"}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Phone</Text>
        <Text style={styles.value}>{employee.phone || "Not set"}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Role</Text>
        <Text style={styles.value}>{employee.role || "Not set"}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Status</Text>
        <Text style={[styles.value, employee.status === 'active' ? styles.active : styles.inactive]}>
          {employee.status || "Unknown"}
        </Text>
      </View>

      {employee.companyId && (
        <View style={styles.section}>
          <Text style={styles.label}>Company ID</Text>
          <Text style={styles.value}>{employee.companyId}</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.label}>Employee ID</Text>
        <Text style={styles.value}>{employee.id}</Text>
      </View>

      <View style={styles.buttonContainer}>
        <Button title="Logout" onPress={handleLogout} color="red" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  label: {
    fontSize: 14,
    color: "#666",
    marginBottom: 5,
  },
  value: {
    fontSize: 18,
    color: "#333",
  },
  active: {
    color: "green",
  },
  inactive: {
    color: "red",
  },
  errorText: {
    fontSize: 18,
    color: "red",
    textAlign: "center",
  },
  buttonContainer: {
    marginTop: 20,
  },
});
