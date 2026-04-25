import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Bot, Info, LogOut, Plus, X, Check, BookOpen, Download, Loader2, ChevronDown, MoreVertical, Upload, Calendar, BookOpen as BookOpenIcon, Search } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from 'date-fns';
import {
  Brain,
  FileText,
  Clock,
  TrendingUp,
  Award,
  Target,
  BarChart3,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Settings,
  Calendar as CalendarIcon,
  Menu,
  Trash2
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { ChatbotModal } from '@/features/chatbot';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { db, auth } from "../../firebase";
import { collection, getDocs, query, where, doc, getDoc, updateDoc, arrayUnion, onSnapshot, addDoc, Timestamp, orderBy } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import axios from 'axios';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trackUserLogout } from "@/utils/logoutTracker";
import { useNotifications } from "@/context/NotificationContext";

type Upload = {
  _id: string;
  studentId: string;
  assessmentId: string;
  assessmentTitle: string;
  assessmentType: 'quiz' | 'assignment';
  courseCode: string;
  courseName?: string;
  fileName: string;
  originalFileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  uploadedDate: string;
  uploadedTime: string;
  status: 'uploaded' | 'graded' | 'reviewed' | 'archived';
  isLate?: boolean;
  isLateSubmission?: boolean;
};

const StudentDashboard = () => {
  const navigate = useNavigate();
  const { notifications: firebaseNotifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [assignmentFilter, setAssignmentFilter] = useState<"upcoming" | "pastDue" | "completed" | "assignments" | "quizzes">("upcoming");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [chatbotOpen, setChatbotOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("November");
  const [notifFilter, setNotifFilter] = useState<'all' | 'success' | 'warning'>('all');

  // Welcome notification state
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

  // Auth & User Data State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [userName, setUserName] = useState("Student");

  // Courses State
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  const [enrolledCourses, setEnrolledCourses] = useState<any[]>([]);
  const [registeredCourseIds, setRegisteredCourseIds] = useState<string[]>([]);
  const [enrolledTeachers, setEnrolledTeachers] = useState<any[]>([]);
  const [courseMaterials, setCourseMaterials] = useState<{ [courseId: string]: any[] }>({});
  const [expandedMaterialsCourse, setExpandedMaterialsCourse] = useState<string | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [courseDescriptions, setCourseDescriptions] = useState<{ [courseId: string]: string }>({});
  const [descriptionDialog, setDescriptionDialog] = useState<{ open: boolean, course: any }>({ open: false, course: null });
  const [syllabusDialog, setSyllabusDialog] = useState<{ open: boolean, course: any }>({ open: false, course: null });

  // MongoDB syllabus verification state - strong check
  const [mongoSyllabusStatus, setMongoSyllabusStatus] = useState<{ [courseCode: string]: { hasSyllabus: boolean, syllabusURL: string | null } }>({});

  // Uploads State
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [uploadsLoading, setUploadsLoading] = useState(false);
  const [uploadsSearchTerm, setUploadsSearchTerm] = useState("");
  const [uploadsFilterType, setUploadsFilterType] = useState<"all" | "quizzes" | "assignments" | "recent">("all");
  const [deletingUploadId, setDeletingUploadId] = useState<string | null>(null);

  // Merge Firebase notifications with local welcome notification
  const mergedNotifications = [...firebaseNotifications, ...notifications.filter(n => typeof n.id === 'number')];

  // Filter notifications to show only last 24 hours in dashboard
  const recentNotifications = mergedNotifications.filter(notif => {
    if (!notif.createdAt && !notif.timestamp) return true; // Show if no timestamp
    const notifTime = notif.createdAt?.toDate ? notif.createdAt.toDate() : notif.timestamp instanceof Date ? notif.timestamp : new Date(notif.createdAt || notif.timestamp);
    const now = new Date();
    const hoursDiff = (now.getTime() - notifTime.getTime()) / (1000 * 60 * 60);
    return hoursDiff <= 24;
  });

  // Monitor auth state & fetch user data
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Fetch user data from Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserData(data);
          setUserName(data.name || "Student");
          setRegisteredCourseIds(data.registeredCourses || []);
        }
        // Fetch uploads
        fetchUploads(user.uid);
      }
    });

    return () => unsubscribe();
  }, []);

  // Refresh uploads when component mounts (e.g., when returning from another page)
  useEffect(() => {
    if (currentUser?.uid) {
      console.log('🔄 Refreshing uploads on page load/return');
      fetchUploads(currentUser.uid);
    }
  }, []);

  // Refresh uploads when page becomes visible (user switches back to this tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && currentUser?.uid) {
        console.log('👁️ Page became visible, refreshing uploads');
        fetchUploads(currentUser.uid);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [currentUser?.uid]);

  // Generate initials from user name
  const getInitials = (name: string) => {
    const names = name.split(' ');
    if (names.length >= 2) {
      return (names[0][0] + names[names.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Fetch available courses based on student's degree
  useEffect(() => {
    const fetchCourses = async () => {
      if (!userData?.degree) return;

      try {
        // Fetch courses matching student's degree
        const coursesCol = collection(db, 'courses');
        const q = query(coursesCol, where('degree', '==', userData.degree), where('status', '==', 'active'));
        const coursesSnapshot = await getDocs(q);

        const coursesList = coursesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as any[];

        console.log('📖 All courses fetched:', coursesList.length);
        if (coursesList.length > 0) {
          console.log('📖 Sample course structure:', coursesList[0]);
        }

        setAvailableCourses(coursesList);        
        // Filter enrolled courses
        const enrolled = coursesList.filter(course =>
          registeredCourseIds.includes(course.id)
        );
        console.log('📖 Enrolled courses:', enrolled.map(c => ({
          id: c.id,
          courseId: c.courseId,
          courseCode: c.courseCode,
          courseName: c.courseName
        })));
        setEnrolledCourses(enrolled);        // Extract unique teachers from enrolled courses
        const teachersMap = new Map();
        enrolled.forEach(course => {
          console.log("Course data:", course); // Debug log
          const teacherName = (course as any).teacherName || (course as any).instructor || 'Teacher';
          const teacherId = (course as any).teacherId || teacherName; // Use teacherName as fallback for uniqueness

          if (!teachersMap.has(teacherId)) {
            teachersMap.set(teacherId, {
              id: teacherId,
              name: teacherName,
              initials: getInitials(teacherName)
            });
          }
        });

        const teachersList = Array.from(teachersMap.values());
        console.log("Teachers extracted:", teachersList); // Debug log
        setEnrolledTeachers(teachersList);
      } catch (error) {
        console.error('Error fetching courses:', error);
      }
    };

    if (userData) {
      fetchCourses();
    }
  }, [userData, registeredCourseIds]);

  // ✅ Check syllabus (strong check via backend + fallback to Firebase field)
  useEffect(() => {
    if (enrolledCourses.length === 0) {
      console.log('📚 No enrolled courses to check for syllabi');
      return;
    }

    console.log(`📚 ========================================`);
    console.log(`📚 CHECKING SYLLABI IN FIREBASE COURSES`);
    console.log(`📚 Enrolled courses count: ${enrolledCourses.length}`);
    console.log(`📚 ========================================`);
    
    const run = async () => {
      const statusMap: { [key: string]: { hasSyllabus: boolean, syllabusURL: string | null } } = {};

      await Promise.all(
        enrolledCourses.map(async (course: any) => {
          const firebaseUrl = course.syllabusURL || course.syllabusUrl || null;

          // Try multiple identifiers because Mongo may store courseCode differently than Firebase.
          const candidates = [
            course.courseCode,
            course.courseId,
            course.courseName,
            course.courseTitle,
            course.id,
          ]
            .map((v: any) => (typeof v === "string" ? v.trim() : ""))
            .filter(Boolean);

          const primaryIdentifier = candidates[0] || "";

          let hasSyllabus = false;
          let syllabusURL: string | null = firebaseUrl;

          for (const candidate of candidates) {
            try {
              const res = await fetch(
                `http://localhost:5000/api/courses/verify-syllabus?courseCode=${encodeURIComponent(candidate)}`
              );
              const data = await res.json();
              if (data?.success && data?.hasSyllabus) {
                hasSyllabus = true;
                syllabusURL = data.syllabusURL || syllabusURL;
                break;
              }
            } catch {
              // ignore; try next candidate
            }
          }

          if (!hasSyllabus) {
            hasSyllabus = Boolean(firebaseUrl);
          }

          console.log(`\n📖 ${course.courseName || 'Unknown'}`);
          console.log(`   ID: ${course.id}`);
          console.log(`   courseId: ${course.courseId}`);
          console.log(`   courseCode: ${course.courseCode}`);
          console.log(`   Syllabus URL: ${syllabusURL || 'NOT FOUND'}`);
          console.log(`   Has syllabus: ${hasSyllabus ? '✅ YES' : '❌ NO'}`);

          [primaryIdentifier, ...candidates].forEach((key) => {
            if (key && key !== 'N/A') {
              statusMap[key] = { hasSyllabus, syllabusURL };
            }
          });
        })
      );

      console.log(`\n📚 ========================================`);
      console.log(`📚 FINAL STATUS MAP (${Object.keys(statusMap).length} entries):`, statusMap);
      console.log(`📚 ========================================\n`);

      setMongoSyllabusStatus(statusMap);
    };

    run();
  }, [enrolledCourses]);

  // Fetch course materials for enrolled courses
  useEffect(() => {
    const fetchCourseMaterials = async () => {
      if (enrolledCourses.length === 0) return;

      try {
        const materialsRef = collection(db, 'course-materials');
        const enrolledCourseIds = enrolledCourses.map(c => c.id);

        for (const courseId of enrolledCourseIds) {
          const q = query(materialsRef, where('courseId', '==', courseId));
          const snapshot = await getDocs(q);
          const materials = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setCourseMaterials(prev => ({
            ...prev,
            [courseId]: materials
          }));
        }
      } catch (error) {
        console.error('Error fetching course materials:', error);
      }
    };

    fetchCourseMaterials();
  }, [enrolledCourses]);

  // Handle file download
  const handleDownloadFile = async (fileUrl: string, fileName: string) => {
    setDownloadingFile(fileName);
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
    } finally {
      setDownloadingFile(null);
    }
  };

  // Fetch uploads
  const fetchUploads = async (studentId: string) => {
    setUploadsLoading(true);
    try {
      console.log(`🔍 Fetching uploads for student: ${studentId}`);
      const response = await axios.get(`http://localhost:5000/api/uploads/student/${studentId}`);
      
      if (response.data.success && response.data.uploads) {
        console.log(`✅ Fetched ${response.data.uploads.length} uploads for student`);
        console.log('📋 Uploads data:', response.data.uploads);
        setUploads(response.data.uploads);
      } else {
        console.warn('⚠️ No uploads found in response or success is false');
        setUploads([]);
      }
    } catch (error: any) {
      console.error('❌ Error fetching uploads:', error.response?.data || error.message);
      setUploads([]);
    } finally {
      setUploadsLoading(false);
    }
  };

  // Helper: Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // Helper: Get file icon based on MIME type
  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '🎯';
    if (mimeType.includes('image')) return '🖼️';
    if (mimeType.includes('video')) return '🎬';
    if (mimeType.includes('audio')) return '🔊';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return '📦';
    return '📎';
  };

  // Helper: Format relative time
  const formatRelativeTime = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateString;
    }
  };

  // Helper: Filter uploads based on search and type
  const getFilteredUploads = (): Upload[] => {
    let filtered = [...uploads];

    // Search filter
    if (uploadsSearchTerm.trim()) {
      const term = uploadsSearchTerm.toLowerCase();
      filtered = filtered.filter(
        (upload) =>
          upload.originalFileName?.toLowerCase().includes(term) ||
          upload.assessmentTitle?.toLowerCase().includes(term) ||
          upload.courseCode?.toLowerCase().includes(term)
      );
    }

    // Type filter
    if (uploadsFilterType !== 'all') {
      filtered = filtered.filter((upload) => {
        if (uploadsFilterType === 'quizzes') return upload.assessmentType === 'quiz';
        if (uploadsFilterType === 'assignments') return upload.assessmentType === 'assignment';
        if (uploadsFilterType === 'recent') {
          // Recently uploaded (last 7 days)
          const uploadDate = new Date(upload.uploadedAt || upload.uploadedDate);
          const now = new Date();
          const daysOld = (now.getTime() - uploadDate.getTime()) / (1000 * 60 * 60 * 24);
          return daysOld <= 7;
        }
        return true;
      });
    }

    // Sort by most recent first
    return filtered.sort(
      (a, b) =>
        new Date(b.uploadedAt || b.uploadedDate).getTime() -
        new Date(a.uploadedAt || a.uploadedDate).getTime()
    );
  };

  // Fetch course descriptions with real-time updates
  useEffect(() => {
    if (enrolledCourses.length === 0) return;

    const unsubscribers: (() => void)[] = [];

    enrolledCourses.forEach(course => {
      const courseRef = doc(db, 'courses', course.id);
      const unsubscribe = onSnapshot(courseRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          setCourseDescriptions(prev => ({
            ...prev,
            [course.id]: data.description || 'No description available'
          }));
        }
      });
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [enrolledCourses]);

  // Register for a course
  const handleRegisterCourse = async (courseId: string) => {
    if (!currentUser) return;

    try {
      console.log("Starting registration for course:", courseId);

      // 1. Add course to user's registeredCourses array
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        registeredCourses: arrayUnion(courseId)
      });
      console.log("✅ Updated user document");

      // 2. Increment students count in the course document
      const courseRef = doc(db, 'courses', courseId);
      const courseDoc = await getDoc(courseRef);

      if (courseDoc.exists()) {
        const currentStudents = courseDoc.data().students || 0;
        console.log("Current students count:", currentStudents);

        await updateDoc(courseRef, {
          students: currentStudents + 1
        });
        console.log("✅ Updated course students count to:", currentStudents + 1);
      } else {
        console.error("❌ Course document not found");
      }

      setRegisteredCourseIds([...registeredCourseIds, courseId]);
      alert('Successfully registered for course!');

      // Notify assigned teacher about student registration (Firestore notification)
      try {
        const courseData = courseDoc.data() as any;
        const assignedTeacherId = courseData?.assignedTeacher || courseData?.teacherId || courseData?.teacherUID;
        if (assignedTeacherId) {
          await addDoc(collection(db, "notifications"), {
            recipientId: assignedTeacherId,
            recipientRole: "teacher",
            recipientType: "teacher",
            type: "student_enrolled_course",
            title: "New Student Enrolled",
            message: `${userData?.name || currentUser.displayName || "Student"} enrolled in ${courseData?.courseName || courseData?.courseTitle || courseId}`,
            courseId,
            courseName: courseData?.courseName || courseData?.courseTitle || courseId,
            studentId: currentUser.uid,
            studentName: userData?.name || currentUser.displayName || "Student",
            createdAt: Timestamp.now(),
            timestamp: Timestamp.now(),
            read: false
          });
          console.log("✅ Teacher notified (Firestore notification)");
        }
      } catch (error) {
        console.warn("⚠️ Failed to notify teacher:", error);
      }

      // Add notification to Firestore (only for student)
      await addDoc(collection(db, "notifications"), {
        userId: currentUser.uid,
        type: "success",
        title: "Course Registration",
        message: `You just registered for ${courseDoc.data().courseName || courseId}`,
        timestamp: Timestamp.now(),
        read: false,
        recipientRole: 'student'
      });

      // Add activity for admin recent activities
      await addDoc(collection(db, 'activities'), {
        type: 'course_registration',
        studentId: currentUser.uid,
        studentName: userData?.name || currentUser.displayName || 'Student',
        department: userData?.degree || 'Unknown',
        courseId,
        courseName: courseDoc.data().courseName || courseId,
        message: `${userData?.name || 'Student'} from ${userData?.degree || 'Unknown'} department just registered for ${courseDoc.data().courseName || courseId}`,
        timestamp: Timestamp.now()
      });
    } catch (error: any) {
      console.error('❌ Error registering course:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      alert('Failed to register for course: ' + error.message);
    }
  };

  // Updated attendance data - ALL months of the year
  const attendanceData: Record<string, { present: number; absent: number; total: number }> = {
    "January": { present: 16, absent: 4, total: 20 },
    "February": { present: 15, absent: 3, total: 18 },
    "March": { present: 18, absent: 2, total: 20 },
    "April": { present: 17, absent: 5, total: 22 },
    "May": { present: 19, absent: 1, total: 20 },
    "June": { present: 14, absent: 3, total: 17 },
    "July": { present: 20, absent: 2, total: 22 },
    "August": { present: 16, absent: 4, total: 20 },
    "September": { present: 18, absent: 2, total: 20 },
    "October": { present: 20, absent: 2, total: 22 },
    "November": { present: 14, absent: 1, total: 15 },
    "December": { present: 12, absent: 3, total: 15 },
  };
  const currentAttendance = attendanceData[selectedMonth];
  const attendancePercentage = ((currentAttendance.present / currentAttendance.total) * 100).toFixed(1);
  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Tasks state - updated with timestamp
  const [tasks, setTasks] = useState([
    { id: 1, title: "Complete ML Assignment", completed: false, createdAt: new Date('2024-11-14T10:30:00').toISOString() },
    { id: 2, title: "Study for Quiz", completed: true, createdAt: new Date('2024-11-13T14:20:00').toISOString() },
    { id: 3, title: "Review Database Notes", completed: false, createdAt: new Date('2024-11-14T09:15:00').toISOString() },
  ]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showTaskInput, setShowTaskInput] = useState(false);

  // Teachers data
  const teachers = [
    { id: 1, name: "Dr. Smith", initials: "DS" },
    { id: 2, name: "Prof. Johnson", initials: "PJ" },
    { id: 3, name: "Dr. Williams", initials: "DW" },
    { id: 4, name: "Prof. Brown", initials: "PB" },
  ];

  // Calendar functions
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek };
  };

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentDate);

  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };
  const isToday = (day: number) => {
    const today = new Date();
    return day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear();
  };

  // Task functions - updated to include timestamp
  const addTask = () => {
    if (newTaskTitle.trim()) {
      setTasks([...tasks, {
        id: Date.now(),
        title: newTaskTitle,
        completed: false,
        createdAt: new Date().toISOString()
      }]);
      setNewTaskTitle("");
      setShowTaskInput(false);
    }
  };

  const toggleTask = (id: number) => {
    setTasks(tasks.map(task =>
      task.id === id ? { ...task, completed: !task.completed } : task
    ));
  };

  const deleteTask = (id: number) => {
    setTasks(tasks.filter(task => task.id !== id));
  };

  // Format date for tasks
  const formatTaskDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleClearNotifications = () => markAllAsRead();
  const handleViewNotification = (notif: any) => {
    alert(`Viewing: ${notif.message}`);
  };

  const handleSidebarClose = () => setSidebarOpen(false);
  const handleSidebarToggle = () => setSidebarOpen((open) => !open);

  // My Uploads - placeholder for future implementation
  const allAssignments: any[] = [];

  const cardBg = "bg-gradient-to-br from-white via-secondary/10 to-primary/5";
  const accentBtn = "bg-gradient-to-r from-[#6a11cb] to-[#2575fc] text-white hover:opacity-90";
  const accentBorder = "border border-primary/30";
  return (
    <div className="relative min-h-screen bg-secondary/20">
      {/* Header - Full Width */}
      <header className="sticky top-0 z-50 bg-white shadow-md border-b border-primary/10">
        <div className="w-full px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              className="p-2 hover:bg-gray-100 rounded-lg transition-all"
              onClick={handleSidebarToggle}
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
                Welcome back, {userName}!
              </h2>
              <p className="text-xs text-gray-600">Have a great day of learning</p>
            </div>
          </div>

          <div className="flex items-center gap-3 pr-6 relative">
            {/* Notifications */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="relative cursor-pointer group p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label="Notifications"
                  tabIndex={0}
                  role="button"
                >
                  <Bell className="h-5 w-5 text-primary transition-all group-hover:scale-110" />
                  {recentNotifications.length > 0 && (
                    <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-semibold">
                      {recentNotifications.length}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-96 p-0 shadow-2xl border-2" align="end">
                {/* Header */}
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
                    onClick={handleClearNotifications}
                  >
                    Clear all
                  </button>
                </div>
                {/* Notifications List */}
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
                      ) : recentNotifications.map((notif) => (
                        <div
                          key={notif.id}
                          className="group rounded-lg p-3 flex items-start gap-3 bg-white border border-gray-200 hover:border-primary/50 transition-all cursor-pointer shadow-sm hover:shadow-md relative"
                        >
                          <div className={`h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-full ${notif.type === 'warning' ? 'bg-red-100' :
                            notif.type === 'success' ? 'bg-green-100' :
                              'bg-blue-100'
                            }`}>
                            {notif.type === 'warning' && <AlertCircle className="h-5 w-5 text-red-600" />}
                            {notif.type === 'success' && <CheckCircle className="h-5 w-5 text-green-600" />}
                            {notif.type === 'info' && <Info className="h-5 w-5 text-blue-600" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900 text-sm mb-1">{notif.title}</div>
                            {notif.message && (
                              <div className="text-xs text-gray-600 mb-2">{notif.message}</div>
                            )}
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>
                                {(() => {
                                  try {
                                    // Handle local notifications with time field
                                    if (notif.time) return notif.time;
                                    
                                    // Handle Firebase notifications with timestamp/createdAt
                                    const timestamp = notif.createdAt || notif.timestamp;
                                    if (!timestamp || timestamp === null || timestamp === undefined) {
                                      return 'Just now';
                                    }
                                    
                                    let date;
                                    if (typeof timestamp?.toDate === 'function') {
                                      date = timestamp.toDate();
                                    } else if (timestamp instanceof Date) {
                                      date = timestamp;
                                    } else if (typeof timestamp === 'string') {
                                      date = new Date(timestamp);
                                    } else if (typeof timestamp === 'number') {
                                      date = new Date(timestamp);
                                    } else {
                                      return 'Just now';
                                    }
                                    
                                    if (!date || isNaN(date.getTime())) {
                                      return 'Just now';
                                    }
                                    
                                    return formatDistanceToNow(date, { addSuffix: true });
                                  } catch (error) {
                                    console.error('Error formatting notification time:', error);
                                    return 'Just now';
                                  }
                                })()}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setNotifications(prev => prev.filter(n => n.id !== notif.id));
                            }}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-100 rounded"
                            aria-label="Dismiss notification"
                          >
                            <X className="h-4 w-4 text-gray-500 hover:text-gray-700" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  {/* View All Button - Fixed at bottom */}
                  {recentNotifications.length > 0 && (
                    <div className="absolute left-0 right-0 bottom-0 p-3 bg-gradient-to-t from-white via-white to-transparent">
                      <Button
                        size="sm"
                        className="w-full bg-primary hover:bg-primary/90 text-white font-semibold shadow-lg"
                        onClick={() => navigate('/student/notifications')}
                      >
                        View All Notifications
                      </Button>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* AI Chatbot */}
            <button
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              onClick={() => setChatbotOpen(true)}
              aria-label="AI Chatbot"
            >
              <Bot className="h-5 w-5 text-primary" />
            </button>
          </div>
        </div>
      </header>

      {/* Left Sidebar - Brain Menu (Overlay) */}
      {sidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />

          {/* Sidebar - Modern Design */}
          <aside className="fixed top-0 left-0 h-full w-64 z-50 bg-gradient-to-b from-white to-gray-50 shadow-2xl flex flex-col">
            {/* Header with Avatar */}
            <div className="p-6 bg-gradient-to-br from-primary/10 to-primary/5 border-b border-primary/10">
              <div className="flex flex-col items-center gap-3">
                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg ring-4 ring-white">
                  <span className="text-white font-bold text-xl">{getInitials(userName)}</span>
                </div>
                <div className="text-center">
                  <h3 className="text-base font-bold text-gray-900">{userName}</h3>
                  <p className="text-xs text-primary font-medium">Student</p>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4">
              <ul className="flex flex-col gap-1">
                <li>
                  <button
                    onClick={() => { navigate('/student-dashboard'); setSidebarOpen(false); }}
                    className="w-full px-4 py-3 text-center rounded-xl text-gray-700 hover:bg-primary hover:text-white transition-all duration-200 font-medium"
                  >
                    Dashboard
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => { navigate('/student/courses'); setSidebarOpen(false); }}
                    className="w-full px-4 py-3 text-center rounded-xl text-gray-700 hover:bg-primary hover:text-white transition-all duration-200 font-medium"
                  >
                    Courses & Materials
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => { navigate('/student/assessments'); setSidebarOpen(false); }}
                    className="w-full px-4 py-3 text-center rounded-xl text-gray-700 hover:bg-primary hover:text-white transition-all duration-200 font-medium"
                  >
                    My Assessments
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => { navigate('/student/feedback'); setSidebarOpen(false); }}
                    className="w-full px-4 py-3 text-center rounded-xl text-gray-700 hover:bg-primary hover:text-white transition-all duration-200 font-medium"
                  >
                    Feedback
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => { navigate('/performance'); setSidebarOpen(false); }}
                    className="w-full px-4 py-3 text-center rounded-xl text-gray-700 hover:bg-primary hover:text-white transition-all duration-200 font-medium"
                  >
                    Performance
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => { navigate('/student/help-desk'); setSidebarOpen(false); }}
                    className="w-full px-4 py-3 text-center rounded-xl text-gray-700 hover:bg-primary hover:text-white transition-all duration-200 font-medium"
                  >
                    Help Desk
                  </button>
                </li>
              </ul>
            </nav>

            {/* Logout Button */}
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={async () => {
                  const userId = auth.currentUser?.uid;
                  if (userId) {
                    await trackUserLogout(userId);
                  }
                  await signOut(auth);
                  navigate('/');
                  setSidebarOpen(false);
                }}
                className="flex items-center justify-center gap-3 w-full px-4 py-3 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-xl transition-all duration-200 font-semibold"
              >
                <LogOut className="h-5 w-5" />
                Logout
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Main Layout - Center Content + Right Calendar Sidebar */}
      <div className="flex">
        {/* Center Content Area */}
        <div className="flex-1 min-w-0">
          <div className="px-6 py-8 max-w-6xl mx-auto">            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
              {/* Current GPA - Coming Soon */}
              <Card className="group hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 bg-white border-2 border-gray-200 hover:border-green-500 rounded-xl overflow-hidden">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="p-3 bg-green-50 dark:bg-green-500/10 rounded-xl border-2 border-green-200 dark:border-green-500/20 group-hover:scale-110 transition-transform duration-300">
                      <TrendingUp className="h-6 w-6 text-green-600" />
                    </div>
                    <CardTitle className="text-sm font-bold text-black">Current GPA</CardTitle>
                    <div className="text-sm font-semibold text-gray-600">Coming Soon</div>
                  </div>
                </CardContent>
              </Card>

              {/* Enrolled Courses - Real-time */}
              <Card className="group hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 bg-white border-2 border-gray-200 hover:border-orange-500 rounded-xl overflow-hidden">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="p-3 bg-orange-50 dark:bg-orange-500/10 rounded-xl border-2 border-orange-200 dark:border-orange-500/20 group-hover:scale-110 transition-transform duration-300">
                      <BookOpen className="h-6 w-6 text-orange-600" />
                    </div>
                    <CardTitle className="text-sm font-bold text-black">Enrolled Courses</CardTitle>
                    <div className="text-3xl font-bold text-black">{enrolledCourses.length}</div>
                    <p className="text-xs text-muted-foreground">Active courses</p>
                  </div>
                </CardContent>
              </Card>

              {/* Submissions - Real-time */}
              <Card className="group hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 bg-white border-2 border-gray-200 hover:border-blue-500 rounded-xl overflow-hidden">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl border-2 border-blue-200 dark:border-blue-500/20 group-hover:scale-110 transition-transform duration-300">
                      <FileText className="h-6 w-6 text-blue-600" />
                    </div>
                    <CardTitle className="text-sm font-bold text-black">Submissions</CardTitle>
                    {uploadsLoading ? (
                      <div className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading…
                      </div>
                    ) : (
                      <div className="text-3xl font-bold text-black">{uploads.length}</div>
                    )}
                    <p className="text-xs text-muted-foreground">Total submissions</p>
                  </div>
                </CardContent>
              </Card>

              {/* Average Grade - Coming Soon */}
              <Card className="group hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 bg-white border-2 border-gray-200 hover:border-pink-500 rounded-xl overflow-hidden">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="p-3 bg-pink-50 dark:bg-pink-500/10 rounded-xl border-2 border-pink-200 dark:border-pink-500/20 group-hover:scale-110 transition-transform duration-300">
                      <BarChart3 className="h-6 w-6 text-pink-600" />
                    </div>
                    <CardTitle className="text-sm font-bold text-black">Average Grade</CardTitle>
                    <div className="text-sm font-semibold text-gray-600">Coming Soon</div>
                  </div>
                </CardContent>
              </Card>

              {/* Improvement Rate - Coming Soon */}
              <Card className="group hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 bg-white border-2 border-gray-200 hover:border-yellow-500 rounded-xl overflow-hidden">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-500/10 rounded-xl border-2 border-yellow-200 dark:border-yellow-500/20 group-hover:scale-110 transition-transform duration-300">
                      <Award className="h-6 w-6 text-yellow-600" />
                    </div>
                    <CardTitle className="text-sm font-bold text-black">Improvement</CardTitle>
                    <div className="text-sm font-semibold text-gray-600">Coming Soon</div>
                  </div>
                </CardContent>
              </Card>
            </div>{/* Calendar & Enrolled Courses Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Calendar Section */}
              <Card className="border-primary/20 shadow-sm">
                <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-xl border-b border-primary/10">
                  <h3 className="text-lg font-bold text-black">Calendar</h3>
                </CardHeader>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-gray-700">
                      {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                    </p>
                    <div className="flex gap-1 bg-primary rounded-md">
                      <button onClick={previousMonth} className="p-1.5 hover:bg-primary/90 rounded-l-md transition-colors">
                        <ChevronLeft className="h-4 w-4 text-white" />
                      </button>
                      <button onClick={nextMonth} className="p-1.5 hover:bg-primary/90 rounded-r-md transition-colors">
                        <ChevronRight className="h-4 w-4 text-white" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center mb-1">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                      <div key={day} className="text-xs font-medium text-gray-500 p-1">
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 p-2 rounded-lg">
                    {Array.from({ length: startingDayOfWeek }).map((_, i) => (
                      <div key={`empty-${i}`} className="p-2"></div>
                    ))}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const day = i + 1;
                      const isPast = new Date(currentDate.getFullYear(), currentDate.getMonth(), day) < new Date(new Date().setHours(0, 0, 0, 0));
                      return (
                        <button
                          key={day}
                          className={`p-2 text-sm rounded-lg transition-all relative flex items-center justify-center
                            ${isToday(day) ? 'bg-primary text-white font-semibold hover:bg-primary/90' :
                              isPast ? 'text-gray-300 hover:bg-gray-50' : 'text-gray-700 hover:bg-gray-100'}
                          `}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>              {/* Enrolled Courses */}
              <Card className="bg-white border border-primary/15 rounded-xl shadow-sm">
                <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-xl border-b border-primary/10">
                  <h3 className="text-lg font-bold text-black">Enrolled Courses</h3>
                </CardHeader>
                <CardContent className="pt-4 pb-4">
                  <CardDescription className="text-xs text-muted-foreground mb-3">
                    Your current semester courses
                  </CardDescription>
                  <ScrollArea className="h-[280px] pr-4">
                    {enrolledCourses.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-64">
                        <BookOpen className="h-16 w-16 text-muted-foreground mb-4" />
                        <h3 className="text-xl font-semibold mb-2">No Courses Enrolled</h3>
                        <p className="text-muted-foreground text-center">Register for courses to see them here</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {enrolledCourses.map((course, index) => {
                          const brightColors = [
                            'bg-gradient-to-r from-pink-400 via-purple-400 to-indigo-400',
                            'bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400',
                            'bg-gradient-to-r from-green-400 via-teal-400 to-blue-400',
                            'bg-gradient-to-r from-fuchsia-400 via-pink-400 to-red-400',
                            'bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400'
                          ];
                          const colorClass = brightColors[index % brightColors.length];
                          const materials = courseMaterials[course.id] || [];
                          const isExpanded = expandedMaterialsCourse === course.id;

                          return (
                            <div key={course.id} className="border border-primary/10 rounded-lg overflow-hidden">
                              <div
                                className={`p-4 ${colorClass} text-white hover:shadow-md transition-all group cursor-pointer`}
                                onClick={() => navigate(`/student/courses?courseId=${encodeURIComponent(course.id)}`)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    navigate(`/student/courses?courseId=${encodeURIComponent(course.id)}`);
                                  }
                                }}
                              >
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex items-start gap-3 flex-1">
                                    <div className="p-2 rounded-lg bg-white/20">
                                      <BookOpen className="h-5 w-5" />
                                    </div>
                                    <div className="flex-1">
                                      <h4 className="font-bold group-hover:text-white transition-colors">
                                        {course.courseId}
                                      </h4>
                                      <p className="text-sm mt-0.5">{course.courseName}</p>
                                      <p className="text-xs mt-1">
                                        Instructor: {course.teacherName}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant="outline"
                                      className="text-xs font-semibold bg-white/20 border-white/40 text-white"
                                    >
                                      {course.creditHours} CH
                                    </Badge>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={(e) => e.stopPropagation()}
                                          className="h-8 w-8 p-0 bg-white/20 hover:bg-white/30 text-white"
                                        >
                                          <MoreVertical className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setDescriptionDialog({ open: true, course });
                                          }}
                                        >
                                          <Info className="h-4 w-4 mr-2" />
                                          View Description
                                        </DropdownMenuItem>
                                        {(() => {
                                          // Use same logic as verification
                                          const courseIdentifier = course.courseCode || course.courseId;
                                          const syllabus = mongoSyllabusStatus[courseIdentifier];
                                          
                                          console.log(`🎨 RENDER: ${courseIdentifier}`, {
                                            courseCode: course.courseCode,
                                            courseId: course.courseId,
                                            hasSyllabus: syllabus?.hasSyllabus,
                                            syllabusURL: syllabus?.syllabusURL
                                          });
                                          
                                          if (!syllabus?.hasSyllabus) {
                                            return null;
                                          }
                                          
                                          return (
                                            <DropdownMenuItem
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const syllabusURL = syllabus.syllabusURL;
                                                const fileName = `${courseIdentifier}-Syllabus.pdf`;
                                                if (syllabusURL) {
                                                  console.log(`📥 DOWNLOAD: ${syllabusURL}`);
                                                  handleDownloadFile(syllabusURL, fileName);
                                                }
                                              }}
                                            >
                                              <FileText className="h-4 w-4 mr-2" />
                                              Download Syllabus
                                            </DropdownMenuItem>
                                          );
                                        })()}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </div>

                                {/* Syllabus Download Button (visible on card) */}
                                {(() => {
                                  const courseIdentifier = course.courseCode || course.courseId;
                                  const syllabus = mongoSyllabusStatus[courseIdentifier];
                                  if (!syllabus?.hasSyllabus || !syllabus.syllabusURL) return null;

                                  return (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const fileName = `${courseIdentifier}-Syllabus.pdf`;
                                        handleDownloadFile(syllabus.syllabusURL, fileName);
                                      }}
                                      className="w-full mt-2 bg-white/25 hover:bg-white/35 text-white border border-white/30 text-xs"
                                    >
                                      <FileText className="h-4 w-4 mr-2" />
                                      Download Syllabus
                                    </Button>
                                  );
                                })()}

                                {/* Materials Toggle Button */}
                                {materials.length > 0 && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedMaterialsCourse(isExpanded ? null : course.id);
                                    }}
                                    className="w-full mt-3 bg-white/20 text-white hover:bg-white/30 text-xs"
                                  >
                                    <ChevronDown className={`h-4 w-4 mr-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                    {materials.length} Material{materials.length !== 1 ? 's' : ''} Available
                                  </Button>
                                )}
                              </div>

                              {/* Materials List */}
                              {isExpanded && materials.length > 0 && (
                                <div className="bg-gray-50 p-4 space-y-2">
                                  {materials.map((material) => (
                                    <div
                                      key={material.id}
                                      className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-primary/30 transition-colors"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm text-black truncate">
                                          {material.fileName}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                          Uploaded by {material.uploadedByName} • {material.uploadedAt?.toDate?.().toLocaleDateString() || 'N/A'}
                                        </p>
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleDownloadFile(material.downloadURL, material.fileName)}
                                        disabled={downloadingFile === material.fileName}
                                        className="ml-2 gap-1"
                                      >
                                        {downloadingFile === material.fileName ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Download className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>

                  {/* Available Courses to Register */}
                  {availableCourses.filter(c => !registeredCourseIds.includes(c.id)).length > 0 && (
                    <div className="mt-6 pt-6 border-t">
                      <h4 className="text-sm font-bold text-primary mb-3">Available Courses</h4>
                      <div className="space-y-3">
                        {availableCourses
                          .filter(course => !registeredCourseIds.includes(course.id))
                          .map((course) => (
                            <div
                              key={course.id}
                              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-all"
                            >
                              <div>
                                <p className="font-semibold text-sm text-black">{course.courseId} - {course.courseName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {course.creditHours} CH • {course.teacherName}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => handleRegisterCourse(course.id)}
                                className="bg-primary hover:bg-primary/90"
                              >
                                Register
                              </Button>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>            </div>            {/* Main Content Grid - 70% Left + 30% Right - Matching Widths */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">              {/* Left Column - My Uploads */}
              <Card className="bg-gradient-to-br from-white via-blue-50/30 to-primary/5 border border-primary/30 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 flex flex-col overflow-hidden">
                <CardHeader className="border-b border-primary/20 pb-4 bg-gradient-to-r from-primary/10 to-transparent">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl">
                      <Upload className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900">My Uploads</h3>
                      <p className="text-sm text-gray-600 mt-1">Your submitted assignments and assessments</p>
                    </div>
                    {uploads.length > 0 && (
                      <Badge className="bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30">{uploads.length}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden flex flex-col p-4 gap-4">
                  {/* Search and Filter Bar */}
                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                    {/* Search Input */}
                    <div className="flex-1 relative w-full">
                      <Input
                        placeholder="Search by filename, assignment, or course..."
                        value={uploadsSearchTerm}
                        onChange={(e) => setUploadsSearchTerm(e.target.value)}
                        className="pl-10 h-10 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                      <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    </div>

                    {/* Filter Dropdown */}
                    <Select
                      value={uploadsFilterType}
                      onValueChange={(value: any) => setUploadsFilterType(value)}
                    >
                      <SelectTrigger className="w-full sm:w-48 h-10 bg-white border border-gray-200 rounded-lg hover:border-primary/50">
                        <SelectValue placeholder="Filter uploads" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Uploads</SelectItem>
                        <SelectItem value="quizzes">Quizzes</SelectItem>
                        <SelectItem value="assignments">Assignments</SelectItem>
                        <SelectItem value="recent">Recent (7 days)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Uploads Grid */}
                  {uploads.length > 0 ? (
                    <ScrollArea className="h-full flex-1">
                      {getFilteredUploads().length > 0 ? (
                        <div className="grid grid-cols-1 gap-3 pr-4">
                          {getFilteredUploads().map((upload) => (
                            <div
                              key={upload._id}
                              className="group relative w-full bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-lg hover:border-primary/40 transition-all duration-300 ease-out overflow-hidden hover:-translate-y-0.5"
                            >
                              {/* Decorative accent */}
                              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-primary/5 to-transparent rounded-full -mr-6 -mt-6 group-hover:from-primary/10 transition-all duration-300 pointer-events-none" />

                              {/* Main Content Container */}
                              <div className="relative z-10 p-4 flex gap-4">
                                {/* File Icon */}
                                <div className="flex-shrink-0">
                                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                                    <span className="text-2xl">{getFileIcon(upload.mimeType)}</span>
                                  </div>
                                </div>

                                {/* File Info */}
                                <div className="flex-1 min-w-0">
                                  {/* File Name and Type */}
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex-1 min-w-0">
                                      <h4 className="text-sm font-bold text-gray-900 truncate hover:text-primary transition-colors" title={upload.originalFileName}>
                                        {upload.originalFileName}
                                      </h4>
                                      <p className="text-xs text-gray-500 mt-0.5">{formatFileSize(upload.fileSize)}</p>
                                    </div>
                                    {(upload.isLate || upload.isLateSubmission) && (
                                      <Badge variant="destructive" className="text-xs font-semibold flex-shrink-0">
                                        Late
                                      </Badge>
                                    )}
                                  </div>

                                  {/* Metadata Row */}
                                  <div className="flex items-center flex-wrap gap-2 mb-3 text-xs text-gray-600">
                                    <Badge variant="outline" className="text-xs bg-primary/5 border-primary/20 text-primary">
                                      {upload.assessmentType === 'quiz' ? '🎯 Quiz' : '📋 Assignment'}
                                    </Badge>
                                    {upload.courseCode && (
                                      <>
                                        <span className="text-gray-300">•</span>
                                        <Badge variant="secondary" className="text-xs bg-blue-50 border-blue-200 text-blue-700">
                                          {upload.courseCode}
                                        </Badge>
                                      </>
                                    )}
                                    <span className="text-gray-300">•</span>
                                    <span className="text-gray-500">{formatRelativeTime(upload.uploadedAt || upload.uploadedDate)}</span>
                                  </div>

                                  {/* Course/Assessment Info */}
                                  <p className="text-xs text-gray-600 truncate">
                                    <BookOpen className="h-3 w-3 inline mr-1 text-primary/60" />
                                    {upload.assessmentTitle}
                                  </p>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDownloadFile(upload.fileUrl, upload.originalFileName)}
                                    disabled={downloadingFile === upload.originalFileName}
                                    className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
                                    title="Download"
                                  >
                                    {downloadingFile === upload.originalFileName ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Download className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDeletingUploadId(deletingUploadId === upload._id ? null : upload._id)}
                                    className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>

                              {/* Delete Confirmation */}
                              {deletingUploadId === upload._id && (
                                <div className="border-t border-gray-100 bg-red-50 px-4 py-3 flex items-center justify-between gap-2">
                                  <p className="text-xs text-red-800 font-medium">Delete this upload?</p>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setDeletingUploadId(null)}
                                      className="h-7 px-2 text-xs"
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => {
                                        setUploads(uploads.filter(u => u._id !== upload._id));
                                        setDeletingUploadId(null);
                                      }}
                                      className="h-7 px-2 text-xs"
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <div className="p-4 bg-gray-100 rounded-full mb-4">
                            <Search className="h-8 w-8 text-gray-400" />
                          </div>
                          <p className="text-sm font-semibold text-gray-900 mb-1">No uploads found</p>
                          <p className="text-xs text-gray-500">Try adjusting your search or filter</p>
                        </div>
                      )}
                    </ScrollArea>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="flex flex-col items-center justify-center text-center space-y-4">
                        <div className="p-5 bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl">
                          <Upload className="h-12 w-12 text-primary/40" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900 mb-1">No Uploads Yet</p>
                          <p className="text-xs text-gray-500 max-w-xs">
                            Your submitted assignments and quiz answers will appear here
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>              {/* Right Column - Tasks & Teachers */}
              <div className="space-y-6">
                {/* Tasks Section */}
                <Card className="border-primary/20 shadow-sm h-[285px] flex flex-col">
                  <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-xl border-b border-primary/10">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-black">Your Tasks</h3>
                      <Button
                        size="sm"
                        onClick={() => setShowTaskInput(!showTaskInput)}
                        className="bg-primary hover:bg-primary/90"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>                  </CardHeader>
                  <CardContent className="space-y-2 flex-1 overflow-hidden pt-4">
                    {showTaskInput && (
                      <div className="flex gap-2 mb-3">
                        <Input
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          placeholder="New task..."
                          className="text-sm"
                          onKeyPress={(e) => e.key === 'Enter' && addTask()}
                        />
                        <Button size="sm" onClick={addTask} className="bg-primary hover:bg-primary/90">
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setShowTaskInput(false)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    <ScrollArea className="h-[180px] bg-gradient-to-br from-primary/5 via-transparent to-primary/5 p-2 rounded-lg">
                      <div className="pr-4 space-y-2">
                        {tasks.map((task) => (
                          <div
                            key={task.id}
                            className="flex items-start gap-2 p-2 rounded-lg hover:bg-primary/5 transition-colors mb-2"
                          >
                            <button
                              onClick={() => toggleTask(task.id)}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all mt-0.5 flex-shrink-0
                                ${task.completed ? 'bg-primary border-primary' : 'border-primary/30 hover:border-primary'}
                              `}
                            >
                              {task.completed && <Check className="h-3 w-3 text-white" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <span className={`text-sm block ${task.completed ? 'line-through text-muted-foreground' : 'text-black'} truncate`}>
                                {task.title}
                              </span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-muted-foreground/70">
                                  {formatTaskDate(task.createdAt)}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => deleteTask(task.id)}
                              className="p-1 hover:bg-red-100 rounded transition-colors flex-shrink-0"
                              aria-label="Delete task"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>                {/* Teachers Section */}
                <Card className="border-primary/20 shadow-sm h-[285px] flex flex-col">
                  <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-xl border-b border-primary/10">
                    <h3 className="text-lg font-bold text-black">Your Teachers</h3>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-hidden pt-4">
                    <ScrollArea className="h-full">
                      {enrolledTeachers.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-sm text-muted-foreground">No teachers yet</p>
                          <p className="text-xs text-muted-foreground mt-1">Register for courses to see your teachers</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          {enrolledTeachers.map((teacher) => (
                            <div
                              key={teacher.id}
                              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-primary/5 transition-all cursor-pointer group"
                            >
                              <Avatar className="h-16 w-16 bg-primary/20 group-hover:scale-110 transition-transform">
                                <AvatarFallback className="bg-primary text-white font-bold">
                                  {teacher.initials}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-xs font-semibold text-center text-black group-hover:text-primary transition-colors">
                                {teacher.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chatbot Modal */}
      <ChatbotModal
        isOpen={chatbotOpen}
        onClose={() => setChatbotOpen(false)}
        userName={userName}
      />

      {/* Course Description Dialog */}
      <Dialog open={descriptionDialog.open} onOpenChange={(open) => setDescriptionDialog({ open, course: open ? descriptionDialog.course : null })}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              {descriptionDialog.course?.courseName || 'Course Description'}
            </DialogTitle>
            <DialogDescription>
              {descriptionDialog.course?.courseId} - Detailed course information
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold text-gray-900 mb-2">Course Description</h4>
              <p className="text-gray-700 leading-relaxed">
                {courseDescriptions[descriptionDialog.course?.id] || 'No description available for this course.'}
              </p>
            </div>
            {descriptionDialog.course && (
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-600">Course Code:</span>
                  <p className="text-gray-900">{descriptionDialog.course.courseId}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Credit Hours:</span>
                  <p className="text-gray-900">{descriptionDialog.course.creditHours} CH</p>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Instructor:</span>
                  <p className="text-gray-900">{descriptionDialog.course.teacherName}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Status:</span>
                  <p className="text-gray-900">Enrolled</p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Syllabus Dialog */}
      <Dialog open={syllabusDialog.open} onOpenChange={(open) => {
        setSyllabusDialog({ open, course: open ? syllabusDialog.course : null });
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {syllabusDialog.course?.courseName || 'Course Syllabus'}
            </DialogTitle>
            <DialogDescription>
              {syllabusDialog.course?.courseId} - Course syllabus and learning objectives
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {syllabusDialog.course?.syllabusURL ? (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(syllabusDialog.course.syllabusURL, '_blank')}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Open in New Tab
                  </Button>
                </div>
                <object
                  data={syllabusDialog.course.syllabusURL}
                  type="application/pdf"
                  className="w-full h-[60vh] border rounded-lg bg-gray-50"
                  aria-label={`${syllabusDialog.course.courseName} Syllabus`}
                >
                  <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                    <p className="text-gray-500 mb-2">Unable to display PDF directly.</p>
                    <Button
                      variant="outline"
                      onClick={() => window.open(syllabusDialog.course.syllabusURL, '_blank')}
                    >
                      Download Syllabus
                    </Button>
                  </div>
                </object>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Syllabus not available for this course.</p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e0e0e0;
          border-radius: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>
    </div>
  );
};

export default StudentDashboard;