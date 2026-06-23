import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export async function completeUserOnboarding(userId) {
  await updateDoc(doc(db, 'users', userId), {
    onboardingCompleted: true,
    onboardingProgress: 100,
    onboardingCompletedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}
