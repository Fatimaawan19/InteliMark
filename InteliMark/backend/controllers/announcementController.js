const Announcement = require("../models/Announcement");
const { firestore } = require("../config/firebase");
const { notifyAnnouncementCreated } = require("../utils/notificationService");

// Create announcement
exports.createAnnouncement = async (req, res) => {
  try {
    const { courseId, teacherId, teacherName, title, message, priority } = req.body;

    if (!courseId || !teacherId || !title || !message) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields" 
      });
    }

    const announcement = await Announcement.create({
      courseId,
      teacherId,
      teacherName,
      title,
      message,
      priority: priority || 'normal',
      attachments: []
    });

    // Get course details from Firebase
    let courseData = { courseName: 'Unknown Course', courseCode: '', _id: courseId };
    try {
      const courseDoc = await firestore.collection('courses').doc(courseId).get();
      if (courseDoc.exists) {
        const data = courseDoc.data();
        courseData = {
          _id: courseId,
          id: courseId,
          courseName: data.courseName || data.courseTitle,
          courseCode: data.courseCode,
          ...data
        };
      }
    } catch (error) {
      console.warn('⚠️ Could not fetch course details:', error.message);
    }

    // Get enrolled students for this course
    let studentIds = [];
    try {
      const studentsSnapshot = await firestore.collection('users')
        .where('registeredCourses', 'array-contains', courseId)
        .get();
      studentIds = studentsSnapshot.docs.map(doc => doc.id);
      console.log(`📚 Found ${studentIds.length} enrolled students`);
    } catch (error) {
      console.warn('⚠️ Could not fetch enrolled students:', error.message);
    }

    // Send notifications
    try {
      await notifyAnnouncementCreated(announcement, courseData, teacherId, teacherName, studentIds);
    } catch (error) {
      console.warn('⚠️ Failed to send announcement notifications:', error.message);
    }

    res.status(201).json({
      success: true,
      announcement,
      message: "Announcement posted successfully"
    });
  } catch (error) {
    console.error("Error creating announcement:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Get announcements for a course
exports.getCourseAnnouncements = async (req, res) => {
  try {
    const { courseId } = req.params;

    const announcements = await Announcement.find({ courseId })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      announcements,
      count: announcements.length
    });
  } catch (error) {
    console.error("Error fetching announcements:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Get all announcements for a student (from enrolled courses)
exports.getStudentAnnouncements = async (req, res) => {
  try {
    const { courseIds } = req.query; // Comma-separated course IDs

    if (!courseIds) {
      return res.json({ success: true, announcements: [] });
    }

    const courseIdArray = courseIds.split(',');

    const announcements = await Announcement.find({ 
      courseId: { $in: courseIdArray } 
    })
    .sort({ createdAt: -1 })
    .limit(50);

    res.json({
      success: true,
      announcements,
      count: announcements.length
    });
  } catch (error) {
    console.error("Error fetching student announcements:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Mark announcement as read
exports.markAsRead = async (req, res) => {
  try {
    const { announcementId } = req.params;
    const { userId } = req.body;

    const announcement = await Announcement.findById(announcementId);
    
    if (!announcement) {
      return res.status(404).json({ 
        success: false, 
        error: "Announcement not found" 
      });
    }

    // Check if already read
    const alreadyRead = announcement.readBy.some(r => r.userId === userId);
    
    if (!alreadyRead) {
      announcement.readBy.push({
        userId,
        readAt: new Date()
      });
      await announcement.save();
    }

    res.json({
      success: true,
      message: "Marked as read"
    });
  } catch (error) {
    console.error("Error marking announcement as read:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Delete announcement
exports.deleteAnnouncement = async (req, res) => {
  try {
    const { announcementId } = req.params;

    await Announcement.findByIdAndDelete(announcementId);

    res.json({
      success: true,
      message: "Announcement deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting announcement:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
