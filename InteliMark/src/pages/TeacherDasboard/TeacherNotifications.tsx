import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../firebase';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { Bell, Clock, AlertCircle, Info, CheckCircle, ChevronLeft, Trash2, BookOpen, UserPlus, Megaphone, Edit } from 'lucide-react';
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
  teacherId?: string;
};

const TeacherNotifications: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [filter, setFilter] = useState<'all' | 'info' | 'success' | 'warning'>('all');

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    
    console.log('📡 Setting up teacher notifications listener for:', currentUser.uid);
    
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
        
        // Show if recipientId matches current user OR broadcast to teachers
        const isForCurrentUser = recipientId === currentUser.uid;
        const isBroadcastForTeacher = !recipientId && (recipientRole === 'teacher' || recipientRole === 'all');
        
        if (isForCurrentUser || isBroadcastForTeacher) {
          allNotifications.set(doc.id, {
            id: doc.id,
            type: data.type || '',
            title: data.title,
            message: data.message,
            description: data.description,
            timestamp: data.createdAt || data.timestamp,
            createdAt: data.createdAt || data.timestamp,
            read: data.read,
            recipientRole: recipientRole,
            teacherId: data.teacherId,
            ...data
          } as Notification);
        }
      });
      updateNotificationState();
    }, (error) => {
      console.error('❌ Teacher notifications (recipientId) error:', error);
    });
    unsubscribers.push(unsub1);

    // Query 2: Legacy notifications (userId field)
    const q2 = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUser.uid),
      orderBy('timestamp', 'desc')
    );

    const unsub2 = onSnapshot(q2, (snapshot) => {
      snapshot.docs.forEach(doc => {
        if (!allNotifications.has(doc.id)) {
          const data = doc.data();
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
            teacherId: data.teacherId,
            ...data
          } as Notification);
        }
      });
      updateNotificationState();
    }, (error) => {
      console.error('❌ Teacher notifications (userId) error:', error);
    });
    unsubscribers.push(unsub2);

    function updateNotificationState() {
      const notifArray = Array.from(allNotifications.values())
        .sort((a, b) => {
          const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
          const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
          return timeB - timeA;
        });
      
      setNotifications(notifArray);
    }
    
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [currentUser]);

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
          onClick={() => navigate('/teacher-dashboard')}
          className="hover:bg-primary/10 transition-all p-2 rounded-lg"
        >
          <ChevronLeft className="h-5 w-5 text-gray-700" />
        </Button>
        <div className="flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" />
          <span className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            All Notifications
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
              variant={filter === 'info' ? 'default' : 'outline'}
              onClick={() => setFilter('info')}
              size="sm"
            >
              Info ({notifications.filter(n => n.type === 'info').length})
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
                  notif.type === 'warning' ? 'border-l-red-500 bg-red-50/50' :
                  notif.type === 'success' ? 'border-l-green-500 bg-green-50/50' :
                  notif.type === 'assessment-created' ? 'border-l-blue-500 bg-blue-50/50' :
                  notif.type === 'student-registered' ? 'border-l-purple-500 bg-purple-50/50' :
                  notif.type === 'announcement-created' ? 'border-l-orange-500 bg-orange-50/50' :
                  notif.type === 'course-updated' ? 'border-l-teal-500 bg-teal-50/50' :
                  'border-l-blue-500 bg-blue-50/50'
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`p-2 rounded-full ${
                        notif.type === 'warning' ? 'bg-red-100' :
                        notif.type === 'success' ? 'bg-green-100' :
                        notif.type === 'assessment-created' ? 'bg-blue-100' :
                        notif.type === 'student-registered' ? 'bg-purple-100' :
                        notif.type === 'announcement-created' ? 'bg-orange-100' :
                        notif.type === 'course-updated' ? 'bg-teal-100' :
                        'bg-blue-100'
                      }`}>
                        {notif.type === 'warning' && <AlertCircle className="h-5 w-5 text-red-600" />}
                        {notif.type === 'success' && <CheckCircle className="h-5 w-5 text-green-600" />}
                        {notif.type === 'info' && <Info className="h-5 w-5 text-blue-600" />}
                        {notif.type === 'assessment-created' && <BookOpen className="h-5 w-5 text-blue-600" />}
                        {notif.type === 'student-registered' && <UserPlus className="h-5 w-5 text-purple-600" />}
                        {notif.type === 'announcement-created' && <Megaphone className="h-5 w-5 text-orange-600" />}
                        {notif.type === 'course-updated' && <Edit className="h-5 w-5 text-teal-600" />}
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
                      onClick={() => handleDeleteNotification(notif.id)}
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

export default TeacherNotifications;
