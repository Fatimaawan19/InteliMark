import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { LineChart, Line, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

const systemStats = { activeAssignments: 156 };

const AdminAssignments: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-secondary/20">
      <div className="max-w-5xl mx-auto mt-8 px-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate('/admin-dashboard')}>← Back</Button>
          <h1 className="text-2xl font-semibold">Assignments</h1>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Quiz Statistics</CardTitle>
              <CardDescription>Overview of quiz performance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-primary/10 rounded-lg p-3">
                  <p className="text-2xl font-bold text-primary">245</p>
                  <p className="text-sm text-muted-foreground">Total Quizzes</p>
                </div>
                <div className="bg-success/10 rounded-lg p-3">
                  <p className="text-2xl font-bold text-success">89%</p>
                  <p className="text-sm text-muted-foreground">Completion Rate</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Average Score</span>
                  <span className="font-semibold">78.5%</span>
                </div>
                <Progress value={78.5} className="h-2" />
              </div>
              <Separator className="my-3" />
              <div className="space-y-2">
                <p className="text-sm font-medium">Recent Quiz Activity</p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-2 bg-gradient-card rounded">
                    <span className="text-xs text-muted-foreground">CS101 - Data Structures</span>
                    <Badge variant="outline">45 submissions</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-gradient-card rounded">
                    <span className="text-xs text-muted-foreground">SE202 - Software Design</span>
                    <Badge variant="outline">38 submissions</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-gradient-card rounded">
                    <span className="text-xs text-muted-foreground">DS301 - Machine Learning</span>
                    <Badge variant="outline">52 submissions</Badge>
                  </div>
                </div>
              </div>
              <Button className="w-full" variant="outline">View Detailed Analytics</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assignment Statistics</CardTitle>
              <CardDescription>Overview of all assignments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Total Assignments</span>
                  <span className="font-bold">{systemStats.activeAssignments}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Auto-Graded</span>
                  <Badge variant="success">89</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Manual Review</span>
                  <Badge variant="warning">45</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Pending Submission</span>
                  <Badge variant="secondary">22</Badge>
                </div>
                <Separator className="my-4" />
                <div>
                  <Label>Plagiarism Detection</Label>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm text-muted-foreground">Enabled for all submissions</span>
                    <div className="">Enabled</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminAssignments;
