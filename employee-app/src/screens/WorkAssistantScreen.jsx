import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Button, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { getEmployeeJob, isEmployeeJobAccessLossError } from '../api/employeeJobs';
import {
  askEmployeeWorkAssistant,
  createEmployeeWorkAssistantRequestId,
  isEmployeeWorkAssistantAccessLoss,
} from '../api/employeeWorkAssistant';

const QUESTION_MAX_LENGTH = 600;
const LOAD_ERROR = 'Work Assistant could not load this job. Try again.';
const REQUEST_ERROR = 'Work Assistant is temporarily unavailable. Try again.';
const ACCESS_LOST = 'This job is no longer available.';
const QUICK_PROMPTS = [
  'What task is next?',
  'What tasks are left?',
  'What safety information is recorded?',
];

export default function WorkAssistantScreen({ navigation, route }) {
  const bookingId = route?.params?.bookingId || '';
  const { employee } = useContext(AuthContext);
  const employeeUid = employee?.uid || '';
  const sessionKey = `${employeeUid}:${bookingId}`;
  const currentKey = useRef(sessionKey);
  const loadRequest = useRef(0);
  const askRequest = useRef(0);
  const inFlight = useRef(false);
  const [jobState, setJobState] = useState({ key: sessionKey, job: null, loading: true, error: '', unavailable: false });
  const [question, setQuestion] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [messages, setMessages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState('');

  const loadJob = useCallback(async () => {
    const request = ++loadRequest.current;
    const key = sessionKey;
    setJobState({ key, job: null, loading: true, error: '', unavailable: false });
    try {
      const job = await getEmployeeJob(bookingId);
      if (request !== loadRequest.current || currentKey.current !== key) return;
      const nextItem = job.checklist.ready
        ? job.checklist.items.find(item => !item.completed) || job.checklist.items[0]
        : null;
      setSelectedItemId(nextItem?.id || '');
      setJobState({ key, job, loading: false, error: '', unavailable: false });
    } catch (error) {
      if (request !== loadRequest.current || currentKey.current !== key) return;
      const unavailable = isEmployeeJobAccessLossError(error);
      setJobState({ key, job: null, loading: false, error: unavailable ? ACCESS_LOST : LOAD_ERROR, unavailable });
    }
  }, [bookingId, sessionKey]);

  useEffect(() => {
    currentKey.current = sessionKey;
    loadRequest.current += 1;
    askRequest.current += 1;
    inFlight.current = false;
    setQuestion('');
    setSelectedItemId('');
    setMessages([]);
    setSubmitting(false);
    setRequestError('');
    loadJob();
    return () => {
      loadRequest.current += 1;
      askRequest.current += 1;
      inFlight.current = false;
    };
  }, [loadJob, sessionKey]);

  const submit = useCallback(async ({ prompt = question, checklistItemId = selectedItemId } = {}) => {
    const value = typeof prompt === 'string' ? prompt.trim() : '';
    if (!value || inFlight.current || !jobState.job) return;
    const request = ++askRequest.current;
    const key = sessionKey;
    inFlight.current = true;
    setSubmitting(true);
    setRequestError('');
    const requestId = createEmployeeWorkAssistantRequestId();
    try {
      const result = await askEmployeeWorkAssistant({
        bookingId,
        question: value,
        requestId,
        ...(checklistItemId ? { checklistItemId } : {}),
      });
      if (request !== askRequest.current || currentKey.current !== key) return;
      setMessages(current => [...current, { id: requestId, question: value, kind: result.kind, answer: result.answer }].slice(-8));
      setQuestion('');
    } catch (error) {
      if (request !== askRequest.current || currentKey.current !== key) return;
      if (isEmployeeWorkAssistantAccessLoss(error)) {
        setMessages([]);
        setQuestion('');
        setSelectedItemId('');
        setJobState({ key, job: null, loading: false, error: ACCESS_LOST, unavailable: true });
      } else {
        setRequestError(REQUEST_ERROR);
      }
    } finally {
      if (request === askRequest.current && currentKey.current === key) {
        inFlight.current = false;
        setSubmitting(false);
      }
    }
  }, [bookingId, jobState.job, question, selectedItemId, sessionKey]);

  const state = jobState.key === sessionKey ? jobState : { job: null, loading: true, error: '', unavailable: false };
  if (state.loading) {
    return <View style={styles.centered} accessibilityRole="progressbar"><ActivityIndicator size="large" /><Text style={styles.status}>Loading Work Assistant...</Text></View>;
  }
  if (!state.job) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error} accessibilityRole="alert">{state.error}</Text>
        {state.unavailable ? <Button title="Back to Jobs" onPress={() => navigation.popToTop()} /> : <Button title="Retry" onPress={loadJob} />}
      </View>
    );
  }

  const checklistItems = state.job.checklist.ready ? state.job.checklist.items.slice(0, 20) : [];
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>SLAI Work Assistant</Text>
      <Text style={styles.intro}>Ask about today's assigned work. Safety-critical questions should be confirmed with your owner/supervisor.</Text>

      <View style={styles.quickActions} accessibilityLabel="Work Assistant quick prompts">
        {QUICK_PROMPTS.map(prompt => (
          <Pressable key={prompt} accessibilityRole="button" disabled={submitting} onPress={() => submit({ prompt, checklistItemId: '' })} style={styles.quickButton}>
            <Text style={styles.quickButtonText}>{prompt}</Text>
          </Pressable>
        ))}
      </View>

      {checklistItems.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Checklist item to explain</Text>
          {checklistItems.map(item => (
            <Pressable
              key={item.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedItemId === item.id }}
              onPress={() => setSelectedItemId(item.id)}
              style={[styles.itemButton, selectedItemId === item.id && styles.itemButtonSelected]}
            >
              <Text style={styles.itemText}>{item.label}</Text>
            </Pressable>
          ))}
          <Button
            title="Explain selected checklist item"
            disabled={!selectedItemId || submitting}
            onPress={() => submit({ prompt: 'Explain this checklist item in simpler language.', checklistItemId: selectedItemId })}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <TextInput
          accessibilityLabel="Ask Work Assistant"
          multiline
          maxLength={QUESTION_MAX_LENGTH}
          editable={!submitting}
          value={question}
          onChangeText={setQuestion}
          placeholder="Ask about this job"
          style={styles.input}
        />
        <Text style={styles.count}>{question.length} / {QUESTION_MAX_LENGTH}</Text>
        <Button title={submitting ? 'Sending...' : 'Send'} disabled={submitting || !question.trim()} onPress={() => submit()} />
      </View>

      {requestError ? <Text style={styles.error} accessibilityRole="alert">{requestError}</Text> : null}
      {messages.map(message => (
        <View key={message.id} style={styles.message}>
          <Text style={styles.question}>{message.question}</Text>
          <Text style={message.kind === 'escalation' ? styles.escalation : styles.answer}>{message.answer}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  status: { marginTop: 12, color: '#475569' },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  intro: { color: '#475569', lineHeight: 21, marginBottom: 16 },
  quickActions: { gap: 8, marginBottom: 18 },
  quickButton: { borderWidth: 1, borderColor: '#94a3b8', borderRadius: 6, padding: 11, backgroundColor: '#fff' },
  quickButtonText: { color: '#1e40af', fontWeight: '600' },
  section: { borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 16, marginTop: 8, marginBottom: 18 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  itemButton: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, padding: 10, marginBottom: 8, backgroundColor: '#fff' },
  itemButtonSelected: { borderColor: '#1d4ed8', borderWidth: 2 },
  itemText: { color: '#0f172a' },
  input: { minHeight: 96, borderWidth: 1, borderColor: '#94a3b8', borderRadius: 6, padding: 10, textAlignVertical: 'top', backgroundColor: '#fff', color: '#0f172a' },
  count: { color: '#64748b', fontSize: 12, textAlign: 'right', marginTop: 4, marginBottom: 8 },
  error: { color: '#b91c1c', textAlign: 'center', marginBottom: 14 },
  message: { borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 14, marginTop: 10 },
  question: { color: '#334155', fontWeight: '600', marginBottom: 6 },
  answer: { color: '#0f172a', lineHeight: 22 },
  escalation: { color: '#92400e', lineHeight: 22, fontWeight: '600' },
});
