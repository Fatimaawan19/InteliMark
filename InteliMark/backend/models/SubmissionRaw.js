const mongoose = require("mongoose");

/**
 * SubmissionRaw
 * Stores extraction + FAISS vector metadata for a submission (similar to CourseMaterialRaw).
 *
 * NOTE: We force collection name to `submissionRaw` (singular) to match the user's request.
 */
const submissionRawSchema = new mongoose.Schema(
  {
    submissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Submission",
      required: true,
      index: true,
      unique: true,
    },

    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assessment",
      default: null,
      index: true,
    },

    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null,
      index: true,
    },

    teacherId: {
      type: String,
      default: "",
      index: true,
    },

    studentId: {
      type: String,
      default: "",
      index: true,
    },

    studentEmail: {
      type: String,
      default: "",
      index: true,
    },

    // Extraction / raw text metadata (optional for now; can be expanded later)
    extractionStatus: {
      type: String,
      enum: ["pending", "completed", "failed", "skipped"],
      default: "pending",
      index: true,
    },
    extractor: { type: String, default: "" },
    rawText: { type: String, default: "" },
    charCount: { type: Number, default: 0, min: 0 },
    pageCount: { type: Number, default: 0, min: 0 },
    pageMetadata: { type: Array, default: [] }, // keep flexible (pdf pages / images / etc.)

    // Multi-valued content types found in this submission after extraction/ingestion.
    // Examples: ["text"], ["code"], ["text","code"], ["graphical","text"]
    contentTypes: { type: [String], default: [], index: true },

    // Visual/OCR stats (placeholders for image/PDF OCR)
    visualCount: { type: Number, default: 0, min: 0 },
    equationCount: { type: Number, default: 0, min: 0 },
    ocrCount: { type: Number, default: 0, min: 0 },
    ocrCharCount: { type: Number, default: 0, min: 0 },
    ocrEnabled: { type: Boolean, default: false },
    ocrStatus: { type: String, default: "" },
    ocrError: { type: String, default: "" },

    extractionError: { type: String, default: "" },
    extractedAt: { type: Date, default: null },

    // FAISS ingestion status/metrics
    faissIngestionStatus: {
      type: String,
      enum: ["pending", "completed", "failed", "skipped"],
      default: "pending",
      index: true,
    },
    faissChunkCount: { type: Number, default: 0, min: 0 },
    numChunks: { type: Number, default: 0, min: 0 },
    numEmbeddings: { type: Number, default: 0, min: 0 },
    faissChunksMetadata: { type: Array, default: [] }, // optional per-chunk metadata summary
    faissIngestionDurationMs: { type: Number, default: 0, min: 0 },
    faissIngestionError: { type: String, default: "" },
    faissIngestedAt: { type: Date, default: null },

    // AutoMark / LLM marking persistence (so review UI can render per-question marks & mistakes).
    automarkStatus: {
      type: String,
      enum: ["missing", "pending", "processing", "completed", "failed"],
      default: "missing",
      index: true,
    },
    automarkError: { type: String, default: "" },
    automarkedAt: { type: Date, default: null },

    // Store the last full AI report (JSON object) and a small per-question summary for quick UI.
    // NOTE: stored as Mixed to avoid schema lock-in while prompts evolve.
    automarkReport: { type: mongoose.Schema.Types.Mixed, default: null },
    perQuestionScores: { type: Array, default: [] }, // [{questionKey, awardedMarks, maxMarks, confidence, summary, mistakes[]}]
    totalAwardedMarks: { type: Number, default: null },
  },
  {
    timestamps: true,
    collection: "submissionRaw",
  }
);

submissionRawSchema.index({ assessmentId: 1, studentId: 1 });
submissionRawSchema.index({ faissIngestionStatus: 1, assessmentId: 1 });

module.exports = mongoose.model("SubmissionRaw", submissionRawSchema);

