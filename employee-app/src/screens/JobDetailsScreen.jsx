import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Button,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { AuthContext } from "../context/AuthContext";
import { getEmployeeJob, isEmployeeJobAccessLossError } from "../api/employeeJobs";
import {
  completeEmployeeJob,
  saveEmployeeChecklist,
  saveEmployeeNotes,
  startEmployeeJob,
} from "../api/employeeFieldExecution";
import { listEmployeeFieldPhotos } from "../api/employeePhotoEvidence";
import { getEmployeeMethodsByIds } from "../api/employeeMethods";
import FieldPhotoCapture from "../components/FieldPhotoCapture";
import {
  hasEmployeeJobDirections,
  openEmployeeJobDirections,
} from "../api/employeeNavigation";

const DETAIL_ERROR = "This job could not be loaded. Try again.";
const UPDATE_ERROR = "Your job update could not be saved. Try again.";
const UNAVAILABLE_ERROR = "This job is no longer available.";
const CHECKLIST_UNAVAILABLE = "Owner review is required before this checklist can be used.";
const INCOMPLETE_CHECKLIST = "Complete all required checklist items before finishing the job.";
const FIELD_NOTES_MAX_LENGTH = 1000;
const FIELD_ISSUE_MAX_LENGTH = 750;
const PHOTO_EVIDENCE_ERROR = "Photo evidence could not be loaded. Try again.";
const NO_AFTER_PHOTOS_WARNING = "No after photos have been uploaded. Complete the job anyway?";
const METHOD_UNAVAILABLE = "Approved method guidance is currently unavailable. Contact the owner/supervisor before proceeding if clarification is needed.";
const SAFETY_FALLBACK = "No job-specific safety notes recorded.";
const CLARIFICATION_FALLBACK = "If conditions differ from the recorded job information or instructions are unclear, contact the owner/supervisor before proceeding.";
const DIRECTIONS_ERROR = "Unable to open directions. Please open your maps app and enter the service address manually.";

function humanize(value) {
  return typeof value === "string"
    ? value.replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase())
    : "";
}

function timeRange(schedule) {
  if (schedule.startTime && schedule.endTime) return `${schedule.startTime} - ${schedule.endTime}`;
  return schedule.startTime || schedule.endTime || "Time not provided";
}

function completionState(checklist) {
  return checklist.map(item => ({ id: item.id, completed: item.completed }));
}

function DetailSection({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ChecklistItem({ item, disabled, onChange }) {
  return (
    <View style={styles.checklistItem}>
      <View style={styles.checklistHeading}>
        <View style={styles.checklistTitleGroup}>
          <Text style={styles.checklistArea}>
            {[item.area, item.fixtureOrSurface].filter(Boolean).join(" / ")}
          </Text>
          <Text style={styles.checklistLabel}>{item.label}</Text>
          <Text style={styles.requirement}>{item.required ? "Required" : "Optional"}</Text>
        </View>
        <Switch
          testID={`checklist-toggle-${item.id}`}
          accessibilityLabel={`${item.completed ? "Mark incomplete" : "Mark complete"}: ${item.label}`}
          value={item.completed}
          disabled={disabled}
          onValueChange={completed => onChange(item.id, completed)}
        />
      </View>
      {item.condition ? <Text style={styles.supportingText}>Condition: {item.condition}</Text> : null}
      {item.note ? <Text style={styles.supportingText}>Note: {item.note}</Text> : null}
      {item.completionCriteria ? (
        <Text style={styles.supportingText}>Complete when: {item.completionCriteria}</Text>
      ) : null}
      {item.warnings.map((warning, index) => (
        <Text style={styles.warningText} key={`${item.id}-warning-${index}`}>Warning: {warning}</Text>
      ))}
      {item.jobAidSteps.map((step, index) => (
        <Text style={styles.supportingText} key={`${item.id}-step-${index}`}>
          {index + 1}. {step.label}{step.note ? ` - ${step.note}` : ""}{step.condition ? ` (${step.condition})` : ""}
        </Text>
      ))}
    </View>
  );
}

function MethodValueList({ label, values, warning = false }) {
  if (!values.length) return null;
  return (
    <View style={styles.methodDetail}>
      <Text style={warning ? styles.warningText : styles.supportingText}>{label}</Text>
      {values.map((value, index) => (
        <Text style={warning ? styles.warningText : styles.supportingText} key={`${label}-${index}`}>- {value}</Text>
      ))}
    </View>
  );
}

function MethodGuidance({ method, preferred }) {
  const application = method.applicationInstructions || method.labelDirections;
  return (
    <View style={styles.methodCard}>
      <Text style={styles.methodName}>{method.name}{preferred ? " (Preferred)" : ""}</Text>
      <Text style={method.status === "restricted" ? styles.warningText : styles.supportingText}>
        {method.status === "restricted" ? "Restricted" : "Approved"} | {humanize(method.classification)}
      </Text>
      <MethodValueList label="Intended use" values={method.intendedUses} />
      <MethodValueList label="Compatible surfaces" values={method.compatibleSurfaces} />
      <MethodValueList label="Do not use on" values={method.prohibitedSurfaces} warning />
      <MethodValueList label="PPE" values={method.requiredPPE} />
      <MethodValueList label="Tools" values={method.requiredTools} />
      {method.dwellTime || method.contactTime ? (
        <Text style={styles.supportingText}>Dwell/contact time: {method.dwellTime || method.contactTime}</Text>
      ) : null}
      <MethodValueList label="Ingredients" values={method.ingredients} />
      <MethodValueList label="Formula" values={method.measurements} />
      {method.formulaVariants.map(variant => (
        <View style={styles.methodDetail} key={variant.id || variant.name}>
          <Text style={styles.supportingText}>{variant.name || "Approved formula"}</Text>
          {variant.measurements.map((value, index) => (
            <Text style={styles.supportingText} key={`${variant.id || variant.name}-measurement-${index}`}>- {value}</Text>
          ))}
          {variant.expectedYield ? <Text style={styles.supportingText}>Yield: {variant.expectedYield}</Text> : null}
        </View>
      ))}
      {method.dilutionInstructions ? <Text style={styles.supportingText}>Dilution: {method.dilutionInstructions}</Text> : null}
      <MethodValueList label="Preparation" values={method.mixingOrder} />
      {application ? <Text style={styles.supportingText}>Application: {application}</Text> : null}
      {method.rinseInstructions ? <Text style={styles.supportingText}>Rinse: {method.rinseInstructions}</Text> : null}
      {method.dryingInstructions ? <Text style={styles.supportingText}>Drying: {method.dryingInstructions}</Text> : null}
      <MethodValueList label="Dangerous combinations" values={method.dangerousCombinations} warning />
    </View>
  );
}

function TaskMethodGuidance({ item, methodById, loading }) {
  const ids = Array.isArray(item.approvedMethodIds) ? item.approvedMethodIds : [];
  if (!ids.length) return null;
  if (loading) return <Text style={styles.supportingText}>Loading approved method guidance...</Text>;
  const records = ids.map(id => methodById.get(id)).filter(Boolean);
  if (!records.length) return <Text style={styles.warningText}>{METHOD_UNAVAILABLE}</Text>;
  const preferred = records.find(record => record.id === item.preferredMethodId) || records[0];
  return (
    <View style={styles.taskMethod}>
      <Text style={styles.methodTaskName}>{item.label}</Text>
      <MethodGuidance method={preferred} preferred />
      {records.filter(record => record.id !== preferred.id).map(record => (
        <MethodGuidance key={record.id} method={record} preferred={false} />
      ))}
    </View>
  );
}

function SafetyAndMethod({ job, methodById, methodsLoading }) {
  const { safety, accessSecurity } = job;
  const hasCautions = safety.hazards.length > 0 || Boolean(
    safety.surfaceNotes || safety.allergyOrProductRestrictions || safety.pets.present
  );
  const methodItems = job.checklist.ready
    ? job.checklist.items.filter(item => item.approvedMethodIds.length > 0)
    : [];
  const petDetails = [
    safety.pets.count > 0 ? `${safety.pets.count} pet${safety.pets.count === 1 ? "" : "s"}` : "Pets recorded",
    safety.pets.types.length ? safety.pets.types.join(", ") : "",
    safety.pets.hairLevel && safety.pets.hairLevel !== "none" ? `${humanize(safety.pets.hairLevel)} pet hair` : "",
  ].filter(Boolean).join(" | ");

  return (
    <DetailSection title="Safety & Method">
      <Text style={styles.subsectionTitle}>Job-Specific Cautions</Text>
      {!hasCautions ? <Text style={styles.text}>{SAFETY_FALLBACK}</Text> : null}
      {safety.hazards.map((hazard, index) => (
        <Text style={styles.warningText} key={`hazard-${index}`}>Hazard: {hazard}</Text>
      ))}
      {safety.surfaceNotes ? <Text style={styles.warningText}>Surface / material: {safety.surfaceNotes}</Text> : null}
      {safety.allergyOrProductRestrictions ? (
        <Text style={styles.warningText}>Allergy / Product Restrictions: {safety.allergyOrProductRestrictions}</Text>
      ) : null}
      {safety.pets.present ? <Text style={styles.warningText}>Pets: {petDetails}</Text> : null}

      <Text style={styles.subsectionTitle}>Access / Security</Text>
      <Text style={styles.text}>{accessSecurity.instructions || "No job-specific access instructions recorded."}</Text>

      <Text style={styles.subsectionTitle}>Service Method</Text>
      {!methodItems.length ? <Text style={styles.text}>No approved method guidance is recorded for this job.</Text> : null}
      {methodItems.map(item => (
        <TaskMethodGuidance
          item={item}
          key={item.id}
          loading={methodsLoading}
          methodById={methodById}
        />
      ))}
      <Text style={styles.clarificationText}>{CLARIFICATION_FALLBACK}</Text>
    </DetailSection>
  );
}

export default function JobDetailsScreen({ route, navigation }) {
  const bookingId = route?.params?.bookingId || "";
  const { employee, tenantId } = useContext(AuthContext);
  const employeeUid = employee?.uid || "";
  const requestKey = `${employeeUid}:${bookingId}`;
  const photoRequestKey = `${employeeUid}:${tenantId || ""}:${bookingId}`;
  const currentKey = useRef(requestKey);
  const detailRequestId = useRef(0);
  const mutationRequestId = useRef(0);
  const mutationInFlight = useRef(false);
  const photoRequestId = useRef(0);
  const methodRequestId = useRef(0);
  const navigationRequestId = useRef(0);
  const packetVersion = useRef(0);
  const [state, setState] = useState({ key: "", job: null, loading: true, error: "", unavailable: false });
  const [checklist, setChecklist] = useState([]);
  const [fieldNotes, setFieldNotes] = useState("");
  const [fieldIssue, setFieldIssue] = useState("");
  const [savingAction, setSavingAction] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [photoEvidence, setPhotoEvidence] = useState({ key: "", photos: [], loading: true, error: "" });
  const [completionWarning, setCompletionWarning] = useState(false);
  const [methodState, setMethodState] = useState({ key: "", records: [], loading: false });
  const [navigationBusy, setNavigationBusy] = useState(false);
  const [navigationError, setNavigationError] = useState("");
  currentKey.current = requestKey;

  const replaceWithPacket = useCallback((job, key, message = "") => {
    packetVersion.current += 1;
    navigationRequestId.current += 1;
    setState({ key, job, loading: false, error: "", unavailable: false });
    setChecklist(job.checklist.ready ? job.checklist.items.map(item => ({ ...item })) : []);
    setFieldNotes(job.fieldNotes);
    setFieldIssue(job.fieldIssue);
    setActionMessage(message);
    setActionError("");
    setCompletionWarning(false);
    setNavigationBusy(false);
    setNavigationError("");
  }, []);

  const clearUnavailable = useCallback(key => {
    packetVersion.current += 1;
    navigationRequestId.current += 1;
    setState({ key, job: null, loading: false, error: UNAVAILABLE_ERROR, unavailable: true });
    setChecklist([]);
    setFieldNotes("");
    setFieldIssue("");
    setActionMessage("");
    setActionError("");
    setCompletionWarning(false);
    setNavigationBusy(false);
    setNavigationError("");
  }, []);

  const loadJob = useCallback(async () => {
    packetVersion.current += 1;
    navigationRequestId.current += 1;
    setNavigationBusy(false);
    setNavigationError("");
    if (!employeeUid || !bookingId) {
      setState({ key: requestKey, job: null, loading: false, error: DETAIL_ERROR, unavailable: false });
      return;
    }
    const request = ++detailRequestId.current;
    setState({ key: requestKey, job: null, loading: true, error: "", unavailable: false });
    setChecklist([]);
    setFieldNotes("");
    setFieldIssue("");
    setActionMessage("");
    setActionError("");
    try {
      const job = await getEmployeeJob(bookingId);
      if (request !== detailRequestId.current || currentKey.current !== requestKey) return;
      replaceWithPacket(job, requestKey);
    } catch (error) {
      if (request !== detailRequestId.current || currentKey.current !== requestKey) return;
      if (isEmployeeJobAccessLossError(error)) clearUnavailable(requestKey);
      else setState({ key: requestKey, job: null, loading: false, error: DETAIL_ERROR, unavailable: false });
    }
  }, [bookingId, clearUnavailable, employeeUid, replaceWithPacket, requestKey]);

  useEffect(() => {
    detailRequestId.current += 1;
    mutationRequestId.current += 1;
    mutationInFlight.current = false;
    setSavingAction("");
    loadJob();
    return () => {
      detailRequestId.current += 1;
      mutationRequestId.current += 1;
      mutationInFlight.current = false;
    };
  }, [loadJob]);

  const loadPhotoEvidence = useCallback(async () => {
    if (!employeeUid || !tenantId || !bookingId) {
      setPhotoEvidence({ key: photoRequestKey, photos: [], loading: false, error: PHOTO_EVIDENCE_ERROR });
      return;
    }
    const request = ++photoRequestId.current;
    setPhotoEvidence({ key: photoRequestKey, photos: [], loading: true, error: "" });
    try {
      const photos = await listEmployeeFieldPhotos(tenantId, bookingId);
      if (request !== photoRequestId.current || currentKey.current !== requestKey) return;
      setPhotoEvidence({ key: photoRequestKey, photos, loading: false, error: "" });
    } catch {
      if (request !== photoRequestId.current || currentKey.current !== requestKey) return;
      setPhotoEvidence({ key: photoRequestKey, photos: [], loading: false, error: PHOTO_EVIDENCE_ERROR });
    }
  }, [bookingId, employeeUid, photoRequestKey, requestKey, tenantId]);

  useEffect(() => {
    photoRequestId.current += 1;
    loadPhotoEvidence();
    return () => {
      photoRequestId.current += 1;
    };
  }, [loadPhotoEvidence]);

  const mutate = useCallback(async (action, operation, successMessage) => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    const request = ++mutationRequestId.current;
    const key = requestKey;
    setSavingAction(action);
    setActionMessage("");
    setActionError("");
    try {
      const job = await operation();
      if (request !== mutationRequestId.current || currentKey.current !== key) return;
      replaceWithPacket(job, key, successMessage);
    } catch (error) {
      if (request !== mutationRequestId.current || currentKey.current !== key) return;
      if (isEmployeeJobAccessLossError(error)) {
        clearUnavailable(key);
      } else if (error?.code === "checklist_unavailable") {
        setActionError(CHECKLIST_UNAVAILABLE);
      } else if (error?.code === "incomplete_required_checklist") {
        setActionError(INCOMPLETE_CHECKLIST);
      } else {
        setActionError(UPDATE_ERROR);
      }
    } finally {
      if (request === mutationRequestId.current && currentKey.current === key) {
        mutationInFlight.current = false;
        setSavingAction("");
      }
    }
  }, [clearUnavailable, replaceWithPacket, requestKey]);

  const visibleState = state.key === requestKey
    ? state
    : { key: requestKey, job: null, loading: true, error: "", unavailable: false };
  const job = visibleState.job;
  const currentPhotoEvidence = photoEvidence.key === photoRequestKey
    ? photoEvidence
    : { key: photoRequestKey, photos: [], loading: true, error: "" };
  const beforePhotos = currentPhotoEvidence.photos.filter(photo => photo.phase === "before");
  const afterPhotos = currentPhotoEvidence.photos.filter(photo => photo.phase === "after");
  const incompleteRequired = checklist.filter(item => item.required && !item.completed);
  const mutationBusy = Boolean(savingAction);
  const methodIds = job?.checklist.ready
    ? [...new Set(job.checklist.items.flatMap(item => item.approvedMethodIds))].sort()
    : [];
  const methodIdsKey = methodIds.join("|");
  const methodStateKey = `${requestKey}:${methodIdsKey}`;
  const currentMethodState = methodState.key === methodStateKey
    ? methodState
    : { key: methodStateKey, records: [], loading: methodIds.length > 0 };
  const methodById = new Map(currentMethodState.records.map(record => [record.id, record]));
  const navigationAddress = job?.location?.address;
  const navigationAvailable = hasEmployeeJobDirections(navigationAddress);

  useEffect(() => {
    const request = ++methodRequestId.current;
    if (!tenantId || methodIds.length === 0) {
      setMethodState({ key: methodStateKey, records: [], loading: false });
      return undefined;
    }
    setMethodState({ key: methodStateKey, records: [], loading: true });
    getEmployeeMethodsByIds(tenantId, methodIds).then(records => {
      if (request === methodRequestId.current && currentKey.current === requestKey) {
        setMethodState({ key: methodStateKey, records, loading: false });
      }
    }).catch(() => {
      if (request === methodRequestId.current && currentKey.current === requestKey) {
        setMethodState({ key: methodStateKey, records: [], loading: false });
      }
    });
    return () => { methodRequestId.current += 1; };
  }, [methodIdsKey, methodStateKey, requestKey, tenantId]);

  const openDirections = useCallback(async () => {
    if (!navigationAvailable || navigationBusy) return;
    const key = requestKey;
    const version = packetVersion.current;
    const request = ++navigationRequestId.current;
    setNavigationBusy(true);
    setNavigationError("");
    try {
      await openEmployeeJobDirections(navigationAddress, {
        isCurrent: () => currentKey.current === key && packetVersion.current === version,
      });
    } catch {
      if (request === navigationRequestId.current && currentKey.current === key && packetVersion.current === version) {
        setNavigationError(DIRECTIONS_ERROR);
      }
    } finally {
      if (request === navigationRequestId.current && currentKey.current === key && packetVersion.current === version) {
        setNavigationBusy(false);
      }
    }
  }, [navigationAddress, navigationAvailable, navigationBusy, requestKey]);

  const toggleChecklistItem = (id, completed) => {
    if (mutationInFlight.current) return;
    setChecklist(current => current.map(item => item.id === id ? { ...item, completed } : item));
    setActionMessage("");
    setActionError("");
    setCompletionWarning(false);
  };

  const recordUploadedPhoto = photo => {
    if (currentPhotoEvidence.key !== photoRequestKey || !photo?.id) return;
    setPhotoEvidence(current => {
      if (current.key !== photoRequestKey) return current;
      return { ...current, photos: [...current.photos.filter(item => item.id !== photo.id), photo] };
    });
  };

  const completeJob = () => {
    if (!job?.checklist.ready) {
      setActionError(CHECKLIST_UNAVAILABLE);
      return;
    }
    if (incompleteRequired.length > 0) {
      setActionError(INCOMPLETE_CHECKLIST);
      return;
    }
    if (!completionWarning && !currentPhotoEvidence.loading && !currentPhotoEvidence.error && !afterPhotos.length) {
      setCompletionWarning(true);
      return;
    }
    setCompletionWarning(false);
    mutate(
      "complete",
      () => completeEmployeeJob(bookingId, completionState(checklist), fieldNotes, fieldIssue),
      "Job completed."
    );
  };

  if (visibleState.loading) {
    return (
      <View style={styles.centered} accessibilityRole="progressbar">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading job details...</Text>
      </View>
    );
  }

  if (!job) {
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
        {navigationAvailable ? (
          <View style={styles.actionButton}>
            <Button
              title={navigationBusy ? "Opening Directions..." : "Get Directions"}
              disabled={navigationBusy}
              onPress={openDirections}
            />
          </View>
        ) : null}
        {navigationError ? <Text style={styles.errorText} accessibilityRole="alert">{navigationError}</Text> : null}
      </DetailSection>

      <DetailSection title="Instructions">
        <Text style={styles.text}>{job.instructions}</Text>
      </DetailSection>

      <SafetyAndMethod
        job={job}
        methodById={methodById}
        methodsLoading={currentMethodState.loading}
      />

      {job.fieldStatus === "not_started" ? (
        <View style={styles.startButton}>
          <Button
            title={savingAction === "start" ? "Starting..." : "Start Job"}
            disabled={mutationBusy}
            onPress={() => mutate("start", () => startEmployeeJob(bookingId), "Job started.")}
          />
        </View>
      ) : null}

      <DetailSection title="Photo Evidence">
        {currentPhotoEvidence.loading ? (
          <View style={styles.photoLoading} accessibilityRole="progressbar">
            <ActivityIndicator color="#2563eb" />
            <Text style={styles.text}>Loading photo evidence...</Text>
          </View>
        ) : currentPhotoEvidence.error ? (
          <>
            <Text style={styles.errorText}>{currentPhotoEvidence.error}</Text>
            <Button title="Retry Photo Evidence" onPress={loadPhotoEvidence} />
          </>
        ) : (
          <>
            <FieldPhotoCapture
              bookingId={bookingId}
              disabled={mutationBusy || job.fieldStatus !== "not_started"}
              onUploaded={recordUploadedPhoto}
              phase="before"
              photos={beforePhotos}
              tenantId={tenantId}
            />
            <View style={styles.photoDivider} />
            <FieldPhotoCapture
              bookingId={bookingId}
              disabled={mutationBusy || job.fieldStatus !== "in_progress"}
              onUploaded={recordUploadedPhoto}
              phase="after"
              photos={afterPhotos}
              tenantId={tenantId}
            />
          </>
        )}
      </DetailSection>

      <DetailSection title="Checklist">
        {!job.checklist.ready ? (
          <Text style={styles.reviewText}>{CHECKLIST_UNAVAILABLE}</Text>
        ) : (
          <>
            <Text style={styles.readyText}>Checklist ready</Text>
            <Text style={styles.text}>
              {checklist.filter(item => item.completed).length} of {checklist.length} complete
            </Text>
            {job.checklist.notes ? <Text style={styles.packetNote}>{job.checklist.notes}</Text> : null}
            {job.checklist.warnings.map((warning, index) => (
              <Text style={styles.warningText} key={`packet-warning-${index}`}>Warning: {warning}</Text>
            ))}
            {checklist.map(item => (
              <ChecklistItem
                key={item.id}
                item={item}
                disabled={mutationBusy}
                onChange={toggleChecklistItem}
              />
            ))}
            <View style={styles.actionButton}>
              <Button
                title={savingAction === "checklist" ? "Saving..." : "Save Checklist"}
                disabled={mutationBusy}
                onPress={() => mutate(
                  "checklist",
                  () => saveEmployeeChecklist(bookingId, completionState(checklist)),
                  "Checklist saved."
                )}
              />
            </View>
          </>
        )}
      </DetailSection>

      <DetailSection title="Field Notes">
        <TextInput
          accessibilityLabel="Field Notes"
          multiline
          maxLength={FIELD_NOTES_MAX_LENGTH}
          editable={!mutationBusy}
          value={fieldNotes}
          onChangeText={value => setFieldNotes(value.slice(0, FIELD_NOTES_MAX_LENGTH))}
          placeholder="Add employee field notes"
          style={styles.textArea}
        />
        <Text style={styles.characterCount}>{fieldNotes.length} / {FIELD_NOTES_MAX_LENGTH}</Text>
      </DetailSection>

      <DetailSection title="Reported Issue">
        <TextInput
          accessibilityLabel="Reported Issue"
          multiline
          maxLength={FIELD_ISSUE_MAX_LENGTH}
          editable={!mutationBusy}
          value={fieldIssue}
          onChangeText={value => setFieldIssue(value.slice(0, FIELD_ISSUE_MAX_LENGTH))}
          placeholder="Optional issue for the business owner"
          style={styles.textArea}
        />
        <Text style={styles.characterCount}>{fieldIssue.length} / {FIELD_ISSUE_MAX_LENGTH}</Text>
        <View style={styles.actionButton}>
          <Button
            title={savingAction === "notes" ? "Saving..." : "Save Notes"}
            disabled={mutationBusy}
            onPress={() => mutate(
              "notes",
              () => saveEmployeeNotes(bookingId, fieldNotes, fieldIssue),
              "Notes saved."
            )}
          />
        </View>
      </DetailSection>

      {actionMessage ? <Text style={styles.successText} accessibilityRole="alert">{actionMessage}</Text> : null}
      {actionError ? <Text style={styles.errorText} accessibilityRole="alert">{actionError}</Text> : null}
      {job.checklist.ready && incompleteRequired.length > 0 ? (
        <Text style={styles.requiredText}>
          {incompleteRequired.length} required checklist item{incompleteRequired.length === 1 ? "" : "s"} must be completed first.
        </Text>
      ) : null}
      {completionWarning ? (
        <View style={styles.completionWarning} accessibilityRole="alert">
          <Text style={styles.requiredText}>{NO_AFTER_PHOTOS_WARNING}</Text>
          <View style={styles.warningActions}>
            <Button title="Go Back" onPress={() => setCompletionWarning(false)} />
            <Button title="Complete Anyway" disabled={mutationBusy} onPress={completeJob} />
          </View>
        </View>
      ) : null}
      <View style={styles.completeButton}>
        <Button
          title={job.fieldStatus === "completed" ? "Completed" : savingAction === "complete" ? "Completing..." : "Complete Job"}
          disabled={
            mutationBusy ||
            job.fieldStatus === "completed" ||
            !job.checklist.ready ||
            incompleteRequired.length > 0
          }
          onPress={completeJob}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 16, paddingBottom: 40 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  loadingText: { marginTop: 12, color: "#475569" },
  errorText: { color: "#b91c1c", textAlign: "center", marginBottom: 14 },
  successText: { color: "#166534", textAlign: "center", fontWeight: "600", marginBottom: 14 },
  title: { fontSize: 26, fontWeight: "700", color: "#0f172a", marginBottom: 20 },
  section: {
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 16,
    marginBottom: 18,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#1e293b", marginBottom: 10 },
  subsectionTitle: { fontSize: 15, fontWeight: "700", color: "#334155", marginTop: 10, marginBottom: 4 },
  text: { fontSize: 16, lineHeight: 23, color: "#475569", marginBottom: 3 },
  readyText: { fontSize: 16, fontWeight: "600", color: "#166534", marginBottom: 4 },
  reviewText: { fontSize: 16, fontWeight: "600", color: "#92400e" },
  packetNote: { color: "#475569", marginTop: 8, marginBottom: 4 },
  checklistItem: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    backgroundColor: "#fff",
  },
  checklistHeading: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  checklistTitleGroup: { flex: 1 },
  checklistArea: { color: "#64748b", fontSize: 13, marginBottom: 3 },
  checklistLabel: { color: "#0f172a", fontSize: 16, fontWeight: "600" },
  requirement: { color: "#475569", fontSize: 12, marginTop: 3 },
  supportingText: { color: "#475569", lineHeight: 20, marginTop: 7 },
  warningText: { color: "#9a3412", lineHeight: 20, marginTop: 7 },
  textArea: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 6,
    padding: 10,
    textAlignVertical: "top",
    backgroundColor: "#fff",
    color: "#0f172a",
  },
  characterCount: { color: "#64748b", fontSize: 12, textAlign: "right", marginTop: 5 },
  actionButton: { marginTop: 12, alignSelf: "flex-start", minWidth: 150 },
  startButton: { marginBottom: 18, alignSelf: "flex-start", minWidth: 150 },
  clarificationText: { color: "#475569", fontStyle: "italic", lineHeight: 20, marginTop: 14 },
  taskMethod: { marginTop: 10 },
  methodCard: { borderLeftWidth: 3, borderLeftColor: "#64748b", paddingLeft: 10, marginTop: 8 },
  methodName: { color: "#0f172a", fontWeight: "700" },
  methodTaskName: { color: "#334155", fontWeight: "600" },
  methodDetail: { marginTop: 4 },
  requiredText: { color: "#92400e", marginBottom: 12, textAlign: "center" },
  completeButton: { marginTop: 4 },
  photoLoading: { flexDirection: "row", alignItems: "center", gap: 8 },
  photoDivider: { borderBottomWidth: 1, borderBottomColor: "#e2e8f0", marginVertical: 16 },
  completionWarning: { marginBottom: 12 },
  warningActions: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
});
