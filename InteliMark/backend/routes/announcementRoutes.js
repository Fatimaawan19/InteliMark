const express = require("express");
const router = express.Router();
const announcementController = require("../controllers/announcementController");

// Routes
router.post("/create", announcementController.createAnnouncement);
router.get("/course/:courseId", announcementController.getCourseAnnouncements);
router.get("/student", announcementController.getStudentAnnouncements);
router.patch("/:announcementId/read", announcementController.markAsRead);
router.delete("/:announcementId", announcementController.deleteAnnouncement);

module.exports = router;
