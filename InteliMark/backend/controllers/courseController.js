const mongoose = require('mongoose');
const Course = require("../models/Course");
const CLO = require("../models/CLO");
const BloomTaxonomy = require("../models/BloomTaxonomy");
const CourseMaterial = require("../models/CourseMaterial");
const CourseMaterialRaw = require("../models/CourseMaterialRaw");
const { parseCLOsFromText } = require("../utils/cloParser");
const { extractTextFromMaterial, isExtractionReady, isOcrReady, getExtractionEnvironmentStatus } = require("../utils/materialExtractor");
const { ingestMaterialAfterUpload, isIngestionReady } = require("../utils/ingestionService");
const {
  getContextForStudentQuery,
  queryMaterials,
  formatResultsForContext,
} = require("../utils/retrievalService");
const fs = require("fs");
const fsp = fs.promises;
const pdfParse = require("pdf-parse");
const path = require("path");
const { bucket, firestore } = require('../config/firebase');
const { notifyStudentRegistered, notifyCourseUpdated } = require('../utils/notificationService');
const { notifyCourseMaterialUploaded } = require('../utils/notificationService');

// --- PLACEHOLDER ROUTES ---
exports.getCourses = async (req, res) => {
  try {
    const { teacherId } = req.params;
    if (!teacherId) return res.status(400).json({ error: "Teacher ID is required" });

    const courses = await Course.find({ teacherId }).sort({ createdAt: -1 });

    // Populate CLO counts and Bloom levels
    const coursesWithDetails = await Promise.all(courses.map(async (course) => {
      const cloCount = await CLO.countDocuments({ courseCode: course.courseCode });
      const hasSyllabus = !!course.syllabusPdfUrl;
      return {
        id: course._id,
        mongodbCourseId: course._id,
        courseCode: course.courseCode,
        courseTitle: course.courseTitle,
        creditHours: course.creditHours,
        description: course.description,
        status: course.status,
        hasSyllabus,
        cloCount,
        createdAt: course.createdAt
      };
    }));

    res.status(200).json({ success: true, courses: coursesWithDetails, count: coursesWithDetails.length });
  } catch (error) {
    console.error("❌ Error fetching courses:", error);
    res.status(500).json({ error: "Failed to fetch courses", details: error.message });
  }
};

// ✅ FIXED: Properly populate bloomLevelId
exports.getCourseCLOs = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!courseId) return res.status(400).json({ error: "Course ID is required" });

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ error: "Course not found" });

    // ✅ FIX: Populate bloomLevelId to get full Bloom taxonomy data
    const clos = await CLO.find({ courseId })
      .populate('bloomLevelId') // ✅ This is critical - populates the Bloom level details
      .sort({ cloNumber: 1 });

    console.log(`✅ Fetched ${clos.length} CLOs for course ${course.courseCode}`);

    // ✅ Log sample CLO to verify population
    if (clos.length > 0) {
      console.log('Sample CLO with Bloom level:', {
        cloNumber: clos[0].cloNumber,
        bloomLevelName: clos[0].bloomLevelId?.levelName,
        bloomLevelNumber: clos[0].bloomLevelId?.levelNumber
      });
    }

    res.status(200).json({
      success: true,
      clos: clos.map(clo => ({
        _id: clo._id,
        cloNumber: clo.cloNumber,
        description: clo.description,
        unitNumber: clo.unitNumber,
        bloomLevelId: clo.bloomLevelId, // ✅ This now contains the full populated object
        learningLevel: clo.learningLevel,
        graduateAttribute: clo.graduateAttribute,
        isLabCLO: clo.isLabCLO
      })),
      course: {
        _id: course._id,
        courseCode: course.courseCode,
        courseTitle: course.courseTitle
      },
      count: clos.length
    });
  } catch (error) {
    console.error("❌ Error fetching CLOs:", error);
    res.status(500).json({ error: "Failed to fetch CLOs", details: error.message });
  }
};

exports.reExtractCLOs = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!courseId) return res.status(400).json({ error: "Course ID is required" });

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ error: "Course not found" });

    if (!course.extractedText) {
      return res.status(400).json({ error: "No extracted text available. Please upload a syllabus first." });
    }

    console.log(`🔄 Re-extracting CLOs for course: ${course.courseCode}`);

    // ✅ FIXED: Delete only course-specific CLOs, NOT universal Bloom levels
    await CLO.deleteMany({ courseId });
    // ❌ REMOVED: Don't delete universal Bloom levels
    // await BloomTaxonomy.deleteMany({ courseId }); 

    // Re-parse CLOs
    const clos = await parseCLOsFromText(course.extractedText, course);

    // Reload CLOs with population
    const populatedClos = await CLO.find({ courseId: course._id }).populate('bloomLevelId');

    res.status(200).json({
      success: true,
      message: "CLOs re-extracted successfully",
      closExtracted: clos.length,
      clos: populatedClos.map(clo => ({
        _id: clo._id,
        cloNumber: clo.cloNumber,
        description: clo.description,
        bloomLevelId: clo.bloomLevelId // Now populated
      }))
    });
  } catch (error) {
    console.error("❌ Error re-extracting CLOs:", error);
    res.status(500).json({ error: "Failed to re-extract CLOs", details: error.message });
  }
};

// ===================== UPLOAD SYLLABUS =====================
exports.uploadSyllabus = async (req, res) => {
  let tempFilePath = null;

  try {
    console.log("📡 Mongo readyState at upload start:", mongoose.connection.readyState);
    console.log("📥 Upload request received. File?:", !!req.file, "Body keys:", Object.keys(req.body));

    // CRITICAL: Check if file exists FIRST before accessing req.body
    if (!req.file) {
      console.error("❌ No file provided in multipart request");
      return res.status(400).json({ error: "No PDF file uploaded" });
    }

    console.log("✅ File received:", req.file.originalname, "Size:", req.file.size, "bytes");
    console.log("📁 File saved to:", req.file.path);
    tempFilePath = req.file.path;

    // NOW it's safe to access req.body (after multer has finished)
    const { courseCode, courseTitle, creditHours, description, teacherId, courseId, externalCourseId } = req.body;

    console.log("📋 Request body:", {
      courseCode,
      courseTitle,
      creditHours,
      teacherId,
      courseId: courseId || 'new course'
    });

    if (!courseTitle || !teacherId) {
      return res.status(400).json({ error: "Missing required fields: courseTitle, teacherId" });
    }

    // Wait a moment to ensure file is fully written (especially on Windows)
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify file exists and is readable
    if (!fs.existsSync(req.file.path)) {
      console.error("❌ File not found after upload:", req.file.path);
      return res.status(500).json({ error: "File upload failed - file not found" });
    }

    console.log("📄 Reading PDF file...");

    // Read PDF file (multer has already saved it)
    const dataBuffer = await fsp.readFile(req.file.path);
    console.log("📄 PDF buffer size:", dataBuffer.length, "bytes");

    // Parse PDF
    console.log("🔍 Parsing PDF...");
    const pdfData = await pdfParse(dataBuffer);
    const extractedText = pdfData.text || "";
    console.log("📄 Extracted syllabus text length:", extractedText.length, "characters");

    // Extract course code from PDF if present
    let finalCourseCode = courseCode;
    const codeMatch = extractedText.match(/Course Code[:\s]*([A-Z0-9\-]+)/i);
    if (codeMatch) {
      finalCourseCode = codeMatch[1].trim();
      console.log("📝 Course code found in PDF:", finalCourseCode);
    }

    const normalizedCourseCode = (finalCourseCode || courseCode || 'UNKNOWN').trim().toUpperCase();
    const syllabusURL = `http://localhost:5000/api/courses/syllabus/${path.basename(req.file.path)}`;

    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      console.warn("⚠️ Mongoose not connected - skipping DB upsert");
      return res.status(503).json({
        success: false,
        message: "Database not connected. Try again later.",
        syllabusURL,
        extractedText
      });
    }

    console.log("🟢 MongoDB connected. Upserting course...");

    // Upsert course with maxTimeMS to prevent buffering issues
    const course = await Course.findOneAndUpdate(
      { courseCode: normalizedCourseCode, teacherId },
      {
        courseTitle,
        creditHours: creditHours || 0,
        description: description || '',
        syllabusPdfUrl: req.file.path,
        extractedText,
        status: 'active',
        department: 'Computer Science',
        syllabusUploadedAt: new Date()
      },
      { new: true, upsert: true, maxTimeMS: 20000 } // 20s timeout
    );

    console.log(`✅ Course created/updated: ${course.courseCode} (ID: ${course._id})`);

    // ✅ FIXED: Delete by courseId to avoid ambiguity and ensure all CLOs for this specific course doc are removed
    const deletedClos = await CLO.deleteMany({ courseId: course._id });
    console.log(`🗑️ Deleted ${deletedClos.deletedCount} old CLOs`);

    // Parse CLOs from extracted text
    console.log("🔍 Parsing CLOs from extracted text...");
    const clos = await parseCLOsFromText(extractedText, course);
    console.log(`✅ Extracted ${clos.length} CLOs`);

    // Reload CLOs with population to ensure frontend gets full objects
    const populatedClos = await CLO.find({ courseId: course._id }).populate('bloomLevelId');

    // Notify registered students after syllabus upload completes.
    // We need the Firestore course doc id (`externalCourseId`) to match users.registeredCourses.
    try {
      const extId = String(externalCourseId || "").trim();
      if (extId) {
        let teacherName = "Teacher";
        try {
          const tDoc = await firestore.collection("users").doc(String(teacherId)).get();
          if (tDoc.exists) {
            const tData = tDoc.data() || {};
            teacherName = tData.name || tData.fullName || tData.email || teacherName;
          }
        } catch (_) {}

        await notifyCourseUpdated(
          {
            id: extId, // Firestore course doc id
            courseCode: course.courseCode,
            courseTitle: course.courseTitle,
            courseName: course.courseTitle,
          },
          String(teacherId),
          teacherName,
          "syllabus"
        );
      } else {
        console.warn("⚠️ uploadSyllabus: missing externalCourseId; skipping student notifications");
      }
    } catch (e) {
      console.warn("⚠️ uploadSyllabus: failed to notify students:", e?.message || e);
    }

    res.status(200).json({
      success: true,
      message: "Syllabus uploaded successfully",
      course: {
        _id: course._id,
        courseCode: course.courseCode,
        courseTitle: course.courseTitle,
        creditHours: course.creditHours,
        description: course.description
      },
      closExtracted: clos.length,
      clos: populatedClos.map(clo => ({
        _id: clo._id,
        cloNumber: clo.cloNumber,
        unitNumber: clo.unitNumber,
        description: clo.description,
        bloomLevelId: clo.bloomLevelId, // Now populated
        learningLevel: clo.learningLevel,
        graduateAttribute: clo.graduateAttribute,
        isLabCLO: clo.isLabCLO
      })),
      syllabusURL
    });

  } catch (error) {
    console.error("❌ Upload Error:", error);
    console.error("❌ Error stack:", error.stack);

    // Clean up temp file on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log("🗑️ Cleaned up temp file after error");
      } catch (cleanupError) {
        console.error("⚠️ Failed to cleanup temp file:", cleanupError);
      }
    }

    res.status(500).json({
      error: "Failed to upload syllabus",
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ===================== GET ALL CLOs =====================
exports.getAllCLOsWithCourses = async (req, res) => {
  try {
    const { teacherId } = req.query;
    const courses = await Course.find(teacherId ? { teacherId } : {});
    const courseIds = courses.map(c => c._id);

    // ✅ FIX: Populate bloomLevelId
    const clos = await CLO.find({ courseId: { $in: courseIds } })
      .populate('bloomLevelId')
      .sort({ courseId: 1, cloNumber: 1 });

    const closWithCourseInfo = clos.map(clo => {
      const course = courses.find(c => c._id.equals(clo.courseId));
      return {
        ...clo.toObject(),
        course: course ? { courseCode: course.courseCode, courseTitle: course.courseTitle } : null
      };
    });

    res.status(200).json({ success: true, clos: closWithCourseInfo, count: closWithCourseInfo.length });
  } catch (error) {
    console.error("Error fetching CLOs:", error);
    res.status(500).json({ error: "Failed to fetch CLOs", details: error.message });
  }
};

// ===================== GET SYLLABUS STATUS =====================
exports.getSyllabusStatus = async (req, res) => {
  try {
    const { teacherId } = req.params;
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📋 [GET STATUS] Fetching syllabus status for teacherId: ${teacherId}`);
    console.log(`${'='.repeat(70)}`);

    const courses = await Course.find({ teacherId }).lean();
    console.log(`📋 [GET STATUS] Found ${courses.length} courses in MongoDB for this teacher\n`);

    // Log each course in MongoDB
    if (courses.length === 0) {
      console.log(`⚠️ [GET STATUS] No courses found! Check if teacherId is correct.`);
    }

    const syllabusStatus = await Promise.all(courses.map(async (course) => {
      const cloCount = await CLO.countDocuments({ courseCode: course.courseCode });
      const hasSyllabus = typeof course.syllabusPdfUrl === 'string' && course.syllabusPdfUrl.trim() !== '';

      console.log(`\n📊 [MONGO COURSE] ${course.courseCode}`);
      console.log(`   ├─ ID: ${course._id}`);
      console.log(`   ├─ Title: ${course.courseTitle || 'N/A'}`);
      console.log(`   ├─ syllabusPdfUrl: ${course.syllabusPdfUrl ? `✓ SET (${course.syllabusPdfUrl.substring(0, 50)}...)` : '✗ NOT SET'}`);
      console.log(`   ├─ hasSyllabus: ${hasSyllabus ? '✓ YES' : '✗ NO'}`);
      console.log(`   ├─ CLO Count: ${cloCount}`);
      console.log(`   ├─ syllabusUploadedAt: ${course.syllabusUploadedAt || 'N/A'}`);
      console.log(`   └─ updatedAt: ${course.updatedAt || 'N/A'}`);

      const statusObj = {
        courseCode: course.courseCode,
        courseTitle: course.courseTitle,
        courseId: course._id.toString(),
        hasSyllabus,
        syllabusUrl: hasSyllabus ? `http://localhost:5000/api/courses/syllabus/${path.basename(course.syllabusPdfUrl)}` : null,
        closExtracted: cloCount,
        syllabusUploadedAt: course.syllabusUploadedAt || course.updatedAt || null
      };

      return statusObj;
    }));

    const codesWithSyllabus = syllabusStatus.filter(s => s.hasSyllabus).map(s => s.courseCode);
    console.log(`\n✅ [GET STATUS] ${codesWithSyllabus.length} courses have syllabi:`);
    codesWithSyllabus.forEach(code => console.log(`   • ${code}`));
    console.log(`${'='.repeat(70)}\n`);

    res.status(200).json({ success: true, syllabusStatus });
  } catch (error) {
    console.error(`❌ [GET STATUS] Error fetching syllabus status:`, error);
    res.status(500).json({ error: "Failed to fetch syllabus status", details: error.message });
  }
};

// ===================== GET BLOOM LEVELS =====================
// ✅ FIXED: Return universal Bloom levels (not course-specific)
exports.getBloomLevels = async (req, res) => {
  try {
    // ✅ FIX: Bloom levels are universal, not course-specific
    // Get all active Bloom levels sorted by level number
    const bloomLevels = await BloomTaxonomy.find({}).sort({ levelNumber: 1 });

    console.log(`✅ Fetched ${bloomLevels.length} universal Bloom levels`);

    res.status(200).json({
      success: true,
      bloomLevels,
      count: bloomLevels.length
    });
  } catch (error) {
    console.error("❌ Error fetching bloom levels:", error);
    res.status(500).json({
      error: "Failed to fetch bloom levels",
      details: error.message
    });
  }
};

// ===================== DELETE SYLLABUS =====================
exports.deleteSyllabus = async (req, res) => {
  try {
    const { courseCode } = req.query;
    const { teacherId } = req.body;

    if (!courseCode || !teacherId) {
      return res.status(400).json({ error: "Course code and teacher ID are required" });
    }

    // Find course in MongoDB
    const course = await Course.findOne({ courseCode, teacherId });
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    console.log(`🗑️ Deleting syllabus for course: ${course.courseCode}`);

    // Delete physical file if exists
    if (course.syllabusPdfUrl && fs.existsSync(course.syllabusPdfUrl)) {
      try {
        fs.unlinkSync(course.syllabusPdfUrl);
        console.log(`✅ Syllabus file deleted: ${course.syllabusPdfUrl}`);
      } catch (fileError) {
        console.warn(`⚠️ Failed to delete file: ${fileError.message}`);
      }
    }

    // Clear syllabus and extracted text from MongoDB
    course.syllabusPdfUrl = null;
    course.extractedText = null;
    await course.save();

    // ✅ FIXED: Delete only CLOs, NOT universal Bloom levels
    const deletedClos = await CLO.deleteMany({ courseCode: course.courseCode });
    console.log(`✅ Deleted ${deletedClos.deletedCount} CLOs`);

    // ❌ REMOVED: Don't delete universal Bloom levels
    // const deletedBlooms = await BloomTaxonomy.deleteMany({ courseCode: course.courseCode });

    // Get all active courses for this teacher
    const allCourses = await Course.find({ teacherId, status: 'active' });
    const syllabusStatus = await Promise.all(allCourses.map(async (c) => {
      const cloCount = await CLO.countDocuments({ courseCode: c.courseCode });
      return {
        courseCode: c.courseCode,
        courseId: c._id,
        hasSyllabus: !!c.syllabusPdfUrl,
        syllabusUrl: c.syllabusPdfUrl ? `http://localhost:5000/api/courses/syllabus/${path.basename(c.syllabusPdfUrl)}` : null,
        closExtracted: cloCount,
        syllabusUploadedAt: c.syllabusUploadedAt || c.updatedAt || null
      };
    }));

    const totalSyllabi = syllabusStatus.filter(s => s.hasSyllabus).length;

    res.status(200).json({
      success: true,
      message: "Syllabus deleted successfully",
      courseCode: course.courseCode,
      syllabusStatus,
      totalSyllabi
    });
  } catch (error) {
    console.error("❌ Delete syllabus error:", error);
    res.status(500).json({ error: "Failed to delete syllabus", details: error.message });
  }
};

// ===================== DELETE COURSE (CASCADE) =====================
exports.deleteCourse = async (req, res) => {
  try {
    const { courseCode } = req.query;
    const { teacherId } = req.body;

    if (!courseCode || !teacherId) {
      return res.status(400).json({ error: "Course code and teacher ID are required" });
    }

    // Find course in MongoDB
    const course = await Course.findOne({ courseCode, teacherId });
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    console.log(`🗑️ Cascading delete for course: ${course.courseCode}`);

    // Phase 1: Delete from MongoDB
    // Delete all CLOs for this course
    const deletedClos = await CLO.deleteMany({ courseCode: course.courseCode });
    console.log(`✅ Deleted ${deletedClos.deletedCount} CLOs`);

    // ✅ FIXED: Don't delete universal Bloom levels
    // ❌ REMOVED: const deletedBlooms = await BloomTaxonomy.deleteMany({ courseCode: course.courseCode });

    // Delete physical syllabus file if exists
    if (course.syllabusPdfUrl && fs.existsSync(course.syllabusPdfUrl)) {
      try {
        fs.unlinkSync(course.syllabusPdfUrl);
        console.log(`✅ Syllabus file deleted: ${course.syllabusPdfUrl}`);
      } catch (fileError) {
        console.warn(`⚠️ Failed to delete file: ${fileError.message}`);
      }
    }

    // Delete the course itself from MongoDB
    const deletedCourse = await Course.findByIdAndDelete(course._id);
    console.log(`✅ Course deleted from MongoDB: ${course.courseCode}`);

    // Phase 2: Remove course references from Firestore (cascade to students)
    try {
      // Find all Firestore courses matching this course code
      const coursesSnap = await firestore.collection('courses').where('courseCode', '==', courseCode).get();

      if (!coursesSnap.empty) {
        const firestoreCourseId = coursesSnap.docs[0].id;
        console.log(`🗑️ Found Firestore course: ${firestoreCourseId}`);

        // Find all students who have this course in their registeredCourses
        const studentsSnap = await firestore.collection('users').where('registeredCourses', 'array-contains', firestoreCourseId).get();
        console.log(`🗑️ Found ${studentsSnap.docs.length} students to update`);

        // Remove course from each student's registeredCourses
        const batch = firestore.batch();
        studentsSnap.docs.forEach(studentDoc => {
          const studentRef = firestore.collection('users').doc(studentDoc.id);
          const currentCourses = studentDoc.data().registeredCourses || [];
          const updatedCourses = currentCourses.filter((cId) => cId !== firestoreCourseId);

          batch.update(studentRef, { registeredCourses: updatedCourses });
          console.log(`  ✅ Removed ${courseCode} from student: ${studentDoc.data().email || studentDoc.id}`);
        });
        await batch.commit();
        console.log(`✅ Updated ${studentsSnap.docs.length} students in Firestore`);

        // Delete the Firestore course document itself
        await firestore.collection('courses').doc(firestoreCourseId).delete();
        console.log(`✅ Firestore course document deleted: ${firestoreCourseId}`);
      }
    } catch (firestoreError) {
      console.error("⚠️ Firestore cascade delete error (non-fatal):", firestoreError.message);
      // Continue anyway - MongoDB deletion is the primary concern
    }

    res.status(200).json({
      success: true,
      message: "Course deleted successfully with cascade",
      courseCode: course.courseCode,
      deleted: {
        clos: deletedClos.deletedCount,
        course: !!deletedCourse
      }
    });
  } catch (error) {
    console.error("❌ Delete course error:", error);
    res.status(500).json({ error: "Failed to delete course", details: error.message });
  }
};

// ===================== UPLOAD COURSE MATERIAL =====================
exports.uploadCourseMaterial = async (req, res) => {
  const DEBUG = true; // Set to false to disable debugging
  const timestamp = new Date().toISOString();
  
  const log = (level, msg, data = {}) => {
    const prefix = `[PHASE1-${level}] ${timestamp}`;
    if (DEBUG || level === 'ERROR' || level === 'WARN') {
      console.log(`${prefix} ${msg}`, Object.keys(data).length ? data : '');
    }
  };

  try {
    log('START', '📤 uploadCourseMaterial called');
    
    if (!req.file) {
      log('ERROR', 'No material file uploaded');
      return res.status(400).json({ error: "No material file uploaded" });
    }

    // Hard gate: only accept PPTX and PDF uploads (do not create Mongo records for other types).
    const uploadExtGate = path.extname(req.file.originalname || "").toLowerCase();
    const allowedExts = new Set([".pptx", ".pdf"]);
    const isAllowedMime =
      req.file.mimetype === "application/pdf" ||
      req.file.mimetype === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      req.file.mimetype === "application/octet-stream";

    if (!allowedExts.has(uploadExtGate) || !isAllowedMime) {
      log("WARN", "Rejected unsupported course material upload", {
        ext: uploadExtGate,
        mimeType: req.file.mimetype,
        fileName: req.file.originalname,
      });
      return res.status(400).json({
        success: false,
        error: "Only PPTX and PDF is allowed",
      });
    }

    const { teacherId, courseId, mongoCourseId, courseCode, courseName, sourceType, enableOcr } = req.body;
    log('INFO', '📋 Request parameters received', {
      teacherId: teacherId?.substring(0, 10) + '...',
      courseId: courseId?.substring(0, 10) + '...',
      mongoCourseId,
      courseCode,
      file: req.file.originalname,
      fileSize: `${(req.file.size / 1024).toFixed(2)} KB`,
      mimeType: req.file.mimetype
    });

    const enableOcrFlag = String(enableOcr ?? "true").toLowerCase();
    let shouldEnableOcr = enableOcrFlag !== "0" && enableOcrFlag !== "false" && enableOcrFlag !== "no" && enableOcrFlag !== "off";
    log('INFO', `✅ OCR ${shouldEnableOcr ? 'ENABLED' : 'DISABLED'}`);

    if (!teacherId || (!courseId && !mongoCourseId && !courseCode)) {
      log('ERROR', 'Missing teacherId or course identifier');
      return res.status(400).json({ error: "teacherId and course identifier are required" });
    }

    const normalizedSourceType = sourceType === "book" ? "book" : "slides";
    let mongoCourse = null;
    log('INFO', `Source type: ${normalizedSourceType}`);

    // Step 1: Find or create MongoDB course
    log('INFO', '🔍 Step 1: Finding course in MongoDB');
    if (mongoCourseId) {
      mongoCourse = await Course.findOne({ _id: mongoCourseId, teacherId });
      log('INFO', mongoCourse ? `✓ Found course by mongoCourseId` : `✗ Course not found by mongoCourseId`);
    }

    if (!mongoCourse && courseCode) {
      mongoCourse = await Course.findOne({ courseCode: courseCode.trim().toUpperCase(), teacherId });
      log('INFO', mongoCourse ? `✓ Found course by courseCode` : `✗ Course not found by courseCode`);
    }

    // Ensure material always has a valid Mongo course relation.
    if (!mongoCourse) {
      log('WARN', '⚠️ Course not found, creating fallback course');
      const fallbackCourseCode = (courseCode || "COURSE").trim().toUpperCase();
      mongoCourse = await Course.findOneAndUpdate(
        { courseCode: fallbackCourseCode, teacherId },
        {
          courseTitle: courseName || fallbackCourseCode,
          status: "active",
        },
        { new: true, upsert: true }
      );
      log('INFO', `✓ Fallback course created/updated: ${mongoCourse._id}`);
    }

    // EXTRACT course code and name directly from the Course document (source of truth)
    // If a legacy/fallback course exists with code "N/A"/"COURSE", prefer Firestore (externalCourseId).
    let extractedCourseCode = mongoCourse.courseCode || "";
    let extractedCourseName = mongoCourse.courseTitle || "";

    const normalizedCode = String(extractedCourseCode || "").trim().toUpperCase();
    const looksInvalidCode = !normalizedCode || normalizedCode === "N/A" || normalizedCode === "COURSE" || normalizedCode === "UNKNOWN";
    const fsCourseId = String(courseId || "").trim(); // In this API, `courseId` is Firestore course doc id (externalCourseId)
    if (fsCourseId && looksInvalidCode) {
      try {
        const fsSnap = await firestore.collection("courses").doc(fsCourseId).get();
        if (fsSnap.exists) {
          const fsCourse = fsSnap.data() || {};
          const fsCode = String(fsCourse.courseCode || fsCourse.courseId || "").trim();
          const fsName = String(fsCourse.courseName || fsCourse.courseTitle || "").trim();
          if (fsCode) extractedCourseCode = fsCode.toUpperCase();
          if (fsName) extractedCourseName = fsName;

          // Keep Mongo Course consistent so next uploads won't inherit "N/A".
          if (fsCode && looksInvalidCode) {
            try {
              await Course.updateOne(
                { _id: mongoCourse._id },
                { $set: { courseCode: fsCode.toUpperCase(), ...(fsName ? { courseTitle: fsName } : {}) } }
              );
              mongoCourse.courseCode = fsCode.toUpperCase();
              if (fsName) mongoCourse.courseTitle = fsName;
            } catch (_) {}
          }
        }
      } catch (e) {
        log("WARN", "Firestore fallback for courseCode failed", {
          externalCourseId: fsCourseId,
          error: e?.message || String(e),
        });
      }
    }
    
    log('INFO', '✅ Course metadata extracted', {
      extractedCourseCode,
      extractedCourseName,
      courseId: mongoCourse._id
    });

    // ✅ Step 1.5: Check for duplicate uploads (same filename in same course)
    log('INFO', '🔍 Step 1.5: Checking for duplicate uploads');
    const existingMaterial = await CourseMaterial.findOne({
      teacherId,
      courseId: mongoCourse._id,
      originalFileName: req.file.originalname,
      processingStatus: { $in: ["uploaded", "extracted", "embedded"] }
    });

    if (existingMaterial) {
      log('WARN', '⚠️ DUPLICATE UPLOAD DETECTED');
      log('WARN', 'Material with same filename already exists in this course', {
        existingMaterialId: existingMaterial._id,
        fileName: existingMaterial.originalFileName,
        status: existingMaterial.processingStatus,
        createdAt: existingMaterial.createdAt
      });

      return res.status(200).json({
        success: false,
        isDuplicate: true,
        message: "The slide is already uploaded",
        details: {
          existingMaterialId: existingMaterial._id,
          fileName: existingMaterial.originalFileName,
          uploadedAt: existingMaterial.createdAt,
          status: existingMaterial.processingStatus
        }
      });
    }

    log('INFO', '✅ No duplicate found - proceeding with upload');

    const materialUrl = `http://localhost:5000/api/courses/materials/${req.file.filename}`;

    // We'll clean up these records if Phase-1 fails.
    let material = null;
    let rawDoc = null;

    material = await CourseMaterial.create({
      teacherId,
      courseId: mongoCourse._id,
      externalCourseId: courseId || "",
      courseCode: extractedCourseCode,
      courseName: extractedCourseName,
      sourceType: normalizedSourceType,
      originalFileName: req.file.originalname,
      storedFileName: req.file.filename,
      filePath: req.file.path,
      fileUrl: materialUrl,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });
    log('INFO', `📁 Step 2: Created CourseMaterial record`, {
      materialId: material._id,
      fileName: material.originalFileName,
      courseId: material.courseId
    });

    // IMPORTANT: do NOT notify on upload receipt.
    // We notify only once after Phase-1 completes (extraction+ingestion).

    rawDoc = await CourseMaterialRaw.create({
      materialId: material._id,
      courseId: mongoCourse._id,
      teacherId,
      extractionStatus: "pending",
      rawText: "",
    });
    log('INFO', `📝 Step 3: Created CourseMaterialRaw record`, {
      rawDocId: rawDoc._id,
      status: rawDoc.extractionStatus
    });

    // First extraction pass for supported files (PDF/PPTX) to store raw text and metadata in Mongo.
    let extractionInfo = null;
    let ingestion = {
      status: "skipped",
      note: "Ingestion runs after successful PDF/PPTX extraction",
    };
    // Some clients (especially on Windows) may send PPTX as `application/octet-stream`.
    // Use extension as the source of truth.
    const uploadExt = path.extname(req.file.originalname || "").toLowerCase();
    const isExtractableByMime = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/octet-stream",
    ].includes(req.file.mimetype);
    // Extractor should run only for PDF and PPTX.
    const isExtractableByExt = [".pdf", ".pptx"].includes(uploadExt);
    const isExtractableMaterial = isExtractableByExt || isExtractableByMime;

    log(
      'INFO',
      isExtractableMaterial
        ? '🔍 Step 4: EXTRACTION - Starting text extraction'
        : '⏭️  Step 4: EXTRACTION - Skipped (unsupported material type)',
      {
        mimeType: req.file.mimetype,
        ext: uploadExt,
      }
    );

    if (isExtractableMaterial) {
      // ===== PRE-EXTRACTION ENVIRONMENT VALIDATION =====
      const envStatus = getExtractionEnvironmentStatus();
      
      if (!envStatus.extraction.ready) {
        log('ERROR', '❌ EXTRACTION ENVIRONMENT NOT READY', {
          pythonFound: envStatus.extraction.pythonFound,
          pythonPath: envStatus.extraction.pythonPath,
          scriptExists: envStatus.extraction.scriptExists,
          scriptPath: envStatus.extraction.scriptPath,
        });

        // Keep records for visibility/debugging; mark them failed instead of deleting.
        const errorMsg = `Extraction environment not ready. Python: ${envStatus.extraction.pythonFound ? '✓' : '✗'}, Script: ${envStatus.extraction.scriptExists ? '✓' : '✗'}`;
        log('ERROR', errorMsg);

        try {
          if (rawDoc?._id) {
            await CourseMaterialRaw.findByIdAndUpdate(
              rawDoc._id,
              {
                extractionStatus: "failed",
                extractionError: errorMsg,
                faissIngestionStatus: "failed",
                faissIngestionError: "Extraction environment not ready",
              },
              { new: false }
            );
          }
          if (material?._id) {
            await CourseMaterial.findByIdAndUpdate(
              material._id,
              {
                processingStatus: "failed",
                ingestError: errorMsg,
                updatedAt: new Date(),
              },
              { new: false }
            );
          }
        } catch (_) {}

        // Remove uploaded file to avoid disk buildup.
        try {
          if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        } catch (_) {}

        res.status(500).json({
          success: false,
          error: errorMsg,
          materialId: material?._id,
          rawId: rawDoc?._id,
          details: {
            pythonPath: envStatus.extraction.pythonPath,
            scriptPath: envStatus.extraction.scriptPath,
            environmentStatus: envStatus,
          },
        });
        return;
      }

      // If OCR is enabled, validate OCR environment
      if (shouldEnableOcr && !envStatus.ocr.ready) {
        log('WARN', '⚠️ OCR ENVIRONMENT NOT READY - Disabling OCR for this upload', {
          tesseractPath: envStatus.ocr.tesseractPath,
          tessdataPrefix: envStatus.ocr.tessdataPrefix,
        });
        
        log('WARN', 'To enable OCR:');
        log('WARN', '  1. Install Tesseract-OCR from: https://github.com/UB-Mannheim/tesseract/wiki');
        log('WARN', '  2. Set TESSERACT_CMD environment variable');
        log('WARN', '  3. Verify TESSDATA_PREFIX points to tessdata folder');
        
        // Continue with OCR disabled
        shouldEnableOcr = false;
      }

      try {
        log('DEBUG', 'Calling extractTextFromMaterial', {
          filePath: req.file.path,
          enableOcr: shouldEnableOcr,
          pythonBin: envStatus.extraction.pythonPath,
          scriptPath: envStatus.extraction.scriptPath,
        });
        
        const extractStartTime = Date.now();
        extractionInfo = await extractTextFromMaterial(req.file.path, {
          enableOcr: shouldEnableOcr,
        });
        const extractDuration = Date.now() - extractStartTime;
        
        log('SUCCESS', '✅ TEXT EXTRACTION COMPLETED', {
          duration: `${extractDuration}ms`,
          pageCount: extractionInfo.page_count,
          charCount: extractionInfo.char_count,
          extractor: extractionInfo.extractor,
          ocrEnabled: extractionInfo.ocr_enabled,
          ocrChars: extractionInfo.ocr_char_count
        });

        rawDoc.extractionStatus = "completed";
        rawDoc.extractor = extractionInfo.extractor || "";
        rawDoc.pageCount = extractionInfo.page_count || 0;
        rawDoc.charCount = extractionInfo.char_count || 0;
        rawDoc.extractionDurationMs = extractionInfo.duration_ms || 0;
        rawDoc.rawText = extractionInfo.text || "";
        rawDoc.pageMetadata = extractionInfo.pages || [];
        rawDoc.equationCount = extractionInfo.equation_count || 0;
        rawDoc.visualCount = extractionInfo.visual_count || 0;
        rawDoc.ocrCount = extractionInfo.ocr_count || 0;
        rawDoc.ocrCharCount = extractionInfo.ocr_char_count || 0;
        rawDoc.ocrEnabled = !!extractionInfo.ocr_enabled;
        rawDoc.ocrStatus = extractionInfo.ocr_status || "";
        rawDoc.ocrError = extractionInfo.ocr_error || "";
        rawDoc.sourceFormat = extractionInfo.source_format || "";
        rawDoc.extractedAt = new Date();
        rawDoc.extractionError = "";
        rawDoc.faissIngestionStatus = "pending";
        rawDoc.faissChunkCount = 0;
        rawDoc.faissIngestionError = "";
        await rawDoc.save();
        log('INFO', '💾 Saved extraction metadata to MongoDB');

        material.processingStatus = "extracted";
        await material.save();
        log('INFO', '📋 Updated CourseMaterial status to "extracted"');

        // Auto-ingest extracted material into FAISS for semantic retrieval (ASYNC - non-blocking)
        log('INFO', '🧠 Step 5: INGESTION - Starting background ingestion (non-blocking)');
        
        // Estimate chunks based on text size (assuming ~400-token chunks)
        const estimatedChunks = Math.ceil((extractionInfo.char_count || 0) / 2000);
        
        ingestion = {
          status: "queued",
          note: `Processing ${estimatedChunks} chunks in background...`,
          estimatedChunks: estimatedChunks,
          phase: "embedding"
        };

        // Start ingestion in background WITHOUT awaiting
        if (isIngestionReady()) {
          // Store material ID for use in background process
          const materialIdForIngest = material._id.toString();
          const courseIdForIngest = mongoCourse._id.toString();
          
          // Fire and forget - don't block the response
          ingestMaterialAfterUpload(materialIdForIngest)
            .then(async (ingestResult) => {
              const createdChunks = Number(ingestResult.total_chunks_created || 0);
              const createdEmbeddings = Number(ingestResult.total_embeddings_created || 0);
              const skippedReasons = ingestResult?.skipped_reasons || {};
              const benignSkip =
                Number(skippedReasons?.already_ingested || 0) > 0 ||
                Number(skippedReasons?.global_duplicate || 0) > 0;

              // Robust fallback: if Python updated Mongo with a benign status but Node
              // couldn't infer it (e.g. missing skipped_reasons), trust Mongo status.
              let mongoBenign = false;
              try {
                const rawAfter = await CourseMaterialRaw.findOne({ materialId: materialIdForIngest }).select(
                  "faissIngestionStatus referencesDocumentId"
                );
                const st = String(rawAfter?.faissIngestionStatus || "");
                mongoBenign =
                  st === "global_duplicate" ||
                  st === "already_ingested" ||
                  (st === "completed" && !!rawAfter?.referencesDocumentId);
              } catch (_) {}

              const ingestionSucceeded = createdChunks > 0 || benignSkip || mongoBenign;

              log('SUCCESS', '✅ BACKGROUND INGESTION COMPLETED', {
                materialId: materialIdForIngest,
                courseId: courseIdForIngest,
                documentsProcessed: ingestResult.processed || ingestResult.processed_count || 0,
                skipped: ingestResult.skipped || ingestResult.skipped_count || 0,
                errors: ingestResult.errors?.length || 0,
                totalChunksCreated: createdChunks,
                totalEmbeddingsCreated: createdEmbeddings,
              });

              if (!ingestionSucceeded) {
                log('WARN', '⚠️ INGESTION RETURNED 0 CHUNKS', {
                  materialId: materialIdForIngest,
                  courseId: courseIdForIngest,
                  processed: ingestResult.processed || ingestResult.processed_count || 0,
                  skipped: ingestResult.skipped || ingestResult.skipped_count || 0,
                  note: 'Marking ingestion as failed to avoid false success state'
                });
              }
              
              // Update both CourseMaterial and CourseMaterialRaw status
              Promise.all([
                CourseMaterial.findByIdAndUpdate(
                  materialIdForIngest,
                  {
                    processingStatus: ingestionSucceeded ? "embedded" : "extracted",
                    ...(ingestionSucceeded
                      ? {}
                      : {
                          ingestError:
                            Number(skippedReasons?.empty_raw_text || 0) > 0
                              ? "Ingestion skipped: extracted text is empty (scanned PDF?). Try enabling OCR or upload a text-based PDF."
                              : "Ingestion produced 0 chunks; verify extracted text/chunking pipeline",
                        }),
                    updatedAt: new Date()
                  },
                  { new: true }
                ),
                CourseMaterialRaw.findOneAndUpdate(
                  { materialId: materialIdForIngest },
                  { 
                    faissIngestionStatus: ingestionSucceeded ? "completed" : "failed",
                    faissChunkCount: createdChunks,
                    numChunks: createdChunks,
                    numEmbeddings: createdEmbeddings,
                    ...(ingestionSucceeded
                      ? { faissIngestionError: benignSkip ? "Already ingested (deduplicated)" : "" }
                      : {
                          faissIngestionError:
                            Number(skippedReasons?.empty_raw_text || 0) > 0
                              ? "Extracted text is empty; enable OCR or use a text-based PDF."
                              : "Ingestion produced 0 chunks; verify extracted text/chunking pipeline",
                        }),
                    updatedAt: new Date()
                  },
                  { new: true }
                )
              ]).then(([updatedMaterial, updatedRaw]) => {
                log('SUCCESS', `✅ Updated both records after ingestion`, {
                  materialId: materialIdForIngest,
                  materialStatus: updatedMaterial?.processingStatus,
                  rawStatus: updatedRaw?.faissIngestionStatus,
                  chunks: updatedRaw?.numChunks,
                  embeddings: updatedRaw?.numEmbeddings
                });

                // Notify admins/students ONLY when Phase-1 is truly complete.
                if (ingestionSucceeded) {
                  notifyCourseMaterialUploaded(updatedMaterial || material, mongoCourse, teacherId)
                    .catch((notifErr) => {
                      log('WARN', '⚠️ Failed to create phase1-complete notification', { error: notifErr.message });
                    });
                }
              }).catch(err => {
                log('ERROR', '❌ Failed to update material statuses after ingestion', { 
                  materialId: materialIdForIngest,
                  error: err.message 
                });
              });
            })
            .catch((ingestErr) => {
              log('ERROR', '❌ BACKGROUND INGESTION FAILED', {
                materialId: materialIdForIngest,
                courseId: courseIdForIngest,
                error: ingestErr.message,
                errorType: ingestErr.constructor.name,
                stack: ingestErr.stack?.substring(0, 300)
              });
              
              // Update both CourseMaterial and CourseMaterialRaw with error status
              Promise.all([
                CourseMaterial.findByIdAndUpdate(
                  materialIdForIngest,
                  { processingStatus: "extracted", ingestError: ingestErr.message, updatedAt: new Date() },
                  { new: true }
                ),
                CourseMaterialRaw.findOneAndUpdate(
                  { materialId: materialIdForIngest },
                  { 
                    faissIngestionStatus: "failed",
                    faissIngestionError: ingestErr.message,
                    updatedAt: new Date()
                  },
                  { new: true }
                )
              ]).then(() => {
                log('INFO', `Updated both records with error status`, { 
                  materialId: materialIdForIngest 
                });
              }).catch(err => {
                log('ERROR', 'Failed to update material statuses after ingestion failure', { 
                  materialId: materialIdForIngest,
                  error: err.message 
                });
              });
            });
          
          log('INFO', '🚀 Ingestion pipeline queued in background (response sent immediately)', {
            materialId: materialIdForIngest,
            courseId: courseIdForIngest
          });
        } else {
          log('WARN', '⚠️ INGESTION ENVIRONMENT NOT READY', {
            status: 'Skipping FAISS indexing for this material',
            action: 'Material extracted successfully but embedding skipped'
          });
          
          log('WARN', 'To enable ingestion:');
          log('WARN', '  1. Verify Python 3.11 venv at: .venv-1');
          log('WARN', '  2. Check FAISS installation: pip list | grep -i faiss');
          log('WARN', '  3. Verify script exists: backend/rag_marking/ingest_materials_to_faiss.py');
          log('WARN', '  4. Ensure MongoDB is accessible');
          
          // Calculate estimated chunks anyway for display
          const estimatedChunks = Math.ceil((extractionInfo.char_count || 0) / 2000);
          
          ingestion = {
            status: "pending",
            note: `${estimatedChunks} chunks extracted, waiting for ingestion engine`,
            estimatedChunks: estimatedChunks,
            phase: "waiting",
            recommendation: "Material will be ingested when environment is ready. Run manual ingestion: python backend/rag_marking/ingest_materials_to_faiss.py --material-id <id>"
          };
        }
      } catch (extractErr) {
        log('ERROR', '❌ TEXT EXTRACTION FAILED', {
          error: extractErr.message,
          reason: extractErr.reason || extractErr.payload?.reason || null,
          errorType: extractErr.errorType || extractErr.payload?.error_type || null,
          exitCode: extractErr.exitCode ?? null,
          runtime: extractErr.runtime || null,
          stderr: extractErr.stderr ? String(extractErr.stderr).substring(0, 1200) : null,
          stdout: extractErr.stdout ? String(extractErr.stdout).substring(0, 1200) : null,
          stack: extractErr.stack?.substring(0, 200)
        });
        
        // Cleanup: don't keep failed Phase-1 records in Mongo.
        try {
          await CourseMaterialRaw.deleteOne({ _id: rawDoc._id });
          await CourseMaterial.deleteOne({ _id: material._id });
        } catch (_) {}
        try {
          if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        } catch (_) {}
        
        ingestion = {
          status: "failed",
          note: "Text extraction failed - no ingestion attempted",
          phase: "extraction_error"
        };
      }
    } else {
      // Cleanup: do not persist unsupported uploads in Mongo.
      try {
        await CourseMaterialRaw.deleteOne({ _id: rawDoc._id });
        await CourseMaterial.deleteOne({ _id: material._id });
      } catch (_) {}
      try {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      } catch (_) {}

      ingestion = {
        status: "failed",
        note: "Unsupported file type - no extraction/ingestion attempted",
        phase: "unsupported_type",
      };
    }

    res.status(200).json({
      success: true,
      message: "Course material uploaded successfully",
      material: {
        id: material._id,
        teacherId: material.teacherId,
        courseId: material.courseId,
        externalCourseId: material.externalCourseId,
        mongoCourseId: mongoCourse._id,
        courseCode: material.courseCode,
        courseName: material.courseName,
        sourceType: material.sourceType,
        originalFileName: material.originalFileName,
        fileUrl: material.fileUrl,
        fileSize: material.fileSize,
        mimeType: material.mimeType,
        processingStatus: material.processingStatus,
        createdAt: material.createdAt,
      },
      extraction: extractionInfo
        ? {
            status: "completed",
            extractor: extractionInfo.extractor,
            pageCount: extractionInfo.page_count,
            charCount: extractionInfo.char_count,
            equationCount: extractionInfo.equation_count || 0,
            visualCount: extractionInfo.visual_count || 0,
            ocrCount: extractionInfo.ocr_count || 0,
            ocrCharCount: extractionInfo.ocr_char_count || 0,
            ocrEnabled: !!extractionInfo.ocr_enabled,
            ocrStatus: extractionInfo.ocr_status || "disabled",
            ocrError: extractionInfo.ocr_error || null,
            sourceFormat: extractionInfo.source_format || "",
            durationMs: extractionInfo.duration_ms,
          }
        : {
            status: isExtractableMaterial ? "failed" : "pending",
            note:
              isExtractableMaterial
                ? "Extraction failed, see CourseMaterialRaw.extractionError"
                : "Extraction currently enabled for PDF and PPTX files",
          },
      ingestion,
    });
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[PHASE1-ERROR] ${timestamp}`, {
      message: '❌ PHASE 1 UPLOAD FAILED - Exception caught',
      error: error.message,
      stack: error.stack?.substring(0, 300)
    });
    res.status(500).json({
      success: false,
      error: "Failed to upload course material",
      details: error.message,
      debug: {
        timestamp,
        errorType: error.name,
        ingestion: {
          status: "failed",
          note: "Error during upload processing"
        }
      }
    });
  }
};

// ===================== QUERY COURSE MATERIAL CONTEXT =====================
exports.queryCourseMaterialContext = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { query, topK } = req.body;

    if (!courseId) {
      return res.status(400).json({ error: "courseId is required" });
    }

    if (!query || !String(query).trim()) {
      return res.status(400).json({ error: "query is required" });
    }

    const contextResult = await getContextForStudentQuery(String(query).trim(), String(courseId));

    const limitedResults = Array.isArray(contextResult.rawResults)
      ? contextResult.rawResults.slice(0, Number(topK) > 0 ? Number(topK) : 5)
      : [];

    return res.status(200).json({
      success: true,
      query: contextResult.query,
      courseId: contextResult.courseId,
      resultsFound: limitedResults.length,
      contextForLLM: contextResult.contextForLLM,
      results: limitedResults,
      timestamp: contextResult.timestamp,
      ...(contextResult.error ? { warning: contextResult.error } : {}),
    });
  } catch (error) {
    console.error("❌ Query material context error:", error);
    return res.status(500).json({
      error: "Failed to query course material context",
      details: error.message,
    });
  }
};

// ===================== QUERY MATERIAL CONTEXT (OPTIONAL COURSE HINT) =====================
exports.queryMaterialContext = async (req, res) => {
  try {
    const { query, topK, courseId, courseHint } = req.body;

    if (!query || !String(query).trim()) {
      return res.status(400).json({ error: "query is required" });
    }

    const requestedTopK = Number(topK) > 0 ? Number(topK) : 5;
    const normalizedQuery = String(query).trim();

    let resolvedCourseId = courseId ? String(courseId) : null;
    let resolvedCourse = null;

    // Resolve course by hint when ID is not supplied.
    if (!resolvedCourseId && courseHint && String(courseHint).trim()) {
      const hint = String(courseHint).trim();
      resolvedCourse = await Course.findOne({
        $or: [
          { courseCode: { $regex: `^${hint}$`, $options: "i" } },
          { courseTitle: { $regex: hint, $options: "i" } },
        ],
      }).select("_id courseCode courseTitle");

      if (resolvedCourse) {
        resolvedCourseId = String(resolvedCourse._id);
      }
    }

    // Course-specific retrieval when possible, otherwise global retrieval.
    if (resolvedCourseId) {
      const contextResult = await getContextForStudentQuery(normalizedQuery, resolvedCourseId);
      const limitedResults = Array.isArray(contextResult.rawResults)
        ? contextResult.rawResults.slice(0, requestedTopK)
        : [];

      return res.status(200).json({
        success: true,
        query: contextResult.query,
        courseId: resolvedCourseId,
        resolvedCourse: resolvedCourse
          ? {
              id: String(resolvedCourse._id),
              courseCode: resolvedCourse.courseCode,
              courseTitle: resolvedCourse.courseTitle,
            }
          : null,
        resultsFound: limitedResults.length,
        contextForLLM: contextResult.contextForLLM,
        results: limitedResults,
        timestamp: contextResult.timestamp,
        ...(contextResult.error ? { warning: contextResult.error } : {}),
      });
    }

    const rawResults = await queryMaterials(normalizedQuery, { topK: requestedTopK });
    return res.status(200).json({
      success: true,
      query: normalizedQuery,
      courseId: null,
      resolvedCourse: null,
      resultsFound: rawResults.length,
      contextForLLM: formatResultsForContext(rawResults),
      results: rawResults,
      timestamp: new Date().toISOString(),
      note: courseHint
        ? "No exact course match for courseHint; used global material retrieval"
        : "No courseId provided; used global material retrieval",
    });
  } catch (error) {
    console.error("❌ Query material context (generic) error:", error);
    return res.status(500).json({
      error: "Failed to query material context",
      details: error.message,
    });
  }
};

// ===================== VERIFY SYLLABUS (STRONG CHECK) =====================
exports.verifySyllabus = async (req, res) => {
  try {
    let { courseCode } = req.query;
    if (!courseCode) {
      console.log('❌ No courseCode provided in query');
      return res.status(400).json({ error: "Course code is required" });
    }

    console.log(`🔍 Verifying syllabus for courseCode: "${courseCode}"`);

    // STEP 1: Try exact match (case-insensitive)
    let course = await Course.findOne({
      courseCode: { $regex: `^${courseCode}$`, $options: 'i' },
      syllabusPdfUrl: { $ne: null }
    }).sort({ updatedAt: -1 });

    // STEP 2: If not found, try courseTitle match (Firebase might use different identifier)
    if (!course) {
      console.log(`⚠️ No exact match for courseCode="${courseCode}", trying courseTitle...`);
      course = await Course.findOne({
        courseTitle: { $regex: courseCode, $options: 'i' },
        syllabusPdfUrl: { $ne: null }
      }).sort({ updatedAt: -1 });
    }

    if (!course) {
      console.log(`❌ No course found for "${courseCode}"`);
      
      // Debug: Show all courses
      const allCourses = await Course.find({}).select('courseCode courseTitle syllabusPdfUrl').lean();
      console.log(`📊 Total courses in MongoDB: ${allCourses.length}`);
      allCourses.forEach(c => {
        console.log(`   - Code: "${c.courseCode}", Title: "${c.courseTitle}", HasSyllabus: ${!!c.syllabusPdfUrl}`);
      });
      
      const availableCodes = allCourses.map(c => c.courseCode).filter(Boolean);
      const coursesWithSyllabus = allCourses.filter(c => c.syllabusPdfUrl).map(c => c.courseCode);
      
      return res.status(200).json({
        success: false,
        hasSyllabus: false,
        searchedFor: courseCode,
        availableCourseCodes: availableCodes,
        coursesWithSyllabus: coursesWithSyllabus,
        message: `No syllabus found for "${courseCode}". Available courses: ${availableCodes.join(', ') || 'none'}. With syllabus: ${coursesWithSyllabus.join(', ') || 'none'}`
      });
    }

    console.log(`✅ Found course: courseCode="${course.courseCode}", title="${course.courseTitle}"`);

    // Verify file exists
    const fileExists = course.syllabusPdfUrl && fs.existsSync(course.syllabusPdfUrl);

    if (!fileExists) {
      console.warn(`❌ Syllabus file missing: ${course.syllabusPdfUrl}`);
      return res.status(200).json({
        success: true,
        hasSyllabus: false,
        message: "Syllabus record exists but file is missing"
      });
    }

    console.log(`✅ Syllabus verified: ${course.syllabusPdfUrl}`);
    res.status(200).json({
      success: true,
      hasSyllabus: true,
      courseId: course._id,
      courseCode: course.courseCode,
      syllabusURL: `http://localhost:5000/api/courses/syllabus/${path.basename(course.syllabusPdfUrl)}`
    });

  } catch (error) {
    console.error("❌ Verify syllabus error:", error);
    res.status(500).json({ error: "Failed to verify syllabus", details: error.message });
  }
};

// Notify teacher when student registers for course
exports.notifyRegistration = async (req, res) => {
  try {
    const { courseId, studentId, studentName } = req.body;

    if (!courseId || !studentId || !studentName) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields: courseId, studentId, studentName" 
      });
    }

    console.log('📢 Notifying teacher of student registration:', { courseId, studentId, studentName });

    // Get course details from Firebase
    let courseData = null;
    try {
      const courseDoc = await firestore.collection('courses').doc(courseId).get();
      if (courseDoc.exists()) {
        courseData = {
          _id: courseId,
          id: courseId,
          ...courseDoc.data()
        };
        console.log('✅ Found course:', courseData.courseName || courseData.courseTitle);
      } else {
        console.warn('⚠️ Course not found in Firebase');
        return res.status(404).json({ 
          success: false, 
          error: "Course not found" 
        });
      }
    } catch (error) {
      console.error('❌ Error fetching course:', error);
      return res.status(500).json({ 
        success: false, 
        error: "Failed to fetch course details" 
      });
    }

    // Send notification to teacher
    try {
      await notifyStudentRegistered(courseData, studentId, studentName);
      console.log('✅ Teacher notification sent successfully');
      res.status(200).json({ 
        success: true, 
        message: "Teacher notified successfully" 
      });
    } catch (error) {
      console.error('❌ Error sending notification:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to send notification" 
      });
    }

  } catch (error) {
    console.error('❌ Error in notifyRegistration:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Notify teacher when course is updated
exports.notifyCourseUpdate = async (req, res) => {
  try {
    const { courseId, teacherId, teacherName, updateType } = req.body;

    if (!courseId || !teacherId || !teacherName) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields: courseId, teacherId, teacherName" 
      });
    }

    console.log('📢 Notifying teacher of course update:', { courseId, teacherId, updateType });

    // Get course details from Firebase
    let courseData = null;
    try {
      const courseDoc = await firestore.collection('courses').doc(courseId).get();
      if (courseDoc.exists()) {
        courseData = {
          _id: courseId,
          id: courseId,
          ...courseDoc.data()
        };
        console.log('✅ Found course:', courseData.courseName || courseData.courseTitle);
      } else {
        console.warn('⚠️ Course not found in Firebase');
        return res.status(404).json({ 
          success: false, 
          error: "Course not found" 
        });
      }
    } catch (error) {
      console.error('❌ Error fetching course:', error);
      return res.status(500).json({ 
        success: false, 
        error: "Failed to fetch course details" 
      });
    }

    // Send notification to teacher
    try {
      await notifyCourseUpdated(courseData, teacherId, teacherName, updateType);
      console.log('✅ Teacher notification sent successfully');
      res.status(200).json({ 
        success: true, 
        message: "Teacher notified successfully" 
      });
    } catch (error) {
      console.error('❌ Error sending notification:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to send notification" 
      });
    }

  } catch (error) {
    console.error('❌ Error in notifyCourseUpdate:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Get course materials with chunk counts
exports.getCourseMaterials = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({ 
        success: false, 
        error: "Course ID is required" 
      });
    }

    let courseObjectId;
    try {
      courseObjectId = new mongoose.Types.ObjectId(courseId);
    } catch (error) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid Course ID format" 
      });
    }

    // Fetch all materials for the course, sorted by most recent first
    // Each uploaded file creates exactly one CourseMaterial record
    const materials = await CourseMaterial.find({
      courseId: courseObjectId,
    })
      .sort({ createdAt: -1 })
      .lean();

    // Enhance materials with chunk count from CourseMaterialRaw
    const materialsWithCounts = await Promise.all(materials.map(async (material) => {
      const chunkCount = await CourseMaterialRaw.countDocuments({
        materialId: material._id,
      });
      return {
        ...material,
        chunkCount,
      };
    }));

    // Return the EXACT count of unique materials for this course
    const exactMaterialCount = materials.length;

    res.status(200).json({ 
      success: true, 
      materials: materialsWithCounts,
      count: exactMaterialCount,
      numberOfMaterials: exactMaterialCount,
    });
  } catch (error) {
    console.error('❌ Error fetching course materials:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Get course materials for a Firebase course doc id (externalCourseId)
exports.getCourseMaterialsByExternalCourseId = async (req, res) => {
  try {
    const { externalCourseId } = req.params;

    if (!externalCourseId) {
      return res.status(400).json({
        success: false,
        error: "externalCourseId is required",
      });
    }

    const materials = await CourseMaterial.find({
      externalCourseId: String(externalCourseId),
    })
      .sort({ createdAt: -1 })
      .lean();

    const materialsWithCounts = await Promise.all(
      materials.map(async (material) => {
        const chunkCount = await CourseMaterialRaw.countDocuments({
          materialId: material._id,
        });
        return { ...material, chunkCount };
      })
    );

    return res.status(200).json({
      success: true,
      externalCourseId: String(externalCourseId),
      materials: materialsWithCounts,
      count: materialsWithCounts.length,
      numberOfMaterials: materialsWithCounts.length,
    });
  } catch (error) {
    console.error("❌ Error fetching course materials by externalCourseId:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Check ingestion status of a material
exports.checkMaterialIngestionStatus = async (req, res) => {
  try {
    const { materialId } = req.params;

    if (!materialId) {
      return res.status(400).json({ 
        success: false, 
        error: "Material ID is required" 
      });
    }

    const material = await CourseMaterial.findById(materialId);
    if (!material) {
      return res.status(404).json({ 
        success: false, 
        error: "Material not found" 
      });
    }

    const rawDoc = await CourseMaterialRaw.findOne({ materialId });
    
    res.status(200).json({ 
      success: true, 
      material: {
        _id: material._id,
        originalFileName: material.originalFileName,
        processingStatus: material.processingStatus,
        ingestError: material.ingestError || null,
        createdAt: material.createdAt,
        updatedAt: material.updatedAt
      },
      raw: rawDoc ? {
        extractionStatus: rawDoc.extractionStatus,
        extractionError: rawDoc.extractionError || null,
        ingestStatus: rawDoc.faissIngestionStatus || rawDoc.ingestStatus || null,
        pageCount: rawDoc.pageCount || 0,
        charCount: rawDoc.charCount || 0,
        faissIngestionStatus: rawDoc.faissIngestionStatus || "pending",
        faissChunkCount: rawDoc.faissChunkCount || 0,
        faissChunksMetadata: rawDoc.faissChunksMetadata || [],
        faissIngestionDurationMs: rawDoc.faissIngestionDurationMs || 0,
        faissIngestionError: rawDoc.faissIngestionError || null,
        faissIngestionAt: rawDoc.faissIngestionAt || null,
      } : null
    });
  } catch (error) {
    console.error('❌ Error checking ingestion status:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Manually re-trigger ingestion for a material
exports.reIngestMaterial = async (req, res) => {
  try {
    const { materialId } = req.params;
    const debug = [];

    debug.push(`Starting re-ingest for material: ${materialId}`);

    if (!materialId) {
      return res.status(400).json({ 
        success: false, 
        error: "Material ID is required" 
      });
    }

    const material = await CourseMaterial.findById(materialId);
    debug.push(`Found material: ${material?.originalFileName}`);
    
    if (!material) {
      return res.status(404).json({ 
        success: false, 
        error: "Material not found" 
      });
    }

    const { isIngestionReady, ingestCourseAfterUpload } = require('../utils/ingestionService');
    
    debug.push(`Checking if ingestion ready...`);
    if (!isIngestionReady()) {
      debug.push(`Ingestion NOT ready!`);
      return res.status(500).json({ 
        success: false, 
        error: "Ingestion environment not ready",
        debug
      });
    }

    debug.push(`✅ Ingestion IS ready, starting process`);
    
    // Send response immediately  
    res.status(200).json({ 
      success: true, 
      message: "Re-ingestion started in background",
      materialId,
      debug
    });

    // Trigger ingestion in background
    debug.push(`Calling ingestCourseAfterUpload for course: ${material.courseId}`);
    console.log(`[DEBUG-REINGEST] DEBUG INFO:`, debug);
    
    ingestCourseAfterUpload(material.courseId.toString())
      .then((result) => {
        console.log(`[PHASE1-SUCCESS] ✅ RE-INGESTION COMPLETED for material ${materialId}:`, result);
        
        // Update status
        material.processingStatus = "embedded";
        material.ingestError = null;
        material.save().then(() => {
          console.log(`[DEBUG-REINGEST] ✅ Material status updated to 'embedded'`);
        }).catch(err => {
          console.error(`[DEBUG-REINGEST] ❌ Failed to save status:`, err.message);
        });
      })
      .catch((err) => {
        console.error(`[PHASE1-ERROR] ❌ RE-INGESTION FAILED for material ${materialId}:`, err.message);
        console.error(`[PHASE1-ERROR] Full error:`, err);
        
        material.processingStatus = "extracted";
        material.ingestError = err.message;
        material.save().then(() => {
          console.log(`[DEBUG-REINGEST] Material status kept as 'extracted' due to error`);
        }).catch(err => {
          console.error(`[DEBUG-REINGEST] Failed to save error status:`, err.message);
        });
      });
  } catch (error) {
    console.error('❌ Exception in reIngestMaterial:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack?.substring(0, 300)
    });
  }
};

// ===================== REPROCESS PHASE-1 (EXTRACT + INGEST) =====================
exports.reprocessMaterialPhase1 = async (req, res) => {
  try {
    const { materialId } = req.params;
    const { enableOcr } = req.body || {};

    if (!materialId) {
      return res.status(400).json({ success: false, error: "materialId is required" });
    }

    const material = await CourseMaterial.findById(materialId);
    if (!material) {
      return res.status(404).json({ success: false, error: "Material not found" });
    }

    const rawDoc = await CourseMaterialRaw.findOne({ materialId: material._id });
    if (!rawDoc) {
      return res.status(404).json({ success: false, error: "Raw material doc not found" });
    }

    // Mark as pending at start
    rawDoc.extractionStatus = "pending";
    rawDoc.extractionError = "";
    rawDoc.faissIngestionStatus = "pending";
    rawDoc.faissIngestionError = "";
    rawDoc.pageCount = 0;
    rawDoc.charCount = 0;
    rawDoc.rawText = "";
    rawDoc.pageMetadata = [];
    rawDoc.numChunks = 0;
    rawDoc.numEmbeddings = 0;
    await rawDoc.save();

    material.processingStatus = "uploaded";
    material.ingestError = null;
    await material.save();

    const shouldEnableOcr = String(enableOcr ?? "true").toLowerCase() !== "false";

    // 1) Extract
    const extractionInfo = await extractTextFromMaterial(material.filePath, {
      enableOcr: shouldEnableOcr,
    });

    rawDoc.extractionStatus = "completed";
    rawDoc.extractor = extractionInfo.extractor || "";
    rawDoc.pageCount = extractionInfo.page_count || 0;
    rawDoc.charCount = extractionInfo.char_count || 0;
    rawDoc.extractionDurationMs = extractionInfo.duration_ms || 0;
    rawDoc.rawText = extractionInfo.text || "";
    rawDoc.pageMetadata = extractionInfo.pages || [];
    rawDoc.equationCount = extractionInfo.equation_count || 0;
    rawDoc.visualCount = extractionInfo.visual_count || 0;
    rawDoc.ocrCount = extractionInfo.ocr_count || 0;
    rawDoc.ocrCharCount = extractionInfo.ocr_char_count || 0;
    rawDoc.ocrEnabled = !!extractionInfo.ocr_enabled;
    rawDoc.ocrStatus = extractionInfo.ocr_status || "";
    rawDoc.ocrError = extractionInfo.ocr_error || "";
    rawDoc.sourceFormat = extractionInfo.source_format || "";
    rawDoc.extractedAt = new Date();
    rawDoc.extractionError = "";
    await rawDoc.save();

    material.processingStatus = "extracted";
    await material.save();

    // 2) Ingest (sync for reprocess)
    if (!isIngestionReady()) {
      return res.status(200).json({
        success: true,
        message: "Extraction completed, but ingestion environment not ready",
        materialId,
        extraction: {
          pageCount: rawDoc.pageCount,
          charCount: rawDoc.charCount,
          ocrEnabled: rawDoc.ocrEnabled,
        },
        ingestion: { status: "skipped", note: "Ingestion environment not ready" },
      });
    }

    const ingestResult = await ingestMaterialAfterUpload(String(material._id));
    const createdChunks = Number(ingestResult.total_chunks_created || 0);
    const createdEmbeddings = Number(ingestResult.total_embeddings_created || 0);
    const ingestionSucceeded = createdChunks > 0;

    rawDoc.faissIngestionStatus = ingestionSucceeded ? "completed" : "failed";
    rawDoc.faissChunkCount = createdChunks;
    rawDoc.numChunks = createdChunks;
    rawDoc.numEmbeddings = createdEmbeddings;
    rawDoc.faissIngestionError = ingestionSucceeded
      ? ""
      : "Ingestion produced 0 chunks; verify extracted text/chunking pipeline";
    rawDoc.faissIngestionAt = new Date();
    await rawDoc.save();

    material.processingStatus = ingestionSucceeded ? "embedded" : "extracted";
    material.ingestError = ingestionSucceeded ? null : rawDoc.faissIngestionError;
    await material.save();

    return res.status(200).json({
      success: true,
      message: ingestionSucceeded ? "Phase-1 reprocess completed" : "Reprocess completed, but ingestion produced 0 chunks",
      materialId,
      extraction: {
        status: rawDoc.extractionStatus,
        pageCount: rawDoc.pageCount,
        charCount: rawDoc.charCount,
        ocrEnabled: rawDoc.ocrEnabled,
        ocrCharCount: rawDoc.ocrCharCount,
      },
      ingestion: {
        status: rawDoc.faissIngestionStatus,
        chunks: rawDoc.numChunks,
        embeddings: rawDoc.numEmbeddings,
      },
    });
  } catch (error) {
    console.error("❌ reprocessMaterialPhase1 error:", error);

    // Best-effort: if we can resolve raw doc, mark failed.
    try {
      const { materialId } = req.params;
      if (materialId) {
        await CourseMaterial.updateOne(
          { _id: materialId },
          { $set: { processingStatus: "failed", ingestError: error.message, updatedAt: new Date() } }
        );
        await CourseMaterialRaw.updateOne(
          { materialId },
          { $set: { extractionStatus: "failed", extractionError: error.message, updatedAt: new Date() } }
        );
      }
    } catch (_) {
      // ignore
    }

    return res.status(500).json({ success: false, error: error.message });
  }
};
