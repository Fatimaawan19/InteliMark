import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  FileText, 
  BarChart3, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  HelpCircle, 
  MessageSquare, 
  Search,
  Filter,
  ArrowLeft,
  Brain,
  Calendar,
  User,
  BookOpen,
  XCircle,
  GraduationCap,
  Send,
  Loader2
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { db, auth } from "@/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

// Combined data for both assignments and quizzes
const allSubmissions = [
  {
    id: 1,
    title: "Machine Learning Assignment 3",
    course: "CS-401",
    courseName: "Machine Learning",
    dueDate: "2024-03-25",
    status: "upcoming",
    type: "assignment",
    teacherId: "teacher_1",
    teacherName: "Dr. Smith",
    teacherEmail: "smith@university.edu",
    description: "Implement linear regression model with gradient descent",
    priority: "high"
  },
  {
    id: 2,
    title: "Data Structures Quiz 2",
    course: "CS-301",
    courseName: "Data Structures",
    dueDate: "2024-03-23",
    status: "upcoming",
    type: "quiz",
    teacherId: "teacher_2",
    teacherName: "Prof. Johnson",
    teacherEmail: "johnson@university.edu",
    description: "Trees, graphs, and advanced data structures",
    priority: "medium"
  },
  {
    id: 3,
    title: "Algorithm Analysis Essay",
    course: "CS-301",
    courseName: "Data Structures",
    dueDate: "2024-03-20",
    status: "pastDue",
    type: "assignment",
    teacherId: "teacher_2",
    teacherName: "Prof. Johnson",
    teacherEmail: "johnson@university.edu",
    description: "Compare time complexity of sorting algorithms",
    priority: "high"
  },
  {
    id: 4,
    title: "Database Design Project",
    course: "CS-302",
    courseName: "Database Systems",
    dueDate: "2024-03-28",
    status: "completed",
    grade: 88,
    type: "assignment",
    teacherId: "teacher_3",
    teacherName: "Dr. Wilson",
    teacherEmail: "wilson@university.edu",
    description: "Design a complete database for e-commerce system",
    priority: "medium"
  },
  {
    id: 5,
    title: "Python Functions Test",
    course: "CS-101",
    courseName: "Introduction to Programming",
    dueDate: "2024-03-15",
    status: "completed",
    grade: 92,
    type: "quiz",
    teacherId: "teacher_4",
    teacherName: "Ms. Davis",
    teacherEmail: "davis@university.edu",
    description: "Functions, modules, and error handling",
    priority: "low"
  },
  {
    id: 6,
    title: "Web Development Portfolio",
    course: "CS-250",
    courseName: "Web Development",
    dueDate: "2024-04-01",
    status: "upcoming",
    type: "assignment",
    teacherId: "teacher_5",
    teacherName: "Mr. Brown",
    teacherEmail: "brown@university.edu",
    description: "Create a responsive portfolio website",
    priority: "medium"
  },
  {
    id: 7,
    title: "Operating Systems Midterm",
    course: "CS-350",
    courseName: "Operating Systems",
    dueDate: "2024-03-29",
    status: "upcoming",
    type: "quiz",
    teacherId: "teacher_6",
    teacherName: "Dr. Lee",
    teacherEmail: "lee@university.edu",
    description: "Process management, memory management, file systems",
    priority: "high"
  }
];

const StudentUploads = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCourse, setFilterCourse] = useState("all");
  
  // Help Dialog State
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [helpSubject, setHelpSubject] = useState("");
  const [helpMessage, setHelpMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGetHelp = (item: any) => {
    setSelectedItem(item);
    setHelpSubject(`Help needed with: ${item.title}`);
    setHelpMessage("");
    setHelpDialogOpen(true);
  };

  const handleSubmitHelp = async () => {
    if (!helpMessage.trim()) {
      toast({
        title: "Error",
        description: "Please enter your message.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Get current user info
      const currentUser = auth.currentUser;
      
      // Create help request document in Firebase
      const helpRequestData = {
        // Assignment/Quiz Info
        assignmentId: selectedItem?.id?.toString() || "",
        assignmentTitle: selectedItem?.title || "",
        assignmentType: selectedItem?.type || "assignment",
        courseId: selectedItem?.course || "",
        courseName: selectedItem?.courseName || "",
        
        // Student Info
        studentId: currentUser?.uid || "anonymous",
        studentEmail: currentUser?.email || "anonymous@student.edu",
        studentName: currentUser?.displayName || "Student",
        
        // Teacher Info
        teacherId: selectedItem?.teacherId || "",
        teacherName: selectedItem?.teacherName || "",
        teacherEmail: selectedItem?.teacherEmail || "",
        
        // Message Details
        subject: helpSubject,
        message: helpMessage,
        
        // Status & Metadata
        status: "open",
        priority: selectedItem?.status === "pastDue" ? "high" : "medium",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        
        // Response tracking
        responses: [],
        isRead: false,
        isDeleted: false,
      };
      
      // Add to Firebase collection
      await addDoc(collection(db, "student_help_requests"), helpRequestData);
      
      setIsSubmitting(false);
      setHelpDialogOpen(false);
      setHelpSubject("");
      setHelpMessage("");
      
      toast({
        title: "Message Sent!",
        description: `Your message has been sent to ${selectedItem?.teacherName}. They will respond soon.`,
      });
    } catch (error) {
      console.error("Error sending help request:", error);
      setIsSubmitting(false);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleBack = () => {
    navigate('/student-dashboard');
  };

  // Get unique courses for filter
  const courses = Array.from(new Set(allSubmissions.map(item => item.course))).sort();

  // Filter submissions based on all criteria
  const filteredSubmissions = allSubmissions.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.course.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === "all" || item.type === filterType;
    const matchesStatus = filterStatus === "all" || item.status === filterStatus;
    const matchesCourse = filterCourse === "all" || item.course === filterCourse;

    return matchesSearch && matchesType && matchesStatus && matchesCourse;
  });

  // Stats calculations
  const totalAssignments = allSubmissions.filter(item => item.type === "assignment").length;
  const totalQuizzes = allSubmissions.filter(item => item.type === "quiz").length;
  const upcomingCount = allSubmissions.filter(item => item.status === "upcoming").length;
  const completedCount = allSubmissions.filter(item => item.status === "completed").length;
  const pastDueCount = allSubmissions.filter(item => item.status === "pastDue").length;

  const hasActiveFilters = searchTerm || filterType !== "all" || filterStatus !== "all" || filterCourse !== "all";

  const clearAllFilters = () => {
    setSearchTerm("");
    setFilterType("all");
    setFilterStatus("all");
    setFilterCourse("all");
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getDaysRemaining = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary/5">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white shadow-md border-b border-primary/10">
        <div className="w-full px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-all"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-6 w-6 text-gray-800" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                InteliMark
              </span>
              <Brain className="h-6 w-6 text-primary" />
            </div>
            <div className="hidden md:flex flex-col ml-4 border-l border-gray-300 pl-4">
              <h2 className="text-lg font-semibold text-gray-800">My Uploads</h2>
              <p className="text-xs text-gray-600">Manage all your assignments and quizzes</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        {/* Stats Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          {/* Total Assignments */}
          <Card className="border-primary/20 shadow-sm hover:shadow-md hover:border-blue-400 transition-all duration-200 bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assignments</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{totalAssignments}</p>
                </div>
                <div className="h-10 w-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Quizzes */}
          <Card className="border-primary/20 shadow-sm hover:shadow-md hover:border-purple-400 transition-all duration-200 bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quizzes</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{totalQuizzes}</p>
                </div>
                <div className="h-10 w-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Upcoming */}
          <Card className="border-primary/20 shadow-sm hover:shadow-md hover:border-yellow-400 transition-all duration-200 bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Upcoming</p>
                  <p className="text-2xl font-bold text-yellow-600 mt-1">{upcomingCount}</p>
                </div>
                <div className="h-10 w-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                  <Clock className="h-5 w-5 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Completed */}
          <Card className="border-primary/20 shadow-sm hover:shadow-md hover:border-green-400 transition-all duration-200 bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Completed</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">{completedCount}</p>
                </div>
                <div className="h-10 w-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Past Due */}
          <Card className="border-primary/20 shadow-sm hover:shadow-md hover:border-red-400 transition-all duration-200 bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Past Due</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{pastDueCount}</p>
                </div>
                <div className="h-10 w-10 bg-red-100 rounded-xl flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Search and Filters */}
        <Card className="border-primary/20 shadow-sm mb-6 bg-white">
          <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-xl border-b border-primary/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg font-bold text-gray-900">Search & Filter</CardTitle>
              </div>
              {hasActiveFilters && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearAllFilters}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Search Input */}
              <div className="lg:col-span-1">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Search by title, course..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 border-primary/20 focus:border-primary"
                  />
                </div>
              </div>
              
              {/* Type Filter */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Type</label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="border-primary/20 focus:border-primary">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="assignment">Assignments</SelectItem>
                    <SelectItem value="quiz">Quizzes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Status</label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="border-primary/20 focus:border-primary">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="pastDue">Past Due</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Course Filter */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Course</label>
                <Select value={filterCourse} onValueChange={setFilterCourse}>
                  <SelectTrigger className="border-primary/20 focus:border-primary">
                    <SelectValue placeholder="All Courses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Courses</SelectItem>
                    {courses.map(course => (
                      <SelectItem key={course} value={course}>{course}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-gray-900">
              {hasActiveFilters ? 'Filtered Results' : 'All Uploads'}
            </h3>
            <Badge variant="secondary" className="ml-2">
              {filteredSubmissions.length} {filteredSubmissions.length === 1 ? 'item' : 'items'}
            </Badge>
          </div>
        </div>

        {/* Results List */}
        {filteredSubmissions.length > 0 ? (
          <div className="space-y-4">
            {filteredSubmissions.map((item) => {
              const daysRemaining = getDaysRemaining(item.dueDate);
              const isUrgent = daysRemaining <= 3 && daysRemaining > 0 && item.status === "upcoming";
              
              return (
                <Card 
                  key={item.id} 
                  className={`border shadow-sm hover:shadow-lg transition-all duration-200 bg-white overflow-hidden ${
                    item.status === "pastDue" 
                      ? "border-l-4 border-l-red-500" 
                      : item.status === "completed" 
                        ? "border-l-4 border-l-green-500" 
                        : isUrgent 
                          ? "border-l-4 border-l-orange-500" 
                          : "border-l-4 border-l-primary"
                  }`}
                >
                  <CardContent className="p-0">
                    <div className="flex flex-col md:flex-row md:items-center">
                      {/* Left: Icon & Type */}
                      <div className={`p-6 flex items-center justify-center ${
                        item.type === "assignment" 
                          ? "bg-blue-50" 
                          : "bg-purple-50"
                      }`}>
                        <div className={`h-14 w-14 rounded-xl flex items-center justify-center ${
                          item.type === "assignment" 
                            ? "bg-blue-100" 
                            : "bg-purple-100"
                        }`}>
                          {item.type === "assignment" ? (
                            <FileText className="h-7 w-7 text-blue-600" />
                          ) : (
                            <BarChart3 className="h-7 w-7 text-purple-600" />
                          )}
                        </div>
                      </div>

                      {/* Middle: Content */}
                      <div className="flex-1 p-6">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h4 className="text-lg font-bold text-gray-900">{item.title}</h4>
                          <Badge 
                            variant="outline" 
                            className={`text-xs font-medium ${
                              item.type === "assignment" 
                                ? "border-blue-200 bg-blue-50 text-blue-700" 
                                : "border-purple-200 bg-purple-50 text-purple-700"
                            }`}
                          >
                            {item.type === "assignment" ? "Assignment" : "Quiz"}
                          </Badge>
                          {isUrgent && (
                            <Badge variant="destructive" className="text-xs animate-pulse">
                              Due Soon!
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                          {item.description}
                        </p>
                        
                        <div className="flex flex-wrap items-center gap-4 text-sm">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <BookOpen className="h-4 w-4" />
                            <span className="font-medium">{item.course}</span>
                            <span className="text-xs">• {item.courseName}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <User className="h-4 w-4" />
                            <span>{item.teacherName}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            <span>Due: {formatDate(item.dueDate)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Status & Actions */}
                      <div className="p-6 flex flex-col items-end gap-3 min-w-[180px]">
                        {/* Status Badge */}
                        {item.status === "completed" ? (
                          <div className="text-center w-full">
                            <div className="flex items-center justify-center gap-2 mb-2">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <span className="text-xs font-medium text-green-700">Completed</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate('/view-report')}
                              className="text-green-600 hover:text-green-700 border-green-300 hover:border-green-400 hover:bg-green-50 w-full h-8 text-xs"
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              View Report
                            </Button>
                          </div>
                        ) : item.status === "pastDue" ? (
                          <div className="text-center w-full">
                            <div className="flex items-center justify-center gap-2 mb-2">
                              <AlertCircle className="h-4 w-4 text-red-600" />
                              <span className="text-xs font-medium text-red-700">Past Due</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGetHelp(item)}
                              className="text-orange-600 hover:text-orange-700 border-orange-300 hover:border-orange-400 hover:bg-orange-50 w-full h-8 text-xs"
                            >
                              <MessageSquare className="h-3 w-3 mr-1" />
                              Ask Teacher
                            </Button>
                          </div>
                        ) : (
                          <div className="text-center w-full">
                            <div className="flex items-center justify-center gap-2 mb-2">
                              <Clock className="h-4 w-4 text-yellow-600" />
                              <span className={`text-xs font-medium ${isUrgent ? 'text-orange-700' : 'text-yellow-700'}`}>
                                {daysRemaining > 0 ? `${daysRemaining} days left` : 'Due today'}
                              </span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGetHelp(item)}
                              className="text-primary hover:text-primary/80 border-primary/30 hover:border-primary hover:bg-primary/5 w-full h-8 text-xs"
                            >
                              <HelpCircle className="h-3 w-3 mr-1" />
                              {item.type === "quiz" ? "Ask Question" : "Get Help"}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-primary/20 shadow-sm bg-white">
            <CardContent className="py-16">
              <div className="text-center">
                <div className="h-20 w-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Items Found</h3>
                <p className="text-muted-foreground max-w-md mx-auto mb-6">
                  {hasActiveFilters
                    ? "No assignments or quizzes match your current filters. Try adjusting your search criteria."
                    : "You don't have any assignments or quizzes yet. They will appear here once assigned."}
                </p>
                {hasActiveFilters && (
                  <Button 
                    variant="outline" 
                    onClick={clearAllFilters}
                    className="border-primary/30 hover:border-primary text-primary"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Clear All Filters
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

      </div>

      {/* Help Request Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <MessageSquare className="h-5 w-5" />
              {selectedItem?.status === "pastDue" ? "Ask Teacher" : selectedItem?.type === "quiz" ? "Ask Question" : "Get Help"}
            </DialogTitle>
            <DialogDescription>
              Send a message to your teacher regarding this {selectedItem?.type === "quiz" ? "quiz" : "assignment"}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Assignment/Quiz Info */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                  selectedItem?.type === "assignment" ? "bg-blue-100" : "bg-purple-100"
                }`}>
                  {selectedItem?.type === "assignment" ? (
                    <FileText className="h-5 w-5 text-blue-600" />
                  ) : (
                    <BarChart3 className="h-5 w-5 text-purple-600" />
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{selectedItem?.title}</h4>
                  <p className="text-sm text-muted-foreground">{selectedItem?.course} • {selectedItem?.courseName}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="font-medium">Teacher:</span> {selectedItem?.teacherName}
                  </p>
                </div>
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Subject</label>
              <Input
                value={helpSubject}
                onChange={(e) => setHelpSubject(e.target.value)}
                placeholder="Enter subject..."
                className="border-primary/20 focus:border-primary"
              />
            </div>

            {/* Message */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Your Message <span className="text-red-500">*</span></label>
              <Textarea
                value={helpMessage}
                onChange={(e) => setHelpMessage(e.target.value)}
                placeholder="Describe your question or issue in detail..."
                rows={4}
                className="border-primary/20 focus:border-primary resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setHelpDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitHelp}
              disabled={isSubmitting || !helpMessage.trim()}
              className="bg-primary hover:bg-primary/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Message
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentUploads;
