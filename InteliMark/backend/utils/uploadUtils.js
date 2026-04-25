const Submission = require("../models/Submission");
const Assessment = require("../models/Assessment");
const Course = require("../models/Course");
const mongoose = require("mongoose");

// Helper: Convert submission files to upload format (flattened for compatibility)
const flattenSubmissionFiles = (submission) => {
  if (!submission.submissionFiles || submission.submissionFiles.length === 0) {
    return [];
  }
  
  return submission.submissionFiles.map((file, index) => ({
    _id: `${submission._id}-file-${index}`, // Composite ID for tracking
    submissionId: submission._id,
    studentId: submission.studentId,
    studentName: submission.studentName,
    studentEmail: submission.studentEmail,
    assessmentId: submission.assessmentId,
    assessmentTitle: submission.assessmentTitle,
    assessmentType: submission.assessmentType,
    courseId: submission.courseId,
    courseCode: submission.courseCode,
    courseName: submission.courseName,
    teacherId: submission.teacherId,
    fileName: file.filename,
    originalFileName: file.originalName,
    fileUrl: file.fileUrl,
    fileSize: file.fileSize,
    mimeType: file.mimeType,
    uploadedAt: file.uploadedAt,
    uploadedDate: file.uploadedDate,
    uploadedTime: file.uploadedTime,
    status: submission.status,
    marks: file.marks || submission.grade,
    feedback: file.fileFeedback || submission.feedback,
    isLate: submission.isLate,
    lateDays: submission.lateDays,
    latePenaltyPerDay: submission.latePenaltyPerDay,
    latePenaltyPercent: submission.latePenaltyPercent,
    faissIngestionStatus: submission.faissIngestionStatus,
    faissChunkCount: submission.faissChunkCount,
    submissionStatus: submission.status
  }));
};

// Create submission (no separate upload record needed - everything in submission)
const createUpload = async (uploadData) => {
  // This is now handled by submissionController.submitAssessment
  // Kept for backwards compatibility
  console.log("✅ Files stored in Submission collection");
  return uploadData;
};

// Get all submission files for a specific student (flattened as "uploads")
const getStudentUploads = async (studentId) => {
  try {
    const submissions = await Submission.find({ studentId })
      .populate("assessmentId")
      .populate("courseId")
      .sort({ submittedAt: -1 });
    
    // Flatten all files from all submissions
    const uploads = submissions.flatMap(submission => 
      flattenSubmissionFiles(submission)
    );
    
    return uploads;
  } catch (error) {
    console.error("Error fetching student uploads:", error);
    throw error;
  }
};

// Get submission files for a specific assessment
const getAssessmentUploads = async (assessmentId) => {
  try {
    const submissions = await Submission.find({ assessmentId })
      .sort({ submittedAt: -1 });
    
    const uploads = submissions.flatMap(submission => 
      flattenSubmissionFiles(submission)
    );
    
    return uploads;
  } catch (error) {
    console.error("Error fetching assessment uploads:", error);
    throw error;
  }
};

// Get submission files for a specific course
const getCourseUploads = async (courseId, filter = {}) => {
  try {
    const query = { courseId };
    
    if (filter.assessmentId) {
      query.assessmentId = filter.assessmentId;
    }
    if (filter.assessmentType) {
      query.assessmentType = filter.assessmentType;
    }
    if (filter.studentId) {
      query.studentId = filter.studentId;
    }
    if (filter.status) {
      query.status = filter.status;
    }
    
    const submissions = await Submission.find(query)
      .sort({ submittedAt: -1 });
    
    const uploads = submissions.flatMap(submission => 
      flattenSubmissionFiles(submission)
    );
    
    return uploads;
  } catch (error) {
    console.error("Error fetching course uploads:", error);
    throw error;
  }
};

// Get submission files for a teacher (all their assessments)
const getTeacherUploads = async (teacherId, filter = {}) => {
  try {
    const query = { teacherId };
    
    if (filter.assessmentId) {
      query.assessmentId = filter.assessmentId;
    }
    if (filter.courseId) {
      query.courseId = filter.courseId;
    }
    if (filter.status) {
      query.status = filter.status;
    }
    
    const submissions = await Submission.find(query)
      .sort({ submittedAt: -1 });
    
    const uploads = submissions.flatMap(submission => 
      flattenSubmissionFiles(submission)
    );
    
    return uploads;
  } catch (error) {
    console.error("Error fetching teacher uploads:", error);
    throw error;
  }
};

// Get all submissions/uploads (admin view)
const getAllUploads = async () => {
  try {
    console.log("[uploadUtils.getAllUploads] Starting query...");
    const submissions = await Submission.find({})
      .sort({ submittedAt: -1 });
    
    console.log(`[uploadUtils.getAllUploads] Found ${submissions.length} submissions`);
    
    const uploads = submissions.flatMap(submission => {
      const flattened = flattenSubmissionFiles(submission);
      console.log(`[uploadUtils.getAllUploads] Submission ${submission._id}: ${flattened.length} files`);
      return flattened;
    });
    
    console.log(`[uploadUtils.getAllUploads] Returning ${uploads.length} total uploads`);
    return uploads;
  } catch (error) {
    console.error("Error fetching all uploads:", error);
    throw error;
  }
};

// Get submission by ID (for compatibility - gets submission, not individual file)
const getUploadById = async (submissionId) => {
  try {
    const submission = await Submission.findById(submissionId)
      .populate("assessmentId")
      .populate("courseId");
    
    if (!submission) return null;
    
    // Return first file or submission itself
    const uploads = flattenSubmissionFiles(submission);
    return uploads.length > 0 ? uploads[0] : submission;
  } catch (error) {
    console.error("Error fetching upload:", error);
    throw error;
  }
};

// Update submission status
const updateUploadStatus = async (submissionId, status) => {
  try {
    const submission = await Submission.findByIdAndUpdate(
      submissionId,
      { status },
      { new: true }
    );
    return submission;
  } catch (error) {
    console.error("Error updating submission status:", error);
    throw error;
  }
};

// Update submission notes
const updateUploadNotes = async (submissionId, notes, status = null) => {
  try {
    const updateData = { 
      notes: notes
    };
    
    if (status) {
      updateData.status = status;
    }
    
    const submission = await Submission.findByIdAndUpdate(
      submissionId,
      updateData,
      { new: true }
    );
    return submission;
  } catch (error) {
    console.error("Error updating submission notes:", error);
    throw error;
  }
};

// Increment view count (for compatibility)
const incrementViewCount = async (submissionId) => {
  try {
    const submission = await Submission.findByIdAndUpdate(
      submissionId,
      { updatedAt: new Date() },
      { new: true }
    );
    return submission;
  } catch (error) {
    console.error("Error incrementing view count:", error);
    throw error;
  }
};

// Get submission statistics for a course
const getCourseUploadStats = async (courseId) => {
  try {
    const stats = await Submission.aggregate([
      { $match: { courseId: new mongoose.Types.ObjectId(courseId) } },
      {
        $group: {
          _id: "$assessmentType",
          count: { $sum: 1 },
          avgFiles: { $avg: { $size: "$submissionFiles" } }
        }
      }
    ]);
    return stats;
  } catch (error) {
    console.error("Error getting submission stats:", error);
    throw error;
  }
};

// Get submission statistics for an assessment
const getAssessmentUploadStats = async (assessmentId) => {
  try {
    const stats = await Submission.aggregate([
      { $match: { assessmentId: new mongoose.Types.ObjectId(assessmentId) } },
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          statusBreakdown: [
            { $group: { _id: "$status", count: { $sum: 1 } } }
          ],
          lateSubmissions: [
            { $match: { isLate: true } },
            { $count: "count" }
          ]
        }
      }
    ]);
    return stats[0];
  } catch (error) {
    console.error("Error getting submission stats:", error);
    throw error;
  }
};

// Delete a submission
const deleteUpload = async (submissionId) => {
  try {
    const submission = await Submission.findByIdAndDelete(submissionId);
    return submission;
  } catch (error) {
    console.error("Error deleting submission:", error);
    throw error;
  }
};

// Get submissions by date range
const getUploadsByDateRange = async (startDate, endDate, filter = {}) => {
  try {
    const query = {
      submittedAt: {
        $gte: startDate,
        $lte: endDate
      }
    };
    
    if (filter.courseId) {
      query.courseId = filter.courseId;
    }
    if (filter.teacherId) {
      query.teacherId = filter.teacherId;
    }
    if (filter.assessmentType) {
      query.assessmentType = filter.assessmentType;
    }
    
    const submissions = await Submission.find(query)
      .sort({ submittedAt: -1 });
    
    const uploads = submissions.flatMap(submission => 
      flattenSubmissionFiles(submission)
    );
    
    return uploads;
  } catch (error) {
    console.error("Error fetching submissions by date range:", error);
    throw error;
  }
};

module.exports = {
  createUpload,
  getStudentUploads,
  getAssessmentUploads,
  getCourseUploads,
  getTeacherUploads,
  getAllUploads,
  getUploadById,
  updateUploadStatus,
  updateUploadNotes,
  incrementViewCount,
  getCourseUploadStats,
  getAssessmentUploadStats,
  deleteUpload,
  getUploadsByDateRange
};
