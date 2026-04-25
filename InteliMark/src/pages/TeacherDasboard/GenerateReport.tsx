import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowLeft, 
  Download, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  XCircle,
  FileText,
  Calendar,
  User,
  Clock,
  Target,
  TrendingUp,
  AlertTriangle,
  BookOpen,
  Link,
  Trophy,
  Sparkles
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const GenerateReport = () => {
  const navigate = useNavigate();

  // Mock report data
  const reportData = {
    student: "Hadia Anwar",
    studentId: "FA22-BDS-013",
    assignment: "Machine Learning Assignment 3",
    course: "CS-401",
    submittedAt: "2024-03-25 14:30",
    generatedAt: "2024-03-26 10:15",
    totalMarks: 100,
    obtainedMarks: 85,
    overallScore: 85,
    grade: "A-",
    status: "Completed"
  };

  const gradingBreakdown = [
    { category: "Code Quality", score: 82, maxScore: 100, mistakes: 3 },
    { category: "Text Answers", score: 88, maxScore: 100, mistakes: 2 },
    { category: "Graphical Content", score: 85, maxScore: 100, mistakes: 1 },
    { category: "Documentation", score: 90, maxScore: 100, mistakes: 1 },
    { category: "Originality", score: 95, maxScore: 100, mistakes: 0 }
  ];

  const mistakes = [
    {
      id: 1,
      question: "Question 3 - Algorithm Implementation",
      type: "code",
      severity: "high",
      description: "Missing edge case handling for empty array input",
      suggestion: "Add validation to check if the input array is empty before processing"
    },
    {
      id: 2,
      question: "Question 2 - Theoretical Explanation",
      type: "text",
      severity: "medium",
      description: "Incomplete explanation of time complexity analysis",
      suggestion: "Include best, worst, and average case scenarios in the complexity analysis"
    },
    {
      id: 3,
      question: "Question 5 - System Design",
      type: "graphical",
      severity: "low",
      description: "Incorrect labels in the architecture diagram",
      suggestion: "Review and correct the component labels to match the system requirements"
    }
  ];

  const strengths = [
    "Excellent code organization and structure",
    "Clear and concise documentation",
    "Innovative approach to problem-solving",
    "Good understanding of core concepts"
  ];

  const improvements = [
    "Consider edge cases in algorithm implementation",
    "Provide more detailed complexity analysis",
    "Double-check diagram labels and annotations"
  ];

  // Sample quiz questions with errors
  const quizQuestions = [
    {
      id: 1,
      question: "Q1: Implement a bubble sort algorithm",
      studentAnswer: `def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        for j in range(0, n-i-1):
            if arr[j] > arr[j+1]:
                arr[j], arr[j+1] = arr[j+1], arr[j]
    # Missing return statement`,
      maxMarks: 20,
      obtainedMarks: 17,
      hasError: true,
      errorLine: 7,
      errorMessage: "Missing return statement"
    },
    {
      id: 2,
      question: "Q2: Explain time complexity of merge sort",
      studentAnswer: "Merge sort has a time complexity of O(n log n) in all cases. It divides the array into halves recursively and then merges them back in sorted order.",
      maxMarks: 15,
      obtainedMarks: 15,
      hasError: false
    },
    {
      id: 3,
      question: "Q3: Draw a binary search tree",
      studentAnswer: "[Diagram submitted]",
      maxMarks: 15,
      obtainedMarks: 12,
      hasError: true,
      errorMessage: "Incorrect BST property - right child value less than parent"
    }
  ];

  // Resource links for improvement
  const resourceLinks = [
    {
      title: "Data Structures and Algorithms Course",
      url: "https://www.coursera.org/learn/data-structures",
      description: "Comprehensive course on DSA concepts",
      icon: BookOpen
    },
    {
      title: "Algorithm Visualization Tool",
      url: "https://visualgo.net/en",
      description: "Interactive visualization of algorithms",
      icon: Link
    },
    {
      title: "Coding Practice Platform",
      url: "https://leetcode.com",
      description: "Practice coding problems and improve skills",
      icon: Trophy
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary/20 via-background to-primary/5">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Grading Report</h1>
                <p className="text-sm text-muted-foreground">Comprehensive assessment analysis</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4 mr-2" />
                Upload to Portal
              </Button>
              <Button size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Report Header */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-2xl">{reportData.assignment}</CardTitle>
                  <CardDescription className="mt-2">
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {reportData.student} ({reportData.studentId})
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Submitted: {reportData.submittedAt}
                      </span>
                    </div>
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-primary">{reportData.overallScore}%</div>
                  <Badge className="mt-2 text-lg px-3 py-1" variant="default">Grade: {reportData.grade}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg border border-primary/20">
                <div className="flex items-center gap-8">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Marks</p>
                    <p className="text-2xl font-bold">{reportData.totalMarks}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Obtained Marks</p>
                    <p className="text-2xl font-bold text-primary">{reportData.obtainedMarks}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-8 w-8 text-primary animate-pulse" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI-Checked Assignment/Quiz */}
          <Card className="border-2 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI-Checked Assignment
              </CardTitle>
              <CardDescription>Assignment with AI-detected mistakes marked in red</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Question 1 with side-by-side mistake detection */}
              <div className="grid md:grid-cols-2 gap-4">
                {/* Student Answer */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">Question 1: Explain the concept of Machine Learning</h3>
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <p className="text-sm">
                    <span className="font-medium">Student's Answer:</span>
                  </p>
                  <p className="text-sm">
                    Machine learning is a subset of artificial intelligence that enables systems to learn and improve from experience. 
                    <span className="relative inline-block mx-1">
                      <span className="border-2 border-destructive bg-destructive/10 px-1 rounded">
                        It uses statistical techniques
                      </span>
                      <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        !
                      </span>
                    </span>
                    to give computers the ability to learn without being explicitly programmed.
                  </p>
                  <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
                    <strong>AI Detected Issue:</strong> Incomplete explanation - missing types of ML and practical applications
                  </div>
                </div>
              </div>

              {/* Mistake Detection Summary for Question 1 */}
              <div className="border-2 rounded-lg p-4 space-y-2 border-warning/50 bg-warning/5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full animate-pulse bg-warning" />
                    <span className="font-semibold text-sm">ML Concept Explanation</span>
                    <Badge variant="outline" className="text-xs">text</Badge>
                  </div>
                  <Badge variant="outline">MEDIUM</Badge>
                </div>
                <Separator className="opacity-50" />
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-destructive mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Issue Detected:</p>
                      <p className="text-sm text-muted-foreground">Incomplete explanation missing ML types and applications</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-success mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-success">Recommended Fix:</p>
                      <p className="text-sm text-muted-foreground">Include supervised, unsupervised, and reinforcement learning with real-world examples</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Question 2 with side-by-side mistake detection */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Student Code */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Question 2: Write a function to implement binary search</h3>
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <p className="text-sm">
                    <span className="font-medium">Student's Code:</span>
                  </p>
                  <div className="bg-background p-3 rounded font-mono text-xs overflow-x-auto">
                    <pre>{`def binary_search(arr, target):
    left = 0
    `}<span className="bg-destructive/20 border-2 border-destructive px-1">{`right = len(arr)`}</span>{`
    
    while left <= right:
        mid = (left + right) // 2
        `}<span className="bg-destructive/20 border-2 border-destructive px-1">{`if arr[mid] = target:`}</span>{`
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1`}</pre>
                  </div>
                  <div className="space-y-1 mt-2">
                    <div className="p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
                      <strong>Error 1:</strong> Line 3 - Should be "right = len(arr) - 1" to avoid index out of bounds
                    </div>
                    <div className="p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
                      <strong>Error 2:</strong> Line 6 - Syntax error: should use "==" for comparison, not "="
                    </div>
                  </div>
                </div>
              </div>

              {/* Mistake Detection Summary for Question 2 */}
              <div className="border-2 rounded-lg p-4 space-y-2 border-destructive/50 bg-destructive/5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full animate-pulse bg-destructive" />
                    <span className="font-semibold text-sm">Binary Search Implementation</span>
                    <Badge variant="outline" className="text-xs">code</Badge>
                  </div>
                  <Badge variant="destructive">HIGH</Badge>
                </div>
                <Separator className="opacity-50" />
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-destructive mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Issue Detected:</p>
                      <p className="text-sm text-muted-foreground">Two critical errors: incorrect array boundary and syntax error in comparison</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-success mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-success">Recommended Fix:</p>
                      <p className="text-sm text-muted-foreground">Use right = len(arr) - 1 and use == operator for comparison</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Question 3 with side-by-side mistake detection */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Student Diagram */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Question 3: Draw a flowchart for bubble sort algorithm</h3>
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <p className="text-sm">
                    <span className="font-medium">Student's Diagram:</span>
                  </p>
                  <div className="relative bg-background p-4 rounded">
                    <div className="space-y-4 text-center text-sm">
                      <div className="border-2 border-primary rounded-lg p-2">Start</div>
                      <div className="text-2xl">↓</div>
                      <div className="border-2 border-primary rounded-lg p-2">Input Array</div>
                      <div className="text-2xl">↓</div>
                      <div className="border-2 border-destructive bg-destructive/10 rounded-lg p-2 relative">
                        Compare Elements
                        <span className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground text-xs rounded-full w-6 h-6 flex items-center justify-center">
                          !
                        </span>
                      </div>
                      <div className="text-2xl">↓</div>
                      <div className="border-2 border-primary rounded-lg p-2">Output Sorted Array</div>
                      <div className="text-2xl">↓</div>
                      <div className="border-2 border-primary rounded-lg p-2">End</div>
                    </div>
                  </div>
                  <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
                    <strong>AI Detected Issue:</strong> Missing loop structure and swap operation in flowchart
                  </div>
                </div>
              </div>

              {/* Mistake Detection Summary for Question 3 */}
              <div className="border-2 rounded-lg p-4 space-y-2 border-info/50 bg-info/5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full animate-pulse bg-info" />
                    <span className="font-semibold text-sm">Flowchart Design</span>
                    <Badge variant="outline" className="text-xs">graphical</Badge>
                  </div>
                  <Badge variant="secondary">LOW</Badge>
                </div>
                <Separator className="opacity-50" />
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-destructive mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Issue Detected:</p>
                      <p className="text-sm text-muted-foreground">Missing loop structure and swap operation in flowchart</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-success mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-success">Recommended Fix:</p>
                      <p className="text-sm text-muted-foreground">Add nested loops and show the swap logic between adjacent elements</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </CardContent>
          </Card>

          {/* Resource Links */}
          <Card className="border-2 border-primary/20">
            <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                Recommended Resources
              </CardTitle>
              <CardDescription>
                Curated learning materials for improvement
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-6">
              {resourceLinks.map((resource, index) => (
                <a 
                  key={index}
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-4 rounded-lg border hover:border-primary hover:bg-primary/5 transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <resource.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold group-hover:text-primary transition-colors">
                        {resource.title}
                      </h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {resource.description}
                      </p>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowLeft className="h-4 w-4 text-primary rotate-180" />
                    </div>
                  </div>
                </a>
              ))}
            </CardContent>
          </Card>

          {/* Upload Report Button */}
          <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-secondary/10 border-primary/20">
            <CardContent className="py-6">
              <div className="flex items-center justify-center">
                <Button size="lg" className="bg-gradient-primary text-primary-foreground hover:shadow-glow">
                  <Upload className="h-5 w-5 mr-2" />
                  Upload Report to Portal
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  );
};

export default GenerateReport;