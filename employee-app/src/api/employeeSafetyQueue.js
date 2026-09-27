import * as FileSystem from 'expo-file-system';
import queueClient from './employeeSafetyQueueClient';

const queuePath = `${FileSystem.documentDirectory}safety-alert-queue-v1.json`;
const temporaryPath = `${queuePath}.tmp`;

const storage = {
  async read() {
    const info = await FileSystem.getInfoAsync(queuePath);
    if (!info.exists) return '';
    return FileSystem.readAsStringAsync(queuePath);
  },
  async write(value) {
    await FileSystem.writeAsStringAsync(temporaryPath, value);
    const existing = await FileSystem.getInfoAsync(queuePath);
    if (existing.exists) await FileSystem.deleteAsync(queuePath, { idempotent: true });
    await FileSystem.moveAsync({ from: temporaryPath, to: queuePath });
  },
};

const queue = queueClient.createSafetyAlertQueue({ storage });

export const enqueueSafetyAlert = queue.enqueue;
export const getQueuedSafetyAlertsForEmployee = queue.forEmployee;
export const getQueuedSafetyAlertsForJob = queue.forJob;
export const removeQueuedSafetyAlert = queue.remove;
