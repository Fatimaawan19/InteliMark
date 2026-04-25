const mongoose = require("mongoose");

const courseMaterialRawSchema = new mongoose.Schema(
  {
    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseMaterial",
      required: true,
      index: true,
      unique: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    teacherId: {
      type: String,
      required: true,
      index: true,
    },
    extractionStatus: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
      index: true,
    },
    extractor: {
      type: String,
      default: "",
    },
    pageCount: {
      type: Number,
      default: 0,
    },
    charCount: {
      type: Number,
      default: 0,
    },
    extractionDurationMs: {
      type: Number,
      default: 0,
    },
    pageMetadata: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    equationCount: {
      type: Number,
      default: 0,
    },
    visualCount: {
      type: Number,
      default: 0,
    },
    ocrCount: {
      type: Number,
      default: 0,
    },
    ocrCharCount: {
      type: Number,
      default: 0,
    },
    ocrEnabled: {
      type: Boolean,
      default: false,
    },
    ocrStatus: {
      type: String,
      default: "",
    },
    ocrError: {
      type: String,
      default: "",
    },
    rawText: {
      type: String,
      default: "",
    },
    extractionError: {
      type: String,
      default: "",
    },
    extractedAt: {
      type: Date,
      default: null,
    },
    faissIngestionStatus: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
      index: true,
      description: "FAISS vector database ingestion status"
    },
    faissChunkCount: {
      type: Number,
      default: 0,
      description: "Number of chunks ingested into FAISS"
    },
    faissChunksMetadata: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
      description: "Metadata for FAISS chunks (IDs, token counts, etc.)"
    },
    faissIngestionDurationMs: {
      type: Number,
      default: 0,
      description: "Time taken to ingest into FAISS"
    },
    faissIngestionError: {
      type: String,
      default: "",
      description: "Error message if FAISS ingestion failed"
    },
    faissIngestionAt: {
      type: Date,
      default: null,
      description: "Timestamp when material was ingested into FAISS"
    },
    numChunks: {
      type: Number,
      default: 0,
      description: "Number of chunks created from this material during ingestion"
    },
    numEmbeddings: {
      type: Number,
      default: 0,
      description: "Number of embeddings generated for chunks from this material (typically equals numChunks)"
    },
  },
  {
    timestamps: true,
  }
);

courseMaterialRawSchema.index({ courseId: 1, sourceType: 1, createdAt: -1 });
courseMaterialRawSchema.index({ faissIngestionStatus: 1, courseId: 1 });

module.exports = mongoose.model("CourseMaterialRaw", courseMaterialRawSchema);
