const mongoose = require("mongoose");

const automarkJobSchema = new mongoose.Schema(
  {
    teacherId: { type: String, required: true, index: true },
    assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Assessment", required: true, index: true },
    assessmentTitle: { type: String, default: "" },
    courseCode: { type: String, default: "" },
    jobType: {
      type: String,
      // Backward compatible: keep "extract" for old records, but use "ExtractStudentChunks" going forward.
      enum: ["automark", "remark", "publish"],
      default: "automark",
      index: true,
    },

    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed", "cancelled"],
      default: "queued",
      index: true,
    },

    total: { type: Number, default: 0, min: 0 },
    processed: { type: Number, default: 0, min: 0 },
    currentSubmissionId: { type: String, default: "" },
    currentStudentName: { type: String, default: "" },

    // Debug tracking flags (high-level readiness for marking)
    studentEvidenceExtracted: { type: Boolean, default: false },
    sampleAnswerExtracted: { type: Boolean, default: false },
    relevantCourseMaterialChunksExtracted: { type: Boolean, default: false },

    logs: [
      {
        ts: { type: Date, default: Date.now },
        level: { type: String, default: "info" },
        message: { type: String, default: "" },
      },
    ],

    error: { type: String, default: "" },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "automarkJobs" }
);

automarkJobSchema.index({ teacherId: 1, assessmentId: 1, createdAt: -1 });

module.exports = mongoose.model("AutomarkJob", automarkJobSchema);

