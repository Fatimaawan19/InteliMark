import { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// UI Components
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// Contexts
import { NotificationProvider } from "./context/NotificationContext";

// Firebase
import { testFirebaseConnection, initializeCollections } from "./firebase";

// Route pages are lazy-loaded to keep initial load fast.
const Login = lazy(() => import("./pages/Login/Login"));
const AIGrading = lazy(() => import("./pages/TeacherDasboard/AIGrading"));
const Performance = lazy(() => import("./pages/StudentDasboard/Performance"));
const ViewReport = lazy(() => import("./pages/ViewReport"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Admin (Owner) Dashboard Pages
const AdminDashboard = lazy(() => import("./pages/OwnerDasboard/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/OwnerDasboard/AdminUsers"));
const AdminCourses = lazy(() => import("./pages/OwnerDasboard/AdminCourses"));
const AdminReports = lazy(() => import("./pages/OwnerDasboard/AdminReports"));
const AdminQueries = lazy(() => import("./pages/OwnerDasboard/AdminQueries"));
const AdminDatabase = lazy(() => import("./pages/OwnerDasboard/AdminDatabase"));
const AdminAssignments = lazy(() => import("./pages/OwnerDasboard/AdminAssignments"));
const AdminSecurity = lazy(() => import("./pages/OwnerDasboard/AdminSecurity"));
const AdminNotifications = lazy(() => import("./pages/OwnerDasboard/AdminNotifications"));
const AdminRegister = lazy(() => import("./pages/OwnerDasboard/AdminRegister"));

// Teacher Dashboard Pages
const TeacherDashboard = lazy(() => import("./pages/TeacherDasboard/TeacherDashboard"));
const TeacherCourses = lazy(() => import("./pages/TeacherDasboard/TeacherCourses"));
const Assessments = lazy(() => import("./pages/TeacherDasboard/Assessments"));
const Collection = lazy(() => import("./pages/TeacherDasboard/Collection"));
const TeacherAnalytics = lazy(() => import("./pages/TeacherDasboard/Analytics"));
const GenerateReport = lazy(() => import("./pages/TeacherDasboard/GenerateReport"));
const Submissions = lazy(() => import("./pages/TeacherDasboard/Submissions"));
const TeacherNotifications = lazy(() => import("./pages/TeacherDasboard/TeacherNotifications"));
const TeacherQueries = lazy(() => import("./pages/TeacherDasboard/TeacherQueries"));

// Student Dashboard Pages
const StudentDashboard = lazy(() => import("./pages/StudentDasboard/StudentDashboard"));
const StudentQuery = lazy(() => import("./pages/StudentDasboard/StudentQuery"));
const StudentFeedback = lazy(() => import("./pages/StudentDasboard/StudentFeedback"));
const Chatbot = lazy(() => import("./pages/StudentDasboard/Chatbot"));
const StudentNotifications = lazy(() => import("./pages/StudentDasboard/StudentNotifications"));
const StudentAssessments = lazy(() => import("./pages/StudentDasboard/StudentAssessments"));
const StudentCourses = lazy(() => import("./pages/StudentDasboard/StudentCourses"));

const queryClient = new QueryClient();

const App = () => {
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const initFirebase = async () => {
      try {
        await testFirebaseConnection();
        await initializeCollections();
      } catch (err) {
        console.error("Firebase initialization error:", err);
        setError(err as Error);
      }
    };
    initFirebase();
  }, []);

  if (error) {
    return (
      <div style={{ padding: "20px", color: "red" }}>
        <h1>Error Loading Application</h1>
        <p>{error.message}</p>
        <pre>{error.stack}</pre>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <NotificationProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense
              fallback={
                <div className="min-h-screen flex items-center justify-center text-muted-foreground">
                  Loading…
                </div>
              }
            >
              <Routes>
                {/* Auth & Landing */}
                <Route path="/" element={<Login />} />
                <Route path="/admin-register" element={<AdminRegister />} />

                {/* Admin (Owner) Dashboard */}
                <Route path="/admin-dashboard" element={<AdminDashboard />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/courses" element={<AdminCourses />} />
                <Route path="/generate-report" element={<AdminReports />} />
                <Route path="/admin/database" element={<AdminDatabase />} />
                <Route path="/admin/assignments" element={<AdminAssignments />} />
                <Route path="/admin/security" element={<AdminSecurity />} />
                <Route path="/admin/notifications" element={<AdminNotifications />} />
                <Route path="/admin/queries" element={<AdminQueries />} />

                {/* Teacher */}
                <Route path="/teacher-dashboard" element={<TeacherDashboard />} />
                <Route path="/teacher/courses" element={<TeacherCourses />} />
                <Route path="/teacher/assessments" element={<Assessments />} />
                <Route path="/teacher/collection" element={<Collection />} />
                <Route path="/teacher/generate-report" element={<GenerateReport />} />
                <Route path="/teacher/grading-queue" element={<Submissions />} />
                <Route path="/teacher/submissions" element={<Submissions />} />
                <Route path="/teacher/notifications" element={<TeacherNotifications />} />
                <Route path="/teacher/queries" element={<TeacherQueries />} />
                <Route path="/teacher/analytics" element={<TeacherAnalytics />} />

                {/* Student */}
                <Route path="/student-dashboard" element={<StudentDashboard />} />
                <Route path="/student/courses" element={<StudentCourses />} />
                <Route path="/student/help-desk" element={<StudentQuery />} />
                <Route path="/student/feedback" element={<StudentFeedback />} />
                <Route path="/student/chatbot" element={<Chatbot />} />
                <Route path="/student/notifications" element={<StudentNotifications />} />
                <Route path="/student/assessments" element={<StudentAssessments />} />

                {/* Shared */}
                <Route path="/ai-grading" element={<AIGrading />} />
                <Route path="/performance" element={<Performance />} />
                <Route path="/view-report" element={<ViewReport />} />

                {/* 404 */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
        </BrowserRouter>
      </NotificationProvider>
        </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
