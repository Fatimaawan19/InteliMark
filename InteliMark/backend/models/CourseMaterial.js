const mongoose = require("mongoose");

const courseMaterialSchema = new mongoose.Schema(
  {
    teacherId: {
      type: String,
      required: true,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    externalCourseId: {
      type: String,
      default: "",
      index: true,
    },
    courseCode: {
      type: String,
      default: "",
      index: true,
    },
    courseName: {
      type: String,
      default: "",
    },
    sourceType: {
      type: String,
      enum: ["slides", "book"],
      default: "slides",
      index: true,
    },
    originalFileName: {
      type: String,
      required: true,
    },
    storedFileName: {
      type: String,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    processingStatus: {
      type: String,
      enum: ["uploaded", "extracted", "embedded", "failed"],
      default: "uploaded",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

courseMaterialSchema.index({ teacherId: 1, courseId: 1, createdAt: -1 });

module.exports = mongoose.model("CourseMaterial", courseMaterialSchema);
