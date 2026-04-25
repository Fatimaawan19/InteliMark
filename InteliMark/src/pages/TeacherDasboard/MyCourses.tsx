import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Brain, 
  Users, 
  FileText, 
  Clock,
  ChevronLeft,
  BookOpen,
  TrendingUp,
  CheckCircle,
  Download,
  Settings,
  Trash2
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../../firebase";
import { collection, query, where, onSnapshot, getDocs, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';

interface Course {
  id: string;
  courseName: string;
  courseId: string;
  courseCode: string;
  degree: string;
  creditHours: number;
  assignedTeacher: string;
  students: number;
  assignments: number;
  pendingGrading: number;
  quizzes: number;
  pendingQuizzes: number;
  completionRate: number;
  avgScore: number;
  syllabusUploaded: boolean;
  syllabusURL?: string;
  closExtracted: number;
}

const MyCourses = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [usersSnapshot, setUsersSnapshot] = useState<any>(null);
  const [totalSyllabiSubmitted, setTotalSyllabiSubmitted] = useState(0);
  const [mongodbSyllabusCount, setMongodbSyllabusCount] = useState(0);
  const syncKpiIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  // Monitor auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });

    return () => unsubscribe();
  }, []);

  // Fetch users once
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersCol = collection(db, 'users');
        const snapshot = await getDocs(usersCol);
        setUsersSnapshot(snapshot);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };

    fetchUsers();
  }, []);

  // Sync MongoDB syllabus count for KPI - real-time DB data only
  const syncMongodbKpiCount = async () => {
    if (!currentUser) return;
    try {
      const response = await fetch(`http://localhost:5000/api/courses/teacher/${currentUser.uid}/syllabus-status`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Count courses with actual MongoDB syllabi only
          const count = data.syllabusStatus.filter((s: any) => s.hasSyllabus).length;
          setMongodbSyllabusCount(count);
          console.log(`✅ KPI synced: ${count} syllabi submitted (from MongoDB)`);
        }
      }
    } catch (error) {
      console.error('⚠️ Error syncing KPI count from MongoDB:', error);
    }
  };

  // Periodic KPI sync - every 5 seconds
  useEffect(() => {
    if (!currentUser) return;
    
    syncMongodbKpiCount(); // Immediate sync
    syncKpiIntervalRef.current = setInterval(() => {
      syncMongodbKpiCount();
    }, 5000); // Every 5 seconds for KPI
    
    return () => {
      if (syncKpiIntervalRef.current) clearInterval(syncKpiIntervalRef.current);
    };
  }, [currentUser]);

  // Fetch teacher's courses from Firestore with real-time updates
  useEffect(() => {
    if (!currentUser || !usersSnapshot) {
      console.log("No user or users snapshot yet");
      return;
    }

    console.log("Setting up real-time listener for user:", currentUser.uid);
    
    // Get courses where assignedTeacher matches current user's UID
    const coursesCol = collection(db, 'courses');
    const q = query(coursesCol, where('assignedTeacher', '==', currentUser.uid));
    
    // Set up real-time listener
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      console.log("Courses snapshot received, docs:", snapshot.docs.length);
      
      const coursesList = snapshot.docs.map(doc => {
        const data = doc.data();
        
        // Count students who have this course in their registeredCourses array
        const enrolledStudents = usersSnapshot.docs.filter(userDoc => {
          const userData = userDoc.data();
          return userData.role === 'student' && 
                 userData.registeredCourses && 
                 userData.registeredCourses.includes(doc.id);
        }).length;
        
        console.log("Course:", data.courseName, "Students enrolled:", enrolledStudents, "Syllabus uploaded:", data.syllabusUploaded);
        
        return { 
          id: doc.id, 
          courseName: data.courseName || '',
          courseId: data.courseId || '',
          courseCode: data.courseCode || '',
          degree: data.degree || '',
          creditHours: data.creditHours || 0,
          assignedTeacher: data.assignedTeacher || '',
          // Use actual count from users collection
          students: enrolledStudents,
          assignments: data.assignments || 0,
          pendingGrading: data.pendingGrading || 0,
          quizzes: data.quizzes || 0,
          pendingQuizzes: data.pendingQuizzes || 0,
          completionRate: data.completionRate || 0,
          avgScore: data.avgScore || 0,
          syllabusUploaded: data.syllabusUploaded || false,
          closExtracted: 0
        };
      });
      
      // Fetch CLO counts for each course from backend
      const coursesWithCLOs = await Promise.all(coursesList.map(async (course) => {
        try {
          const response = await fetch(`http://localhost:5000/api/courses/${course.courseCode}/clos`);
          if (response.ok) {
            const data = await response.json();
            const cloCount = data.clos ? data.clos.length : 0;
            return { 
              ...course, 
              closExtracted: cloCount,
              // Keep Firestore syllabusUploaded status, or fall back to CLO-based check
              syllabusUploaded: course.syllabusUploaded || cloCount > 0
            };
          } else {
            return { 
              ...course, 
              closExtracted: 0,
              syllabusUploaded: course.syllabusUploaded || false
            };
          }
        } catch (error) {
          console.error('Error fetching CLOs for course:', course.courseCode, error);
          return { 
            ...course, 
            closExtracted: 0,
            syllabusUploaded: course.syllabusUploaded || false
          };
        }
      }));
      
      setCourses(coursesWithCLOs);
      setLoading(false);

      // Update total syllabi count
      const syllabiCount = coursesWithCLOs.filter(course => course.syllabusUploaded).length;
      setTotalSyllabiSubmitted(syllabiCount);

      // Function to poll MongoDB for comprehensive syllabus status
      const pollSyllabusStatus = async () => {
        if (coursesWithCLOs.length > 0 && currentUser) {
          try {
            // Get comprehensive syllabus status from MongoDB
            const response = await fetch(`http://localhost:5000/api/courses/teacher/${currentUser.uid}/syllabus-status`);
            if (response.ok) {
              const data = await response.json();
              if (data.success) {
                console.log(`🔄 [POLL] Received MongoDB data for ${data.syllabusStatus.length} courses`);
                
                // Update courses with ACTUAL MongoDB data - completely replace local assumptions
                const updatedCourses = coursesWithCLOs.map(course => {
                  const mongoStatus = data.syllabusStatus.find((s: any) => s.courseCode === course.courseCode);
                  if (mongoStatus) {
                    console.log(`✅ [POLL] ${mongoStatus.courseCode} -> hasSyllabus: ${mongoStatus.hasSyllabus}, cloCount: ${mongoStatus.closExtracted}`);
                    return {
                      ...course,
                      syllabusUploaded: mongoStatus.hasSyllabus,
                      closExtracted: mongoStatus.closExtracted,
                      syllabusURL: mongoStatus.syllabusUrl,
                      syllabusUploadedAt: mongoStatus.syllabusUploadedAt
                    };
                  } else {
                    console.warn(`⚠️ [POLL] ${course.courseCode} NOT FOUND in MongoDB response`);
                  }
                  return course;
                });
                setCourses(updatedCourses);
                
                // Update total syllabi count from MongoDB
                setTotalSyllabiSubmitted(data.totalSyllabi);
              }
            }
          } catch (error) {
            console.error('Error polling syllabus status from MongoDB:', error);
            // No fallback - always wait for MongoDB
          }
        }
      };

      // Poll immediately
      pollSyllabusStatus();

      // Set up polling for syllabus status updates every 1 second for real-time updates
      const pollInterval = setInterval(pollSyllabusStatus, 1000);

      return () => clearInterval(pollInterval);
    }, (error) => {
      console.error('Error in courses snapshot:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser, usersSnapshot]);

  const handleDeleteSyllabus = async (courseId: string, courseCode: string) => {
    if (!currentUser) return;

    const confirmDelete = window.confirm(
      `Are you sure you want to delete the syllabus for ${courseCode}? This will also remove all CLOs for this course.`
    );

    if (!confirmDelete) return;

    try {
      // STEP 1: Delete from MongoDB (primary source of truth)
      console.log(`🗑️ Step 1: Deleting from MongoDB for courseCode: ${courseCode}`);
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
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
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
              setTotalSyllabiSubmitted(statusData.totalSyllabi);
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
          const updatedCourses = courses.map(course => 
            course.id === courseId 
              ? { ...course, syllabusUploaded: false, syllabusURL: null, closExtracted: 0 }
              : course
          );
          setTotalSyllabiSubmitted(updatedCourses.filter(course => course.syllabusUploaded).length);
        }
      }

      // Send notifications
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
              message: `The syllabus for ${courseCode} has been removed`,
              type: 'warning',
              timestamp: serverTimestamp(),
              read: false,
              courseId: courseId,
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
            message: `A teacher deleted the syllabus for course ${courseCode}`,
            type: 'warning',
            timestamp: serverTimestamp(),
            read: false,
            courseId: courseId,
            teacherId: currentUser.uid,
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

    const confirmDelete = window.confirm(
      `Are you sure you want to delete the entire course ${courseCode}? This will permanently remove the course, all its CLOs, Bloom levels, and syllabus from the system. This action cannot be undone.`
    );

    if (!confirmDelete) return;

    try {
      const response = await fetch(`http://localhost:5000/api/courses/delete-course?courseCode=${encodeURIComponent(courseCode)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teacherId: currentUser.uid
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete course');
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

  return (
    <div className="min-h-screen bg-secondary/20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate("/teacher-dashboard")}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <BookOpen className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">My Courses</h1>
                <p className="text-sm text-muted-foreground">Manage your courses and track progress</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Section */}
      {!loading && courses.length > 0 && (
        <div className="container mx-auto px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Total Courses</p>
                  <p className="text-2xl font-bold text-primary">{courses.length}</p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Total Students</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {courses.reduce((sum, c) => sum + (c.students || 0), 0)}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Syllabi Submitted</p>
                  <p className="text-2xl font-bold text-green-600" title="Live MongoDB data">{mongodbSyllabusCount}</p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Total CLOs</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {courses.reduce((sum, c) => sum + (c.closExtracted || 0), 0)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading your courses...</p>
            </div>
          </div>
        ) : courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <BookOpen className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Courses Assigned Yet</h3>
            <p className="text-muted-foreground">Please contact admin to assign courses to you.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <Card key={course.id} className="hover:shadow-lg transition-all">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{course.courseName}</CardTitle>
                      <CardDescription>{course.courseId}</CardDescription>
                      <p className="text-xs text-muted-foreground mt-1">
                        {course.degree}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-primary/10 text-primary">
                        {course.creditHours} CH
                      </Badge>
                      {course.syllabusUploaded && (
                        <CheckCircle className="h-5 w-5 text-success" />
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                            <Settings className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {course.closExtracted > 0 && (
                            <DropdownMenuItem 
                              onClick={() => window.open(course.syllabusURL, '_blank')}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download Syllabus
                            </DropdownMenuItem>
                          )}
                          {course.closExtracted > 0 && (
                            <DropdownMenuItem 
                              onClick={() => handleDeleteSyllabus(course.id, course.courseCode)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Syllabus
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            onClick={() => handleDeleteCourse(course.id, course.courseCode)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Course
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                        </DropdownMenu>
                      {course.closExtracted > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600"
                          onClick={() => handleDeleteSyllabus(course.id, course.courseCode)}
                          aria-label={`Delete syllabus for ${course.courseName}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>Students</span>
                      </div>
                      <p className="text-2xl font-bold">{course.students}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileText className="h-4 w-4" />
                          <span>CLOs Extracted</span>
                      </div>
                      <p className="text-2xl font-bold">{course.closExtracted || 0}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>Pending</span>
                      </div>
                      <p className="text-2xl font-bold text-warning">{course.pendingGrading}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Brain className="h-4 w-4" />
                        <span>Quizzes</span>
                      </div>
                      <p className="text-2xl font-bold">{course.quizzes}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Completion Rate</span>
                      <span className="font-medium">{course.completionRate}%</span>
                    </div>
                    <Progress value={course.completionRate} />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gradient-card rounded-lg">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-success" />
                      <span className="text-sm">Class Average</span>
                    </div>
                    <span className="text-lg font-bold">{course.avgScore}%</span>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1">
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default MyCourses;
function getFormattedTeacherName(currentUser: any) {
  throw new Error("Function not implemented.");
}

