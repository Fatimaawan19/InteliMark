import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  ArrowLeft, 
  BarChart3,
  TrendingUp,
  Users,
  CheckCircle,
  AlertCircle,
  Award,
  Clock,
  Target,
  Activity,
  PieChart as PieChartIcon
} from 'lucide-react';
import { useState } from 'react';

const Analytics = () => {
  const navigate = useNavigate();
  const [selectedCourse, setSelectedCourse] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState('month');

  // Mock data for analytics
  const classMetrics = {
    totalStudents: 45,
    averageScore: 78.5,
    passRate: 92,
    absenteeRate: 5,
    submissionRate: 98
  };

  const performanceData = [
    { range: 'A (90-100)', percentage: 35, count: 16 },
    { range: 'B (80-89)', percentage: 40, count: 18 },
    { range: 'C (70-79)', percentage: 18, count: 8 },
    { range: 'D (60-69)', percentage: 5, count: 2 },
    { range: 'F (Below 60)', percentage: 2, count: 1 }
  ];

  const recentSubmissions = [
    { studentName: 'Ahmed Khan', assignment: 'Quiz 1 - Data Structures', score: 95, date: 'Today', status: 'Completed' },
    { studentName: 'Sarah Ali', assignment: 'Assignment 2 - OOP', score: 88, date: 'Yesterday', status: 'Completed' },
    { studentName: 'John Doe', assignment: 'Lab 3 - Algorithms', score: 92, date: '2 days ago', status: 'Completed' },
    { studentName: 'Maria Garcia', assignment: 'Quiz 2 - Database', score: 85, date: '3 days ago', status: 'Completed' },
    { studentName: 'Ali Raza', assignment: 'Final Project - Proposal', score: null, date: 'Pending', status: 'Pending Review' }
  ];

  const topPerformers = [
    { name: 'Ahmed Khan', score: 97.5, degree: 'BSCS', submissions: 15 },
    { name: 'Zainab Hassan', score: 96.2, degree: 'BSCS', submissions: 15 },
    { name: 'Hassan Ali', score: 95.8, degree: 'BSEE', submissions: 14 },
    { name: 'Fatima Khan', score: 94.5, degree: 'BSCS', submissions: 15 },
    { name: 'Omar Ahmed', score: 93.2, degree: 'BSEE', submissions: 13 }
  ];

  const lowPerformers = [
    { name: 'Sara Johnson', score: 62.1, degree: 'BSCS', submissions: 8, needsAttention: true },
    { name: 'Michael Brown', score: 65.5, degree: 'BSEE', submissions: 9, needsAttention: true },
    { name: 'Lisa Martinez', score: 68.9, degree: 'BSCS', submissions: 10, needsAttention: false }
  ];

  const assignmentAnalytics = [
    { name: 'Quiz 1 - Data Structures', avgScore: 82, submissionRate: 100, difficulty: 'Medium' },
    { name: 'Assignment 1 - Programming', avgScore: 78, submissionRate: 95, difficulty: 'Hard' },
    { name: 'Lab 1 - Algorithms', avgScore: 85, submissionRate: 98, difficulty: 'Medium' },
    { name: 'Quiz 2 - Database', avgScore: 80, submissionRate: 100, difficulty: 'Medium' },
    { name: 'Final Project - Proposal', avgScore: null, submissionRate: 60, difficulty: 'Hard' }
  ];

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-gray-500';
    if (score >= 90) return 'text-green-600';
    if (score >= 80) return 'text-blue-600';
    if (score >= 70) return 'text-orange-600';
    return 'text-red-600';
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
                Analytics Dashboard
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Track student performance and course analytics
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-4 flex-wrap">
            <Select value={selectedCourse} onValueChange={setSelectedCourse}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select Course" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Courses</SelectItem>
                <SelectItem value="cs101">CS101 - Programming Fundamentals</SelectItem>
                <SelectItem value="se201">SE201 - Software Engineering</SelectItem>
                <SelectItem value="ds301">DS301 - Data Science</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="semester">This Semester</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="px-4 md:px-6 py-8">
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Average Score */}
            <Card className="bg-white border border-primary/15 hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Average Score</p>
                    <h3 className="text-3xl font-bold text-primary">{classMetrics.averageScore}%</h3>
                  </div>
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <Award className="h-6 w-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pass Rate */}
            <Card className="bg-white border border-green-200 hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Pass Rate</p>
                    <h3 className="text-3xl font-bold text-green-600">{classMetrics.passRate}%</h3>
                  </div>
                  <div className="p-3 bg-green-100 rounded-lg">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Total Students */}
            <Card className="bg-white border border-blue-200 hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Total Students</p>
                    <h3 className="text-3xl font-bold text-blue-600">{classMetrics.totalStudents}</h3>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Submission Rate */}
            <Card className="bg-white border border-purple-200 hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Submission Rate</p>
                    <h3 className="text-3xl font-bold text-purple-600">{classMetrics.submissionRate}%</h3>
                  </div>
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Activity className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Absence Rate */}
            <Card className="bg-white border border-orange-200 hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Absence Rate</p>
                    <h3 className="text-3xl font-bold text-orange-600">{classMetrics.absenteeRate}%</h3>
                  </div>
                  <div className="p-3 bg-orange-100 rounded-lg">
                    <AlertCircle className="h-6 w-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Grade Distribution */}
            <Card className="bg-white border border-primary/15 lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5 text-primary" />
                  Grade Distribution
                </CardTitle>
                <CardDescription>Class performance breakdown</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {performanceData.map((grade) => (
                  <div key={grade.range}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{grade.range}</span>
                      <span className="text-sm text-muted-foreground">{grade.count} students</span>
                    </div>
                    <Progress value={grade.percentage} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Top Performers */}
            <Card className="bg-white border border-green-200 lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  Top Performers
                </CardTitle>
                <CardDescription>Highest scoring students</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {topPerformers.map((student, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                    <div>
                      <p className="text-sm font-semibold text-black">{student.name}</p>
                      <p className="text-xs text-muted-foreground">{student.degree}</p>
                    </div>
                    <Badge className="bg-green-100 text-green-700">{student.score}%</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Students Needing Attention */}
            <Card className="bg-white border border-red-200 lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  Needs Attention
                </CardTitle>
                <CardDescription>Students below 70% average</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {lowPerformers.map((student, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                    <div>
                      <p className="text-sm font-semibold text-black">{student.name}</p>
                      <p className="text-xs text-muted-foreground">{student.submissions} submissions</p>
                    </div>
                    <Badge className="bg-red-100 text-red-700">{student.score}%</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Assignment Analytics */}
          <Card className="bg-white border border-primary/15">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Assignment & Quiz Analytics
              </CardTitle>
              <CardDescription>Performance metrics for each assessment</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {assignmentAnalytics.map((assignment, idx) => (
                  <div key={idx} className="p-4 border border-gray-200 rounded-lg hover:border-primary/30 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-black">{assignment.name}</h4>
                      <Badge variant="outline" className="bg-primary/5">
                        {assignment.difficulty}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Average Score</p>
                        <p className={`text-lg font-bold ${assignment.avgScore ? getScoreColor(assignment.avgScore) : 'text-gray-400'}`}>
                          {assignment.avgScore ? `${assignment.avgScore}%` : 'Pending'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Submission Rate</p>
                        <div className="flex items-center gap-2">
                          <Progress value={assignment.submissionRate} className="flex-1 h-2" />
                          <span className="text-sm font-medium">{assignment.submissionRate}%</span>
                        </div>
                      </div>
                      <div className="hidden md:block">
                        <p className="text-xs text-muted-foreground mb-1">Status</p>
                        <Badge className={assignment.avgScore ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}>
                          {assignment.avgScore ? 'Completed' : 'In Progress'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Submissions */}
          <Card className="bg-white border border-primary/15">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Recent Submissions
              </CardTitle>
              <CardDescription>Latest student submissions and grades</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentSubmissions.map((submission, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-primary/30 transition-colors">
                    <div className="flex-1">
                      <h4 className="font-semibold text-black">{submission.studentName}</h4>
                      <p className="text-sm text-muted-foreground">{submission.assignment}</p>
                      <p className="text-xs text-muted-foreground mt-1">{submission.date}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      {submission.score && (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground mb-1">Score</p>
                          <p className={`text-lg font-bold ${getScoreColor(submission.score)}`}>
                            {submission.score}%
                          </p>
                        </div>
                      )}
                      <Badge className={
                        submission.status === 'Completed' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-orange-100 text-orange-700'
                      }>
                        {submission.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  );
};

export default Analytics;
