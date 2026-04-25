const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['assessment-created', 'assessment-updated', 'assessment-deleted', 'assessment-published'],
    required: true
  },
  recipientId: {
    type: String,
    required: true,
    index: true
  },
  recipientRole: {
    type: String,
    enum: ['teacher', 'student', 'admin'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  assessmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Assessment"
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course"
  },
  courseCode: {
    type: String
  },
  createdById: {
    type: String
  },
  createdByName: {
    type: String
  },
  read: {
    type: Boolean,
    default: false,
    index: true
  },
  actionType: {
    type: String,
    default: 'assessment-created'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
notificationSchema.index({ recipientId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
