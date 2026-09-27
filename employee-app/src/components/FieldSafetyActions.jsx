import React, { useEffect, useRef, useState } from 'react';
import { AppState, Button, Linking, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { isRetryableSafetyError, sendSafetyAlert } from '../api/employeeSafety';
import { enqueueSafetyAlert, getQueuedSafetyAlertsForJob, removeQueuedSafetyAlert } from '../api/employeeSafetyQueue';

function createSafetyEventId() {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '_') ||
    `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
  return `safety_${random}`.slice(0, 128);
}

function withTimeout(promise, milliseconds) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}

async function oneTimeLocation() {
  try {
    const permission = await withTimeout(Location.requestForegroundPermissionsAsync(), 5000);
    if (permission?.status !== 'granted') return null;
    const position = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 7000);
    const latitude = position?.coords?.latitude;
    const longitude = position?.coords?.longitude;
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
    return {
      latitude, longitude,
      ...(Number.isFinite(position.coords.accuracy) && position.coords.accuracy >= 0
        ? { accuracy: position.coords.accuracy } : {}),
      capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
    };
  } catch { return null; }
}

export default function FieldSafetyActions({ bookingId, businessPhone, employeeUid, onAccessLost }) {
  const [state, setState] = useState({ status: '', error: '' });
  const [busy, setBusy] = useState(false);
  const pending = useRef(null);
  const activeKey = useRef(`${employeeUid}:${bookingId}`);
  const sending = useRef(false);
  const status = useRef('');
  const key = `${employeeUid}:${bookingId}`;

  function updateState(nextState) {
    status.current = nextState.status;
    setState(nextState);
  }

  useEffect(() => {
    activeKey.current = key;
    pending.current = null;
    sending.current = false;
    setBusy(false);
    updateState({ status: '', error: '' });
    let cancelled = false;
    getQueuedSafetyAlertsForJob(employeeUid, bookingId).then(entries => {
      if (cancelled || activeKey.current !== key || entries.length === 0) return;
      const entry = entries[entries.length - 1];
      pending.current = { eventId: entry.eventId, ...(entry.location ? { location: entry.location } : {}), locationAttempted: true };
      updateState({ status: 'queued', error: '' });
      deliver(pending.current, false);
    }).catch(() => {
      if (!cancelled && activeKey.current === key) updateState({ status: 'failed', error: 'Safety alert failed. Try again.' });
    });
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && pending.current && status.current === 'queued') deliver(pending.current, false);
    });
    return () => {
      cancelled = true;
      activeKey.current = '';
      subscription.remove();
    };
  }, [key]);

  async function dial(number) {
    try { await Linking.openURL(`tel:${number}`); }
    catch { setState(previous => ({ ...previous, error: 'The phone dialer could not be opened.' })); }
  }

  async function deliver(event, collectLocation) {
    if (sending.current || !employeeUid || !bookingId) return;
    sending.current = true;
    setBusy(true);
    updateState({ status: 'sending', error: '' });
    pending.current = event;
    try {
      if (collectLocation && !event.locationAttempted) {
        event.location = await oneTimeLocation();
        event.locationAttempted = true;
      }
      if (activeKey.current !== key) return;
      await sendSafetyAlert({ eventId: event.eventId, bookingId, ...(event.location ? { location: event.location } : {}) });
      if (activeKey.current !== key) return;
      pending.current = null;
      updateState({ status: 'sent', error: '' });
      await removeQueuedSafetyAlert(employeeUid, event.eventId).catch(() => {});
    } catch (error) {
      if (activeKey.current !== key) return;
      if (isRetryableSafetyError(error)) {
        try {
          await enqueueSafetyAlert({ employeeUid, eventId: event.eventId, bookingId, ...(event.location ? { location: event.location } : {}) });
          if (activeKey.current === key) updateState({ status: 'queued', error: '' });
        } catch {
          if (activeKey.current === key) updateState({ status: 'failed', error: 'Safety alert failed. Try again.' });
        }
      } else {
        await removeQueuedSafetyAlert(employeeUid, event.eventId).catch(() => {});
        if ([401, 403, 404].includes(error?.status)) onAccessLost?.();
        updateState({ status: 'failed', error: 'Safety alert failed. Try again.' });
      }
    } finally {
      if (activeKey.current === key) { sending.current = false; setBusy(false); }
    }
  }

  function send() {
    const event = pending.current || { eventId: createSafetyEventId(), locationAttempted: false };
    deliver(event, !event.locationAttempted);
  }

  const dialablePhone = typeof businessPhone === 'string' && /^\+?[0-9 ()-]+$/.test(businessPhone) &&
    businessPhone.replace(/\D/g, '').length >= 7;
  return (
    <View>
      <Text>For immediate danger, call 911. A safety alert does not contact emergency services.</Text>
      <Button title="Call 911" onPress={() => dial('911')} />
      <Button title="Call Owner" disabled={!dialablePhone} onPress={() => dial(businessPhone.replace(/[^+\d]/g, ''))} />
      {!dialablePhone ? <Text>Business phone is unavailable. Contact your supervisor another way.</Text> : null}
      <Text>Location is requested only when you send this alert and is included when available.</Text>
      <Button title={busy ? 'Sending...' : ['failed', 'queued'].includes(state.status) ? 'Retry Safety Alert' : 'Send Safety Alert'} disabled={busy} onPress={send} />
      {state.status === 'sent' ? <Text accessibilityRole="alert">Safety alert sent to ServicesOS.</Text> : null}
      {state.status === 'queued' ? <Text accessibilityRole="alert">Safety alert queued on this device. The owner has not been notified yet.</Text> : null}
      {state.error ? <Text accessibilityRole="alert">{state.error}</Text> : null}
    </View>
  );
}
