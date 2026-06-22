// src/api/checklists.js
/**
 * Checklist API
 * 
 * Functions for managing job checklists in the employee app.
 * Checklists are stored as subcollections under jobs.
 */

import {
  collection,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

/**
 * Get all checklist items for a specific job
 * @param {string} jobId - The job ID
 * @returns {Promise<Array>} Array of checklist items
 */
export async function getChecklistItems(jobId) {
  const ref = collection(db, "tenants", "DEFAULT", "jobs", jobId, "checklistItems");
  const snap = await getDocs(ref);

  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

/**
 * Toggle a checklist item as completed or not
 * @param {string} jobId - The job ID
 * @param {string} itemId - The checklist item ID
 * @param {string} employeeId - The employee ID
 * @param {boolean} completed - Whether the item is completed
 * @returns {Promise<void>}
 */
export async function toggleChecklistItem(jobId, itemId, employeeId, completed) {
  const ref = doc(db, "tenants", "DEFAULT", "jobs", jobId, "checklistItems", itemId);

  await updateDoc(ref, {
    completed,
    completedBy: completed ? employeeId : null,
    completedAt: completed ? serverTimestamp() : null,
  });
}

/**
 * Add a note to a checklist item
 * @param {string} jobId - The job ID
 * @param {string} itemId - The checklist item ID
 * @param {string} note - The note to add
 * @returns {Promise<void>}
 */
export async function addChecklistItemNote(jobId, itemId, note) {
  const ref = doc(db, "tenants", "DEFAULT", "jobs", jobId, "checklistItems", itemId);

  await updateDoc(ref, {
    note,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Get checklist completion percentage for a job
 * @param {string} jobId - The job ID
 * @returns {Promise<number>} Percentage of completed items (0-100)
 */
export async function getChecklistProgress(jobId) {
  const items = await getChecklistItems(jobId);
  
  if (items.length === 0) {
    return 0;
  }

  const completedCount = items.filter((item) => item.completed).length;
  return Math.round((completedCount / items.length) * 100);
}
