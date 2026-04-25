import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  Brain, 
  Target,
  TrendingUp,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const StudentFeedback = () => {
  const navigate = useNavigate();

  const recentFeedback = [
    {
      assignment: "Algorithm Analysis Assignment",
      feedback: "Excellent work on time complexity analysis. Consider adding more edge cases.",
      grade: 92,
      mistakes: ["Missing base case", "Incorrect space complexity"]
    },
    {
      assignment: "Python Programming Quiz",
      feedback: "Good understanding of concepts. Review list comprehensions.",
      grade: 85,
      mistakes: ["Syntax errors in lambda functions", "Inefficient loop structure"]
    }
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
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Feedback & Focus Areas</h1>
                <p className="text-sm text-muted-foreground">AI-powered recommendations for improvement</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* AI Recommendations */}
          <Card className="bg-gradient-primary text-primary-foreground">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 bg-white/10 rounded-lg">
                <p className="text-sm font-medium mb-1">Focus Area</p>
                <p className="text-xs">Machine Learning concepts need more practice</p>
              </div>
              <div className="p-3 bg-white/10 rounded-lg">
                <p className="text-sm font-medium mb-1">Next Goal</p>
                <p className="text-xs">Complete 2 more assignments to reach 3.8 GPA</p>
              </div>
              <Button 
                className="w-full bg-white text-primary hover:bg-white/90"
                onClick={() => navigate("/performance")}
              >
                View Detailed Analytics
              </Button>
            </CardContent>
          </Card>

          {/* Recent Feedback */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Feedback</CardTitle>
              <CardDescription>Teacher comments on your recent submissions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentFeedback.map((item, index) => (
                <div key={index} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{item.assignment}</h3>
                    <Badge variant="success">Grade: {item.grade}%</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.feedback}</p>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Areas to Improve:</p>
                    {item.mistakes.map((mistake, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm">
                        <AlertCircle className="h-4 w-4 text-warning mt-0.5" />
                        <span>{mistake}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Focus Areas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Your Focus Areas
              </CardTitle>
              <CardDescription>Based on your recent performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-warning mt-0.5" />
                    <div>
                      <h4 className="font-semibold">Algorithm Complexity</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        You've made mistakes in time and space complexity analysis in 3 recent assignments
                      </p>
                      <Button variant="outline" size="sm" className="mt-2">
                        Practice Resources
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-success/10 border border-success/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-success mt-0.5" />
                    <div>
                      <h4 className="font-semibold">Code Documentation</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your documentation skills have improved significantly!
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default StudentFeedback;
