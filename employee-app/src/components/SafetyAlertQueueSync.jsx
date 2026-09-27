import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { isRetryableSafetyError, sendSafetyAlert } from '../api/employeeSafety';
import { getQueuedSafetyAlertsForEmployee, removeQueuedSafetyAlert } from '../api/employeeSafetyQueue';

export default function SafetyAlertQueueSync({ employeeUid }) {
  const activeEmployee = useRef(employeeUid);
  const syncing = useRef(false);

  useEffect(() => {
    activeEmployee.current = employeeUid;

    async function sync() {
      if (!employeeUid || syncing.current || activeEmployee.current !== employeeUid) return;
      syncing.current = true;
      try {
        const entries = await getQueuedSafetyAlertsForEmployee(employeeUid);
        for (const entry of entries) {
          if (activeEmployee.current !== employeeUid) return;
          try {
            await sendSafetyAlert({
              eventId: entry.eventId,
              bookingId: entry.bookingId,
              ...(entry.location ? { location: entry.location } : {}),
            });
            await removeQueuedSafetyAlert(employeeUid, entry.eventId).catch(() => {});
          } catch (error) {
            if (!isRetryableSafetyError(error)) {
              await removeQueuedSafetyAlert(employeeUid, entry.eventId).catch(() => {});
            }
          }
        }
      } catch {
        // Keep valid entries intact when local persistence is temporarily unavailable.
      } finally {
        syncing.current = false;
      }
    }

    sync();
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') sync();
    });
    return () => {
      activeEmployee.current = '';
      subscription.remove();
    };
  }, [employeeUid]);

  return null;
}
