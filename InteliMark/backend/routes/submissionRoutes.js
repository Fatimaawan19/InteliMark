const express = require("express");
const submissionController = require("../controllers/submissionController");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// Create student uploads directory if it doesn't exist
const studentUploadsDir = path.join(__dirname, "../uploads/student_uploads");
if (!fs.existsSync(studentUploadsDir)) {
  fs.mkdirSync(studentUploadsDir, { recursive: true });
  console.log("✅ Created student uploads directory:", studentUploadsDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, studentUploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: timestamp-randomstring-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const nameWithoutExt = path.basename(file.originalname, ext);
    cb(null, `submission-${uniqueSuffix}-${nameWithoutExt}${ext}`);
  }
});

// File filter - only allow PDF, images, and documents
const fileFilter = (req, file, cb) => {
  const allowedExts = new Set([
    '.pdf',
    '.doc',
    '.docx',
    '.jpg',
    '.jpeg',
    '.png',
    '.py',
  ]);

  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!allowedExts.has(ext)) {
    cb(new Error(`Only PDF, DOC, DOCX, JPG, JPEG, PNG, and PY files are allowed.`), false);
    return;
  }

  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    // Python source files
    'text/x-python',
    // Some browsers may send .py as plain text
    'text/plain'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Only PDF, DOC, DOCX, JPG, JPEG, PNG, and PY files are allowed.`), false);
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 5 // Maximum 5 files per submission
  }
});

const handleSubmissionUpload = (req, res, next) => {
  upload.array('files', 5)(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          errorCode: 'FILE_TOO_LARGE',
          error: 'Each file must be 10MB or less.'
        });
      }

      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          success: false,
          errorCode: 'TOO_MANY_FILES',
          error: 'Maximum 5 files are allowed per submission.'
        });
      }
    }

    return res.status(400).json({
      success: false,
      errorCode: 'INVALID_FILE_TYPE',
      error: err.message || 'Invalid upload request.'
    });
  });
};

// ==================== SUBMISSION ROUTES ====================

/**
 * Submit an assessment
 * POST /api/submissions/submit
 * Body: { assessmentId, studentId, submissionText, courseCode }
 * Files: Multiple files (max 5, max 10MB each)
 */
router.post("/submit", handleSubmissionUpload, submissionController.submitAssessment);

/**
 * Get all submissions (Admin database view)
 * GET /api/submissions/all
 */
router.get("/all", submissionController.getAllSubmissions);

/**
 * Get recent student submissions from student_uploads folder
 * GET /api/submissions/recent
 */
router.get("/recent", submissionController.getRecentSubmissions);

/**
 * Get pending grading count for a teacher
 * GET /api/submissions/teacher/:teacherId/pending-count
 */
router.get("/teacher/:teacherId/pending-count", submissionController.getTeacherPendingGradingCount);

/**
 * Get all submissions for a teacher (real-time source: MongoDB "submission" collection)
 * GET /api/submissions/teacher/:teacherId
 */
router.get("/teacher/:teacherId", submissionController.getTeacherSubmissions);

/**
 * Grouped view for teacher submissions:
 * Course → Type → Assessment → Submissions (+ counts)
 * GET /api/submissions/teacher/:teacherId/grouped
 */
router.get("/teacher/:teacherId/grouped", submissionController.getTeacherSubmissionsGrouped);

/**
 * AI grading page — single submission header (teacher-owned)
 * GET /api/submissions/ai-grading/:submissionId?teacherId=...
 */
router.get("/ai-grading/:submissionId", submissionController.getSubmissionForAiGrading);

/**
 * Run AutoMark for a submission (teacher-owned).
 * POST /api/submissions/:submissionId/automark
 * Body: { teacherId, forceReingest?: boolean }
 */
router.post("/:submissionId/automark", submissionController.automarkSubmission);

/**
 * Get submission content/files for AI grading view (teacher-owned).
 * GET /api/submissions/:submissionId/content?teacherId=...
 */
router.get("/:submissionId/content", submissionController.getSubmissionContent);

/**
 * Prepare submission for review (teacher-owned).
 * Ensures extraction/FAISS ingestion has run so tabs can show content.
 * POST /api/submissions/:submissionId/prepare-review
 * Body: { teacherId, force?: boolean }
 */
router.post("/:submissionId/prepare-review", submissionController.prepareSubmissionForReview);

/**
 * Publish the AI report to the student (single submission).
 * This finalizes grade/feedback/status and triggers notification.
 *
 * POST /api/submissions/:submissionId/publish-ai
 * Body: { teacherId }
 */
router.post("/:submissionId/publish-ai", submissionController.publishAiReport);

/**
 * Get student's submissions (My Uploads) - must be before /student/:studentId
 * GET /api/submissions/my-uploads/:studentId
 */
router.get("/my-uploads/:studentId", submissionController.getStudentMyUploads);

/**
 * Get all submissions for a student
 * GET /api/submissions/student/:studentId
 */
router.get("/student/:studentId", submissionController.getStudentSubmissions);

/**
 * Get submission for a specific assessment by a student
 * GET /api/submissions/assessment/:assessmentId/student/:studentId
 */
router.get("/assessment/:assessmentId/student/:studentId", submissionController.getSubmissionByAssessment);

/**
 * Get all submissions for an assessment (Teacher view)
 * GET /api/submissions/assessment/:assessmentId
 */
router.get("/assessment/:assessmentId", submissionController.getAssessmentSubmissions);

/**
 * Grade a submission (Teacher)
 * PATCH /api/submissions/:submissionId/grade
 * Body: { grade, feedback, teacherId }
 */
router.patch("/:submissionId/grade", submissionController.gradeSubmission);

/**
 * Delete a submission (Student - before grading)
 * DELETE /api/submissions/:submissionId
 * Body: { studentId }
 */
router.delete("/:submissionId", submissionController.deleteSubmission);

// ==================== FILE SERVING ====================

/**
 * Serve submission files
 * GET /api/submissions/file/:filename
 */
router.get("/file/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(studentUploadsDir, filename);

  // Security: Prevent directory traversal
  if (!filePath.startsWith(studentUploadsDir)) {
    return res.status(403).json({ error: "Access denied" });
  }

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.warn(`Submission file not found: ${filePath}`);
    return res.status(404).json({ error: "File not found" });
  }

  // Determine content type based on extension
  const ext = path.extname(filename).toLowerCase();
  const contentTypeMap = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };

  const contentType = contentTypeMap[ext] || 'application/octet-stream';

  // Set headers
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'public, max-age=3600');

  // Send file
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error("Error sending submission file:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to download file" });
      }
    }
  });
});

module.exports = router;
