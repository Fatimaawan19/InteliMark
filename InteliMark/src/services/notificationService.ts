/**
 * Notification Service - Firebase Firestore
 */

import { db } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit as firestoreLimit,
  getDocs, 
  doc, 
  updateDoc,
  writeBatch,
  Timestamp
} from 'firebase/firestore';

export interface Notification {
  _id: string;
  type: string;
  recipientId: string;
  recipientRole?: 'teacher' | 'student' | 'admin';
  title: string;
  message: string;
  assessmentId?: string;
  assessmentTitle?: string;
  assessmentType?: string;
  courseId?: string;
  courseCode?: string;
  courseName?: string;
  createdById?: string;
  createdByName?: string;
  submissionDeadline?: string;
  scheduledTime?: string;
  duration?: number;
  read: boolean;
  actionType?: string;
  createdAt: string | Timestamp;
  timestamp?: string | Timestamp;
}

export interface NotificationsResponse {
  success: boolean;
  notifications: Notification[];
  pagination: {
    total: number;
    unread: number;
    limit: number;
    skip: number;
  };
}

export interface UnreadCountResponse {
  success: boolean;
  unread: number;
}

export const notificationService = {
  /**
   * Fetch notifications for a user from Firebase Firestore
   * Supports both recipientId (backend) and userId (frontend legacy)
   */
  async getNotifications(userId: string, limitCount = 50, skip = 0): Promise<NotificationsResponse> {
    try {
      console.log('📥 Fetching notifications from Firebase for user:', userId);
      
      const notificationsRef = collection(db, 'notifications');
      
      // Query 1: recipientId (backend assessment notifications)
      const q1 = query(
        notificationsRef,
        where('recipientId', '==', userId),
        orderBy('createdAt', 'desc'),
        firestoreLimit(limitCount)
      );
      
      // Query 2: userId (frontend course/teacher notifications)
      const q2 = query(
        notificationsRef,
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        firestoreLimit(limitCount)
      );
      
      const [snapshot1, snapshot2] = await Promise.all([
        getDocs(q1),
        getDocs(q2)
      ]);
      
      // Combine and deduplicate notifications
      const notificationsMap = new Map<string, Notification>();
      
      snapshot1.docs.forEach(doc => {
        const data = doc.data();
        notificationsMap.set(doc.id, {
          _id: doc.id,
          type: data.type || 'info',
          recipientId: data.recipientId,
          recipientRole: data.recipientRole,
          title: data.title || '',
          message: data.message || '',
          assessmentId: data.assessmentId,
          courseId: data.courseId,
          courseCode: data.courseCode,
          createdById: data.createdById,
          createdByName: data.createdByName,
          read: data.read || false,
          actionType: data.actionType,
          createdAt: data.createdAt
        });
      });
      
      snapshot2.docs.forEach(doc => {
        const data = doc.data();
        notificationsMap.set(doc.id, {
          _id: doc.id,
          type: data.type || 'info',
          recipientId: data.userId, // Map userId to recipientId
          recipientRole: data.recipientRole,
          title: data.title || '',
          message: data.message || '',
          assessmentId: data.assessmentId,
          courseId: data.courseId,
          courseCode: data.courseCode,
          createdById: data.createdById,
          createdByName: data.createdByName,
          read: data.read || false,
          actionType: data.actionType,
          createdAt: data.timestamp || data.createdAt // Support both
        });
      });

      const notifications = Array.from(notificationsMap.values())
        .sort((a, b) => {
          const timeA = (a.createdAt as any)?.toMillis?.() || 0;
          const timeB = (b.createdAt as any)?.toMillis?.() || 0;
          return timeB - timeA;
        })
        .slice(0, limitCount);

      const unreadCount = notifications.filter(n => !n.read).length;

      console.log(`✅ Fetched ${notifications.length} notifications (${unreadCount} unread) from Firebase`);
      console.log(`   Backend: ${snapshot1.size}, Frontend: ${snapshot2.size}`);

      return {
        success: true,
        notifications,
        pagination: {
          total: notifications.length,
          unread: unreadCount,
          limit: limitCount,
          skip
        }
      };
    } catch (error) {
      console.error('❌ Firebase notification fetch error:', error);
      // Return empty response on error - doesn't block assessment operations
      return {
        success: false,
        notifications: [],
        pagination: { total: 0, unread: 0, limit: limitCount, skip }
      };
    }
  },

  /**
   * Get unread notification count from Firebase Firestore
   * Supports both recipientId (backend) and userId (frontend legacy)
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const notificationsRef = collection(db, 'notifications');
      
      // Query recipientId (backend notifications)
      const q1 = query(
        notificationsRef,
        where('recipientId', '==', userId),
        where('read', '==', false)
      );
      
      // Query userId (frontend legacy notifications)
      const q2 = query(
        notificationsRef,
        where('userId', '==', userId),
        where('read', '==', false)
      );
      
      const [snapshot1, snapshot2] = await Promise.all([
        getDocs(q1),
        getDocs(q2)
      ]);
      
      const totalCount = snapshot1.size + snapshot2.size;
      console.log(`📊 Unread count for ${userId}: ${totalCount} (${snapshot1.size} backend + ${snapshot2.size} frontend)`);
      return totalCount;
    } catch (error) {
      console.warn('⚠️ Error fetching unread count from Firebase (non-blocking):', error);
      return 0;
    }
  },

  /**
   * Mark a notification as read in Firebase Firestore
   */
  async markAsRead(notificationId: string): Promise<void> {
    try {
      const notificationRef = doc(db, 'notifications', notificationId);
      await updateDoc(notificationRef, { read: true });
      console.log(`✅ Marked notification ${notificationId} as read in Firebase`);
    } catch (error) {
      console.warn('⚠️ Error marking notification as read in Firebase (non-blocking):', error);
      // Don't throw - marking as read shouldn't block operations
    }
  },

  /**
   * Mark all notifications as read for a user in Firebase Firestore
   */
  async markAllAsRead(userId: string): Promise<void> {
    try {
      const notificationsRef = collection(db, 'notifications');
      const q = query(
        notificationsRef,
        where('recipientId', '==', userId),
        where('read', '==', false)
      );
      
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        console.log('No unread notifications to mark');
        return;
      }

      const batch = writeBatch(db);
      snapshot.docs.forEach(document => {
        batch.update(document.ref, { read: true });
      });
      
      await batch.commit();
      console.log(`✅ Marked ${snapshot.size} notifications as read in Firebase`);
    } catch (error) {
      console.warn('⚠️ Error marking all notifications as read in Firebase (non-blocking):', error);
      // Don't throw - marking as read shouldn't block operations
    }
  }
};
