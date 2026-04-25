import { db } from '../firebase';
import { doc, updateDoc, addDoc, collection, getDoc } from 'firebase/firestore';

/**
 * Track user signup/first registration time
 * Call this function when a new user is created
 */
export const trackUserSignup = async (userId: string, userEmail: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    // Only set signup time if it hasn't been set yet
    if (userDoc.exists() && !userDoc.data().firstSignupTime) {
      await updateDoc(userRef, {
        firstSignupTime: new Date(),
        signupIpAddress: await getIpAddress()
      });
      console.log('Signup time tracked for', userEmail);
    }
  } catch (error) {
    console.error('Error tracking signup:', error);
  }
};

/**
 * Get user's IP address
 */
const getIpAddress = async (): Promise<string> => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.error('Failed to fetch IP:', error);
    return 'N/A';
  }
};

/**
 * Track user login activity
 * Call this function after successful authentication
 */
export const trackUserLogin = async (userId: string, userEmail: string) => {
  try {
    // Get user's IP address
    const ipAddress = await getIpAddress();

    // Update user document with last login info
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    const updateData: any = {
      lastLogin: new Date(),
      lastActive: new Date(),
      lastIpAddress: ipAddress,
      loginAttempts: 0, // Reset on successful login
      failedAttempts: 0, // Reset failed attempts counter
      isOnline: true // Mark as online
    };

    // Set signup time if not already set
    if (userDoc.exists() && !userDoc.data().firstSignupTime) {
      updateData.firstSignupTime = new Date();
      updateData.signupIpAddress = ipAddress;
    }

    await updateDoc(userRef, updateData);

    // Log security event
    await addDoc(collection(db, 'securityEvents'), {
      type: 'success',
      title: 'Successful login',
      description: `User ${userEmail} logged in successfully`,
      timestamp: new Date(),
      userId: userId,
      ipAddress: ipAddress
    });

    console.log('Login tracked successfully for', userEmail);
  } catch (error) {
    console.error('Error tracking login:', error);
  }
};

/**
 * Track failed login attempts
 */
export const trackFailedLogin = async (email: string) => {
  try {
    // Get IP address
    const ipAddress = await getIpAddress();

    // Log security event
    await addDoc(collection(db, 'securityEvents'), {
      type: 'error',
      title: 'Failed login attempt',
      description: `Failed login attempt for ${email}`,
      timestamp: new Date(),
      ipAddress: ipAddress
    });

    console.log('Failed login tracked for', email);
  } catch (error) {
    console.error('Error tracking failed login:', error);
  }
};