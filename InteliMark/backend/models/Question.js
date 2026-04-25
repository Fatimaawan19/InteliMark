const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  assessmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Assessment",
    required: true
  },
  cloId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CLO",
    required: true
  },
  courseCode: {
    type: String,
    required: true,
    index: true
  },
  cloIndex: {
    type: Number,
    default: 0
  },
  cloDescription: {
    type: String,
    default: 'Learning Outcome'
  },
  questionText: {
    type: String,
    required: true
  },
  questionType: {
    type: String,
    enum: ['mcq', 'short-answer', 'true-false', 'coding', 'long-answer', 'fill-in-the-blank'],
    default: 'mcq'
  },
  options: [{
    text: String,
    isCorrect: Boolean
  }],
  correctAnswer: String,
  marks: {
    type: Number,
    required: true,
    default: 1
  },
  difficultyLevel: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    required: true
  },
  bloomLevel: {
    type: String,
    enum: ['Remembering', 'Understanding', 'Applying', 'Analyzing', 'Evaluating', 'Creating'],
    required: true
  },
  explanation: String,
  generatedByAI: {
    type: Boolean,
    default: true
  },
  aiPrompt: String
}, {
  timestamps: true
});

module.exports = mongoose.model("Question", questionSchema);