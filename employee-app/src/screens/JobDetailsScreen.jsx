// src/screens/JobDetailsScreen.jsx
/**
 * Job Details Screen
 * 
 * This screen displays detailed information about a specific job.
 * Shows customer info, service details, checklist, and allows job status updates.
 */

import React, { useEffect, useState } from "react";
import { View, Text, Button, StyleSheet, ScrollView, ActivityIndicator, Alert, Image } from "react-native";
import { pickAndUploadJobPhoto } from "../api/photos";

export default function JobDetailsScreen({ route }) {
  const { jobId } = route.params;
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadJob() {
    try {
      setLoading(true);
      // TODO: Implement actual job loading from Firestore
      // For now, using placeholder data
      setJob({
        id: jobId,
        serviceType: "Deep Clean",
        address: "123 Main St",
        city: "Springfield",
        state: "IL",
        zip: "62701",
        status: "scheduled",
        scheduledTime: "09:00",
        customerName: "John Doe",
        customerPhone: "(555) 123-4567",
        specialInstructions: "Please use back door",
        pets: "Dog - friendly",
        accessNotes: "Key under mat",
        estimatedDuration: "2 hours",
      });
    } catch (error) {
      console.error("Error loading job:", error);
    } finally {
      setLoading(false);
    }
  }

  async function startJob() {
    // TODO: Implement job status update
    console.log("Starting job:", jobId);
  }

  async function completeJob() {
    // TODO: Implement job status update
    console.log("Completing job:", jobId);
  }

  useEffect(() => {
    loadJob();
  }, [jobId]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading job...</Text>
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Job not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{job.serviceType}</Text>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Customer Information</Text>
        <Text style={styles.text}>{job.customerName}</Text>
        <Text style={styles.text}>{job.customerPhone}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Address</Text>
        <Text style={styles.text}>{job.address}</Text>
        <Text style={styles.text}>{job.city}, {job.state} {job.zip}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Job Details</Text>
        <Text style={styles.text}>Scheduled: {job.scheduledTime}</Text>
        <Text style={styles.text}>Duration: {job.estimatedDuration}</Text>
        <Text style={styles.text}>Status: {job.status}</Text>
      </View>

      {job.specialInstructions && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Special Instructions</Text>
          <Text style={styles.text}>{job.specialInstructions}</Text>
        </View>
      )}

      {job.pets && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pets</Text>
          <Text style={styles.text}>{job.pets}</Text>
        </View>
      )}

      {job.accessNotes && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Access Notes</Text>
          <Text style={styles.text}>{job.accessNotes}</Text>
        </View>
      )}

      <View style={styles.buttonContainer}>
        <Button title="Start Job" onPress={startJob} />
        <Button title="Upload Photos" onPress={() => console.log("Upload photos")} />
        <Button title="View Checklist" onPress={() => navigation.navigate("Checklist", { jobId })} />
        <Button title="Complete Job" onPress={completeJob} />
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
  },
  text: {
    fontSize: 16,
    color: "#666",
    marginBottom: 5,
  },
  errorText: {
    fontSize: 18,
    color: "red",
    textAlign: "center",
  },
  buttonContainer: {
    marginTop: 20,
    gap: 10,
  },
});
