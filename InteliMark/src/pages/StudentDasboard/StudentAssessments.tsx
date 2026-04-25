import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft, 
  Download, 
  Upload,
  Search, 
  FileText, 
  Clock, 
  Calendar,
  User,
  BookOpen,
  AlertCircle,
  CheckCircle,
  Filter,
  BarChart3,
  Eye,
  Brain,
  X,
  Loader2,
  Send,
  MessageSquare,
  HelpCircle,
  XCircle,
  GraduationCap,
  RotateCcw
} from 'lucide-react';
import { auth, db } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import axios from 'axios';
import { useToast } from '@/hooks/use-toast';

type Assessment = {
  _id: string;
  title: string;
  type: 'quiz' | 'assignment';
  courseCode: string;
  courseTitle?: string;
  courseName?: string;
  teacherName?: string;
  teacherEmail?: string;
  totalMarks: number;
  duration?: number; // Only for quizzes
  dueDate?: string;
  status: 'published' | 'draft';
  pdfUrl?: string;
  answerKeyPdfUrl?: string; // Marking rubrics PDF URL
  createdAt: string;
  submissionDeadline?: string;
  allowLateSubmission?: boolean;
  latePenalty?: number; // Penalty percentage per day for late submissions
  description?: string;
};

type Submission = {
  _id: string;
  assessmentId: string;
  submittedAt: string;
  isLate: boolean;
  status: 'submitted' | 'graded' | 'late' | 'pending_review';
  grade?: number;
  maxGrade: number;
  feedback?: string;
  submissionFiles: Array<{
    filename: string;
    originalName: string;
    fileUrl: string;
  }>;
};

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

const StudentAssessments: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter and search state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'assignment' | 'quiz'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'available' | 'submitted' | 'graded' | 'pastdue'>('all');
  const [filterCourse, setFilterCourse] = useState('all');
  
  // Submission dialog state
  const [submissionDialogOpen, setSubmissionDialogOpen] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionText, setSubmissionText] = useState('');
  const [submissionFiles, setSubmissionFiles] = useState<File[]>([]);
  
  // Help dialog state
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [helpSubject, setHelpSubject] = useState('');
  const [helpMessage, setHelpMessage] = useState('');
  const [isSubmittingHelp, setIsSubmittingHelp] = useState(false);
  
  // Overlay state for double-click
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        fetchAssessments(user.uid);
        fetchSubmissions(user.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  // Background refresh: listen for due-date update notifications and refresh once.
  // This avoids UI polling while still making cards unfreeze quickly.
  useEffect(() => {
    if (!currentUser?.uid) return;

    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', currentUser.uid),
      where('type', '==', 'assessment_due_date_updated')
    );

    const unsubscribe = onSnapshot(q, () => {
      fetchAssessments(currentUser.uid);
      fetchSubmissions(currentUser.uid);
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  const fetchAssessments = async (studentId: string) => {
    try {
      setLoading(true);
      const response = await axios.get(`http://localhost:5000/api/assessments/student/${studentId}`);
      
      if (response.data.assessments) {
        setAssessments(response.data.assessments);
      }
    } catch (error) {
      console.error('Error fetching assessments:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubmissions = async (studentId: string) => {
    try {
      const response = await axios.get(`http://localhost:5000/api/submissions/student/${studentId}`);
      
      if (response.data.success && response.data.submissions) {
        const normalized = (response.data.submissions as any[]).map((s) => {
          const rawAssessmentId = s.assessmentId;
          const normalizedAssessmentId =
            typeof rawAssessmentId === 'string'
              ? rawAssessmentId
              : (rawAssessmentId?._id || rawAssessmentId)?.toString?.() || String(rawAssessmentId);

          return {
            ...s,
            assessmentId: normalizedAssessmentId,
            submittedAt: typeof s.submittedAt === 'string' ? s.submittedAt : new Date(s.submittedAt).toISOString(),
          } as Submission;
        });

        setSubmissions(normalized);
      }
    } catch (error) {
      console.error('Error fetching submissions:', error);
    }
  };

  // Helper: Get submission for an assessment
  const getSubmission = (assessmentId: string): Submission | undefined => {
    return submissions.find(sub => sub.assessmentId === assessmentId);
  };

  const getAssessmentDeadline = (assessment: Assessment): string | undefined => {
    return assessment.submissionDeadline || assessment.dueDate;
  };

  const isAssessmentPastDue = (assessment: Assessment): boolean => {
    const deadline = getAssessmentDeadline(assessment);
    if (!deadline) return false;
    return new Date(deadline).getTime() < Date.now();
  };

  const downloadPDF = (pdfUrl: string, fileName: string) => {
    // Ensure the URL has the correct backend base URL
    const fullUrl = pdfUrl.startsWith('http') 
      ? pdfUrl 
      : `http://localhost:5000${pdfUrl}`;
    
    const link = document.createElement('a');
    link.href = fullUrl;
    link.download = fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Open submission dialog
  const openSubmissionDialog = (assessment: Assessment) => {
    const submission = getSubmission(assessment._id);
    
    // Check if already submitted
    if (submission) {
      toast({
        title: "Already Submitted",
        description: `You have already submitted this ${assessment.type}. ${submission.status === 'graded' ? 'It has been graded.' : 'Awaiting grading.'}`,
        variant: "default"
      });
      return;
    }

    const deadline = getAssessmentDeadline(assessment);
    if (!deadline) {
      toast({
        title: "Submission Closed",
        description: "This assessment has no due date, so submission is not enabled.",
        variant: "destructive"
      });
      return;
    }

    // Check if past deadline
    if (isAssessmentPastDue(assessment)) {
      // If late submissions are allowed, allow with warning
      if (assessment.allowLateSubmission) {
        toast({
          title: "Late Submission",
          description: `This is a late submission. A penalty of ${assessment.latePenalty || 0}% will be applied.`,
          variant: "default"
        });
        setSelectedAssessment(assessment);
        setSubmissionText('');
        setSubmissionFiles([]);
        setSubmissionDialogOpen(true);
        return;
      }
      
      // Late submissions not allowed
      toast({
        title: "Submission Closed",
        description: "This assessment is past due. Submission is no longer available.",
        variant: "destructive"
      });
      return;
    }

    setSelectedAssessment(assessment);
    setSubmissionText('');
    setSubmissionFiles([]);
    setSubmissionDialogOpen(true);
  };

  const handleSubmissionFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (!files.length) return;

    const allowedMimeTypes = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/jpg',
      'image/png'
    ]);

    const invalidFile = files.find((file) => !allowedMimeTypes.has(file.type));
    if (invalidFile) {
      toast({
        title: 'Invalid File Type',
        description: 'Only PDF, DOC, DOCX, JPG, and PNG files are allowed.',
        variant: 'destructive'
      });
      event.target.value = '';
      return;
    }

    if (files.length > 5) {
      toast({
        title: 'Too Many Files',
        description: 'You can upload up to 5 files per submission.',
        variant: 'destructive'
      });
      event.target.value = '';
      return;
    }

    setSubmissionFiles(files);
  };

  const handleRemoveSubmissionFile = (indexToRemove: number) => {
    setSubmissionFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleSubmitAssessmentAnswer = async () => {
    if (!selectedAssessment || !currentUser?.uid) return;

    if (submissionFiles.length === 0) {
      toast({
        title: 'File Required',
        description: 'Please upload at least one file before submitting.',
        variant: 'destructive'
      });
      return;
    }

    if (submissionFiles.length > 5) {
      toast({
        title: 'Too Many Files',
        description: 'You can upload up to 5 files per submission.',
        variant: 'destructive'
      });
      return;
    }

    const deadline = getAssessmentDeadline(selectedAssessment);
    if (!deadline) {
      toast({
        title: 'Submission Closed',
        description: 'This assessment has no due date set.',
        variant: 'destructive'
      });
      return;
    }

    // Check if past deadline - only block if late submissions are NOT allowed
    if (isAssessmentPastDue(selectedAssessment) && !selectedAssessment.allowLateSubmission) {
      toast({
        title: 'Submission Closed',
        description: 'This assessment is no longer accepting submissions.',
        variant: 'destructive'
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const formData = new FormData();
      formData.append('assessmentId', selectedAssessment._id);
      formData.append('studentId', currentUser.uid);
      formData.append('submissionText', submissionText.trim());
      formData.append('courseCode', selectedAssessment.courseCode || '');

      for (const file of submissionFiles) {
        formData.append('files', file);
      }

      console.log(`📤 Submitting assessment: ${selectedAssessment._id} for student: ${currentUser.uid}`);
      
      await axios.post('http://localhost:5000/api/submissions/submit', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      console.log('✅ Submission successful');

      toast({
        title: 'Submission Successful',
        description: `Your ${selectedAssessment.type} has been submitted successfully.`
      });

      setSubmissionDialogOpen(false);
      setSubmissionFiles([]);
      setSubmissionText('');

      await fetchSubmissions(currentUser.uid);
    } catch (error: any) {
      const apiError = error?.response?.data?.error || 'Failed to submit assessment.';

      console.error('❌ Submission failed:', apiError);

      toast({
        title: 'Submission Failed',
        description: apiError,
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle help request
  const handleGetHelp = (assessment: Assessment) => {
    setSelectedAssessment(assessment);
    setHelpSubject(`Help needed with: ${assessment.title}`);
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

    setIsSubmittingHelp(true);
    
    try {
      const helpRequestData = {
        assignmentId: selectedAssessment?._id?.toString() || "",
        assignmentTitle: selectedAssessment?.title || "",
        assignmentType: selectedAssessment?.type || "assignment",
        courseId: selectedAssessment?.courseCode || "",
        courseName: selectedAssessment?.courseName || "",
        
        studentId: currentUser?.uid || "anonymous",
        studentEmail: currentUser?.email || "anonymous@student.edu",
        studentName: currentUser?.displayName || "Student",
        
        teacherId: selectedAssessment?.courseCode || "",
        teacherName: selectedAssessment?.teacherName || "",
        teacherEmail: selectedAssessment?.teacherEmail || "",
        
        subject: helpSubject,
        message: helpMessage,
        
        status: "open",
        priority: getAssessmentStatus(selectedAssessment!) === 'Past Due' ? "high" : "medium",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        
        responses: [],
        isRead: false,
        isDeleted: false,
      };
      
      await addDoc(collection(db, "student_help_requests"), helpRequestData);
      
      setIsSubmittingHelp(false);
      setHelpDialogOpen(false);
      setHelpSubject("");
      setHelpMessage("");
      
      toast({
        title: "Message Sent!",
        description: `Your message has been sent to ${selectedAssessment?.teacherName}. They will respond soon.`,
      });
    } catch (error) {
      console.error("Error sending help request:", error);
      setIsSubmittingHelp(false);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (assessment: Assessment) => {
    const submission = getSubmission(assessment._id);
    
    if (submission && submission.status === 'graded') {
      const percentage = ((submission.grade || 0) / submission.maxGrade) * 100;
      const color = percentage >= 70 ? 'bg-green-500' : percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500';
      return (
        <Badge className={color}>
          <CheckCircle className="h-3 w-3 mr-1" />
          Graded: {submission.grade}/{submission.maxGrade}
        </Badge>
      );
    }
    
    if (submission) {
      return (
        <Badge className="bg-blue-500">
          <CheckCircle className="h-3 w-3 mr-1" />
          {submission.isLate ? 'Submitted (Late)' : 'Submitted'}
        </Badge>
      );
    }
    
    const dueDate = getAssessmentDeadline(assessment);
    if (!dueDate) {
      return <Badge className="bg-green-500">Available</Badge>;
    }

    const now = new Date();
    const deadline = new Date(dueDate);
    
    if (now > deadline) {
      if (assessment.allowLateSubmission) {
        return <Badge className="bg-orange-500">Late Allowed</Badge>;
      }
      return <Badge variant="destructive">Past Due</Badge>;
    } else if ((deadline.getTime() - now.getTime()) < 86400000) {
      return <Badge className="bg-yellow-500">Due Soon</Badge>;
    } else {
      return <Badge className="bg-green-500">Available</Badge>;
    }
  };

  const getAssessmentStatus = (assessment: Assessment): string => {
    const submission = getSubmission(assessment._id);
    if (submission && submission.status === 'graded') return 'Graded';
    if (submission) return 'Submitted';
    
    const dueDate = getAssessmentDeadline(assessment);
    if (!dueDate) return 'No Deadline';
    
    const now = new Date();
    const deadline = new Date(dueDate);
    
    if (now > deadline) return assessment.allowLateSubmission ? 'Late Allowed' : 'Past Due';
    else if ((deadline.getTime() - now.getTime()) < 86400000) return 'Due Soon';
    else return 'Available';
  };

  const getTimeRemaining = (dueDate?: string) => {
    if (!dueDate) return 'No deadline';

    const now = new Date();
    const deadline = new Date(dueDate);
    const diffMs = deadline.getTime() - now.getTime();
    
    if (diffMs < 0) return 'Past due';
    
    const diffDays = Math.floor(diffMs / 86400000);
    const diffHours = Math.floor((diffMs % 86400000) / 3600000);
    
    if (diffDays > 0) return `${diffDays} days remaining`;
    if (diffHours > 0) return `${diffHours} hours remaining`;
    return 'Due soon';
  };

  const getDaysRemaining = (dueDate?: string) => {
    if (!dueDate) return null;
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

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

  // Get unique courses
  const courses = Array.from(new Set(assessments.map(a => a.courseCode))).sort();

  // Filter assessments
  const filteredAssessments = assessments
    .filter(assessment => {
      const matchesSearch = 
        assessment.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        assessment.courseCode.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = filterType === 'all' || assessment.type === filterType;
      const matchesCourse = filterCourse === 'all' || assessment.courseCode === filterCourse;
      
      const submission = getSubmission(assessment._id);
      let matchesStatus = true;
      
      if (filterStatus === 'available') {
        const dueDate = getAssessmentDeadline(assessment);
        matchesStatus = !submission && !!dueDate && new Date(dueDate) >= new Date();
      } else if (filterStatus === 'submitted') {
        matchesStatus = submission && submission.status !== 'graded';
      } else if (filterStatus === 'graded') {
        matchesStatus = submission?.status === 'graded';
      } else if (filterStatus === 'pastdue') {
        const dueDate = getAssessmentDeadline(assessment);
        matchesStatus = !submission && dueDate && new Date(dueDate) < new Date();
      }
      
      return matchesSearch && matchesType && matchesCourse && matchesStatus;
    });

  // Calculate stats
  const stats = {
    total: assessments.length,
    assignments: assessments.filter(a => a.type === 'assignment').length,
    quizzes: assessments.filter(a => a.type === 'quiz').length,
    // Available = all "unfrozen" cards (deadline exists AND either not past due OR late is allowed), and not submitted.
    available: assessments.filter(a => {
      if (getSubmission(a._id)) return false;
      const deadline = getAssessmentDeadline(a);
      if (!deadline) return false;
      const isPastDue = new Date(deadline).getTime() < Date.now();
      return !isPastDue || a.allowLateSubmission;
    }).length,
    submitted: submissions.filter(s => s.status !== 'graded').length,
    graded: submissions.filter(s => s.status === 'graded').length,
    // Past Due = only frozen cards (deadline exists AND past due AND late is NOT allowed), and not submitted.
    pastDue: assessments.filter(a => {
      if (getSubmission(a._id)) return false;
      const deadline = getAssessmentDeadline(a);
      if (!deadline) return false;
      return new Date(deadline).getTime() < Date.now() && !a.allowLateSubmission;
    }).length
  };

  const hasActiveFilters = searchQuery || filterType !== 'all' || filterStatus !== 'all' || filterCourse !== 'all';

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterType('all');
    setFilterStatus('all');
    setFilterCourse('all');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary/5">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white shadow-md border-b border-primary/10">
        <div className="w-full px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/student-dashboard')}
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
              <h2 className="text-lg font-semibold text-gray-800">My Assessments</h2>
              <p className="text-xs text-gray-600">Manage your assignments and quizzes</p>
            </div>
          </div>
        </div>
      </header>

      <div className="w-full max-w-screen-2xl mx-auto px-4 md:px-6 py-8">
        {/* Stats Overview Cards */}
        <div className="grid w-full grid-cols-2 gap-3 mb-8 justify-items-stretch md:grid-cols-4 lg:grid-cols-7">
          <Card className="border-2 border-primary/20 shadow-md hover:shadow-xl hover:scale-105 transform transition-all duration-300 bg-white">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{stats.total}</p>
                </div>
                <div className="h-9 w-9 bg-gray-100 rounded-lg flex items-center justify-center">
                  <FileText className="h-4 w-4 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-blue-200 shadow-md hover:shadow-xl hover:scale-105 transform transition-all duration-300 bg-white">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assignments</p>
                  <p className="text-xl font-bold text-blue-600 mt-1">{stats.assignments}</p>
                </div>
                <div className="h-9 w-9 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-purple-200 shadow-md hover:shadow-xl hover:scale-105 transform transition-all duration-300 bg-white">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quizzes</p>
                  <p className="text-xl font-bold text-purple-600 mt-1">{stats.quizzes}</p>
                </div>
                <div className="h-9 w-9 bg-purple-100 rounded-lg flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-yellow-200 shadow-md hover:shadow-xl hover:scale-105 transform transition-all duration-300 bg-white">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Available</p>
                  <p className="text-xl font-bold text-yellow-600 mt-1">{stats.available}</p>
                </div>
                <div className="h-9 w-9 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <Clock className="h-4 w-4 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-green-200 shadow-md hover:shadow-xl hover:scale-105 transform transition-all duration-300 bg-white">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Submitted</p>
                  <p className="text-xl font-bold text-green-600 mt-1">{stats.submitted}</p>
                </div>
                <div className="h-9 w-9 bg-green-100 rounded-lg flex items-center justify-center">
                  <Upload className="h-4 w-4 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-red-200 shadow-md hover:shadow-xl hover:scale-105 transform transition-all duration-300 bg-white">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Past Due</p>
                  <p className="text-xl font-bold text-red-600 mt-1">{stats.pastDue}</p>
                </div>
                <div className="h-9 w-9 bg-red-100 rounded-lg flex items-center justify-center">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card className="border-2 border-primary/20 shadow-md hover:shadow-lg transition-all duration-300 mb-6 bg-white">
          <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-xl border-b border-primary/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg font-bold text-gray-900">Search & Filter</CardTitle>
              </div>
              {hasActiveFilters && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={clearAllFilters}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 hover:border-red-300"
                >
                  <RotateCcw className="h-4 w-4 mr-1.5" />
                  Reset Filters
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Search Input */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Search by title or course (e.g., CSC325)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 border-primary/20 focus:border-primary"
                  />
                </div>
              </div>
              
              {/* Type Filter */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Type</label>
                <Select value={filterType} onValueChange={(val) => setFilterType(val as any)}>
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
                <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val as any)}>
                  <SelectTrigger className="border-primary/20 focus:border-primary">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="graded">Graded</SelectItem>
                    <SelectItem value="pastdue">Past Due</SelectItem>
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
              {hasActiveFilters ? 'Filtered Results' : 'All Assessments'}
            </h3>
            <Badge variant="secondary" className="ml-2">
              {filteredAssessments.length} {filteredAssessments.length === 1 ? 'item' : 'items'}
            </Badge>
          </div>
        </div>

        {/* Results List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filteredAssessments.length > 0 ? (
          <div className="space-y-4">
            {filteredAssessments.map((assessment) => {
              const assessmentDeadline = getAssessmentDeadline(assessment);
              const daysRemaining = getDaysRemaining(assessmentDeadline);
              const statusText = getAssessmentStatus(assessment);
              const isUrgent = daysRemaining && daysRemaining <= 3 && daysRemaining > 0 && statusText === 'Available';
              const submission = getSubmission(assessment._id);
              const isPastDue = isAssessmentPastDue(assessment);
              const isFrozen = !submission && isPastDue && !assessment.allowLateSubmission;
              const isPastDueUnsubmitted = isFrozen;
              const isNoDeadlineUnsubmitted = !submission && !assessmentDeadline;
              const canSubmit = !submission && !isNoDeadlineUnsubmitted && (!isAssessmentPastDue(assessment) || assessment.allowLateSubmission);
              
              return (
                <Card 
                  key={assessment._id} 
                  className={`relative border-2 shadow-md transform transition-all duration-300 ease-in-out overflow-hidden cursor-pointer ${
                    isPastDueUnsubmitted
                      ? "bg-gray-50/90 border-l-4 border-l-red-500 border-red-200 opacity-80 saturate-75"
                      : isNoDeadlineUnsubmitted
                        ? "bg-gray-50/80 border-l-4 border-l-gray-400 border-gray-200 opacity-75"
                      : "bg-white hover:shadow-2xl hover:scale-[1.02]"
                  } ${
                    statusText === "Past Due"
                      ? "hover:border-red-300"
                      : statusText === "Graded" 
                        ? "border-l-4 border-l-green-500 hover:border-green-300" 
                        : isUrgent 
                          ? "border-l-4 border-l-orange-500 hover:border-orange-300" 
                          : "border-l-4 border-l-primary hover:border-primary/50"
                  }`}
                  onDoubleClick={() => setSelectedCardId(selectedCardId === assessment._id ? null : assessment._id)}
                >
                  {/* Main Content */}
                  <CardContent className="p-0 transition-all duration-300">
                    <div className="flex flex-col md:flex-row md:items-center">
                      {/* Left: Icon & Type */}
                      <div className={`p-6 flex items-center justify-center ${
                        isPastDueUnsubmitted
                          ? "bg-gray-100"
                          : assessment.type === "assignment" 
                            ? "bg-blue-50" 
                            : "bg-purple-50"
                      }`}>
                        <div className={`h-14 w-14 rounded-xl flex items-center justify-center ${
                          isPastDueUnsubmitted
                            ? "bg-gray-200"
                            : assessment.type === "assignment" 
                              ? "bg-blue-100" 
                              : "bg-purple-100"
                        }`}>
                          {assessment.type === "assignment" ? (
                            <FileText className={`h-7 w-7 ${isPastDueUnsubmitted ? 'text-gray-500' : 'text-blue-600'}`} />
                          ) : (
                            <BarChart3 className={`h-7 w-7 ${isPastDueUnsubmitted ? 'text-gray-500' : 'text-purple-600'}`} />
                          )}
                        </div>
                      </div>

                      {/* Middle: Content */}
                      <div className="flex-1 p-6">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h4 className="text-lg font-bold text-gray-900">{assessment.title}</h4>
                          <Badge 
                            variant="outline" 
                            className={`text-xs font-medium ${
                              assessment.type === "assignment" 
                                ? "border-blue-200 bg-blue-50 text-blue-700" 
                                : "border-purple-200 bg-purple-50 text-purple-700"
                            }`}
                          >
                            {assessment.type === "assignment" ? "Assignment" : "Quiz"}
                          </Badge>
                          {isUrgent && (
                            <Badge variant="destructive" className="text-xs animate-pulse">
                              Due Soon!
                            </Badge>
                          )}
                        </div>
                        
                        {assessment.description && (
                          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                            {assessment.description}
                          </p>
                        )}
                        
                        <div className="flex flex-wrap items-center gap-4 text-sm">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <BookOpen className="h-4 w-4" />
                            <span className="font-medium">{assessment.courseCode}</span>
                            {assessment.courseName && <span className="text-xs">• {assessment.courseName}</span>}
                          </div>
                          {assessment.teacherName && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <User className="h-4 w-4" />
                              <span>{assessment.teacherName}</span>
                            </div>
                          )}
                          {assessmentDeadline && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Calendar className="h-4 w-4" />
                              <span>Due: {formatDateTime(assessmentDeadline)}</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Late Submission Info */}
                        {assessment.allowLateSubmission && assessment.latePenalty !== undefined && assessment.latePenalty > 0 && (
                          <div className="mt-2">
                            <Badge variant="outline" className="text-xs border-orange-300 bg-orange-50 text-orange-700">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Late submission allowed: -{assessment.latePenalty}% penalty per day
                            </Badge>
                          </div>
                        )}
                      </div>

                      {/* Right: Status & Actions */}
                      <div className="p-6 flex flex-col items-end gap-3 min-w-[200px]">
                        {/* Status Badge */}
                        {statusText === "Graded" && submission ? (
                          <div className="text-center w-full">
                            <div className="flex items-center justify-center gap-2 mb-2">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <span className="text-xs font-medium text-green-700">Graded</span>
                            </div>
                            <div className="text-sm font-bold text-gray-900 mb-2">
                              {submission.grade}/{submission.maxGrade}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                toast({
                                  title: "Grade Details",
                                  description: `Score: ${submission.grade}/${submission.maxGrade}\n${submission.feedback || 'No feedback provided'}`,
                                });
                              }}
                              className="text-green- 600 hover:text-green-700 border-green-300 hover:border-green-400 hover:bg-green-50 w-full h-8 text-xs"
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              View Details
                            </Button>
                          </div>
                        ) : isFrozen ? (
                          <div className="text-center w-full">
                            <div className="flex items-center justify-center gap-2 mb-2">
                              <AlertCircle className="h-4 w-4 text-red-600" />
                              <span className="text-xs font-medium text-red-700">Not Submitted • Past Due</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGetHelp(assessment)}
                              className="text-orange-600 hover:text-orange-700 border-orange-300 hover:border-orange-400 hover:bg-orange-50 w-full h-8 text-xs"
                            >
                              <MessageSquare className="h-3 w-3 mr-1" />
                              Ask Teacher
                            </Button>
                          </div>
                        ) : statusText === "No Deadline" ? (
                          <div className="text-center w-full">
                            <div className="flex items-center justify-center gap-2 mb-2">
                              <AlertCircle className="h-4 w-4 text-gray-600" />
                              <span className="text-xs font-medium text-gray-700">No Due Date Set</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGetHelp(assessment)}
                              className="text-orange-600 hover:text-orange-700 border-orange-300 hover:border-orange-400 hover:bg-orange-50 w-full h-8 text-xs"
                            >
                              <MessageSquare className="h-3 w-3 mr-1" />
                              Ask Teacher
                            </Button>
                          </div>
                        ) : submission ? (
                          <div className="text-center w-full">
                            <div className="flex items-center justify-center gap-2 mb-2">
                              <CheckCircle className="h-4 w-4 text-blue-600" />
                              <span className="text-xs font-medium text-blue-700">Submitted</span>
                            </div>
                            <div className="text-[11px] text-gray-600 mb-2">
                              Submitted: {formatDateTime(submission.submittedAt)}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled
                              className="w-full h-8 text-xs"
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {submission.isLate ? 'Submitted Late' : 'Submitted'}
                            </Button>
                          </div>
                        ) : canSubmit ? (
                          <div className="text-center w-full">
                            {/* Due Date Text */}
                            <div className="flex items-center justify-center mb-2">
                              {daysRemaining === 0 ? (
                                <div className="flex items-center gap-1 text-red-600 font-semibold text-sm">
                                  <Clock className="h-3 w-3" />
                                  Due Today!
                                </div>
                              ) : daysRemaining === 1 ? (
                                <div className="flex items-center gap-1 text-orange-600 font-semibold text-sm">
                                  <Clock className="h-3 w-3" />
                                  Due Tomorrow
                                </div>
                              ) : daysRemaining && daysRemaining <= 3 ? (
                                <div className="flex items-center gap-1 text-yellow-600 font-semibold text-sm">
                                  <Clock className="h-3 w-3" />
                                  {daysRemaining} days left
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-green-600 font-semibold text-sm">
                                  <Clock className="h-3 w-3" />
                                  {daysRemaining && daysRemaining > 0 ? `${daysRemaining} days left` : 'Available'}
                                </div>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openSubmissionDialog(assessment)}
                              className="text-primary hover:text-primary/80 border-primary/30 hover:border-primary hover:bg-primary/5 w-full h-8 text-xs"
                            >
                              <Upload className="h-3 w-3 mr-1" />
                              Upload Answer
                            </Button>
                          </div>
                        ) : (
                          <div className="text-center w-full">
                            <div className="flex items-center justify-center gap-2 mb-2">
                              <AlertCircle className="h-4 w-4 text-gray-600" />
                              <span className="text-xs font-medium text-gray-700">Submission Closed</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGetHelp(assessment)}
                              className="text-orange-600 hover:text-orange-700 border-orange-300 hover:border-orange-400 hover:bg-orange-50 w-full h-8 text-xs"
                            >
                              <MessageSquare className="h-3 w-3 mr-1" />
                              Ask Teacher
                            </Button>
                          </div>
                        )}

                        {/* Download PDF Button */}
                        {assessment.pdfUrl ? (
                          <Button
                            onClick={() => downloadPDF(
                              assessment.pdfUrl!,
                              `${assessment.type}-${assessment.courseCode}-${Date.now()}.pdf`
                            )}
                            size="sm"
                            variant="outline"
                            className="w-full text-xs h-8"
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Download
                          </Button>
                        ) : (
                          <div className="w-full text-xs h-8 flex items-center justify-center text-muted-foreground bg-gray-50 rounded-md border border-dashed border-gray-300">
                            <FileText className="h-3 w-3 mr-1" />
                            No PDF attached
                          </div>
                        )}

                        {/* Marking Rubrics Button (for assignments only) */}
                        {assessment.type === 'assignment' && assessment.answerKeyPdfUrl && (
                          <Button
                            onClick={() => downloadPDF(
                              assessment.answerKeyPdfUrl!,
                              `marking-rubrics-${assessment.courseCode}-${Date.now()}.pdf`
                            )}
                            size="sm"
                            variant="outline"
                            className="w-full text-xs h-8 border-teal-200 text-teal-600 bg-teal-50"
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            Marking Rubrics
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                  
                  {/* Metadata Overlay - Shows on double-click */}
                  <div className={`absolute inset-0 bg-black/60 transition-opacity duration-300 flex items-center justify-center px-4 py-6 ${
                    selectedCardId === assessment._id ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}>
                    <div className="text-white space-y-3 w-full max-w-full">
                      <div className="text-center px-2">
                        <h3 className="text-lg md:text-xl lg:text-2xl font-bold mb-1 line-clamp-2">{assessment.title}</h3>
                        <p className="text-xs text-white/80 uppercase tracking-wider">
                          {assessment.type === "assignment" ? "Assignment" : "Quiz"}
                        </p>
                      </div>
                      
                      <div className="flex flex-wrap items-center justify-center gap-x-4 md:gap-x-6 lg:gap-x-8 gap-y-2 text-xs md:text-sm px-2">
                        {/* Generation Date */}
                        {assessment.createdAt && (
                          <div className="text-center min-w-[80px]">
                            <p className="text-white/60 text-[10px] md:text-xs uppercase tracking-wide mb-0.5">Generated</p>
                            <p className="font-semibold">{formatDate(assessment.createdAt)}</p>
                          </div>
                        )}
                        
                        {/* Due Date */}
                        {assessmentDeadline && (
                          <div className="text-center min-w-[80px]">
                            <p className="text-white/60 text-[10px] md:text-xs uppercase tracking-wide mb-0.5">Due Date</p>
                            <p className="font-semibold">{formatDateTime(assessmentDeadline)}</p>
                          </div>
                        )}
                        
                        {/* Course */}
                        <div className="text-center min-w-[100px] max-w-[200px]">
                          <p className="text-white/60 text-[10px] md:text-xs uppercase tracking-wide mb-0.5">Course</p>
                          <p className="font-semibold truncate">
                            {assessment.courseCode}
                            {assessment.courseName && ` - ${assessment.courseName}`}
                          </p>
                        </div>
                        
                        {/* Teacher */}
                        {assessment.teacherName && (
                          <div className="text-center min-w-[80px] max-w-[150px]">
                            <p className="text-white/60 text-[10px] md:text-xs uppercase tracking-wide mb-0.5">Instructor</p>
                            <p className="font-semibold truncate">{assessment.teacherName}</p>
                          </div>
                        )}
                        
                        {/* Total Marks */}
                        {assessment.totalMarks && (
                          <div className="text-center min-w-[80px]">
                            <p className="text-white/60 text-[10px] md:text-xs uppercase tracking-wide mb-0.5">Total Marks</p>
                            <p className="font-semibold">{assessment.totalMarks} pts</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-2 border-primary/20 shadow-md bg-white">
            <CardContent className="py-16">
              <div className="text-center">
                <div className="h-20 w-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Assessments Found</h3>
                <p className="text-muted-foreground max-w-md mx-auto mb-6">
                  {hasActiveFilters
                    ? "No assessments match your current filters. Try adjusting your search criteria."
                    : "You don't have any assessments yet. They will appear here once assigned."}
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
      <Dialog open={submissionDialogOpen} onOpenChange={setSubmissionDialogOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Upload className="h-5 w-5" />
              Submit {selectedAssessment?.type === 'quiz' ? 'Quiz' : 'Assignment'} Answer
            </DialogTitle>
            <DialogDescription>
              Upload PDF, DOC/DOCX, or image files. {
                selectedAssessment && isAssessmentPastDue(selectedAssessment) && selectedAssessment.allowLateSubmission
                  ? `Late submission will incur a ${selectedAssessment.latePenalty || 0}% penalty.`
                  : "Submission is allowed only before the due date/time."
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {selectedAssessment && isAssessmentPastDue(selectedAssessment) && selectedAssessment.allowLateSubmission && (
              <div className="rounded-lg border border-orange-300 bg-orange-50 p-3 flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-orange-900">Late Submission Warning</p>
                  <p className="text-orange-800 text-xs mt-1">
                    This submission is past the due date. A penalty of <span className="font-semibold">{selectedAssessment.latePenalty || 0}%</span> will be applied to your final grade.
                  </p>
                </div>
              </div>
            )}
            
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
              <p className="font-medium text-gray-900">{selectedAssessment?.title}</p>
              <p className="text-muted-foreground">{selectedAssessment?.courseCode}</p>
              {selectedAssessment && getAssessmentDeadline(selectedAssessment) && (
                <p className="text-muted-foreground mt-1">
                  Due: {formatDateTime(getAssessmentDeadline(selectedAssessment)!)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Optional message</label>
              <Textarea
                value={submissionText}
                onChange={(e) => setSubmissionText(e.target.value)}
                placeholder="Add any brief note for your teacher..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Upload files <span className="text-red-500">*</span></label>
              <Input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.py"
                onChange={handleSubmissionFilesChange}
              />
              <p className="text-xs text-muted-foreground">Allowed: PDF, DOC, DOCX, JPG, PNG, PY. Upload up to 5 files, 10MB each.</p>
            </div>

            {submissionFiles.length > 0 && (
              <div className="space-y-2 rounded-lg border border-gray-200 p-3">
                <p className="text-sm font-medium">Selected Files ({submissionFiles.length})</p>
                <div className="space-y-2">
                  {submissionFiles.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveSubmissionFile(index)}
                        className="h-7 w-7 p-0 text-gray-500 hover:text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSubmissionDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitAssessmentAnswer}
              disabled={isSubmitting || submissionFiles.length === 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Answer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Help Request Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <MessageSquare className="h-5 w-5" />
              {selectedAssessment?.type === "quiz" ? "Ask Question" : "Get Help"}
            </DialogTitle>
            <DialogDescription>
              Send a message to your teacher regarding this {selectedAssessment?.type === "quiz" ? "quiz" : "assignment"}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Assessment Info */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                  selectedAssessment?.type === "assignment" ? "bg-blue-100" : "bg-purple-100"
                }`}>
                  {selectedAssessment?.type === "assignment" ? (
                    <FileText className="h-5 w-5 text-blue-600" />
                  ) : (
                    <BarChart3 className="h-5 w-5 text-purple-600" />
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{selectedAssessment?.title}</h4>
                  <p className="text-sm text-muted-foreground">{selectedAssessment?.courseCode} • {selectedAssessment?.courseName}</p>
                  {selectedAssessment?.teacherName && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-medium">Teacher:</span> {selectedAssessment.teacherName}
                    </p>
                  )}
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
              disabled={isSubmittingHelp}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitHelp}
              disabled={isSubmittingHelp || !helpMessage.trim()}
              className="bg-primary hover:bg-primary/90"
            >
              {isSubmittingHelp ? (
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

export default StudentAssessments;
