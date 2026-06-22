// src/screens/TodayScreen.jsx
/**
 * Today Screen
 * 
 * This screen displays today's assigned jobs for the employee.
 * Shows job details, status, and allows navigation to job details.
 */

import React, { useContext, useEffect, useState } from "react";
import { View, Text, Button, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { AuthContext } from "../context/AuthContext";

function todayString() {
  return new Date().toISOString().split("T")[0];
}

export default function TodayScreen({ navigation }) {
  const { employee } = useContext(AuthContext);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadJobs() {
    try {
      setLoading(true);
      // TODO: Implement actual job loading from Firestore
      // For now, using placeholder data
      setJobs([
        {
          id: "1",
          serviceType: "Deep Clean",
          address: "123 Main St",
          status: "scheduled",
          scheduledTime: "09:00",
        },
        {
          id: "2",
          serviceType: "Standard Clean",
          address: "456 Oak Ave",
          status: "scheduled",
          scheduledTime: "14:00",
        },
      ]);
    } catch (error) {
      console.error("Error loading jobs:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (employee) {
      loadJobs();
    }
  }, [employee]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading jobs...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Today's Jobs</Text>
      <Text style={styles.date}>{todayString()}</Text>

      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.jobCard}>
            <Text style={styles.serviceType}>{item.serviceType}</Text>
            <Text style={styles.address}>{item.address}</Text>
            <Text style={styles.time}>{item.scheduledTime}</Text>
            <Text style={styles.status}>Status: {item.status}</Text>

            <Button
              title="View Job"
              onPress={() => navigation.navigate("JobDetails", { jobId: item.id })}
            />
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No jobs scheduled for today</Text>
        }
      />
    </View>
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
    marginBottom: 5,
  },
  date: {
    fontSize: 16,
    color: "#666",
    marginBottom: 20,
  },
  jobCard: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: "#f9f9f9",
  },
  serviceType: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
  },
  address: {
    fontSize: 14,
    color: "#333",
    marginBottom: 5,
  },
  time: {
    fontSize: 14,
    color: "#666",
    marginBottom: 5,
  },
  status: {
    fontSize: 14,
    color: "#666",
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
    marginTop: 20,
  },
});
