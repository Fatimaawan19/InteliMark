const mongoose = require("mongoose");

const assessmentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['quiz', 'assignment'],
    required: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true
  },
  courseCode: {
    type: String,
    required: true,
    index: true
  },
  cloIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "CLO"
  }],
  teacherId: {
    type: String,
    required: true
  },
  pdfUrl: {
    type: String
  },
  assessmentPdfFile: {
    type: String
  },
  answerKeyPdfFile: {
    type: String
  },
  bloomLevel: {
    type: String,
    enum: ['Remembering', 'Understanding', 'Applying', 'Analyzing', 'Evaluating', 'Creating']
    // Not required - can be mixed across CLOs
  },
  questionCount: {
    type: Number,
    required: true,
    min: 1
  },
  questionTemplate: {
    type: String,
    enum: ['mcq', 'short-answer', 'true-false', 'coding', 'long-answer', 'fill-in-the-blank', 'mixed'],
    default: 'mcq'
  },
  difficultyLevel: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  threshold: {
    type: Number,
    min: 0,
    max: 100,
    default: 50
  },
  totalMarks: {
    type: Number,
    required: true
  },
  duration: {
    type: Number, // in minutes
    default: 30
  },
  scheduledTime: {
    type: Date
    // Not required - can be scheduled later
  },
  submissionDeadline: {
    type: Date
    // Deadline for student submissions (can be different from dueDate)
  },
  dueDate: {
    type: String,
    // Format: YYYY-MM-DD
  },
  dueTime: {
    type: String,
    // Format: HH:MM
  },
  allowLateSubmission: {
    type: Boolean,
    default: false
  },
  latePenalty: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
    // Percentage penalty per day for late submissions
  },
  status: {
    type: String,
    enum: ['published', 'draft'],
    default: 'draft'
  },
  sentAt: Date,
  questions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Question"
  }],
  studentIds: [String],
  generatedByAI: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model("Assessment", assessmentSchema);
