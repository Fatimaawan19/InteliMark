const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema({
  courseId: {
    type: String,
    required: true,
    ref: 'Course'
  },
  teacherId: {
    type: String,
    required: true
  },
  teacherName: {
    type: String,
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
  priority: {
    type: String,
    enum: ['normal', 'urgent'],
    default: 'normal'
  },
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  readBy: [{
    userId: String,
    readAt: Date
  }]
});

module.exports = mongoose.model("Announcement", announcementSchema);
