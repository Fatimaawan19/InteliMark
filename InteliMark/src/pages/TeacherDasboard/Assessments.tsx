import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ToastAction } from "@/components/ui/toast";
import { ArrowLeft, BookOpen, FileText, Upload, Calendar, Clock, Sparkles, Loader2, ChevronDown, ChevronRight, Info, Settings, X, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { db, auth } from '../../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useToast } from "@/hooks/use-toast";
import axios from 'axios';

const Assessments = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState("quiz");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [courseCLOs, setCourseCLOs] = useState<any[]>([]);
  const [loadingCLOs, setLoadingCLOs] = useState(false);
  const [selectedCLOs, setSelectedCLOs] = useState<string[]>([]);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);

  // Quiz form states
  const [quizTitle, setQuizTitle] = useState('');
  const [quizDifficulty, setQuizDifficulty] = useState('medium');
  const [quizTemplate, setQuizTemplate] = useState('mcq');
  const [quizThreshold, setQuizThreshold] = useState('75');
  const [quizInstructions, setQuizInstructions] = useState('');
  const [quizVisibility, setQuizVisibility] = useState('published');
  const [quizScheduledDate, setQuizScheduledDate] = useState('');
  const [quizScheduledTime, setQuizScheduledTime] = useState('');
  const [quizDueDate, setQuizDueDate] = useState('');
  const [quizDueTime, setQuizDueTime] = useState('');
  const [quizTotalMarks, setQuizTotalMarks] = useState('100');
  const [quizDuration, setQuizDuration] = useState('30');
  const [quizAttempts, setQuizAttempts] = useState('1');
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState('after_submission');
  const [allowLateSubmission, setAllowLateSubmission] = useState(false);

  // Template-specific question counts
  const [mcqCount, setMcqCount] = useState('10');
  const [shortAnswerCount, setShortAnswerCount] = useState('5');
  const [codingCount, setCodingCount] = useState('3');
  const [trueFalseCount, setTrueFalseCount] = useState('10');
  const [fillBlanksCount, setFillBlanksCount] = useState('8');

  // Bloom levels and course data
  const [bloomLevels, setBloomLevels] = useState<any[]>([]);
  const [selectedBloomLevel, setSelectedBloomLevel] = useState('');
  const [selectedCourseData, setSelectedCourseData] = useState<any>(null);

  // Assignment form states
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentDescription, setAssignmentDescription] = useState('');
  const [assignmentTemplate, setAssignmentTemplate] = useState('short');
  const [assignmentVisibility, setAssignmentVisibility] = useState('published');
  
  // Assignment question counts (per template)
  const [assignmentMcqCount, setAssignmentMcqCount] = useState('5');
  const [assignmentShortAnswerCount, setAssignmentShortAnswerCount] = useState('4');
  const [assignmentCodingCount, setAssignmentCodingCount] = useState('3');
  const [assignmentScheduledDate, setAssignmentScheduledDate] = useState('');
  const [assignmentScheduledTime, setAssignmentScheduledTime] = useState('');
  const [assignmentSubmissionDate, setAssignmentSubmissionDate] = useState('');
  const [assignmentSubmissionTime, setAssignmentSubmissionTime] = useState('');
  const [assignmentPoints, setAssignmentPoints] = useState('100');
  const [assignmentSubmissionType, setAssignmentSubmissionType] = useState('file');
  const [assignmentAllowLate, setAssignmentAllowLate] = useState(false);
  const [assignmentLatePenalty, setAssignmentLatePenalty] = useState('10');
  const [assignmentWeightage, setAssignmentWeightage] = useState('10');
  const [assignmentFile, setAssignmentFile] = useState<File | null>(null);
  const [creatingAssignment, setCreatingAssignment] = useState(false);

  // Quiz settings
  const [quizSettingsOpen, setQuizSettingsOpen] = useState(false);

  // Draft assessments state
  const [draftAssessments, setDraftAssessments] = useState<any[]>([]);

  // Utility to clear all drafts from UI
  const clearAllDrafts = () => setDraftAssessments([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [draftsModalOpen, setDraftsModalOpen] = useState(false);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const [draftToApply, setDraftToApply] = useState<any>(null);
  const [applyingDraft, setApplyingDraft] = useState(false);

  // Draft save confirmation dialog states
  const [draftConfirmOpen, setDraftConfirmOpen] = useState(false);
  const [draftConfirmType, setDraftConfirmType] = useState<'quiz' | 'assignment'>('quiz');
  const [pendingDraftTitle, setPendingDraftTitle] = useState('');

  // Assignment download dialog state
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloadPdfUrl, setDownloadPdfUrl] = useState<string>('');
  const [downloadFilename, setDownloadFilename] = useState<string>('');
  const [downloadAssignmentName, setDownloadAssignmentName] = useState<string>('');
  const [downloadCourseCode, setDownloadCourseCode] = useState<string>('');

  const deriveDepartment = (courseCode: string, degree: string) => {
    const deg = String(degree || "").toLowerCase();
    const code = String(courseCode || "").toUpperCase();
    if (deg.includes("computer") && deg.includes("science")) return "CS";
    if (deg.includes("data") && deg.includes("science")) return "DS";
    if (code.startsWith("CSC")) return "CS";
    if (code.startsWith("DS")) return "DS";
    return "N/A";
  };


  // Get current user
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log('👤 Current user:', user.uid);
        setCurrentUser(user);
        loadTeacherCourses(user.uid);
        // Load drafts for current tab
        fetchDraftAssessments(user.uid, activeTab === 'quiz' ? 'quiz' : 'assignment');
      } else {
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate, activeTab]);

  // Load Bloom Taxonomy levels from MongoDB for selected course
  const loadBloomTaxonomyLevels = async (courseId: string) => {
    if (!courseId) return;

    try {
      const response = await fetch(`http://localhost:5000/api/courses/bloom-levels/${courseId}`);
      const data = await response.json();
      if (data.success) {
        setBloomLevels(data.bloomLevels);
      }
    } catch (error) {
      console.error('Error loading Bloom levels:', error);
    }
  };

  // Load teacher's courses from Firestore
  const loadTeacherCourses = async (teacherId: string) => {
    try {
      setLoadingCourses(true);
      console.log('🔍 Loading courses for teacher:', teacherId);

      const coursesRef = collection(db, 'courses');
      const q = query(coursesRef, where('assignedTeacher', '==', teacherId));
      const snapshot = await getDocs(q);

      console.log('📚 Total courses found:', snapshot.docs.length);

      const coursesList = snapshot.docs.map(doc => {
        const data = doc.data();
        console.log('📖 Course:', {
          id: doc.id,
          courseCode: data.courseCode,
          courseName: data.courseName,
          syllabusUploaded: data.syllabusUploaded,
          mongodbCourseId: data.mongodbCourseId
        });
        return { id: doc.id, ...data };
      });

      console.log('✅ All assigned courses loaded:', coursesList.length);

      setCourses(coursesList);

      if (coursesList.length === 0) {
        toast({
          title: "No Courses Assigned",
          description: "You don't have any assigned courses yet.",
          variant: "default"
        });
      }
    } catch (error) {
      console.error('❌ Error loading courses:', error);
      toast({
        title: "Error",
        description: "Failed to load courses",
        variant: "destructive"
      });
    } finally {
      setLoadingCourses(false);
    }
  };

  // Fetch draft assessments for the logged-in teacher by type
  const fetchDraftAssessments = async (teacherId: string, type?: 'quiz' | 'assignment') => {
    try {
      setLoadingDrafts(true);
      const url = `http://localhost:5000/api/assessments/drafts/by-teacher/${teacherId}${type ? `?type=${type}` : ''}`;
      console.log('🔗 FETCH URL:', url);
      const response = await axios.get(url);
      
      console.log('✅ FETCH RESPONSE:', response.data);
      if (response.data.success && response.data.drafts) {
        setDraftAssessments(response.data.drafts);
        console.log(`📋 Found ${response.data.drafts.length} draft ${type || 'assessments'}`);
        console.log('📊 Drafts data:', response.data.drafts);
      } else {
        console.warn('⚠️ Response not successful or no drafts field:', response.data);
      }
    } catch (error) {
      console.error('❌ Error fetching draft assessments:', error.response?.data || error.message);
    } finally {
      setLoadingDrafts(false);
    }
  };

  // Load CLOs when course is selected
  const handleCourseChange = async (courseId: string) => {
    setSelectedCourse(courseId);
    setSelectedCLOs([]);
    setSelectedCourseData(null);

    if (!courseId) {
      setCourseCLOs([]);
      return;
    }

    try {
      setLoadingCLOs(true);
      const course = courses.find(c => c.id === courseId);

      if (!course?.mongodbCourseId) {
        toast({
          title: "No CLOs Available",
          description: "This course doesn't have extracted CLOs yet. Please upload a syllabus to extract CLOs.",
          variant: "destructive"
        });
        setCourseCLOs([]);
        return;
      }

      console.log('🔍 Fetching CLOs for MongoDB course ID:', course.mongodbCourseId);

      // Fetch CLOs and course data from backend
      const response = await fetch(`http://localhost:5000/api/courses/${course.mongodbCourseId}/clos`);
      const data = await response.json();

      console.log('📥 Backend response:', data);

      if (data.success) {
        setCourseCLOs(data.clos);
        setSelectedCourseData(data.course); // Store MongoDB course data
        console.log('✅ Loaded', data.clos.length, 'CLOs');

        // Load Bloom Taxonomy levels for this course
        loadBloomTaxonomyLevels(course.mongodbCourseId);
      } else {
        toast({
          title: "Error",
          description: "Failed to load CLOs",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error loading CLOs:', error);
      toast({
        title: "Error",
        description: "Failed to load CLOs",
        variant: "destructive"
      });
    } finally {
      setLoadingCLOs(false);
    }
  };

  // Toggle CLO selection and auto-select Bloom level
  const toggleCLO = (cloId: string) => {
    setSelectedCLOs(prev => {
      const newSelectedCLOs = prev.includes(cloId)
        ? prev.filter(id => id !== cloId)
        : [...prev, cloId];

      // Auto-select Bloom level based on selected CLOs
      if (newSelectedCLOs.length > 0) {
        const selectedCLOsData = courseCLOs.filter(clo => newSelectedCLOs.includes(clo._id));
        // Get the highest Bloom level from selected CLOs
        const bloomLevelsFromCLOs = selectedCLOsData.map(clo => clo.bloomLevelId?.levelName).filter(Boolean);
        const uniqueLevels = [...new Set(bloomLevelsFromCLOs)];

        if (uniqueLevels.length === 1) {
          setSelectedBloomLevel(uniqueLevels[0]);
        } else {
          const levelOrder = ['Remembering', 'Understanding', 'Applying', 'Analyzing', 'Evaluating', 'Creating'];
          const highestLevel = uniqueLevels.sort((a, b) =>
            levelOrder.indexOf(b) - levelOrder.indexOf(a)
          )[0];
          setSelectedBloomLevel(highestLevel);
        }
      } else {
        setSelectedBloomLevel('');
      }

      return newSelectedCLOs;
    });
  };

  // Reset quiz form to empty/default values
  const resetQuizForm = () => {
    setQuizTitle('');
    setQuizDifficulty('medium');
    setQuizTemplate('mcq');
    setQuizThreshold('75');
    setQuizInstructions('');
    setQuizVisibility('published');
    setQuizScheduledDate('');
    setQuizScheduledTime('');
    setQuizDueDate('');
    setQuizDueTime('');
    setQuizTotalMarks('100');
    setQuizDuration('30');
    setQuizAttempts('1');
    setShuffleQuestions(true);
    setShuffleOptions(true);
    setShowCorrectAnswers('after_submission');
    setAllowLateSubmission(false);
    setMcqCount('10');
    setShortAnswerCount('5');
    setCodingCount('3');
    setTrueFalseCount('10');
    setFillBlanksCount('8');
    setSelectedCLOs([]);
    setSelectedBloomLevel('');
    setUploadedFile(null);
  };

  // Reset assignment form to empty/default values
  const resetAssignmentForm = () => {
    setAssignmentTitle('');
    setAssignmentDescription('');
    setAssignmentTemplate('short');
    setAssignmentVisibility('published');
    setAssignmentScheduledDate('');
    setAssignmentScheduledTime('');
    setAssignmentSubmissionDate('');
    setAssignmentSubmissionTime('');
    setAssignmentPoints('100');
    setAssignmentSubmissionType('file');
    setAssignmentAllowLate(false);
    setAssignmentLatePenalty('10');
    setAssignmentWeightage('10');
    setAssignmentFile(null);
    setAssignmentMcqCount('5');
    setAssignmentShortAnswerCount('4');
    setAssignmentCodingCount('3');
    setSelectedCLOs([]);
    setSelectedBloomLevel('');
  };

  // Helper function to extract question count from description
  const extractQuestionCount = (description: string, template: string): number => {
    // Try to find patterns like "Create 5", "Generate 3", "Write 2", etc.
    const patterns = [/create\s+(\d+)/i, /generate\s+(\d+)/i, /write\s+(\d+)/i, /make\s+(\d+)/i, /(\d+)\s+(?:mcq|coding|short answer|questions|problems)/i];
    
    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match && match[1]) {
        const count = parseInt(match[1]);
        if (count > 0 && count <= 50) return count; // Reasonable limit
      }
    }

    // Default based on template if no count found
    const templateDefaults: { [key: string]: number } = {
      'mcq': 5,
      'short': 4,
      'coding': 3
    };
    return templateDefaults[template] || 5;
  };

  // Helper function to download PDF
  const downloadPDF = (pdfUrl: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "📄 PDF Download Started",
      description: "Check your downloads folder",
      duration: 3000
    });
  };

  // Generate Quiz
  const handleGenerateQuiz = async () => {
    if (!selectedCourse) {
      toast({ title: "Course Required", description: "Please select a course first", variant: "destructive" });
      return;
    }
    if (selectedCLOs.length === 0) {
      toast({ title: "CLOs Required", description: "Please select at least one CLO to assess", variant: "destructive" });
      return;
    }
    // ✅ MANDATORY: Duration validation
    if (!quizDuration || parseInt(quizDuration) <= 0) {
      toast({ title: "Duration Required", description: "Please specify quiz duration in minutes", variant: "destructive" });
      return;
    }

    try {
      setGeneratingQuiz(true);

      const course = courses.find(c => c.id === selectedCourse);
      const proposedTitle = quizTitle || `Quiz - ${course.courseName}`;

      // ✅ Check for duplicate quiz title in the same course
      try {
        const checkResponse = await fetch(`http://localhost:5000/api/assessments/teacher/${currentUser.uid}`);
        if (checkResponse.ok) {
          const checkData = await checkResponse.json();
          if (checkData.success && checkData.assessments) {
            const duplicateExists = checkData.assessments.some(
              (assessment: any) => 
                assessment.courseId === course.mongodbCourseId && 
                assessment.title.toLowerCase() === proposedTitle.toLowerCase() &&
                assessment.type === 'quiz'
            );
            
            if (duplicateExists) {
              toast({ 
                title: "Duplicate Quiz Name", 
                description: "Quiz name already exists for this course. Please choose another name.", 
                variant: "destructive" 
              });
              setGeneratingQuiz(false);
              return;
            }
          }
        }
      } catch (checkError) {
        console.warn('Could not check for duplicates:', checkError);
        // Continue with creation if check fails
      }

      let questionCount = 10;
      if (quizTemplate === 'short-answer' || quizTemplate === 'short') {
        questionCount = parseInt(shortAnswerCount || '5');
      } else if (quizTemplate === 'mcq') {
        questionCount = parseInt(mcqCount || '10');
      } else if (quizTemplate === 'coding') {
        questionCount = parseInt(codingCount || '3');
      } else if (quizTemplate === 'true-false') {
        questionCount = parseInt(trueFalseCount || '10');
      } else if (quizTemplate === 'fill-blanks') {
        questionCount = parseInt(fillBlanksCount || '8');
      } else if (quizTemplate === 'mixed') {
        questionCount = parseInt(mcqCount || '5') +
          parseInt(shortAnswerCount || '3') +
          parseInt(trueFalseCount || '5') +
          parseInt(fillBlanksCount || '2');
      }

      console.log('📊 Form values:', { template: quizTemplate, count: questionCount });

      const assessmentData = {
        type: 'quiz',
        courseId: course.mongodbCourseId,
        cloIds: selectedCLOs,
        clos: courseCLOs.filter(clo => selectedCLOs.includes(clo._id)),
        teacherId: currentUser.uid,
        title: quizTitle || `Quiz - ${course.courseName}`,
        description: quizInstructions || `Assessment for ${selectedCLOs.length} CLOs`,
        difficultyLevel: quizDifficulty,
        threshold: parseInt(quizThreshold),
        questionTemplate: quizTemplate,
        bloomLevel: selectedBloomLevel || undefined,
        bloomLevels: bloomLevels,
        questionCount: questionCount,
        totalMarks: parseInt(quizTotalMarks || String(questionCount)),
        duration: parseInt(quizDuration || '30'),
        dueDate: quizDueDate || '',
        dueTime: quizDueTime || '',
        scheduledDate: quizScheduledDate || '',
        scheduledTime: quizScheduledTime || '',
        attempts: parseInt(quizAttempts || '1'),
        shuffleQuestions: shuffleQuestions,
        shuffleOptions: shuffleOptions,
        showCorrectAnswers: showCorrectAnswers,
        allowLateSubmission: allowLateSubmission,
        mcqCount: parseInt(mcqCount || '10'),
        shortAnswerCount: parseInt(shortAnswerCount || '5'),
        codingCount: parseInt(codingCount || '3'),
        trueFalseCount: parseInt(trueFalseCount || '10'),
        fillBlanksCount: parseInt(fillBlanksCount || '8'),
        quizVisibility: quizVisibility,
        publishImmediately: quizVisibility === 'published',
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 min

      const response = await fetch('http://localhost:5000/api/assessments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assessmentData)
      });

      console.log('📡 Response status:', response.status, response.statusText);
      console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const textResponse = await response.text();
        console.error('❌ Non-JSON response received:', textResponse.substring(0, 500));
        throw new Error(`Server returned non-JSON response (${response.status}). Check backend logs.`);
      }

      const data = await response.json();
      console.log('📥 Response data:', data);
      console.log('📥 PDF URL:', data.assessment?.pdfUrl);
      console.log('📥 Questions Generated:', data.assessment?.questionsGenerated);
      console.log('📥 Status:', data.assessment?.status);
      console.log('📥 Error:', data.error);

      if (data.success) {
        // Priority 1: Check for errors (publishing failed)
        if (data.error || data.message?.includes('failed to publish')) {
          console.error('❌ Publishing failed:', data.error || data.message);
          toast({
            title: "Question Generation Failed",
            description: data.error || "The AI service is not responding. Please ensure Ollama is running and try again.",
            variant: "destructive",
            duration: 15000,
            action: (
              <ToastAction altText="Learn More">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => window.open('https://github.com/ollama/ollama', '_blank')}
                  className="gap-2"
                >
                  Check Ollama
                </Button>
              </ToastAction>
            )
          });
        }
        // Priority 2: Success with PDF
        else if (data.assessment.pdfUrl) {
          console.log('✅ PDF available at:', data.assessment.pdfUrl);

          const assessmentName = data.assessment.title || quizTitle;
          const assessmentType = "Quiz";

          toast({
            title: "Assessment Generated",
            description: (
              <div className="flex flex-col gap-3 py-1">
                <p className="text-sm leading-relaxed">
                  Your <span className="font-medium">{assessmentType}</span> <span className="font-semibold">"{assessmentName}"</span> has been generated successfully.
                </p>
              </div>
            ),
            duration: 20000,
            action: (
              <ToastAction altText="Download PDF" className="border-0 p-0 hover:bg-transparent">
                <Button 
                  size="default" 
                  variant="default"
                  onClick={() => downloadPDF(data.assessment.pdfUrl, `quiz-${course.courseCode}-${Date.now()}.pdf`)}
                  className="gap-2 bg-slate-900 hover:bg-slate-800 text-white font-medium px-6 h-10"
                >
                  <Download size={16} />
                  Download PDF
                </Button>
              </ToastAction>
            )
          });
        }
        // Priority 3: Intentionally saved as draft (no questions generated)
        else if (data.assessment.status === 'draft' && !data.error && (data.assessment.questionsGenerated || 0) === 0) {
          console.log('📝 Quiz saved as draft - no PDF available');
          toast({
            title: "Draft Saved",
            description: `Quiz "${data.assessment.title}" has been saved as draft. Publish it to generate questions and PDF.`,
            duration: 5000
          });
        }
        // Priority 4: Questions pending
        else {
          console.warn('⚠️ PDF not available');
          toast({
            title: "Quiz Created",
            description: `Quiz saved. Questions generated: ${data.assessment.questionsGenerated || 0}. Check the assessment list.`,
            variant: "default",
            duration: 7000
          });
        }

        // Reset form (only when called directly, not via draft confirm which handles its own reset)
        setSelectedCLOs([]);
        setQuizInstructions('');
        setSelectedBloomLevel('');
      } else {
        throw new Error(data.error || data.message || 'Failed to create quiz');
      }
    } catch (error) {
      console.error('❌ Error generating quiz:', error);
      console.error('Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create quiz. Please check console for details.",
        variant: "destructive"
      });
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadedFile(e.target.files[0]);
    }
  };

  const handleCreateAssignment = async () => {
    if (!selectedCourse || selectedCLOs.length === 0) return;

    // ✅ MANDATORY: Deadline validation
    if (!assignmentSubmissionDate) {
      toast({ title: "Deadline Required", description: "Please set a submission deadline date", variant: "destructive" });
      return;
    }
    if (!assignmentSubmissionTime) {
      toast({ title: "Time Required", description: "Please set a submission deadline time", variant: "destructive" });
      return;
    }

    try {
      setCreatingAssignment(true);
      const course = courses.find(c => c.id === selectedCourse);
      const proposedTitle = assignmentTitle || `Assignment - ${course.courseName}`;

      // ✅ Check for duplicate assignment title in the same course
      try {
        const checkResponse = await fetch(`http://localhost:5000/api/assessments/teacher/${currentUser.uid}`);
        if (checkResponse.ok) {
          const checkData = await checkResponse.json();
          if (checkData.success && checkData.assessments) {
            const duplicateExists = checkData.assessments.some(
              (assessment: any) => 
                assessment.courseId === course.mongodbCourseId && 
                assessment.title.toLowerCase() === proposedTitle.toLowerCase() &&
                assessment.type === 'assignment'
            );
            
            if (duplicateExists) {
              toast({ 
                title: "Duplicate Assignment Name", 
                description: "Assignment name already exists for this course. Please choose another name.", 
                variant: "destructive" 
              });
              setCreatingAssignment(false);
              return;
            }
          }
        }
      } catch (checkError) {
        console.warn('Could not check for duplicates:', checkError);
        // Continue with creation if check fails
      }

      // Use explicit question count based on selected template
      let questionCount = 4; // default
      if (assignmentTemplate === 'short') {
        questionCount = parseInt(assignmentShortAnswerCount) || 4;
      } else if (assignmentTemplate === 'coding') {
        questionCount = parseInt(assignmentCodingCount) || 3;
      }

      const assignmentData = {
        type: 'assignment',
        courseId: course.mongodbCourseId,
        cloIds: selectedCLOs,
        clos: courseCLOs.filter(clo => selectedCLOs.includes(clo._id)),
        teacherId: currentUser.uid,
        title: assignmentTitle || `Assignment - ${course.courseName}`,
        description: assignmentDescription || '',
        bloomLevel: selectedBloomLevel || undefined,
        bloomLevels: bloomLevels,
        questionCount: questionCount,
        totalMarks: parseInt(assignmentPoints || '100'),
        submissionDate: assignmentSubmissionDate || '',
        submissionTime: assignmentSubmissionTime || '',
        submissionDeadline: assignmentSubmissionDate && assignmentSubmissionTime
          ? new Date(`${assignmentSubmissionDate}T${assignmentSubmissionTime}`).toISOString()
          : null,
        scheduledDate: assignmentScheduledDate || '',
        scheduledTime: assignmentScheduledTime || '',
        submissionType: assignmentSubmissionType || 'file',
        allowLateSubmission: assignmentAllowLate,
        latePenalty: parseInt(assignmentLatePenalty || '0'),
        weightage: parseInt(assignmentWeightage || '10'),
        assignmentVisibility: assignmentVisibility,
        publishImmediately: assignmentVisibility === 'published',
        questionTemplate: assignmentTemplate,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000);

      const response = await fetch('http://localhost:5000/api/assessments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignmentData),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      console.log('📥 Assignment Response:', data);
      console.log('📥 PDF URL:', data.assessment?.pdfUrl);
      console.log('📥 Questions:', data.assessment?.questionsGenerated);
      console.log('📥 Status:', data.assessment?.status);
      console.log('📥 Error:', data.error);

      if (data.success) {
        // Priority 1: Check for errors (publishing failed)
        if (data.error || data.message?.includes('failed to publish')) {
          console.error('❌ Publishing failed:', data.error || data.message);
          toast({
            title: "Question Generation Failed",
            description: data.error || "The AI service is not responding. Please ensure Ollama is running and try again.",
            variant: "destructive",
            duration: 15000,
            action: (
              <ToastAction altText="Learn More">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => window.open('https://github.com/ollama/ollama', '_blank')}
                  className="gap-2"
                >
                  Check Ollama
                </Button>
              </ToastAction>
            )
          });
        }
        // Priority 2: Success with PDF
        else if (data.assessment.pdfUrl) {
          console.log('✅ PDF available for assignment');
          
          const assessmentName = data.assessment.title || assignmentTitle;

          // Open download dialog instead of toast
          setDownloadAssignmentName(assessmentName);
          setDownloadCourseCode(course?.courseCode || 'COURSE');
          setDownloadPdfUrl(data.assessment.pdfUrl);
          setDownloadFilename(`assignment-${course?.courseCode}-${Date.now()}.pdf`);
          setDownloadDialogOpen(true);
        }
        // Priority 3: Intentionally saved as draft
        else if (data.assessment.status === 'draft' && !data.error && (data.assessment.questionsGenerated || 0) === 0) {
          console.log('📝 Assignment saved as draft - no PDF');
          toast({
            title: "Draft Saved",
            description: `Assignment has been saved as draft. Publish it to generate questions and PDF.`,
            duration: 5000
          });
        }
        // Priority 4: Other scenarios
        else {
          console.warn('⚠️ PDF not ready');
          toast({
            title: "Assignment Created",
            description: `Assignment saved. Questions generated: ${data.assessment.questionsGenerated || 0}. Check the assessment list.`,
            variant: "default",
            duration: 7000
          });
        }
        // Reset form (minimal reset; full reset handled by draft confirm if coming from there)
        setAssignmentTitle('');
        setAssignmentDescription('');
        setSelectedCLOs([]);
      } else {
        throw new Error(data.error || 'Failed to create assignment');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create assignment",
        variant: "destructive"
      });
    } finally {
      setCreatingAssignment(false);
    }
  };

  // Save Quiz as Draft (without generating questions)
  const handleSaveDraftQuiz = async () => {
    if (!selectedCourse) {
      toast({ title: "Course Required", description: "Please select a course first", variant: "destructive" });
      return;
    }
    if (selectedCLOs.length === 0) {
      toast({ title: "CLOs Required", description: "Please select at least one CLO to assess", variant: "destructive" });
      return;
    }

    try {
      setGeneratingQuiz(true);
      const course = courses.find(c => c.id === selectedCourse);
      const proposedTitle = quizTitle || `Quiz - ${course.courseName}`;

      // ✅ Check for duplicate quiz title in the same course
      try {
        const checkResponse = await fetch(`http://localhost:5000/api/assessments/teacher/${currentUser.uid}`);
        if (checkResponse.ok) {
          const checkData = await checkResponse.json();
          if (checkData.success && checkData.assessments) {
            const duplicateExists = checkData.assessments.some(
              (assessment: any) => 
                assessment.courseId === course.mongodbCourseId && 
                assessment.title.toLowerCase() === proposedTitle.toLowerCase() &&
                assessment.type === 'quiz'
            );
            
            if (duplicateExists) {
              toast({ 
                title: "Duplicate Quiz Name", 
                description: "Quiz name already exists for this course. Please choose another name.", 
                variant: "destructive" 
              });
              setGeneratingQuiz(false);
              return;
            }
          }
        }
      } catch (checkError) {
        console.warn('Could not check for duplicates:', checkError);
        // Continue with creation if check fails
      }

      const questionCount = 10; // Placeholder, not used for draft

      const assessmentData = {
        type: 'quiz',
        courseId: course.mongodbCourseId,
        cloIds: selectedCLOs,
        clos: courseCLOs.filter(clo => selectedCLOs.includes(clo._id)),
        teacherId: currentUser.uid,
        title: quizTitle || `Quiz - ${course.courseName}`,
        description: quizInstructions || `Assessment for ${selectedCLOs.length} CLOs`,
        difficultyLevel: quizDifficulty,
        threshold: parseInt(quizThreshold),
        questionTemplate: quizTemplate,
        bloomLevel: selectedBloomLevel || undefined,
        bloomLevels: bloomLevels,
        questionCount: questionCount,
        totalMarks: parseInt(quizTotalMarks || String(questionCount)),
        duration: parseInt(quizDuration || '30'),
        dueDate: quizDueDate || '',
        dueTime: quizDueTime || '',
        scheduledDate: quizScheduledDate || '',
        scheduledTime: quizScheduledTime || '',
        attempts: parseInt(quizAttempts || '1'),
        shuffleQuestions: shuffleQuestions,
        shuffleOptions: shuffleOptions,
        showCorrectAnswers: showCorrectAnswers,
        allowLateSubmission: allowLateSubmission,
        mcqCount: parseInt(mcqCount || '10'),
        shortAnswerCount: parseInt(shortAnswerCount || '5'),
        codingCount: parseInt(codingCount || '3'),
        trueFalseCount: parseInt(trueFalseCount || '10'),
        fillBlanksCount: parseInt(fillBlanksCount || '8'),
        quizVisibility: 'draft',
        publishImmediately: false,
        status: 'draft', // Explicitly set to draft
        generateQuestions: false, // Don't generate questions for draft
      };

      const response = await fetch('http://localhost:5000/api/assessments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assessmentData)
      });

      const data = await response.json();
      console.log('📥 Draft save response:', data);

      if (data.success) {
        toast({
          title: "✓ Draft Saved Successfully!",
          description: `Quiz draft "${quizTitle || 'Untitled Quiz'}" has been saved. No questions were generated yet.`,
          duration: 5000
        });

        // Reset form after saving draft
        resetQuizForm();
        setQuizVisibility('published');
        
        // Refresh draft assessments list to update counter
        if (currentUser?.uid) {
          fetchDraftAssessments(currentUser.uid, 'quiz');
        }
      } else {
        throw new Error(data.error || data.message || 'Failed to save draft');
      }
    } catch (error) {
      console.error('❌ Error saving quiz draft:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save quiz draft",
        variant: "destructive"
      });
    } finally {
      setGeneratingQuiz(false);
    }
  };

  // Save Assignment as Draft (without generating content)
  const handleSaveDraftAssignment = async () => {
    if (!selectedCourse || selectedCLOs.length === 0) return;

    try {
      setCreatingAssignment(true);
      const course = courses.find(c => c.id === selectedCourse);
      const proposedTitle = assignmentTitle || `Assignment - ${course.courseName}`;

      // ✅ Check for duplicate assignment title in the same course
      try {
        const checkResponse = await fetch(`http://localhost:5000/api/assessments/teacher/${currentUser.uid}`);
        if (checkResponse.ok) {
          const checkData = await checkResponse.json();
          if (checkData.success && checkData.assessments) {
            const duplicateExists = checkData.assessments.some(
              (assessment: any) => 
                assessment.courseId === course.mongodbCourseId && 
                assessment.title.toLowerCase() === proposedTitle.toLowerCase() &&
                assessment.type === 'assignment'
            );
            
            if (duplicateExists) {
              toast({ 
                title: "Duplicate Assignment Name", 
                description: "Assignment name already exists for this course. Please choose another name.", 
                variant: "destructive" 
              });
              setCreatingAssignment(false);
              return;
            }
          }
        }
      } catch (checkError) {
        console.warn('Could not check for duplicates:', checkError);
        // Continue with creation if check fails
      }

      // Use explicit question count based on selected template
      let questionCount = 4; // default
      if (assignmentTemplate === 'short') {
        questionCount = parseInt(assignmentShortAnswerCount) || 4;
      } else if (assignmentTemplate === 'coding') {
        questionCount = parseInt(assignmentCodingCount) || 3;
      }

      const assignmentData = {
        type: 'assignment',
        courseId: course.mongodbCourseId,
        cloIds: selectedCLOs,
        clos: courseCLOs.filter(clo => selectedCLOs.includes(clo._id)),
        teacherId: currentUser.uid,
        title: assignmentTitle || `Assignment - ${course.courseName}`,
        description: assignmentDescription || '',
        bloomLevel: selectedBloomLevel || undefined,
        bloomLevels: bloomLevels,
        questionCount: questionCount,
        totalMarks: parseInt(assignmentPoints || '100'),
        submissionDate: assignmentSubmissionDate || '',
        submissionTime: assignmentSubmissionTime || '',
        submissionDeadline: assignmentSubmissionDate && assignmentSubmissionTime
          ? new Date(`${assignmentSubmissionDate}T${assignmentSubmissionTime}`).toISOString()
          : null,
        scheduledDate: assignmentScheduledDate || '',
        scheduledTime: assignmentScheduledTime || '',
        submissionType: assignmentSubmissionType || 'file',
        allowLateSubmission: assignmentAllowLate,
        latePenalty: parseInt(assignmentLatePenalty || '0'),
        weightage: parseInt(assignmentWeightage || '10'),
        questionTemplate: assignmentTemplate,
        assignmentVisibility: 'draft',
        publishImmediately: false,
        status: 'draft', // Explicitly set to draft
        generateQuestions: false, // Don't generate content for draft
      };

      const response = await fetch('http://localhost:5000/api/assessments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignmentData),
      });

      const data = await response.json();
      console.log('📥 Assignment draft save response:', data);

      if (data.success) {
        toast({
          title: "✓ Assignment Draft Saved!",
          description: `Assignment draft "${assignmentTitle || 'Untitled Assignment'}" has been saved.`,
          duration: 5000
        });

        // Reset form after saving draft
        resetAssignmentForm();
        setAssignmentVisibility('published');
        
        // Refresh draft assessments list to update counter
        if (currentUser?.uid) {
          fetchDraftAssessments(currentUser.uid, 'assignment');
        }
      } else {
        throw new Error(data.error || 'Failed to save assignment draft');
      }
    } catch (error) {
      console.error('❌ Error saving assignment draft:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save assignment draft",
        variant: "destructive"
      });
    } finally {
      setCreatingAssignment(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      {/* Header */}
      <div className="px-4 md:px-6 pt-8 pb-6 bg-white/80 backdrop-blur-md shadow-sm border-b border-primary/10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              onClick={() => navigate('/teacher-dashboard')}
              className="hover:bg-primary/10 transition-all p-2 rounded-lg"
            >
              <ArrowLeft className="h-5 w-5 text-gray-700" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Create Assessments
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Create quizzes and assignments for your courses
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Assessment Configuration</CardTitle>
              <CardDescription>
                Choose between creating a quiz or assignment for your students
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={(tab) => {
                setActiveTab(tab);
                setSelectedCourse('');
                setSelectedCLOs([]);
                setCourseCLOs([]);
                setSelectedCourseData(null);
              }} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="quiz" className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Create Quiz
                  </TabsTrigger>
                  <TabsTrigger value="assignment" className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    Create Assignment
                  </TabsTrigger>
                </TabsList>

                {/* ─────────────────────────── QUIZ TAB ─────────────────────────── */}
                <TabsContent value="quiz" className="space-y-6 mt-6">
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    handleGenerateQuiz();
                  }}>
                  {/* ═══ 1. ASSESSMENT BASICS ═══ */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-4">
                    <h3 className="font-semibold text-slate-900 text-base">📋 Assessment Basics</h3>
                    
                    <div className="space-y-2">
                      <Label htmlFor="quiz-title">
                        Quiz Title
                      </Label>
                      <Input
                        id="quiz-title"
                        value={quizTitle}
                        onChange={(e) => setQuizTitle(e.target.value)}
                        placeholder="e.g., Mid-term Quiz - Data Structures"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="quiz-course">Select Course</Label>
                      <Select value={selectedCourse} onValueChange={handleCourseChange} disabled={loadingCourses}>
                        <SelectTrigger id="quiz-course">
                          <SelectValue placeholder={loadingCourses ? "Loading courses..." : "Choose a course"} />
                        </SelectTrigger>
                        <SelectContent>
                          {courses.map((course) => (
                            <SelectItem key={course.id} value={course.id}>
                              {course.courseCode} - {course.courseName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Course Metadata */}
                  {selectedCourseData && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                      <h4 className="font-semibold text-blue-900 text-sm">Course Information</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600">Code:</span>{' '}
                          <span className="font-medium">{selectedCourseData.courseCode}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Degree/Domain:</span>{' '}
                          <span className="font-medium">{courses.find(c => c.id === selectedCourse)?.degree || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Department:</span>{' '}
                          <span className="font-medium">
                            {deriveDepartment(
                              selectedCourseData.courseCode,
                              courses.find(c => c.id === selectedCourse)?.degree || ""
                            )}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Credit Hours:</span>{' '}
                          <span className="font-medium">
                            {courses.find(c => c.id === selectedCourse)?.creditHours || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Total CLOs:</span>{' '}
                          <span className="font-medium">{courseCLOs.length}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ═══ 2. ASSESSMENT SCOPE ═══ */}
                  {selectedCourse && (
                    <div className="space-y-4">
                      <h3 className="font-semibold text-slate-900 text-base border-b pb-2">🎯 Assessment Scope</h3>
                      
                      {/* CLO Selection */}
                      <div className="space-y-3 p-4 bg-primary/5 rounded-lg border border-primary/20">
                        <Label className="text-base font-semibold">Select CLOs to Assess *</Label>
                        {loadingCLOs ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            <span className="ml-2 text-sm text-muted-foreground">Loading CLOs...</span>
                          </div>
                        ) : courseCLOs.length > 0 ? (
                          <ScrollArea className="h-[250px] w-full rounded-md border bg-white p-4">
                            <div className="space-y-3">
                              {courseCLOs.map((clo) => (
                                <div key={clo._id} className="flex items-start space-x-3 p-3 rounded hover:bg-primary/5">
                                  <Checkbox
                                    id={`quiz-clo-${clo._id}`}
                                    checked={selectedCLOs.includes(clo._id)}
                                    onCheckedChange={() => toggleCLO(clo._id)}
                                  />
                                  <div className="flex-1">
                                    <label
                                      htmlFor={`quiz-clo-${clo._id}`}
                                      className="text-sm font-medium leading-none cursor-pointer"
                                    >
                                      CLO-{clo.cloNumber} {clo.unitNumber && `(Unit ${clo.unitNumber})`}
                                    </label>
                                    <p className="text-xs text-muted-foreground mt-1">{clo.description}</p>
                                    <div className="flex gap-2 mt-1">
                                      <span className="text-xs bg-primary/10 px-2 py-0.5 rounded">
                                        {clo.bloomLevelId?.levelName || 'Unknown'}
                                      </span>
                                      {clo.isLabCLO && (
                                        <span className="text-xs bg-blue-100 px-2 py-0.5 rounded">Lab</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No CLOs found. Upload a syllabus first.
                          </p>
                        )}
                        {selectedCLOs.length > 0 && (
                          <p className="text-sm text-primary font-medium">
                            {selectedCLOs.length} CLO{selectedCLOs.length > 1 ? 's' : ''} selected
                          </p>
                        )}
                      </div>

                      {/* Bloom Taxonomy Level - Auto-selected */}
                      {selectedCLOs.length > 0 && selectedBloomLevel && (
                        <div className="space-y-2">
                          <Label htmlFor="bloom-level">Target Bloom's Taxonomy Level (Auto-selected from CLOs)</Label>
                          <Select value={selectedBloomLevel} disabled>
                            <SelectTrigger id="bloom-level" className="bg-gray-50">
                              <SelectValue placeholder="Select cognitive level" />
                            </SelectTrigger>
                            <SelectContent>
                              {bloomLevels.map((bloom: any) => (
                                <SelectItem key={bloom._id} value={bloom.levelName}>
                                  Level {bloom.levelNumber}: {bloom.levelName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Bloom level automatically selected based on the selected CLO(s)
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══ 3. QUESTION CONFIGURATION ═══ */}
                  <h3 className="font-semibold text-slate-900 text-base border-b pb-2">❓ Question Configuration</h3>

                  {/* Question Template */}
                  <div className="space-y-2">
                    <Label htmlFor="quiz-template">
                      Selected Quiz Template
                    </Label>
                    <Select value={quizTemplate} onValueChange={setQuizTemplate}>
                      <SelectTrigger id="quiz-template">
                        <SelectValue placeholder="Choose template type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mcq">Multiple Choice Questions (MCQ)</SelectItem>
                        <SelectItem value="short">Short Answer Questions</SelectItem>
                        <SelectItem value="coding">Coding Exercises</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Configure number of questions below</p>
                  </div>

                  {/* Template-Specific Question Count */}
                  {quizTemplate && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                      <h5 className="font-semibold text-blue-900 text-sm">📝 Configure Question Count</h5>
                      {quizTemplate === 'mcq' && (
                        <div className="space-y-2">
                          <Label htmlFor="mcq-count">Number of MCQs</Label>
                          <Input
                            id="mcq-count"
                            type="number"
                            min="1"
                            value={mcqCount}
                            onChange={(e) => setMcqCount(e.target.value)}
                            placeholder="10"
                          />
                          <p className="text-xs text-muted-foreground">How many multiple choice questions to generate (recommended: 5-15)</p>
                        </div>
                      )}
                      {quizTemplate === 'short' && (
                        <div className="space-y-2">
                          <Label htmlFor="short-count">Number of Short Answer Questions</Label>
                          <Input
                            id="short-count"
                            type="number"
                            min="1"
                            value={shortAnswerCount}
                            onChange={(e) => setShortAnswerCount(e.target.value)}
                            placeholder="5"
                          />
                          <p className="text-xs text-muted-foreground">How many short answer questions to generate (recommended: 3-8)</p>
                        </div>
                      )}
                      {quizTemplate === 'coding' && (
                        <div className="space-y-2">
                          <Label htmlFor="coding-count">Number of Coding Exercises</Label>
                          <Input
                            id="coding-count"
                            type="number"
                            min="1"
                            value={codingCount}
                            onChange={(e) => setCodingCount(e.target.value)}
                            placeholder="3"
                          />
                          <p className="text-xs text-muted-foreground">How many coding exercises to generate (recommended: 2-5)</p>
                        </div>
                      )}
                      {quizTemplate === 'true-false' && (
                        <div className="space-y-2">
                          <Label htmlFor="tf-count">Number of True/False Questions</Label>
                          <Input
                            id="tf-count"
                            type="number"
                            min="1"
                            value={trueFalseCount}
                            onChange={(e) => setTrueFalseCount(e.target.value)}
                            placeholder="10"
                          />
                          <p className="text-xs text-muted-foreground">How many true/false questions to generate (recommended: 8-15)</p>
                        </div>
                      )}
                      {quizTemplate === 'fill-blanks' && (
                        <div className="space-y-2">
                          <Label htmlFor="fb-count">Number of Fill in the Blanks</Label>
                          <Input
                            id="fb-count"
                            type="number"
                            min="1"
                            value={fillBlanksCount}
                            onChange={(e) => setFillBlanksCount(e.target.value)}
                            placeholder="8"
                          />
                          <p className="text-xs text-muted-foreground">How many fill in the blank questions to generate (recommended: 5-12)</p>
                        </div>
                      )}
                      {quizTemplate === 'mixed' && (
                        <div className="space-y-3 p-3 bg-white rounded border border-blue-200">
                          <p className="text-xs font-medium text-gray-700">Specify questions for each type:</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label htmlFor="mixed-mcq" className="text-xs">MCQs</Label>
                              <Input id="mixed-mcq" type="number" min="0" value={mcqCount} onChange={(e) => setMcqCount(e.target.value)} placeholder="5" className="h-8" />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="mixed-short" className="text-xs">Short Answer</Label>
                              <Input id="mixed-short" type="number" min="0" value={shortAnswerCount} onChange={(e) => setShortAnswerCount(e.target.value)} placeholder="3" className="h-8" />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="mixed-tf" className="text-xs">True/False</Label>
                              <Input id="mixed-tf" type="number" min="0" value={trueFalseCount} onChange={(e) => setTrueFalseCount(e.target.value)} placeholder="5" className="h-8" />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="mixed-fb" className="text-xs">Fill Blanks</Label>
                              <Input id="mixed-fb" type="number" min="0" value={fillBlanksCount} onChange={(e) => setFillBlanksCount(e.target.value)} placeholder="2" className="h-8" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══ 4. ASSESSMENT DETAILS ═══ */}
                  <h3 className="font-semibold text-slate-900 text-base border-b pb-2">⚙️ Assessment Details</h3>

                  {/* Difficulty & Threshold - Side by Side */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="quiz-difficulty">Difficulty Level</Label>
                      <Select value={quizDifficulty} onValueChange={setQuizDifficulty}>
                        <SelectTrigger id="quiz-difficulty">
                          <SelectValue placeholder="Select difficulty" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="easy">Easy - Basic understanding</SelectItem>
                          <SelectItem value="medium">Medium - Standard level</SelectItem>
                          <SelectItem value="hard">Hard - Advanced concepts</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="quiz-threshold">Passing Threshold (%)</Label>
                      <Select value={quizThreshold} onValueChange={setQuizThreshold}>
                        <SelectTrigger id="quiz-threshold">
                          <SelectValue placeholder="Select passing grade" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="50">50% - Basic Pass</SelectItem>
                          <SelectItem value="60">60% - Standard Pass</SelectItem>
                          <SelectItem value="70">70% - Good Performance</SelectItem>
                          <SelectItem value="75">75% - Above Average</SelectItem>
                          <SelectItem value="80">80% - Excellent</SelectItem>
                          <SelectItem value="85">85% - Outstanding</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Total Marks and Duration */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="quiz-marks">Total Marks</Label>
                      <Input
                        id="quiz-marks"
                        type="number"
                        min="1"
                        value={quizTotalMarks}
                        onChange={(e) => setQuizTotalMarks(e.target.value)}
                        placeholder="100"
                        required
                      />
                      <p className="text-xs text-muted-foreground">Maximum marks for this quiz</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="quiz-duration">Duration (minutes)</Label>
                      <Input
                        id="quiz-duration"
                        type="number"
                        min="5"
                        required
                        value={quizDuration}
                        onChange={(e) => setQuizDuration(e.target.value)}
                        placeholder="30"
                      />
                      <p className="text-xs text-muted-foreground">Time limit for quiz completion</p>
                    </div>
                  </div>

                  {/* ═══ 5. SUBMISSION SETTINGS ═══ */}
                  <h3 className="font-semibold text-slate-900 text-base border-b pb-2">📤 Submission & Publishing</h3>

                  {/* Due Date and Time */}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-4">
                    <h4 className="font-semibold text-amber-900 text-sm">⏰ Submission Deadline</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="quiz-due-date">Due Date *</Label>
                        <Input
                          id="quiz-due-date"
                          type="date"
                          value={quizDueDate}
                          onChange={(e) => setQuizDueDate(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">Last day students can submit</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="quiz-due-time">Due Time *</Label>
                        <Input
                          id="quiz-due-time"
                          type="time"
                          value={quizDueTime}
                          onChange={(e) => setQuizDueTime(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">Time submissions close</p>
                      </div>
                    </div>
                  </div>

                  {/* Visibility & Advanced Settings */}
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-4 mt-6">
                    <h4 className="font-semibold text-purple-900 text-sm">👁️ Visibility & Settings</h4>
                    
                    <div className="space-y-2">
                      <Label htmlFor="quiz-visibility">Visibility</Label>
                      <div className="relative flex items-center">
                        <Select
                          value={quizVisibility}
                          onValueChange={(val) => {
                            setQuizVisibility(val);
                            if (val === 'draft') {
                              setPendingDraftTitle(quizTitle || 'Untitled Quiz');
                              setDraftConfirmType('quiz');
                              setDraftConfirmOpen(true);
                            }
                          }}
                        >
                          <SelectTrigger id="quiz-visibility" className="pr-10">
                            <SelectValue placeholder="Select visibility" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="published">Publish Immediately</SelectItem>
                            <SelectItem value="draft">Save as Draft</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setQuizSettingsOpen(!quizSettingsOpen)}
                          className="h-6 w-6 p-0 absolute right-2 top-1/2 -translate-y-1/2"
                          tabIndex={-1}
                          aria-label="Quiz Settings"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {quizVisibility === 'published' && 'Quiz will be immediately available to all students'}
                        {quizVisibility === 'draft' && 'Quiz will be saved as draft. You can edit and publish later'}
                      </p>
                      {(() => {
                        console.log('🔍 DEBUG: draftAssessments:', draftAssessments);
                        const quizDrafts = draftAssessments.filter(d => d.type === 'quiz' && d.status === 'draft');
                        console.log('📋 DEBUG: quizDrafts after filter:', quizDrafts);
                        return quizDrafts.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setDraftsModalOpen(true)}
                            className="text-sm font-medium mt-2 text-purple-600 hover:text-purple-700 hover:underline"
                          >
                            📋 View Your Drafts ({quizDrafts.length})
                          </button>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Quiz Settings Dialog */}
                  <Dialog open={quizSettingsOpen} onOpenChange={setQuizSettingsOpen}>
                    <DialogContent className="max-w-2xl animate-fade-in">
                      <DialogHeader>
                        <DialogTitle>⚙️ Quiz Settings</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="quiz-attempts">Number of Attempts</Label>
                            <Select value={quizAttempts} onValueChange={setQuizAttempts}>
                              <SelectTrigger id="quiz-attempts">
                                <SelectValue placeholder="Select attempts" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1 Attempt</SelectItem>
                                <SelectItem value="2">2 Attempts</SelectItem>
                                <SelectItem value="3">3 Attempts</SelectItem>
                                <SelectItem value="unlimited">Unlimited</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="show-answers">Show Correct Answers</Label>
                            <Select value={showCorrectAnswers} onValueChange={setShowCorrectAnswers}>
                              <SelectTrigger id="show-answers">
                                <SelectValue placeholder="When to show" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="never">Never</SelectItem>
                                <SelectItem value="after_submission">After Submission</SelectItem>
                                <SelectItem value="after_deadline">After Deadline</SelectItem>
                                <SelectItem value="immediately">Immediately</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-3 border-t pt-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="shuffle-questions"
                              checked={shuffleQuestions}
                              onCheckedChange={(checked) => setShuffleQuestions(checked as boolean)}
                            />
                            <label htmlFor="shuffle-questions" className="text-sm cursor-pointer">
                              Shuffle questions for each student
                            </label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="shuffle-options"
                              checked={shuffleOptions}
                              onCheckedChange={(checked) => setShuffleOptions(checked as boolean)}
                            />
                            <label htmlFor="shuffle-options" className="text-sm cursor-pointer">
                              Shuffle answer options in MCQs
                            </label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="allow-late"
                              checked={allowLateSubmission}
                              onCheckedChange={(checked) => setAllowLateSubmission(checked as boolean)}
                            />
                            <label htmlFor="allow-late" className="text-sm cursor-pointer">
                              Allow late submissions
                            </label>
                          </div>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* ═══ 6. REVIEW & PUBLISH ═══ */}
                  <h3 className="font-semibold text-slate-900 text-base border-b pb-2">✅ Review & Publish</h3>

                  {/* Quiz Summary */}
                  {selectedCourse && selectedCLOs.length > 0 && (
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <Info className="h-5 w-5 text-green-600" />
                        <h4 className="font-semibold text-green-900">📊 Quiz Summary</h4>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div className="bg-white p-3 rounded border border-green-100">
                          <p className="text-muted-foreground">Course</p>
                          <p className="font-semibold">{courses.find(c => c.id === selectedCourse)?.courseCode}</p>
                        </div>
                        <div className="bg-white p-3 rounded border border-green-100">
                          <p className="text-muted-foreground">CLOs</p>
                          <p className="font-semibold">{selectedCLOs.length} selected</p>
                        </div>
                        <div className="bg-white p-3 rounded border border-green-100">
                          <p className="text-muted-foreground">Template</p>
                          <p className="font-semibold capitalize">{quizTemplate.replace('-', ' ')}</p>
                        </div>
                        <div className="bg-white p-3 rounded border border-green-100">
                          <p className="text-muted-foreground">Total Questions</p>
                          <p className="font-semibold">
                            {quizTemplate === 'mixed'
                              ? parseInt(mcqCount || '0') + parseInt(shortAnswerCount || '0') + parseInt(trueFalseCount || '0') + parseInt(fillBlanksCount || '0')
                              : quizTemplate === 'mcq' ? (parseInt(mcqCount) || 0)
                                : quizTemplate === 'short' ? (parseInt(shortAnswerCount) || 0)
                                  : quizTemplate === 'coding' ? (parseInt(codingCount) || 0)
                                    : quizTemplate === 'true-false' ? (parseInt(trueFalseCount) || 0)
                                      : (parseInt(fillBlanksCount) || 0)}
                          </p>
                        </div>
                        <div className="bg-white p-3 rounded border border-green-100">
                          <p className="text-muted-foreground">Total Marks</p>
                          <p className="font-semibold">{quizTotalMarks}</p>
                        </div>
                        <div className="bg-white p-3 rounded border border-green-100">
                          <p className="text-muted-foreground">Duration</p>
                          <p className="font-semibold">{quizDuration} mins</p>
                        </div>
                      </div>
                      <div className="pt-2 text-xs text-green-700 bg-green-100 p-2 rounded">
                        <strong>✓ Ready to generate:</strong> All required fields are filled. Click "Generate Quiz" to proceed.
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-4 pt-6">
                    <Button
                      type="submit"
                      className="flex-1"
                      size="lg"
                      disabled={!selectedCourse || selectedCLOs.length === 0 || generatingQuiz || !quizTemplate}
                    >
                      {generatingQuiz ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Creating Quiz...
                        </>
                      ) : (
                        <>
                          <FileText className="mr-2 h-5 w-5" />
                          Generate Quiz
                        </>
                      )}
                    </Button>
                  </div>
                  </form>
                </TabsContent>

                {/* ─────────────────────────── ASSIGNMENT TAB ─────────────────────────── */}
                <TabsContent value="assignment" className="space-y-6 mt-6">
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    handleCreateAssignment();
                  }}>
                  {/* ═══ 1. ASSIGNMENT BASICS ═══ */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-4">
                    <h3 className="font-semibold text-slate-900 text-base">📋 Assessment Basics</h3>
                    
                    <div className="space-y-2">
                      <Label htmlFor="assignment-title">Assignment Title</Label>
                      <Input
                        id="assignment-title"
                        value={assignmentTitle}
                        onChange={(e) => setAssignmentTitle(e.target.value)}
                        placeholder="e.g., Programming Project - Binary Search Tree Implementation"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="assign-course">Select Course</Label>
                      <Select value={selectedCourse} onValueChange={handleCourseChange} disabled={loadingCourses}>
                        <SelectTrigger id="assign-course">
                          <SelectValue placeholder={loadingCourses ? "Loading courses..." : "Choose a course"} />
                        </SelectTrigger>
                        <SelectContent>
                          {courses.map((course) => (
                            <SelectItem key={course.id} value={course.id}>
                              {course.courseCode} - {course.courseName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Course Metadata */}
                  {selectedCourseData && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                      <h4 className="font-semibold text-blue-900 text-sm">Course Information</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600">Code:</span>{' '}
                          <span className="font-medium">{selectedCourseData.courseCode}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Degree/Domain:</span>{' '}
                          <span className="font-medium">{courses.find(c => c.id === selectedCourse)?.degree || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Department:</span>{' '}
                          <span className="font-medium">
                            {deriveDepartment(
                              selectedCourseData.courseCode,
                              courses.find(c => c.id === selectedCourse)?.degree || ""
                            )}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Credit Hours:</span>{' '}
                          <span className="font-medium">
                            {courses.find(c => c.id === selectedCourse)?.creditHours || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Total CLOs:</span>{' '}
                          <span className="font-medium">{courseCLOs.length}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ═══ 2. ASSIGNMENT SCOPE ═══ */}
                  {selectedCourse && (
                    <div className="space-y-4">
                      <h3 className="font-semibold text-slate-900 text-base border-b pb-2">🎯 Assessment Scope</h3>

                      {/* CLO Selection */}
                      <div className="space-y-3 p-4 bg-primary/5 rounded-lg border border-primary/20">
                        <Label className="text-base font-semibold">Select CLOs to Assess *</Label>
                        {loadingCLOs ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            <span className="ml-2 text-sm text-muted-foreground">Loading CLOs...</span>
                          </div>
                        ) : courseCLOs.length > 0 ? (
                          <ScrollArea className="h-[250px] w-full rounded-md border bg-white p-4">
                            <div className="space-y-3">
                              {courseCLOs.map((clo) => (
                                <div key={clo._id} className="flex items-start space-x-3 p-3 rounded hover:bg-primary/5">
                                  <Checkbox
                                    id={`assign-clo-${clo._id}`}
                                    checked={selectedCLOs.includes(clo._id)}
                                    onCheckedChange={() => toggleCLO(clo._id)}
                                  />
                                  <div className="flex-1">
                                    <label
                                      htmlFor={`assign-clo-${clo._id}`}
                                      className="text-sm font-medium leading-none cursor-pointer"
                                    >
                                      CLO-{clo.cloNumber} {clo.unitNumber && `(Unit ${clo.unitNumber})`}
                                    </label>
                                    <p className="text-xs text-muted-foreground mt-1">{clo.description}</p>
                                    <div className="flex gap-2 mt-1">
                                      <span className="text-xs bg-primary/10 px-2 py-0.5 rounded">
                                        {clo.bloomLevelId?.levelName || 'Unknown'}
                                      </span>
                                      {clo.isLabCLO && (
                                        <span className="text-xs bg-blue-100 px-2 py-0.5 rounded">Lab</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No CLOs found. Upload a syllabus first.
                          </p>
                        )}
                        {selectedCLOs.length > 0 && (
                          <p className="text-sm text-primary font-medium">
                            {selectedCLOs.length} CLO{selectedCLOs.length > 1 ? 's' : ''} selected
                          </p>
                        )}
                      </div>

                      {/* Bloom Taxonomy Level - Auto-selected */}
                      {selectedCLOs.length > 0 && selectedBloomLevel && (
                        <div className="space-y-2">
                          <Label htmlFor="assign-bloom">Target Bloom's Taxonomy Level (Auto-selected from CLOs)</Label>
                          <Select value={selectedBloomLevel} disabled>
                            <SelectTrigger id="assign-bloom" className="bg-gray-50">
                              <SelectValue placeholder="Select cognitive level" />
                            </SelectTrigger>
                            <SelectContent>
                              {bloomLevels.map((bloom: any) => (
                                <SelectItem key={bloom._id} value={bloom.level}>
                                  Level {bloom.levelNumber}: {bloom.level}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Bloom level automatically selected based on the selected CLO(s)
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══ 3. ASSIGNMENT INSTRUCTIONS ═══ */}
                  <h3 className="font-semibold text-slate-900 text-base border-b pb-2">📝 Instructions & Materials</h3>

                  {/* Question Template Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="assign-template">
                      Question Template
                    </Label>
                    <Select value={assignmentTemplate} onValueChange={setAssignmentTemplate}>
                      <SelectTrigger id="assign-template">
                        <SelectValue placeholder="Choose question type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short">Short Answer Questions</SelectItem>
                        <SelectItem value="coding">Coding Exercises</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Select the type of questions to generate.
                    </p>
                  </div>

                  {/* Number of Questions Input - Template Specific */}
                  {assignmentTemplate === 'short' && (
                    <div className="space-y-2">
                      <Label htmlFor="assign-short-count">
                        Number of Short Answer Questions
                      </Label>
                      <Input
                        id="assign-short-count"
                        type="number"
                        min="1"
                        max="15"
                        required
                        value={assignmentShortAnswerCount}
                        onChange={(e) => setAssignmentShortAnswerCount(e.target.value)}
                        placeholder="4"
                      />
                      <p className="text-xs text-muted-foreground">
                        How many short answer questions to generate (recommended: 2-8)
                      </p>
                    </div>
                  )}
                  {assignmentTemplate === 'coding' && (
                    <div className="space-y-2">
                      <Label htmlFor="assign-coding-count">
                        Number of Coding Problems
                      </Label>
                      <Input
                        id="assign-coding-count"
                        type="number"
                        min="1"
                        max="10"
                        required
                        value={assignmentCodingCount}
                        onChange={(e) => setAssignmentCodingCount(e.target.value)}
                        placeholder="3"
                      />
                      <p className="text-xs text-muted-foreground">
                        How many coding problems to generate (recommended: 2-5)
                      </p>
                    </div>
                  )}

                  {/* Assignment Description */}
                  <div className="space-y-2">
                    <Label htmlFor="assign-description">Assignment Description & Focus (Optional)</Label>
                    <Textarea
                      id="assign-description"
                      value={assignmentDescription}
                      onChange={(e) => setAssignmentDescription(e.target.value)}
                      placeholder={
                        assignmentTemplate === 'short'
                          ? "Specify what you want students to explain. Example: 'Students should explain normalization concepts (1NF, 2NF, 3NF) with real-world examples.'"
                          : "Specify implementation details. Example: 'Focus on dynamic programming with memoization optimization and test case examples.'"
                      }
                      className="min-h-[120px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      {assignmentTemplate === 'short'
                        ? "Specify the depth of explanation expected and key concepts students should discuss."
                        : "Specify programming language preference and specific algorithms/techniques to cover."}
                    </p>
                  </div>

                  {/* Attach Assignment File */}
                  {/* COMMENTED OUT - File upload feature disabled
                  <div className="space-y-2">
                    <Label>Attach Assignment File (Optional)</Label>
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer">
                      <Input
                        type="file"
                        id="assignment-file-upload"
                        className="hidden"
                        accept=".pdf,.docx,.txt,.zip"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setAssignmentFile(e.target.files[0]);
                          }
                        }}
                      />
                      <label htmlFor="assignment-file-upload" className="cursor-pointer">
                        <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                        <p className="text-sm font-medium mb-1">
                          {assignmentFile ? assignmentFile.name : "Click to upload assignment instructions/files"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          PDF, DOCX, TXT, or ZIP files (Max 25MB)
                        </p>
                      </label>
                    </div>
                    {assignmentFile && (
                      <div className="flex items-center justify-between p-3 bg-primary/10 rounded border border-primary/20">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">{assignmentFile.name}</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setAssignmentFile(null)}>
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                  */}

                  {/* ═══ 4. GRADING SETUP ═══ */}
                  <h3 className="font-semibold text-slate-900 text-base border-b pb-2">📊 Grading Setup</h3>

                  {/* Grading Settings */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                    <h4 className="font-semibold text-slate-900 text-sm">Grading Settings</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="assign-points">Total Points</Label>
                        <Input
                          id="assign-points"
                          type="number"
                          min="1"
                          value={assignmentPoints}
                          onChange={(e) => setAssignmentPoints(e.target.value)}
                          placeholder="100"
                          required
                        />
                        <p className="text-xs text-muted-foreground">Maximum points for this assignment</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="assign-weightage">Weightage in Final Grade (%)</Label>
                        <Input
                          id="assign-weightage"
                          type="number"
                          min="0"
                          max="100"
                          value={assignmentWeightage}
                          onChange={(e) => setAssignmentWeightage(e.target.value)}
                          placeholder="10"
                        />
                        <p className="text-xs text-muted-foreground">Contribution to course grade</p>
                      </div>
                    </div>
                  </div>

                  {/* Submission Settings */}
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-4 mt-6">
                    <h4 className="font-semibold text-slate-900 text-sm">📤 Submission Settings</h4>
                    
                    {/* Visibility */}
                    <div className="space-y-2">
                      <Label htmlFor="assign-visibility">Visibility</Label>
                      <Select
                        value={assignmentVisibility}
                        onValueChange={(val) => {
                          setAssignmentVisibility(val);
                          if (val === 'draft') {
                            setPendingDraftTitle(assignmentTitle || 'Untitled Assignment');
                            setDraftConfirmType('assignment');
                            setDraftConfirmOpen(true);
                          }
                        }}
                      >
                        <SelectTrigger id="assign-visibility">
                          <SelectValue placeholder="Select visibility" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="published">Publish Immediately</SelectItem>
                          <SelectItem value="draft">Save as Draft</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {assignmentVisibility === 'published' && 'Assignment will be immediately available to all students'}
                        {assignmentVisibility === 'draft' && 'Assignment will be saved as draft. You can edit and publish later'}
                      </p>
                      {(() => {
                        const assignmentDrafts = draftAssessments.filter(d => d.type === 'assignment' && d.status === 'draft');
                        return assignmentDrafts.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setDraftsModalOpen(true)}
                            className="text-sm font-medium mt-2 text-purple-600 hover:text-purple-700 hover:underline"
                          >
                            📋 View Your Drafts ({assignmentDrafts.length})
                          </button>
                        );
                      })()}
                    </div>

                    {/* Submission Type */}
                    <div className="space-y-2">
                      <Label htmlFor="submission-type">Submission Type</Label>
                      <Select value={assignmentSubmissionType} onValueChange={setAssignmentSubmissionType}>
                        <SelectTrigger id="submission-type">
                          <SelectValue placeholder="Select submission type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="file">File Upload</SelectItem>
                          <SelectItem value="text">Text Submission</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Submission Deadline */}
                    <div className="space-y-3 border-t border-purple-200 pt-3">
                      <Label className="text-sm font-medium">Submission Deadline</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="assign-submit-date" className="text-xs">Date</Label>
                          <Input
                            id="assign-submit-date"
                            type="date"
                            required
                            value={assignmentSubmissionDate}
                            onChange={(e) => setAssignmentSubmissionDate(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">Last day students can submit</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="assign-submit-time" className="text-xs">Time</Label>
                          <Input
                            id="assign-submit-time"
                            type="time"
                            required
                            value={assignmentSubmissionTime}
                            onChange={(e) => setAssignmentSubmissionTime(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">Time submissions close</p>
                        </div>
                      </div>
                    </div>

                    {/* Late Submission Policy */}
                    <div className="space-y-2 border-t border-purple-200 pt-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="allow-late-assign"
                          checked={assignmentAllowLate}
                          onCheckedChange={(checked) => setAssignmentAllowLate(checked as boolean)}
                        />
                        <label htmlFor="allow-late-assign" className="text-sm font-medium cursor-pointer">
                          Allow late submissions
                        </label>
                      </div>
                      {assignmentAllowLate && (
                        <div className="space-y-2 ml-6 mt-2 p-3 bg-white rounded border border-purple-100">
                          <Label htmlFor="late-penalty" className="text-xs">Penalty per day (%)</Label>
                          <Input
                            id="late-penalty"
                            type="number"
                            min="0"
                            max="100"
                            value={assignmentLatePenalty}
                            onChange={(e) => setAssignmentLatePenalty(e.target.value)}
                            placeholder="10"
                          />
                          <p className="text-xs text-muted-foreground">Marks deducted for each day late</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Create Assignment Button */}
                  <div className="flex gap-4 pt-6">
                    <Button
                      type="submit"
                      size="lg"
                      className="flex-1 bg-gradient-to-r from-primary to-primary/80"
                      disabled={!selectedCourse || selectedCLOs.length === 0 || creatingAssignment}
                    >
                      {creatingAssignment ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Creating Assignment...
                        </>
                      ) : (
                        <>
                          <FileText className="mr-2 h-4 w-4" />
                          Create Assignment
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Preview Section */}
                  <div className="mt-8 p-4 bg-gradient-to-r from-purple-100 to-blue-100 rounded-lg">
                    <p className="text-sm text-muted-foreground text-center">
                      {selectedCLOs.length > 0
                        ? `Assignment will assess ${selectedCLOs.length} CLO${selectedCLOs.length > 1 ? 's' : ''}`
                        : 'Select CLOs above to create an assignment'}
                    </p>
                  </div>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* ─── Drafts Modal ─── */}
      <Dialog open={draftsModalOpen} onOpenChange={(open) => {
        setDraftsModalOpen(open);
        if (open && currentUser) {
          // Fetch drafts when modal opens
          fetchDraftAssessments(currentUser.uid, activeTab === 'quiz' ? 'quiz' : 'assignment');
        }
        if (!open) {
          setSelectedDraftId(null);
          setDraftToApply(null);
        }
      }}>
        <DialogContent className="max-w-2xl animate-fade-in">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-purple-600" />
              Your Draft Assessments
            </DialogTitle>
            <DialogDescription>
              Single-click to select • Double-click to apply
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {(() => {
              const filteredDrafts = draftAssessments.filter(draft => draft.type === activeTab);
              return filteredDrafts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-gray-300 mb-3" />
                  <p className="text-gray-500 font-medium">No draft {activeTab === 'quiz' ? 'quizzes' : 'assignments'} yet</p>
                </div>
              ) : (
                <ScrollArea className={`${filteredDrafts.length > 3 ? 'h-[400px]' : 'h-auto'} pr-4`}>
                  <div className="space-y-3">
                    {filteredDrafts.map((draft) => (
                      <Card
                        key={draft._id}
                        className={`transition-all duration-200 cursor-pointer group ${
                          selectedDraftId === draft._id
                            ? 'border-purple-400 shadow-xl ring-2 ring-purple-200 bg-purple-50'
                            : selectedDraftId
                            ? 'opacity-50 blur-sm'
                            : 'hover:shadow-lg hover:border-purple-300 hover:ring-1 hover:ring-purple-100'
                        }`}
                        onClick={() => setSelectedDraftId(draft._id)}
                        onDoubleClick={() => {
                          setDraftToApply(draft);
                          setApplyConfirmOpen(true);
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                                  {draft.type === 'quiz' ? '📝 Quiz' : '📋 Assignment'}
                                </Badge>
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                  Draft
                                </Badge>
                              </div>
                              <h3 className="font-semibold text-gray-900 text-base group-hover:text-purple-600 transition-colors">
                                {draft.title}
                              </h3>
                              <p className="text-sm text-gray-600 mt-1">
                                {draft.courseCode || 'Course'} • {draft.cloIds?.length || 0} CLOs
                              </p>
                              {selectedDraftId === draft._id && (
                                <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                                  <p className="text-xs text-gray-600">
                                    Created: {new Date(draft.createdAt).toLocaleDateString()} at {new Date(draft.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                  <p className="text-xs text-purple-600 font-medium">💡 Double-click to apply this draft</p>
                                </div>
                              )}
                            </div>
                            {selectedDraftId !== draft._id && (
                              <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-purple-600 transition-colors" />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Apply Draft Confirmation Dialog ─── */}
      <Dialog open={applyConfirmOpen} onOpenChange={setApplyConfirmOpen}>
        <DialogContent className="max-w-md animate-fade-in">
          <DialogHeader>
            <DialogTitle>Apply Draft Assessment?</DialogTitle>
            <DialogDescription>This will load the draft details into the form</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-gray-700">
                Applying this draft will load its details into the form. Any current form data will be preserved.
              </p>
            </div>
            {draftToApply && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Draft Name:</p>
                <p className="text-sm font-semibold text-gray-900">{draftToApply.title}</p>
              </div>
            )}
            <div className="flex gap-3 justify-end pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setApplyConfirmOpen(false);
                  setDraftToApply(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className="bg-purple-600 hover:bg-purple-700 transition-all duration-200"
                disabled={applyingDraft}
                onClick={async () => {
                  if (!draftToApply) return;

                  setApplyingDraft(true);

                  // Smooth delay for visual effect
                  await new Promise(resolve => setTimeout(resolve, 500));

                  // Set all quiz fields
                  setQuizTitle(draftToApply.title || '');
                  setQuizDifficulty(draftToApply.difficultyLevel || 'medium');
                  setQuizTemplate(draftToApply.questionTemplate || 'mcq');
                  setQuizThreshold(String(draftToApply.threshold || '75'));
                  setQuizInstructions(draftToApply.description || '');
                  setQuizVisibility('published');
                  setQuizDueDate(draftToApply.dueDate || '');
                  setQuizDueTime(draftToApply.dueTime || '');
                  setQuizScheduledDate(draftToApply.scheduledDate || '');
                  setQuizScheduledTime(draftToApply.scheduledTime || '');
                  setQuizTotalMarks(String(draftToApply.totalMarks || '100'));
                  setQuizDuration(String(draftToApply.duration || '30'));
                  setQuizAttempts(String(draftToApply.attempts || '1'));
                  setShuffleQuestions(draftToApply.shuffleQuestions !== false);
                  setShuffleOptions(draftToApply.shuffleOptions !== false);
                  setShowCorrectAnswers(draftToApply.showCorrectAnswers || 'after_submission');
                  setAllowLateSubmission(draftToApply.allowLateSubmission || false);
                  setMcqCount(String(draftToApply.mcqCount || '10'));
                  setShortAnswerCount(String(draftToApply.shortAnswerCount || '5'));
                  setCodingCount(String(draftToApply.codingCount || '3'));
                  setTrueFalseCount(String(draftToApply.trueFalseCount || '10'));
                  setFillBlanksCount(String(draftToApply.fillBlanksCount || '8'));

                  // Set all assignment fields
                  setAssignmentTitle(draftToApply.title || '');
                  setAssignmentDescription(draftToApply.description || '');
                  setAssignmentTemplate(draftToApply.questionTemplate || 'mcq');
                  setAssignmentVisibility('published');
                  setAssignmentSubmissionDate(draftToApply.submissionDate || '');
                  setAssignmentSubmissionTime(draftToApply.submissionTime || '');
                  setAssignmentScheduledDate(draftToApply.scheduledDate || '');
                  setAssignmentScheduledTime(draftToApply.scheduledTime || '');
                  setAssignmentPoints(String(draftToApply.totalMarks || '100'));
                  setAssignmentSubmissionType(draftToApply.submissionType || 'file');
                  setAssignmentAllowLate(draftToApply.allowLateSubmission || false);
                  setAssignmentLatePenalty(String(draftToApply.latePenalty || '10'));
                  setAssignmentWeightage(String(draftToApply.weightage || '10'));

                  // Set CLOs and Bloom level
                  setSelectedCLOs(draftToApply.cloIds || []);
                  setSelectedBloomLevel(draftToApply.bloomLevel || '');

                  // Set course data
                  const draftCourse = courses.find(c => c.mongodbCourseId === draftToApply.courseId);
                  if (draftCourse) {
                    setSelectedCourse(draftCourse.id);
                    if (draftToApply.clos && Array.isArray(draftToApply.clos)) {
                      setCourseCLOs(draftToApply.clos);
                    }
                    if (draftToApply.bloomLevels && Array.isArray(draftToApply.bloomLevels)) {
                      setBloomLevels(draftToApply.bloomLevels);
                    }
                    setSelectedCourseData({
                      courseCode: draftCourse.courseCode,
                      courseName: draftCourse.courseName,
                      degree: draftCourse.degree
                    });
                  }

                  // Switch tab with smooth transition
                  if (draftToApply.type === 'quiz') setActiveTab('quiz');
                  else if (draftToApply.type === 'assignment') setActiveTab('assignment');

                  // Smooth close animations
                  setApplyConfirmOpen(false);
                  
                  // Delay before closing modal for smooth transition effect
                  await new Promise(resolve => setTimeout(resolve, 300));
                  setDraftsModalOpen(false);
                  
                  // Clean up state
                  setDraftToApply(null);
                  setSelectedDraftId(null);
                  setApplyingDraft(false);

                  // Success toast with improved message
                  toast({
                    title: "✨ Draft Applied Successfully",
                    description: `"${draftToApply.title}" loaded. Ready to publish or save again.`,
                    duration: 3000
                  });
                }}
              >
                {applyingDraft ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Applying Draft...
                  </>
                ) : (
                  'Apply Draft'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Draft Save Confirmation Dialog ─── */}
      <Dialog open={draftConfirmOpen} onOpenChange={(open) => {
        // If closing without confirming, revert the visibility selection
        if (!open) {
          if (draftConfirmType === 'quiz') setQuizVisibility('published');
          else setAssignmentVisibility('published');
        }
        setDraftConfirmOpen(open);
      }}>
        <DialogContent className="max-w-sm animate-fade-in">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-purple-600" />
              Save as Draft
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
              <p className="text-sm text-gray-700">
                Your{' '}
                <span className="font-semibold capitalize">{draftConfirmType}</span>{' '}
                <span className="font-semibold text-purple-700">"{pendingDraftTitle}"</span>{' '}
                has been saved as a draft.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              ✓ Your draft counter will be updated automatically
              <br />
              ✓ Access it anytime from "View Your Drafts" link
            </p>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  // Revert dropdown back to published
                  if (draftConfirmType === 'quiz') setQuizVisibility('published');
                  else setAssignmentVisibility('published');
                  setDraftConfirmOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                className="bg-purple-600 hover:bg-purple-700 text-white"
                onClick={async () => {
                  setDraftConfirmOpen(false);
                  if (draftConfirmType === 'quiz') {
                    await handleSaveDraftQuiz();
                  } else {
                    await handleSaveDraftAssignment();
                  }
                }}
              >
                OK, Save Draft
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assignment Download Dialog */}
      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">Assignment Created</DialogTitle>
            <DialogDescription>Your assignment has been successfully generated with all questions.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <p className="text-sm text-slate-700">
                Your assignment has been created successfully.
              </p>
              <div className="bg-slate-50 p-3 rounded border border-slate-200">
                <p className="text-sm font-medium text-slate-900">{downloadAssignmentName}</p>
                <p className="text-xs text-slate-600 mt-1">{downloadCourseCode}</p>
              </div>
              <p className="text-sm text-slate-700">
                All questions have been generated. You can now download the assignment PDF.
              </p>
            </div>
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setDownloadDialogOpen(false)}
                className="flex-1"
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  downloadPDF(downloadPdfUrl, downloadFilename);
                  setDownloadDialogOpen(false);
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                Download PDF
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Assessments;