const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const courseController = require("../controllers/courseController");

const router = express.Router();

// Configure multer for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads/syllabus_uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    console.log('📥 Multer will save syllabus uploads to:', uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    cb(null, "syllabus-" + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are allowed"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Configure multer for course material uploads (slides/books)
const materialStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads/course_materials_upload");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "material-" + uniqueSuffix + path.extname(file.originalname));
  }
});

const materialFileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];

  const allowedExtensions = new Set([".pdf", ".pptx"]);
  const ext = path.extname(file.originalname || "").toLowerCase();
  const isKnownMime = allowedMimeTypes.includes(file.mimetype);
  const isGenericMime = !file.mimetype || file.mimetype === "application/octet-stream";
  const isKnownExtension = allowedExtensions.has(ext);

  // Accept by MIME type, or by extension when clients send generic MIME.
  if (isKnownMime || (isGenericMime && isKnownExtension)) {
    cb(null, true);
  } else {
    cb(new Error("Only PPTX and PDF is allowed"), false);
  }
};

const uploadMaterial = multer({
  storage: materialStorage,
  fileFilter: materialFileFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
});


// --- Static routes first ---
router.post("/upload-syllabus", upload.single("syllabusPdf"), courseController.uploadSyllabus);
router.post("/upload-material", uploadMaterial.single("materialFile"), courseController.uploadCourseMaterial);
router.post("/material-context", courseController.queryMaterialContext);
router.post("/:courseId/material-context", courseController.queryCourseMaterialContext);
router.post("/notify-registration", courseController.notifyRegistration);
router.post("/notify-course-update", courseController.notifyCourseUpdate);
router.delete("/delete-course", courseController.deleteCourse);
router.delete("/syllabus", courseController.deleteSyllabus);
router.get("/test", (req, res) => res.json({ message: "Test route works" }));
router.get("/verify-syllabus", courseController.verifySyllabus);
router.get("/teacher/:teacherId", courseController.getCourses);
router.get("/teacher/:teacherId/syllabus-status", courseController.getSyllabusStatus);
router.get("/bloom-levels/:courseId", courseController.getBloomLevels);
router.get("/clos/all", courseController.getAllCLOsWithCourses);
// Serve syllabus PDF files
router.get("/syllabus/:filename", (req, res) => {
  const primaryPath = path.join(__dirname, "../uploads/syllabus_uploads", req.params.filename);
  const legacyPath = path.join(__dirname, "../uploads", req.params.filename);
  const filePath = fs.existsSync(primaryPath) ? primaryPath : legacyPath;
  const fileName = `${req.params.filename}.pdf`; // Add .pdf extension to the filename
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Type', 'application/pdf');
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error("Error sending file:", err);
      res.status(404).json({ error: "File not found" });
    }
  });
});

// Serve uploaded course materials
router.get("/materials/:filename", (req, res) => {
  const filePath = path.join(__dirname, "../uploads/course_materials_upload", req.params.filename);
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error("Error sending material file:", err);
      res.status(404).json({ error: "File not found" });
    }
  });
});

// Get course materials with chunk counts
router.get("/materials-list/:courseId", courseController.getCourseMaterials);
// Get course materials by Firebase course id (externalCourseId)
router.get("/materials-by-external/:externalCourseId", courseController.getCourseMaterialsByExternalCourseId);

// Material ingestion debugging endpoints
router.get("/material/:materialId/ingestion-status", courseController.checkMaterialIngestionStatus);
router.post("/material/:materialId/re-ingest", courseController.reIngestMaterial);
router.post("/material/:materialId/reprocess-phase1", courseController.reprocessMaterialPhase1);

// --- Dynamic routes last ---
router.get("/:courseId/clos", courseController.getCourseCLOs);
router.post("/:courseId/re-extract-clos", courseController.reExtractCLOs);
router.get("/:courseId/test", (req, res) => res.json({ message: `Test route for ${req.params.courseId}` }));

module.exports = router;
