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

function humanize(value) {
  return typeof value === "string"
    ? value.replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase())
    : "";
}

function timeRange(schedule) {
  if (schedule.startTime && schedule.endTime) return `${schedule.startTime} - ${schedule.endTime}`;
  return schedule.startTime || schedule.endTime || "Time not provided";
}

export function groupEmployeeJobs(jobs, todayDate) {
  const ordered = [...jobs].sort(compareEmployeeJobs);
  return {
    today: ordered.filter(job => job.schedule.date === todayDate),
    upcoming: ordered.filter(job => job.schedule.date && job.schedule.date > todayDate),
  };
}

export function compareEmployeeJobs(left, right) {
  const leftValue = `${left.schedule.date || "9999-12-31"}T${left.schedule.startTime || "23:59"}\u0000${left.id}`;
  const rightValue = `${right.schedule.date || "9999-12-31"}T${right.schedule.startTime || "23:59"}\u0000${right.id}`;
  return leftValue.localeCompare(rightValue);
}

export function isActionableEmployeeJob(job) {
  return job?.status === "scheduled" && job.fieldStatus !== "completed";
}

export function deriveDayProgression(jobs, todayDate) {
  const { today, upcoming } = groupEmployeeJobs(jobs, todayDate);
  const current = today.find(job => isActionableEmployeeJob(job) && job.fieldStatus === "in_progress") || null;
  const next = current || today.find(isActionableEmployeeJob) || null;
  const completed = today.filter(job => !isActionableEmployeeJob(job));
  return { today, upcoming, current, next, completed };
}

function summarySignature(job) {
  return JSON.stringify({
    schedule: job.schedule,
    serviceType: job.serviceType,
    customerName: job.customerName,
    address: job.address,
    status: job.status,
    fieldStatus: job.fieldStatus,
  });
}

function jobChanges(previousJobs, nextJobs) {
  const previousById = new Map(previousJobs.map(job => [job.id, job]));
  const nextById = new Map(nextJobs.map(job => [job.id, job]));
  return {
    updated: nextJobs
      .filter(job => previousById.has(job.id) && summarySignature(previousById.get(job.id)) !== summarySignature(job))
      .map(job => job.id),
    added: nextJobs.filter(job => !previousById.has(job.id)).map(job => job.id),
    removed: previousJobs.some(job => !nextById.has(job.id)),
  };
}

function JobCard({ job, onOpen, role, changed }) {
  const actionable = isActionableEmployeeJob(job);
  const stateLabel = role === "current"
    ? "Current job"
    : role === "next"
      ? "Next job"
      : !actionable
        ? "Completed"
        : changed === "added"
          ? "New assignment"
          : changed === "updated"
            ? "Updated"
            : "Assigned";
  const content = (
    <>
      <View style={styles.jobHeader}>
        <Text style={styles.serviceType}>{job.serviceType}</Text>
        <Text style={styles.fieldStatus}>{humanize(job.fieldStatus)}</Text>
      </View>
      <Text style={styles.jobState}>{stateLabel}</Text>
      {changed === "updated" && role ? <Text style={styles.changeState}>Updated</Text> : null}
      {changed === "added" && role ? <Text style={styles.changeState}>New assignment</Text> : null}
      <Text style={styles.customerName}>{job.customerName}</Text>
      <Text style={styles.detailText}>{timeRange(job.schedule)}</Text>
      <Text style={styles.detailText}>{job.address}</Text>
      <Text style={styles.bookingStatus}>Booking: {humanize(job.status)}</Text>
    </>
  );

  if (!actionable) return <View style={[styles.jobCard, styles.completedJobCard]}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${job.serviceType} job for ${job.customerName}`}
      onPress={() => onOpen(job.id)}
      style={({ pressed }) => [styles.jobCard, pressed && styles.jobCardPressed]}
    >
      {content}
    </Pressable>
  );
}

export default function TodayScreen({ navigation }) {
  const { employee } = useContext(AuthContext);
  const employeeUid = employee?.uid || "";
  const requestId = useRef(0);
  const loadedEmployeeUid = useRef("");
  const loadedJobs = useRef([]);
  const [state, setState] = useState({
    employeeUid: "",
    jobs: [],
    todayDate: "",
    updatedJobIds: [],
    addedJobIds: [],
    dayNotice: "",
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
      todayDate: previous.employeeUid === employeeUid ? previous.todayDate : "",
      updatedJobIds: previous.employeeUid === employeeUid ? previous.updatedJobIds : [],
      addedJobIds: previous.employeeUid === employeeUid ? previous.addedJobIds : [],
      dayNotice: "",
      loading: !refresh,
      refreshing: refresh,
      error: "",
    }));

    try {
      const result = await listEmployeeJobs();
      if (currentRequest !== requestId.current) return;
      loadedEmployeeUid.current = employeeUid;
      const priorJobs = loadedEmployeeUid.current === employeeUid ? loadedJobs.current : [];
      const changes = refresh ? jobChanges(priorJobs, result.jobs) : { updated: [], added: [], removed: false };
      loadedJobs.current = result.jobs;
      setState({
        employeeUid,
        jobs: result.jobs,
        todayDate: result.todayDate,
        updatedJobIds: changes.updated,
        addedJobIds: changes.added,
        dayNotice: changes.removed ? "Your workday was updated. Review your remaining jobs." : "",
        loading: false,
        refreshing: false,
        error: "",
      });
    } catch {
      if (currentRequest !== requestId.current) return;
      loadedEmployeeUid.current = employeeUid;
      loadedJobs.current = [];
      setState({
        employeeUid,
        jobs: [],
        todayDate: "",
        updatedJobIds: [],
        addedJobIds: [],
        dayNotice: "",
        loading: false,
        refreshing: false,
        error: JOBS_ERROR,
      });
    }
  }, [employeeUid]);

  useFocusEffect(useCallback(() => {
    if (!employeeUid) {
      requestId.current += 1;
      loadedEmployeeUid.current = "";
      loadedJobs.current = [];
      setState({
        employeeUid: "",
        jobs: [],
        todayDate: "",
        updatedJobIds: [],
        addedJobIds: [],
        dayNotice: "",
        loading: false,
        refreshing: false,
        error: "",
      });
      return undefined;
    }
    loadJobs({ refresh: loadedEmployeeUid.current === employeeUid });
    return () => {
      requestId.current += 1;
    };
  }, [employeeUid, loadJobs]));

  const visibleState = state.employeeUid === employeeUid
    ? state
    : {
      employeeUid,
      jobs: [],
      todayDate: "",
      updatedJobIds: [],
      addedJobIds: [],
      dayNotice: "",
      loading: true,
      refreshing: false,
      error: "",
    };
  const day = deriveDayProgression(visibleState.jobs, visibleState.todayDate);
  const sections = [
    { title: "Today", data: day.today, empty: "No jobs scheduled for today." },
    { title: "Upcoming", data: day.upcoming, empty: "No upcoming jobs scheduled." },
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
          <Text style={styles.date}>{visibleState.todayDate}</Text>
          {visibleState.dayNotice ? <Text style={styles.notice}>{visibleState.dayNotice}</Text> : null}
          {day.current ? (
            <View style={styles.progressCard}>
              <Text style={styles.progressLabel}>Current job</Text>
              <Text style={styles.progressText}>{day.current.customerName} - {timeRange(day.current.schedule)}</Text>
              <Button title="Open current job" onPress={() => navigation.navigate("JobDetails", { bookingId: day.current.id })} />
            </View>
          ) : day.next ? (
            <View style={styles.progressCard}>
              <Text style={styles.progressLabel}>Next job</Text>
              <Text style={styles.progressText}>{day.next.customerName} - {timeRange(day.next.schedule)}</Text>
              <Button title="Open next job" onPress={() => navigation.navigate("JobDetails", { bookingId: day.next.id })} />
            </View>
          ) : day.today.length > 0 ? (
            <View style={styles.progressCard}>
              <Text style={styles.progressLabel}>Today is complete</Text>
              <Text style={styles.progressText}>No more active jobs are scheduled for today.</Text>
            </View>
          ) : null}
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
          role={day.current?.id === item.id ? "current" : day.next?.id === item.id ? "next" : ""}
          changed={visibleState.addedJobIds.includes(item.id) ? "added" : visibleState.updatedJobIds.includes(item.id) ? "updated" : ""}
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
  jobState: { marginTop: 8, fontSize: 12, fontWeight: "700", color: "#0f766e" },
  changeState: { marginTop: 4, fontSize: 12, fontWeight: "700", color: "#b45309" },
  customerName: { marginTop: 8, fontSize: 16, fontWeight: "600", color: "#334155" },
  detailText: { marginTop: 5, color: "#475569" },
  bookingStatus: { marginTop: 8, fontSize: 12, color: "#64748b" },
  completedJobCard: { backgroundColor: "#f1f5f9", borderColor: "#cbd5e1" },
  notice: { marginTop: 12, color: "#92400e" },
  progressCard: {
    marginTop: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#2563eb",
    padding: 12,
    backgroundColor: "#eff6ff",
  },
  progressLabel: { color: "#1e3a8a", fontWeight: "700" },
  progressText: { marginTop: 4, marginBottom: 10, color: "#1e293b" },
  emptyText: { color: "#64748b", paddingVertical: 12, marginBottom: 10 },
});
