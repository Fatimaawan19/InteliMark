import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { BookOpen, Download, ArrowLeft, FileText, Loader2, Search, Brain, ChevronDown } from "lucide-react";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import axios from "axios";

type Course = {
  id: string; // Firebase doc id
  courseId?: string;
  courseCode?: string;
  courseName?: string;
  courseTitle?: string;
  teacherName?: string;
  creditHours?: number;
  degree?: string;
};

type Material = {
  _id: string;
  originalFileName: string;
  fileUrl: string;
  processingStatus?: string;
  createdAt?: string;
  chunkCount?: number;
};

const StudentCourses: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [registeredCourseIds, setRegisteredCourseIds] = useState<string[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [materialsByCourse, setMaterialsByCourse] = useState<Record<string, Material[]>>({});
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);

  const selectedCourseId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("courseId");
  }, [location.search]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUserId(user?.uid || null);
      if (!user) return;

      const userSnap = await getDoc(doc(db, "users", user.uid));
      if (userSnap.exists()) {
        const data = userSnap.data() as any;
        setRegisteredCourseIds(Array.isArray(data.registeredCourses) ? data.registeredCourses : []);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const loadCourses = async () => {
      if (registeredCourseIds.length === 0) {
        setCourses([]);
        setMaterialsByCourse({});
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Fetch registered courses directly by Firestore doc id.
        const enrolled = (
          await Promise.all(
            registeredCourseIds.map(async (courseDocId) => {
              try {
                const courseSnap = await getDoc(doc(db, "courses", courseDocId));
                if (!courseSnap.exists()) return null;
                return { id: courseSnap.id, ...(courseSnap.data() as any) } as Course;
              } catch {
                return null;
              }
            })
          )
        ).filter(Boolean) as Course[];

        setCourses(enrolled);
      } catch (e) {
        console.error("Failed to load courses", e);
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };

    loadCourses();
  }, [registeredCourseIds]);

  useEffect(() => {
    const loadMaterials = async () => {
      if (courses.length === 0) {
        setMaterialsByCourse({});
        return;
      }

      const next: Record<string, Material[]> = {};
      await Promise.all(
        courses.map(async (c) => {
          try {
            const res = await axios.get(
              `http://localhost:5000/api/courses/materials-by-external/${encodeURIComponent(c.id)}`
            );
            next[c.id] = Array.isArray(res.data?.materials) ? res.data.materials : [];
          } catch (e) {
            next[c.id] = [];
          }
        })
      );
      setMaterialsByCourse(next);
    };

    loadMaterials();
  }, [courses]);

  // If navigated from dashboard with ?courseId=, expand it and scroll into view.
  useEffect(() => {
    if (!selectedCourseId) return;
    setExpandedCourseId(selectedCourseId);
    const el = document.getElementById(`course-${selectedCourseId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedCourseId, courses.length]);

  const filteredCourses = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return courses;
    return courses.filter((c) => {
      const name = (c.courseName || c.courseTitle || "").toLowerCase();
      const code = (c.courseId || c.courseCode || "").toLowerCase();
      return name.includes(term) || code.includes(term);
    });
  }, [courses, search]);

  const handleDownload = async (url: string, fileName: string) => {
    setDownloading(fileName);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(objectUrl);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary/5">
      <header className="sticky top-0 z-50 bg-white shadow-md border-b border-primary/10">
        <div className="w-full px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/student-dashboard")}
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
              <h2 className="text-lg font-semibold text-gray-800">Courses & Materials</h2>
              <p className="text-xs text-gray-600">View your registered courses and downloads</p>
            </div>
          </div>
        </div>
      </header>

      <div className="px-6 py-8 max-w-6xl mx-auto space-y-6">
        <Card className="bg-white/80 backdrop-blur border border-primary/15 rounded-2xl shadow-sm">
          <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-xl border-b border-primary/10">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-lg font-bold text-black">Registered Courses</div>
                <div className="text-xs text-muted-foreground">Browse your enrolled courses and download materials</div>
              </div>
              <Badge variant="secondary" className="bg-primary/10 text-primary border border-primary/20">
                {filteredCourses.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search courses by code or name..."
                className="pl-9 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10 text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading courses…
              </div>
            ) : filteredCourses.length === 0 ? (
              <div className="py-10 text-center text-gray-500">
                No registered courses found.
              </div>
            ) : (
              <ScrollArea className="h-[520px] pr-4">
                <div className="space-y-4">
                  {filteredCourses.map((course) => {
                    const materials = materialsByCourse[course.id] || [];
                    const courseCode = course.courseId || course.courseCode || "COURSE";
                    const courseName = course.courseName || course.courseTitle || "Course";
                    const isExpanded = expandedCourseId === course.id;

                    return (
                      <div
                        key={course.id}
                        id={`course-${course.id}`}
                        className="border border-primary/10 rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="p-5 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1">
                              <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/10">
                                <BookOpen className="h-5 w-5 text-primary" />
                              </div>
                              <div className="flex-1">
                                <div className="font-bold text-gray-900">{courseCode}</div>
                                <div className="text-sm text-gray-700">{courseName}</div>
                                {course.teacherName && (
                                  <div className="text-xs text-gray-500 mt-1">Instructor: {course.teacherName}</div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {typeof course.creditHours === "number" && (
                                <Badge variant="outline" className="text-xs bg-white/70">
                                  {course.creditHours} CH
                                </Badge>
                              )}
                              <Badge variant="secondary" className="text-xs bg-white/60">
                                {materials.length} material{materials.length === 1 ? "" : "s"}
                              </Badge>
                            </div>
                          </div>

                          <div className="mt-4 flex items-center justify-between">
                            <div className="text-xs text-gray-600">
                              {materials.length === 0
                                ? "No materials uploaded yet."
                                : "Click to view course materials."}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setExpandedCourseId(isExpanded ? null : course.id)}
                              className={`bg-white/60 hover:bg-white/80 border border-gray-200 ${
                                isExpanded ? "text-primary" : "text-gray-800"
                              } hover:text-primary`}
                            >
                              <ChevronDown
                                className={`h-4 w-4 mr-2 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              />
                              {isExpanded ? "Hide Materials" : "View Materials"}
                            </Button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="p-4 bg-gray-50">
                            {materials.length === 0 ? (
                              <div className="text-sm text-gray-500">No materials uploaded yet.</div>
                            ) : (
                              <div className="space-y-2">
                                {materials.map((m) => (
                                  <div
                                    key={m._id}
                                    className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-primary/30 hover:shadow-sm transition-all"
                                  >
                                    <div className="flex items-start gap-3 min-w-0 flex-1">
                                      <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-100">
                                        <FileText className="h-4 w-4 text-indigo-600" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="font-semibold text-sm text-gray-900 truncate">
                                          {m.originalFileName}
                                        </div>
                                      </div>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleDownload(m.fileUrl, m.originalFileName)}
                                      disabled={downloading === m.originalFileName}
                                      className="ml-3 gap-2 bg-white"
                                    >
                                      {downloading === m.originalFileName ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Download className="h-4 w-4" />
                                      )}
                                      Download
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StudentCourses;

