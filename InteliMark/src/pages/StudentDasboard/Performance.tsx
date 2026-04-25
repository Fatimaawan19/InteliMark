import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  ChevronLeft, 
  BarChart3, 
  TrendingUp,
  BookOpen,
  Target
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { useState } from "react";

const Performance = () => {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<"tracking" | "subject">("tracking");
  
  // Mock data for performance chart
  const performanceData = [
    { month: "Jan", gpa: 3.2, target: 3.5 },
    { month: "Feb", gpa: 3.3, target: 3.5 },
    { month: "Mar", gpa: 3.4, target: 3.5 },
    { month: "Apr", gpa: 3.5, target: 3.5 },
    { month: "May", gpa: 3.6, target: 3.5 },
    { month: "Jun", gpa: 3.7, target: 3.5 },
  ];

  // Mock data for subject performance
  const subjectData = [
    { subject: "Data Science", score: 85 },
    { subject: "Machine Learning", score: 78 },
    { subject: "Algorithms", score: 92 },
    { subject: "Database", score: 88 },
    { subject: "Web Dev", score: 75 },
  ];
  
  return (
    <div className="min-h-screen bg-secondary/20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate("/student-dashboard")}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Performance Analytics</h1>
                <p className="text-sm text-muted-foreground">Track your academic progress</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* View Selector */}
          <Card>
            <CardHeader>
              <CardTitle>View Options</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <Button
                  variant={activeView === "tracking" ? "default" : "outline"}
                  onClick={() => setActiveView("tracking")}
                  className="flex items-center gap-2"
                >
                  <TrendingUp className="h-4 w-4" />
                  Performance Tracking
                </Button>
                <Button
                  variant={activeView === "subject" ? "default" : "outline"}
                  onClick={() => setActiveView("subject")}
                  className="flex items-center gap-2"
                >
                  <BookOpen className="h-4 w-4" />
                  Subject Performance
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Performance Tracking View */}
          {activeView === "tracking" && (
            <Card>
              <CardHeader>
                <CardTitle>Performance Tracking</CardTitle>
                <CardDescription>Your GPA progress over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis className="text-xs" domain={[2, 4]} />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="gpa" 
                      stroke="hsl(271, 91%, 65%)" 
                      strokeWidth={2}
                      dot={{ fill: "hsl(271, 91%, 65%)" }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="target" 
                      stroke="hsl(217, 91%, 60%)" 
                      strokeDasharray="5 5"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="mt-6 grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Current GPA</p>
                    <p className="text-2xl font-bold text-primary">3.7</p>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Target GPA</p>
                    <p className="text-2xl font-bold">4.0</p>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Progress</p>
                    <p className="text-2xl font-bold text-success">+0.5</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Subject Performance View */}
          {activeView === "subject" && (
            <Card>
              <CardHeader>
                <CardTitle>Subject Performance</CardTitle>
                <CardDescription>Your scores across different subjects</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={subjectData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="subject" className="text-xs" angle={-45} textAnchor="end" height={80} />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Bar dataKey="score" fill="hsl(271, 91%, 65%)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-6 space-y-4">
                  {subjectData.map((subject, index) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <BookOpen className="h-5 w-5 text-primary" />
                        <span className="font-medium">{subject.subject}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <Progress value={subject.score} className="w-32" />
                        <Badge variant={subject.score >= 85 ? "success" : subject.score >= 70 ? "secondary" : "warning"}>
                          {subject.score}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default Performance;