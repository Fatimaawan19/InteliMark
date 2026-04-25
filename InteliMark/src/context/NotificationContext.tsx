import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  getDocs,
  getDoc,
  doc, 
  updateDoc,
  deleteDoc,
  writeBatch,
  Timestamp,
  limit as firestoreLimit
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

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Monitor auth state and fetch user role
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('🔐 Auth state changed:', user?.uid || 'No user');
      setCurrentUserId(user?.uid || null);
      
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            setUserRole(userData.role || null);
            console.log('👤 User role:', userData.role);
          }
        } catch (error) {
          console.error('Error fetching user role:', error);
        }
      } else {
        setUserRole(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Real-time notification listener with Firebase Firestore
  useEffect(() => {
    if (!currentUserId) {
      console.log('⚠️ No user ID, skipping notification listener');
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    
    console.log('📡 Setting up real-time notification listener for user:', currentUserId);
    setLoading(true);

    try {
      const allNotifications = new Map<string, Notification>();
      const unsubscribers: (() => void)[] = [];

      // Query 1: Backend assessment notifications (recipientId field)
      const notificationsRef1 = collection(db, 'notifications');
      const q1 = query(
        notificationsRef1,
        orderBy('createdAt', 'desc')
      );

      const unsub1 = onSnapshot(q1, 
        (snapshot) => {
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            const recipientId = data.recipientId;
            const recipientRole = data.recipientRole || 'all';
            
            // Show if recipientId matches current user OR recipientRole matches
            const isForCurrentUser = recipientId === currentUserId;
            const isBroadcastForRole = !recipientId && (recipientRole === userRole || recipientRole === 'all');
            
            // Skip notifications with null timestamps (serverTimestamp hasn't resolved yet)
            if ((isForCurrentUser || isBroadcastForRole) && data.createdAt !== null) {
              allNotifications.set(doc.id, {
                _id: doc.id,
                type: data.type || 'info',
                recipientId: recipientId,
                recipientRole: data.recipientRole,
                title: data.title || '',
                message: data.message || '',
                assessmentId: data.assessmentId,
                assessmentTitle: data.assessmentTitle,
                assessmentType: data.assessmentType,
                courseId: data.courseId,
                courseCode: data.courseCode,
                courseName: data.courseName,
                createdById: data.createdById,
                createdByName: data.createdByName,
                submissionDeadline: data.submissionDeadline,
                scheduledTime: data.scheduledTime,
                duration: data.duration,
                read: data.read || false,
                actionType: data.actionType,
                createdAt: data.createdAt || data.timestamp || Timestamp.now(),
                timestamp: data.timestamp || data.createdAt || Timestamp.now()
              });
            }
          });
          updateNotificationState();
        },
        (error) => {
          console.error('❌ Firebase notification listener (recipientId) error:', error);
        }
      );
      unsubscribers.push(unsub1);

      // Query 2: Legacy notifications (userId field)
      const notificationsRef2 = collection(db, 'notifications');
      const q2 = query(
        notificationsRef2,
        where('userId', '==', currentUserId),
        orderBy('timestamp', 'desc')
      );

      const unsub2 = onSnapshot(q2, 
        (snapshot) => {
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            // Skip if already added from query 1, or if timestamp is null
            if (!allNotifications.has(doc.id) && (data.timestamp !== null || data.createdAt !== null)) {
              allNotifications.set(doc.id, {
                _id: doc.id,
                type: data.type || 'info',
                recipientId: data.userId,
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
                createdAt: data.timestamp || data.createdAt || Timestamp.now(),
                timestamp: data.timestamp || data.createdAt || Timestamp.now()
              });
            }
          });
          updateNotificationState();
        },
        (error) => {
          console.error('❌ Firebase notification listener (userId) error:', error);
        }
      );
      unsubscribers.push(unsub2);

      function updateNotificationState() {
        const notifArray = Array.from(allNotifications.values())
          .sort((a, b) => {
            const timeA = (a.createdAt as any)?.toDate ? (a.createdAt as any).toDate().getTime() : new Date(a.createdAt as string).getTime();
            const timeB = (b.createdAt as any)?.toDate ? (b.createdAt as any).toDate().getTime() : new Date(b.createdAt as string).getTime();
            return timeB - timeA;
          });
        
        setNotifications(notifArray);
        setUnreadCount(notifArray.filter(n => !n.read).length);
        setLoading(false);
      }

      return () => {
        unsubscribers.forEach(unsub => unsub());
      };
    } catch (error) {
      console.error('❌ Error setting up notification listener:', error);
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
    }
  }, [currentUserId]);

  // Fetch notifications manually (for compatibility)
  const fetchNotifications = useCallback(async () => {
    console.log('🔄 Manual fetch requested (using real-time listener instead)');
    // No-op since we're using real-time listener
  }, []);

  // Mark as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const notificationRef = doc(db, 'notifications', notificationId);
      await updateDoc(notificationRef, { read: true });
      console.log(`✅ Marked notification ${notificationId} as read`);
      
      // Update local state immediately for responsiveness
      setNotifications(prev =>
        prev.map(n => n._id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('❌ Failed to mark notification as read:', error);
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!currentUserId) return;
    
    try {
      const notificationsRef = collection(db, 'notifications');
      
      const q = query(
        notificationsRef,
        where('userId', '==', currentUserId),
        where('read', '==', false)
      );
      
      const snapshot = await getDocs(q);
      
      if (snapshot.docs.length === 0) {
        console.log('No unread notifications to mark');
        return;
      }

      const batch = writeBatch(db);
      snapshot.docs.forEach(document => {
        batch.update(document.ref, { read: true });
      });
      
      await batch.commit();
      console.log(`✅ Marked ${snapshot.docs.length} notifications as read`);
      
      // Update local state
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('❌ Failed to mark all notifications as read:', error);
    }
  }, [currentUserId]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', notificationId));

      // Update local state immediately for responsiveness
      setNotifications(prev => prev.filter(n => n._id !== notificationId));
      setUnreadCount(prev => {
        const wasUnread = notifications.find(n => n._id === notificationId && !n.read);
        return wasUnread ? Math.max(0, prev - 1) : prev;
      });
    } catch (error) {
      console.error('❌ Failed to delete notification:', error);
    }
  }, [notifications]);

  // Refresh notifications (no-op with real-time listener)
  const refreshNotifications = useCallback(async () => {
    console.log('🔄 Refresh requested (handled by real-time listener)');
    // No-op since we're using real-time listener
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        refreshNotifications
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};
