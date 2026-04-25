const Submission = require("../models/Submission");
const Assessment = require("../models/Assessment");
const Course = require("../models/Course");
const path = require("path");
const fs = require("fs");
const { notifySubmissionCreated, logSubmissionActivity } = require("../utils/notificationService");
const uploadUtils = require("../utils/uploadUtils");
const { firestore } = require("../config/firebase");
const { ingestSubmission } = require("../utils/ingestionService");
const SubmissionRaw = require("../models/SubmissionRaw");
const { automarkOneSubmission, buildPerQuestionScoresFromReport, extractFirstJsonObject } = require("../utils/automarkLlmService");

function parseAiAnalysisToReport(aiAnalysis) {
  if (!aiAnalysis) return null;
  const s = String(aiAnalysis || "").trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return extractFirstJsonObject(s);
  }
}

async function resolveStudentEmail(studentId) {
  const sid = String(studentId || "").trim();
  if (!sid) return "";
  try {
    const doc = await firestore.collection("users").doc(sid).get();
    if (doc.exists) {
      const data = doc.data() || {};
      return String(data.email || data.mail || "").trim();
    }
  } catch {
    // ignore
  }
  return "";
}

/**
 * Submit an assessment answer
 * POST /api/submissions/submit
 */
exports.submitAssessment = async (req, res) => {
  try {
    const {
      assessmentId,
      studentId,
      submissionText,
      courseCode
    } = req.body;

    // Validate required fields
    if (!assessmentId || !studentId) {
      return res.status(400).json({ 
        error: "Assessment ID and Student ID are required" 
      });
    }

    // Get assessment details
    const assessment = await Assessment.findById(assessmentId);
    if (!assessment) {
      return res.status(404).json({ error: "Assessment not found" });
    }

    // Get course details
    const course = await Course.findById(assessment.courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Check if student already submitted
    const existingSubmission = await Submission.findOne({
      assessmentId,
      studentId
    });

    if (existingSubmission) {
      return res.status(400).json({ 
        error: "You have already submitted this assessment",
        submissionId: existingSubmission._id
      });
    }

    // Determine deadline (prefer submissionDeadline; else combine dueDate+dueTime; else dueDate)
    let deadline = assessment.submissionDeadline || null;
    if (!deadline && assessment.dueDate && assessment.dueTime) {
      deadline = new Date(`${assessment.dueDate}T${assessment.dueTime}`);
    }
    if (!deadline && assessment.dueDate) {
      deadline = new Date(assessment.dueDate);
    }

    const submissionTimestamp = new Date();
    const submissionDate = submissionTimestamp.toISOString().split('T')[0]; // YYYY-MM-DD
    const submissionTime = submissionTimestamp.toTimeString().split(' ')[0]; // HH:MM:SS
    const isLate = deadline ? submissionTimestamp > new Date(deadline) : false;

    const msPerDay = 24 * 60 * 60 * 1000;
    const lateDays = isLate
      ? Math.max(1, Math.ceil((submissionTimestamp.getTime() - new Date(deadline).getTime()) / msPerDay))
      : 0;
    const latePenaltyPerDay = isLate ? (assessment.latePenalty || 0) : 0;
    const latePenaltyPercent = isLate
      ? Math.min(100, lateDays * latePenaltyPerDay)
      : 0;

    // Business rule: submissions are allowed only when due date exists.
    if (!deadline) {
      return res.status(400).json({
        success: false,
        errorCode: "DEADLINE_REQUIRED",
        error: "Submission is not allowed because this assessment has no due date set."
      });
    }

    // Business rule: expired assessments cannot be submitted UNLESS late submissions are allowed
    if (isLate && !assessment.allowLateSubmission) {
      return res.status(403).json({ 
        success: false,
        errorCode: "DEADLINE_EXPIRED",
        error: "Submission deadline has passed for this assessment. Late submissions are not allowed."
      });
    }

    // Log if submission is late
    if (isLate && assessment.allowLateSubmission) {
      console.log(`⚠️ LATE SUBMISSION ALLOWED - Assessment: ${assessment.title}, Student: ${studentId}, Penalty: ${assessment.latePenalty}%`);
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        errorCode: "FILE_REQUIRED",
        error: "Please upload at least one file (PDF, DOC/DOCX, JPG, PNG)."
      });
    }

    // Process uploaded files
    const submissionFiles = [];
    let studentName = "Student";
    let studentEmail = "";

    try {
      const studentDoc = await firestore.collection('users').doc(studentId).get();
      if (studentDoc.exists) {
        const studentData = studentDoc.data();
        studentName = studentData.name || studentData.email || "Student";
        studentEmail = studentData.email || "";
      }
    } catch (error) {
      console.warn(`Could not fetch student data for ${studentId}`);
    }
    
    if (req.files && req.files.length > 0) {
      const dateStr = submissionDate;
      const timeStr = submissionTime;
      
      for (const file of req.files) {
        const fileUrl = `/uploads/student_uploads/${file.filename}`;
        
        submissionFiles.push({
          filename: file.filename,
          originalName: file.originalname,
          fileUrl,
          fileSize: file.size,
          mimeType: file.mimetype,
          uploadedAt: submissionTimestamp,
          uploadedDate: dateStr,
          uploadedTime: timeStr,
          marks: null,
          fileFeedback: ""
        });
      }
    }

    // Create submission record
    const uploadedFileNames = submissionFiles.map((file) => file.originalName || file.filename);
    const uploadedFilesCount = submissionFiles.length;
    const uploadedFilesTotalSize = submissionFiles.reduce((total, file) => total + (file.fileSize || 0), 0);

    const submission = new Submission({
      assessmentId,
      assessmentTitle: assessment.title,
      assessmentType: assessment.type,
      studentId,
      studentName,
      studentEmail,
      courseId: assessment.courseId,
      courseCode: course.courseCode,
      courseName: course.courseTitle,
      teacherId: assessment.teacherId,
      submissionFiles,
      uploadedFileNames,
      uploadedFilesCount,
      uploadedFilesTotalSize,
      submissionText: submissionText || "",
      submittedAt: submissionTimestamp,
      submissionDate,
      submissionTime,
      isLate,
      lateDays,
      latePenaltyPerDay,
      latePenaltyPercent,
      status: isLate ? 'late' : 'submitted',
      maxGrade: assessment.totalMarks,
      attemptNumber: 1
    });

    await submission.save();
    console.log(`✅ Submission created: ${submission._id} for assessment ${assessmentId} with ${submissionFiles.length} file(s)`);

    // Create/Upsert SubmissionRaw record (vector metadata + extraction placeholders)
    try {
      const visualCount = submissionFiles.reduce((acc, f) => {
        const name = String(f?.originalName || f?.filename || "").toLowerCase();
        const ext = path.extname(name);
        return acc + ([".jpg", ".jpeg", ".png"].includes(ext) ? 1 : 0);
      }, 0);

      const initialContentTypesSet = new Set();
      if ((submissionText || "").trim()) initialContentTypesSet.add("text");
      for (const f of submissionFiles) {
        const name = String(f?.originalName || f?.filename || "").toLowerCase();
        const ext = path.extname(name);
        if ([".pdf", ".docx"].includes(ext)) initialContentTypesSet.add("text");
        if ([".py", ".java", ".js", ".ts", ".tsx", ".c", ".cpp", ".cs", ".go", ".rb", ".php", ".rs", ".kt", ".swift"].includes(ext)) {
          initialContentTypesSet.add("code");
        }
        if ([".jpg", ".jpeg", ".png"].includes(ext)) initialContentTypesSet.add("graphical");
      }

      const studentEmail = await resolveStudentEmail(studentId);
      await SubmissionRaw.findOneAndUpdate(
        { submissionId: submission._id },
        {
          $setOnInsert: {
            submissionId: submission._id,
          },
          $set: {
            assessmentId: submission.assessmentId,
            courseId: submission.courseId,
            teacherId: submission.teacherId,
            studentId: submission.studentId,
            studentEmail,
            extractionStatus: "pending",
            extractor: "",
            rawText: "",
            charCount: 0,
            pageCount: 0,
            pageMetadata: [],
            contentTypes: Array.from(initialContentTypesSet),
            visualCount,
            equationCount: 0,
            ocrCount: 0,
            ocrCharCount: 0,
            // Default to OCR enabled for student submissions; per-run ingestion can still disable explicitly.
            ocrEnabled: true,
            ocrStatus: "",
            ocrError: "",
            extractionError: "",
            extractedAt: null,
            faissIngestionStatus: "pending",
            faissChunkCount: 0,
            numChunks: 0,
            numEmbeddings: 0,
            faissChunksMetadata: [],
            faissIngestionDurationMs: 0,
            faissIngestionError: "",
            faissIngestedAt: null,
          },
        },
        { upsert: true, new: true }
      );
    } catch (e) {
      console.warn("[SUBMISSION-RAW] ⚠️ Failed to create SubmissionRaw:", e?.message || e);
    }

    // Send notifications and admin activity update (async, non-blocking)
    setImmediate(async () => {
      try {
        await notifySubmissionCreated(submission, assessment, course, studentId);
        await logSubmissionActivity(submission, assessment, course, studentId);
      } catch (error) {
        console.warn('⚠️ Failed to process submission events:', error.message);
      }
    });

    // Trigger FAISS ingestion for this submission (async, non-blocking)
    setImmediate(async () => {
      const subId = String(submission._id);
      try {
        await Submission.findByIdAndUpdate(subId, { $set: { faissIngestionStatus: "pending" } });
        await SubmissionRaw.findOneAndUpdate(
          { submissionId: submission._id },
          {
            $set: {
              faissIngestionStatus: "pending",
              faissChunkCount: 0,
              numChunks: 0,
              numEmbeddings: 0,
              faissChunksMetadata: [],
              faissIngestionDurationMs: 0,
              faissIngestionError: "",
              faissIngestedAt: null,
            },
          }
        );

        const startedAt = Date.now();
        const result = await ingestSubmission(subId, { enableOcr: true });
        const durationMs = Date.now() - startedAt;
        const chunks = Number(result?.total_chunks_created ?? result?.chunks ?? 0) || 0;
        const embeddings = Number(result?.total_embeddings_created ?? result?.total_vectors_created ?? chunks) || 0;
        await Submission.findByIdAndUpdate(subId, {
          $set: {
            faissIngestionStatus: "completed",
            faissChunkCount: chunks,
            faissIngestionError: "",
            faissIngestedAt: new Date(),
          },
        });
        await SubmissionRaw.findOneAndUpdate(
          { submissionId: submission._id },
          {
            $set: {
              faissIngestionStatus: "completed",
              faissChunkCount: chunks,
              numChunks: chunks,
              numEmbeddings: embeddings,
              faissIngestionDurationMs: durationMs,
              faissIngestionError: "",
              faissIngestedAt: new Date(),
              // Extraction metadata (best-effort; provided by python ingestion)
              extractionStatus: result?.raw_text || (Array.isArray(result?.content_types) && result.content_types.length) ? "completed" : "skipped",
              extractor: result?.extractor || "",
              rawText: result?.raw_text || "",
              charCount: typeof result?.raw_text === "string" ? result.raw_text.length : 0,
              pageCount: Number(result?.page_count ?? 0) || 0,
              pageMetadata: Array.isArray(result?.page_metadata) ? result.page_metadata : [],
              visualCount: Number(result?.visual_count ?? 0) || 0,
              equationCount: Number(result?.equation_count ?? 0) || 0,
              contentTypes: Array.isArray(result?.content_types) ? result.content_types : [],
              ocrEnabled: Boolean(result?.ocr_enabled),
              ocrStatus: result?.ocr_status || "",
              ocrError: result?.ocr_error || "",
              ocrCount: Number(result?.ocr_count ?? 0) || 0,
              ocrCharCount: Number(result?.ocr_char_count ?? 0) || 0,
              extractionError: "",
              extractedAt: new Date(),
            },
          }
        );
      } catch (e) {
        await Submission.findByIdAndUpdate(subId, {
          $set: {
            faissIngestionStatus: "failed",
            faissIngestionError: e?.message || String(e),
          },
        });
        try {
          await SubmissionRaw.findOneAndUpdate(
            { submissionId: submission._id },
            {
              $set: {
                faissIngestionStatus: "failed",
                faissIngestionError: e?.message || String(e),
                extractionStatus: "failed",
                extractionError: e?.message || String(e),
              },
            }
          );
        } catch (_) {}
        console.warn("[SUBMISSION-FAISS] ⚠️ Ingestion failed:", e?.message || e);
      }
    });

    res.status(201).json({
      success: true,
      errorCode: null,
      message: "Assessment submitted successfully",
      submission: {
        id: submission._id,
        assessmentId: submission.assessmentId,
        submittedAt: submission.submittedAt,
        submittedDate: submissionDate,
        submittedTime: submissionTime,
        uploadedFileNames,
        uploadedFilesCount,
        uploadedFilesTotalSize,
        isLate: submission.isLate,
        status: submission.status,
        filesCount: submissionFiles.length
      }
    });

  } catch (error) {
    console.error("❌ Error submitting assessment:", error);
    res.status(500).json({ 
      error: "Failed to submit assessment",
      details: error.message
    });
  }
};

/**
 * Get all submissions for a student
 * GET /api/submissions/student/:studentId
 */
exports.getStudentSubmissions = async (req, res) => {
  try {
    const { studentId } = req.params;

    const submissions = await Submission.find({ studentId })
      .populate('assessmentId', 'title type dueDate totalMarks')
      .populate('courseId', 'courseCode courseTitle')
      .sort({ submittedAt: -1 })
      .lean();

    res.json({
      success: true,
      submissions,
      count: submissions.length
    });

  } catch (error) {
    console.error("❌ Error fetching student submissions:", error);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
};

/**
 * Get submission for a specific assessment by a student
 * GET /api/submissions/assessment/:assessmentId/student/:studentId
 */
exports.getSubmissionByAssessment = async (req, res) => {
  try {
    const { assessmentId, studentId } = req.params;

    const submission = await Submission.findOne({ 
      assessmentId, 
      studentId 
    })
      .populate('assessmentId', 'title type dueDate totalMarks')
      .populate('courseId', 'courseCode courseTitle')
      .lean();

    if (!submission) {
      return res.status(404).json({ 
        success: false,
        error: "Submission not found" 
      });
    }

    res.json({
      success: true,
      submission
    });

  } catch (error) {
    console.error("❌ Error fetching submission:", error);
    res.status(500).json({ error: "Failed to fetch submission" });
  }
};

/**
 * Get all submissions for an assessment (Teacher view)
 * GET /api/submissions/assessment/:assessmentId
 */
exports.getAssessmentSubmissions = async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const { firestore } = require("../config/firebase");

    const submissions = await Submission.find({ assessmentId })
      .sort({ submittedAt: -1 })
      .lean();

    // Enrich with student names from Firebase
    const enrichedSubmissions = await Promise.all(submissions.map(async (submission) => {
      let studentName = 'Unknown Student';
      let studentEmail = '';

      try {
        const studentDoc = await firestore.collection('users').doc(submission.studentId).get();
        if (studentDoc.exists) {
          const studentData = studentDoc.data();
          studentName = studentData.name || studentData.email || 'Unknown Student';
          studentEmail = studentData.email || '';
        }
      } catch (error) {
        console.warn(`Could not fetch student data for ${submission.studentId}`);
      }

      return {
        ...submission,
        studentName,
        studentEmail
      };
    }));

    res.json({
      success: true,
      submissions: enrichedSubmissions,
      count: enrichedSubmissions.length,
      stats: {
        total: enrichedSubmissions.length,
        graded: enrichedSubmissions.filter(s => s.status === 'graded').length,
        pending: enrichedSubmissions.filter(s => s.status === 'submitted' || s.status === 'late').length,
        late: enrichedSubmissions.filter(s => s.isLate).length
      }
    });

  } catch (error) {
    console.error("❌ Error fetching assessment submissions:", error);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
};

/**
 * Grade a submission (Teacher)
 * PATCH /api/submissions/:submissionId/grade
 */
exports.gradeSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { grade, feedback, teacherId } = req.body;

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    // Validate grade
    if (grade < 0 || grade > submission.maxGrade) {
      return res.status(400).json({ 
        error: `Grade must be between 0 and ${submission.maxGrade}` 
      });
    }

    // Update submission
    submission.grade = grade;
    submission.feedback = feedback || "";
    submission.gradedBy = teacherId;
    submission.gradedAt = new Date();
    submission.status = 'graded';

    await submission.save();

    console.log(`✅ Submission ${submissionId} graded: ${grade}/${submission.maxGrade}`);

    // Send notification to student (async)
    setImmediate(async () => {
      try {
        const { notifySubmissionGraded } = require("../utils/notificationService");
        const assessment = await Assessment.findById(submission.assessmentId);
        await notifySubmissionGraded(submission, assessment, submission.studentId);
      } catch (error) {
        console.warn('⚠️ Failed to send grading notification:', error.message);
      }
    });

    res.json({
      success: true,
      message: "Submission graded successfully",
      submission: {
        id: submission._id,
        grade: submission.grade,
        maxGrade: submission.maxGrade,
        gradePercentage: submission.gradePercentage,
        status: submission.status
      }
    });

  } catch (error) {
    console.error("❌ Error grading submission:", error);
    res.status(500).json({ error: "Failed to grade submission" });
  }
};

function buildFeedbackFromAiReport(report) {
  try {
    const r = report && typeof report === "object" ? report : null;
    if (!r) return "";
    const lines = [];
    const totals = r.totals || {};
    const awarded = totals.awarded ?? null;
    const max = totals.max ?? null;
    if (awarded != null && max != null) {
      lines.push(`AutoMark Report: ${awarded}/${max}`);
    } else {
      lines.push("AutoMark Report");
    }
    lines.push("");

    const qs = Array.isArray(r.questions) ? r.questions : [];
    for (const q of qs) {
      const qk = String(q?.questionKey || "").trim() || "Q";
      const a = q?.awardedMarks;
      const m = q?.maxMarks;
      lines.push(`${qk}: ${a ?? "—"}/${m ?? "—"}`);
      const summary = String(q?.summary || "").trim();
      if (summary) lines.push(`Summary: ${summary}`);
      const strengths = Array.isArray(q?.strengths) ? q.strengths.filter(Boolean) : [];
      if (strengths.length) lines.push(`Strengths: ${strengths.slice(0, 5).join("; ")}`);
      const improvements = Array.isArray(q?.improvements) ? q.improvements.filter(Boolean) : [];
      if (improvements.length) lines.push(`Improvements: ${improvements.slice(0, 5).join("; ")}`);
      lines.push("");
    }
    return lines.join("\n").trim();
  } catch {
    return "";
  }
}

/**
 * Publish AI report to student (finalize grade + feedback + notify).
 * POST /api/submissions/:submissionId/publish-ai
 * Body: { teacherId }
 */
exports.publishAiReport = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const teacherId = String(req.body?.teacherId || "").trim();
    if (!submissionId || !teacherId) {
      return res.status(400).json({ success: false, error: "submissionId and teacherId are required" });
    }

    const submission = await Submission.findById(submissionId);
    if (!submission) return res.status(404).json({ success: false, error: "Submission not found" });
    if (String(submission.teacherId || "") !== teacherId) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    let reportObj = null;
    try {
      reportObj = submission.aiAnalysis ? JSON.parse(String(submission.aiAnalysis)) : null;
    } catch {
      reportObj = null;
    }
    const gradeToSave =
      Number(submission.aiGradingSuggestion ?? reportObj?.totals?.awarded ?? submission.grade ?? 0) || 0;
    const feedback = buildFeedbackFromAiReport(reportObj);

    submission.grade = gradeToSave;
    submission.feedback = feedback || submission.feedback || "";
    submission.gradedBy = teacherId;
    submission.gradedAt = new Date();
    submission.status = "graded";
    await submission.save();

    // Notify student (best-effort)
    setImmediate(async () => {
      try {
        const { notifySubmissionGraded } = require("../utils/notificationService");
        const assessment = await Assessment.findById(submission.assessmentId);
        await notifySubmissionGraded(submission, assessment, submission.studentId);
      } catch (error) {
        console.warn("⚠️ Failed to send publish notification:", error.message);
      }
    });

    return res.status(200).json({
      success: true,
      message: "AI report published to student",
      submission: {
        id: submission._id,
        grade: submission.grade,
        maxGrade: submission.maxGrade,
        status: submission.status,
      },
    });
  } catch (error) {
    console.error("❌ publishAiReport:", error);
    return res.status(500).json({ success: false, error: "Failed to publish AI report", details: error.message });
  }
};

/**
 * Delete a submission (Student - before deadline)
 * DELETE /api/submissions/:submissionId
 */
exports.deleteSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { studentId } = req.body;

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    // Verify student ownership
    if (submission.studentId !== studentId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Don't allow deletion if already graded
    if (submission.status === 'graded') {
      return res.status(400).json({ 
        error: "Cannot delete graded submissions" 
      });
    }

    await Submission.findByIdAndDelete(submissionId);

    console.log(`🗑️ Submission deleted: ${submissionId}`);

    res.json({
      success: true,
      message: "Submission deleted successfully"
    });

  } catch (error) {
    console.error("❌ Error deleting submission:", error);
    res.status(500).json({ error: "Failed to delete submission" });
  }
};

/**
 * Get pending grading count for a teacher (counts published assessments)
 * GET /api/submissions/teacher/:teacherId/pending-count
 */
exports.getTeacherPendingGradingCount = async (req, res) => {
  try {
    const { teacherId } = req.params;

    console.log(`📊 Fetching pending grading count (published assessments) for teacher: ${teacherId}`);

    // Count all published assessments for this teacher
    const pendingCount = await Assessment.countDocuments({
      teacherId,
      status: 'published'
    });

    console.log(`   ✅ Published assessments: ${pendingCount}`);

    res.json({
      success: true,
      pendingCount
    });

  } catch (error) {
    console.error("❌ Error fetching pending grading count:", error);
    res.status(500).json({ 
      error: "Failed to fetch pending grading count",
      details: error.message
    });
  }
};

/**
 * Get all submissions for a teacher (from MongoDB submission collection)
 * GET /api/submissions/teacher/:teacherId
 *
 * Returns flattened "upload-like" entries (one per file) for easy UI rendering.
 */
exports.getTeacherSubmissions = async (req, res) => {
  try {
    const { teacherId } = req.params;
    if (!teacherId) {
      return res.status(400).json({ success: false, error: "teacherId is required" });
    }

    const submissions = await Submission.find({ teacherId })
      .populate("assessmentId", "dueDate dueTime submissionDeadline latePenalty allowLateSubmission")
      .sort({ submittedAt: -1 })
      .lean();

    // Fill missing studentName/studentEmail for older submission docs (Firestore is source of truth)
    const missingStudentIds = Array.from(
      new Set(
        submissions
          .filter((s) => !s?.studentName || String(s.studentName).trim().length === 0)
          .map((s) => String(s.studentId || "").trim())
          .filter(Boolean)
      )
    );

    const studentCache = new Map();
    await Promise.all(
      missingStudentIds.map(async (sid) => {
        try {
          const studentDoc = await firestore.collection("users").doc(sid).get();
          if (studentDoc.exists) {
            const data = studentDoc.data() || {};
            studentCache.set(sid, {
              name: data.name || data.displayName || data.email || "",
              email: data.email || "",
            });
          } else {
            studentCache.set(sid, { name: "", email: "" });
          }
        } catch {
          studentCache.set(sid, { name: "", email: "" });
        }
      })
    );

    const msPerDay = 24 * 60 * 60 * 1000;

    const resolveDeadline = (assessment) => {
      if (!assessment) return null;
      if (assessment.submissionDeadline) {
        const d = new Date(assessment.submissionDeadline);
        return Number.isFinite(d.getTime()) ? d : null;
      }
      if (assessment.dueDate && assessment.dueTime) {
        const d = new Date(`${assessment.dueDate}T${assessment.dueTime}`);
        return Number.isFinite(d.getTime()) ? d : null;
      }
      if (assessment.dueDate) {
        const d = new Date(assessment.dueDate);
        return Number.isFinite(d.getTime()) ? d : null;
      }
      return null;
    };

    const computeLate = (sub, fileUploadedAt) => {
      const isLate = Boolean(sub?.isLate);
      if (!isLate) return { lateDays: 0, latePenaltyPerDay: 0, latePenaltyPercent: 0 };

      const assessment = sub.assessmentId;
      const deadline = resolveDeadline(assessment);
      const submittedAt = new Date(fileUploadedAt || sub.submittedAt);
      if (!deadline || !Number.isFinite(submittedAt.getTime())) {
        return { lateDays: 0, latePenaltyPerDay: 0, latePenaltyPercent: 0 };
      }

      // Delay days = ceil((submittedAt - deadline) / 1 day), minimum 1 day when late.
      const diff = submittedAt.getTime() - deadline.getTime();
      const lateDays = diff > 0 ? Math.max(1, Math.ceil(diff / msPerDay)) : 0;
      const latePenaltyPerDay = typeof assessment?.latePenalty === "number" ? assessment.latePenalty : 0;
      const latePenaltyPercent = Math.min(100, latePenaltyPerDay * lateDays);
      return { lateDays, latePenaltyPerDay, latePenaltyPercent };
    };

    const uploads = submissions.flatMap((sub) => {
      const files = Array.isArray(sub.submissionFiles) ? sub.submissionFiles : [];
      const cached = studentCache.get(String(sub.studentId || "").trim());
      const studentName =
        (sub.studentName && String(sub.studentName).trim()) ||
        (cached?.name && String(cached.name).trim()) ||
        "Unknown";
      const studentEmail =
        (sub.studentEmail && String(sub.studentEmail).trim()) ||
        (cached?.email && String(cached.email).trim()) ||
        "";

      return files.map((file, index) => ({
        ...computeLate(sub, file?.uploadedAt),
        _id: `${sub._id}-file-${index}`,
        submissionId: String(sub._id),
        studentId: sub.studentId,
        studentName,
        studentEmail,
        // assessmentId may be populated object; always return the raw Mongo ObjectId string
        assessmentId: String(sub?.assessmentId?._id || sub.assessmentId || ""),
        assessmentTitle: sub.assessmentTitle,
        assessmentType: sub.assessmentType,
        courseId: String(sub.courseId),
        courseCode: sub.courseCode,
        courseName: sub.courseName,
        teacherId: sub.teacherId,
        fileName: file?.filename,
        originalFileName: file?.originalName,
        fileUrl: file?.fileUrl,
        fileSize: file?.fileSize,
        mimeType: file?.mimeType,
        uploadedAt:
          (file?.uploadedAt && new Date(file.uploadedAt).toISOString()) ||
          (sub.submittedAt && new Date(sub.submittedAt).toISOString()),
        uploadedDate: file?.uploadedDate || sub.submissionDate,
        uploadedTime: file?.uploadedTime || sub.submissionTime,
        status: sub.status,
        marks: file?.marks ?? sub.grade ?? null,
        feedback: file?.fileFeedback ?? sub.feedback ?? "",
        isLate: Boolean(sub.isLate),
      }));
    });

    res.json({ success: true, uploads, count: uploads.length });
  } catch (error) {
    console.error("❌ Error fetching teacher submissions:", error);
    res.status(500).json({ success: false, error: "Failed to fetch teacher submissions" });
  }
};

/**
 * Grouped submissions for teacher:
 * GET /api/submissions/teacher/:teacherId/grouped
 *
 * Shape:
 * {
 *   success: true,
 *   courses: [
 *     {
 *       courseCode, courseName, courseId,
 *       types: {
 *         quiz: { assessments: [...], totals: {...} },
 *         assignment: { assessments: [...], totals: {...} }
 *       }
 *     }
 *   ]
 * }
 */
exports.getTeacherSubmissionsGrouped = async (req, res) => {
  try {
    const { teacherId } = req.params;
    if (!teacherId) {
      return res.status(400).json({ success: false, error: "teacherId is required" });
    }

    const submissions = await Submission.find({ teacherId })
      .sort({ submittedAt: -1 })
      .lean();

    // Pull automark status from SubmissionRaw in one query (so UI can show badges).
    const subIds = submissions.map((s) => s?._id).filter(Boolean);
    const rawDocs = await SubmissionRaw.find({ submissionId: { $in: subIds } })
      .select("submissionId automarkStatus automarkError totalAwardedMarks automarkedAt")
      .lean()
      .catch(() => []);
    const rawBySubmissionId = new Map(
      (rawDocs || []).map((r) => [String(r?.submissionId || ""), r])
    );

    // Enrich missing student names from Firestore (bounded + cached).
    const missingStudentIds = Array.from(
      new Set(
        submissions
          .filter((s) => !s?.studentName || String(s.studentName).trim().length === 0)
          .map((s) => String(s.studentId || "").trim())
          .filter(Boolean)
      )
    );

    const studentCache = new Map();
    await Promise.all(
      missingStudentIds.map(async (sid) => {
        try {
          const studentDoc = await firestore.collection("users").doc(sid).get();
          if (studentDoc.exists) {
            const data = studentDoc.data() || {};
            studentCache.set(sid, {
              name: data.name || data.displayName || data.email || "",
              email: data.email || "",
            });
          } else {
            studentCache.set(sid, { name: "", email: "" });
          }
        } catch {
          studentCache.set(sid, { name: "", email: "" });
        }
      })
    );

    // Grouping maps
    const courseMap = new Map();

    const getStudentName = (sub) => {
      const sid = String(sub.studentId || "").trim();
      const cached = studentCache.get(sid);
      return (
        (sub.studentName && String(sub.studentName).trim()) ||
        (cached?.name && String(cached.name).trim()) ||
        "Unknown"
      );
    };

    const normalizeType = (t) => (t === "quiz" ? "quiz" : "assignment");

    for (const sub of submissions) {
      const courseCode = sub.courseCode || "—";
      const courseName = sub.courseName || "";
      const courseId = sub.courseId ? String(sub.courseId) : "";
      const assessmentId = sub.assessmentId ? String(sub.assessmentId?._id || sub.assessmentId) : "";
      const assessmentTitle = sub.assessmentTitle || "";
      const assessmentType = normalizeType(sub.assessmentType);

      const courseKey = `${courseCode}::${courseId || ""}`;
      if (!courseMap.has(courseKey)) {
        courseMap.set(courseKey, {
          courseCode,
          courseName,
          courseId,
          types: {
            quiz: { assessments: [], totals: { assessments: 0, submissions: 0, graded: 0, pending: 0, late: 0 } },
            assignment: { assessments: [], totals: { assessments: 0, submissions: 0, graded: 0, pending: 0, late: 0 } },
          },
          _assessmentIndex: new Map(), // internal: `${type}::${assessmentId}`
        });
      }

      const courseNode = courseMap.get(courseKey);
      const typeNode = courseNode.types[assessmentType];
      const assessKey = `${assessmentType}::${assessmentId}`;

      if (!courseNode._assessmentIndex.has(assessKey)) {
        const newAssessment = {
          assessmentId,
          assessmentTitle,
          assessmentType,
          submissions: [],
          stats: { total: 0, graded: 0, pending: 0, late: 0 },
        };
        typeNode.assessments.push(newAssessment);
        courseNode._assessmentIndex.set(assessKey, newAssessment);
        typeNode.totals.assessments += 1;
      }

      const assessmentNode = courseNode._assessmentIndex.get(assessKey);

      const status = sub.status || "submitted";
      const isGraded = status === "graded";
      const isPending = !isGraded;
      const isLate = Boolean(sub.isLate);

      assessmentNode.submissions.push({
        submissionId: String(sub._id),
        studentId: sub.studentId,
        studentName: getStudentName(sub),
        status,
        isLate,
        submittedAt: sub.submittedAt ? new Date(sub.submittedAt).toISOString() : null,
        uploadedFilesCount: sub.uploadedFilesCount ?? (Array.isArray(sub.submissionFiles) ? sub.submissionFiles.length : 0),
        grade: sub.grade ?? null,
        maxGrade: sub.maxGrade ?? null,
        automarkStatus: rawBySubmissionId.get(String(sub._id))?.automarkStatus || "missing",
        automarkError: rawBySubmissionId.get(String(sub._id))?.automarkError || "",
      });

      assessmentNode.stats.total += 1;
      assessmentNode.stats.graded += isGraded ? 1 : 0;
      assessmentNode.stats.pending += isPending ? 1 : 0;
      assessmentNode.stats.late += isLate ? 1 : 0;

      typeNode.totals.submissions += 1;
      typeNode.totals.graded += isGraded ? 1 : 0;
      typeNode.totals.pending += isPending ? 1 : 0;
      typeNode.totals.late += isLate ? 1 : 0;
    }

    // Sort each assessment submissions by studentId/name (alphabetical).
    const courses = Array.from(courseMap.values()).map((c) => {
      for (const t of ["quiz", "assignment"]) {
        const typeNode = c.types[t];
        for (const a of typeNode.assessments) {
          a.submissions.sort((x, y) => {
            const ax = (String(x.studentId || "") || String(x.studentName || "")).toLowerCase();
            const by = (String(y.studentId || "") || String(y.studentName || "")).toLowerCase();
            return ax.localeCompare(by);
          });
        }
        // Sort assessments by title.
        typeNode.assessments.sort((a, b) => String(a.assessmentTitle || "").localeCompare(String(b.assessmentTitle || "")));
      }
      delete c._assessmentIndex;
      return c;
    });

    // Sort courses by courseCode.
    courses.sort((a, b) => String(a.courseCode || "").localeCompare(String(b.courseCode || "")));

    return res.json({ success: true, teacherId, courses, count: submissions.length });
  } catch (error) {
    console.error("❌ Error fetching grouped teacher submissions:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch grouped teacher submissions" });
  }
};

/**
 * GET /api/submissions/ai-grading/:submissionId?teacherId=...
 * One submission for the AI grading page header (teacher must own it).
 */
exports.getSubmissionForAiGrading = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const teacherId = String(req.query.teacherId || "").trim();
    if (!submissionId || !teacherId) {
      return res.status(400).json({
        success: false,
        error: "submissionId and teacherId query parameter are required",
      });
    }

    const sub = await Submission.findById(submissionId).lean();
    if (!sub) {
      return res.status(404).json({ success: false, error: "Submission not found" });
    }
    if (String(sub.teacherId || "") !== teacherId) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    let studentName = String(sub.studentName || "").trim();
    let studentEmail = String(sub.studentEmail || "").trim();
    if (!studentName && sub.studentId) {
      try {
        const studentDoc = await firestore.collection("users").doc(String(sub.studentId)).get();
        if (studentDoc.exists) {
          const data = studentDoc.data() || {};
          studentName = String(data.name || data.displayName || data.email || "").trim();
          if (!studentEmail) studentEmail = String(data.email || "").trim();
        }
      } catch (_) {
        /* ignore */
      }
    }
    if (!studentName) {
      studentName = studentEmail || String(sub.studentId || "");
    }

    const assessmentIdRaw = sub.assessmentId;
    const assessmentId =
      assessmentIdRaw && typeof assessmentIdRaw === "object" && assessmentIdRaw._id
        ? String(assessmentIdRaw._id)
        : String(assessmentIdRaw || "");

    const submittedAtIso = sub.submittedAt ? new Date(sub.submittedAt).toISOString() : null;
    const submittedDisplay =
      sub.submissionDate && sub.submissionTime
        ? `${sub.submissionDate} ${sub.submissionTime}`
        : submittedAtIso
          ? new Date(submittedAtIso).toLocaleString()
          : "";

    let raw = await SubmissionRaw.findOne({ submissionId: sub._id })
      .select("automarkStatus automarkError automarkedAt totalAwardedMarks perQuestionScores automarkReport")
      .lean()
      .catch(() => null);

    // Auto-backfill SubmissionRaw for legacy rows:
    // If Submission is graded and has aiAnalysis, but SubmissionRaw is missing or still "missing",
    // rebuild SubmissionRaw automark fields from aiAnalysis so AI Grading page stays consistent.
    try {
      const status = String(raw?.automarkStatus || "missing");
      const shouldBackfill = (!raw || status === "missing") && Boolean(String(sub.aiAnalysis || "").trim());
      if (shouldBackfill) {
        const report = parseAiAnalysisToReport(sub.aiAnalysis);
        if (report && typeof report === "object") {
          const perQuestionScores = buildPerQuestionScoresFromReport(report);
          await SubmissionRaw.findOneAndUpdate(
            { submissionId: sub._id },
            {
              $setOnInsert: { submissionId: sub._id },
              $set: {
                assessmentId: sub.assessmentId || null,
                courseId: sub.courseId || null,
                teacherId: String(sub.teacherId || ""),
                studentId: String(sub.studentId || ""),
                studentEmail: studentEmail || "",
                automarkStatus: "completed",
                automarkError: "",
                automarkedAt: new Date(),
                automarkReport: report,
                perQuestionScores,
                totalAwardedMarks: Number(report?.totals?.awarded ?? 0) || 0,
              },
            },
            { upsert: true }
          ).catch(() => {});

          raw = await SubmissionRaw.findOne({ submissionId: sub._id })
            .select("automarkStatus automarkError automarkedAt totalAwardedMarks perQuestionScores automarkReport")
            .lean()
            .catch(() => raw);
        }
      }
    } catch {
      // best-effort only
    }

    return res.status(200).json({
      success: true,
      submission: {
        _id: String(sub._id),
        studentId: sub.studentId,
        studentName,
        studentEmail,
        assessmentId,
        assessmentTitle: sub.assessmentTitle || "",
        assessmentType: sub.assessmentType === "quiz" ? "quiz" : "assignment",
        courseCode: sub.courseCode || "",
        courseName: sub.courseName || "",
        submittedAt: submittedAtIso,
        submittedDisplay,
        submissionDate: sub.submissionDate || "",
        submissionTime: sub.submissionTime || "",
        status: sub.status || "submitted",
        isLate: Boolean(sub.isLate),
        grade: sub.grade ?? null,
        maxGrade: typeof sub.maxGrade === "number" ? sub.maxGrade : null,
        feedback: sub.feedback || "",
        aiGradingSuggestion: sub.aiGradingSuggestion ?? null,
        aiConfidence: sub.aiConfidence ?? null,
        aiAnalysis: sub.aiAnalysis ?? null,
      },
      submissionRaw: raw
        ? {
            automarkStatus: raw.automarkStatus || "missing",
            automarkError: raw.automarkError || "",
            automarkedAt: raw.automarkedAt ? new Date(raw.automarkedAt).toISOString() : null,
            totalAwardedMarks: typeof raw.totalAwardedMarks === "number" ? raw.totalAwardedMarks : null,
            perQuestionScores: Array.isArray(raw.perQuestionScores) ? raw.perQuestionScores : [],
            automarkReport: raw.automarkReport || null,
          }
        : {
            automarkStatus: "missing",
            automarkError: "",
            automarkedAt: null,
            totalAwardedMarks: null,
            perQuestionScores: [],
            automarkReport: null,
          },
    });
  } catch (error) {
    console.error("❌ getSubmissionForAiGrading:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to load submission for AI grading",
      details: error.message,
    });
  }
};

/**
 * GET /api/submissions/:submissionId/content?teacherId=...
 * Returns submission files grouped for the AI grading tabs:
 * - text: submissionText + extracted rawText (best-effort from SubmissionRaw)
 * - code: .py / code-like files
 * - graphical: images (jpg/png)
 *
 * NOTE: This endpoint does not run extraction; it just returns stored metadata + URLs.
 */
exports.getSubmissionContent = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const teacherId = String(req.query.teacherId || "").trim();
    if (!submissionId || !teacherId) {
      return res.status(400).json({ success: false, error: "submissionId and teacherId query parameter are required" });
    }

    const sub = await Submission.findById(submissionId).lean();
    if (!sub) return res.status(404).json({ success: false, error: "Submission not found" });
    if (String(sub.teacherId || "") !== teacherId) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const raw = await SubmissionRaw.findOne({ submissionId: sub._id }).lean().catch(() => null);

    const files = Array.isArray(sub.submissionFiles) ? sub.submissionFiles : [];
    const baseUrl = "http://localhost:5000";

    const normalizeUrl = (u) => {
      if (!u) return null;
      const s = String(u);
      if (s.startsWith("http")) return s;
      return `${baseUrl}${s.startsWith("/") ? "" : "/"}${s}`;
    };

    const mappedFiles = files.map((f, idx) => {
      const originalName = f?.originalName || f?.filename || `file-${idx + 1}`;
      const mimeType = f?.mimeType || "";
      const fileUrl = f?.fileUrl || "";

      const nameLower = String(originalName).toLowerCase();
      const ext = path.extname(nameLower);
      const isImage = mimeType.startsWith("image/") || [".jpg", ".jpeg", ".png"].includes(ext);
      const isCode =
        [".py", ".java", ".js", ".ts", ".tsx", ".c", ".cpp", ".h", ".hpp", ".cs", ".go", ".rb", ".php", ".rs", ".kt", ".swift"].includes(
          ext
        ) ||
        ["text/x-python", "text/x-java-source", "text/x-java", "application/java", "text/x-c", "text/x-c++"].includes(mimeType);

      const category = isCode ? "code" : isImage ? "graphical" : "text";

      return {
        id: `${sub._id}::${idx}`,
        originalName,
        filename: f?.filename || "",
        mimeType,
        fileSize: f?.fileSize ?? null,
        fileUrl: normalizeUrl(fileUrl),
        uploadedAt: f?.uploadedAt ? new Date(f.uploadedAt).toISOString() : null,
        category,
      };
    });

    const grouped = {
      text: mappedFiles.filter((f) => f.category === "text"),
      code: mappedFiles.filter((f) => f.category === "code"),
      graphical: mappedFiles.filter((f) => f.category === "graphical"),
    };

    const contentTypes =
      raw && Array.isArray(raw.contentTypes) && raw.contentTypes.length > 0
        ? raw.contentTypes
        : [
            ...(grouped.text.length > 0 || String(sub.submissionText || "").trim() ? ["text"] : []),
            ...(grouped.code.length > 0 ? ["code"] : []),
            ...(grouped.graphical.length > 0 ? ["graphical"] : []),
          ];

    return res.status(200).json({
      success: true,
      submissionId: String(sub._id),
      submissionText: String(sub.submissionText || ""),
      extraction: raw
        ? {
            status: raw.extractionStatus || "pending",
            rawText: String(raw.rawText || ""),
            extractor: raw.extractor || "",
            pageCount: raw.pageCount ?? 0,
            visualCount: raw.visualCount ?? 0,
            contentTypes,
            hasVisual: Number(raw.visualCount ?? 0) > 0,
            ocrEnabled: Boolean(raw.ocrEnabled),
            ocrStatus: raw.ocrStatus || "",
            extractionError: raw.extractionError || "",
          }
        : {
            status: "pending",
            rawText: "",
            extractor: "",
            pageCount: 0,
            visualCount: 0,
            contentTypes,
            hasVisual: grouped.graphical.length > 0,
            ocrEnabled: false,
            ocrStatus: "",
            extractionError: "",
          },
      files: mappedFiles,
      grouped,
    });
  } catch (error) {
    console.error("❌ getSubmissionContent:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to load submission content",
      details: error.message,
    });
  }
};

/**
 * POST /api/submissions/:submissionId/prepare-review
 * Teacher-owned helper: kicks off extraction/FAISS ingestion if needed.
 *
 * Body: { teacherId: string, force?: boolean }
 */
exports.prepareSubmissionForReview = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const teacherId = String(req.body?.teacherId || "").trim();
    const force = Boolean(req.body?.force);
    if (!submissionId || !teacherId) {
      return res.status(400).json({ success: false, error: "submissionId and teacherId are required" });
    }

    const sub = await Submission.findById(submissionId);
    if (!sub) return res.status(404).json({ success: false, error: "Submission not found" });
    if (String(sub.teacherId || "") !== teacherId) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const raw = await SubmissionRaw.findOne({ submissionId: sub._id }).lean().catch(() => null);
    const extractionStatus = raw?.extractionStatus || "pending";
    const faissStatus = raw?.faissIngestionStatus || sub.faissIngestionStatus || "pending";

    const shouldRun =
      force ||
      extractionStatus === "pending" ||
      faissStatus === "pending" ||
      faissStatus === "failed" ||
      extractionStatus === "failed";

    if (!shouldRun) {
      return res.status(200).json({
        success: true,
        queued: false,
        message: "Submission already prepared",
        status: { extractionStatus, faissStatus },
      });
    }

    // Mark as pending_review so teacher list updates.
    if (sub.status !== "graded") {
      sub.status = "pending_review";
      await sub.save().catch(() => {});
    }

    // Kick ingestion in background (do not block request).
    setImmediate(async () => {
      const subId = String(sub._id);
      try {
        await SubmissionRaw.findOneAndUpdate(
          { submissionId: sub._id },
          {
            $setOnInsert: { submissionId: sub._id },
            $set: {
              assessmentId: sub.assessmentId,
              courseId: sub.courseId,
              teacherId: sub.teacherId,
              studentId: sub.studentId,
              extractionStatus: "pending",
              extractionError: "",
              faissIngestionStatus: "pending",
              faissIngestionError: "",
            },
          },
          { upsert: true, new: true }
        );

        await Submission.findByIdAndUpdate(subId, { $set: { faissIngestionStatus: "pending", faissIngestionError: "" } });

        const startedAt = Date.now();
        const result = await ingestSubmission(subId, { enableOcr: true });
        const durationMs = Date.now() - startedAt;
        const chunks = Number(result?.total_chunks_created ?? result?.chunks ?? 0) || 0;
        const embeddings = Number(result?.total_embeddings_created ?? result?.total_vectors_created ?? chunks) || 0;

        await Submission.findByIdAndUpdate(subId, {
          $set: {
            faissIngestionStatus: "completed",
            faissChunkCount: chunks,
            faissIngestionError: "",
            faissIngestedAt: new Date(),
          },
        });

        await SubmissionRaw.findOneAndUpdate(
          { submissionId: sub._id },
          {
            $set: {
              faissIngestionStatus: "completed",
              faissChunkCount: chunks,
              numChunks: chunks,
              numEmbeddings: embeddings,
              faissIngestionDurationMs: durationMs,
              faissIngestionError: "",
              faissIngestedAt: new Date(),
              extractionStatus: result?.raw_text || (Array.isArray(result?.content_types) && result.content_types.length) ? "completed" : "skipped",
              extractor: result?.extractor || "",
              rawText: result?.raw_text || "",
              charCount: typeof result?.raw_text === "string" ? result.raw_text.length : 0,
              pageCount: Number(result?.page_count ?? 0) || 0,
              pageMetadata: Array.isArray(result?.page_metadata) ? result.page_metadata : [],
              visualCount: Number(result?.visual_count ?? 0) || 0,
              equationCount: Number(result?.equation_count ?? 0) || 0,
              ocrEnabled: Boolean(result?.ocr_enabled),
              ocrStatus: result?.ocr_status || "",
              ocrError: result?.ocr_error || "",
              ocrCount: Number(result?.ocr_count ?? 0) || 0,
              ocrCharCount: Number(result?.ocr_char_count ?? 0) || 0,
              extractionError: "",
              extractedAt: new Date(),
            },
          }
        );
      } catch (e) {
        await Submission.findByIdAndUpdate(subId, {
          $set: { faissIngestionStatus: "failed", faissIngestionError: e?.message || String(e) },
        }).catch(() => {});

        await SubmissionRaw.findOneAndUpdate(
          { submissionId: sub._id },
          {
            $set: {
              faissIngestionStatus: "failed",
              faissIngestionError: e?.message || String(e),
              extractionStatus: "failed",
              extractionError: e?.message || String(e),
            },
          }
        ).catch(() => {});
      }
    });

    return res.status(202).json({
      success: true,
      queued: true,
      message: "Preparation started (extraction/ingestion queued)",
      status: { extractionStatus, faissStatus },
    });
  } catch (error) {
    console.error("❌ prepareSubmissionForReview:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to prepare submission for review",
      details: error.message,
    });
  }
};

/**
 * POST /api/submissions/:submissionId/automark
 * Teacher-owned; runs an AI grading pass and stores results as suggestion fields.
 *
 * Body: { teacherId: string, forceReingest?: boolean, skipReingest?: boolean }
 */
exports.automarkSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const teacherId = String(req.body?.teacherId || "").trim();
    const forceReingest = Boolean(req.body?.forceReingest);
    const skipReingest = Boolean(req.body?.skipReingest);

    if (!submissionId || !teacherId) {
      return res.status(400).json({ success: false, error: "submissionId and teacherId are required" });
    }

    const sub = await Submission.findById(submissionId);
    if (!sub) return res.status(404).json({ success: false, error: "Submission not found" });
    if (String(sub.teacherId || "") !== teacherId) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    // Ensure submission chunks exist for retrieval (best-effort).
    // If skipReingest is set, we do NOT run ingestion (re-mark only).
    if (!skipReingest && (forceReingest || (sub.faissIngestionStatus !== "completed" && sub.faissIngestionStatus !== "skipped"))) {
      try {
        await ingestSubmission(String(sub._id), { enableOcr: true });
        await Submission.updateOne(
          { _id: sub._id },
          { $set: { faissIngestionStatus: "completed", faissIngestionError: "", faissIngestedAt: new Date() } }
        );
      } catch (e) {
        console.warn("[AUTOMARK] Submission ingestion failed (continuing):", e?.message || String(e));
      }
    }

    const assessmentId = String(sub.assessmentId || "").trim();
    if (!assessmentId) {
      return res.status(400).json({ success: false, error: "Submission is missing assessmentId" });
    }

    const assessment = await Assessment.findById(assessmentId)
      .populate({ path: "questions", populate: { path: "cloId" } })
      .lean();
    if (!assessment) return res.status(404).json({ success: false, error: "Assessment not found" });

    const questions = Array.isArray(assessment.questions) ? assessment.questions : [];
    if (questions.length === 0) {
      return res.status(400).json({ success: false, error: "Assessment has no questions to grade" });
    }

    // Shared LLM path with batch AutoMark (Ollama prompt, timeouts, course materials, mistakes/spans).
    const report = await automarkOneSubmission(sub, assessment, questions, null);
    const avgConfidence = report.confidence;

    try {
      const perQuestionScores = buildPerQuestionScoresFromReport(report);

      await SubmissionRaw.findOneAndUpdate(
        { submissionId: sub._id },
        {
          $setOnInsert: { submissionId: sub._id },
          $set: {
            assessmentId: sub.assessmentId,
            courseId: sub.courseId || null,
            teacherId,
            studentId: String(sub.studentId || ""),
            automarkStatus: "completed",
            automarkError: "",
            automarkedAt: new Date(),
            automarkReport: report,
            perQuestionScores,
            totalAwardedMarks: Number(report?.totals?.awarded ?? 0) || 0,
          },
        },
        { upsert: true }
      ).catch(() => {});
    } catch (e) {
      console.warn("[AUTOMARK] Failed to persist SubmissionRaw automark fields:", e?.message || String(e));
    }

    return res.status(200).json({
      success: true,
      message: "AutoMark completed",
      suggestion: {
        grade: report.totals.awarded,
        maxGrade: report.totals.max,
        confidence: avgConfidence,
      },
      report,
    });
  } catch (error) {
    console.error("❌ automarkSubmission:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to automark submission",
      details: error.message,
    });
  }
};

/**
 * Get recent student submissions from student_uploads folder
 * GET /api/submissions/recent
 * Query params: limit (default: 10), teacherId (optional - filter by teacher)
 */
exports.getRecentSubmissions = async (req, res) => {
  try {
    const studentUploadsDir = path.join(__dirname, "../uploads/student_uploads");
    const limit = parseInt(req.query.limit) || 10;
    const teacherId = req.query.teacherId;

    console.log(`📂 Fetching recent submissions from: ${studentUploadsDir}`);

    // Check if directory exists
    if (!fs.existsSync(studentUploadsDir)) {
      console.warn(`⚠️ Student uploads directory not found: ${studentUploadsDir}`);
      return res.json({
        success: true,
        submissions: [],
        count: 0
      });
    }

    // Read all files from student_uploads directory
    const files = fs.readdirSync(studentUploadsDir);
    console.log(`   📁 Found ${files.length} files in student_uploads`);

    // Get file stats and create submissions list
    const submissions = files
      .map((filename) => {
        try {
          const filePath = path.join(studentUploadsDir, filename);
          const stats = fs.statSync(filePath);
          
          // Parse filename: submission-timestamp-randomstring-originalname
          // Example: submission-1776616330632-101833650-Hamza_Awan_ML_Quiz1.docx
          const filenameParts = filename.split('-');
          
          let studentName = "Unknown";
          let courseName = "Unknown";
          let assessmentName = "Unknown";
          
          // Try to extract info from filename
          if (filenameParts.length >= 3) {
            // Skip 'submission' prefix, timestamp, and randomstring
            const originalNamePart = filenameParts.slice(3).join('-');
            
            // Try to parse: StudentName_StudentName_CourseCode_Assessment.ext or similar patterns
            const nameWithoutExt = originalNamePart.replace(/\.[^/.]+$/, '');
            const parts = nameWithoutExt.split('_');
            
            if (parts.length >= 2) {
              // Assume first parts are student name
              studentName = parts.slice(0, -1).join(' ') || "Unknown";
              assessmentName = parts[parts.length - 1] || "Unknown";
            } else {
              assessmentName = nameWithoutExt;
            }
          }
          
          return {
            filename,
            originalName: filename,
            studentName,
            assessmentName,
            fileSize: stats.size,
            uploadedAt: stats.mtime,
            uploadedAtFormatted: stats.mtime.toISOString(),
            type: path.extname(filename).toLowerCase(),
            status: 'submitted'
          };
        } catch (error) {
          console.warn(`⚠️ Error processing file ${filename}:`, error.message);
          return null;
        }
      })
      .filter(sub => sub !== null)
      // Sort by upload time (newest first)
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      // Limit to requested count
      .slice(0, limit)
      // Map to cleaner format
      .map((sub, index) => ({
        id: index,
        filename: sub.filename,
        studentName: sub.studentName,
        assessmentName: sub.assessmentName,
        fileSize: sub.fileSize,
        fileSizeFormatted: formatFileSize(sub.fileSize),
        uploadedAt: sub.uploadedAtFormatted,
        type: sub.type,
        status: sub.status,
        downloadUrl: `/api/submissions/file/${sub.filename}`
      }));

    console.log(`   ✅ Returned ${submissions.length} recent submissions`);

    res.json({
      success: true,
      submissions,
      count: submissions.length
    });

  } catch (error) {
    console.error("❌ Error fetching recent submissions:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch recent submissions",
      details: error.message
    });
  }
};

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get student's submissions from student_uploads folder (for student dashboard)
 * GET /api/submissions/student/:studentId/my-uploads
 */
exports.getStudentMyUploads = async (req, res) => {
  try {
    const { studentId } = req.params;
    const studentUploadsDir = path.join(__dirname, "../uploads/student_uploads");
    
    console.log(`📄 Fetching uploads for student: ${studentId}`);

    // First try to get from database (Upload collection via uploadUtils)
    try {
      const uploadUtils = require("../utils/uploadUtils");
      const dbUploads = await uploadUtils.getStudentUploads(studentId);
      
      if (dbUploads && dbUploads.length > 0) {
        console.log(`   ✅ Found ${dbUploads.length} submissions in database`);
        return res.json({
          success: true,
          submissions: dbUploads.map(upload => ({
            _id: upload._id,
            filename: upload.fileName,
            originalName: upload.originalFileName,
            assessmentTitle: upload.assessmentTitle,
            assessmentName: upload.assessmentTitle,
            courseCode: upload.courseCode,
            courseName: upload.courseName,
            fileSize: upload.fileSize,
            fileSizeFormatted: formatFileSize(upload.fileSize),
            mimeType: upload.mimeType,
            uploadedAt: upload.uploadedAt?.toISOString?.() || upload.uploadedAt,
            uploadedDate: upload.uploadedDate,
            uploadedTime: upload.uploadedTime,
            status: upload.status,
            isLate: upload.isLate,
            downloadUrl: upload.fileUrl || `/api/submissions/file/${upload.fileName}`,
            type: path.extname(upload.fileName).toLowerCase()
          })),
          count: dbUploads.length,
          source: 'database'
        });
      }
    } catch (error) {
      console.warn(`⚠️ Error fetching from database:`, error.message);
    }

    // Fallback: Search file system for student's files
    console.log(`   📂 Checking file system for student uploads in: ${studentUploadsDir}`);
    
    if (!fs.existsSync(studentUploadsDir)) {
      return res.json({
        success: true,
        submissions: [],
        count: 0,
        source: 'filesystem'
      });
    }

    const files = fs.readdirSync(studentUploadsDir);
    
    // Filter files that might belong to this student
    // Since filenames don't include student ID, we'll return all recent files for now
    // In production, you might want to query the database for the student's uploaded files
    const submissions = files
      .map((filename) => {
        try {
          const filePath = path.join(studentUploadsDir, filename);
          const stats = fs.statSync(filePath);
          
          // Try to parse filename to extract info
          const filenameParts = filename.split('-');
          let assessmentName = "Unknown";
          
          if (filenameParts.length >= 3) {
            const originalNamePart = filenameParts.slice(3).join('-');
            assessmentName = originalNamePart.replace(/\.[^/.]+$/, '');
          }
          
          return {
            _id: filename,
            filename: filename,
            originalName: filename,
            assessmentTitle: assessmentName,
            assessmentName: assessmentName,
            fileSize: stats.size,
            fileSizeFormatted: formatFileSize(stats.size),
            mimeType: 'application/octet-stream',
            uploadedAt: stats.mtime.toISOString(),
            uploadedDate: stats.mtime.toLocaleDateString(),
            uploadedTime: stats.mtime.toLocaleTimeString(),
            status: 'submitted',
            isLate: false,
            downloadUrl: `/api/submissions/file/${filename}`,
            type: path.extname(filename).toLowerCase()
          };
        } catch (error) {
          console.warn(`⚠️ Error processing file ${filename}:`, error.message);
          return null;
        }
      })
      .filter(sub => sub !== null)
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    console.log(`   ✅ Found ${submissions.length} submissions from file system`);

    res.json({
      success: true,
      submissions,
      count: submissions.length,
      source: 'filesystem',
      note: 'Consider implementing proper student-file association in database'
    });

  } catch (error) {
    console.error("❌ Error fetching student uploads:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch student uploads",
      details: error.message
    });
  }
};

/**
 * Get all submissions (Admin database view)
 * GET /api/submissions/all
 */
exports.getAllSubmissions = async (req, res) => {
  try {
    console.log(`📊 Fetching all submissions for admin database`);
    
    const submissions = await Submission.find({})
      .populate('assessmentId', 'title type totalMarks')
      .populate('courseId', 'courseCode courseTitle')
      .sort({ submittedAt: -1 })
      .lean();

    console.log(`   ✅ Found ${submissions.length} total submissions`);

    res.json({
      success: true,
      submissions,
      count: submissions.length,
      stats: {
        total: submissions.length,
        graded: submissions.filter(s => s.status === 'graded').length,
        pending: submissions.filter(s => s.status === 'submitted' || s.status === 'late').length,
        late: submissions.filter(s => s.isLate).length
      }
    });

  } catch (error) {
    console.error("❌ Error fetching all submissions:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch submissions" 
    });
  }
};

