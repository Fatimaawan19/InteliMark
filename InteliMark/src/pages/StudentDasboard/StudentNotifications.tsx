import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../firebase';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { Bell, Clock, AlertCircle, Info, CheckCircle, ChevronLeft, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Notification = {
  id: string;
  type: string;
  title?: string;
  message?: string;
  description?: string;
  timestamp?: any;
  createdAt?: any;
  read?: boolean;
  recipientRole?: 'admin' | 'student' | 'teacher' | 'all';
  userId?: string;
  targetDegree?: string;
  actionType?: string;
};

const StudentNotifications: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [filter, setFilter] = useState<'all' | 'info' | 'success' | 'warning'>('all');

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      if (user) {
        // Fetch user data to get degree
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setUserData(userDoc.data());
        }
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    
    // Support both recipientId (backend) and userId (frontend) fields
    const allNotifications = new Map<string, Notification>();
    const unsubscribers: (() => void)[] = [];

    // Query 1: Backend assessment notifications (recipientId field)
    const q1 = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc')
    );
    
    const unsub1 = onSnapshot(q1, (snapshot) => {
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const recipientId = data.recipientId;
        const recipientRole = data.recipientRole || 'all';
        
        // Show if recipientId matches current user OR recipientRole is student/all
        const isForCurrentUser = recipientId === currentUser.uid;
        const isForStudent = recipientRole === 'student' || recipientRole === 'all';
        
        if (isForCurrentUser || (isForStudent && !recipientId)) {
          allNotifications.set(doc.id, {
            id: doc.id,
            type: data.type || '',
            title: data.title,
            message: data.message,
            description: data.description,
            timestamp: data.timestamp || data.createdAt,
            createdAt: data.createdAt,
            read: data.read,
            recipientRole: data.recipientRole,
            userId: data.userId || recipientId,
            targetDegree: data.targetDegree,
            ...data
          } as Notification);
        }
      });
      updateNotificationsList();
    });
    unsubscribers.push(unsub1);

    // Query 2: Frontend course notifications (userId field - legacy)
    const q2 = query(
      collection(db, 'notifications'),
      orderBy('timestamp', 'desc')
    );
    
    const unsub2 = onSnapshot(q2, (snapshot) => {
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const userId = data.userId;
        const recipientRole = data.recipientRole || 'all';
        const targetDegree = data.targetDegree;
        
        // Show if userId matches current user
        // Also check degree compatibility if specified
        const isForCurrentUser = userId === currentUser.uid;
        const isForStudent = recipientRole === 'student' || recipientRole === 'all';
        const isDegreeMatch = !targetDegree || targetDegree === userData?.degree;
        
        if ((isForCurrentUser || (isForStudent && !userId)) && isDegreeMatch) {
          allNotifications.set(doc.id, {
            id: doc.id,
            type: data.type || '',
            title: data.title,
            message: data.message,
            description: data.description,
            timestamp: data.timestamp,
            createdAt: data.createdAt || data.timestamp,
            read: data.read,
            recipientRole: data.recipientRole,
            userId: data.userId,
            targetDegree: data.targetDegree,
            ...data
          } as Notification);
        }
      });
      updateNotificationsList();
    });
    unsubscribers.push(unsub2);

    function updateNotificationsList() {
      const notifs = Array.from(allNotifications.values())
        .sort((a, b) => {
          const timeA = (a.timestamp || a.createdAt)?.toMillis?.() || 0;
          const timeB = (b.timestamp || b.createdAt)?.toMillis?.() || 0;
          return timeB - timeA;
        });
      setNotifications(notifs);
    }
    
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [currentUser, userData]);

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp?.toDate) return 'Just now';
    const date = timestamp.toDate();
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return '1 day ago';
    return date.toLocaleDateString();
  };

  const handleDeleteNotification = (notifId: string) => {
    // UI-only removal (do NOT delete from Firestore)
    setNotifications((prev) => prev.filter((n) => n.id !== notifId));
  };

  const handleNotificationClick = async (notif: Notification) => {
    // Mark as read (best effort)
    try {
      await updateDoc(doc(db, 'notifications', notif.id), { read: true });
    } catch (e) {
      // ignore
    }

    // Navigate to query page if this is a query-related notification
    if (notif.actionType === 'query_reply' || notif.actionType === 'query_resolved') {
      navigate('/student-query');
      return;
    }

    if (notif.type === 'course-material-uploaded' && (notif as any).externalCourseId) {
      navigate(`/student/courses?courseId=${encodeURIComponent((notif as any).externalCourseId)}`);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to clear notifications (UI only)?')) return;
    // UI-only clear (do NOT delete from Firestore)
    setNotifications([]);
  };

  const filteredNotifications = filter === 'all' 
    ? notifications 
    : notifications.filter(n => n.type === filter);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      {/* Header */}
      <div className="px-4 md:px-6 pt-8 pb-4 flex items-center gap-4 border-b bg-white/80 backdrop-blur-md shadow-sm">
        <Button 
          variant="ghost" 
          onClick={() => navigate(-1)}
          className="hover:bg-primary/10 transition-all p-2 rounded-lg"
        >
          <ChevronLeft className="h-5 w-5 text-gray-700" />
        </Button>
        <div className="flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" />
          <span className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            My Notifications
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Filter Buttons */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2">
            <Button 
              variant={filter === 'all' ? 'default' : 'outline'}
              onClick={() => setFilter('all')}
              size="sm"
            >
              All ({notifications.length})
            </Button>
            <Button 
              variant={filter === 'success' ? 'default' : 'outline'}
              onClick={() => setFilter('success')}
              size="sm"
            >
              Success ({notifications.filter(n => n.type === 'success').length})
            </Button>
            <Button 
              variant={filter === 'warning' ? 'default' : 'outline'}
              onClick={() => setFilter('warning')}
              size="sm"
            >
              Warnings ({notifications.filter(n => n.type === 'warning').length})
            </Button>
          </div>
          {notifications.length > 0 && (
            <Button 
              variant="destructive" 
              size="sm"
              onClick={handleClearAll}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          )}
        </div>

        {/* Notifications List */}
        <div className="space-y-3">
          {filteredNotifications.length === 0 ? (
            <Card className="border-0 shadow-xl">
              <CardContent className="py-16 text-center">
                <Bell className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">No notifications</p>
                <p className="text-sm text-gray-400 mt-1">You're all caught up!</p>
              </CardContent>
            </Card>
          ) : (
            filteredNotifications.map((notif) => (
              <Card 
                key={notif.id} 
                className={`border-l-4 hover:shadow-lg transition-all ${
                  notif.actionType === 'query_reply' || notif.actionType === 'query_resolved' ? 'cursor-pointer' : ''
                } ${
                  notif.type === 'warning' ? 'border-l-red-500 bg-red-50/50' :
                  notif.type === 'success' ? 'border-l-green-500 bg-green-50/50' :
                  notif.type === 'info' ? 'border-l-blue-500 bg-blue-50/50' :
                  'border-l-gray-500 bg-gray-50/50'
                }`}
                onClick={() => handleNotificationClick(notif)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`p-2 rounded-full ${
                        notif.type === 'warning' ? 'bg-red-100' :
                        notif.type === 'success' ? 'bg-green-100' :
                        notif.type === 'info' ? 'bg-blue-100' :
                        'bg-gray-100'
                      }`}>
                        {notif.type === 'warning' && <AlertCircle className="h-5 w-5 text-red-600" />}
                        {notif.type === 'success' && <CheckCircle className="h-5 w-5 text-green-600" />}
                        {notif.type === 'info' && <Info className="h-5 w-5 text-blue-600" />}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 mb-1">
                          {notif.title || 'Notification'}
                        </h3>
                        <p className="text-sm text-gray-600 mb-2">
                          {notif.message || notif.description || 'No description'}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(notif.timestamp || notif.createdAt)}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNotification(notif.id);
                      }}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentNotifications;