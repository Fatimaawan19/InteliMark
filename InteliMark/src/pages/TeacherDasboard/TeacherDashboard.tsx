import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Brain, 
  Users, 
  FileText, 
  CheckCircle, 
  Clock,
  TrendingUp,
  BookOpen,
  Plus,
  Download,
  Upload,
  BarChart3,
  AlertCircle,
  Settings,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Bell,
  ChevronDown,
  Menu,
  X,
  LogOut,
  Home,
  ClipboardList,
  GraduationCap,
  BarChart,
  Calendar as CalendarIcon,
  ChevronLeft,
  EllipsisVertical,
  MessageSquare
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../../firebase";
import { collection, getDocs, query, where, doc, getDoc, updateDoc, onSnapshot, orderBy } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { trackUserLogout } from "../../utils/logoutTracker";

interface StudentQuery {
  id: number;
  studentName: string;
  query: string;
  type: 'recheck' | 'feedback' | 'error' | 'clarification';
  status: 'pending' | 'resolved';
  date: string;
  time: string;
}

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  
  // Auth & User Data State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [teacherName, setTeacherName] = useState("Teacher");
  
  // Courses State - Replace dummy data with real data
  const [assignedCourses, setAssignedCourses] = useState<any[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);

  // Calculate real-time total students and course count
  const totalStudents = assignedCourses.reduce((sum, course) => sum + (course.students || 0), 0);
  const totalCourses = assignedCourses.length;

  // Pending Grading State
  const [pendingGradingCount, setPendingGradingCount] = useState(0);
  const [loadingPendingCount, setLoadingPendingCount] = useState(false);

  // Recent Submissions State
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [loadingRecentSubmissions, setLoadingRecentSubmissions] = useState(false);

  // Modal and File Upload State
  const [contentModalOpen, setContentModalOpen] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [contentUploaded, setContentUploaded] = useState<Record<string, boolean>>({});

  const downloadSubmissionFile = async (fileUrl?: string, originalName?: string) => {
    const url = String(fileUrl || "").trim();
    if (!url) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = originalName || "submission";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      // Fallback: open in new tab if browser blocks direct download (or if server forces inline).
      window.open(url, "_blank");
    }
  };

  // Monitor auth state & fetch teacher data
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Fetch teacher data from Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserData(data);
          setTeacherName(data.name || "Teacher");
        }
      }
    });

    return () => unsubscribe();
  }, []);
  // Fetch assigned courses from Firestore
  useEffect(() => {
    const fetchAssignedCourses = async () => {
      if (!currentUser) {
        setLoadingCourses(false);
        return;
      }

      try {
        const coursesCol = collection(db, 'courses');
        const q = query(coursesCol, where('assignedTeacher', '==', currentUser.uid));
        const coursesSnapshot = await getDocs(q);
        
        const coursesList = coursesSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            // Use actual data from Firestore, don't override with 0
            students: data.students || 0,
            assignments: data.assignments || 0,
            avgScore: data.avgScore || 0
          };
        });
        
        setAssignedCourses(coursesList);
      } catch (error) {
        console.error('Error fetching courses:', error);
      } finally {
        setLoadingCourses(false);
      }
    };

    if (currentUser) {
      fetchAssignedCourses();
    }
  }, [currentUser]);

  // Fetch pending grading count
  useEffect(() => {
    const fetchPendingGradingCount = async () => {
      if (!currentUser) return;

      try {
        setLoadingPendingCount(true);
        const response = await fetch(`http://localhost:5000/api/submissions/teacher/${currentUser.uid}/pending-count`);
        const data = await response.json();
        
        if (data.success) {
          setPendingGradingCount(data.pendingCount || 0);
          console.log(`📊 Pending grading count: ${data.pendingCount}`);
        }
      } catch (error) {
        console.error('Error fetching pending grading count:', error);
      } finally {
        setLoadingPendingCount(false);
      }
    };

    if (currentUser) {
      fetchPendingGradingCount();
      // Refresh every 30 seconds
      const interval = setInterval(fetchPendingGradingCount, 30000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  // Fetch recent submissions from student_uploads folder
  useEffect(() => {
    const fetchRecentSubmissions = async () => {
      try {
        setLoadingRecentSubmissions(true);
        // Fetch from MongoDB submissions so we can show assessment title/type correctly
        const teacherId = currentUser?.uid;
        if (!teacherId) {
          setRecentSubmissions([]);
          return;
        }

        const response = await fetch(`http://localhost:5000/api/submissions/teacher/${teacherId}`);
        const data = await response.json();
        
        if (data.success) {
          const uploads = Array.isArray(data.uploads) ? data.uploads : [];
          setRecentSubmissions(uploads.slice(0, 8));
          console.log(`📄 Recent submissions fetched: ${uploads.length || 0}`);
        }
      } catch (error) {
        console.error('Error fetching recent submissions:', error);
      } finally {
        setLoadingRecentSubmissions(false);
      }
    };

    // Fetch immediately and refresh every 60 seconds
    fetchRecentSubmissions();
    const interval = setInterval(fetchRecentSubmissions, 15000);
    return () => clearInterval(interval);
  }, [currentUser?.uid]);

  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [events, setEvents] = useState<{ id: number; date: string; title: string }[]>([
    { id: 1, date: '2024-11-15', title: 'CS301 Lecture' },
    { id: 2, date: '2024-11-18', title: 'Assignment 3 Due' },
    { id: 3, date: '2024-11-20', title: 'Midterm Exam' }
  ]);
  const [showEventInput, setShowEventInput] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  // Student Queries state (placeholder for future implementation)
  const [studentQueries, setStudentQueries] = useState<StudentQuery[]>([]);

  const markQueryAsResolved = (id: number) => {
    setStudentQueries(studentQueries.map(query => 
      query.id === id ? { ...query, status: 'resolved' as const } : query
    ));
  };

  const pendingQueriesCount = studentQueries.filter(q => q.status === 'pending').length;

  // Calendar helper functions
  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  
  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };
  
  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };
  
  const daysInMonth = getDaysInMonth(currentDate);
  const startingDayOfWeek = getFirstDayOfMonth(currentDate);

  const isToday = (day: number) => {
    const today = new Date();
    return day === today.getDate() && 
           currentDate.getMonth() === today.getMonth() && 
           currentDate.getFullYear() === today.getFullYear();
  };

  const hasEvent = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.some(event => event.date === dateStr);
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const addEvent = () => {
    if (newEventTitle.trim() && selectedDate) {
      const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
      setEvents([...events, { id: Date.now(), date: dateStr, title: newEventTitle }]);
      setNewEventTitle('');
      setShowEventInput(false);
    }
  };

  const getUpcomingEvents = () => {
    const today = new Date();
    return events
      .filter(event => new Date(event.date) >= today)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5);
  };

  // Notification state
  const [notifications, setNotifications] = useState<any[]>([
    {
      id: Date.now(),
      title: "Login Successful",
      message: "You successfully login",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: "success",
      read: false,
      timestamp: new Date()
    }
  ]);

  // Filter notifications to show only last 24 hours in dashboard
  const recentNotifications = notifications.filter(notif => {
    if (!notif.timestamp) return true; // Show if no timestamp
    const notifTime = notif.timestamp instanceof Date ? notif.timestamp : notif.timestamp.toDate?.() || new Date(notif.timestamp);
    const now = new Date();
    const hoursDiff = (now.getTime() - notifTime.getTime()) / (1000 * 60 * 60);
    return hoursDiff <= 24;
  });
  const unreadCount = recentNotifications.filter(n => !n.read).length;

  // Fetch teacher notifications from Firestore with dual-query
  useEffect(() => {
    if (!currentUser) return;

    const allNotifications = new Map<string, any>();
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
        
        // Show if recipientId matches current user
        const isForCurrentUser = recipientId === currentUser.uid;
        
        // Option A (strict): teacher dashboard shows only teacher-targeted notifications
        if (isForCurrentUser && recipientRole === 'teacher') {
          const timestamp = data.createdAt || data.timestamp;
          allNotifications.set(doc.id, {
            id: doc.id,
            type: data.type || '',
            recipientRole: recipientRole,
            teacherId: data.teacherId,
            timestamp: timestamp,
            time: timestamp?.toDate?.() ? new Date(timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
            read: data.read || false,
            ...data
          });
        }
      });
      updateNotificationState();
    });
    unsubscribers.push(unsub1);

    // Query 2: Legacy notifications (strict recipientId filter - Option A)
    const q2 = query(
      collection(db, 'notifications'),
      orderBy('timestamp', 'desc')
    );

    const unsub2 = onSnapshot(q2, (snapshot) => {
      snapshot.docs.forEach(doc => {
        if (!allNotifications.has(doc.id)) {
          const data = doc.data();
          const recipientId = data.recipientId;
          const isForCurrentUser = recipientId === currentUser.uid;
          const recipientRole = data.recipientRole || 'all';
          
          // Option A (strict): teacher dashboard shows only teacher-targeted notifications
          if (isForCurrentUser && recipientRole === 'teacher') {
            const timestamp = data.timestamp || data.createdAt;
            allNotifications.set(doc.id, {
              id: doc.id,
              type: data.type || '',
              recipientRole: recipientRole,
              teacherId: data.teacherId,
              timestamp: timestamp,
              time: timestamp?.toDate?.() ? new Date(timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
              read: data.read || false,
              ...data
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
      
      setNotifications(prev => {
        const localNotifs = prev.filter(n => typeof n.id === 'number');
        return [...notifArray, ...localNotifs];
      });
    }

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [currentUser]);

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
    setNotificationsOpen(false);
  };

  const handleLogout = async () => {
    try {
      const userId = currentUser?.uid;
      if (userId) {
        await trackUserLogout(userId);
      }
      await signOut(auth);
      navigate("/");
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const navItems = [
    { name: "Dashboard", icon: Home, path: "/teacher-dashboard" },
    { name: "Courses", icon: BookOpen, path: "/teacher/courses" },
    { name: "Assessments", icon: FileText, path: "/teacher/assessments" },
    { name: "Collection", icon: FileText, path: "/teacher/collection" },
    { name: "Queries", icon: MessageSquare, path: "/teacher/queries" },
    { name: "Analytics", icon: BarChart3, path: "/teacher/analytics" }
  ];

  const handleOpenContentModal = (courseId: string) => {
    setSelectedCourseId(courseId);
    setContentModalOpen(true);
    setFile(null);
  };

  const handleCloseContentModal = () => {
    setContentModalOpen(false);
    setSelectedCourseId(null);
    setFile(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUploadContent = async () => {
    if (!file || !selectedCourseId) return;
    setUploading(true);
    try {
      const storage = getStorage();
      const storageRef = ref(storage, `course-content/${selectedCourseId}/${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      // Update Firestore course document
      await updateDoc(doc(db, 'courses', selectedCourseId), {
        contentUrl: url,
        contentFileName: file.name,
        contentUploadedAt: new Date(),
      });
      setContentUploaded(prev => ({ ...prev, [selectedCourseId]: true }));
      alert('Course content uploaded successfully!');
      handleCloseContentModal();
    } catch (err) {
      alert('Failed to upload: ' + (err as any).message);
      setUploading(false);
      handleCloseContentModal();
    }
    setUploading(false);
  };

  return (
    <div className="relative min-h-screen bg-secondary/20">
      {/* Main Content */}
      <div className="flex">
        {sidebarOpen && (
          <>
            {/* Overlay to close sidebar when clicking outside */}
            <div
              className="fixed inset-0 z-40 bg-black/10 cursor-pointer"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar overlay"
            />
            <aside className="fixed top-0 left-0 z-50 h-full w-64 bg-gradient-to-b from-white to-gray-50 shadow-lg animate-in slide-in-from-left-8 flex flex-col">
              {/* Profile Section */}
              <div className="flex flex-col items-center py-8 border-b border-primary/10 bg-gradient-to-br from-primary/10 to-primary/5">
                <Avatar className="h-20 w-20 mb-2">
                  <AvatarFallback className="bg-primary text-white font-bold text-lg">
                    {teacherName ? teacherName.split(' ').map(n => n[0]).join('').toUpperCase() : 'T'}
                  </AvatarFallback>
                </Avatar>
                <div className="text-center">
                  <div className="font-bold text-lg text-black">{teacherName}</div>
                  <div className="text-xs text-muted-foreground">Teacher</div>
                </div>
              </div>
              {/* Nav Links */}
              <nav className="flex flex-col items-center justify-center gap-3 py-3 px-6 flex-1 overflow-y-auto max-h-[calc(100vh-300px)] scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400">
                {[
                  { name: "Dashboard", path: "/teacher-dashboard" },
                  { name: "Courses", path: "/teacher/courses" },
                  { name: "Assessments", path: "/teacher/assessments" },
                  { name: "Submissions", path: "/teacher/submissions" },
                  { name: "Collection", path: "/teacher/collection" },
                  { name: "Queries", path: "/teacher/queries" },
                  { name: "Analytics", path: "/teacher/analytics" }
                ].map((item) => {
                  return (
                    <button
                      key={item.name}
                      onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                      className="w-full flex items-center justify-center py-2 rounded-xl font-medium text-base transition-all text-gray-700 hover:bg-primary hover:text-white"
                      style={{ boxShadow: 'none' }}
                    >
                      {item.name}
                    </button>
                  );
                })}
              </nav>
              <div className="flex justify-center pb-8">
                <button onClick={async () => { await handleLogout(); setSidebarOpen(false); }} className="flex items-center justify-center gap-3 w-full px-4 py-3 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-xl transition-all font-semibold">
                  <LogOut className="h-5 w-5" /> Logout
                </button>
              </div>
            </aside>
          </>
        )}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <header className="sticky top-0 z-30 bg-gradient-to-r from-white via-purple-50/30 to-white border-b border-primary/20 shadow-lg">
            <div className="px-6 py-4 flex items-center justify-between">
              {/* Left Section */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Menu className="h-6 w-6 text-primary" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-primary to-purple-600 rounded-lg shadow-md">
                    <Brain className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">Teacher Dashboard</h1>
                    <p className="text-sm text-muted-foreground font-medium">Welcome back, {teacherName}</p>
                  </div>
                </div>
              </div>

              {/* Right Section - Notifications Only */}
              <div className="flex items-center gap-4">
                {/* Notifications Popover */}
                <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
                  <PopoverTrigger asChild>
                    <button 
                      className="relative p-2.5 bg-white hover:bg-primary/10 rounded-lg transition-all shadow-sm hover:shadow-md border border-gray-200"
                      aria-label="Notifications"
                    >
                      <Bell className="h-5 w-5 text-primary" />
                      {recentNotifications.length > 0 && (
                        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white text-[10px] flex items-center justify-center font-bold shadow-lg">
                          {recentNotifications.length}
                        </span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-96 p-0 shadow-2xl border-2" align="end">
                    <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-primary/10 to-primary/5">
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
                      <button 
                        className="text-sm text-red-600 hover:underline font-medium"
                        onClick={() => setNotifications([])}
                      >
                        Clear all
                      </button>
                    </div>
                    <div className="relative">
                      <ScrollArea className="h-[400px] pb-16">
                        <div className="p-3 space-y-2">
                          {recentNotifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12">
                              <div className="p-4 bg-gray-100 rounded-full mb-3">
                                <Bell className="h-8 w-8 text-gray-400" />
                              </div>
                              <p className="text-sm text-muted-foreground">No new notifications</p>
                              <p className="text-xs text-gray-400 mt-1">in the last 24 hours</p>
                            </div>
                          ) : (
                            recentNotifications.map((notification) => (
                              <div
                                key={notification.id}
                                className="group rounded-lg p-3 flex items-start gap-3 bg-white border border-gray-200 hover:border-primary/50 transition-all cursor-pointer shadow-sm hover:shadow-md relative"
                              >
                                <div className={`h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-full ${
                                  notification.type === 'submission' ? 'bg-green-100' :
                                  notification.type === 'request' ? 'bg-blue-100' :
                                  notification.type === 'reminder' ? 'bg-orange-100' :
                                  notification.type === 'query' ? 'bg-purple-100' :
                                  notification.type === 'success' ? 'bg-green-100' :
                                  notification.type === 'warning' ? 'bg-red-100' :
                                  'bg-blue-100'
                                }`}>
                                  {notification.type === 'submission' && <CheckCircle className="h-5 w-5 text-green-600" />}
                                  {notification.type === 'request' && <AlertCircle className="h-5 w-5 text-blue-600" />}
                                  {notification.type === 'reminder' && <Clock className="h-5 w-5 text-orange-600" />}
                                  {notification.type === 'query' && <FileText className="h-5 w-5 text-purple-600" />}
                                  {notification.type === 'success' && <CheckCircle className="h-5 w-5 text-green-600" />}
                                  {notification.type === 'warning' && <AlertCircle className="h-5 w-5 text-red-600" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-gray-900 text-sm mb-1">
                                    {notification.title}
                                  </div>
                                  {notification.message && (
                                    <div className="text-xs text-gray-600 mb-2">
                                      {notification.message}
                                    </div>
                                  )}
                                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {notification.time}
                                  </div>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setNotifications(prev => prev.filter(n => n.id !== notification.id));
                                  }}
                                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-100 rounded"
                                  aria-label="Dismiss notification"
                                >
                                  <X className="h-4 w-4 text-gray-500 hover:text-gray-700" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                      {recentNotifications.length > 0 && (
                        <div className="absolute left-0 right-0 bottom-0 p-3 bg-gradient-to-t from-white via-white to-transparent">
                          <Button
                            size="sm"
                            className="w-full bg-primary hover:bg-primary/90 text-white font-semibold shadow-lg"
                            onClick={() => navigate('/teacher/notifications')}
                          >
                            View All Notifications
                          </Button>
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </header>

          {/* Main Dashboard Content */}
          <div className="px-6 py-8 max-w-6xl mx-auto">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
              {/* Total Students */}
              <Card className="group hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 bg-white border-2 border-gray-200 hover:border-primary rounded-xl overflow-hidden">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="p-3 bg-primary/10 rounded-xl border-2 border-primary/20 group-hover:scale-110 transition-transform duration-300">
                      <Users className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-sm font-bold text-black">Total Students</CardTitle>
                    <div className="text-3xl font-bold text-black">{totalStudents}</div>
                    <p className="text-xs text-muted-foreground">Across {totalCourses} course{totalCourses !== 1 ? 's' : ''}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Auto-Graded */}
              <Card className="group hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 bg-white border-2 border-gray-200 hover:border-green-500 rounded-xl overflow-hidden">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="p-3 bg-green-50 rounded-xl border-2 border-green-200 group-hover:scale-110 transition-transform duration-300">
                      <CheckCircle className="h-6 w-6 text-green-600" />
                    </div>
                    <CardTitle className="text-sm font-bold text-black">Auto-Graded</CardTitle>
                    <div className="text-base font-bold text-black">Coming soon...</div>
                  </div>
                </CardContent>
              </Card>

              {/* Pending Grading */}
              <Card className="group hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 bg-white border-2 border-gray-200 hover:border-orange-500 rounded-xl overflow-hidden">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="p-3 bg-orange-50 rounded-xl border-2 border-orange-200 group-hover:scale-110 transition-transform duration-300">
                      <Clock className="h-6 w-6 text-orange-600" />
                    </div>
                    <CardTitle className="text-sm font-bold text-black">Pending Grading</CardTitle>
                    {loadingPendingCount ? (
                      <div className="text-2xl font-bold text-black">...</div>
                    ) : (
                      <div className="text-3xl font-bold text-black">{pendingGradingCount}</div>
                    )}
                    <p className="text-xs text-muted-foreground">Submission{pendingGradingCount !== 1 ? 's' : ''} to review</p>
                  </div>
                </CardContent>
              </Card>

              {/* Class Average */}
              <Card className="group hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 bg-white border-2 border-gray-200 hover:border-blue-500 rounded-xl overflow-hidden">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="p-3 bg-blue-50 rounded-xl border-2 border-blue-200 group-hover:scale-110 transition-transform duration-300">
                      <TrendingUp className="h-6 w-6 text-blue-600" />
                    </div>
                    <CardTitle className="text-sm font-bold text-black">Class Average</CardTitle>
                    <div className="text-base font-bold text-black">Coming soon...</div>
                  </div>
                </CardContent>
              </Card>

              {/* Pending Queries */}
              <Card className="group hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 bg-white border-2 border-gray-200 hover:border-red-500 rounded-xl overflow-hidden">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="p-3 bg-red-50 rounded-xl border-2 border-red-200 group-hover:scale-110 transition-transform duration-300">
                      <AlertCircle className="h-6 w-6 text-red-600" />
                    </div>
                    <CardTitle className="text-sm font-bold text-black">Pending Queries</CardTitle>
                    <div className="text-base font-bold text-black">Coming soon...</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Assigned Courses Section */}
              <Card className="bg-gradient-to-br from-white to-purple-50/50 border-2 border-purple-200/60 rounded-2xl shadow-lg hover:shadow-xl transition-all">
                <CardHeader className="border-b border-purple-100 bg-gradient-to-r from-purple-50/50 to-transparent pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-primary to-purple-600 rounded-xl shadow-md">
                      <BookOpen className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">Assigned Courses</CardTitle>
                      <CardDescription className="text-sm text-muted-foreground mt-1">
                        {assignedCourses.length} active course{assignedCourses.length !== 1 ? 's' : ''}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingCourses ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <BookOpen className="h-16 w-16 text-primary/20 mb-4" />
                      <p className="text-sm text-muted-foreground">Loading courses...</p>
                    </div>
                  ) : assignedCourses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <BookOpen className="h-16 w-16 text-primary/20 mb-4" />
                      <h3 className="text-lg font-semibold text-black mb-2">No Courses Assigned</h3>
                      <p className="text-sm text-muted-foreground text-center mb-6">
                        You have not been assigned any courses yet.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 py-4">
                      {assignedCourses.map((course, idx) => {
                        const colors = [
                          { bg: 'bg-gradient-to-br from-purple-50 to-purple-100/50', border: 'border-purple-300', icon: 'text-purple-600', iconBg: 'bg-purple-100' },
                          { bg: 'bg-gradient-to-br from-blue-50 to-blue-100/50', border: 'border-blue-300', icon: 'text-blue-600', iconBg: 'bg-blue-100' },
                          { bg: 'bg-gradient-to-br from-green-50 to-green-100/50', border: 'border-green-300', icon: 'text-green-600', iconBg: 'bg-green-100' },
                          { bg: 'bg-gradient-to-br from-pink-50 to-pink-100/50', border: 'border-pink-300', icon: 'text-pink-600', iconBg: 'bg-pink-100' },
                          { bg: 'bg-gradient-to-br from-orange-50 to-orange-100/50', border: 'border-orange-300', icon: 'text-orange-600', iconBg: 'bg-orange-100' },
                          { bg: 'bg-gradient-to-br from-cyan-50 to-cyan-100/50', border: 'border-cyan-300', icon: 'text-cyan-600', iconBg: 'bg-cyan-100' }
                        ];
                        const colorScheme = colors[idx % colors.length];
                        return (
                          <div 
                            key={course.id} 
                            className={`${colorScheme.bg} p-4 rounded-xl border-2 ${colorScheme.border} flex items-center gap-4 shadow-md cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group`}
                            onClick={() => navigate('/teacher/courses')}
                          >
                            <div className={`p-3 ${colorScheme.iconBg} rounded-xl group-hover:scale-110 transition-transform duration-300`}>
                              <BookOpen className={`h-6 w-6 ${colorScheme.icon}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-base font-bold text-gray-900 mb-1 truncate">{course.courseName}</h4>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs font-semibold">
                                  <GraduationCap className="h-3 w-3 mr-1" />
                                  {course.degree || 'N/A'}
                                </Badge>
                              </div>
                            </div>
                            <ChevronRight className={`h-5 w-5 ${colorScheme.icon} group-hover:translate-x-1 transition-transform`} />
                          </div>
                        );
                      })}
                      <div className="pt-4 border-t border-purple-100">
                        <Button
                          className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-700 text-white font-semibold shadow-md hover:shadow-lg transition-all"
                          onClick={() => navigate('/teacher/courses')}
                        >
                          View All Courses
                          <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Student Queries Section */}
              <Card className="bg-gradient-to-br from-white to-primary/5 border-2 border-primary/20 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300">
                <CardHeader className="border-b border-primary/10 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-primary/10 rounded-xl">
                        <MessageSquare className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-bold text-gray-900">Student Queries</CardTitle>
                        <CardDescription className="text-sm text-gray-600 mt-1">
                          Student questions and support requests
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-8 pb-8">
                  <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                    <div className="p-6 bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl">
                      <MessageSquare className="h-16 w-16 text-primary/60" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Coming Soon</h3>
                      <p className="text-sm text-gray-600 max-w-md">
                        Student query management system will be available soon. You'll be able to view and respond to student questions directly from here.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Submissions Section */}
            <Card className="mb-8 bg-gradient-to-br from-white to-primary/5 border-2 border-primary/20 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300">
              <CardHeader className="border-b border-primary/10 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-bold text-gray-900">Recent Submissions</CardTitle>
                      <CardDescription className="text-sm text-gray-600 mt-1">
                        Latest student submissions requiring action
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-primary/15 text-primary font-semibold px-3 py-1">
                    {recentSubmissions.length} {recentSubmissions.length === 1 ? 'submission' : 'submissions'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6 pb-6">
                {loadingRecentSubmissions ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin">
                      <Clock className="h-8 w-8 text-primary" />
                    </div>
                  </div>
                ) : recentSubmissions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                    <div className="p-6 bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl">
                      <Clock className="h-16 w-16 text-primary/60" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No Submissions Yet</h3>
                      <p className="text-sm text-gray-600 max-w-md">
                        Submissions will appear here as students submit their assignments.
                      </p>
                    </div>
                  </div>
                ) : (
                  <ScrollArea className="h-auto">
                    <div className="space-y-2 pr-4">
                      {recentSubmissions.map((submission: any, index: number) => (
                        <div
                          key={index}
                          onClick={() => navigate('/teacher/submissions')}
                          className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50/60 via-primary/3 to-primary/5 rounded-xl border border-primary/15 hover:border-primary/40 hover:shadow-md transition-all duration-200 group cursor-pointer"
                        >
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg group-hover:from-primary/30 group-hover:to-primary/20 transition-all duration-200">
                              <FileText className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 truncate text-sm">
                                {submission.studentName || submission.studentEmail || submission.studentId || "Unknown"}
                              </p>
                              <p className="text-sm text-gray-700 truncate">
                                {submission.assessmentTitle || "—"}
                              </p>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {submission.assessmentType === "quiz" ? "Quiz" : submission.assessmentType === "assignment" ? "Assignment" : "—"}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                                <span>{new Date(submission.uploadedAt).toLocaleDateString()}</span>
                                <span>•</span>
                                <span>{new Date(submission.uploadedAt).toLocaleTimeString()}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-primary p-2 h-auto hover:scale-110 hover:shadow-lg transition-transform duration-200 ease-out"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                // Download the student's submitted file
                                downloadSubmissionFile(submission.fileUrl, submission.originalFileName || submission.fileName);
                              }}
                            >
                              <Download className="h-5 w-5" />
                            </Button>
                            <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-primary/60 transition-all duration-200" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

          </div>
        </div>

        {/* Content Modal */}
        {contentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-8 shadow-2xl w-full max-w-md flex flex-col items-center">
              <h3 className="text-lg font-bold text-blue-700 mb-4">Upload Course Content</h3>
              <input type="file" accept=".pdf,.doc,.docx" onChange={handleFileChange} className="mb-4" />
              <Button onClick={handleUploadContent} disabled={uploading || !file} className="bg-blue-600 text-white w-full mb-2">
                {uploading ? 'Uploading...' : 'Upload'}
              </Button>
              <Button variant="outline" onClick={handleCloseContentModal} className="w-full">Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherDashboard;