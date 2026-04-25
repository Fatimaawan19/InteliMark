import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  BookOpen,
  ChevronLeft,
  Users,
  Clock,
  FileText,
  Search,
  Filter,
  ChevronDown,
  User,
  Mail,
  GraduationCap,
  Edit,
  Settings,
  MessageSquare,
  FileUp,
  CheckCircle,
  AlertCircle,
  Archive,
  Trash2,
  X,
  Save,
  Download,
  Loader
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { db, auth } from '../../firebase';
import { collection, getDocs, query, where, doc, getDoc, onSnapshot, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';

interface Student {
  id: string;
  name: string;
  email: string;
  degree: string;
  enrollmentDate: string;
}

interface Course {
  id: string;
  courseName: string;
  courseCode: string;
  description: string;
  degree: string;
  students: Student[];
  totalStudents: number;
  credits: number;
  semester: string;
  assignedAt: any;
  syllabusUploaded: boolean;
  syllabusURL?: string;
  syllabusFileName?: string;
  mongodbCourseId?: string;
  closExtracted?: number;
  syllabusUploadedAt?: Date | string | null;
  status: 'active' | 'inactive' | 'completed';
  allowSubmissions: boolean;
}

const TeacherCourses: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDegree, setFilterDegree] = useState<string>('all');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [uploadingCourseId, setUploadingCourseId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedFileForUpload, setSelectedFileForUpload] = useState<File | null>(null);
  const [materialSourceType, setMaterialSourceType] = useState<'slides' | 'book'>('slides');
  const [courseMaterialsCount, setCourseMaterialsCount] = useState<{ [key: string]: number }>({});
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const syllabusInputRef = React.useRef<HTMLInputElement>(null);
  const [uploadingSyllabus, setUploadingSyllabus] = useState(false);
  const [syllabusUploadCourseId, setSyllabusUploadCourseId] = useState<string | null>(null);
  const [selectedSyllabusFile, setSelectedSyllabusFile] = useState<File | null>(null);

  // Announcement states
  const [showAnnouncementDialog, setShowAnnouncementDialog] = useState(false);
  const [announcementCourseId, setAnnouncementCourseId] = useState<string | null>(null);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [announcementPriority, setAnnouncementPriority] = useState('normal');
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);
  const [showSyllabusDialog, setShowSyllabusDialog] = useState(false);

  // MongoDB status tracking - Real source of truth
  const [mongodbSyllabusStatus, setMongodbSyllabusStatus] = useState<{ [courseCode: string]: boolean }>({});
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);
  const syncIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Debug: Log when filteredCourses changes (commented out to prevent terminal spam)
  useEffect(() => {
    // Logging disabled - see syncMongodbStatus for status updates
  }, [filteredCourses]);

  // Real-time sync with MongoDB to prevent stale data
  const syncMongodbStatus = async () => {
    if (!currentUser) return;

    try {
      // console.log(`\n${'='.repeat(70)}`);
      // console.log(`🔍 [SYNC START] Fetching MongoDB status for teacher: ${currentUser.uid}`);
      const response = await fetch(`http://localhost:5000/api/courses/teacher/${currentUser.uid}/syllabus-status`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // console.log(`🔄 [SYNC] Received MongoDB data for ${data.syllabusStatus.length} courses`);

          // Update courses with ACTUAL MongoDB data - completely replace local assumptions
          setCourses(prevCourses => {
            // Firestore courses loaded for matching

            const updated = prevCourses.map(course => {
              // Try exact code match first
              let mongoStatus = data.syllabusStatus.find((s: any) => s.courseCode === course.courseCode);

              // If no match and firestore courseCode is "N/A", try matching by courseName
              if (!mongoStatus && course.courseCode === 'N/A' && course.courseName) {
                const normalizedName = course.courseName.toUpperCase().trim();
                mongoStatus = data.syllabusStatus.find((s: any) =>
                  (s.courseTitle || '').toUpperCase().trim() === normalizedName ||
                  (s.courseCode || '').toUpperCase().trim() === normalizedName
                );
                if (mongoStatus) {
                  // console.log(`[MATCH] Firestore course "${course.courseName}" matched MongoDB "${mongoStatus.courseCode}" (${mongoStatus.courseTitle})`);
                }
              }

              // If still no match, try case-insensitive normalization
              if (!mongoStatus && course.courseCode && course.courseCode !== 'N/A') {
                const normalizedFirestoreCode = course.courseCode.toUpperCase().trim();
                mongoStatus = data.syllabusStatus.find((s: any) =>
                  s.courseCode.toUpperCase().trim() === normalizedFirestoreCode
                );
              }

              if (mongoStatus) {
                // console.log(`✅ [SYNC] ${mongoStatus.courseCode} (${mongoStatus.courseTitle}) -> hasSyllabus: ${mongoStatus.hasSyllabus}`);
                // State update in progress
                return {
                  ...course,
                  courseCode: mongoStatus.courseCode,
                  syllabusUploaded: mongoStatus.hasSyllabus,
                  closExtracted: mongoStatus.closExtracted,
                  syllabusURL: mongoStatus.syllabusUrl,
                  syllabusUploadedAt: mongoStatus.syllabusUploadedAt,
                  mongodbCourseId: mongoStatus.courseId
                };
              } else {
                console.warn(`⚠️ [SYNC] "${course.courseName}" (code: ${course.courseCode}) NOT FOUND in MongoDB response`);
              }
              return course;
            });
            // State prepared for update
            return updated;
          });

          // DO NOT update filteredCourses directly here - let the search/filter useEffect handle it
          // The useEffect depends on `courses`, so updating courses will trigger it automatically

          // Also build map for quick lookups
          const statusMap: { [courseCode: string]: boolean } = {};
          data.syllabusStatus.forEach((s: any) => {
            statusMap[s.courseCode] = s.hasSyllabus;
          });
          setMongodbSyllabusStatus(statusMap);
          setLastSyncTime(Date.now());
          // console.log(`✅ [SYNC END] Status map updated`);
        }
      }
    } catch (error) {
      console.error('⚠️ Error syncing MongoDB status:', error);
    }
  };

  // Sync materials count for all courses to ensure accurate counter
  const syncMaterialsCounts = async () => {
    if (courses.length === 0) return;

    try {
      const countEntries = await Promise.all(
        courses.map(async (course) => {
          try {
            // Prefer Firestore course doc id (externalCourseId) because uploads always save it.
            // This avoids "0 materials" when Mongo courseId mapping is missing/mismatched.
            const resByExternal = await fetch(
              `http://localhost:5000/api/courses/materials-by-external/${course.id}`
            );
            if (resByExternal.ok) {
              const result = await resByExternal.json();
              const count =
                typeof result.numberOfMaterials === "number"
                  ? result.numberOfMaterials
                  : Array.isArray(result.materials)
                    ? result.materials.length
                    : 0;
              return [course.id, count] as const;
            }

            // Fallback: Mongo courseId route (legacy)
            if (course.mongodbCourseId) {
              const response = await fetch(
                `http://localhost:5000/api/courses/materials-list/${course.mongodbCourseId}`
              );
              if (response.ok) {
                const result = await response.json();
                const count =
                  typeof result.numberOfMaterials === "number"
                    ? result.numberOfMaterials
                    : Array.isArray(result.materials)
                      ? result.materials.length
                      : 0;
                return [course.id, count] as const;
              }
            }

            return [course.id, 0] as const;
          } catch {
            return [course.id, 0] as const;
          }
        })
      );

      setCourseMaterialsCount(Object.fromEntries(countEntries));
    } catch (error) {
      console.error('⚠️ Error syncing materials counts:', error);
    }
  };

  // Set up periodic sync with MongoDB (every 5 seconds for fresh data)
  useEffect(() => {
    if (!currentUser) return;

    // Sync every 5 seconds to keep state fresh
    syncIntervalRef.current = setInterval(() => {
      syncMongodbStatus();
      syncMaterialsCounts(); // Also sync materials counts
    }, 5000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [currentUser, courses]);

  // Helper function to format teacher name from displayName or email
  const getFormattedTeacherName = (user: any): string => {
    if (user?.displayName) {
      // Split displayName and capitalize first letter of each word
      return user.displayName
        .split(' ')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }

    // Fallback: Extract name from email (before @)
    if (user?.email) {
      const emailName = user.email.split('@')[0];
      // Convert camelCase or snake_case to proper names
      return emailName
        .replace(/[._-]/g, ' ')
        .split(' ')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }

    return 'Teacher';
  };

  // Fetch current user and courses with real-time listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        // Set up real-time listener for courses
        const coursesRef = collection(db, 'courses');
        const q = query(coursesRef, where('assignedTeacher', '==', user.uid));

        const unsubscribeCourses = onSnapshot(q, async (coursesSnapshot) => {
          const coursesData: Course[] = [];

          for (const courseDoc of coursesSnapshot.docs) {
            const courseData = courseDoc.data();

            // Fetch all students and filter those enrolled in this course
            const allStudentsRef = collection(db, 'users');
            const allStudentsSnapshot = await getDocs(allStudentsRef);

            const students: Student[] = [];

            allStudentsSnapshot.docs.forEach((doc) => {
              const userData = doc.data();
              const enrolledCourses = userData.enrolledCourses || [];
              const registeredCourses = userData.registeredCourses || [];
              const courses = userData.courses || [];

              // Check if student has this course in their enrolledCourses, registeredCourses, or courses array
              if (userData.role === 'student' && (
                enrolledCourses.includes(courseDoc.id) ||
                registeredCourses.includes(courseDoc.id) ||
                courses.includes(courseDoc.id)
              )) {
                students.push({
                  id: doc.id,
                  name: userData.name || 'Unknown',
                  email: userData.email || 'N/A',
                  degree: userData.degree || 'N/A',
                  enrollmentDate: userData.enrollmentDate || 'N/A'
                });
              }
            });

            coursesData.push({
              id: courseDoc.id,
              courseName: courseData.courseName || 'Untitled Course',
              courseCode: courseData.courseCode || 'N/A',
              // Admin stores this as `courseDescription` in Firestore.
              description: courseData.courseDescription || courseData.description || 'No description available',
              degree: courseData.degree || 'N/A',
              students,
              totalStudents: students.length,
              credits: courseData.credits || courseData.creditHours || 3,
              semester: courseData.semester || 'N/A',
              assignedAt: courseData.assignedAt,
              syllabusUploaded: false,
              mongodbCourseId: courseData.mongodbCourseId || null,
              closExtracted: 0,
              status: courseData.status || 'active',
              allowSubmissions: courseData.allowSubmissions !== false
            });
          }

          setCourses(coursesData);
          setFilteredCourses(coursesData);
          setLoading(false);

          // Now merge with MongoDB syllabus status
          if (currentUser) {
            try {
              const statusResponse = await fetch(`http://localhost:5000/api/courses/teacher/${currentUser.uid}/syllabus-status`);
              if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                if (statusData.success) {
                  // console.log(`📊 [LOAD] MongoDB status received for ${statusData.syllabusStatus.length} courses`);
                  // MongoDB courses loaded

                  const updatedCourses = coursesData.map(course => {
                    // Try exact code match first
                    let mongoStatus = statusData.syllabusStatus.find((s: any) => s.courseCode === course.courseCode);

                    // If no match and courseCode is "N/A" or empty, try matching by courseName
                    if (!mongoStatus && (course.courseCode === 'N/A' || !course.courseCode) && course.courseName) {
                      const normalizedName = course.courseName.toUpperCase().trim();
                      mongoStatus = statusData.syllabusStatus.find((s: any) =>
                        (s.courseTitle || '').toUpperCase().trim() === normalizedName ||
                        (s.courseCode || '').toUpperCase().trim() === normalizedName
                      );
                      if (mongoStatus) {
                        // console.log(`[MATCH] Firestore course "${course.courseName}" matched MongoDB "${mongoStatus.courseCode}" (${mongoStatus.courseTitle})`);
                      }
                    }

                    // If still no match, try case-insensitive code normalization
                    if (!mongoStatus && course.courseCode && course.courseCode !== 'N/A') {
                      const normalizedFirestoreCode = course.courseCode.toUpperCase().trim();
                      mongoStatus = statusData.syllabusStatus.find((s: any) =>
                        s.courseCode.toUpperCase().trim() === normalizedFirestoreCode
                      );
                      if (mongoStatus) {
                        // console.log(`[MATCH] Firestore code "${course.courseCode}" matched MongoDB "${mongoStatus.courseCode}"`);
                      }
                    }

                    if (mongoStatus) {
                      // console.log(`✅ [LOAD] "${course.courseName}" -> MongoDB: ${mongoStatus.courseCode} (${mongoStatus.courseTitle}) -> hasSyllabus: ${mongoStatus.hasSyllabus}`);
                      return {
                        ...course,
                        courseCode: mongoStatus.courseCode, // Update with actual MongoDB course code
                        syllabusUploaded: mongoStatus.hasSyllabus,
                        closExtracted: mongoStatus.closExtracted,
                        syllabusURL: mongoStatus.syllabusUrl,
                        syllabusUploadedAt: mongoStatus.syllabusUploadedAt,
                        mongodbCourseId: mongoStatus.courseId
                      };
                    } else {
                      console.warn(`⚠️ [LOAD] Firestore course "${course.courseName}" (code: ${course.courseCode}) NOT found in MongoDB`);
                      return { ...course, syllabusUploaded: false };
                    }
                  });
                  setCourses(updatedCourses);
                  setFilteredCourses(updatedCourses);
                }
              }
            } catch (error) {
              console.error('❌ [LOAD] Error fetching syllabus status:', error);
              setCourses(coursesData);
              setFilteredCourses(coursesData);
            }
          } else {
            setCourses(coursesData);
            setFilteredCourses(coursesData);
          }
        });

        return () => unsubscribeCourses();
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch deduplicated materials count for all courses from backend
  useEffect(() => {
    if (courses.length === 0) return;
    let cancelled = false;

    const fetchCounts = async () => {
      const countEntries = await Promise.all(
        courses.map(async (course) => {
          try {
            const resByExternal = await fetch(
              `http://localhost:5000/api/courses/materials-by-external/${course.id}`
            );
            if (resByExternal.ok) {
              const result = await resByExternal.json();
              const count =
                typeof result.numberOfMaterials === "number"
                  ? result.numberOfMaterials
                  : Array.isArray(result.materials)
                    ? result.materials.length
                    : 0;
              return [course.id, count] as const;
            }

            if (course.mongodbCourseId) {
              const response = await fetch(
                `http://localhost:5000/api/courses/materials-list/${course.mongodbCourseId}`
              );
              if (response.ok) {
                const result = await response.json();
                const count =
                  typeof result.numberOfMaterials === "number"
                    ? result.numberOfMaterials
                    : Array.isArray(result.materials)
                      ? result.materials.length
                      : 0;
                return [course.id, count] as const;
              }
            }

            return [course.id, 0] as const;
          } catch {
            return [course.id, 0] as const;
          }
        })
      );

      if (cancelled) return;

      setCourseMaterialsCount(Object.fromEntries(countEntries));
    };

    fetchCounts();

    return () => {
      cancelled = true;
    };
  }, [courses]);



  // Filter and search courses
  useEffect(() => {
    let filtered = courses;

    // Search filter
    if (searchTerm.trim()) {
      filtered = filtered.filter(course =>
        course.courseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.courseCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Degree filter
    if (filterDegree !== 'all') {
      filtered = filtered.filter(course => course.degree === filterDegree);
    }

    setFilteredCourses(filtered);
  }, [searchTerm, filterDegree, courses]);

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    let dateObj;
    if (typeof date === 'string') {
      // Try to parse ISO string
      const parsed = Date.parse(date);
      if (!isNaN(parsed)) {
        dateObj = new Date(parsed);
      } else {
        return 'N/A';
      }
    } else if (date instanceof Date) {
      dateObj = date;
    } else if (date.toDate) {
      dateObj = date.toDate();
    } else {
      return 'N/A';
    }
    return dateObj.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const uniqueDegrees = Array.from(new Set(courses.map(c => c.degree)));

  const handleEditCourse = (course: Course) => {
    setEditingCourse(course);
    setEditFormData({
      courseName: course.courseName,
      description: course.description,
      credits: course.credits,
      status: course.status,
      allowSubmissions: course.allowSubmissions
    });
    setShowEditDialog(true);
  };

  const handleSaveEditCourse = async () => {
    if (!editingCourse) return;

    try {
      const courseRef = doc(db, 'courses', editingCourse.id);
      const updateData: any = {
        courseName: editFormData.courseName,
        description: editFormData.description,
        status: editFormData.status,
        allowSubmissions: editFormData.allowSubmissions
      };

      await updateDoc(courseRef, updateData);

      // Generate notifications for changes
      const teacherName = getFormattedTeacherName(currentUser);
      const courseName = editFormData.courseName;

      // Track what was changed
      const changes: string[] = [];
      if (editingCourse.courseName !== editFormData.courseName) changes.push('course name');
      if (editingCourse.description !== editFormData.description) changes.push('description');
      if (editingCourse.status !== editFormData.status) changes.push(`status to ${editFormData.status}`);
      if (editingCourse.allowSubmissions !== editFormData.allowSubmissions) {
        changes.push(editFormData.allowSubmissions ? 'enabled submissions' : 'disabled submissions');
      }

      if (changes.length > 0) {
        const changeMessage = changes.join(', ');

        // Notify teacher of course update
        try {
          await fetch('http://localhost:5000/api/courses/notify-course-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              courseId: editingCourse.id,
              teacherId: currentUser?.uid,
              teacherName: teacherName,
              updateType: changeMessage
            })
          });
          console.log('✅ Teacher notified of course update');
        } catch (error) {
          console.warn('⚠️ Failed to notify teacher:', error);
        }
      }

      setShowEditDialog(false);
      setEditingCourse(null);
    } catch (error) {
      console.error('Error updating course:', error);
    }
  };

  const handleToggleCourseStatus = async (courseId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      const courseRef = doc(db, 'courses', courseId);
      await updateDoc(courseRef, { status: newStatus });
    } catch (error) {
      console.error('Error updating course status:', error);
    }
  };

  const handleDeleteSyllabus = async (courseId: string, courseCode: string) => {
    if (!currentUser) return;

    const confirmDelete = window.confirm(
      `Are you sure you want to delete the syllabus for ${courseCode}? This will also remove all CLOs for this course.`
    );

    if (!confirmDelete) return;

    try {
      // STEP 1: Delete from MongoDB (primary source of truth)
      // console.log(`🗑️ Step 1: Deleting from MongoDB for courseCode: ${courseCode}`);
      const response = await fetch(`http://localhost:5000/api/courses/syllabus?courseCode=${encodeURIComponent(courseCode)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teacherId: currentUser.uid
        })
      });

      if (!response.ok) {
        let errorMessage = `Failed to delete syllabus (${response.status})`;
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } else {
            errorMessage = `Server error (${response.status}): Unable to connect to API`;
          }
        } catch (parseError) {
          errorMessage = `Server error (${response.status}): ${response.statusText || 'Unknown error'}`;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('✅ MongoDB deletion confirmed:', result);

      // STEP 2: Delete from Firebase AFTER MongoDB confirmation
      console.log(`🗑️ Step 2: Deleting from Firebase for courseId: ${courseId}`);
      try {
        const courseRef = doc(db, 'courses', courseId);
        await updateDoc(courseRef, {
          syllabusUploaded: false,
          syllabusURL: null,
          syllabusFileName: null,
          mongodbCourseId: null,
          closExtracted: 0,
          syllabusUploadedAt: null
        });
        console.log('✅ Firebase deletion confirmed');
      } catch (firebaseError) {
        console.warn('⚠️ Firebase deletion failed, but MongoDB was already deleted. Syncing state from MongoDB...', firebaseError);
        // Continue anyway - MongoDB is source of truth
      }

      // STEP 3: Sync local state from MongoDB (single source of truth)
      console.log(`🗑️ Step 3: Syncing local state from MongoDB`);
      if (currentUser) {
        try {
          const statusResponse = await fetch(`http://localhost:5000/api/courses/teacher/${currentUser.uid}/syllabus-status`);
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.success) {
              // Update local state with fresh MongoDB data
              setCourses(prevCourses =>
                prevCourses.map(course => {
                  const mongoStatus = statusData.syllabusStatus.find((s: any) => s.courseCode === course.courseCode);
                  if (mongoStatus) {
                    return {
                      ...course,
                      syllabusUploaded: mongoStatus.hasSyllabus,
                      closExtracted: mongoStatus.closExtracted,
                      syllabusURL: mongoStatus.syllabusUrl
                    };
                  }
                  return course;
                })
              );
              setFilteredCourses(prevCourses =>
                prevCourses.map(course => {
                  const mongoStatus = statusData.syllabusStatus.find((s: any) => s.courseCode === course.courseCode);
                  if (mongoStatus) {
                    return {
                      ...course,
                      syllabusUploaded: mongoStatus.hasSyllabus,
                      closExtracted: mongoStatus.closExtracted,
                      syllabusURL: mongoStatus.syllabusUrl
                    };
                  }
                  return course;
                })
              );
              console.log('✅ Local state synced from MongoDB after successful deletion');
            }
          }
        } catch (statusError) {
          console.error('⚠️ Failed to refresh MongoDB status after delete:', statusError);
          // Fallback: update local state directly to reflect deletion
          setCourses(prevCourses =>
            prevCourses.map(course =>
              course.id === courseId
                ? { ...course, syllabusUploaded: false, syllabusURL: null, closExtracted: 0 }
                : course
            )
          );
          setFilteredCourses(prevCourses =>
            prevCourses.map(course =>
              course.id === courseId
                ? { ...course, syllabusUploaded: false, syllabusURL: null, closExtracted: 0 }
                : course
            )
          );
        }
      }

      // Send notifications
      const teacherName = getFormattedTeacherName(currentUser);
      const usersRef = collection(db, 'users');
      const notificationPromises: Promise<any>[] = [];

      // Notify current teacher
      notificationPromises.push(
        addDoc(collection(db, 'notifications'), {
          recipientRole: 'teacher',
          userId: currentUser.uid,
          title: `Syllabus Deleted Successfully`,
          message: `You deleted the syllabus for ${courseCode}`,
          type: 'info',
          timestamp: serverTimestamp(),
          read: false,
          courseId: courseId,
          actionType: 'syllabus-delete'
        })
      );

      // Notify enrolled students
      const studentsSnapshot = await getDocs(query(usersRef, where('role', '==', 'student')));
      studentsSnapshot.docs.forEach((studentDoc) => {
        const studentData = studentDoc.data();
        const registeredCourses = studentData.registeredCourses || [];

        if (registeredCourses.includes(courseId)) {
          notificationPromises.push(
            addDoc(collection(db, 'notifications'), {
              recipientRole: 'student',
              userId: studentDoc.id,
              title: `Syllabus Removed from ${courseCode}`,
              message: `${teacherName} removed the syllabus for ${courseCode}`,
              type: 'warning',
              timestamp: serverTimestamp(),
              read: false,
              courseId: courseId,
              teacherName: teacherName,
              actionType: 'syllabus-delete'
            })
          );
        }
      });

      // Notify all admins
      const adminsSnapshot = await getDocs(query(usersRef, where('role', '==', 'admin')));
      adminsSnapshot.docs.forEach((adminDoc) => {
        notificationPromises.push(
          addDoc(collection(db, 'notifications'), {
            recipientRole: 'admin',
            userId: adminDoc.id,
            title: `Syllabus Deleted: ${courseCode}`,
            message: `${teacherName} deleted the syllabus for course ${courseCode}`,
            type: 'warning',
            timestamp: serverTimestamp(),
            read: false,
            courseId: courseId,
            teacherId: currentUser.uid,
            teacherName: teacherName,
            actionType: 'syllabus-delete'
          })
        );
      });

      await Promise.all(notificationPromises);

      toast({
        title: "Syllabus Deleted",
        description: `Syllabus and CLOs removed from ${courseCode}`,
        variant: "default"
      });

    } catch (error) {
      console.error('❌ Delete syllabus error:', error);

      // If the course entry was already deleted from MongoDB, update Firestore and local state anyway
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete syllabus';
      if (errorMessage.includes('not found') || errorMessage.includes('already deleted') || errorMessage.includes('Failed to delete syllabus')) {
        try {
          // Update Firestore course document
          const courseRef = doc(db, 'courses', courseId);
          await updateDoc(courseRef, {
            syllabusUploaded: false,
            syllabusURL: null,
            syllabusFileName: null,
            mongodbCourseId: null,
            closExtracted: 0,
            syllabusUploadedAt: null
          });

          // Update local state
          setCourses(prevCourses =>
            prevCourses.map(course =>
              course.id === courseId
                ? { ...course, syllabusUploaded: false, syllabusURL: null, closExtracted: 0 }
                : course
            )
          );
          setFilteredCourses(prevCourses =>
            prevCourses.map(course =>
              course.id === courseId
                ? { ...course, syllabusUploaded: false, syllabusURL: null, closExtracted: 0 }
                : course
            )
          );

          toast({
            title: "Syllabus Status Updated",
            description: "The syllabus was already removed from the database. Local status has been updated.",
            variant: "default"
          });
        } catch (updateError) {
          console.error('❌ Failed to update after delete error:', updateError);
          toast({
            title: "Delete Failed",
            description: errorMessage,
            variant: "destructive"
          });
        }
      } else {
        toast({
          title: "Delete Failed",
          description: errorMessage,
          variant: "destructive"
        });
      }
    }
  };

  const handleDeleteCourse = async (courseId: string, courseCode: string) => {
    if (!currentUser) return;

    console.log('🗑️ handleDeleteCourse called with:', { courseId, courseCode });

    if (!courseCode) {
      console.error('❌ Course code is empty or undefined');
      toast({
        title: "Error",
        description: "Course code is missing",
        variant: "destructive"
      });
      return;
    }

    const confirmDelete = window.confirm(
      `Are you sure you want to delete the entire course ${courseCode}? This will permanently remove the course, all its CLOs, Bloom levels, and syllabus from the system. This action cannot be undone.`
    );

    if (!confirmDelete) return;

    try {
      const url = `http://localhost:5000/api/courses/delete-course?courseCode=${encodeURIComponent(courseCode)}`;
      console.log('🗑️ Making DELETE request to:', url);
      console.log('Course code:', courseCode);
      console.log('Encoded course code:', encodeURIComponent(courseCode));

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teacherId: currentUser.uid
        })
      });

      if (!response.ok) {
        let errorMessage = `Failed to delete course (${response.status})`;
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } else {
            // If not JSON, it's probably an HTML error page
            errorMessage = `Server error (${response.status}): Unable to connect to API`;
          }
        } catch (parseError) {
          errorMessage = `Server error (${response.status}): ${response.statusText || 'Unknown error'}`;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('✅ Course deleted:', result);

      // Remove course from Firestore
      const courseRef = doc(db, 'courses', courseId);
      await updateDoc(courseRef, {
        status: 'deleted',
        deletedAt: serverTimestamp(),
        deletedBy: currentUser.uid
      });

      // Remove course from local state
      setCourses(prevCourses => prevCourses.filter(course => course.id !== courseId));
      setFilteredCourses(prevCourses => prevCourses.filter(course => course.id !== courseId));

      // Immediately refresh MongoDB status for remaining courses
      if (currentUser) {
        try {
          const statusResponse = await fetch(`http://localhost:5000/api/courses/teacher/${currentUser.uid}/syllabus-status`);
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.success) {
              // Update local state with fresh MongoDB data after course deletion
              setCourses(prevCourses =>
                prevCourses.filter(course => course.courseCode !== courseCode)
              );
              setFilteredCourses(prevCourses =>
                prevCourses.filter(course => course.courseCode !== courseCode)
              );
              console.log('✅ Syllabus status updated after course delete');
            }
          }
        } catch (statusError) {
          console.error('⚠️ Failed to refresh syllabus status after course delete:', statusError);
        }
      }

      // Send notifications
      const teacherName = getFormattedTeacherName(currentUser);
      const usersRef = collection(db, 'users');
      const notificationPromises: Promise<any>[] = [];

      // Notify current teacher
      notificationPromises.push(
        addDoc(collection(db, 'notifications'), {
          recipientRole: 'teacher',
          userId: currentUser.uid,
          title: `Course Deleted Successfully`,
          message: `You deleted the course ${courseCode} and all its associated data`,
          type: 'info',
          timestamp: serverTimestamp(),
          read: false,
          courseId: courseId,
          actionType: 'course-delete'
        })
      );

      // Notify enrolled students
      const studentsSnapshot = await getDocs(query(usersRef, where('role', '==', 'student')));
      studentsSnapshot.docs.forEach((studentDoc) => {
        const studentData = studentDoc.data();
        const registeredCourses = studentData.registeredCourses || [];

        if (registeredCourses.includes(courseId)) {
          notificationPromises.push(
            addDoc(collection(db, 'notifications'), {
              recipientRole: 'student',
              userId: studentDoc.id,
              title: `Course Removed: ${courseCode}`,
              message: `${teacherName} removed the course ${courseCode} from the system`,
              type: 'warning',
              timestamp: serverTimestamp(),
              read: false,
              courseId: courseId,
              teacherName: teacherName,
              actionType: 'course-delete'
            })
          );
        }
      });

      // Notify all admins
      const adminsSnapshot = await getDocs(query(usersRef, where('role', '==', 'admin')));
      adminsSnapshot.docs.forEach((adminDoc) => {
        notificationPromises.push(
          addDoc(collection(db, 'notifications'), {
            recipientRole: 'admin',
            userId: adminDoc.id,
            title: `Course Deleted: ${courseCode}`,
            message: `${teacherName} deleted the course ${courseCode} and all its data`,
            type: 'warning',
            timestamp: serverTimestamp(),
            read: false,
            courseId: courseId,
            teacherId: currentUser.uid,
            teacherName: teacherName,
            actionType: 'course-delete'
          })
        );
      });

      await Promise.all(notificationPromises);

      toast({
        title: "Course Deleted",
        description: `Course ${courseCode} and all associated data removed permanently`,
        variant: "destructive"
      });

    } catch (error) {
      console.error('❌ Delete course error:', error);

      toast({
        title: "Course Deletion Failed",
        description: error instanceof Error ? error.message : 'Failed to delete course',
        variant: "destructive"
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700';
      case 'completed': return 'bg-blue-100 text-blue-700';
      case 'inactive': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFileForUpload(file);
    }
  };

  const handleSyllabusFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    console.log('📁 File selected:', file ? { name: file.name, size: file.size, type: file.type } : 'No file');

    if (file) {
      if (file.type !== 'application/pdf') {
        toast({
          title: "Invalid File",
          description: "Only PDF files are allowed",
          variant: "destructive"
        });
        // Reset the input
        event.target.value = '';
        return;
      }
      setSelectedSyllabusFile(file);
      console.log('✅ Syllabus file set successfully');
    }
  };

  const handleFileUpload = async () => {
    const file = selectedFileForUpload;
    if (!file || !uploadingCourseId || !currentUser?.uid) {
      return;
    }

    setIsUploading(true);
    try {
      const course = courses.find(c => c.id === uploadingCourseId);
      if (!course) {
        throw new Error('Course not found');
      }

      const formData = new FormData();
      formData.append('materialFile', file);
      formData.append('teacherId', currentUser.uid);
      formData.append('courseId', uploadingCourseId);
      if (course.mongodbCourseId) {
        formData.append('mongoCourseId', course.mongodbCourseId);
      }
      formData.append('courseCode', course.courseCode || '');
      formData.append('courseName', course.courseName || '');
      formData.append('sourceType', materialSourceType);
      formData.append('enableOcr', 'true');

      const response = await fetch('http://localhost:5000/api/courses/upload-material', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      
      // ✅ Check for duplicate upload
      if (result.isDuplicate) {
        toast({
          title: "⚠️ Duplicate Upload",
          description: result.message || "The slide is already uploaded",
          variant: "default",
        });
        setShowUploadDialog(false);
        setSelectedFileForUpload(null);
        setUploadingCourseId(null);
        setMaterialSourceType('slides');
        if (fileInputRef.current) fileInputRef.current.value = '';
        setIsUploading(false);
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.details || 'Failed to upload course material');
      }

      // Show immediate "processing" message. Phase-1 ingestion runs asynchronously.
      toast({
        title: 'Processing',
        description: 'This can take time.',
      });

      const materialId = result?.material?.id as string | undefined;

      setShowUploadDialog(false);
      setSelectedFileForUpload(null);
      setUploadingCourseId(null);
      setMaterialSourceType('slides');
      if (fileInputRef.current) fileInputRef.current.value = '';

      const refreshedCountResponse = await fetch(
        `http://localhost:5000/api/courses/materials-list/${course.mongodbCourseId || ''}`
      );
      if (refreshedCountResponse.ok) {
        const refreshedCountResult = await refreshedCountResponse.json();
        const refreshedCount = typeof refreshedCountResult.numberOfMaterials === 'number'
          ? refreshedCountResult.numberOfMaterials
          : (Array.isArray(refreshedCountResult.materials) ? refreshedCountResult.materials.length : 0);

        setCourseMaterialsCount(prev => ({
          ...prev,
          [uploadingCourseId]: refreshedCount
        }));
      }

      // Poll status endpoint until Phase-1 completes, then show final message.
      if (materialId) {
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
        const startedAt = Date.now();
        const timeoutMs = 5 * 60 * 1000;

        while (Date.now() - startedAt < timeoutMs) {
          const statusRes = await fetch(`http://localhost:5000/api/courses/material/${materialId}/ingestion-status`);
          if (!statusRes.ok) break;
          const statusJson = await statusRes.json();

          const raw = statusJson?.raw;
          const mat = statusJson?.material;

          if (raw?.extractionStatus === 'failed' || mat?.processingStatus === 'failed') {
            toast({
              title: '❌ Phase‑1 failed',
              description: raw?.extractionError || raw?.faissIngestionError || 'Pipeline failed. Check backend logs.',
              variant: 'destructive',
            });
            break;
          }

          const extractionDone = raw?.extractionStatus === 'completed';
          const ingestionDone = raw?.faissIngestionStatus === 'completed';
          const ingestionFailed = raw?.faissIngestionStatus === 'failed';

          if (extractionDone && ingestionDone) {
            toast({
              title: 'Extraction Successful.',
              description: '',
            });
            break;
          }

          if (extractionDone && ingestionFailed) {
            toast({
              title: '❌ Vector ingestion failed',
              description: raw?.faissIngestionError || 'Ingestion failed. Check backend logs.',
              variant: 'destructive',
            });
            break;
          }

          await sleep(2000);
        }
      }
    } catch (error) {
      console.error('❌ Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast({
        title: "Upload Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Post announcement handler
  const handlePostAnnouncement = async () => {
    if (!announcementCourseId || !announcementTitle.trim() || !announcementMessage.trim()) {
      toast({
        title: "Incomplete Information",
        description: "Please fill in both title and message",
        variant: "destructive"
      });
      return;
    }

    try {
      setPostingAnnouncement(true);
      const course = courses.find(c => c.id === announcementCourseId);
      const teacherName = getFormattedTeacherName(currentUser);

      // Create announcement in Firebase Firestore
      const announcementData = {
        courseId: announcementCourseId,
        courseName: course?.courseName,
        teacherId: currentUser.uid,
        teacherName: teacherName,
        title: announcementTitle,
        message: announcementMessage,
        priority: announcementPriority,
        timestamp: serverTimestamp(),
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'announcements'), announcementData);

      // Send notifications to enrolled students ONLY (one per student)
      const usersRef = collection(db, 'users');
      const studentsQuery = query(usersRef, where('role', '==', 'student'));
      const studentsSnapshot = await getDocs(studentsQuery);

      // Filter to only students enrolled in THIS course
      const enrolledStudents = studentsSnapshot.docs.filter(studentDoc => {
        const studentData = studentDoc.data();
        const registeredCourses = studentData.registeredCourses || [];
        return registeredCourses.includes(announcementCourseId);
      });

      console.log(`📢 Sending announcement to ${enrolledStudents.length} enrolled students`);

      // Create ONE notification per enrolled student
      const notificationPromises = enrolledStudents.map(studentDoc =>
        addDoc(collection(db, 'notifications'), {
          recipientRole: 'student',
          userId: studentDoc.id,
          title: `📢 ${announcementTitle}`,
          message: `${course?.courseName}: ${announcementMessage}`,
          type: announcementPriority === 'urgent' ? 'urgent' : 'info',
          timestamp: serverTimestamp(),
          read: false,
          courseId: announcementCourseId,
          actionType: 'announcement'
        })
      );

      await Promise.all(notificationPromises);

      toast({
        title: "Announcement Posted!",
        description: `Sent to ${enrolledStudents.length} enrolled student${enrolledStudents.length !== 1 ? 's' : ''}`,
      });

      // Reset form
      setShowAnnouncementDialog(false);
      setAnnouncementTitle('');
      setAnnouncementMessage('');
      setAnnouncementPriority('normal');
      setAnnouncementCourseId(null);

    } catch (error) {
      console.error('Error posting announcement:', error);
      toast({
        title: "Error",
        description: "Failed to post announcement",
        variant: "destructive"
      });
    } finally {
      setPostingAnnouncement(false);
    }
  };

  // Handle syllabus upload for OCR processing
  const handleSyllabusUpload = async () => {
    const file = selectedSyllabusFile;
    if (!file || !syllabusUploadCourseId) {
      toast({
        title: "Error",
        description: "Please select a PDF file",
        variant: "destructive"
      });
      return;
    }

    setUploadingSyllabus(true);

    try {
      const course = courses.find(c => c.id === syllabusUploadCourseId);
      if (!course) throw new Error('Course not found');

      console.log('📦 Preparing FormData with:', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        courseCode: course.courseCode,
        courseTitle: course.courseName
      });

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('syllabusPdf', file, file.name); // Explicitly add filename
      formData.append('courseCode', course.courseCode);
      formData.append('courseTitle', course.courseName);
      formData.append('creditHours', course.credits.toString());
      formData.append('description', course.description || '');
      // Firestore course doc id for notifying registered students (users.registeredCourses)
      formData.append('externalCourseId', syllabusUploadCourseId);
      // Include MongoDB courseId when updating an existing course
      if (course.mongodbCourseId) {
        formData.append('courseId', course.mongodbCourseId);
      }
      formData.append('teacherId', currentUser?.uid || '');

      // Debug: Log FormData entries
      console.log('📋 FormData entries:');
      for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
          console.log(`  ${key}:`, { name: value.name, size: value.size, type: value.type });
        } else {
          console.log(`  ${key}:`, value);
        }
      }

      console.log('📤 Uploading syllabus to OCR backend...');

      // Send to backend for OCR processing
      const response = await fetch('http://localhost:5000/api/courses/upload-syllabus', {
        method: 'POST',
        body: formData
        // Don't set Content-Type header - browser will set it with boundary
      });

      console.log('📡 Backend response status:', response.status);
      console.log('📡 Backend response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Backend error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          throw new Error(`Server error (${response.status}): ${errorText}`);
        }
        throw new Error(errorData.error || 'Failed to upload syllabus');
      }

      const result = await response.json();
      console.log('✅ Syllabus processed:', result);

      // Immediately fetch fresh MongoDB status
      console.log('📦 [UPLOAD] Fetching fresh MongoDB status...');
      if (currentUser) {
        try {
          const statusResponse = await fetch(`http://localhost:5000/api/courses/teacher/${currentUser.uid}/syllabus-status`);
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.success) {
              console.log('✅ [UPLOAD] Fresh MongoDB data received for local state update');
              // Update local state with fresh MongoDB data - MongoDB is ONLY source of truth
              setCourses(prevCourses =>
                prevCourses.map(course => {
                  // Try exact match first
                  let mongoStatus = statusData.syllabusStatus.find((s: any) => s.courseCode === course.courseCode);

                  // If not found, try case-insensitive normalized match
                  if (!mongoStatus && course.courseCode) {
                    const normalizedFirestoreCode = course.courseCode.toUpperCase().trim();
                    mongoStatus = statusData.syllabusStatus.find((s: any) =>
                      s.courseCode.toUpperCase().trim() === normalizedFirestoreCode
                    );
                  }

                  if (mongoStatus) {
                    console.log(`✅ [UPLOAD] ${mongoStatus.courseCode} -> hasSyllabus: ${mongoStatus.hasSyllabus}`);
                    return {
                      ...course,
                      syllabusUploaded: mongoStatus.hasSyllabus,
                      closExtracted: mongoStatus.closExtracted,
                      syllabusURL: mongoStatus.syllabusUrl,
                      syllabusUploadedAt: mongoStatus.syllabusUploadedAt,
                      mongodbCourseId: mongoStatus.courseId
                    };
                  }
                  return course;
                })
              );
              setFilteredCourses(prevCourses =>
                prevCourses.map(course => {
                  // Try exact match first
                  let mongoStatus = statusData.syllabusStatus.find((s: any) => s.courseCode === course.courseCode);

                  // If not found, try case-insensitive normalized match
                  if (!mongoStatus && course.courseCode) {
                    const normalizedFirestoreCode = course.courseCode.toUpperCase().trim();
                    mongoStatus = statusData.syllabusStatus.find((s: any) =>
                      s.courseCode.toUpperCase().trim() === normalizedFirestoreCode
                    );
                  }

                  if (mongoStatus) {
                    return {
                      ...course,
                      syllabusUploaded: mongoStatus.hasSyllabus,
                      closExtracted: mongoStatus.closExtracted,
                      syllabusURL: mongoStatus.syllabusUrl,
                      syllabusUploadedAt: mongoStatus.syllabusUploadedAt,
                      mongodbCourseId: mongoStatus.courseId
                    };
                  }
                  return course;
                })
              );
            }
          }
        } catch (statusError) {
          console.error('⚠️ Failed to refresh MongoDB status after upload:', statusError);
        }
      }

      // Update Firestore for reference only (metadata, not truth)
      const courseRef = doc(db, 'courses', syllabusUploadCourseId);
      try {
        await updateDoc(courseRef, {
          mongodbCourseId: result.course._id,
          syllabusFileName: file.name,
          syllabusUploadedAt: serverTimestamp()
        });
        console.log('✅ Firestore updated with MongoDB reference');
      } catch (error) {
        console.error('⚠️ Failed to update Firestore:', error);
      }

      // Show success/update message
      if (result.action === 'updated') {
        toast({
          title: "Syllabus Updated Successfully",
          description: `Your syllabus has been updated successfully. ${result.closExtracted} CLOs processed.`,
          variant: "default"
        });
      } else {
        toast({
          title: "Syllabus Uploaded Successfully",
          description: `${result.closExtracted} CLOs have been extracted from the syllabus.`,
          variant: "default"
        });
      }

      // Notifications for registered students are created server-side (course update + syllabus upload),
      // using the unified `recipientId` + `createdAt` schema so the student bell toggle updates reliably.

      // Close dialog and reset state FIRST
      setShowSyllabusDialog(false);
      setSyllabusUploadCourseId(null);
      setSelectedSyllabusFile(null);
      if (syllabusInputRef.current) syllabusInputRef.current.value = '';

      // Then show success toast
      toast({
        title: `You have uploaded CLOs for ${course.courseName}`,
        description: `✓ ${result.closExtracted} CLOs successfully extracted and stored`,
        duration: 6000
      });

    } catch (error) {
      console.error('❌ Syllabus upload error:', error);
      console.error('❌ Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace',
        type: typeof error,
        error: error
      });

      // Reset state on error
      setShowSyllabusDialog(false);
      setSyllabusUploadCourseId(null);
      setSelectedSyllabusFile(null);
      if (syllabusInputRef.current) syllabusInputRef.current.value = '';

      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : 'Failed to process syllabus',
        variant: "destructive",
        duration: 8000
      });
    } finally {
      setUploadingSyllabus(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      {/* Header */}
      <div className="px-4 md:px-6 pt-8 pb-6 bg-white shadow-sm border-b border-primary/10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              onClick={() => navigate('/teacher-dashboard')}
              className="hover:bg-primary/10 transition-all p-2 rounded-lg"
            >
              <ChevronLeft className="h-5 w-5 text-gray-700" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                My Courses
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                View and manage your assigned courses
              </p>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search Bar */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <Input
                placeholder="Search courses by name or code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-primary/30 focus:border-primary"
              />
            </div>

            {/* Degree Filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-gray-400" />
              <select
                value={filterDegree}
                onChange={(e) => setFilterDegree(e.target.value)}
                className="px-4 py-2 rounded-lg border border-primary/30 focus:border-primary focus:outline-none text-sm font-medium bg-white"
              >
                <option value="all">All Degrees</option>
                {uniqueDegrees.map(degree => (
                  <option key={degree} value={degree}>{degree}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-xs text-muted-foreground">Total Courses</p>
              <p className="text-2xl font-bold text-primary">{courses.length}</p>
            </div>
            <div className="p-3 bg-blue-100/50 rounded-lg border border-blue-200/50">
              <p className="text-xs text-muted-foreground">Total Students</p>
              <p className="text-2xl font-bold text-blue-600">
                {courses.reduce((sum, c) => sum + c.totalStudents, 0)}
              </p>
            </div>
            {/* KPI: Total Content Uploaded */}
            <div className="p-3 bg-green-100/50 rounded-lg border border-green-200/50">
              <p className="text-xs text-muted-foreground">Total Content Uploaded</p>
              <p className="text-2xl font-bold text-green-700">
                {courses.filter(c => c.syllabusUploaded).length}
              </p>
            </div>
            {/* KPI: Pending Content */}
            <div className="p-3 bg-orange-100/50 rounded-lg border border-orange-200/50">
              <p className="text-xs text-muted-foreground">Pending Content</p>
              <p className="text-2xl font-bold text-orange-700">
                {courses.filter(c => !c.syllabusUploaded).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <BookOpen className="h-16 w-16 text-primary/20 mx-auto mb-4" />
              <p className="text-muted-foreground">Loading courses...</p>
            </div>
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <BookOpen className="h-16 w-16 text-primary/20 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-black mb-2">No Courses Found</h3>
              <p className="text-muted-foreground">
                {searchTerm || filterDegree !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'You have not been assigned any courses yet'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredCourses.map((course) => (
              <Card
                key={course.id}
                className="border-primary/20 shadow-sm hover:shadow-md transition-all overflow-hidden"
              >
                <CardHeader className="bg-gradient-to-r from-primary/5 via-primary/2 to-transparent pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <BookOpen className="h-6 w-6 text-primary" />
                        <div>
                          <CardTitle className="text-xl font-bold text-black">
                            {course.courseName}
                          </CardTitle>
                          <CardDescription className="text-sm mt-1">
                            {course.courseCode}
                          </CardDescription>
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 mt-2 leading-relaxed">
                        {course.description}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex gap-2">
                        {/* Course Status Badge */}
                        <Badge className={getStatusColor(course.status)}>
                          {course.status.charAt(0).toUpperCase() + course.status.slice(1)}
                        </Badge>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {course.degree}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="mt-1">
                            <Settings className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditCourse(course)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Course
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleCourseStatus(course.id, course.status)}>
                            {course.status === 'active' ? (
                              <>
                                <Archive className="h-4 w-4 mr-2" />
                                Mark as Inactive
                              </>
                            ) : (
                              <>
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Mark as Active
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setAnnouncementCourseId(course.id);
                            setShowAnnouncementDialog(true);
                          }}>
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Post Announcement
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSyllabusUploadCourseId(course.id);
                              setShowSyllabusDialog(true);
                            }}
                            disabled={uploadingSyllabus}
                          >
                            {uploadingSyllabus && syllabusUploadCourseId === course.id ? (
                              <>
                                <Loader className="h-4 w-4 mr-2 animate-spin" />
                                Processing OCR...
                              </>
                            ) : (
                              <>
                                <BookOpen className="h-4 w-4 mr-2" />
                                Upload Syllabus (OCR)
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setUploadingCourseId(course.id);
                              setShowUploadDialog(true);
                            }}
                          >
                            <FileUp className="h-4 w-4 mr-2" />
                            Upload Course Material
                          </DropdownMenuItem>
                          {course.closExtracted > 0 && (
                            <DropdownMenuItem
                              onClick={() => window.open(course.syllabusURL, '_blank')}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download Syllabus
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => handleDeleteSyllabus(course.id, course.courseCode)}
                            className="text-black focus:text-black"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Syllabus
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-6">
                  {/* Course Info Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 pb-6 border-b">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Students Enrolled</p>
                      {/* Only display students count if course exists in MongoDB */}
                      {course.mongodbCourseId ? (
                        <p className="text-2xl font-bold text-primary">{course.totalStudents}</p>
                      ) : (
                        <p className="text-2xl font-bold text-gray-400">-</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Credits</p>
                      <p className="text-2xl font-bold text-blue-600">{course.credits}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Semester</p>
                      <p className="text-base font-semibold text-gray-700">
                        {course.semester && course.semester !== 'N/A' ? course.semester : '2026-4'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Number of Materials</p>
                      <p className="text-base font-semibold text-gray-700">
                        {courseMaterialsCount[course.id] ?? 0}
                      </p>
                    </div>
                    <div className="col-span-2 md:col-span-4">
                      <p className="text-xs text-muted-foreground mb-1">Syllabus Status</p>
                      {course.syllabusUploaded ? (
                        <span className="text-green-700 font-semibold">
                          ✓ Uploaded
                        </span>
                      ) : (
                        <span className="text-orange-700 font-semibold">
                          ⚠ Not Yet Uploaded
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Students List */}
                  <div>
                    <div
                      onClick={() => setExpandedCourseId(expandedCourseId === course.id ? null : course.id)}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors mb-4"
                    >
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold text-black">
                          Enrolled Students ({course.totalStudents})
                        </h3>
                      </div>
                      <ChevronDown
                        className={`h-5 w-5 text-gray-600 transition-transform ${expandedCourseId === course.id ? 'rotate-180' : ''
                          }`}
                      />
                    </div>

                    {/* Students Expanded View */}
                    {expandedCourseId === course.id && course.totalStudents > 0 && (
                      <ScrollArea className="border rounded-lg p-4 bg-gray-50/50">
                        <div className="space-y-3">
                          {course.students.map((student) => (
                            <div key={student.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-primary/30 transition-colors">
                              <div className="flex items-center gap-3 flex-1">
                                <Avatar className="h-10 w-10 border-2 border-primary/20">
                                  <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                    {student.name.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-black text-sm">{student.name}</p>
                                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                    <Mail className="h-3 w-3" />
                                    {student.email}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 ml-2">
                                <Badge variant="outline" className="text-xs whitespace-nowrap">
                                  <GraduationCap className="h-3 w-3 mr-1" />
                                  {student.degree}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}

                    {/* Empty Students State */}
                    {expandedCourseId === course.id && course.totalStudents === 0 && (
                      <div className="text-center py-8 bg-gray-50 rounded-lg">
                        <Users className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No students enrolled yet</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit Course Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Course Details</DialogTitle>
            <DialogDescription>
              Update your course information. Changes are saved to Firestore immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-black">Course Name</label>
              <Input
                value={editFormData.courseName || ''}
                onChange={(e) => setEditFormData({ ...editFormData, courseName: e.target.value })}
                className="mt-1"
                placeholder="Enter course name"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-black">Description</label>
              <Textarea
                value={editFormData.description || ''}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                className="mt-1 min-h-24"
                placeholder="Enter course description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Credits</label>
                <Input
                  type="number"
                  value={editFormData.credits || 0}
                  disabled
                  className="mt-1 bg-gray-100 cursor-not-allowed"
                  placeholder="Credits"
                />
                <p className="text-xs text-gray-400 mt-1">Credits cannot be changed by teachers</p>
              </div>
              <div>
                <label className="text-sm font-medium text-black">Status</label>
                <select
                  value={editFormData.status || 'active'}
                  onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                  className="w-full px-3 py-2 mt-1 border rounded-md border-input focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
              <label className="text-sm font-medium text-black">Allow Student Submissions</label>
              <input
                type="checkbox"
                checked={editFormData.allowSubmissions !== false}
                onChange={(e) => setEditFormData({ ...editFormData, allowSubmissions: e.target.checked })}
                className="h-4 w-4"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEditCourse} className="gap-2">
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Materials Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Course Material</DialogTitle>
            <DialogDescription>
              Select a document to upload to your course. Students and admins will be notified.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div
              className="border-2 border-dashed border-primary/30 rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="h-8 w-8 text-primary/60 mx-auto mb-2" />
              <p className="text-sm font-medium text-black">
                {selectedFileForUpload ? selectedFileForUpload.name : 'Click to select a file'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF, PPTX
              </p>
            </div>

            <div>
              <Label htmlFor="materialSourceType" className="text-sm font-medium text-black">Source Type</Label>
              <select
                id="materialSourceType"
                value={materialSourceType}
                onChange={(e) => setMaterialSourceType(e.target.value as 'slides' | 'book')}
                className="w-full px-3 py-2 mt-1 border rounded-md border-input focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="slides">Slides</option>
                <option value="book">Book</option>
              </select>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              accept=".pdf,.pptx"
            />
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setShowUploadDialog(false);
                setSelectedFileForUpload(null);
                setMaterialSourceType('slides');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleFileUpload}
              disabled={!selectedFileForUpload || isUploading}
              className="gap-2"
            >
              {isUploading ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <FileUp className="h-4 w-4" />
                  Upload
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Syllabus Upload Dialog */}
      <Dialog open={showSyllabusDialog} onOpenChange={setShowSyllabusDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Syllabus</DialogTitle>
            <DialogDescription>
              Upload a course syllabus PDF for OCR processing. CLOs and Bloom taxonomy will be automatically extracted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div
              className="border-2 border-dashed border-primary/30 rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => syllabusInputRef.current?.click()}
            >
              <BookOpen className="h-8 w-8 text-primary/60 mx-auto mb-2" />
              <p className="text-sm font-medium text-black">
                {selectedSyllabusFile ? selectedSyllabusFile.name : 'Click to select PDF syllabus'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF files only
              </p>
            </div>

            <input
              ref={syllabusInputRef}
              type="file"
              onChange={handleSyllabusFileSelect}
              className="hidden"
              accept=".pdf"
            />
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setShowSyllabusDialog(false);
                setSelectedSyllabusFile(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSyllabusUpload}
              disabled={!selectedSyllabusFile || uploadingSyllabus}
              className="gap-2"
            >
              {uploadingSyllabus ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <FileUp className="h-4 w-4" />
                  Upload
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Announcement Dialog */}
      <Dialog open={showAnnouncementDialog} onOpenChange={setShowAnnouncementDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Post Course Announcement</DialogTitle>
            <DialogDescription>
              Send an announcement to all students enrolled in this course
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title *</label>
              <Input
                placeholder="e.g., Quiz 1 Schedule Announcement"
                value={announcementTitle}
                onChange={(e) => setAnnouncementTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Message *</label>
              <Textarea
                placeholder="Write your announcement message here..."
                value={announcementMessage}
                onChange={(e) => setAnnouncementMessage(e.target.value)}
                className="min-h-[120px]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Priority</label>
              <select
                value={announcementPriority}
                onChange={(e) => setAnnouncementPriority(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setShowAnnouncementDialog(false);
                setAnnouncementTitle('');
                setAnnouncementMessage('');
                setAnnouncementPriority('normal');
              }}
              disabled={postingAnnouncement}
            >
              Cancel
            </Button>
            <Button
              onClick={handlePostAnnouncement}
              disabled={!announcementTitle.trim() || !announcementMessage.trim() || postingAnnouncement}
              className="gap-2"
            >
              {postingAnnouncement ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  Posting...
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4" />
                  Post Announcement
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
        accept=".pdf,.doc,.docx,.txt,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.zip"
      />
    </div>
  );
};

export default TeacherCourses;

