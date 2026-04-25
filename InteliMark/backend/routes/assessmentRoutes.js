const express = require("express");
const assessmentController = require("../controllers/assessmentController");
const automarkController = require("../controllers/automarkController");
const extractionController = require("../controllers/extractionController");
const path = require("path");
const multer = require("multer");
const fs = require("fs");

/**
 * NOTIFICATION ROUTES - Firebase Firestore Backend (with MongoDB for assessment creation)
 * Assessment creation notifications: MongoDB
 * Other notifications: Firebase Firestore
 * Notifications are stored in: firestore/notifications/{doc} or mongodb/notifications/{doc}
 */

const router = express.Router();

// Upload assessment references for auto-marking (assessment reference)
const referenceUploadsDir = path.join(__dirname, "../uploads/assessment_reference_uploads");
if (!fs.existsSync(referenceUploadsDir)) {
  fs.mkdirSync(referenceUploadsDir, { recursive: true });
}

const referenceStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, referenceUploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || "");
    const prefix = String(file.fieldname || "reference").replace(/[^a-z0-9\-_]/gi, "-").toLowerCase();
    cb(null, `${prefix}-${uniqueSuffix}${ext}`);
  },
});

const referenceFileFilter = (req, file, cb) => {
  const allowedExts = new Set([".pdf", ".docx", ".jpg", ".jpeg", ".png"]);
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (!allowedExts.has(ext)) {
    cb(new Error("Only PDF, DOCX, JPG, JPEG, and PNG files are allowed."), false);
    return;
  }
  cb(null, true);
};

const uploadReference = multer({
  storage: referenceStorage,
  fileFilter: referenceFileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

// Assessment routes - More specific routes first
router.post("/create", assessmentController.createAssessment);
router.get("/all", assessmentController.getAllAssessments); // Admin: Get all assessments
router.get("/student/:studentId", assessmentController.getStudentAssessments);
router.get("/course/:courseId", assessmentController.getCourseAssessments);
router.get("/teacher/:teacherId", assessmentController.getTeacherAssessments);
router.get("/drafts/by-teacher/:teacherId", assessmentController.getTeacherDrafts);

// Sub-action routes (more specific - must come before /:assessmentId)
router.get("/:assessmentId/automark-meta", assessmentController.getAutomarkMeta);
router.post("/:assessmentId/upload-sample-answer", uploadReference.single("sampleAnswerFile"), assessmentController.uploadSampleAnswerForAutomark);
router.post("/:assessmentId/upload-rubric", uploadReference.single("rubricFile"), assessmentController.uploadRubricForAutomark);
router.post("/:assessmentId/upload-clo", uploadReference.single("cloFile"), assessmentController.uploadCloForAutomark);
router.post("/:assessmentId/extract-batch", extractionController.startAssessmentExtractBatch);
router.post("/:assessmentId/automark-batch", automarkController.startAssessmentAutomarkBatch);
router.post("/:assessmentId/remark-batch", automarkController.startAssessmentRemarkBatch);
router.post("/:assessmentId/publish-batch", automarkController.startAssessmentPublishBatch);
router.patch("/:assessmentId/status", assessmentController.updateAssessmentStatus);
router.put("/:assessmentId/update-due-date", (req, res, next) => {
  console.log(`🔧 PUT /:assessmentId/update-due-date route matched!`);
  console.log(`   assessmentId param:`, req.params.assessmentId);
  next();
}, assessmentController.updateAssessmentDueDate);
router.delete("/:assessmentId", assessmentController.deleteAssessment);

// Test route to verify pattern works
router.get("/:assessmentId/test", (req, res) => {
  res.json({ message: "Test route works", assessmentId: req.params.assessmentId });
});

// Serve PDF files
router.get("/pdf/:filename", (req, res) => {
    const fs = require('fs');
    const filename = req.params.filename;
    const filePath = path.join(__dirname, "../pdfs", filename);
    
    // Security: Prevent directory traversal
    if (!filePath.startsWith(path.join(__dirname, "../pdfs"))) {
        return res.status(403).json({ error: "Access denied" });
    }
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
        console.warn(`PDF file not found: ${filePath}`);
        return res.status(404).json({ error: "PDF file not found" });
    }
    
    // Set proper headers for PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    // Send file
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error("Error sending PDF:", err);
            if (!res.headersSent) {
                res.status(500).json({ error: "Failed to download PDF" });
            }
        }
    });
});

// ==================== NOTIFICATION ROUTES ====================

// Get notifications for a user from Firebase
router.get("/notifications/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 50, skip = 0 } = req.query;
        const admin = require("firebase-admin");
        
        console.log(`📬 Fetching notifications for user ${userId}, limit: ${limit}, skip: ${skip}`);
        
        try {
            const db = admin.firestore();
            
            // Fetch notifications from Firebase (without orderBy to avoid composite index requirement)
            const snapshot = await db.collection('notifications')
                .where('recipientId', '==', userId)
                .get();
            
            console.log(`   Found ${snapshot.size} notifications`);
            
            // Get unread count
            const unreadSnapshot = await db.collection('notifications')
                .where('recipientId', '==', userId)
                .where('read', '==', false)
                .get();
            
            // Transform Firebase documents and sort by createdAt in code
            const allNotifications = snapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    createdAt: doc.data().createdAt?.toDate?.() || new Date()
                }))
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); // Sort descending by date
            
            // Apply pagination
            const paginatedNotifications = allNotifications.slice(
                parseInt(skip), 
                parseInt(skip) + parseInt(limit)
            );
            
            res.json({
                success: true,
                notifications: paginatedNotifications,
                pagination: {
                    total: snapshot.size,
                    unread: unreadSnapshot.size,
                    limit: parseInt(limit),
                    skip: parseInt(skip)
                }
            });
        } catch (firebaseError) {
            console.warn('⚠️ Firebase initialization error:', firebaseError.message);
            // If Firebase isn't configured, return empty notifications instead of failing
            res.json({
                success: true,
                notifications: [],
                pagination: {
                    total: 0,
                    unread: 0,
                    limit: parseInt(limit),
                    skip: parseInt(skip)
                }
            });
        }
    } catch (error) {
        console.error('❌ Error fetching notifications:', error.message);
        res.status(500).json({ error: 'Failed to fetch notifications', details: error.message });
    }
});

// Get unread count from Firebase
router.get("/notifications/:userId/unread", async (req, res) => {
    try {
        const { userId } = req.params;
        const admin = require("firebase-admin");
        
        try {
            const db = admin.firestore();
            const snapshot = await db.collection('notifications')
                .where('recipientId', '==', userId)
                .where('read', '==', false)
                .get();
            
            res.json({
                success: true,
                unread: snapshot.size
            });
        } catch (firebaseError) {
            console.warn('⚠️ Firebase error - returning 0 unread:', firebaseError.message);
            res.json({ success: true, unread: 0 });
        }
    } catch (error) {
        console.error('❌ Error fetching unread count:', error.message);
        res.status(500).json({ error: 'Failed to fetch unread count' });
    }
});

// Mark notification as read in Firebase
router.patch("/notifications/:notificationId/read", async (req, res) => {
    try {
        const { notificationId } = req.params;
        const admin = require("firebase-admin");
        
        try {
            const db = admin.firestore();
            const docRef = db.collection('notifications').doc(notificationId);
            const doc = await docRef.get();
            
            if (!doc.exists) {
                return res.status(404).json({ error: 'Notification not found' });
            }
            
            await docRef.update({ read: true });
            
            res.json({
                success: true,
                notification: {
                    id: notificationId,
                    ...doc.data(),
                    read: true
                }
            });
        } catch (firebaseError) {
            console.warn('⚠️ Firebase error - marking notification as read:', firebaseError.message);
            res.json({ success: true, notification: { id: notificationId, read: true } });
        }
    } catch (error) {
        console.error('❌ Error marking notification as read:', error.message);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

// Mark all notifications as read for a user in Firebase
router.patch("/notifications/:userId/read-all", async (req, res) => {
    try {
        const { userId } = req.params;
        const admin = require("firebase-admin");
        
        try {
            const db = admin.firestore();
            const snapshot = await db.collection('notifications')
                .where('recipientId', '==', userId)
                .where('read', '==', false)
                .get();
            
            const batch = db.batch();
            snapshot.forEach(doc => {
                batch.update(doc.ref, { read: true });
            });
            
            await batch.commit();
            
            res.json({
                success: true,
                message: `All notifications marked as read (${snapshot.size} updated)`
            });
        } catch (firebaseError) {
            console.warn('⚠️ Firebase error - marking all as read:', firebaseError.message);
            res.json({ success: true, message: 'Notifications marked as read' });
        }
    } catch (error) {
        console.error('❌ Error marking all notifications as read:', error.message);
        res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
});

// This route is handled by assessmentController.getStudentAssessments above
// (declared at line ~15)

module.exports = router;
