import React, { useState } from 'react';
import { Bell, Check, CheckCheck, AlertCircle, BookOpen, Clock, Calendar, User, FileText, BarChart3, UserPlus, Megaphone, Edit, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications } from '@/context/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';

export const NotificationCenter: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, loading } = useNotifications();
  const [open, setOpen] = useState(false);

  // Filter notifications to show only last 24 hours in the icon dropdown
  const recentNotifications = notifications.filter(notif => {
    if (!notif.createdAt) return true; // Show if no timestamp
    try {
      const notifTime = (notif.createdAt as any)?.toDate 
        ? (notif.createdAt as any).toDate() 
        : new Date(notif.createdAt as string);
      const now = new Date();
      const hoursDiff = (now.getTime() - notifTime.getTime()) / (1000 * 60 * 60);
      return hoursDiff <= 24;
    } catch {
      return true;
    }
  });

  const recentUnreadCount = recentNotifications.filter(n => !n.read).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'assessment-created':
        return <BookOpen className="h-4 w-4" />;
      case 'assessment-updated':
      case 'assessment-published':
        return <Check className="h-4 w-4" />;
      case 'assessment_due_date_updated':
        return <Calendar className="h-4 w-4" />;
      case 'course-material-uploaded':
        return <FileText className="h-4 w-4" />;
      case 'student-registered':
        return <UserPlus className="h-4 w-4" />;
      case 'announcement-created':
        return <Megaphone className="h-4 w-4" />;
      case 'course-updated':
        return <Edit className="h-4 w-4" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getNotificationColor = (type: string, read: boolean) => {
    if (read) return 'bg-gray-50';
    
    switch (type) {
      case 'assessment-created':
        return 'bg-blue-50 border-l-4 border-l-blue-500';
      case 'assessment-updated':
        return 'bg-yellow-50 border-l-4 border-l-yellow-500';
      case 'assessment-published':
        return 'bg-green-50 border-l-4 border-l-green-500';
      case 'assessment_due_date_updated':
        return 'bg-amber-50 border-l-4 border-l-amber-500';
      case 'course-material-uploaded':
        return 'bg-indigo-50 border-l-4 border-l-indigo-500';
      case 'student-registered':
        return 'bg-purple-50 border-l-4 border-l-purple-500';
      case 'announcement-created':
        return 'bg-orange-50 border-l-4 border-l-orange-500';
      case 'course-updated':
        return 'bg-teal-50 border-l-4 border-l-teal-500';
      case 'warning':
        return 'bg-red-50 border-l-4 border-l-red-500';
      default:
        return 'bg-gray-50';
    }
  };

  const handleNotificationClick = async (notification: any) => {
    if (!notification.read) {
      await markAsRead(notification._id);
    }
    // Navigate to query page if this is a query-related notification
    if (notification.actionType === 'query_reply' || notification.actionType === 'query_resolved') {
      setOpen(false);
      navigate('/student-query');
    }

    // Course material uploaded -> open Courses & Materials page for that course
    if (notification.type === 'course-material-uploaded' && notification.externalCourseId) {
      setOpen(false);
      navigate(`/student/courses?courseId=${encodeURIComponent(notification.externalCourseId)}`);
    }
  };

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        className="relative hover:bg-primary/10"
      >
        <Bell className="h-5 w-5 text-gray-600" />
        {recentUnreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
          >
            {recentUnreadCount > 99 ? '99+' : recentUnreadCount}
          </Badge>
        )}
      </Button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Notifications (Last 24h)</h3>
            {recentUnreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="text-xs text-primary hover:text-primary/70"
              >
                Mark all as read
              </Button>
            )}
          </div>

          {/* Notifications List */}
          <ScrollArea className="h-96">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin h-5 w-5 text-primary" />
              </div>
            ) : recentNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <Bell className="h-8 w-8 mb-2" />
                <p className="text-sm">No recent notifications</p>
                <p className="text-xs mt-1">from the last 24 hours</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentNotifications.map((notification) => (
                  <div
                    key={notification._id}
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      'p-3 cursor-pointer hover:bg-gray-100 transition-colors',
                      getNotificationColor(notification.type, notification.read)
                    )}
                  >
                    <div className="flex gap-3">
                      {/* Icon */}
                      <div className="flex-shrink-0 mt-1">
                        <div className={cn(
                          'h-8 w-8 rounded-full flex items-center justify-center',
                          notification.type === 'assessment-created' ? 'bg-blue-100 text-blue-600' : 
                          notification.type === 'assessment-updated' ? 'bg-yellow-100 text-yellow-600' :
                          notification.type === 'assessment_due_date_updated' ? 'bg-amber-100 text-amber-700' :
                          notification.type === 'course-material-uploaded' ? 'bg-indigo-100 text-indigo-600' :
                          notification.type === 'student-registered' ? 'bg-purple-100 text-purple-600' :
                          notification.type === 'announcement-created' ? 'bg-orange-100 text-orange-600' :
                          notification.type === 'course-updated' ? 'bg-teal-100 text-teal-600' :
                          notification.type === 'warning' ? 'bg-red-100 text-red-600' :
                          'bg-green-100 text-green-600'
                        )}>
                          {getNotificationIcon(notification.type)}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={cn(
                              'text-sm',
                              notification.read ? 'text-gray-600 font-normal' : 'text-gray-900 font-semibold'
                            )}>
                              {notification.title}
                            </p>
                            {/* Assessment Type Badge */}
                            {notification.assessmentType && (
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "text-xs",
                                  notification.assessmentType === 'Assignment' 
                                    ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                    : 'bg-purple-50 text-purple-700 border-purple-200'
                                )}
                              >
                                {notification.assessmentType === 'Assignment' ? (
                                  <FileText className="h-3 w-3 mr-1" />
                                ) : (
                                  <BarChart3 className="h-3 w-3 mr-1" />
                                )}
                                {notification.assessmentType}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {!notification.read && (
                              <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-gray-400 hover:text-red-600 hover:bg-red-50"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                deleteNotification(notification._id);
                              }}
                              aria-label="Delete notification"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        {/* Main Message */}
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        
                        {/* Assessment Details */}
                        <div className="mt-2 space-y-1">
                          {/* Teacher Name */}
                          {notification.createdByName && (
                            <div className="flex items-center gap-1.5 text-xs text-gray-600">
                              <User className="h-3 w-3 text-gray-400" />
                              <span className="font-medium">{notification.createdByName}</span>
                            </div>
                          )}
                          
                          {/* Course */}
                          {notification.courseName && (
                            <div className="flex items-center gap-1.5 text-xs text-gray-600">
                              <BookOpen className="h-3 w-3 text-gray-400" />
                              <span>{notification.courseCode ? `${notification.courseCode} - ` : ''}{notification.courseName}</span>
                            </div>
                          )}
                          
                          {/* Deadline */}
                          {notification.submissionDeadline && (
                            <div className="flex items-center gap-1.5 text-xs text-orange-600 font-medium">
                              <Calendar className="h-3 w-3" />
                              <span>Due: {(() => {
                                try {
                                  const deadline = new Date(notification.submissionDeadline);
                                  return format(deadline, 'MMM dd, yyyy - h:mm a');
                                } catch {
                                  return notification.submissionDeadline;
                                }
                              })()}</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Notification Timestamp */}
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                          <Clock className="h-3 w-3 flex-shrink-0" />
                          <span className="text-gray-500 font-medium whitespace-nowrap">
                            {(() => {
                              try {
                                const timestamp = notification.createdAt || notification.timestamp;
                                
                                // Handle case where serverTimestamp hasn't resolved yet
                                if (!timestamp || timestamp === null || timestamp === undefined) {
                                  console.log('⚠️ No timestamp for:', notification.title);
                                  return 'Just now';
                                }
                                
                                let date;
                                if (typeof (timestamp as any)?.toDate === 'function') {
                                  date = (timestamp as any).toDate();
                                } else if (timestamp instanceof Date) {
                                  date = timestamp;
                                } else if (typeof timestamp === 'string') {
                                  date = new Date(timestamp);
                                } else if (typeof timestamp === 'number') {
                                  date = new Date(timestamp);
                                } else {
                                  console.warn('⚠️ Unknown timestamp format:', typeof timestamp);
                                  return 'Just now';
                                }
                                
                                // Validate the date
                                if (!date || isNaN(date.getTime())) {
                                  console.warn('⚠️ Invalid date');
                                  return 'Just now';
                                }
                                
                                const result = formatDistanceToNow(date, { addSuffix: true });
                                return result;
                              } catch (error) {
                                console.error('❌ Error formatting time:', error);
                                return 'Just now';
                              }
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          {recentNotifications.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 text-center">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-primary hover:text-primary/70"
                onClick={() => {
                  setOpen(false);
                  // Can navigate to full notifications page if needed
                }}
              >
                View all notifications (including older)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
