import React, { useEffect, useRef, useState } from 'react';
import { Button, Linking, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { sendSafetyAlert } from '../api/employeeSafety';

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
  const key = `${employeeUid}:${bookingId}`;

  useEffect(() => {
    activeKey.current = key;
    pending.current = null;
    sending.current = false;
    setBusy(false);
    setState({ status: '', error: '' });
    return () => { activeKey.current = ''; };
  }, [key]);

  async function dial(number) {
    try { await Linking.openURL(`tel:${number}`); }
    catch { setState(previous => ({ ...previous, error: 'The phone dialer could not be opened.' })); }
  }

  async function send() {
    if (sending.current || !employeeUid || !bookingId) return;
    sending.current = true;
    setBusy(true);
    setState({ status: '', error: '' });
    const event = pending.current || { eventId: createSafetyEventId() };
    pending.current = event;
    try {
      if (!Object.hasOwn(event, 'location')) event.location = await oneTimeLocation();
      if (activeKey.current !== key) return;
      await sendSafetyAlert({ eventId: event.eventId, bookingId, ...(event.location ? { location: event.location } : {}) });
      if (activeKey.current !== key) return;
      pending.current = null;
      setState({ status: 'sent', error: '' });
    } catch (error) {
      if (activeKey.current !== key) return;
      if ([401, 403, 404].includes(error?.status)) onAccessLost?.();
      setState({ status: 'failed', error: 'Safety alert failed. Try again.' });
    } finally {
      if (activeKey.current === key) { sending.current = false; setBusy(false); }
    }
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
      <Button title={busy ? 'Sending...' : state.status === 'failed' ? 'Retry Safety Alert' : 'Send Safety Alert'} disabled={busy} onPress={send} />
      {state.status === 'sent' ? <Text accessibilityRole="alert">Safety alert sent to ServicesOS.</Text> : null}
      {state.error ? <Text accessibilityRole="alert">{state.error}</Text> : null}
    </View>
  );
}
