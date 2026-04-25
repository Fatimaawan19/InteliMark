import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  FileText,
  ChevronLeft,
  Download,
  Eye,
  Calendar,
  BookOpen,
  Loader2,
  Cpu,
  Search,
  Filter,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  MoreVertical,
  Trash2
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';

interface Assessment {
  _id: string;
  title: string;
  type: 'quiz' | 'assignment';
  courseCode: string;
  courseId: any;
  courseTitle?: string;
  totalMarks: number;
  questionCount: number;
  createdAt: string;
  status: 'draft' | 'scheduled' | 'sent' | 'completed' | 'cancelled';
  pdfUrl?: string;
  difficultyLevel?: string;
  questionsGenerated?: number;
  assessmentPdfFile?: string;
  answerKeyPdfFile?: string;
  dueDate?: string;
  dueTime?: string;
}

interface AssessmentWithPDF extends Assessment {
  assessmentPdfPath?: string;
  answerKeyPdfPath?: string;
}

const Collection: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [assessments, setAssessments] = useState<AssessmentWithPDF[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'quiz' | 'assignment'>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'title'>('date-desc');
  
  // Edit due date state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentWithPDF | null>(null);
  const [newDueDate, setNewDueDate] = useState('');
  const [newDueTime, setNewDueTime] = useState('');
  const [updatingDueDate, setUpdatingDueDate] = useState(false);
  
  // Card expansion state for showing due date
  const [expandedAssessmentId, setExpandedAssessmentId] = useState<string | null>(null);

  // Fetch current user
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        fetchAssessments(user.uid);
      } else {
        navigate('/');
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  // Fetch assessments from API
  const fetchAssessments = async (teacherId: string) => {
    try {
      setLoading(true);
      console.log('Fetching assessments for teacher:', teacherId);
      
      const response = await fetch(
        `http://localhost:5000/api/assessments/teacher/${teacherId}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch assessments');
      }

      const data = await response.json();
      console.log('API Response:', data);
      
      if (data.success && data.assessments) {
        // Format the assessments data with proper PDF paths
        const formattedAssessments = data.assessments.map((assessment: Assessment) => {
          const assessmentPdfPath = assessment.assessmentPdfFile 
            ? `/api/assessments/pdf/${assessment.assessmentPdfFile}` 
            : null;
          const answerKeyPdfPath = assessment.answerKeyPdfFile
            ? `/api/assessments/pdf/${assessment.answerKeyPdfFile}`
            : null;
            
          console.log(`📋 Assessment: ${assessment.title}`, {
            assessmentPdfFile: assessment.assessmentPdfFile,
            answerKeyPdfFile: assessment.answerKeyPdfFile,
            assessmentPdfPath,
            answerKeyPdfPath,
            hasBoth: !!assessmentPdfPath && !!answerKeyPdfPath,
            status: assessment.status
          });
          
          return {
            ...assessment,
            assessmentPdfPath,
            answerKeyPdfPath
          };
        });

        setAssessments(formattedAssessments);
        
        // Show statistics
        const withPdfs = formattedAssessments.filter(a => a.assessmentPdfPath && a.answerKeyPdfPath).length;
        const noPdfs = formattedAssessments.length - withPdfs;
        
        if (formattedAssessments.length === 0) {
          toast({
            title: 'No Assessments',
            description: 'You haven\'t created any assessments yet.',
            duration: 3000,
          });
        } else {
          toast({
            title: 'Assessments Loaded',
            description: `Loaded ${formattedAssessments.length} assessments (${withPdfs} with PDFs, ${noPdfs} generating).`,
            duration: 2000,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching assessments:', error);
      toast({
        title: 'Error',
        description: 'Failed to load assessments. Please try again.',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort assessments
  const filteredAssessments = assessments
    .filter(assessment => {
      const matchesSearch = assessment.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           assessment.courseCode.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || assessment.type === filterType;
      const matchesStatus = filterStatus === 'all' || assessment.status === filterStatus;
      // Only show fully generated assessments (both PDFs present)
      const hasGeneratedPDFs = assessment.assessmentPdfPath && assessment.answerKeyPdfPath;
      
      return matchesSearch && matchesType && matchesStatus && hasGeneratedPDFs;
    })
    .sort((a, b) => {
      if (sortBy === 'date-desc') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      } else if (sortBy === 'date-asc') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else {
        return a.title.localeCompare(b.title);
      }
    });

  // Download PDF file
  const handleDownloadPDF = async (pdfPath: string, filename: string) => {
    if (!pdfPath) {
      console.warn('❌ No PDF path provided');
      toast({
        title: 'Error',
        description: 'PDF file not available yet. Please wait for the PDF to be generated.',
        variant: 'destructive',
        duration: 3000,
      });
      return;
    }

    try {
      const fullUrl = `http://localhost:5000${pdfPath}`;
      console.log('📥 Downloading PDF from:', fullUrl);
      const response = await fetch(fullUrl);
      
      if (!response.ok) {
        console.error('❌ Download failed with status:', response.status);
        throw new Error(`Failed to download PDF: ${response.status}`);
      }

      const blob = await response.blob();
      console.log('✅ PDF blob received, size:', blob.size);
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Success',
        description: 'PDF downloaded successfully.',
        duration: 2000,
      });
    } catch (error) {
      console.error('❌ Download error:', error);
      toast({
        title: 'Error',
        description: 'Failed to download PDF. Check browser console for details.',
        variant: 'destructive',
        duration: 3000,
      });
    }
  };

  // View PDF in new tab
  const handleViewPDF = (pdfPath: string) => {
    if (!pdfPath) {
      console.warn('❌ No PDF path provided');
      toast({
        title: 'Error',
        description: 'PDF file not available yet. Please wait for the PDF to be generated.',
        variant: 'destructive',
        duration: 3000,
      });
      return;
    }

    try {
      const fullUrl = `http://localhost:5000${pdfPath}`;
      console.log('👁️ Opening PDF in new tab:', fullUrl);
      window.open(fullUrl, '_blank');
    } catch (error) {
      console.error('❌ View error:', error);
      toast({
        title: 'Error',
        description: 'Failed to open PDF.',
        variant: 'destructive',
        duration: 3000,
      });
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'Invalid date';
    }
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'scheduled':
        return 'bg-yellow-100 text-yellow-800';
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get type icon
  const getTypeIcon = (type: string) => {
    return type === 'quiz' ? (
      <Cpu className="h-4 w-4" />
    ) : (
      <FileText className="h-4 w-4" />
    );
  };

  // Get type badge color
  const getTypeColor = (type: string) => {
    return type === 'quiz' 
      ? 'bg-blue-100 text-blue-800' 
      : 'bg-purple-100 text-purple-800';
  };

  // Handle opening edit dialog
  const handleOpenEditDialog = (assessment: AssessmentWithPDF) => {
    setSelectedAssessment(assessment);
    // Parse existing due date and time or set to current
    if (assessment.dueDate) {
      setNewDueDate(assessment.dueDate);
    } else {
      setNewDueDate('');
    }
    if (assessment.dueTime) {
      setNewDueTime(assessment.dueTime);
    } else {
      setNewDueTime('');
    }
    setEditDialogOpen(true);
  };

  // Handle updating due date
  const handleUpdateDueDate = async () => {
    if (!selectedAssessment || !newDueDate || !newDueTime) {
      toast({
        title: 'Error',
        description: 'Please fill in both date and time',
        variant: 'destructive',
        duration: 2000,
      });
      return;
    }

    try {
      setUpdatingDueDate(true);
      
      const response = await fetch(
        `http://localhost:5000/api/assessments/${selectedAssessment._id}/update-due-date`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dueDate: newDueDate,
            dueTime: newDueTime,
            teacherId: currentUser.uid,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Success',
          description: `Due date updated to ${newDueDate} at ${newDueTime}. Students have been notified.`,
          duration: 3000,
        });

        // Update local assessment
        const updatedAssessments = assessments.map(a => 
          a._id === selectedAssessment._id 
            ? { ...a, dueDate: newDueDate, dueTime: newDueTime }
            : a
        );
        setAssessments(updatedAssessments);
        setEditDialogOpen(false);
      } else {
        throw new Error(data.error || 'Failed to update due date');
      }
    } catch (error) {
      console.error('Error updating due date:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update due date',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setUpdatingDueDate(false);
    }
  };

  const handleDeleteAssessment = async (assessment: AssessmentWithPDF) => {
    if (!currentUser?.uid) return;

    const ok = window.confirm(
      `Delete "${assessment.title}"?\n\nThis will remove it for students as well and cannot be undone.`
    );
    if (!ok) return;

    try {
      const response = await fetch(
        `http://localhost:5000/api/assessments/${assessment._id}`,
        { method: 'DELETE' }
      );

      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to delete assessment');
      }

      setAssessments(prev => prev.filter(a => a._id !== assessment._id));

      toast({
        title: 'Deleted',
        description: `"${assessment.title}" was deleted successfully.`,
        duration: 2500,
      });
    } catch (error) {
      console.error('Error deleting assessment:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete assessment',
        variant: 'destructive',
        duration: 3000,
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-gray-50 to-blue-50">
      {/* Header */}
      <div className="px-4 md:px-6 pt-8 pb-6 bg-white/80 backdrop-blur-md shadow-sm border-b border-primary/10 mb-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-4 mb-4 justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                onClick={() => navigate('/teacher-dashboard')}
                className="hover:bg-primary/10 transition-all p-2 rounded-lg"
              >
                <ChevronLeft className="h-5 w-5 text-gray-700" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  Assessment Collection
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  View and manage all generated assessments and their answer keys
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => currentUser && fetchAssessments(currentUser.uid)}
              disabled={loading}
              className="flex items-center gap-2"
              title="Refresh assessment list"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 pb-6">
      {/* Filters and Search */}
      <Card className="mb-8 border-none shadow-md bg-white">
        <CardHeader className="pb-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 rounded-t-lg">
          <CardTitle className="text-lg flex items-center gap-2 text-gray-900">
            <Filter className="h-5 w-5 text-primary" />
            Filter & Search
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search Input */}
            <div className="relative col-span-1 md:col-span-2">
              <Search className="absolute left-3 top-3 h-4 w-4 text-primary" />
              <Input
                placeholder="Search by title or course code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-primary/20 focus:border-primary focus:ring-primary/20"
              />
            </div>

            {/* Type Filter */}
            <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
              <SelectTrigger className="border-primary/20 focus:ring-primary/20">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="quiz">Quizzes</SelectItem>
                <SelectItem value="assignment">Assignments</SelectItem>
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="border-primary/20 focus:ring-primary/20">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort By */}
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="border-primary/20 focus:ring-primary/20">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date-desc">Newest First</SelectItem>
                <SelectItem value="date-asc">Oldest First</SelectItem>
                <SelectItem value="title">By Title</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results Count */}
      {!loading && (
        <div className="mb-4 text-sm text-gray-600 max-w-7xl mx-auto">
          Showing <span className="font-semibold text-primary">{filteredAssessments.length}</span> of{' '}
          <span className="font-semibold text-primary">{assessments.length}</span> assessments
        </div>
      )}

      {/* Assessments List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>
      ) : filteredAssessments.length === 0 ? (
        <Card className="border-none shadow-md bg-gradient-to-br from-slate-50 to-blue-50 max-w-7xl mx-auto">
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Assessments Found</h3>
            <p className="text-gray-600">
              {searchTerm || filterType !== 'all' || filterStatus !== 'all'
                ? 'Try adjusting your filters or search term'
                : 'You haven\'t created any assessments yet. Go to Assessments page to create one.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4 max-w-7xl mx-auto">
          {filteredAssessments.map((assessment) => (
            <Card 
              key={assessment._id}
              onDoubleClick={() => setExpandedAssessmentId(expandedAssessmentId === assessment._id ? null : assessment._id)}
              className={`border-l-4 hover:shadow-lg transition-all shadow-md relative cursor-pointer ${
                expandedAssessmentId === assessment._id
                  ? 'bg-blue-50 border-l-blue-600 border-blue-200'
                  : `border-gray-200 ${assessment.type === 'quiz' ? 'border-l-blue-500' : 'border-l-purple-500'}`
              }`}
            >
              {/* Hamburger Menu Button */}
              <div className="absolute top-4 right-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-gray-600"
                      title="Assessment options"
                    >
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleOpenEditDialog(assessment)}>
                      <Calendar className="h-4 w-4 mr-2" />
                      <span>Update Due Date</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDeleteAssessment(assessment)}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      <span>Delete Assessment</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                  {/* Left Section: Assessment Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-lg flex-shrink-0 ${
                        assessment.type === 'quiz' 
                          ? 'bg-gradient-to-br from-blue-100 to-blue-50' 
                          : 'bg-gradient-to-br from-purple-100 to-purple-50'
                      }`}>
                        <div className={assessment.type === 'quiz' ? 'text-blue-600' : 'text-purple-600'}>
                          {getTypeIcon(assessment.type)}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-gray-900 mb-2 break-words">
                          {assessment.title}
                        </h3>
                        <div className="flex flex-wrap gap-2 mb-3">
                          <Badge className={`${getTypeColor(assessment.type)} font-medium border-0`}>
                            {assessment.type === 'quiz' ? 'Quiz' : 'Assignment'}
                          </Badge>
                          <Badge className={`${getStatusColor(assessment.status)} font-medium border-0`}>
                            {assessment.status.charAt(0).toUpperCase() + assessment.status.slice(1)}
                          </Badge>
                          {assessment.difficultyLevel && (
                            <Badge variant="outline" className="font-medium bg-slate-50">
                              {assessment.difficultyLevel.charAt(0).toUpperCase() + assessment.difficultyLevel.slice(1)}
                            </Badge>
                          )}
                        </div>
                        
                        {/* Details Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="text-sm bg-gray-50 p-2 rounded">
                            <span className="text-gray-600">Course:</span>
                            <p className="font-semibold text-gray-900">{assessment.courseCode}</p>
                          </div>
                          <div className="text-sm bg-blue-50 p-2 rounded">
                            <span className="text-gray-600">Total Marks:</span>
                            <p className="font-semibold text-blue-900">{assessment.totalMarks}</p>
                          </div>
                          <div className="text-sm bg-indigo-50 p-2 rounded">
                            <span className="text-gray-600">Questions:</span>
                            <p className="font-semibold text-indigo-900">{assessment.questionCount}</p>
                          </div>
                          <div className="text-sm bg-slate-50 p-2 rounded">
                            <span className="text-gray-600">Created:</span>
                            <p className="font-semibold text-gray-900">{formatDate(assessment.createdAt)}</p>
                          </div>
                        </div>

                        {/* Due Date & Time - Show when expanded */}
                        {expandedAssessmentId === assessment._id && (
                          <div className="mt-5 pt-5 border-t-2 border-blue-300 space-y-3 animate-in slide-in-from-top-2 duration-300">
                            <div className="grid grid-cols-2 gap-4">
                              {/* Due Date Box - Amber/Orange */}
                              <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-4 rounded-lg border-2 border-amber-300 shadow-sm hover:shadow-md transition-shadow">
                                <span className="text-amber-700 text-xs font-bold uppercase tracking-wider block mb-2">📅 Due Date</span>
                                <p className="font-bold text-lg text-amber-900">{assessment.dueDate ? formatDate(assessment.dueDate) : 'Not set'}</p>
                              </div>
                              {/* Due Time Box - Emerald Green */}
                              <div className="bg-gradient-to-br from-emerald-50 to-green-50 p-4 rounded-lg border-2 border-emerald-300 shadow-sm hover:shadow-md transition-shadow">
                                <span className="text-emerald-700 text-xs font-bold uppercase tracking-wider block mb-2">⏰ Due Time</span>
                                <p className="font-bold text-lg text-emerald-900">{assessment.dueTime || 'Not set'}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Section: Actions */}
                  <div className="flex flex-col gap-3 md:flex-row md:gap-2 flex-shrink-0">
                    {/* Assessment PDF Actions */}
                    <div className="flex flex-col gap-2">
                      <div className="text-xs font-semibold text-blue-600 text-center bg-blue-50 py-1 px-2 rounded">Assessment</div>
                      <div className="flex gap-2">
                        {assessment.assessmentPdfPath ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewPDF(assessment.assessmentPdfPath || '')}
                              className="flex items-center gap-1 text-blue-600 border-blue-300 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-600 transition-colors"
                              title="View Assessment PDF"
                            >
                              <Eye className="h-4 w-4" />
                              <span className="hidden sm:inline">View</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadPDF(
                                assessment.assessmentPdfPath || '',
                                `${assessment.title}-assessment.pdf`
                              )}
                              className="flex items-center gap-1 text-blue-600 border-blue-300 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-600 transition-colors"
                              title="Download Assessment PDF"
                            >
                              <Download className="h-4 w-4" />
                              <span className="hidden sm:inline">DL</span>
                            </Button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2 px-2 py-1 text-xs text-gray-500 bg-gray-50 rounded">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Generating...</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Answer Key Actions */}
                    <div className="flex flex-col gap-2">
                      <div className="text-xs font-semibold text-green-600 text-center bg-green-50 py-1 px-2 rounded">Answer Key</div>
                      <div className="flex gap-2">
                        {assessment.answerKeyPdfPath ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewPDF(assessment.answerKeyPdfPath || '')}
                              className="flex items-center gap-1 text-green-600 border-green-300 hover:bg-green-50 hover:border-green-400 hover:text-green-600 transition-colors"
                              title="View Answer Key PDF"
                            >
                              <Eye className="h-4 w-4" />
                              <span className="hidden sm:inline">View</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadPDF(
                                assessment.answerKeyPdfPath || '',
                                `${assessment.title}-answer-key.pdf`
                              )}
                              className="flex items-center gap-1 text-green-600 border-green-300 hover:bg-green-50 hover:border-green-400 hover:text-green-600 transition-colors"
                              title="Download Answer Key PDF"
                            >
                              <Download className="h-4 w-4" />
                              <span className="hidden sm:inline">DL</span>
                            </Button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2 px-2 py-1 text-xs text-gray-500 bg-gray-50 rounded">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Generating...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {!loading && assessments.length > 0 && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4 max-w-7xl mx-auto">
          <Card className="border-none shadow-md bg-gradient-to-br from-blue-50 to-blue-100 hover:shadow-lg transition-shadow">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-4xl font-bold text-blue-600 mb-2">
                  {assessments.length}
                </div>
                <p className="text-sm font-medium text-blue-900">Total Assessments</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-md bg-gradient-to-br from-indigo-50 to-indigo-100 hover:shadow-lg transition-shadow">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-4xl font-bold text-indigo-600 mb-2">
                  {assessments.filter(a => a.type === 'quiz').length}
                </div>
                <p className="text-sm font-medium text-indigo-900">Quizzes</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-md bg-gradient-to-br from-purple-50 to-purple-100 hover:shadow-lg transition-shadow">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-4xl font-bold text-purple-600 mb-2">
                  {assessments.filter(a => a.type === 'assignment').length}
                </div>
                <p className="text-sm font-medium text-purple-900">Assignments</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-md bg-gradient-to-br from-green-50 to-green-100 hover:shadow-lg transition-shadow">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-4xl font-bold text-green-600 mb-2">
                  {assessments.filter(a => a.status === 'sent' || a.status === 'completed').length}
                </div>
                <p className="text-sm font-medium text-green-900">Published</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Due Date Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Update Due Date
            </DialogTitle>
            <DialogDescription>
              Change the submission deadline for {selectedAssessment?.type === 'quiz' ? 'this quiz' : 'this assignment'}. Students will be notified automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedAssessment && (
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">{selectedAssessment.title}</span>
                  <br />
                  <span className="text-xs text-gray-600">{selectedAssessment.courseCode}</span>
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-due-date">New Due Date</Label>
              <Input
                id="new-due-date"
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-due-time">New Due Time</Label>
              <Input
                id="new-due-time"
                type="time"
                value={newDueTime}
                onChange={(e) => setNewDueTime(e.target.value)}
              />
            </div>

            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-xs text-amber-900">
                <strong>Note:</strong> All students in this course will receive a notification about this deadline change. Any frozen assessments will automatically become available if the new date is in the future.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={updatingDueDate}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateDueDate}
              disabled={updatingDueDate || !newDueDate || !newDueTime}
              className="bg-primary"
            >
              {updatingDueDate ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Calendar className="mr-2 h-4 w-4" />
                  Update Due Date
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default Collection;
