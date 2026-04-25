import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Brain, Users, BookOpen, Award, Database, Bell, Settings, LogOut, FileText, Lock, AlertCircle, CheckCircle, Info, Activity, Menu, MessageSquare, ChevronRight, User, Mail, Hash, Send, Clock, Plus } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltipContent, ChartLegendContent } from "@/components/ui/chart";
import { db } from '../../firebase';
import { collection, onSnapshot, query, where, getDocs, limit, orderBy, updateDoc, doc, addDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { auth } from '../../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";

const AdminDashboard: React.FC = () => {  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  // Filter notifications to show only last 24 hours in dashboard
  const recentNotifications = notifications.filter(notif => {
    if (!notif.timestamp) return true; // Show if no timestamp
    const notifTime = notif.timestamp instanceof Date ? notif.timestamp : notif.timestamp.toDate?.() || new Date(notif.timestamp);
    const now = new Date();
    const hoursDiff = (now.getTime() - notifTime.getTime()) / (1000 * 60 * 60);
    return hoursDiff <= 24;
  });
  // Real-time queries
  const [recentQueries, setRecentQueries] = useState<any[]>([]);
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [selectedQuery, setSelectedQuery] = useState<any>(null);
  const [replyMessage, setReplyMessage] = useState('');

  // Real-time data states
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalCourses, setTotalCourses] = useState(0);
  const [totalAssessments, setTotalAssessments] = useState(0);
  const [storageUsage, setStorageUsage] = useState(0);
  const [systemPerformance, setSystemPerformance] = useState({ percent: 98, responseTime: 0 });  
  const [adminName, setAdminName] = useState('Admin');
  const [adminEmail, setAdminEmail] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);  const [sessionTime, setSessionTime] = useState(0); // Time in seconds
  const [weeklyTimeData, setWeeklyTimeData] = useState([
    { day: 'Mon', time: 0 },
    { day: 'Tue', time: 0 },
    { day: 'Wed', time: 0 },
    { day: 'Thu', time: 0 },
    { day: 'Fri', time: 0 },
    { day: 'Sat', time: 0 },
    { day: 'Sun', time: 0 },
  ]);
  
  // Get current day index (0 = Monday, 6 = Sunday)
  const getCurrentDayIndex = () => {
    const today = new Date().getDay();
    // Convert Sunday (0) to index 6, and shift other days by -1
    return today === 0 ? 6 : today - 1;
  };
  const [securityActivities, setSecurityActivities] = useState<any[]>([]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);

  // Fetch users in real-time
  useEffect(() => {
    const usersCol = collection(db, 'users');
    const q = query(usersCol, where('role', '!=', 'admin'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTotalUsers(snapshot.size);
    });

    return () => unsubscribe();
  }, []);

  // Fetch courses in real-time
  useEffect(() => {
    const coursesCol = collection(db, 'courses');
    
    const unsubscribe = onSnapshot(coursesCol, (snapshot) => {
      setTotalCourses(snapshot.size);
    });

    return () => unsubscribe();
  }, []);

  // Fetch assessments count (published with PDFs)
  useEffect(() => {
    const fetchAssessments = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/assessments/all?status=published');
        const data = await response.json();
        if (data.success && data.assessments) {
          // Count only assessments with PDFs
          const assessmentsWithPdfs = data.assessments.filter(
            (a: any) => a.assessmentPdfFile && a.pdfUrl
          ).length;
          setTotalAssessments(assessmentsWithPdfs);
        }
      } catch (error) {
        console.warn('Could not fetch assessments count:', error);
      }
    };

    fetchAssessments();
    // Refresh assessments every 30 seconds
    const interval = setInterval(fetchAssessments, 30000);
    return () => clearInterval(interval);
  }, []);
  
  // Calculate storage usage in real-time
  useEffect(() => {
    const calculateStorage = () => {
      const totalDocuments = totalUsers + totalCourses + totalAssessments;
      const maxDocuments = 1000; // Set your storage limit (e.g., 1000 documents)
      
      const percentage = Math.round((totalDocuments / maxDocuments) * 100);
      setStorageUsage(Math.min(percentage, 100)); // Cap at 100%
    };
    
    calculateStorage();
  }, [totalUsers, totalCourses, totalAssessments]);
  // Measure system performance in real-time
  useEffect(() => {
    const measureSystemHealth = async () => {
      const startTime = performance.now();
      
      try {
        // Test database responsiveness
        await getDocs(query(collection(db, 'users'), limit(1)));
        const endTime = performance.now();
        const responseTime = Math.round(endTime - startTime);
        
        // Base score on response time
        let perfScore = 100;
        if (responseTime > 500) perfScore = 60;
        else if (responseTime > 300) perfScore = 75;
        else if (responseTime > 150) perfScore = 85;
        else if (responseTime > 100) perfScore = 95;
        
        // Adjust based on storage health
        if (storageUsage > 90) perfScore -= 15;
        else if (storageUsage > 80) perfScore -= 10;
        else if (storageUsage > 70) perfScore -= 5;
        
        setSystemPerformance({ 
          percent: Math.max(perfScore, 50), 
          responseTime 
        });
      } catch (error) {
        setSystemPerformance({ percent: 40, responseTime: 0 });
      }
    };
    
    // Measure immediately on mount
    measureSystemHealth();
    
    // Then measure every 30 seconds
    const interval = setInterval(measureSystemHealth, 30000);
    
    return () => clearInterval(interval);
  }, [storageUsage]);
  // Fetch admin user data in real-time based on currently logged-in user
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUserId(user.uid);
        
        // Create greeting notification for the admin
        const createGreetingNotification = async () => {
          try {
            console.log('Creating greeting notification for admin:', user.uid);
            
            // First, delete any old greeting notifications from previous sessions
            try {
              const oldGreetings = query(
                collection(db, 'notifications'),
                where('recipientId', '==', user.uid),
                where('type', '==', 'greeting')
              );
              const oldGreetingsDocs = await getDocs(oldGreetings);
              
              // Delete all old greeting notifications
              for (const doc of oldGreetingsDocs.docs) {
                await deleteDoc(doc.ref);
              }
              console.log('🗑️ Deleted old greeting notifications');
            } catch (deleteError) {
              console.warn('Could not delete old greetings:', deleteError);
            }
            
            const greetingMessages = [
              `Welcome back! You have full control over the InteliMark platform. Ready to manage courses and track student progress?`,
              `Hello again! Your admin dashboard is fully operational. Check out the latest student submissions and system metrics.`,
              `Great to see you! Everything is running smoothly. Review recent activities and manage your platform efficiently.`,
              `Welcome to your command center! Monitor platform performance, manage courses, and oversee student assessments.`
            ];
            
            const randomGreeting = greetingMessages[Math.floor(Math.random() * greetingMessages.length)];
            
            const notifRef = await addDoc(collection(db, 'notifications'), {
              recipientId: user.uid,
              userId: user.uid,
              title: '👋 Welcome, Admin!',
              message: randomGreeting,
              description: randomGreeting,
              type: 'greeting',
              createdAt: Timestamp.now(),
              timestamp: Timestamp.now(),
              read: false,
              recipientRole: 'admin'
            });
            
            console.log('✅ Greeting notification created:', notifRef.id);
          } catch (error) {
            console.error('Error creating greeting notification:', error);
          }
        };
        
        createGreetingNotification();
        
        // Fetch user data from Firestore in real-time
        const userDocRef = doc(db, 'users', user.uid);
        const unsubscribeDoc = onSnapshot(userDocRef, (docSnapshot) => {
          if (docSnapshot.exists()) {
            const userData = docSnapshot.data();
            setAdminName(userData.name || 'Admin');
            setAdminEmail(userData.email || user.email || '');
          } else {
            // If no user doc in Firestore, use auth email
            setAdminName(user.email?.split('@')[0] || 'Admin');
            setAdminEmail(user.email || '');
          }
        });

        return () => unsubscribeDoc();
      } else {
        // No user logged in, redirect to login
        navigate('/');
      }
    });

    return () => unsubscribe();
  }, [navigate]);
  // Fetch recent queries in real-time (only new and in-progress)
  useEffect(() => {
    const q = query(
      collection(db, "queries"), 
      orderBy("timestamp", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allQueries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Filter to show only new and in-progress queries, limit to 3
      const activeQueries = allQueries
        .filter((q: any) => q.status === 'new' || q.status === 'in-progress')
        .slice(0, 3);
      setRecentQueries(activeQueries);
    });
    return () => unsubscribe();  }, []);  
  // Fetch notifications from Firestore with dual-query (admin notifications)
  useEffect(() => {
    if (!currentUserId) return;

    const allNotifications = new Map<string, any>();
    const unsubscribers: (() => void)[] = [];

    // Query 1: Notifications using createdAt
    const q1 = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc')
    );

    const unsub1 = onSnapshot(q1, (snapshot) => {
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const recipientId = data.recipientId;
        const recipientRole = data.recipientRole || 'all';
        
        // Match explicit recipient or admin role broadcasts
        const isForCurrentUser = recipientId === currentUserId;
        const isAdminRoleBroadcast = !recipientId && (recipientRole === 'admin' || recipientRole === 'all');
        
        if (isForCurrentUser || isAdminRoleBroadcast) {
          const timestamp = data.createdAt || data.timestamp;
          const title = data.title || data.message || 'New Notification';
          allNotifications.set(doc.id, {
            ...data,
            // Ensure the Firestore document id is not overridden by payload fields.
            id: doc.id,
            title: title,
            description: data.description || '',
            time: formatTimestamp(timestamp),
            timestamp: timestamp || new Date(),
            type: data.type || 'info',
            read: data.read || false,
            recipientRole: recipientRole,
          });
        }
      });
      updateNotificationState();
    });
    unsubscribers.push(unsub1);

    // Query 2: Legacy notifications using timestamp
    const q2 = query(
      collection(db, 'notifications'),
      orderBy('timestamp', 'desc')
    );

    const unsub2 = onSnapshot(q2, (snapshot) => {
      snapshot.docs.forEach(doc => {
        if (!allNotifications.has(doc.id)) {
          const data = doc.data();
          const userId = data.userId;
          const recipientRole = data.recipientRole || 'all';
          const isForCurrentUser = userId === currentUserId;
          const isAdminRoleBroadcast = !userId && (recipientRole === 'admin' || recipientRole === 'all');
          const timestamp = data.timestamp || data.createdAt;
          const title = data.title || data.message || 'New Notification';

          if (isForCurrentUser || isAdminRoleBroadcast) {
            allNotifications.set(doc.id, {
              ...data,
              // Ensure the Firestore document id is not overridden by payload fields.
              id: doc.id,
              title: title,
              description: data.description || '',
              time: formatTimestamp(timestamp),
              timestamp: timestamp || new Date(),
              type: data.type || 'info',
              read: data.read || false,
              recipientRole: recipientRole,
            });
          }
        }
      });
      updateNotificationState();
    });
    unsubscribers.push(unsub2);

    function updateNotificationState() {
      const notifArray = Array.from(allNotifications.values())
        .sort((a, b) => {
          const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp).getTime();
          const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp).getTime();
          return timeB - timeA;
        });
      
      setNotifications(notifArray);
    }

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [currentUserId]);
    // Fetch recent platform activities (ONLY course registrations)
  useEffect(() => {
    const thirtyMinsAgo = new Date();
    thirtyMinsAgo.setMinutes(thirtyMinsAgo.getMinutes() - 30);
    
    const q = query(
      collection(db, 'activities'),
      where('timestamp', '>', Timestamp.fromDate(thirtyMinsAgo)),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activities = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((activity: any) => ['course_registration', 'submission-created'].includes(activity.type));
      setRecentActivities(activities);
    });

    return () => unsubscribe();
  }, []);
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
    return `${diffDays} days ago`;
  };

  const handleDeleteNotification = async (notifId: string) => {
    try {
      console.log('🗑️ Deleting notification:', notifId);
      await deleteDoc(doc(db, 'notifications', notifId));
      console.log('✅ Notification deleted successfully');
    } catch (error) {
      console.error('❌ Error deleting notification:', error);
    }
  };

  const handleClearAllNotifications = async () => {
    if (recentNotifications.length === 0) return;
    try {
      await Promise.all(
        recentNotifications.map((notif) => deleteDoc(doc(db, 'notifications', notif.id)))
      );
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'new': return 'bg-blue-100 text-blue-700';
      case 'in-progress': return 'bg-yellow-100 text-yellow-700';
      case 'resolved': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  // Handle Reply from Dashboard (Quick Reply - keeps query open)
  const handleQuickReply = async () => {
    if (!replyMessage.trim() || !selectedQuery) {
      alert('Please enter a reply message');
      return;
    }

    if (!selectedQuery.studentId) {
      alert('Student information is missing for this query');
      return;
    }

    try {
      const queryRef = doc(db, 'queries', selectedQuery.id);
      await updateDoc(queryRef, {
        response: replyMessage,
        status: 'in-progress',
        responseSeenByStudent: false,
        responseSeenAt: null
      });
      // Add notification for student
      await addDoc(collection(db, 'notifications'), {
        recipientId: selectedQuery.studentId,
        userId: selectedQuery.studentId,
        title: 'New reply to your query',
        message: `Admin replied to your query: "${selectedQuery.subject}" (Still open for follow-ups)`,
        type: 'info',
        createdAt: Timestamp.now(),
        timestamp: Timestamp.now(),
        read: false,
        recipientRole: 'student',
        actionType: 'query_reply'
      });

      setReplyMessage('');
      setReplyModalOpen(false);
      setSelectedQuery(null);
      alert('Reply sent successfully! Query remains open for follow-ups.');
    } catch (error) {
      console.error('Error sending reply:', error);
      alert('Failed to send reply');
    }
  };

  // Generate initials from admin name
  const getInitials = (name: string) => {
    if (!name) return "AD";
    let displayName = name;
    // If name looks like an email prefix (e.g., asim.noor), convert to 'Asim Noor'
    if (displayName.includes("@")) {
      displayName = displayName.split("@")[0];
    }
    if (displayName.includes(".")) {
      displayName = displayName
        .split(".")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }
    const names = displayName.split(" ").filter(Boolean);
    if (names.length >= 2) {
      return (names[0][0] + names[names.length - 1][0]).toUpperCase();
    }
    return displayName.substring(0, 2).toUpperCase();
  };    // Track session time in real-time
  useEffect(() => {
    const startTime = Date.now();
    
    // Update session time every second
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setSessionTime(elapsed);
      
      // Update today's data in weekly chart dynamically
      const todayMinutes = Math.floor(elapsed / 60);
      const currentDayIndex = getCurrentDayIndex();
      
      setWeeklyTimeData(prev => {
        const updated = [...prev];
        updated[currentDayIndex] = { ...updated[currentDayIndex], time: todayMinutes };
        return updated;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // Format time display (hours and minutes)
  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    } else {
      return `${mins}m`;
    }
  };

  // Calculate weekly average
  const calculateAverage = () => {
    const total = weeklyTimeData.reduce((sum, day) => sum + day.time, 0);
    return Math.floor(total / 7);
  };

  const openTab = (tab: string) => {
    // navigate to internal admin pages for each action
    switch (tab) {
      case 'user-management':
        navigate('/admin/users');
        break;
      case 'course-management':
        navigate('/admin/courses');
        break;
      case 'assignments':
        navigate('/admin/assignments');
        break;
      case 'security':
        navigate('/admin/security');
        break;
      case 'notifications':
        navigate('/admin/notifications');
        break;
      default:
        navigate('/admin-dashboard');
    }
  };

  const scrollToId = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const stats = { students: 468, courses: 24, awards: 12, storage: 67 };
  const systemPerf = { percent: 98, label: 'Uptime', meta: 'Avg response 120ms' };
  const studentsBreakdown = [
    { name: "2020", value: 1200, color: "#60a5fa" },
    { name: "2021", value: 1250, color: "#34d399" },
    { name: "2022", value: 1300, color: "#f59e0b" },
    { name: "2023", value: 1350, color: "#7c3aed" },
  ];
  const totalStudents = studentsBreakdown.reduce((s, it) => s + it.value, 0);
  const recentSlice = studentsBreakdown[studentsBreakdown.length - 1];
  const recentPercent = Math.round((recentSlice.value / totalStudents) * 100);

  return (
    <div className="min-h-screen bg-secondary/20">
      <header className="sticky top-0 z-50 bg-white shadow-md border-b border-primary/10">          <div className="w-full px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSidebarOpen((s) => !s)} 
              className="p-2 hover:bg-gray-100 rounded-lg transition-all" 
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6 text-gray-800" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                InteliMark
              </span>
              <Brain className="h-6 w-6 text-primary" />
            </div>
            <div className="hidden md:flex flex-col ml-4 border-l border-gray-300 pl-4">
              <h2 className="text-lg font-semibold text-gray-800">
                Welcome back, {adminName}!
              </h2>
              <p className="text-xs text-gray-600">Have a great day managing your platform</p>
            </div>          </div>          <div className="flex items-center gap-4 pr-6 relative">
            <div className="relative">
              <button 
                onClick={() => setNotificationsOpen((s) => !s)} 
                aria-label="Notifications" 
                className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Bell className="h-5 w-5 text-primary transition-all hover:scale-110" />
                {recentNotifications.length > 0 && (
                  <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-semibold">
                    {recentNotifications.length > 9 ? '9+' : recentNotifications.length}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-96 z-50 shadow-2xl rounded-xl border-2">
                  <Card className="rounded-xl border-0 bg-white">
                    {/* Header */}
                    <CardHeader className="border-b bg-gradient-to-r from-primary/10 to-primary/5 px-4 py-4 rounded-t-xl">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 bg-primary/20 rounded-lg">
                            <Bell className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <span className="text-base font-bold text-gray-900">Notifications</span>
                            {recentNotifications.length > 0 && (
                              <span className="ml-2 px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-semibold">
                                {recentNotifications.length}
                              </span>
                            )}
                            <p className="text-xs text-gray-500 mt-0.5">Last 24 hours</p>
                          </div>
                        </div>
                        {notifications.length > 0 && (
                          <button 
                            onClick={handleClearAllNotifications}
                            className="text-sm text-red-600 hover:underline font-medium"
                          >
                            Clear all
                          </button>
                        )}
                      </div>
                    </CardHeader>
                    {/* Notifications List */}
                    <CardContent className="p-0">
                      <div className="relative">
                        <div className="max-h-[400px] overflow-y-auto pb-16">
                          {recentNotifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 px-4">
                              <div className="p-4 bg-gray-100 rounded-full mb-3">
                                <Bell className="h-8 w-8 text-gray-400" />
                              </div>
                              <p className="text-sm text-muted-foreground">No new notifications</p>
                              <p className="text-xs text-gray-400 mt-1">in the last 24 hours</p>
                            </div>
                          ) : (
                            <div className="p-3 space-y-2">
                              {recentNotifications.map((n) => (
                                <div 
                                  key={n.id} 
                                  className="rounded-lg p-3 flex items-start gap-3 bg-white border border-gray-200 hover:border-primary/50 transition-all cursor-pointer shadow-sm hover:shadow-md group"
                                >
                                  <div className={`h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-full ${
                                    n.type === 'warning' ? 'bg-red-100' : n.type === 'greeting' ? 'bg-green-100' : 'bg-blue-100'
                                  }`}>
                                    {n.type === 'warning' ? (
                                      <AlertCircle className="h-5 w-5 text-red-600" />
                                    ) : n.type === 'greeting' ? (
                                      <CheckCircle className="h-5 w-5 text-green-600" />
                                    ) : (
                                      <Info className="h-5 w-5 text-blue-600" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-gray-900 text-sm mb-1">
                                      {n.title}
                                    </div>
                                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {n.time}
                                    </div>
                                  </div>
                                  <button 
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleDeleteNotification(n.id);
                                    }}
                                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-transparent rounded cursor-pointer"
                                    aria-label="Remove notification"
                                  >
                                    <span className="text-red-500 hover:text-red-700 text-lg leading-none">×</span>
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        {/* View All Button - Fixed at bottom */}
                        {recentNotifications.length > 0 && (
                          <div className="absolute left-0 right-0 bottom-0 p-3 bg-gradient-to-t from-white via-white to-transparent">
                            <Button 
                              size="sm"
                              className="w-full bg-primary hover:bg-primary/90 text-white font-semibold shadow-lg"
                              onClick={() => navigate('/admin/notifications')}
                            >
                              View All Notifications
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed top-0 left-0 h-full w-60 z-50 bg-gradient-to-b from-white to-gray-50 shadow-2xl p-6 flex flex-col items-center">
            <div className="flex flex-col items-center gap-3 w-full bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg p-4 mb-4">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-lg">{getInitials(adminName)}</span>
              </div>
              <div className="text-center">
                <h3 className="text-sm font-bold text-gray-900">{adminName}</h3>
                <p className="text-xs text-primary font-medium">Admin</p>
              </div>
            </div>            <nav className="mt-6 flex-1 w-full">
              <ul className="flex flex-col gap-2 items-stretch">
                <li>
                  <button 
                    onClick={() => { navigate('/admin-dashboard'); setSidebarOpen(false); }}
                    className="w-full px-4 py-3 text-center rounded-xl text-gray-700 hover:bg-primary hover:text-white transition-all font-medium"
                  >
                    Dashboard
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => { navigate('/admin/users'); setSidebarOpen(false); }}
                    className="w-full px-4 py-3 text-center rounded-xl text-gray-700 hover:bg-primary hover:text-white transition-all font-medium"
                  >
                    User Management
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => { navigate('/admin/courses'); setSidebarOpen(false); }}
                    className="w-full px-4 py-3 text-center rounded-xl text-gray-700 hover:bg-primary hover:text-white transition-all font-medium"
                  >
                    Course Management
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => { navigate('/admin/database'); setSidebarOpen(false); }}
                    className="w-full px-4 py-3 text-center rounded-xl text-gray-700 hover:bg-primary hover:text-white transition-all font-medium"
                  >
                    Database
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => { navigate('/generate-report'); setSidebarOpen(false); }}
                    className="w-full px-4 py-3 text-center rounded-xl text-gray-700 hover:bg-primary hover:text-white transition-all font-medium"
                  >
                    Reports
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => { navigate('/admin/security'); setSidebarOpen(false); }}
                    className="w-full px-4 py-3 text-center rounded-xl text-gray-700 hover:bg-primary hover:text-white transition-all font-medium"
                  >
                    Security
                  </button>
                </li>
              </ul>
            </nav>

            {/* Logout Button */}
            <div className="mt-auto pt-4 border-t w-full">
              <button 
                onClick={async () => { 
                  // Delete greeting notification on logout
                  try {
                    const greetingNotifs = query(
                      collection(db, 'notifications'),
                      where('recipientId', '==', currentUserId),
                      where('type', '==', 'greeting')
                    );
                    const greetingDocs = await getDocs(greetingNotifs);
                    
                    for (const doc of greetingDocs.docs) {
                      await deleteDoc(doc.ref);
                    }
                    console.log('🗑️ Greeting notifications deleted on logout');
                  } catch (error) {
                    console.error('Error deleting greeting notification on logout:', error);
                  }
                  
                  await signOut(auth); 
                  navigate('/'); 
                  setSidebarOpen(false); 
                }}
                className="flex items-center justify-center gap-3 w-full px-4 py-3 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-xl transition-all font-semibold"
              >
                <LogOut className="h-5 w-5" />
                Logout
              </button>
            </div>
          </aside>
        </>
      )}
      <main className="flex w-full p-4 md:px-6 gap-6">
        <section className="flex-1">
          <div className="max-w-[1000px] mx-auto">
            <div id="kpis" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">{/* Total Users */}
            <Card className="group relative overflow-hidden border-2 border-gray-900 hover:border-emerald-400 transform hover:-translate-y-1 transition-transform duration-150 ease-out hover:shadow-2xl hover:ring-1 hover:ring-emerald-400/80">
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-emerald-400/16 via-transparent to-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              <CardContent className="flex flex-col items-center gap-3 py-3 relative">
                <div className="p-2 bg-emerald-50 rounded-lg group-hover:bg-emerald-300 transition-colors"><Users className="h-5 w-5 text-emerald-800" /></div>
                <p className="text-sm font-bold">Total Users</p>
                <div className="text-2xl font-bold">{totalUsers}</div>
                <div className="text-xs text-muted-foreground">Active users</div>
              </CardContent>
            </Card>

            {/* Total Courses */}
            <Card className="group relative overflow-hidden border-2 border-gray-900 hover:border-sky-400 transform hover:-translate-y-1 transition-transform duration-150 ease-out hover:shadow-2xl hover:ring-1 hover:ring-sky-400/80">
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-sky-400/16 via-transparent to-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              <CardContent className="flex flex-col items-center gap-3 py-3 relative">
                <div className="p-2 bg-sky-50 rounded-lg group-hover:bg-sky-300 transition-colors"><BookOpen className="h-5 w-5 text-sky-800" /></div>
                <p className="text-sm font-bold">Total Courses</p>
                <div className="text-2xl font-bold">{totalCourses}</div>
                <div className="text-xs text-muted-foreground">Published courses</div>
              </CardContent>
            </Card>            {/* Overall System Performance */}
            <Card className="group relative overflow-hidden border-2 border-gray-900 hover:border-amber-400 transform hover:-translate-y-1 transition-transform duration-150 ease-out hover:shadow-2xl hover:ring-1 hover:ring-amber-400/80">
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-amber-400/16 via-transparent to-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              <CardContent className="flex flex-col items-center gap-3 py-3 relative">
                <div className="p-2 bg-amber-50 rounded-lg group-hover:bg-amber-300 transition-colors"><Activity className="h-5 w-5 text-amber-800" /></div>
                <p className="text-sm font-bold">Overall System Performance</p>
                <div className="text-2xl font-bold">{systemPerformance.percent}%</div>
                <div className="w-full">
                  <Progress value={systemPerformance.percent} className="h-2 rounded-full" />
                  <div className="text-xs text-muted-foreground mt-1">
                    {systemPerformance.responseTime > 0 ? `Avg response ${systemPerformance.responseTime}ms` : 'Measuring...'}
                  </div>
                </div>
              </CardContent>
            </Card>{/* Storage Used */}
            <Card className="group relative overflow-hidden border-2 border-gray-900 hover:border-violet-400 transform hover:-translate-y-1 transition-transform duration-150 ease-out hover:shadow-2xl hover:ring-1 hover:ring-violet-400/80">
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-violet-400/16 via-transparent to-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              <CardContent className="flex flex-col items-center gap-3 py-3 relative">
                <div className="p-2 bg-violet-50 rounded-lg group-hover:bg-violet-300 transition-colors"><Database className="h-5 w-5 text-violet-800" /></div>
                <p className="text-sm font-bold">Storage Used</p>
                <div className="text-2xl font-bold">{storageUsage}%</div>
                <div className="w-full">
                  <Progress value={storageUsage} className="h-2 rounded-full" />
                  <div className="text-xs text-muted-foreground mt-1">{storageUsage}% of quota</div>
                </div>
              </CardContent>
            </Card>          </div>{/* Dashboard widgets: charts + lists */}          <div className="mb-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">              <Card className="border-0 shadow-xl overflow-hidden bg-gradient-to-br from-purple-50 to-white">
                <CardHeader className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    <span>Academic Performance</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="p-4 bg-primary/10 rounded-full mb-4">
                      <Award className="h-12 w-12 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Coming Soon...</h3>
                    <p className="text-sm text-gray-500 text-center max-w-sm">
                      Academic performance analytics will be available once assignments are graded and submitted.
                    </p>
                  </div>
                </CardContent>
              </Card><Card className="border-0 shadow-xl overflow-hidden bg-gradient-to-br from-purple-50 to-white">
                <CardHeader className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white pb-4">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Screen Time
                    </span>
                    <span className="text-sm font-normal bg-white/20 px-3 py-1 rounded-full">
                      Live
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  {/* Real-Time Timer Display */}
                  <div className="text-center mb-4 pb-4 border-b-2 border-purple-100">
                    <p className="text-xs text-purple-600 font-semibold mb-1 uppercase tracking-wide">Current Session</p>
                    <div className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                      {formatTime(sessionTime)}
                    </div>
                    <p className="text-xs text-purple-500 mt-1">on Admin Dashboard</p>
                  </div>

                  {/* Line Graph */}
                  <div className="h-64 mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={weeklyTimeData}>
                        <defs>
                          <linearGradient id="timeGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.05}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                        <XAxis 
                          dataKey="day" 
                          stroke="#7c3aed"
                          style={{ fontSize: '13px', fontWeight: '500' }}
                        />
                        <YAxis 
                          stroke="#7c3aed"
                          style={{ fontSize: '13px', fontWeight: '500' }}
                          label={{ 
                            value: 'Minutes', 
                            angle: -90, 
                            position: 'insideLeft', 
                            style: { fontSize: '13px', fill: '#7c3aed', fontWeight: '600' } 
                          }}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#7c3aed', 
                            border: 'none', 
                            borderRadius: '12px',
                            color: 'white',
                            boxShadow: '0 10px 25px rgba(124, 58, 237, 0.3)'
                          }}
                          labelStyle={{ color: 'white', fontWeight: 'bold' }}
                          formatter={(value: number) => [`${value} min`, 'Time Spent']}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="time" 
                          stroke="#7c3aed" 
                          strokeWidth={4}
                          fill="url(#timeGradient)" 
                          dot={{ 
                            fill: '#7c3aed', 
                            r: 5,
                            strokeWidth: 3,
                            stroke: '#fff'
                          }}
                          activeDot={{ 
                            r: 8, 
                            fill: '#7c3aed',
                            strokeWidth: 3,
                            stroke: '#fff'
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t-2 border-purple-100">
                    <div className="bg-gradient-to-br from-purple-100 to-purple-50 p-4 rounded-xl">
                      <p className="text-xs text-purple-600 font-semibold mb-1 uppercase tracking-wide">Daily Average</p>
                      <p className="text-3xl font-bold text-purple-900">{calculateAverage()}m</p>
                      <p className="text-xs text-purple-500 mt-1">Past 7 days</p>
                    </div>
                    <div className="bg-gradient-to-br from-indigo-100 to-indigo-50 p-4 rounded-xl">
                      <p className="text-xs text-indigo-600 font-semibold mb-1 uppercase tracking-wide">Most Used</p>
                      <p className="text-3xl font-bold text-indigo-900">
                        {weeklyTimeData.reduce((max, day) => day.time > max.time ? day : max).day}
                      </p>
                      <p className="text-xs text-indigo-500 mt-1">
                        {weeklyTimeData.reduce((max, day) => day.time > max.time ? day : max).time}m total
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Queries Section */}
            <Card className="border-0 shadow-xl overflow-hidden bg-gradient-to-br from-purple-50 to-white mb-8">
              <CardHeader className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white pb-4">
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Queries & Support
                  </span>
                  <Badge className="bg-white/20 text-white">
                    {recentQueries.filter(q => q.status === 'new').length} New
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {recentQueries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <MessageSquare className="h-16 w-16 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No recent queries</p>
                    </div>
                  ) : (
                    recentQueries.map((query, index) => (
                      <div 
                        key={query.id} 
                        className={`p-4 bg-gradient-to-br rounded-xl border-2 hover:shadow-md transition-all ${
                          index === 0 ? 'from-blue-50 to-blue-100/50 border-blue-200' :
                          index === 1 ? 'from-purple-50 to-purple-100/50 border-purple-200' :
                          'from-green-50 to-green-100/50 border-green-200'
                        }`}
                      >                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <Avatar className={`h-10 w-10 ${
                              index === 0 ? 'bg-gradient-to-br from-blue-400 to-blue-600' :
                              index === 1 ? 'bg-gradient-to-br from-purple-400 to-purple-600' :
                              'bg-gradient-to-br from-green-400 to-green-600'
                            }`}>
                              <AvatarFallback className="bg-transparent text-gray-900 font-bold text-sm">
                                {query.studentName?.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() || 'ST'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold text-gray-900">{query.studentName}</p>
                              <p className="text-xs text-gray-600">
                                Student • {query.department} Department • {query.regNumber}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-xs text-gray-500">{formatTimestamp(query.timestamp)}</span>
                            <Badge className={getStatusBadge(query.status)}>
                              {query.status}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 ml-13 mb-3">
                          <span className="font-semibold">Subject:</span> {query.subject}
                        </p>
                        <p className="text-sm text-gray-600 ml-13 mb-3 line-clamp-2">
                          {query.message}
                        </p>                        <div className="flex gap-2 ml-13">
                          <Button 
                            size="sm" 
                            className={`${
                              index === 0 ? 'bg-blue-600 hover:bg-blue-700' :
                              index === 1 ? 'bg-purple-600 hover:bg-purple-700' :
                              'bg-green-600 hover:bg-green-700'
                            } text-white`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedQuery(query);
                              setReplyModalOpen(true);
                            }}
                          >
                            Reply
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className={`${
                              index === 0 ? 'border-blue-300 text-blue-700' :
                              index === 1 ? 'border-purple-300 text-purple-700' :
                              'border-green-300 text-green-700'
                            }`}
                            onClick={() => navigate('/admin/queries')}
                          >
                            View Details
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>                {/* View All Button */}
                <div className="mt-6 text-center">
                  <Button 
                    variant="outline" 
                    className="border-2 border-purple-600 bg-purple-600 text-white hover:bg-purple-700 hover:border-purple-700 font-semibold"
                    onClick={() => navigate('/admin/queries')}
                  >
                    View All Queries
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>                </div>
              </CardContent>
            </Card>
          </div>
          </div>
        </section>
        <aside className="hidden lg:block w-96">
          <Card className="h-[calc(100vh-1rem)] overflow-auto sticky top-0 rounded-t-none">
            <CardContent className="pt-8">
              <div className="space-y-6">
                <div>
                  <div className="mb-4">
                    <h3 className="text-lg font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                      </svg>
                      Calendar
                    </h3>
                  </div>
                  <div className="rounded-lg border border-border/50 p-3">
                    <Calendar />                  </div>
                </div>                {/* Recent Activities Section */}
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent flex items-center gap-2">
                        <Activity className="h-5 w-5 text-primary" />
                        Recent Activities
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">Last 30 minutes</p>
                    </div>
                    {recentActivities.length > 0 && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => setRecentActivities([])}
                        className="h-7 text-xs text-gray-600 hover:text-gray-900"
                      >
                        Clear all
                      </Button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {recentActivities.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 px-4 bg-gray-50 rounded-lg border border-border/50">
                        <Activity className="h-12 w-12 text-muted-foreground mb-3" />
                        <p className="text-sm font-medium text-gray-900 mb-1">No recent activities</p>
                        <p className="text-xs text-gray-500 text-center">Activities will appear here in real-time</p>
                      </div>                    ) : (
                      recentActivities.slice(0, 6).map((activity: any, index: number) => (
                        <div 
                          key={activity.id} 
                          className={`p-3 bg-gradient-to-br rounded-xl border-2 hover:shadow-md transition-all ${
                            index % 5 === 0 ? 'from-indigo-50 to-indigo-100/50 border-indigo-200' :
                            index % 5 === 1 ? 'from-emerald-50 to-emerald-100/50 border-emerald-200' :
                            index % 5 === 2 ? 'from-amber-50 to-amber-100/50 border-amber-200' :
                            index % 5 === 3 ? 'from-rose-50 to-rose-100/50 border-rose-200' :
                            'from-sky-50 to-sky-100/50 border-sky-200'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                              index % 5 === 0 ? 'bg-indigo-200' :
                              index % 5 === 1 ? 'bg-emerald-200' :
                              index % 5 === 2 ? 'bg-amber-200' :
                              index % 5 === 3 ? 'bg-rose-200' :
                              'bg-sky-200'
                            }`}>
                              <BookOpen className="h-4 w-4 text-indigo-700" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 mb-1">
                                {activity.type === 'submission-created' ? (
                                  <>
                                    <span className="text-primary">{activity.studentName}</span> has submitted{' '}
                                    <span className="text-indigo-600">{activity.assessmentType || 'assessment'}</span> of{' '}
                                    <span className="text-indigo-600">{activity.courseName}</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-primary">{activity.studentName}</span> registered for <span className="text-indigo-600">{activity.courseName}</span>
                                  </>
                                )}
                              </p>
                              <p className="text-xs text-gray-600 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTimestamp(activity.timestamp)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </main>

      {/* Reply Modal */}
      {replyModalOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" 
            onClick={() => {
              setReplyModalOpen(false);
              setReplyMessage('');
              setSelectedQuery(null);
            }}
          />
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl">
            <Card className="border-primary/20 shadow-2xl">
              <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-xl border-b border-primary/10">
                <CardTitle className="text-lg font-bold text-black">Reply to Query</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Send a response to {selectedQuery?.studentName}
                </p>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                {/* Student Info */}
                <div className="bg-primary/5 p-4 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-black">{selectedQuery?.studentName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    <span>{selectedQuery?.studentEmail}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Hash className="h-4 w-4" />
                    <span>{selectedQuery?.regNumber}</span>
                  </div>
                </div>

                {/* Query Subject */}
                <div>
                  <h4 className="font-semibold text-black mb-2">Subject:</h4>
                  <p className="text-sm text-muted-foreground">{selectedQuery?.subject}</p>
                </div>

                {/* Query Message */}
                <div>
                  <h4 className="font-semibold text-black mb-2">Message:</h4>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-700">{selectedQuery?.message}</p>
                  </div>
                </div>

                {/* Reply Textarea */}
                <div>
                  <h4 className="font-semibold text-black mb-2">Your Reply:</h4>
                  <textarea
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Type your response here..."
                    rows={4}
                    className="w-full px-4 py-3 border border-primary/30 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={handleQuickReply}
                    className="flex-1 bg-primary hover:bg-primary/90 text-white font-semibold"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send Reply
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setReplyModalOpen(false);
                      setReplyMessage('');
                      setSelectedQuery(null);
                    }}
                    className="border-primary/30 hover:bg-primary/5"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
