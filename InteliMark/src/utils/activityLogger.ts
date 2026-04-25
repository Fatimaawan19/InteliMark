// filepath: c:\Users\Nazim\Desktop\InteliMark\src\utils\activityLogger.ts
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

export const logActivity = async (activityData: {
  type: string;
  userId: string;
  userName: string;
  userRole: 'student' | 'teacher' | 'admin';
  action: string;
  description: string;
  metadata?: any;
}) => {
  try {
    await addDoc(collection(db, 'activities'), {
      ...activityData,
      timestamp: Timestamp.now()
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
};

// Activity Types
export const ACTIVITY_TYPES = {
  COURSE_REGISTRATION: 'course_registration',
  ASSIGNMENT_SUBMISSION: 'assignment_submission',
  COURSE_CREATED: 'course_created',
  USER_REGISTERED: 'user_registered',
  GRADE_UPDATED: 'grade_updated',
  QUERY_SUBMITTED: 'query_submitted',
};
