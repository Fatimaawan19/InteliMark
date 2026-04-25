import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { db } from '../../firebase';
import { collection, getDocs, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { Database, Search, Trash2, Eye, Download, RefreshCw, ChevronLeft, Users, BookOpen, FileText, Award } from 'lucide-react';

interface DataItem {
  id: string;
  [key: string]: any;
}

const AdminDatabase: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [activeTab, setActiveTab] = useState('users');
  const [data, setData] = useState<DataItem[]>([]);
  const [filteredData, setFilteredData] = useState<DataItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalCourses: 0,
    totalAssessments: 0,
    storageUsed: 0,
  });
  const [selectedItem, setSelectedItem] = useState<DataItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // Fetch data based on active tab
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Filter data based on search
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredData(data);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = data.filter(item => {
        return Object.values(item).some(value => 
          String(value).toLowerCase().includes(query)
        );
      });
      setFilteredData(filtered);
    }
  }, [searchQuery, data]);

  // Fetch statistics
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const coursesSnap = await getDocs(collection(db, 'courses'));
        
        // Filter out admin users for user count
        const nonAdminUsers = usersSnap.docs.filter(doc => doc.data().role !== 'admin');
        
        // Fetch assessments count from backend (only published with PDFs)
        let assessmentsCount = 0;
        try {
          const assessmentsResponse = await fetch('http://localhost:5000/api/assessments/all?status=published');
          const assessmentsData = await assessmentsResponse.json();
          if (assessmentsData.success && assessmentsData.assessments) {
            // Count only assessments with PDFs
            assessmentsCount = assessmentsData.assessments.filter(
              (a: any) => a.assessmentPdfFile && a.pdfUrl
            ).length;
          }
        } catch (error) {
          console.warn('Could not fetch assessments count:', error);
        }
        
        const totalDocs = nonAdminUsers.length + coursesSnap.size + assessmentsCount;
        const storagePercent = Math.min(Math.round((totalDocs / 1000) * 100), 100);

        setStats({
          totalUsers: nonAdminUsers.length,
          totalCourses: coursesSnap.size,
          totalAssessments: assessmentsCount,
          storageUsed: storagePercent,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };

    fetchStats();
    
    // Real-time listener for stats
    const unsubUsers = onSnapshot(collection(db, 'users'), () => fetchStats());
    const unsubCourses = onSnapshot(collection(db, 'courses'), () => fetchStats());

    return () => {
      unsubUsers();
      unsubCourses();
    };
  }, []);

  const handleRefresh = () => {
    setSearchQuery(''); // Clear search bar
    fetchData(); // Refresh current tab data
    // Stats will auto-refresh via real-time listeners
  };

  const handleDownloadSubmission = (item: DataItem) => {
    // Check if submission has files
    if (!item.submissionFiles || item.submissionFiles.length === 0) {
      alert('No files available to download');
      return;
    }

    // If only one file, download it directly
    if (item.submissionFiles.length === 1) {
      const file = item.submissionFiles[0];
      const fileUrl = `http://localhost:5000${file.fileUrl}`;
      const a = document.createElement('a');
      a.href = fileUrl;
      a.download = file.originalName || file.filename;
      a.click();
      return;
    }

    // If multiple files, download them one by one
    alert(`Downloading ${item.submissionFiles.length} files from ${item.studentName}'s submission...`);
    item.submissionFiles.forEach((file, index) => {
      setTimeout(() => {
        const fileUrl = `http://localhost:5000${file.fileUrl}`;
        const a = document.createElement('a');
        a.href = fileUrl;
        a.download = file.originalName || file.filename;
        a.click();
      }, index * 500); // Stagger downloads by 500ms
    });
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch student submissions from MongoDB via backend API
      if (activeTab === 'submissions') {
        const response = await fetch('http://localhost:5000/api/submissions/all');
        const result = await response.json();

        if (result.success && Array.isArray(result.submissions)) {
          const items = result.submissions.map((submission: any) => ({
            id: submission._id,
            studentId: submission.studentId,
            studentName: submission.studentName || 'Unknown',
            studentEmail: submission.studentEmail || 'N/A',
            assessmentTitle: submission.assessmentTitle || (submission.assessmentId?.title),
            courseName: submission.courseName || (submission.courseId?.courseTitle),
            courseCode: submission.courseCode || (submission.courseId?.courseCode),
            submissionDate: submission.submissionDate,
            submissionTime: submission.submissionTime,
            status: submission.status,
            isLate: submission.isLate ? 'Yes' : 'No',
            filesCount: submission.uploadedFilesCount,
            fileSize: submission.uploadedFilesTotalSize,
            grade: submission.grade || 'Not graded',
            feedback: submission.feedback || '',
            ...submission,
          }));
          setData(items);
          setFilteredData(items);
        } else {
          setData([]);
          setFilteredData([]);
        }

        setLoading(false);
        return;
      }

      // Special case: Fetch assessments from backend API instead of Firestore
      if (activeTab === 'assignments') {
        const response = await fetch('http://localhost:5000/api/assessments/all?status=published');
        const data = await response.json();
        
        if (data.success && data.assessments) {
          // Transform backend data to match display format and filter for published with PDFs
          const items = data.assessments
            .filter((assessment: any) => 
              assessment.status === 'published' && 
              assessment.assessmentPdfFile && 
              assessment.pdfUrl
            )
            .map((assessment: any) => ({
              id: assessment._id,
              title: assessment.title,
              type: assessment.type,
              status: assessment.status,
              courseCode: assessment.courseCode,
              courseTitle: assessment.courseTitle,
              teacherName: assessment.teacherName,
              totalMarks: assessment.totalMarks,
              duration: assessment.duration,
              difficultyLevel: assessment.difficultyLevel,
              createdAt: assessment.createdAt ? { toDate: () => new Date(assessment.createdAt) } : null,
              scheduledTime: assessment.scheduledTime,
              pdfUrl: assessment.pdfUrl,
              assessmentPdfFile: assessment.assessmentPdfFile,
              answerKeyPdfFile: assessment.answerKeyPdfFile,
              questionTemplate: assessment.questionTemplate,
              questionCount: assessment.questionCount
            }));
          
          setData(items);
          setFilteredData(items);
        } else {
          setData([]);
          setFilteredData([]);
        }
        setLoading(false);
        return;
      }

      // Default: Fetch from Firestore for other collections
      let collectionName = '';
      switch (activeTab) {
        case 'users':
          collectionName = 'users';
          break;
        case 'courses':
          collectionName = 'courses';
          break;
        case 'submissions':
          collectionName = 'submissions';
          break;
        default:
          collectionName = 'users';
      }

      const snapshot = await getDocs(collection(db, collectionName));
      let items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as DataItem[];
      
      // Filter out admin users
      if (activeTab === 'users') {
        items = items.filter(item => (item as any).role !== 'admin');
      }
      
      setData(items);
      setFilteredData(items);
    } catch (error) {
      console.error('Error fetching data:', error);
      setData([]);
      setFilteredData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!window.confirm('Are you sure you want to delete this record? This action cannot be undone.')) {
      return;
    }

    try {
      // Special handling for assessments (stored in MongoDB backend)
      if (activeTab === 'assignments') {
        console.log('🗑️ Attempting to delete assessment:', itemId);
        const response = await fetch(`http://localhost:5000/api/assessments/${itemId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to delete assessment');
        }

        console.log('✅ Assessment deleted successfully:', itemId);
        alert('Assessment record deleted successfully!');
        fetchData();
        return;
      }

      // Submissions are stored in MongoDB and deleted via backend API
      if (activeTab === 'submissions') {
        console.log('🗑️ Attempting to delete submission:', itemId);
        const response = await fetch(`http://localhost:5000/api/submissions/${itemId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: 'admin' })
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to delete submission');
        }

        console.log('✅ Submission deleted successfully:', itemId);
        alert('Submission record deleted successfully!');
        // Refresh data to reflect the deletion
        fetchData();
        return;
      }

      let collectionName = '';
      switch (activeTab) {
        case 'users':
          collectionName = 'users';
          break;
        case 'courses':
          collectionName = 'courses';
          break;
        case 'submissions':
          collectionName = 'submissions';
          break;
        default:
          return;
      }

      console.log('🗑️ Deleting from Firestore:', collectionName, itemId);
      await deleteDoc(doc(db, collectionName, itemId));
      console.log('✅ Record deleted from Firestore:', collectionName, itemId);
      alert('Record deleted successfully!');
      fetchData();
    } catch (error) {
      console.error('❌ Error deleting record:', error);
      alert(`Failed to delete record: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const exportToCSV = () => {
    if (filteredData.length === 0) {
      alert('No data to export');
      return;
    }

    const headers = Object.keys(filteredData[0]).filter(key => key !== 'id');
    const csvContent = [
      headers.join(','),
      ...filteredData.map(item => 
        headers.map(header => {
          const value = item[header];
          if (value === null || value === undefined) return '';
          if (typeof value === 'object') return JSON.stringify(value);
          return String(value).replace(/,/g, ';');
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };  const tabs = [
    { id: 'users', label: 'Users', icon: Users, activeColor: 'bg-gradient-to-r from-blue-500 to-blue-600', inactiveColor: 'text-blue-600', iconBg: 'bg-blue-100' },
    { id: 'courses', label: 'Courses', icon: BookOpen, activeColor: 'bg-gradient-to-r from-purple-500 to-purple-600', inactiveColor: 'text-purple-600', iconBg: 'bg-purple-100' },
    { id: 'assignments', label: 'Assessments', icon: FileText, activeColor: 'bg-gradient-to-r from-orange-500 to-orange-600', inactiveColor: 'text-orange-600', iconBg: 'bg-orange-100' },
    { id: 'submissions', label: 'Submissions', icon: Award, activeColor: 'bg-gradient-to-r from-green-500 to-green-600', inactiveColor: 'text-green-600', iconBg: 'bg-green-100' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-6 mb-8">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/admin-dashboard')}
            className="hover:bg-primary/10 transition-all p-2 rounded-lg"
          >
            <ChevronLeft className="h-5 w-5 text-gray-700" />
          </Button>
          
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Database Management</h1>
            <p className="text-sm text-gray-600">View and manage all database collections</p>
          </div>          <div className="flex gap-2">
            <Button
              onClick={handleRefresh}
              variant="outline"
              className="shadow-sm hover:shadow-md transition-all"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              onClick={exportToCSV}
              className="bg-gradient-to-r from-primary to-primary/90 shadow-lg hover:shadow-xl transition-all"
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>        {/* Statistics - Made more colorful */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="border-0 shadow-lg hover:shadow-xl transition-all bg-gradient-to-br from-blue-50 to-blue-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-700 font-semibold">Total Courses</p>
                  <p className="text-4xl font-bold text-blue-900">{stats.totalCourses}</p>
                  <p className="text-xs text-blue-600 mt-1">Active courses</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg">
                  <BookOpen className="h-8 w-8 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-all bg-gradient-to-br from-purple-50 to-purple-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-purple-700 font-semibold">Total Users</p>
                  <p className="text-4xl font-bold text-purple-900">{stats.totalUsers}</p>
                  <p className="text-xs text-purple-600 mt-1">Students & Teachers</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl shadow-lg">
                  <Users className="h-8 w-8 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-all bg-gradient-to-br from-orange-50 to-orange-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-orange-700 font-semibold">Published Assessments</p>
                  <p className="text-4xl font-bold text-orange-900">{stats.totalAssessments}</p>
                  <p className="text-xs text-orange-600 mt-1">With PDFs Generated</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl shadow-lg">
                  <FileText className="h-8 w-8 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-all bg-gradient-to-br from-green-50 to-green-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-700 font-semibold">Storage Used</p>
                  <p className="text-4xl font-bold text-green-900">{stats.storageUsed}%</p>
                  <p className="text-xs text-green-600 mt-1">Of quota</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl shadow-lg">
                  <Database className="h-8 w-8 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>        {/* Tabs - Colorful icons without blue background */}
        <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-6 py-3 rounded-xl font-semibold transition-all whitespace-nowrap shadow-md hover:shadow-lg hover:scale-105 ${
                  isActive
                    ? `bg-white text-gray-900`
                    : `bg-white text-gray-700 hover:bg-gray-50`
                }`}
              >
                <div className={`p-1.5 rounded-lg ${tab.iconBg}`}>
                  <Icon className={`h-5 w-5 ${tab.inactiveColor}`} />
                </div>
                {tab.label}
              </button>
            );
          })}
        </div>{/* Search - More colorful */}
        <Card className="mb-6 border-0 shadow-xl bg-gradient-to-r from-primary/5 to-primary/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Search className="h-5 w-5 text-primary" />
              </div>
              <Input
                placeholder={`Search in ${activeTab}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border-0 focus-visible:ring-2 focus-visible:ring-primary/20 bg-white"
              />
            </div>
          </CardContent>
        </Card>

        {/* Data Table */}
        <Card className="border-0 shadow-xl">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="capitalize">{activeTab} Collection</CardTitle>
                <CardDescription>{filteredData.length} records found</CardDescription>
              </div>
              {loading && <RefreshCw className="h-5 w-5 animate-spin text-primary" />}
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Database className="h-16 w-16 text-gray-400 mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">No Data Found</h3>
                <p className="text-sm text-gray-500">No records in this collection</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      {activeTab === 'users' && (
                        <>
                          <th className="text-left p-3 font-semibold">Name</th>
                          <th className="text-left p-3 font-semibold">Email</th>
                          <th className="text-left p-3 font-semibold">Role</th>
                          <th className="text-left p-3 font-semibold">Degree</th>
                          <th className="text-right p-3 font-semibold">Actions</th>
                        </>
                      )}
                      {activeTab === 'courses' && (
                        <>
                          <th className="text-left p-3 font-semibold">Course ID</th>
                          <th className="text-left p-3 font-semibold">Course Name</th>
                          <th className="text-left p-3 font-semibold">Teacher</th>
                          <th className="text-left p-3 font-semibold">Status</th>
                          <th className="text-right p-3 font-semibold">Actions</th>
                        </>
                      )}
                      {activeTab === 'assignments' && (
                        <>
                          <th className="text-left p-3 font-semibold">Title</th>
                          <th className="text-left p-3 font-semibold">Type</th>
                          <th className="text-left p-3 font-semibold">Course</th>
                          <th className="text-left p-3 font-semibold">Teacher</th>
                          <th className="text-left p-3 font-semibold">Status</th>
                          <th className="text-left p-3 font-semibold">Created</th>
                          <th className="text-right p-3 font-semibold">Actions</th>
                        </>
                      )}
                      {activeTab === 'submissions' && (
                        <>
                          <th className="text-left p-3 font-semibold">Student Name</th>
                          <th className="text-left p-3 font-semibold">Email</th>
                          <th className="text-left p-3 font-semibold">Assessment</th>
                          <th className="text-left p-3 font-semibold">Course</th>
                          <th className="text-left p-3 font-semibold">Submitted</th>
                          <th className="text-left p-3 font-semibold">Status</th>
                          <th className="text-left p-3 font-semibold">Grade</th>
                          <th className="text-right p-3 font-semibold">Actions</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((item) => (
                      <tr key={item.id} className="border-b hover:bg-gray-50">
                        {activeTab === 'users' && (
                          <>
                            <td className="p-3 font-medium">{item.name || 'N/A'}</td>
                            <td className="p-3">{item.email || 'N/A'}</td>
                            <td className="p-3">
                              <Badge className={
                                item.role === 'student' ? 'bg-blue-100 text-blue-700' :
                                item.role === 'teacher' ? 'bg-purple-100 text-purple-700' :
                                'bg-gray-100 text-gray-700'
                              }>
                                {item.role || 'N/A'}
                              </Badge>
                            </td>
                            <td className="p-3 text-xs">{item.degree || 'N/A'}</td>
                            <td className="p-3">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setShowDetailModal(true);
                                  }}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDelete(item.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </>
                        )}
                        {activeTab === 'courses' && (
                          <>
                            <td className="p-3 font-medium">{item.courseId || 'N/A'}</td>
                            <td className="p-3">{item.courseName || 'N/A'}</td>
                            <td className="p-3">{item.teacherName || 'N/A'}</td>
                            <td className="p-3">
                              <Badge className="bg-green-100 text-green-700">
                                {item.status || 'active'}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setShowDetailModal(true);
                                  }}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDelete(item.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </>
                        )}
                        {activeTab === 'assignments' && (
                          <>
                            <td className="p-3 font-medium">{item.title || 'N/A'}</td>
                            <td className="p-3">
                              <Badge className={
                                item.type === 'quiz' ? 'bg-blue-100 text-blue-700' :
                                item.type === 'assignment' ? 'bg-purple-100 text-purple-700' :
                                'bg-gray-100 text-gray-700'
                              }>
                                {item.type || 'N/A'}
                              </Badge>
                            </td>
                            <td className="p-3 text-xs">
                              <div className="font-medium">{item.courseCode || 'N/A'}</div>
                              <div className="text-gray-500">{item.courseTitle || ''}</div>
                            </td>
                            <td className="p-3">{item.teacherName || 'N/A'}</td>
                            <td className="p-3">
                              <Badge className={
                                item.status === 'published' ? 'bg-green-100 text-green-700' :
                                item.status === 'draft' ? 'bg-yellow-100 text-yellow-700' :
                                item.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                                'bg-gray-100 text-gray-700'
                              }>
                                {item.status || 'N/A'}
                              </Badge>
                            </td>
                            <td className="p-3">{item.createdAt?.toDate?.()?.toLocaleDateString() || 'N/A'}</td>
                            <td className="p-3">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setShowDetailModal(true);
                                  }}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                                {item.pdfUrl && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(`http://localhost:5000${item.pdfUrl}`, '_blank')}
                                    title="View PDF"
                                  >
                                    <Download className="h-3 w-3" />
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDelete(item.id)}
                                  title="Delete assessment"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </>
                        )}
                        {activeTab === 'submissions' && (
                          <>
                            <td className="p-3 font-medium">{item.studentName || 'Unknown Student'}</td>
                            <td className="p-3 text-sm">{item.studentEmail || 'N/A'}</td>
                            <td className="p-3 font-medium text-sm">{item.assessmentTitle || 'N/A'}</td>
                            <td className="p-3 text-xs">
                              <div className="font-medium">{item.courseCode || 'N/A'}</div>
                              <div className="text-gray-500">{item.courseName || ''}</div>
                            </td>
                            <td className="p-3 text-sm">
                              <div className="font-medium">{item.submissionDate || 'N/A'}</div>
                              <div className="text-gray-500 text-xs">{item.submissionTime || ''}</div>
                            </td>
                            <td className="p-3">
                              <Badge className={
                                item.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                                item.status === 'graded' ? 'bg-green-100 text-green-700' :
                                item.status === 'late' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-100 text-gray-700'
                              }>
                                {item.status || 'N/A'}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <Badge className={
                                item.grade && item.grade !== 'Not graded' 
                                  ? 'bg-green-100 text-green-700' 
                                  : 'bg-gray-100 text-gray-700'
                              }>
                                {item.grade || 'Pending'}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setShowDetailModal(true);
                                  }}
                                  title="View details"
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDownloadSubmission(item)}
                                  title="Download submission files"
                                >
                                  <Download className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDelete(item.id)}
                                  title="Delete submission"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 animate-in zoom-in-95 duration-300 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Record Details</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetailModal(false)}
                className="hover:bg-pink-200"
              >
                ✕
              </Button>
            </div>

            <div className="space-y-3">
              {Object.entries(selectedItem).map(([key, value]) => {
                // Skip notes field
                if (activeTab === 'submissions' && key === 'notes') return null;
                
                return (
                  <div key={key} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="font-semibold text-gray-700 min-w-32">{key}:</span>
                    <span className="text-gray-900 break-all">
                      {value === null || value === undefined
                        ? 'N/A'
                        : typeof value === 'object'
                        ? JSON.stringify(value, null, 2)
                        : String(value)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDatabase;
