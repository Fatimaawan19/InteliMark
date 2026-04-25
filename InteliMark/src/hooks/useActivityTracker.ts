import { useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const useActivityTracker = (userId: string | null) => {
  useEffect(() => {
    if (!userId) return;

    const updateLastActive = async () => {
      try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
          lastActive: new Date(),
          isOnline: true // Keep user marked as online while they're active
        });
      } catch (error) {
        console.error('Error updating last active:', error);
      }
    };

    // Update on mount (when user first loads the page)
    updateLastActive();

    // Update every 5 minutes while user is on the page
    const interval = setInterval(updateLastActive, 5 * 60 * 1000);

    // Update on any user activity (mouse, keyboard, scroll)
    const handleActivity = () => {
      updateLastActive();
    };

    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('scroll', handleActivity);

    return () => {
      clearInterval(interval);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('scroll', handleActivity);
    };
  }, [userId]);
};
