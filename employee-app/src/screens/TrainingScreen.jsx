// src/screens/TrainingScreen.jsx
/**
 * Training Screen
 * 
 * This screen displays assigned training modules for the employee.
 * Shows training status and allows access to training content.
 */

import React, { useContext, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { AuthContext } from "../context/AuthContext";

export default function TrainingScreen() {
  const { employee } = useContext(AuthContext);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadTraining() {
    try {
      setLoading(true);
      // TODO: Implement actual training loading from Firestore
      // For now, using placeholder data
      setAssignments([
        {
          id: "1",
          moduleTitle: "Deep Clean Procedures",
          status: "completed",
          completedAt: "2024-01-15",
        },
        {
          id: "2",
          moduleTitle: "Pet Safety Protocols",
          status: "in_progress",
          assignedAt: "2024-01-20",
        },
        {
          id: "3",
          moduleTitle: "Chemical Safety",
          status: "pending",
          assignedAt: "2024-01-25",
        },
      ]);
    } catch (error) {
      console.error("Error loading training:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (employee) {
      loadTraining();
    }
  }, [employee]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading training...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Training</Text>

      <FlatList
        data={assignments}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.moduleTitle}>{item.moduleTitle}</Text>
            <Text style={[
              styles.status,
              item.status === 'completed' && styles.completed,
              item.status === 'in_progress' && styles.inProgress,
              item.status === 'pending' && styles.pending
            ]}>
              Status: {item.status.replace('_', ' ')}
            </Text>
            {item.completedAt && (
              <Text style={styles.date}>Completed: {item.completedAt}</Text>
            )}
            {item.assignedAt && (
              <Text style={styles.date}>Assigned: {item.assignedAt}</Text>
            )}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No training assigned</Text>
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
    marginBottom: 20,
  },
  card: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: "#f9f9f9",
  },
  moduleTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
  },
  status: {
    fontSize: 14,
    color: "#666",
    marginBottom: 5,
  },
  completed: {
    color: "green",
  },
  inProgress: {
    color: "#FFA500",
  },
  pending: {
    color: "red",
  },
  date: {
    fontSize: 12,
    color: "#999",
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
    marginTop: 20,
  },
});
