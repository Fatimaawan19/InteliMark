const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema({
  courseCode: { type: String, required: true },
  courseTitle: { type: String, required: true },
  creditHours: { type: Number, default: 0 },
  description: { type: String },
  syllabusPdfUrl: { type: String },
  extractedText: { type: String },
  syllabusUploadedAt: { type: Date },
  status: { type: String, default: 'active' },
  department: { type: String },
  teacherId: {
    type: String,
    required: true
  },
}, {
  timestamps: true
});

// Composite unique index ensures (courseCode, teacherId) is unique per teacher
courseSchema.index({ courseCode: 1, teacherId: 1 }, { unique: true });

module.exports = mongoose.model("Course", courseSchema);
