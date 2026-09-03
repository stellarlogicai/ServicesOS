import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, View } from "react-native";
import { AuthContext } from "../context/AuthContext";
import { getEmployeeJob, isEmployeeJobAccessLossError } from "../api/employeeJobs";

const DETAIL_ERROR = "This job could not be loaded. Try again.";
const UNAVAILABLE_ERROR = "This job is no longer available.";

function humanize(value) {
  return typeof value === "string"
    ? value.replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase())
    : "";
}

function timeRange(schedule) {
  if (schedule.startTime && schedule.endTime) return `${schedule.startTime} - ${schedule.endTime}`;
  return schedule.startTime || schedule.endTime || "Time not provided";
}

function DetailSection({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function JobDetailsScreen({ route, navigation }) {
  const bookingId = route?.params?.bookingId || "";
  const { employee } = useContext(AuthContext);
  const employeeUid = employee?.uid || "";
  const requestId = useRef(0);
  const [state, setState] = useState({ key: "", job: null, loading: true, error: "", unavailable: false });
  const requestKey = `${employeeUid}:${bookingId}`;

  const loadJob = useCallback(async () => {
    if (!employeeUid || !bookingId) {
      setState({ key: requestKey, job: null, loading: false, error: DETAIL_ERROR, unavailable: false });
      return;
    }
    const currentRequest = ++requestId.current;
    setState({ key: requestKey, job: null, loading: true, error: "", unavailable: false });
    try {
      const job = await getEmployeeJob(bookingId);
      if (currentRequest !== requestId.current) return;
      setState({ key: requestKey, job, loading: false, error: "", unavailable: false });
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      const unavailable = isEmployeeJobAccessLossError(error);
      setState({
        key: requestKey,
        job: null,
        loading: false,
        error: unavailable ? UNAVAILABLE_ERROR : DETAIL_ERROR,
        unavailable,
      });
    }
  }, [bookingId, employeeUid, requestKey]);

  useEffect(() => {
    loadJob();
    return () => {
      requestId.current += 1;
    };
  }, [loadJob]);

  const visibleState = state.key === requestKey
    ? state
    : { key: requestKey, job: null, loading: true, error: "", unavailable: false };

  if (visibleState.loading) {
    return (
      <View style={styles.centered} accessibilityRole="progressbar">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading job details...</Text>
      </View>
    );
  }

  if (!visibleState.job) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{visibleState.error}</Text>
        {visibleState.unavailable ? (
          <Button title="Back to My Day" onPress={() => navigation.goBack()} />
        ) : (
          <Button title="Retry" onPress={loadJob} />
        )}
      </View>
    );
  }

  const { job } = visibleState;
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{job.serviceType}</Text>

      <DetailSection title="Job">
        <Text style={styles.text}>Booking status: {humanize(job.status)}</Text>
        <Text style={styles.text}>Field status: {humanize(job.fieldStatus)}</Text>
      </DetailSection>

      <DetailSection title="Schedule">
        <Text style={styles.text}>{job.schedule.date || "Date not provided"}</Text>
        <Text style={styles.text}>{timeRange(job.schedule)}</Text>
      </DetailSection>

      <DetailSection title="Customer">
        <Text style={styles.text}>{job.customer.name}</Text>
        {job.customer.phone ? <Text style={styles.text}>{job.customer.phone}</Text> : null}
      </DetailSection>

      <DetailSection title="Location">
        <Text style={styles.text}>{job.location.address}</Text>
      </DetailSection>

      <DetailSection title="Instructions">
        <Text style={styles.text}>{job.instructions}</Text>
      </DetailSection>

      <DetailSection title="Checklist Summary">
        {job.checklist.ready ? (
          <>
            <Text style={styles.readyText}>Checklist ready</Text>
            <Text style={styles.text}>{job.checklist.completed} of {job.checklist.total} complete</Text>
          </>
        ) : (
          <Text style={styles.reviewText}>Owner review required</Text>
        )}
      </DetailSection>

      {job.fieldNotes ? (
        <DetailSection title="Field Notes">
          <Text style={styles.text}>{job.fieldNotes}</Text>
        </DetailSection>
      ) : null}

      {job.fieldIssue ? (
        <DetailSection title="Reported Issue">
          <Text style={styles.text}>{job.fieldIssue}</Text>
        </DetailSection>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 16, paddingBottom: 32 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  loadingText: { marginTop: 12, color: "#475569" },
  errorText: { color: "#b91c1c", textAlign: "center", marginBottom: 16 },
  title: { fontSize: 26, fontWeight: "700", color: "#0f172a", marginBottom: 20 },
  section: {
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 14,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#1e293b", marginBottom: 8 },
  text: { fontSize: 16, lineHeight: 23, color: "#475569", marginBottom: 3 },
  readyText: { fontSize: 16, fontWeight: "600", color: "#166534", marginBottom: 4 },
  reviewText: { fontSize: 16, fontWeight: "600", color: "#92400e" },
});
