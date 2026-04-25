const mongoose = require("mongoose");

/**
 * AssessmentReferenceRaw
 * Tracks extraction + FAISS ingestion metadata for assessment reference artifacts
 * (sample answers, rubrics, CLO text) in the dedicated assessment reference index.
 */
const assessmentReferenceRawSchema = new mongoose.Schema(
  {
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assessment",
      required: true,
      index: true,
    },
    // Stored as Q1/Q2/... or ALL
    questionKey: {
      type: String,
      default: "ALL",
      index: true,
    },
    referenceType: {
      type: String,
      enum: ["sample_answer", "rubric", "clo"],
      required: true,
      index: true,
    },
    referenceKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // File/text source
    source: { type: String, default: "" },
    title: { type: String, default: "" },

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
    pageMetadata: { type: Array, default: [] },
    visualCount: { type: Number, default: 0, min: 0 },
    ocrEnabled: { type: Boolean, default: false },
    ocrStatus: { type: String, default: "" },
    ocrError: { type: String, default: "" },
    ocrCount: { type: Number, default: 0, min: 0 },
    ocrCharCount: { type: Number, default: 0, min: 0 },
    extractionError: { type: String, default: "" },
    extractedAt: { type: Date, default: null },

    faissIngestionStatus: {
      type: String,
      enum: ["pending", "completed", "failed", "skipped"],
      default: "pending",
      index: true,
    },
    faissChunkCount: { type: Number, default: 0, min: 0 },
    numChunks: { type: Number, default: 0, min: 0 },
    numEmbeddings: { type: Number, default: 0, min: 0 },
    faissIngestionDurationMs: { type: Number, default: 0, min: 0 },
    faissIngestionError: { type: String, default: "" },
    faissIngestedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "assessmentReferenceRaw",
  }
);

assessmentReferenceRawSchema.index({ assessmentId: 1, referenceType: 1, questionKey: 1 });

module.exports = mongoose.model("AssessmentReferenceRaw", assessmentReferenceRawSchema);

