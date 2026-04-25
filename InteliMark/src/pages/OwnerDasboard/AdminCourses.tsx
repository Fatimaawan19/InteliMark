import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { db } from '../../firebase';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, Timestamp, updateDoc } from 'firebase/firestore';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Teacher {
  id: string;
  name: string;
  email?: string;
  specialization?: string;
}

interface Course {
  id: string;
  courseId: string;
  courseName: string;
  courseDescription: string;
  creditHours: number;
  degree: string;
  assignedTeacher: string;
  teacherName: string;
  teacherEmail: string;
  status: string;
  students: number;
  assignments: number;
  pendingGrading: number;
  quizzes: number;
}

const AdminCourses: React.FC = () => {
  const navigate = useNavigate();
  // Form state
  const [courseId, setCourseId] = useState('');
  const [courseName, setCourseName] = useState('');
  const [courseDescription, setCourseDescription] = useState('');
  const [creditHours, setCreditHours] = useState('');
  const [degree, setDegree] = useState('');
  const [assignedTeacher, setAssignedTeacher] = useState('');
  const [loading, setLoading] = useState(false);
  // Data state
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  
  // Modal state
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateMessage, setDuplicateMessage] = useState('');

  // Fetch teachers from Firestore
  const fetchTeachers = async () => {
    try {
      const teachersCol = collection(db, 'users');
      const q = query(teachersCol, where('role', '==', 'teacher'));
      const teachersSnapshot = await getDocs(q);
      const teachersList = teachersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Teacher[];
      setTeachers(teachersList);
    } catch (error) {
      console.error('Error fetching teachers:', error);
    }
  };
  // Fetch courses from Firestore
  const fetchCourses = async () => {
    try {
      const coursesCol = collection(db, 'courses');
      const coursesSnapshot = await getDocs(coursesCol);
      const coursesList = coursesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id, // Firestore document ID
          courseId: data.courseId,
          courseName: data.courseName,
          courseDescription: data.courseDescription || '',
          creditHours: data.creditHours,
          degree: data.degree,
          assignedTeacher: data.assignedTeacher,
          teacherName: data.teacherName,
          teacherEmail: data.teacherEmail,
          status: data.status,
          students: data.students,
          assignments: data.assignments,
          pendingGrading: data.pendingGrading,
          quizzes: data.quizzes,
        } as Course;
      });
      console.log('Fetched courses:', coursesList);
      setCourses(coursesList);
    } catch (error) {
      console.error('Error fetching courses:', error);
    }
  };

  useEffect(() => {
    fetchTeachers();
    fetchCourses();
  }, []);  // Add course handler

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate teacher selection
    if (!assignedTeacher) {
      alert('Please select a teacher for this course');
      return;
    }
    
    setLoading(true);

    try {
      // Check if course with same courseId or courseName already exists
      const duplicateCourseId = courses.find(c => c.courseId.toLowerCase() === courseId.toLowerCase());
      const duplicateCourseName = courses.find(c => c.courseName.toLowerCase() === courseName.toLowerCase());      if (duplicateCourseId) {
        setDuplicateMessage('Course already exists. Please add a new one.');
        setShowDuplicateModal(true);
        setLoading(false);
        return;
      }

      if (duplicateCourseName) {
        setDuplicateMessage('Course already exists. Please add a new one.');
        setShowDuplicateModal(true);
        setLoading(false);
        return;
      }      const selectedTeacher = teachers.find(t => t.id === assignedTeacher);

      const courseData = {
        courseId,
        courseName,
        courseDescription,
        creditHours: parseInt(creditHours),
        degree,
        assignedTeacher,
        teacherName: selectedTeacher?.name || '',
        teacherEmail: selectedTeacher?.email || '',
        status: 'active',
        students: 0,
        assignments: 0,
        pendingGrading: 0,
        quizzes: 0,
        semester: new Date().getFullYear() + '-' + (new Date().getMonth() + 1).toString().padStart(2, '0'),
        credits: parseInt(creditHours),
        assignedAt: new Date(),
      };

      await addDoc(collection(db, 'courses'), courseData);

      // Create notification for admin
      await addDoc(collection(db, 'notifications'), {
        title: `You just created a course`,
        message: `${courseName}`,
        type: 'success',
        timestamp: Timestamp.now(),
        read: false,
        recipientRole: 'admin'
      });

      // Create notification for all students of that degree
      await addDoc(collection(db, 'notifications'), {
        title: `Admin just created a course`,
        message: `Admin just created course of ${courseName}. Please register it.`,
        type: 'info',
        timestamp: Timestamp.now(),
        read: false,
        recipientRole: 'student',
        targetDegree: degree
      });

      // Create notification for the assigned teacher
      await addDoc(collection(db, 'notifications'), {
        title: `You are assigned to a course`,
        message: `You are assigned to ${courseName}.`,
        type: 'success',
        timestamp: Timestamp.now(),
        read: false,
        recipientRole: 'teacher',
        teacherId: assignedTeacher
      });

      // Create activity for Recent Activities
      await addDoc(collection(db, 'activities'), {
        type: 'course_created',
        description: `Admin created course: ${courseName}`,
        courseName: courseName,
        teacherName: 'Admin',
        timestamp: Timestamp.now()
      });

      alert(`Course ${courseName} added successfully!`);

      // Reset form
      setCourseId('');
      setCourseName('');
      setCourseDescription('');
      setCreditHours('');
      setDegree('');
      setAssignedTeacher('');

      // Refresh courses
      fetchCourses();
    } catch (error: any) {
      console.error(error);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };  // Delete course handler
  const handleDeleteCourse = async (courseId: string) => {
    if (!window.confirm("Are you sure you want to delete this course?")) return;

    try {
      await deleteDoc(doc(db, "courses", courseId));
      alert("Course deleted successfully!");
      fetchCourses();
    } catch (error) {
      console.error("Error deleting course:", error);
      alert("Failed to delete course");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      {/* Title Bar (matches Security page style) */}
      <div className="px-4 md:px-6 pt-8 pb-4 flex items-center gap-4 border-b bg-white/80 backdrop-blur-md shadow-sm">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/admin-dashboard')}
          className="hover:bg-primary/10 transition-all p-2 rounded-lg"
        >
          <svg className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Button>
        <div className="flex items-center gap-2">
          {/* InteliMark Logo & Heading (match Security/Reports style) */}
          <span className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent flex items-center gap-2">
            InteliMark
            {/* Use Lucide Brain icon for consistency with Security page */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" viewBox="0 0 24 24" fill="none"><path d="M17.5 7.5a3.5 3.5 0 0 0-3.5-3.5c-.5 0-.98.09-1.42.26A3.5 3.5 0 0 0 6.5 7.5c0 .5.09.98.26 1.42A3.5 3.5 0 0 0 7.5 17.5c.5 0 .98-.09 1.42-.26A3.5 3.5 0 0 0 17.5 16.5c0-.5-.09-.98-.26-1.42A3.5 3.5 0 0 0 16.5 6.5c-.5 0-.98.09-1.42.26A3.5 3.5 0 0 0 7.5 7.5" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
        </div>
        <div className="pl-6 border-l border-gray-200 flex flex-col">
          <span className="text-2xl font-bold text-gray-900">Course Management</span>
          <span className="text-sm text-gray-600">Manage and organize all courses in the system</span>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Content wrapper with blur effect */}
        <div className={showDuplicateModal ? 'blur-sm pointer-events-none transition-all duration-300' : 'transition-all duration-300'}>
          {/* Enhanced Add Course Form */}
          <Card className="mb-8 border-0 shadow-xl bg-white overflow-hidden">            <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-primary/5 to-transparent relative overflow-hidden">
              <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,white,transparent)]"></div>
              <div className="relative flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-primary to-primary/80 rounded-xl shadow-lg">
                  <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <div>
                  <CardTitle className="text-xl font-bold text-gray-900">Add New Course</CardTitle>
                  <CardDescription className="text-xs text-gray-600">Create a new course and assign it to a teacher</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleAddCourse} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 group">
                    <Label htmlFor="courseId" className="text-sm font-semibold text-gray-700 group-hover:text-primary transition-colors">Course ID</Label>
                    <Input
                      id="courseId"
                      placeholder="e.g., CS-401"
                      value={courseId}
                      onChange={(e) => setCourseId(e.target.value)}
                      required
                      className="border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>
                  <div className="space-y-2 group">
                    <Label htmlFor="courseName" className="text-sm font-semibold text-gray-700 group-hover:text-primary transition-colors">Course Name</Label>
                    <Input
                      id="courseName"
                      placeholder="e.g., Machine Learning"
                      value={courseName}
                      onChange={(e) => setCourseName(e.target.value)}
                      required
                      className="border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2 group">
                  <Label htmlFor="courseDescription" className="text-sm font-semibold text-gray-700 group-hover:text-primary transition-colors">Course Description</Label>
                  <Textarea
                    id="courseDescription"
                    placeholder="Enter course description..."
                    value={courseDescription}
                    onChange={(e) => setCourseDescription(e.target.value)}
                    required
                    rows={3}
                    className="border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 group">
                    <Label htmlFor="creditHours" className="text-sm font-semibold text-gray-700 group-hover:text-primary transition-colors">Credit Hours</Label>
                    <Input
                      id="creditHours"
                      type="number"
                      placeholder="e.g., 3"
                      value={creditHours}
                      onChange={(e) => setCreditHours(e.target.value)}
                      required
                      className="border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>
                  <div className="space-y-2 group">
                    <Label htmlFor="degree" className="text-sm font-semibold text-gray-700 group-hover:text-primary transition-colors">Degree Program</Label>
                    <Select value={degree} onValueChange={setDegree} required>
                      <SelectTrigger className="border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all">
                        <SelectValue placeholder="Select degree" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Bachelor of Computer Science">Bachelor of Computer Science</SelectItem>
                        <SelectItem value="Bachelor of Data Science">Bachelor of Data Science</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2 group">
                  <Label htmlFor="teacher" className="text-sm font-semibold text-gray-700 group-hover:text-primary transition-colors">Assign Teacher</Label>
                  <Select value={assignedTeacher} onValueChange={setAssignedTeacher} required>
                    <SelectTrigger className="border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all">
                      <SelectValue placeholder="Select teacher" />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          {teacher.name} - {teacher.specialization || 'N/A'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  type="submit" 
                  disabled={loading} 
                  className="w-full bg-gradient-to-r from-primary via-primary/90 to-primary hover:from-primary/90 hover:via-primary hover:to-primary/90 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Adding Course...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      <span>Add Course</span>
                    </div>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>          
          
          {/* Enhanced Courses List */}
          <Card className="border-0 shadow-xl bg-white overflow-hidden">
            <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-primary/5 to-transparent relative overflow-hidden">
              <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,white,transparent)]"></div>
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-primary to-primary/80 rounded-xl shadow-lg">
                    <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
                    </svg>
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold text-gray-900">All Courses</CardTitle>
                    <CardDescription className="text-xs text-gray-600">Manage all courses and their assignments</CardDescription>
                  </div>
                </div>
                
                {/* Total Courses Count */}
                <div className="flex items-center gap-2 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-lg shadow-sm border border-gray-200">
                  <span className="text-sm text-gray-600">Total:</span>
                  <span className="text-lg font-bold text-gray-900">{courses.length}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {courses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="p-6 bg-gradient-to-br from-gray-100 to-slate-100 rounded-2xl mb-6 shadow-inner">
                    <svg className="h-16 w-16 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">No Courses Yet</h3>
                  <p className="text-sm text-gray-500 max-w-sm">Add your first course using the form above to get started with course management</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {courses.map((course, index) => (
                    <div
                      key={course.id}
                      className="group relative p-5 bg-gradient-to-br from-white via-white to-slate-50/50 rounded-2xl border-2 border-gray-100 hover:border-primary/40 hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden"
                      style={{
                        animationDelay: `${index * 100}ms`,
                        animation: 'fadeInUp 0.5s ease-out forwards'
                      }}
                    >
                      {/* Animated gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                      
                      {/* Shine effect */}
                      <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none"></div>

                      {/* Course Info */}
                      <div className="relative flex items-start gap-4">
                        <div className="p-3 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl shadow-sm group-hover:shadow-md transition-all">
                          <svg className="h-6 w-6 text-primary" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
                          </svg>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-gray-900 truncate group-hover:text-primary transition-colors text-lg mb-1">
                            {course.courseName}
                          </h3>
                          <p className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">{course.courseId}</span> • {course.creditHours} Credit Hours
                          </p>
                          <p className="text-xs text-gray-500 mb-2 truncate">
                            {course.degree}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap mt-3">
                            <div className="flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-md">
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              {course.teacherName}
                            </div>
                            <span className={`px-2 py-1 rounded-md text-xs font-semibold ${
                              course.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-gray-100 text-gray-700 border border-gray-200'
                            }`}>
                              {course.status}
                            </span>
                          </div>
                        </div>                      </div>

                      {/* Delete Button */}
                      <div className="absolute top-4 right-4">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCourse(course.id);
                          }}
                          className="shadow-md hover:shadow-lg transition-shadow"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-4h4m-4 0a1 1 0 00-1 1v1h6V4a1 1 0 00-1-1m-4 0h4" />
                          </svg>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Duplicate Course Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center">
              {/* Icon */}
              <div className="mb-4 p-3 bg-red-100 rounded-full">
                <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
                {/* Message */}
              <h3 className="text-lg font-bold text-gray-900 mb-2">Course Already Exists</h3>
              <p className="text-gray-600 mb-6">{duplicateMessage}</p>
              
              {/* OK Button */}
              <Button
                onClick={() => setShowDuplicateModal(false)}
                className="w-full bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg hover:shadow-xl transition-all"
              >
                OK
              </Button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default AdminCourses;
