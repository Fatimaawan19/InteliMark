const express = require("express");
const router = express.Router();
const uploadUtils = require("../utils/uploadUtils");

/**
 * Get all uploads for a student
 * GET /api/uploads/student/:studentId
 */
router.get("/student/:studentId", async (req, res) => {
  try {
    const { studentId } = req.params;
    console.log(`🔍 Fetching uploads for student: ${studentId}`);
    
    const uploads = await uploadUtils.getStudentUploads(studentId);
    
    console.log(`✅ Found ${uploads.length} uploads for student ${studentId}`);
    
    res.json({
      success: true,
      uploads,
      count: uploads.length
    });
  } catch (error) {
    console.error(`❌ Error fetching student uploads for ${studentId}:`, error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch student uploads" 
    });
  }
});

/**
 * Get all uploads for a specific assessment
 * GET /api/uploads/assessment/:assessmentId
 */
router.get("/assessment/:assessmentId", async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const uploads = await uploadUtils.getAssessmentUploads(assessmentId);
    
    res.json({
      success: true,
      uploads,
      count: uploads.length
    });
  } catch (error) {
    console.error("Error fetching assessment uploads:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch assessment uploads" 
    });
  }
});

/**
 * Get all uploads for a course
 * GET /api/uploads/course/:courseId?assessmentId=xxx&type=assignment
 */
router.get("/course/:courseId", async (req, res) => {
  try {
    const { courseId } = req.params;
    const { assessmentId, type, status, studentId } = req.query;
    
    const filter = {};
    if (assessmentId) filter.assessmentId = assessmentId;
    if (type) filter.assessmentType = type;
    if (status) filter.status = status;
    if (studentId) filter.studentId = studentId;
    
    const uploads = await uploadUtils.getCourseUploads(courseId, filter);
    
    res.json({
      success: true,
      uploads,
      count: uploads.length
    });
  } catch (error) {
    console.error("Error fetching course uploads:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch course uploads" 
    });
  }
});

/**
 * Get all uploads for a teacher
 * GET /api/uploads/teacher/:teacherId?assessmentId=xxx&courseId=xxx
 */
router.get("/teacher/:teacherId", async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { assessmentId, courseId, status } = req.query;
    
    const filter = {};
    if (assessmentId) filter.assessmentId = assessmentId;
    if (courseId) filter.courseId = courseId;
    if (status) filter.status = status;
    
    const uploads = await uploadUtils.getTeacherUploads(teacherId, filter);
    
    res.json({
      success: true,
      uploads,
      count: uploads.length
    });
  } catch (error) {
    console.error("Error fetching teacher uploads:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch teacher uploads" 
    });
  }
});

/**
 * Get all uploads (Admin database management)
 * GET /api/uploads/all
 */
router.get("/all", async (req, res) => {
  try {
    const uploads = await uploadUtils.getAllUploads();

    res.json({
      success: true,
      uploads,
      count: uploads.length
    });
  } catch (error) {
    console.error("Error fetching all uploads:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch uploads"
    });
  }
});

/**
 * Get upload by ID
 * GET /api/uploads/:uploadId
 */
router.get("/:uploadId", async (req, res) => {
  const { uploadId } = req.params;
  
  // Skip if this is a special route (all, debug/all, etc.)
  if (uploadId === "all" || uploadId.startsWith("debug") || uploadId.startsWith("stats") || uploadId.startsWith("search")) {
    return res.status(404).json({ success: false, error: "Route not found" });
  }

  try {
    const upload = await uploadUtils.getUploadById(uploadId);
    
    if (!upload) {
      return res.status(404).json({ 
        success: false,
        error: "Upload not found" 
      });
    }
    
    // Increment view count
    await uploadUtils.incrementViewCount(uploadId);
    
    res.json({
      success: true,
      upload
    });
  } catch (error) {
    console.error("Error fetching upload:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch upload" 
    });
  }
});

/**
 * Update upload status
 * PATCH /api/uploads/:uploadId/status
 */
router.patch("/:uploadId/status", async (req, res) => {
  try {
    const { uploadId } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ 
        success: false,
        error: "Status is required" 
      });
    }
    
    const upload = await uploadUtils.updateUploadStatus(uploadId, status);
    
    res.json({
      success: true,
      message: "Upload status updated",
      upload
    });
  } catch (error) {
    console.error("Error updating upload status:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to update upload status" 
    });
  }
});

/**
 * Update upload with review notes
 * PATCH /api/uploads/:uploadId/notes
 */
router.patch("/:uploadId/notes", async (req, res) => {
  try {
    const { uploadId } = req.params;
    const { notes, status } = req.body;
    
    if (!notes) {
      return res.status(400).json({ 
        success: false,
        error: "Notes are required" 
      });
    }
    
    const upload = await uploadUtils.updateUploadNotes(uploadId, notes, status);
    
    res.json({
      success: true,
      message: "Upload notes updated",
      upload
    });
  } catch (error) {
    console.error("Error updating upload notes:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to update upload notes" 
    });
  }
});

/**
 * Get upload statistics for a course
 * GET /api/uploads/stats/course/:courseId
 */
router.get("/stats/course/:courseId", async (req, res) => {
  try {
    const { courseId } = req.params;
    const stats = await uploadUtils.getCourseUploadStats(courseId);
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error("Error fetching course upload stats:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch upload statistics" 
    });
  }
});

/**
 * Get upload statistics for an assessment
 * GET /api/uploads/stats/assessment/:assessmentId
 */
router.get("/stats/assessment/:assessmentId", async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const stats = await uploadUtils.getAssessmentUploadStats(assessmentId);
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error("Error fetching assessment upload stats:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch upload statistics" 
    });
  }
});

/**
 * Delete an upload
 * DELETE /api/uploads/:uploadId
 */
router.delete("/:uploadId", async (req, res) => {
  try {
    const { uploadId } = req.params;
    const upload = await uploadUtils.deleteUpload(uploadId);
    
    if (!upload) {
      return res.status(404).json({ 
        success: false,
        error: "Upload not found" 
      });
    }
    
    res.json({
      success: true,
      message: "Upload deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting upload:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to delete upload" 
    });
  }
});

/**
 * Search uploads by student name (diagnostic endpoint)
 * GET /api/uploads/search/by-name/:studentName
 */
router.get("/search/by-name/:studentName", async (req, res) => {
  console.log(`🔍 [uploadRoutes] Searching uploads for student name: ${req.params.studentName}`);
  try {
    const { studentName } = req.params;
    
    // Search by student name (case-insensitive) in Submission collection
    const Submission = require("../models/Submission");
    const submissions = await Submission.find({
      studentName: { $regex: studentName, $options: "i" }
    })
      .populate("assessmentId", "title type")
      .populate("courseId", "courseCode courseName")
      .sort({ submittedAt: -1 })
      .lean();
    
    // Flatten files for backwards compatibility
    const uploads = submissions.flatMap(sub => 
      (sub.submissionFiles || []).map((file, idx) => ({
        _id: `${sub._id}-file-${idx}`,
        submissionId: sub._id,
        studentId: sub.studentId,
        studentName: sub.studentName,
        assessmentId: sub.assessmentId,
        assessmentTitle: sub.assessmentTitle,
        courseId: sub.courseId,
        fileName: file.filename,
        originalFileName: file.originalName,
        fileUrl: file.fileUrl,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        uploadedAt: file.uploadedAt,
        status: sub.status
      }))
    );
    
    console.log(`✅ Found ${uploads.length} uploads for student name matching "${studentName}"`);
    
    res.json({
      success: true,
      searchQuery: studentName,
      uploads,
      count: uploads.length,
      message: uploads.length === 0 ? "No uploads found for this student name" : undefined
    });
  } catch (error) {
    console.error("Error searching uploads by name:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to search uploads",
      details: error.message
    });
  }
});

/**
 * Get all uploads (with pagination and filters) - diagnostic endpoint
 * GET /api/uploads/debug/all?limit=50&skip=0
 */
router.get("/debug/all", async (req, res) => {
  console.log(`🔍 [uploadRoutes] DEBUG: Getting all uploads`);
  try {
    const { limit = 50, skip = 0 } = req.query;
    const Submission = require("../models/Submission");
    
    const totalCount = await Submission.countDocuments();
    const submissions = await Submission.find({})
      .populate("assessmentId", "title type")
      .populate("courseId", "courseCode courseName")
      .sort({ submittedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();
    
    // Flatten files for backwards compatibility
    const uploads = submissions.flatMap(sub => 
      (sub.submissionFiles || []).map((file, idx) => ({
        _id: `${sub._id}-file-${idx}`,
        submissionId: sub._id,
        studentId: sub.studentId,
        studentName: sub.studentName,
        assessmentId: sub.assessmentId,
        assessmentTitle: sub.assessmentTitle,
        courseId: sub.courseId,
        fileName: file.filename,
        originalFileName: file.originalName,
        fileUrl: file.fileUrl,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        uploadedAt: file.uploadedAt,
        status: sub.status
      }))
    );
    
    console.log(`✅ Found ${uploads.length} uploads (total: ${totalCount})`);
    
    res.json({
      success: true,
      totalCount,
      limit: parseInt(limit),
      skip: parseInt(skip),
      returnedCount: uploads.length,
      uploads,
      message: `Showing ${uploads.length} of ${totalCount} total uploads`
    });
  } catch (error) {
    console.error("Error getting all uploads:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to get uploads",
      details: error.message
    });
  }
});

module.exports = router;
