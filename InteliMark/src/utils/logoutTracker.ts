import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';

/**
 * Track user logout activity
 * Call this function when user logs out to mark them as offline
 */
export const trackUserLogout = async (userId: string) => {
  try {
    // Update user document with current time as lastActive and mark as offline
    // The lastActive will show the actual logout time in the UI
    // The isOnline flag determines the status (active/offline)
    const userRef = doc(db, 'users', userId);
    
    await updateDoc(userRef, {
      lastActive: new Date(), // Set to current time so it shows real logout time
      isOnline: false // Mark as offline
    });

    console.log('User logout tracked successfully');
  } catch (error) {
    console.error('Error tracking logout:', error);
  }
};