import React, { useCallback, useContext, useRef, useState } from "react";
import {
  ActivityIndicator,
  Button,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { AuthContext } from "../context/AuthContext";
import { listEmployeeJobs } from "../api/employeeJobs";

const JOBS_ERROR = "Your jobs could not be loaded. Try again.";

function localDateKey(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function humanize(value) {
  return typeof value === "string"
    ? value.replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase())
    : "";
}

function timeRange(schedule) {
  if (schedule.startTime && schedule.endTime) return `${schedule.startTime} - ${schedule.endTime}`;
  return schedule.startTime || schedule.endTime || "Time not provided";
}

export function groupEmployeeJobs(jobs, today = localDateKey()) {
  return {
    today: jobs.filter(job => job.schedule.date === today),
    upcoming: jobs.filter(job => job.schedule.date && job.schedule.date > today),
  };
}

function JobCard({ job, onOpen }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${job.serviceType} job for ${job.customerName}`}
      onPress={() => onOpen(job.id)}
      style={({ pressed }) => [styles.jobCard, pressed && styles.jobCardPressed]}
    >
      <View style={styles.jobHeader}>
        <Text style={styles.serviceType}>{job.serviceType}</Text>
        <Text style={styles.fieldStatus}>{humanize(job.fieldStatus)}</Text>
      </View>
      <Text style={styles.customerName}>{job.customerName}</Text>
      <Text style={styles.detailText}>{timeRange(job.schedule)}</Text>
      <Text style={styles.detailText}>{job.address}</Text>
      <Text style={styles.bookingStatus}>Booking: {humanize(job.status)}</Text>
    </Pressable>
  );
}

export default function TodayScreen({ navigation }) {
  const { employee } = useContext(AuthContext);
  const employeeUid = employee?.uid || "";
  const requestId = useRef(0);
  const loadedEmployeeUid = useRef("");
  const [state, setState] = useState({
    employeeUid: "",
    jobs: [],
    loading: true,
    refreshing: false,
    error: "",
  });

  const loadJobs = useCallback(async ({ refresh = false } = {}) => {
    if (!employeeUid) return;
    const currentRequest = ++requestId.current;
    setState(previous => ({
      employeeUid,
      jobs: previous.employeeUid === employeeUid ? previous.jobs : [],
      loading: !refresh,
      refreshing: refresh,
      error: "",
    }));

    try {
      const jobs = await listEmployeeJobs();
      if (currentRequest !== requestId.current) return;
      loadedEmployeeUid.current = employeeUid;
      setState({ employeeUid, jobs, loading: false, refreshing: false, error: "" });
    } catch {
      if (currentRequest !== requestId.current) return;
      loadedEmployeeUid.current = employeeUid;
      setState({ employeeUid, jobs: [], loading: false, refreshing: false, error: JOBS_ERROR });
    }
  }, [employeeUid]);

  useFocusEffect(useCallback(() => {
    if (!employeeUid) {
      requestId.current += 1;
      loadedEmployeeUid.current = "";
      setState({ employeeUid: "", jobs: [], loading: false, refreshing: false, error: "" });
      return undefined;
    }
    loadJobs({ refresh: loadedEmployeeUid.current === employeeUid });
    return () => {
      requestId.current += 1;
    };
  }, [employeeUid, loadJobs]));

  const visibleState = state.employeeUid === employeeUid
    ? state
    : { employeeUid, jobs: [], loading: true, refreshing: false, error: "" };
  const groups = groupEmployeeJobs(visibleState.jobs);
  const sections = [
    { title: "Today", data: groups.today, empty: "No jobs scheduled for today." },
    { title: "Upcoming", data: groups.upcoming, empty: "No upcoming jobs scheduled." },
  ];

  if (visibleState.loading) {
    return (
      <View style={styles.centered} accessibilityRole="progressbar">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading your jobs...</Text>
      </View>
    );
  }

  if (visibleState.error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{visibleState.error}</Text>
        <Button title="Retry" onPress={() => loadJobs()} />
      </View>
    );
  }

  return (
    <SectionList
      testID="employee-job-list"
      style={styles.container}
      contentContainerStyle={styles.content}
      sections={sections}
      keyExtractor={item => item.id}
      refreshControl={(
        <RefreshControl
          refreshing={visibleState.refreshing}
          onRefresh={() => loadJobs({ refresh: true })}
        />
      )}
      ListHeaderComponent={(
        <View style={styles.screenHeader}>
          <Text style={styles.title}>My Day</Text>
          <Text style={styles.date}>{localDateKey()}</Text>
        </View>
      )}
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionTitle}>{section.title}</Text>
      )}
      renderSectionFooter={({ section }) => section.data.length === 0 ? (
        <Text style={styles.emptyText}>{section.empty}</Text>
      ) : null}
      renderItem={({ item }) => (
        <JobCard
          job={item}
          onOpen={bookingId => navigation.navigate("JobDetails", { bookingId })}
        />
      )}
    />
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
  screenHeader: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: "700", color: "#0f172a" },
  date: { marginTop: 4, color: "#64748b" },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    backgroundColor: "#f8fafc",
    paddingVertical: 8,
  },
  jobCard: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  jobCardPressed: { backgroundColor: "#eff6ff" },
  jobHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  serviceType: { flex: 1, fontSize: 17, fontWeight: "700", color: "#0f172a" },
  fieldStatus: { fontSize: 12, fontWeight: "600", color: "#1d4ed8" },
  customerName: { marginTop: 8, fontSize: 16, fontWeight: "600", color: "#334155" },
  detailText: { marginTop: 5, color: "#475569" },
  bookingStatus: { marginTop: 8, fontSize: 12, color: "#64748b" },
  emptyText: { color: "#64748b", paddingVertical: 12, marginBottom: 10 },
});
