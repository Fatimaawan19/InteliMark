const mongoose = require("mongoose");

const uploadSchema = new mongoose.Schema({
  // Student Reference
  studentId: {
    type: String,
    required: true,
    index: true
  },
  
  studentName: {
    type: String,
    required: true
  },
  
  studentEmail: {
    type: String,
    required: true
  },
  
  // Assessment Reference
  assessmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Assessment",
    required: true,
    index: true
  },

  // Required payload compatibility
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Assessment",
    index: true
  },
  
  assessmentTitle: {
    type: String,
    required: true
  },
  
  assessmentType: {
    type: String,
    enum: ['quiz', 'assignment'],
    required: true
  },
  
  // Course Reference
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
    index: true
  },
  
  courseCode: {
    type: String,
    required: true,
    index: true
  },
  
  courseName: {
    type: String
  },
  
  // Teacher Reference
  teacherId: {
    type: String,
    required: true,
    index: true
  },
  
  teacherName: {
    type: String
  },
  
  // File Information
  fileName: {
    type: String,
    required: true
  },
  
  originalFileName: {
    type: String,
    required: true
  },
  
  fileUrl: {
    type: String,
    required: true
  },
  
  fileSize: {
    type: Number,
    required: true
  },

  fileType: {
    type: String,
    default: ""
  },
  
  mimeType: {
    type: String,
    required: true
  },
  
  // Timestamps
  uploadedAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  submittedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  uploadedDate: {
    type: String, // YYYY-MM-DD format for easier filtering
    required: true
  },
  
  uploadedTime: {
    type: String, // HH:MM:SS format
    required: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['submitted', 'uploaded', 'graded', 'reviewed', 'archived'],
    default: 'submitted',
    index: true
  },

  marks: {
    type: Number,
    default: null
  },

  feedback: {
    type: String,
    default: ""
  },

  attempt: {
    type: Number,
    default: 1
  },

  isLate: {
    type: Boolean,
    default: false
  },
  
  // Optional Fields
  submissionNotes: {
    type: String,
    default: ""
  },
  
  // Tracking
  views: {
    type: Number,
    default: 0
  },
  
  lastViewedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Compound index for querying uploads by student and assessment
uploadSchema.index({ studentId: 1, assessmentId: 1 });
// Compound index for querying uploads by course and date
uploadSchema.index({ courseId: 1, uploadedAt: -1 });
// Compound index for teacher viewing all uploads for an assessment
uploadSchema.index({ assessmentId: 1, uploadedAt: -1 });

module.exports = mongoose.model("Upload", uploadSchema, "uploads");
