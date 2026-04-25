import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Brain, 
  FileText, 
  Code, 
  Image,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
  ChevronLeft,
  Download,
  Edit,
  Save,
  RotateCcw,
  Target,
  TrendingUp,
  Zap
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { auth } from "../../firebase";
import { useToast } from "@/hooks/use-toast";

type AiGradingHeader = {
  _id: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  assessmentId: string;
  assessmentTitle: string;
  assessmentType: "quiz" | "assignment";
  courseCode: string;
  courseName?: string;
  submittedAt?: string | null;
  submittedDisplay?: string;
  status: string;
  isLate: boolean;
  grade: number | null;
  maxGrade: number | null;
  feedback?: string;
  aiGradingSuggestion?: number | null;
  aiConfidence?: number | null;
  aiAnalysis?: string | null;
};

function extractFirstJsonObject(text: any) {
  if (!text) return null;
  const raw = String(text);
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const candidate = cleaned.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const AIGrading = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [manualFeedback, setManualFeedback] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [overrideGrade, setOverrideGrade] = useState<number | null>(null);
  const [teacherId, setTeacherId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [header, setHeader] = useState<AiGradingHeader | null>(null);
  const [report, setReport] = useState<any>(null);
  const [submissionRaw, setSubmissionRaw] = useState<any>(null);
  const [activeQuestionKey, setActiveQuestionKey] = useState<string>("Q1");
  const [feedbackDirty, setFeedbackDirty] = useState(false);
  const [content, setContent] = useState<any>(null);
  const [activeCodeFileId, setActiveCodeFileId] = useState<string | null>(null);
  const [codeFileText, setCodeFileText] = useState<string>("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<number>(65);

  const contentFlags = useMemo(() => {
    const types: string[] = Array.isArray(content?.extraction?.contentTypes) ? content.extraction.contentTypes : [];
    const hasText =
      types.includes("text") || Boolean(String(content?.extraction?.rawText || "").trim()) || Boolean(String(content?.submissionText || "").trim());
    const hasCode = types.includes("code") || Boolean(content?.grouped?.code?.length);
    const hasGraphical =
      types.includes("graphical") || Boolean(content?.grouped?.graphical?.length) || Boolean(content?.extraction?.hasVisual);
    return { hasText, hasCode, hasGraphical };
  }, [content]);

  const perQuestionScores = useMemo(() => {
    const fromRaw = Array.isArray(submissionRaw?.perQuestionScores) ? submissionRaw.perQuestionScores : [];
    if (fromRaw.length) return fromRaw;
    const qs = Array.isArray(report?.questions) ? report.questions : [];
    return qs.map((q: any) => ({
      questionKey: q?.questionKey || "",
      awardedMarks: Number(q?.awardedMarks ?? 0) || 0,
      maxMarks: Number(q?.maxMarks ?? 0) || 0,
      confidence: Number(q?.confidence ?? 0) || 0,
      summary: String(q?.summary || q?.studentAnswerSummary || "").trim(),
      mistakes: Array.isArray(q?.mistakes) ? q.mistakes : [],
      improvements: Array.isArray(q?.improvements) ? q.improvements : [],
      coverage: Array.isArray(q?.coverage) ? q.coverage : [],
    }));
  }, [submissionRaw, report]);

  const activeQuestion = useMemo(() => {
    const found = perQuestionScores.find((q: any) => String(q?.questionKey || "") === activeQuestionKey);
    return found || perQuestionScores[0] || null;
  }, [perQuestionScores, activeQuestionKey]);

  const detectedMistakes = useMemo(() => {
    const qs = Array.isArray(submissionRaw?.automarkReport?.questions)
      ? submissionRaw.automarkReport.questions
      : Array.isArray(report?.questions)
        ? report.questions
        : [];
    return qs.map((q: any) => {
      const coverage = Array.isArray(q?.coverage) ? q.coverage : [];
      const uncovered = coverage
        .filter((c: any) => c && c.covered === false)
        .map((c: any) => String(c.point || "").trim())
        .filter(Boolean);
      const improvements = Array.isArray(q?.improvements) ? q.improvements.map((x: any) => String(x || "").trim()).filter(Boolean) : [];
      const fromLlm = Array.isArray(q?.mistakes) ? q.mistakes : [];
      const mistakes =
        fromLlm.length > 0
          ? fromLlm
              .map((m: any) => String(m?.feedback || m?.message || m?.type || "").trim())
              .filter(Boolean)
              .slice(0, 8)
          : [...uncovered, ...improvements].slice(0, 8);
      return { q, mistakes };
    });
  }, [report, submissionRaw]);

  function buildHighlightRanges(fullText: string, mistakes: any[]) {
    const text = String(fullText || "");
    const ranges: { start: number; end: number; meta: any }[] = [];
    const safeAdd = (start: number, end: number, meta: any) => {
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      const s = Math.max(0, Math.min(text.length, start));
      const e = Math.max(0, Math.min(text.length, end));
      if (e <= s) return;
      if (ranges.some((r) => !(e <= r.start || s >= r.end))) return;
      ranges.push({ start: s, end: e, meta });
    };

    for (const m of Array.isArray(mistakes) ? mistakes : []) {
      const quote = String(m?.text_span || m?.evidenceQuote || "").trim();
      if (Number.isFinite(m?.start_index) && Number.isFinite(m?.end_index)) {
        safeAdd(Number(m.start_index), Number(m.end_index), m);
        continue;
      }
      if (Number.isFinite(m?.spanStart) && Number.isFinite(m?.spanEnd)) {
        safeAdd(Number(m.spanStart), Number(m.spanEnd), m);
        continue;
      }
      if (quote && quote.length >= 6) {
        const idx = text.toLowerCase().indexOf(quote.toLowerCase());
        if (idx !== -1) safeAdd(idx, idx + quote.length, m);
      }
    }
    return ranges.sort((a, b) => a.start - b.start);
  }

  function renderHighlightedText(fullText: string, ranges: { start: number; end: number; meta: any }[]) {
    const text = String(fullText || "");
    if (!ranges.length) return <pre className="text-sm whitespace-pre-wrap">{text || "—"}</pre>;
    const parts: any[] = [];
    let cursor = 0;
    ranges.forEach((r, i) => {
      if (cursor < r.start) parts.push(<span key={`t-${i}-p`}>{text.slice(cursor, r.start)}</span>);
      const type = String(r.meta?.type || "mistake").trim();
      const feedback = String(r.meta?.feedback || r.meta?.message || "").trim();
      const suggestion = String(r.meta?.suggestion || r.meta?.suggestedCorrection || "").trim();
      parts.push(
        <Popover key={`t-${i}-h`}>
          <PopoverTrigger asChild>
            <span className="underline decoration-red-500 decoration-2 underline-offset-2 bg-red-50 text-red-900 cursor-pointer">
              {text.slice(r.start, r.end)}
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-red-700">{type}</div>
                <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
                  issue
                </Badge>
              </div>
              {feedback ? <div className="text-sm text-gray-900 whitespace-pre-wrap">{feedback}</div> : null}
              {suggestion ? (
                <div className="text-sm">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Suggestion</div>
                  <div className="whitespace-pre-wrap bg-muted rounded-md p-2">{suggestion}</div>
                </div>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      );
      cursor = r.end;
    });
    if (cursor < text.length) parts.push(<span key="t-end">{text.slice(cursor)}</span>);
    return <pre className="text-sm whitespace-pre-wrap">{parts}</pre>;
  }
  
  // Determine if this is being viewed by a student (coming from student dashboard)
  const isStudentView = location.state?.fromStudent || false;
  const submissionId: string | undefined = location.state?.submissionId;
  const assessmentIdFromNav: string | undefined = location.state?.assessmentId;
  const queueSubmissionIds: string[] = Array.isArray(location.state?.queueSubmissionIds) ? location.state.queueSubmissionIds : [];
  const queueIndex: number = Number.isFinite(location.state?.queueIndex) ? Number(location.state.queueIndex) : 0;
  const autoRun: boolean = Boolean(location.state?.autoRun);
  const [autoRunDone, setAutoRunDone] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setTeacherId(user?.uid || "");
    });
    return () => unsubscribe();
  }, []);

  const lastAutomarkStatusRef = useRef<string>("");

  const prepareReview = async (tid: string) => {
    if (!submissionId) return;
    if (!tid && !isStudentView) return;
    try {
      await fetch(`http://localhost:5000/api/submissions/${encodeURIComponent(submissionId)}/prepare-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId: tid }),
      });
    } catch {
      // best-effort only
    }
  };

  const fetchHeader = async (tid: string) => {
    if (!submissionId) {
      setLoading(false);
      setHeader(null);
      return;
    }
    if (!tid && !isStudentView) {
      // teacher view requires teacherId for authorization
      return;
    }

    setLoading(true);
    try {
      const url = `http://localhost:5000/api/submissions/ai-grading/${encodeURIComponent(submissionId)}?teacherId=${encodeURIComponent(tid)}`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to load submission (${res.status})`);
      }
      const sub: AiGradingHeader = data.submission;
      setHeader(sub);
      setSubmissionRaw(data?.submissionRaw || null);
      // Don't clobber the teacher's in-progress typing while polling.
      if (!feedbackDirty) setManualFeedback(sub.feedback || "");

      if (sub.aiAnalysis) {
        try {
          // Backward-compatible: old records may store non-JSON or fenced JSON.
          const parsed = (() => {
            try {
              return JSON.parse(String(sub.aiAnalysis));
            } catch {
              return extractFirstJsonObject(sub.aiAnalysis);
            }
          })();
          setReport(parsed || null);
        } catch {
          setReport(null);
        }
      } else {
        setReport(null);
      }

      const qs = Array.isArray(data?.submissionRaw?.perQuestionScores) ? data.submissionRaw.perQuestionScores : [];
      const firstKey = String(qs?.[0]?.questionKey || "").trim();
      if (firstKey) setActiveQuestionKey(firstKey);
    } catch (e: any) {
      toast({
        title: "Failed to load AI grading view",
        description: e?.message || String(e),
        variant: "destructive",
      });
      setHeader(null);
      setReport(null);
      setSubmissionRaw(null);
    } finally {
      setLoading(false);
    }
  };

  // Reset local UI state when changing submissions (Save & Next navigation).
  useEffect(() => {
    setFeedbackDirty(false);
    setOverrideGrade(null);
    setReport(null);
    setContent(null);
    setActiveCodeFileId(null);
    setCodeFileText("");
    setAutoRunDone(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  const fetchContent = async (tid: string) => {
    if (!submissionId) return;
    if (!tid && !isStudentView) return;

    try {
      const url = `http://localhost:5000/api/submissions/${encodeURIComponent(submissionId)}/content?teacherId=${encodeURIComponent(tid)}`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to load content (${res.status})`);
      }
      setContent(data);
      // Default-select first code file
      const firstCode = data?.grouped?.code?.[0];
      if (firstCode && !activeCodeFileId) {
        setActiveCodeFileId(firstCode.id);
      }
    } catch (e: any) {
      // keep UI working even if content endpoint fails
      console.warn("[AIGrading] content fetch failed:", e?.message || e);
    }
  };

  useEffect(() => {
    if (isStudentView) return;
    if (!teacherId) return;
    // When opening Review: ensure extraction/ingestion is queued so tabs populate automatically.
    prepareReview(teacherId);
    fetchHeader(teacherId);
    fetchContent(teacherId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, submissionId, isStudentView]);

  // Auto-run automark when entering via assessment AutoMark flow.
  useEffect(() => {
    if (isStudentView) return;
    if (!autoRun) return;
    if (autoRunDone) return;
    if (!teacherId) return;
    if (!submissionId) return;
    // Wait until initial header load finishes (so status/confidence shows correctly).
    if (loading) return;
    setAutoRunDone(true);
    runAutomark();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, autoRunDone, teacherId, submissionId, loading]);

  // Real-time refresh (polling) to keep the mockup page live.
  useEffect(() => {
    if (isStudentView) return;
    if (!teacherId) return;
    if (!submissionId) return;

    const interval = setInterval(() => {
      // Avoid fighting with active actions; we'll refetch after actions anyway.
      if (isProcessing) return;
      fetchHeader(teacherId);
      fetchContent(teacherId);
    }, 4000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, submissionId, isStudentView, isProcessing]);

  // Show a toast once LLM processing flips to completed (not on initial load).
  useEffect(() => {
    const s = String(submissionRaw?.automarkStatus || "");
    if (!s) return;
    const prev = lastAutomarkStatusRef.current;
    lastAutomarkStatusRef.current = s;
    if (!prev) return;
    if (prev !== s && s === "completed") {
      toast({ title: "LLM Marking Successful", description: "AutoMark results are ready for review." });
    }
    if (prev !== s && s === "failed") {
      const msg = String(submissionRaw?.automarkError || "").trim();
      toast({
        title: "LLM Marking Failed",
        description: msg || "AutoMark failed. Check extraction and try again.",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionRaw?.automarkStatus]);

  // Animate the processing progress bar while LLM runs.
  useEffect(() => {
    if (!isProcessing) return;
    setProcessingProgress(65);
    const id = setInterval(() => {
      setProcessingProgress((p) => {
        // Keep it moving but never "finish" until request completes.
        const next = p + 7;
        return next >= 92 ? 70 : next;
      });
    }, 700);
    return () => clearInterval(id);
  }, [isProcessing]);

  const overall = useMemo(() => {
    const max = header?.maxGrade ?? report?.totals?.max ?? null;
    const awarded = overrideGrade ?? header?.grade ?? header?.aiGradingSuggestion ?? report?.totals?.awarded ?? null;
    const confidence = header?.aiConfidence ?? report?.confidence ?? null;
    return { max, awarded, confidence };
  }, [header, report, overrideGrade]);

  const autoGraded = Boolean(header?.aiGradingSuggestion != null || header?.aiAnalysis);

  const runAutomark = async (opts?: { skipReingest?: boolean }) => {
    if (!submissionId || !teacherId) return;
    setIsProcessing(true);
    try {
      const res = await fetch(`http://localhost:5000/api/submissions/${encodeURIComponent(submissionId)}/automark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId, skipReingest: Boolean(opts?.skipReingest) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `AutoMark failed (${res.status})`);
      }
      setReport(data.report || null);
      toast({ title: "AutoMark completed", description: "AI grading suggestion generated for review." });
      await fetchHeader(teacherId);
      await fetchContent(teacherId);
    } catch (e: any) {
      toast({
        title: "AutoMark failed",
        description: e?.message || String(e),
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const loadCodeFile = async (fileId: string) => {
    const file = content?.files?.find((f: any) => f?.id === fileId);
    if (!file?.fileUrl) return;
    setActiveCodeFileId(fileId);
    setCodeLoading(true);
    try {
      const res = await fetch(file.fileUrl);
      const text = await res.text();
      setCodeFileText(text);
    } catch (e: any) {
      setCodeFileText(`Failed to load code file.\n${e?.message || String(e)}`);
    } finally {
      setCodeLoading(false);
    }
  };

  const saveGrade = async () => {
    if (!submissionId || !teacherId) return;
    const gradeToSave =
      overrideGrade ?? header?.aiGradingSuggestion ?? header?.grade ?? report?.totals?.awarded ?? null;

    if (gradeToSave == null) {
      toast({
        title: "No grade to save",
        description: "Run AutoMark or set an override grade first.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch(`http://localhost:5000/api/submissions/${encodeURIComponent(submissionId)}/grade`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade: gradeToSave,
          feedback: manualFeedback,
          teacherId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Save failed (${res.status})`);
      }
      toast({ title: "Saved", description: "Marks and feedback saved to submissions." });
      await fetchHeader(teacherId);
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message || String(e),
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const saveAndNext = async () => {
    await saveGrade();
    // Navigate to next ungraded submission in queue (if provided).
    if (!queueSubmissionIds.length) return;
    const nextIndex = queueIndex + 1;
    const nextSubmissionId = queueSubmissionIds[nextIndex];
    if (!nextSubmissionId) {
      toast({ title: "Done", description: "No more pending submissions in this assessment." });
      return;
    }

    navigate("/ai-grading", {
      state: {
        submissionId: nextSubmissionId,
        assessmentId: assessmentIdFromNav,
        queueSubmissionIds,
        queueIndex: nextIndex,
        teacherView: true,
        autoRun: true,
      },
    });
  };

  const publishToStudent = async () => {
    if (!submissionId || !teacherId) return;
    const ok = window.confirm("This will publish the AI report/grade to the student (final). Continue?");
    if (!ok) return;
    setIsProcessing(true);
    try {
      const res = await fetch(
        `http://localhost:5000/api/submissions/${encodeURIComponent(submissionId)}/publish-ai`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teacherId }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Publish failed (${res.status})`);
      }
      toast({ title: "Published", description: "AI report/grade published to student." });
      await fetchHeader(teacherId);
    } catch (e: any) {
      toast({
        title: "Publish failed",
        description: e?.message || String(e),
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-primary/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost"
                onClick={() => navigate(-1)}
                className="hover:bg-primary/10 transition-all p-2 rounded-lg"
              >
                <ChevronLeft className="h-5 w-5 text-gray-700" />
              </Button>
              <div className="flex items-center gap-2">
                <Brain className="h-6 sm:h-8 w-6 sm:w-8 text-primary" />
                <div>
                  <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                    AI Grading System
                  </h1>
                  <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                    Intelligent Assignment Evaluation
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isStudentView ? (
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download Report
                </Button>
              ) : (
                <>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => navigate("/generate-report")}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Report
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={publishToStudent}
                    disabled={isProcessing || loading}
                  >
                    Publish Grade to Student
                  </Button>
                  <Button
                    className="bg-gradient-primary text-primary-foreground hover:shadow-glow"
                    onClick={saveAndNext}
                    disabled={isProcessing || loading}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save & Next
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Submission Info */}
        <Card className="mb-6 border-2 border-primary/15 shadow-sm bg-white rounded-xl">
          <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-xl border-b border-primary/10">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg sm:text-xl text-gray-900">
                  {header?.assessmentTitle || "AI Grading"}
                </CardTitle>
                <CardDescription>
                  <span className="block text-sm text-gray-800 font-medium">
                    {header?.studentName || "—"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {header?.courseCode || "—"}
                  </span>
                </CardDescription>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="info">
                  <Clock className="h-3 w-3 mr-1" />
                  {header?.submittedDisplay || "—"}
                </Badge>
                {autoGraded ? (
                  <Badge variant="success">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Auto-Graded
                  </Badge>
                ) : (
                  <Badge variant="warning">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Pending AI
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Submission Content */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                {contentFlags.hasText ? <TabsTrigger value="text">Text Answers</TabsTrigger> : null}
                {contentFlags.hasCode ? <TabsTrigger value="code">Code</TabsTrigger> : null}
                {contentFlags.hasGraphical ? <TabsTrigger value="graphical">Graphical</TabsTrigger> : null}
                <TabsTrigger value="plagiarism">Plagiarism Check</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                {/* AI Grading Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      AI Grading Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gradient-card rounded-lg">
                      <div>
                        <p className="text-sm text-muted-foreground">Overall Score</p>
                        <p className="text-3xl font-bold text-primary">
                          {overall.awarded != null && overall.max
                            ? `${Math.round((overall.awarded / overall.max) * 100)}%`
                            : "—"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">AI Confidence</p>
                        <div className="flex items-center gap-2">
                          <Progress value={overall.confidence ?? 0} className="w-20" />
                          <span className="text-sm font-medium">{overall.confidence ?? "—"}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Suggested</p>
                        <p className="text-xl font-bold">{header?.aiGradingSuggestion ?? "—"}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Saved Grade</p>
                        <p className="text-xl font-bold">{header?.grade ?? "—"}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Max Marks</p>
                        <p className="text-xl font-bold">{overall.max ?? "—"}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Late</p>
                        <p className="text-xl font-bold">{header?.isLate ? "Yes" : "No"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* AI Processing Animation */}
                {isProcessing && (
                  <Card className="bg-gradient-primary text-primary-foreground">
                    <CardContent className="py-8">
                      <div className="text-center space-y-4">
                        <div className="flex justify-center">
                          <Brain className="h-12 w-12 animate-pulse" />
                        </div>
                        <h3 className="text-xl font-semibold">AI Processing Submission</h3>
                        <p className="text-sm opacity-90">
                          Running AutoMark and generating a detailed grading report…
                        </p>
                        <Progress value={processingProgress} className="w-full max-w-xs mx-auto" />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Detected Mistakes and Manual Feedback - Side by Side */}
                <div className="grid lg:grid-cols-2 gap-4">
                  {/* Detected Mistakes */}
                  <Card className="h-full">
                    <CardHeader>
                      <CardTitle>Detected Mistakes</CardTitle>
                      <CardDescription>AI-identified areas for improvement</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {!detectedMistakes.length ? (
                        <div className="text-sm text-muted-foreground">
                          Run AutoMark to generate per-question feedback and detected issues.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {detectedMistakes.map(({ q, mistakes }: any) => (
                            <div key={q.questionKey} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                              <div className="mt-1">
                                {(q.confidence ?? 0) >= 70 ? (
                                  <CheckCircle className="h-4 w-4 text-success" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-warning" />
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-xs">
                                    <Target className="h-3 w-3 mr-1" />
                                    {q.questionKey}
                                  </Badge>
                                  <Badge variant="secondary" className="text-xs">
                                    {Number(q.awardedMarks ?? 0)}/{Number(q.maxMarks ?? 0)}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {q.confidence ?? 0}%
                                  </Badge>
                                </div>
                                <p className="text-sm">{q.summary || q.studentAnswerSummary || "—"}</p>

                                {mistakes.length ? (
                                  <ul className="mt-2 space-y-1 list-disc pl-5 text-xs text-muted-foreground">
                                    {mistakes.map((m: string, idx: number) => (
                                      <li key={`${q.questionKey}::m::${idx}`}>{m}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <div className="mt-2 text-xs text-muted-foreground">No issues detected for this question.</div>
                                )}

                                {Array.isArray(q?.rubricBreakdown) && q.rubricBreakdown.length > 0 ? (
                                  <div className="mt-2 space-y-2">
                                    <div className="text-xs font-semibold text-gray-900">Rubric breakdown</div>
                                    {q.rubricBreakdown.slice(0, 6).map((b: any, idx: number) => (
                                      <div key={`${q.questionKey}::rb::${idx}`} className="space-y-1">
                                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                          <span className="truncate">
                                            {String(b?.criterion || `Criterion ${idx + 1}`)}
                                          </span>
                                          <span className="shrink-0">
                                            {Number(b?.awarded ?? 0)}/{Number(b?.max ?? 0)}
                                          </span>
                                        </div>
                                        <Progress
                                          value={
                                            Number(b?.max ?? 0) > 0
                                              ? Math.round((Number(b?.awarded ?? 0) / Number(b?.max ?? 0)) * 100)
                                              : 0
                                          }
                                        />
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Manual Feedback Section */}
                  <Card className="h-full">
                    <CardHeader>
                      <CardTitle>Manual Feedback & Override</CardTitle>
                      <CardDescription>Add additional comments or adjust the grade</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Textarea
                        placeholder="Add your feedback here..."
                        value={manualFeedback}
        onChange={(e) => {
          setManualFeedback(e.target.value);
          setFeedbackDirty(true);
        }}
                        className="min-h-[100px]"
                      />
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            const v = window.prompt("Override grade (number):", overrideGrade?.toString() || "");
                            if (v == null) return;
                            const n = Number(v);
                            if (!Number.isFinite(n)) {
                              toast({ title: "Invalid grade", description: "Please enter a valid number.", variant: "destructive" });
                              return;
                            }
                            setOverrideGrade(n);
                          }}
                          disabled={isProcessing || loading}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Override Grade
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => runAutomark({ skipReingest: true })}
                          disabled={isProcessing || loading}
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Re-run AI Analysis
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="code" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Code Submission</CardTitle>
                    <CardDescription>Student uploaded code files</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!content?.grouped?.code?.length ? (
                      <div className="text-sm text-muted-foreground">
                        No code files detected in this submission.
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-3 gap-4">
                        <div className="md:col-span-1 space-y-2">
                          {content.grouped.code.map((f: any) => (
                            <button
                              key={f.id}
                              className={`w-full text-left p-3 rounded-lg border transition-all ${
                                activeCodeFileId === f.id
                                  ? "border-primary/40 bg-primary/5"
                                  : "border-primary/10 bg-white hover:bg-primary/5"
                              }`}
                              onClick={() => loadCodeFile(f.id)}
                              type="button"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-gray-900 truncate">{f.originalName}</span>
                                <Badge variant="outline" className="text-xs">code</Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1 truncate">{f.mimeType || "text"}</div>
                            </button>
                          ))}
                        </div>
                        <div className="md:col-span-2 bg-muted p-4 rounded-lg font-mono text-sm overflow-x-auto min-h-[220px]">
                          <pre>{codeLoading ? "Loading…" : (codeFileText || "Select a code file to view.")}</pre>
                        </div>
                      </div>
                    )}
                    <div className="mt-4 p-4 bg-gradient-card rounded-lg">
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Brain className="h-4 w-4 text-primary" />
                        AI Code Analysis
                      </h4>
                      <div className="text-sm text-muted-foreground">
                        AutoMark currently summarizes per-question in the Overview tab. If you want richer code checks
                        (complexity, linting, edge cases), we can add code-specific prompts in the backend.
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="text" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Text Answers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {perQuestionScores?.length ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">Question:</span>
                          <div className="flex flex-wrap gap-2">
                            {perQuestionScores.map((q: any) => (
                              <Button
                                key={q.questionKey}
                                type="button"
                                variant={String(q.questionKey) === String(activeQuestionKey) ? "default" : "outline"}
                                className="h-8 px-3 text-sm"
                                onClick={() => setActiveQuestionKey(String(q.questionKey || "Q1"))}
                              >
                                {String(q.questionKey || "Q?")}{" "}
                                <span className="ml-2 text-xs opacity-80">
                                  {Number(q.awardedMarks ?? 0)}/{Number(q.maxMarks ?? 0)}
                                </span>
                              </Button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Per-question AI breakdown is not available yet (run AutoMark).
                        </div>
                      )}

                      {activeQuestion ? (
                        <div className="rounded-lg border border-primary/10 bg-muted/40 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-gray-900">
                              {String(activeQuestion.questionKey || "Question")} analysis
                            </div>
                            <div className="flex gap-2">
                              <Badge variant="secondary" className="text-xs">
                                {Number(activeQuestion.awardedMarks ?? 0)}/{Number(activeQuestion.maxMarks ?? 0)}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {Number(activeQuestion.confidence ?? 0)}%
                              </Badge>
                            </div>
                          </div>
                          {String(activeQuestion.summary || "").trim() ? (
                            <div className="mt-2 text-xs text-muted-foreground">{String(activeQuestion.summary)}</div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="p-4 bg-muted rounded-lg">
                        <h4 className="font-semibold mb-2 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          Student Extracted Text (highlights show mistakes)
                        </h4>
                        <p className="text-xs text-muted-foreground mb-2">
                          Status: {content?.extraction?.status || "pending"} {content?.extraction?.extractor ? `• ${content.extraction.extractor}` : ""}
                        </p>
                        {(() => {
                          const rawText = String(content?.extraction?.rawText || "");
                          const mistakes = Array.isArray(activeQuestion?.mistakes) ? activeQuestion.mistakes : [];
                          const ranges = buildHighlightRanges(rawText, mistakes);
                          return rawText.trim()
                            ? renderHighlightedText(rawText, ranges)
                            : <div className="text-sm text-muted-foreground">Extraction not ready yet.</div>;
                        })()}
                      </div>

                      {Array.isArray(activeQuestion?.mistakes) && activeQuestion.mistakes.length ? (
                        <div className="p-4 bg-muted rounded-lg">
                          <h4 className="font-semibold mb-2">Detected Mistakes</h4>
                          <div className="space-y-2">
                            {activeQuestion.mistakes.slice(0, 20).map((m: any, idx: number) => (
                              <div key={`m-${idx}`} className="rounded-lg bg-white border border-primary/10 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <Badge variant="destructive" className="text-xs">{String(m?.type || "mistake")}</Badge>
                                </div>
                                <div className="mt-2 text-sm text-gray-900 whitespace-pre-wrap">
                                  {String(m?.feedback || m?.message || "").trim() || "—"}
                                </div>
                                {String(m?.suggestion || m?.suggestedCorrection || "").trim() ? (
                                  <div className="mt-2 text-xs text-muted-foreground">
                                    Suggested correction: {String(m?.suggestion || m?.suggestedCorrection || "")}
                                  </div>
                                ) : null}
                                {String(m?.text_span || m?.evidenceQuote || "").trim() ? (
                                  <div className="mt-2 text-xs text-muted-foreground">
                                    Text span: “{String(m?.text_span || m?.evidenceQuote || "").slice(0, 220)}”
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="graphical" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Graphical Content</CardTitle>
                    <CardDescription>Images uploaded by the student</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!content?.grouped?.graphical?.length ? (
                      <div className="text-sm text-muted-foreground">No images detected in this submission.</div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {content.grouped.graphical.map((f: any) => (
                          <a
                            key={f.id}
                            href={f.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="group rounded-xl border border-primary/10 bg-white overflow-hidden hover:shadow-md transition-all"
                          >
                            <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                              <img
                                src={f.fileUrl}
                                alt={f.originalName}
                                className="h-full w-full object-cover group-hover:scale-[1.01] transition-transform"
                                loading="lazy"
                              />
                            </div>
                            <div className="p-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-gray-900 truncate">{f.originalName}</span>
                                <Badge variant="outline" className="text-xs">image</Badge>
                              </div>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="plagiarism" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Plagiarism Detection Report</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground">
                      Plagiarism checking isn’t wired to the backend yet on this page. If you want it, we can add a
                      similarity endpoint that compares submission embeddings across students for the same assessment.
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column - Stats */}
          <div className="space-y-6">
            {/* Comparison Stats */}
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Class Comparison</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gradient-card rounded-lg">
                    <span className="text-sm font-medium">Class Average</span>
                    <Badge variant="outline" className="text-base">78%</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gradient-card rounded-lg">
                    <span className="text-sm font-medium">Student Rank</span>
                    <Badge variant="success" className="text-base">#5 of 45</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gradient-card rounded-lg">
                    <span className="text-sm font-medium">Improvement</span>
                    <Badge variant="info" className="text-base">+12% from last</Badge>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-2">Performance Trend</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Assignment 1</span>
                        <span>75%</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Assignment 2</span>
                        <span>78%</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Assignment 3</span>
                        <span className="font-bold text-primary">85%</span>
                      </div>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                    <p className="text-xs text-muted-foreground">
                      This submission scores above the class average and shows significant improvement from previous assignments.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AIGrading;