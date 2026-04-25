const Assessment = require("../models/Assessment");
const Question = require("../models/Question");
const CLO = require("../models/CLO");
const AssessmentReferenceRaw = require("../models/AssessmentReferenceRaw");
const Course = require("../models/Course");
const Submission = require("../models/Submission");
const BloomTaxonomy = require("../models/BloomTaxonomy");
const path = require("path");
const fs = require("fs");
// ✅ Initialize Firebase Admin
const { admin, firestore } = require("../config/firebase");
// ✅ Import Firebase notification service
const { notifyAssessmentCreated } = require("../utils/notificationService");
const { ingestAssessmentReference } = require("../utils/ingestionService");

// ✅ Helper function: Get default question count based on template
function getDefaultQuestionCount(questionTemplate) {
  const defaults = {
    'mcq': 5,
    'short': 4,
    'short-answer': 4,
    'coding': 3
  };
  return defaults[questionTemplate] || 5;
}

// ✅ Helper function: Validate and fix MCQ questions before saving
function validateMCQBeforeSaving(question, questionIndex) {
  console.log(`   🔍 [MCQ-${questionIndex}] Validating MCQ format...`);
  
  if (!question.options || !Array.isArray(question.options)) {
    console.warn(`   ⚠️  [MCQ-${questionIndex}] No options array found, creating default...`);
    question.options = [
      { text: 'Option A', isCorrect: false },
      { text: 'Option B', isCorrect: true },
      { text: 'Option C', isCorrect: false },
      { text: 'Option D', isCorrect: false }
    ];
    question.correctAnswer = 'B';
  } else {
    // Ensure exactly 4 options
    if (question.options.length < 4) {
      console.warn(`   ⚠️  [MCQ-${questionIndex}] Only ${question.options.length} options, padding to 4...`);
      const letters = ['A', 'B', 'C', 'D'];
      while (question.options.length < 4) {
        const idx = question.options.length;
        question.options.push({
          text: `Option ${letters[idx]}`,
          isCorrect: false
        });
      }
    } else if (question.options.length > 4) {
      console.warn(`   ⚠️  [MCQ-${questionIndex}] ${question.options.length} options, trimming to 4...`);
      question.options = question.options.slice(0, 4);
    }
    
    // Ensure exactly 1 correct answer
    const correctCount = question.options.filter(o => o.isCorrect).length;
    if (correctCount === 0) {
      console.warn(`   ⚠️  [MCQ-${questionIndex}] No correct answer, marking first as correct...`);
      question.options[0].isCorrect = true;
      question.correctAnswer = 'A';
    } else if (correctCount > 1) {
      console.warn(`   ⚠️  [MCQ-${questionIndex}] ${correctCount} correct answers, keeping only first...`);
      let foundFirst = false;
      question.options.forEach((o, i) => {
        if (o.isCorrect && !foundFirst) {
          foundFirst = true;
          question.correctAnswer = String.fromCharCode(65 + i);
        } else {
          o.isCorrect = false;
        }
      });
    }
  }
  
  console.log(`   ✅ [MCQ-${questionIndex}] Validated: 4 options, 1 correct (${question.correctAnswer})`);
  return question;
}

// Create a new assessment (quiz or assignment)
exports.createAssessment = async (req, res) => {
  try {
    const {
      type, // 'quiz' or 'assignment'
      courseId,
      cloIds, // Array of CLO IDs to assess
      teacherId,
      title,
      description,
      difficultyLevel,
      threshold,
      totalMarks,
      duration, // in minutes, for quiz
      scheduledTime,
      questionTemplate, // 'mcq', 'short-answer', 'coding'
      questionCount,// number of questions per CLO
      submissionDeadline,    // ✅ add this
      dueDate,               // ✅ quiz UI compatibility
      dueTime,               // ✅ quiz UI compatibility
      scheduledDate,         // ✅ split date/time compatibility
      allowLateSubmission,   // ✅ add this
      latePenalty,           // ✅ add this
      weightage              // ✅ add this    
    } = req.body;

    // Normalize date payloads from both assignment and quiz UIs.
    // Quiz form sends dueDate/dueTime while assignment sends submissionDeadline.
    let normalizedSubmissionDeadline = submissionDeadline || null;
    if (!normalizedSubmissionDeadline && dueDate) {
      normalizedSubmissionDeadline = dueTime
        ? new Date(`${dueDate}T${dueTime}`).toISOString()
        : new Date(dueDate).toISOString();
    }

    // Some forms send scheduledDate + scheduledTime separately.
    let normalizedScheduledTime = scheduledTime || null;
    if (!normalizedScheduledTime && scheduledDate) {
      normalizedScheduledTime = scheduledTime
        ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
        : new Date(scheduledDate).toISOString();
    }

    // Validation
    if (!type || !courseId || !cloIds || cloIds.length === 0 || !teacherId) {
      return res.status(400).json({
        error: "Missing required fields: type, courseId, cloIds, teacherId"
      });
    }

    console.log(`📥 Received assessment creation request:`);
    console.log(`   Type: ${type}`);
    console.log(`   Question Template: "${questionTemplate}"`);
    console.log(`   Question Count: ${questionCount}`);

    // ✅ NORMALIZE question template - map short forms to full names
    const TEMPLATE_MAP = {
      'short': 'short-answer',
      'short-answer': 'short-answer',
      'mcq': 'mcq',
      'coding': 'coding'
    };
    const normalizedTemplate = TEMPLATE_MAP[questionTemplate] || 'mcq';
    console.log(`   Normalized Template: "${questionTemplate}" → "${normalizedTemplate}"`);

    // Verify course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // ✅ Check for duplicate assessment title in the same course
    if (title && title.trim()) {
      const duplicateAssessment = await Assessment.findOne({
        courseId: courseId,
        title: { $regex: new RegExp(`^${title.trim()}$`, 'i') }, // Case-insensitive exact match
        type: type
      });
      
      if (duplicateAssessment) {
        console.log(`⚠️ Duplicate ${type} detected: "${title}" already exists for this course`);
        return res.status(400).json({ 
          error: `${type === 'quiz' ? 'Quiz' : 'Assignment'} with this name already exists for this course. Please choose a different name.`,
          duplicate: true
        });
      }
    }

    // Verify CLOs exist and belong to this course
    const clos = await CLO.find({ _id: { $in: cloIds }, courseCode: course.courseCode, teacherId: course.teacherId });
    if (clos.length !== cloIds.length) {
      return res.status(400).json({ error: "Some CLOs not found or don't belong to this course" });
    }

    // Determine status based on publish settings
    const { publishImmediately, status } = req.body;
    let assessmentStatus = 'draft';
    
    if (publishImmediately || status === 'published') {
      assessmentStatus = 'published';
    } else if (status === 'draft') {
      assessmentStatus = 'draft';
    }

    // Create assessment with metadata only (no questions/PDFs yet)
    const assessment = await Assessment.create({
      type,
      courseId,
      courseCode: course.courseCode,
      teacherId,
      title: title || `${type === 'quiz' ? 'Quiz' : 'Assignment'} - ${course.courseTitle}`,
      description: description || '',
      difficultyLevel: difficultyLevel || 'medium',
      threshold: threshold || 60,
      totalMarks: totalMarks || (questionCount || 10) * cloIds.length,
      duration: type === 'quiz' ? (duration || 30) : null,
      scheduledTime: normalizedScheduledTime,
      status: assessmentStatus,
      sentAt: assessmentStatus === 'published' ? new Date() : undefined,
      questionCount: questionCount || (type === 'assignment' ? getDefaultQuestionCount(normalizedTemplate) : 10),
      cloIds: cloIds,
      submissionDeadline: normalizedSubmissionDeadline,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      allowLateSubmission: allowLateSubmission || false,
      latePenalty: latePenalty || 0,
      weightage: weightage || 100,
      questionTemplate: normalizedTemplate  // ✅ Use normalized template
    });

    console.log(`✅ Assessment created: ${assessment._id} (${type})`);
    console.log(`   Course: ${course.courseCode}`);
    console.log(`   CLOs: ${cloIds.length}`);
    console.log(`   Status: ${assessmentStatus}`);
    console.log(`   📋 Saved Question Template: "${assessment.questionTemplate}"`);
    
    if (assessmentStatus === 'scheduled') {
      console.log(`   ⏰ Scheduled for: ${scheduledTime}`);
      console.log(`   ⏳ Will auto-publish at scheduled time`);
    }

    // ✅ IF STATUS IS DRAFT: Save only, do NOT generate PDFs or notifications
    if (assessmentStatus === 'draft') {
      console.log('📝 Assessment saved as DRAFT - no publication');
      return res.status(201).json({
        success: true,
        message: "Assessment saved as draft",
        assessment: {
          _id: assessment._id,
          type: assessment.type,
          courseId: assessment.courseId,
          courseCode: assessment.courseCode,
          title: assessment.title,
          status: assessment.status,
          cloCount: cloIds.length,
          questionsGenerated: 0,
          pdfUrl: null
        }
      });
    }

    // ✅ IF PUBLISHING: Generate questions, PDFs, and send notifications
    if (assessmentStatus === 'published') {
      console.log('🚀 Publishing assessment immediately...');
      try {
        await publishAssessment(assessment._id, course);
        console.log('✅ Assessment published successfully');
        // Refetch assessment to get updated fields (PDFs, questions, etc.)
        const updatedAssessment = await Assessment.findById(assessment._id).populate('questions');
        
        console.log('📦 Sending response with:');
        console.log('   - PDF URL:', updatedAssessment.pdfUrl);
        console.log('   - Questions:', updatedAssessment.questions?.length || 0);
        console.log('   - Status:', updatedAssessment.status);
        
        res.status(201).json({
          success: true,
          message: "Assessment created successfully",
          assessment: {
            _id: updatedAssessment._id,
            type: updatedAssessment.type,
            courseId: updatedAssessment.courseId,
            courseCode: updatedAssessment.courseCode,
            title: updatedAssessment.title,
            status: updatedAssessment.status,
            cloCount: cloIds.length,
            questionsGenerated: updatedAssessment.questions?.length || 0,
            pdfUrl: updatedAssessment.pdfUrl
          },
          questions: updatedAssessment.questions?.map(q => ({
            _id: q._id,
            questionText: q.questionText,
            questionType: q.questionType,
            marks: q.marks,
            bloomLevel: q.bloomLevel
          })) || []
        });
      } catch (publishError) {
        console.error('❌ Failed to publish assessment immediately:', publishError.message);
        console.error('Stack:', publishError.stack);
        // Return response with error context
        res.status(201).json({
          success: true,
          message: "Assessment created but failed to publish immediately",
          assessment: {
            _id: assessment._id,
            type: assessment.type,
            courseId: assessment.courseId,
            courseCode: assessment.courseCode,
            title: assessment.title,
            status: 'draft',
            cloCount: cloIds.length,
            questionsGenerated: 0,
            pdfUrl: null
          },
          error: publishError.message
        });
      }
    } else if (assessmentStatus === 'scheduled') {
      console.log('📅 Assessment saved as scheduled draft - will auto-publish at scheduled time');
      console.log('🚀 publishImmediately flag: FALSE (scheduled)');
      res.status(201).json({
        success: true,
        message: "Assessment created successfully",
        assessment: {
          _id: assessment._id,
          type: assessment.type,
          courseId: assessment.courseId,
          courseCode: assessment.courseCode,
          title: assessment.title,
          status: assessment.status,
          cloCount: cloIds.length,
          questionsGenerated: 0,
          pdfUrl: null
        }
      });
    } else {
      console.log('📝 Assessment saved as draft - teacher can edit and publish later');
      console.log('🚀 publishImmediately flag: FALSE (draft)');
      res.status(201).json({
        success: true,
        message: "Assessment created successfully",
        assessment: {
          _id: assessment._id,
          type: assessment.type,
          courseId: assessment.courseId,
          courseCode: assessment.courseCode,
          title: assessment.title,
          status: assessment.status,
          cloCount: cloIds.length,
          questionsGenerated: 0,
          pdfUrl: null
        }
      });
    }

  } catch (error) {
    console.error("❌ Error creating assessment:", error);
    res.status(500).json({
      error: "Failed to create assessment",
      details: error.message
    });
  }
};

// Get assessments for a course
exports.getCourseAssessments = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { type, status } = req.query;

    const filter = { courseId };
    if (type) filter.type = type;
    if (status) filter.status = status;

    const assessments = await Assessment.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    // Populate CLO count for each assessment
    for (let assessment of assessments) {
      if (assessment.cloIds) {
        assessment.cloCount = assessment.cloIds.length;
      }
    }

    res.status(200).json({
      success: true,
      assessments,
      count: assessments.length
    });
  } catch (error) {
    console.error("Error fetching assessments:", error);
    res.status(500).json({ error: "Failed to fetch assessments", details: error.message });
  }
};

// Get assessments for a teacher
exports.getTeacherAssessments = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { type, status } = req.query;

    const filter = { teacherId };
    if (type) filter.type = type;
    // Only include non-draft assessments by default
    if (status) {
      filter.status = status;
    } else {
      // Exclude draft assessments unless explicitly requested
      filter.status = { $ne: 'draft' };
    }

    const assessments = await Assessment.find(filter)
      .populate('courseId', 'courseCode courseTitle')
      .sort({ createdAt: -1 })
      .lean();

    // Map assessments with PDF information from database or filesystem
    const pdfsDir = path.join(__dirname, '../pdfs');
    const enhancedAssessments = assessments.map((assessment) => {
      let assessmentPdfFile = assessment.assessmentPdfFile;
      let answerKeyPdfFile = assessment.answerKeyPdfFile;

      // If PDF filenames are not in database, search filesystem
      if (!assessmentPdfFile || !answerKeyPdfFile) {
        try {
          if (fs.existsSync(pdfsDir)) {
            const files = fs.readdirSync(pdfsDir);
            
            if (!assessmentPdfFile) {
              const assessmentPattern = `assessment-${assessment._id}-`;
              assessmentPdfFile = files.find(f => f.startsWith(assessmentPattern));
            }
            
            if (!answerKeyPdfFile) {
              const answerKeyPattern = `answer-key-${assessment._id}-`;
              answerKeyPdfFile = files.find(f => f.startsWith(answerKeyPattern));
            }
          }
        } catch (err) {
          console.error('Error reading PDFs directory:', err);
        }
      }

      return {
        ...assessment,
        assessmentPdfFile: assessmentPdfFile || null,
        answerKeyPdfFile: answerKeyPdfFile || null,
        courseTitle: assessment.courseId?.courseTitle || 'Unknown Course',
        courseCode: assessment.courseId?.courseCode || 'N/A'
      };
    });

    res.status(200).json({
      success: true,
      assessments: enhancedAssessments,
      count: enhancedAssessments.length
    });
  } catch (error) {
    console.error("Error fetching teacher assessments:", error);
    res.status(500).json({ error: "Failed to fetch assessments", details: error.message });
  }
};

// Get draft assessments for a teacher by type (quiz or assignment)
exports.getTeacherDrafts = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { type } = req.query; // 'quiz' or 'assignment'

    console.log(`🔍 [getTeacherDrafts] Querying for teacherId: ${teacherId}, type: ${type}`);

    const filter = { 
      teacherId,
      status: 'draft'
    };
    
    if (type) {
      filter.type = type;
    }

    console.log(`📊 [getTeacherDrafts] Filter:`, JSON.stringify(filter));

    const drafts = await Assessment.find(filter)
      .populate('courseId', 'courseCode courseTitle')
      .sort({ createdAt: -1 })
      .lean();

    console.log(`✅ [getTeacherDrafts] Found ${drafts.length} matching assessments`);
    if (drafts.length === 0) {
      console.log(`   Checking ALL assessments for this teacher...`);
      const allAssessments = await Assessment.find({ teacherId }).select('type status title').lean();
      console.log(`   Total assessments for teacher:`, allAssessments.length, allAssessments);
    }

    // Enhance drafts with course info
    const enhancedDrafts = drafts.map((draft) => ({
      ...draft,
      courseTitle: draft.courseId?.courseTitle || 'Unknown Course',
      courseCode: draft.courseId?.courseCode || 'N/A',
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt
    }));

    res.status(200).json({
      success: true,
      drafts: enhancedDrafts,
      count: enhancedDrafts.length
    });
  } catch (error) {
    console.error("Error fetching teacher drafts:", error);
    res.status(500).json({ error: "Failed to fetch drafts", details: error.message });
  }
};

// Get assessments for a specific student
exports.getStudentAssessments = async (req, res) => {
  try {
    const { studentId } = req.params;
    const path = require("path");
    const fs = require("fs");
    const Assessment = require("../models/Assessment");
    const Course = require("../models/Course");
    const { firestore } = require("../config/firebase");

    console.log(`🔍 [getStudentAssessments] Fetching assessments for studentId: ${studentId}`);

    // Step 1: Get student's registered courses from Firebase (these are Firebase course IDs)
    let registeredFirebaseCourseIds = [];
    try {
      const userDoc = await firestore.collection('users').doc(studentId).get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        // Check all possible arrays (registeredCourses, enrolledCourses, courses)
        registeredFirebaseCourseIds = [
          ...(userData.registeredCourses || []),
          ...(userData.enrolledCourses || []),
          ...(userData.courses || [])
        ];
        // Remove duplicates
        registeredFirebaseCourseIds = [...new Set(registeredFirebaseCourseIds)];
        
        console.log(`   📚 Found ${registeredFirebaseCourseIds.length} registered Firebase course IDs:`, registeredFirebaseCourseIds);
      } else {
        console.warn(`   ⚠️  Student ${studentId} not found in Firebase`);
      }
    } catch (firebaseError) {
      console.warn(`   ⚠️  Firebase error getting student data:`, firebaseError.message);
    }

    // Step 2: Get Firebase courses and extract their mongodbCourseId fields
    let mongodbCourseIds = [];
    if (registeredFirebaseCourseIds.length > 0) {
      try {
        const coursePromises = registeredFirebaseCourseIds.map(async (firebaseCourseId) => {
          try {
            const courseDoc = await firestore.collection('courses').doc(firebaseCourseId).get();
            if (courseDoc.exists) {
              const courseData = courseDoc.data();
              return courseData.mongodbCourseId || null;
            }
          } catch (err) {
            console.warn(`   ⚠️  Error fetching Firebase course ${firebaseCourseId}:`, err.message);
          }
          return null;
        });
        
        const results = await Promise.all(coursePromises);
        mongodbCourseIds = results.filter(id => id !== null);
        
        console.log(`   🔗 Extracted ${mongodbCourseIds.length} MongoDB course IDs from Firebase courses:`, mongodbCourseIds);
      } catch (err) {
        console.warn(`   ⚠️  Error fetching Firebase courses:`, err.message);
      }
      
      if (mongodbCourseIds.length === 0) {
        console.warn(`   ⚠️  No MongoDB course IDs found in Firebase courses`);
        console.warn(`   💡 TIP: Make sure Firebase courses have mongodbCourseId field set`);
        return res.status(200).json({
          success: true,
          assessments: [],
          message: "No courses with MongoDB connection found"
        });
      }
    } else {
      console.log(`   ⚠️  Student has no registered courses in Firebase`);
      return res.status(200).json({
        success: true,
        assessments: [],
        message: "You are not enrolled in any courses yet"
      });
    }

    // Step 3: Get published assessments for these MongoDB course IDs
    const mongoose = require('mongoose');
    
    // Convert MongoDB course ID strings to ObjectIds
    const courseObjectIds = mongodbCourseIds.map(id => {
      try {
        return new mongoose.Types.ObjectId(id);
      } catch (err) {
        console.warn(`   ⚠️  Invalid MongoDB ObjectId: ${id}`);
        return null;
      }
    }).filter(id => id !== null);
    
    console.log(`   🔍 Searching for published assessments in ${courseObjectIds.length} courses`);
    
    const query = { 
      status: 'published',
      courseId: { $in: courseObjectIds }
    };

    const assessments = await Assessment.find(query)
      .populate('courseId', 'courseCode courseTitle')
      .sort({ createdAt: -1 })
      .lean();

    console.log(`   ✅ Found ${assessments.length} published assessments`);

    // Step 4: Enrich assessments with additional details
    const pdfsDir = path.join(__dirname, '../pdfs');
    const enhancedAssessments = await Promise.all(
      assessments.map(async (assessment) => {
        let pdfUrl = null;
        let answerKeyPdfUrl = null;

        // Try to find PDF in filesystem
        if (assessment._id) {
          try {
            if (fs.existsSync(pdfsDir)) {
              const files = fs.readdirSync(pdfsDir);
              const assessmentPdfPattern = `assessment-${assessment._id}-`;
              const pdfFile = files.find(f => f.startsWith(assessmentPdfPattern));
              
              if (pdfFile) {
                pdfUrl = `/api/assessments/pdf/${pdfFile}`;
              }

              // Find answer key PDF (marking rubrics)
              const answerKeyPdfPattern = `answer-key-${assessment._id}-`;
              const answerKeyFile = files.find(f => f.startsWith(answerKeyPdfPattern));
              
              if (answerKeyFile) {
                answerKeyPdfUrl = `/api/assessments/pdf/${answerKeyFile}`;
              }
            }
          } catch (err) {
            console.error('   Error reading PDFs directory:', err);
          }
        }

        // Get teacher name from Firebase
        let teacherName = 'Unknown Teacher';
        try {
          if (assessment.teacherId) {
            const teacherDoc = await firestore.collection('users').doc(assessment.teacherId).get();
            if (teacherDoc.exists) {
              const teacherData = teacherDoc.data();
              teacherName = teacherData.name || teacherData.email || 'Unknown Teacher';
            }
          }
        } catch (err) {
          console.warn(`   Unable to fetch teacher name for ${assessment.teacherId}:`, err.message);
        }

        // Normalize deadline fields so frontend can consistently render due dates
        // across assignments and quizzes (including legacy records).
        // Normalize deadline using the best available fields.
        // Many legacy records store `dueDate` + `dueTime` separately (date-only string),
        // which would incorrectly freeze after midnight if we use `dueDate` alone.
        let normalizedDeadline =
          assessment.submissionDeadline ||
          (assessment.type === 'quiz' ? assessment.scheduledTime : null) ||
          null;

        if (!normalizedDeadline && assessment.dueDate && assessment.dueTime) {
          try {
            normalizedDeadline = new Date(`${assessment.dueDate}T${assessment.dueTime}`).toISOString();
          } catch {
            normalizedDeadline = assessment.dueDate;
          }
        }

        if (!normalizedDeadline && assessment.dueDate) {
          normalizedDeadline = assessment.dueDate;
        }

        return {
          _id: assessment._id,
          title: assessment.title,
          type: assessment.type || 'assessment',
          courseCode: assessment.courseId?.courseCode || 'N/A',
          courseName: assessment.courseId?.courseTitle || 'Unknown Course',
          courseTitle: assessment.courseId?.courseTitle || 'Unknown Course',
          teacherName,
          totalMarks: assessment.totalMarks || 0,
          submissionDeadline: normalizedDeadline,
          dueDate: normalizedDeadline, // For backward compatibility
          createdAt: assessment.createdAt,
          status: assessment.status,
          pdfUrl: assessment.pdfUrl || pdfUrl,
          answerKeyPdfUrl: answerKeyPdfUrl, // Marking rubrics PDF
          description: assessment.description,
          allowLateSubmission: assessment.allowLateSubmission || false,
          latePenalty: assessment.latePenalty || 0
        };
      })
    );

    // Filter to only include assessments with attached PDFs
    const assessmentsWithPDF = enhancedAssessments.filter(assessment => 
      assessment.pdfUrl && assessment.pdfUrl.trim() !== ''
    );

    console.log(`   📄 ${assessmentsWithPDF.length} assessments have attached PDFs (filtered from ${enhancedAssessments.length} total)`);

    res.status(200).json({
      success: true,
      assessments: assessmentsWithPDF,
      count: assessmentsWithPDF.length,
      registeredCourses: registeredFirebaseCourseIds
    });
  } catch (error) {
    console.error("Error fetching student assessments:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch assessments",
      details: error.message 
    });
  }
};

/**
 * Auto-marking metadata for an assessment.
 * Returns rubric/CLO/marks/questions so the teacher UI can auto-fill the AutoMark popup
 * when uploading per-question sample answers.
 *
 * GET /api/assessments/:assessmentId/automark-meta
 */
exports.getAutomarkMeta = async (req, res) => {
  try {
    const { assessmentId } = req.params;
    if (!assessmentId) {
      return res.status(400).json({ success: false, error: "assessmentId is required" });
    }

    const assessment = await Assessment.findById(assessmentId)
      .populate("cloIds")
      .populate({
        path: "questions",
        populate: { path: "cloId" },
      })
      .lean();

    if (!assessment) {
      return res.status(404).json({ success: false, error: "Assessment not found" });
    }

    // Optional: resolve answer-key (rubric) PDF URL from filesystem (same pattern used elsewhere)
    let answerKeyPdfUrl = assessment.answerKeyPdfFile || null;
    try {
      const pdfsDir = path.join(__dirname, "../pdfs");
      if (!answerKeyPdfUrl && assessment._id && fs.existsSync(pdfsDir)) {
        const files = fs.readdirSync(pdfsDir);
        const answerKeyPdfPattern = `answer-key-${assessment._id}-`;
        const answerKeyFile = files.find((f) => f.startsWith(answerKeyPdfPattern));
        if (answerKeyFile) {
          answerKeyPdfUrl = `/api/assessments/pdf/${answerKeyFile}`;
        }
      }
    } catch (_) {}

    const questions = Array.isArray(assessment.questions) ? assessment.questions : [];
    const cloIds = Array.isArray(assessment.cloIds) ? assessment.cloIds : [];
    const primaryClo =
      cloIds.length === 1
        ? cloIds[0]
        : questions.find((q) => q?.cloId && typeof q.cloId === "object")?.cloId || null;

    const computeRefStatus = async (referenceType) => {
      // missing | pending | ready | failed
      try {
        const refDocs = await AssessmentReferenceRaw.find({
          assessmentId: assessment._id,
          referenceType,
        })
          .select("questionKey extractionStatus faissIngestionStatus")
          .lean();

        if (!Array.isArray(refDocs) || refDocs.length === 0) return "missing";

        const isDone = (d) => d?.extractionStatus === "completed" && d?.faissIngestionStatus === "completed";
        const isFailed = (d) => d?.extractionStatus === "failed" || d?.faissIngestionStatus === "failed";
        const isPending = (d) => d?.extractionStatus === "pending" || d?.faissIngestionStatus === "pending";

        // For sample answers, require ALL expected questions (Q1..Qn) to be completed (not just "anyReady").
        if (referenceType === "sample_answer") {
          const qCount = Number(assessment?.questionCount || 0) || 0;
          const expectedKeys = qCount > 0 ? Array.from({ length: qCount }, (_, i) => `Q${i + 1}`) : ["ALL"];
          const byKey = new Map(refDocs.map((d) => [String(d?.questionKey || ""), d]));

          const missingAny = expectedKeys.some((k) => !byKey.get(k));
          if (missingAny) return "pending";
          const failedAny = expectedKeys.some((k) => isFailed(byKey.get(k)));
          if (failedAny) return "failed";
          const doneAll = expectedKeys.every((k) => isDone(byKey.get(k)));
          if (doneAll) return "ready";
          const pendingAny = expectedKeys.some((k) => isPending(byKey.get(k)));
          return pendingAny ? "pending" : "pending";
        }

        // For rubric/clo we expect one ALL doc; treat any completed as ready (covers migration cases).
        const anyFailed = refDocs.some(isFailed);
        const anyPending = refDocs.some(isPending);
        const anyReady = refDocs.some(isDone);
        return anyReady ? "ready" : anyFailed ? "failed" : anyPending ? "pending" : "missing";
      } catch (_) {
        return "missing";
      }
    };

    const [sampleAnswerStatus, rubricStatus, cloStatus] = await Promise.all([
      computeRefStatus("sample_answer"),
      computeRefStatus("rubric"),
      computeRefStatus("clo"),
    ]);

    return res.status(200).json({
      success: true,
      assessment: {
        _id: assessment._id,
        title: assessment.title,
        type: assessment.type,
        courseId: assessment.courseId,
        courseCode: assessment.courseCode,
        teacherId: assessment.teacherId,
        totalMarks: assessment.totalMarks,
        bloomLevel: assessment.bloomLevel || null,
        answerKeyPdfUrl,
      },
      sampleAnswerStatus,
      rubricStatus,
      cloStatus,
      primaryClo: primaryClo
        ? {
            _id: primaryClo?._id,
            cloNumber: primaryClo?.cloNumber,
            description: primaryClo?.description,
          }
        : null,
      clos: cloIds.map((c) => ({
        _id: c?._id,
        cloNumber: c?.cloNumber,
        description: c?.description,
        bloomLevelId: c?.bloomLevelId || null,
        courseId: c?.courseId || null,
        courseCode: c?.courseCode || null,
      })),
      questions: questions.map((q, idx) => ({
        _id: q?._id,
        index: idx,
        questionText: q?.questionText || "",
        questionType: q?.questionType || "",
        marks: q?.marks ?? 0,
        bloomLevel: q?.bloomLevel || "",
        cloIndex: q?.cloIndex ?? 0,
        cloDescription: q?.cloDescription || "",
        cloId: q?.cloId?._id || q?.cloId || null,
        clo: q?.cloId && typeof q.cloId === "object"
          ? { _id: q.cloId._id, cloNumber: q.cloId.cloNumber, description: q.cloId.description }
          : null,
        // For quizzes: correct answer/options can be used as rubric seed (v1)
        correctAnswer: q?.correctAnswer || "",
        options: Array.isArray(q?.options) ? q.options : [],
      })),
    });
  } catch (error) {
    console.error("❌ Error in getAutomarkMeta:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch automark metadata", details: error.message });
  }
};

/**
 * Upload a single sample-answer file for an assessment, then ingest into the
 * Assessment Reference FAISS index as per-question sections (Q1..Qn).
 *
 * POST /api/assessments/:assessmentId/upload-sample-answer
 * multipart/form-data:
 * - sampleAnswerFile: file (pdf/docx/jpg/png)
 */
exports.uploadSampleAnswerForAutomark = async (req, res) => {
  try {
    const { assessmentId } = req.params;
    if (!assessmentId) {
      return res.status(400).json({ success: false, error: "assessmentId is required" });
    }
    if (!req.file?.path) {
      return res.status(400).json({ success: false, error: "sampleAnswerFile is required" });
    }

    const assessment = await Assessment.findById(assessmentId).populate("cloIds").lean();
    if (!assessment) {
      return res.status(404).json({ success: false, error: "Assessment not found" });
    }

    // Guard against accidental overwrite unless explicitly confirmed.
    // For multipart/form-data requests, `req.body` is available after multer.
    const replaceFlag =
      String(req.query?.replace || req.body?.replace || "")
        .trim()
        .toLowerCase() === "true";

    const existingSample = await AssessmentReferenceRaw.findOne({
      assessmentId: assessment._id,
      referenceType: "sample_answer",
    })
      .select("_id extractionStatus faissIngestionStatus source")
      .lean();

    if (existingSample && !replaceFlag) {
      return res.status(409).json({
        success: false,
        error: "Sample answer already exists for this assessment. Set replace=true to overwrite.",
        code: "SAMPLE_ANSWER_EXISTS",
        current: {
          extractionStatus: existingSample.extractionStatus || "pending",
          faissIngestionStatus: existingSample.faissIngestionStatus || "pending",
          source: existingSample.source || "",
        },
      });
    }

    const questionCount = Number(assessment.questionCount || 0) || 0;
    const title = `${assessment.title || "Assessment"} - Sample Answer`;
    const primaryCloDescription =
      Array.isArray(assessment?.cloIds) && assessment.cloIds.length > 0
        ? (assessment.cloIds[0]?.description || "")
        : "";
    const markingRubric =
      assessment?.answerKeyPdfUrl ||
      assessment?.markingRubricPdfUrl ||
      assessment?.rubricPdfUrl ||
      assessment?.rubric ||
      assessment?.markingRubric ||
      null;

    // Terminal log to confirm extraction of automark metadata at upload-time (before embeddings)
    console.log(
      `[AUTOMARK] Uploaded sample answer for "${assessment.title || assessmentId}" | ` +
      `CLO: ${primaryCloDescription ? `"${String(primaryCloDescription).slice(0, 160)}"` : "N/A"} | ` +
      `Total Marks: ${assessment?.totalMarks ?? "N/A"} | ` +
      `Marking Rubric: ${markingRubric ? "found" : "missing"} | ` +
      `Total Questions: ${questionCount || "N/A"}`
    );

    // Mark pending entries in Mongo for each expected Q (best-effort)
    const expectedKeys = questionCount > 0 ? Array.from({ length: questionCount }, (_, i) => `Q${i + 1}`) : ["ALL"];
    await Promise.all(
      expectedKeys.map((qk) =>
        AssessmentReferenceRaw.findOneAndUpdate(
          { referenceKey: `${assessmentId}::${qk}::sample_answer` },
          {
            $setOnInsert: {
              assessmentId,
              questionKey: qk,
              referenceType: "sample_answer",
              referenceKey: `${assessmentId}::${qk}::sample_answer`,
            },
            $set: {
              source: req.file.originalname || path.basename(req.file.path),
              title,
              extractionStatus: "pending",
              faissIngestionStatus: "pending",
              faissIngestionError: "",
            },
          },
          { upsert: true, new: true }
        )
      )
    );

    // Also mark pending for rubric + CLO derived from the same sample-answer upload.
    // - rubric is stored as ALL (applies across questions, especially for assignments/coding)
    // - CLO is stored as ALL (one CLO statement typically applies to the whole assessment)
    await Promise.all([
      AssessmentReferenceRaw.findOneAndUpdate(
        { referenceKey: `${assessmentId}::ALL::rubric` },
        {
          $setOnInsert: {
            assessmentId,
            questionKey: "ALL",
            referenceType: "rubric",
            referenceKey: `${assessmentId}::ALL::rubric`,
          },
          $set: {
            source: req.file.originalname || path.basename(req.file.path),
            title: `${assessment.title || "Assessment"} - Marking Rubric`,
            extractionStatus: "pending",
            faissIngestionStatus: "pending",
            faissIngestionError: "",
          },
        },
        { upsert: true, new: true }
      ),
      AssessmentReferenceRaw.findOneAndUpdate(
        { referenceKey: `${assessmentId}::ALL::clo` },
        {
          $setOnInsert: {
            assessmentId,
            questionKey: "ALL",
            referenceType: "clo",
            referenceKey: `${assessmentId}::ALL::clo`,
          },
          $set: {
            source: req.file.originalname || path.basename(req.file.path),
            title: `${assessment.title || "Assessment"} - CLO`,
            extractionStatus: "pending",
            faissIngestionStatus: "pending",
            faissIngestionError: "",
          },
        },
        { upsert: true, new: true }
      ),
    ]).catch(() => {});

    // Respond immediately; ingestion runs in background
    res.status(200).json({
      success: true,
      message: "Sample answer upload received. Ingestion started.",
      assessmentId,
      questionCount,
      file: { originalName: req.file.originalname, storedPath: req.file.path },
    });

    // Background ingestion: split per question and ingest into FAISS reference index
    setImmediate(async () => {
      const startedAt = Date.now();
      try {
        const [sampleResult, rubricResult, cloResult] = await Promise.all([
          ingestAssessmentReference({
            assessmentId,
            type: "sample_answer",
            questionId: "ALL", // file is split internally; per-section keys become Q1..Qn
            filePath: req.file.path,
            splitSampleAnswer: true,
            questionCount,
            title,
          }),
          // Best-effort: ingest the same file into rubric/clo references too.
          // Retrieval will pick only the relevant chunks via similarity search.
          ingestAssessmentReference({
            assessmentId,
            type: "rubric",
            questionId: "ALL",
            filePath: req.file.path,
            splitSampleAnswer: false,
            questionCount: 0,
            title: `${assessment.title || "Assessment"} - Marking Rubric`,
          }).catch((e) => ({ __error: e })),
          ingestAssessmentReference({
            assessmentId,
            type: "clo",
            questionId: "ALL",
            filePath: req.file.path,
            splitSampleAnswer: false,
            questionCount: 0,
            title: `${assessment.title || "Assessment"} - CLO`,
          }).catch((e) => ({ __error: e })),
        ]);

        const durationMs = Date.now() - startedAt;
        let sectionKeys = Array.isArray(sampleResult?.section_keys) ? sampleResult.section_keys : expectedKeys;
        // Robust fallback: if we expected Q1 only but splitter returned ALL, map ALL -> Q1
        if (expectedKeys.length === 1 && expectedKeys[0] === "Q1" && sectionKeys.length === 1 && sectionKeys[0] === "ALL") {
          sectionKeys = expectedKeys;
        }
        const chunks = Number(sampleResult?.total_chunks_created ?? 0) || 0;
        const embeddings = Number(sampleResult?.total_embeddings_created ?? chunks) || chunks;

        // Mark each section completed
        await Promise.all(
          sectionKeys.map((qk) =>
            AssessmentReferenceRaw.findOneAndUpdate(
              { referenceKey: `${assessmentId}::${qk}::sample_answer` },
              {
                $set: {
                  extractionStatus: "completed",
                  extractor: sampleResult?.extractor || "",
                  pageCount: Number(sampleResult?.page_count ?? 0) || 0,
                  pageMetadata: Array.isArray(sampleResult?.page_metadata) ? sampleResult.page_metadata : [],
                  visualCount: Number(sampleResult?.visual_count ?? 0) || 0,
                  ocrEnabled: Boolean(sampleResult?.ocr_enabled),
                  ocrStatus: sampleResult?.ocr_status || "",
                  ocrError: sampleResult?.ocr_error || "",
                  ocrCount: Number(sampleResult?.ocr_count ?? 0) || 0,
                  ocrCharCount: Number(sampleResult?.ocr_char_count ?? 0) || 0,
                  extractedAt: new Date(),
                  faissIngestionStatus: "completed",
                  faissChunkCount: chunks, // global count (v1)
                  numChunks: chunks,
                  numEmbeddings: embeddings,
                  faissIngestionDurationMs: durationMs,
                  faissIngestionError: "",
                  faissIngestedAt: new Date(),
                },
              }
            )
          )
        );

        // Mark rubric/clo as completed (best-effort) if those ingestions succeeded.
        const upsertDerived = async (refType, resultObj) => {
          if (!resultObj || resultObj.__error) return;
          const dChunks = Number(resultObj?.total_chunks_created ?? 0) || 0;
          const dEmb = Number(resultObj?.total_embeddings_created ?? dChunks) || dChunks;
          await AssessmentReferenceRaw.findOneAndUpdate(
            { referenceKey: `${assessmentId}::ALL::${refType}` },
            {
              $set: {
                extractionStatus: "completed",
                extractor: resultObj?.extractor || "",
                pageCount: Number(resultObj?.page_count ?? 0) || 0,
                pageMetadata: Array.isArray(resultObj?.page_metadata) ? resultObj.page_metadata : [],
                visualCount: Number(resultObj?.visual_count ?? 0) || 0,
                ocrEnabled: Boolean(resultObj?.ocr_enabled),
                ocrStatus: resultObj?.ocr_status || "",
                ocrError: resultObj?.ocr_error || "",
                ocrCount: Number(resultObj?.ocr_count ?? 0) || 0,
                ocrCharCount: Number(resultObj?.ocr_char_count ?? 0) || 0,
                extractedAt: new Date(),
                faissIngestionStatus: "completed",
                faissChunkCount: dChunks,
                numChunks: dChunks,
                numEmbeddings: dEmb,
                faissIngestionDurationMs: durationMs,
                faissIngestionError: "",
                faissIngestedAt: new Date(),
              },
            }
          ).catch(() => {});
        };
        await Promise.all([
          upsertDerived("rubric", rubricResult),
          upsertDerived("clo", cloResult),
        ]);
      } catch (e) {
        const msg = e?.message || String(e);
        await Promise.all(
          expectedKeys.map((qk) =>
            AssessmentReferenceRaw.findOneAndUpdate(
              { referenceKey: `${assessmentId}::${qk}::sample_answer` },
              {
                $set: {
                  extractionStatus: "failed",
                  extractionError: msg,
                  faissIngestionStatus: "failed",
                  faissIngestionError: msg,
                },
              }
            )
          )
        );
        console.warn("[AUTOMARK-REF] ⚠️ Sample answer ingestion failed:", msg);

        // Also mark derived rubric/CLO failed (best-effort)
        await Promise.all(
          ["rubric", "clo"].map((refType) =>
            AssessmentReferenceRaw.findOneAndUpdate(
              { referenceKey: `${assessmentId}::ALL::${refType}` },
              {
                $set: {
                  extractionStatus: "failed",
                  extractionError: msg,
                  faissIngestionStatus: "failed",
                  faissIngestionError: msg,
                },
              }
            ).catch(() => {})
          )
        );
      }
    });
  } catch (error) {
    console.error("❌ uploadSampleAnswerForAutomark error:", error);
    return res.status(500).json({ success: false, error: "Failed to upload sample answer", details: error.message });
  }
};

/**
 * Upload a marking rubric file for an assessment, then ingest into the
 * Assessment Reference FAISS index.
 *
 * POST /api/assessments/:assessmentId/upload-rubric
 * multipart/form-data:
 * - rubricFile: file (pdf/docx/jpg/png)
 *
 * Notes:
 * - We store rubric as questionKey="ALL" (applies across questions). Retrieval should
 *   include an ALL fallback when grading per-question.
 */
exports.uploadRubricForAutomark = async (req, res) => {
  try {
    const { assessmentId } = req.params;
    if (!assessmentId) {
      return res.status(400).json({ success: false, error: "assessmentId is required" });
    }
    if (!req.file?.path) {
      return res.status(400).json({ success: false, error: "rubricFile is required" });
    }

    const assessment = await Assessment.findById(assessmentId).lean();
    if (!assessment) {
      return res.status(404).json({ success: false, error: "Assessment not found" });
    }

    const replaceFlag =
      String(req.query?.replace || req.body?.replace || "")
        .trim()
        .toLowerCase() === "true";

    const existingRubric = await AssessmentReferenceRaw.findOne({
      assessmentId: assessment._id,
      referenceType: "rubric",
    })
      .select("_id extractionStatus faissIngestionStatus source")
      .lean();

    if (existingRubric && !replaceFlag) {
      return res.status(409).json({
        success: false,
        error: "Rubric already exists for this assessment. Set replace=true to overwrite.",
        code: "RUBRIC_EXISTS",
        current: {
          extractionStatus: existingRubric.extractionStatus || "pending",
          faissIngestionStatus: existingRubric.faissIngestionStatus || "pending",
          source: existingRubric.source || "",
        },
      });
    }

    const title = `${assessment.title || "Assessment"} - Marking Rubric`;
    const qk = "ALL";

    await AssessmentReferenceRaw.findOneAndUpdate(
      { referenceKey: `${assessmentId}::${qk}::rubric` },
      {
        $setOnInsert: {
          assessmentId,
          questionKey: qk,
          referenceType: "rubric",
          referenceKey: `${assessmentId}::${qk}::rubric`,
        },
        $set: {
          source: req.file.originalname || path.basename(req.file.path),
          title,
          extractionStatus: "pending",
          faissIngestionStatus: "pending",
          faissIngestionError: "",
        },
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      message: "Rubric upload received. Ingestion started.",
      assessmentId,
      file: { originalName: req.file.originalname, storedPath: req.file.path },
    });

    setImmediate(async () => {
      const startedAt = Date.now();
      try {
        const result = await ingestAssessmentReference({
          assessmentId,
          type: "rubric",
          questionId: "ALL",
          filePath: req.file.path,
          splitSampleAnswer: false,
          questionCount: 0,
          title,
        });

        const durationMs = Date.now() - startedAt;
        const chunks = Number(result?.total_chunks_created ?? 0) || 0;
        const embeddings = Number(result?.total_embeddings_created ?? chunks) || chunks;

        await AssessmentReferenceRaw.findOneAndUpdate(
          { referenceKey: `${assessmentId}::${qk}::rubric` },
          {
            $set: {
              extractionStatus: "completed",
              extractor: result?.extractor || "",
              pageCount: Number(result?.page_count ?? 0) || 0,
              pageMetadata: Array.isArray(result?.page_metadata) ? result.page_metadata : [],
              visualCount: Number(result?.visual_count ?? 0) || 0,
              ocrEnabled: Boolean(result?.ocr_enabled),
              ocrStatus: result?.ocr_status || "",
              ocrError: result?.ocr_error || "",
              ocrCount: Number(result?.ocr_count ?? 0) || 0,
              ocrCharCount: Number(result?.ocr_char_count ?? 0) || 0,
              extractedAt: new Date(),
              faissIngestionStatus: "completed",
              faissChunkCount: chunks,
              numChunks: chunks,
              numEmbeddings: embeddings,
              faissIngestionDurationMs: durationMs,
              faissIngestionError: "",
              faissIngestedAt: new Date(),
            },
          }
        );
      } catch (e) {
        const msg = e?.message || String(e);
        await AssessmentReferenceRaw.findOneAndUpdate(
          { referenceKey: `${assessmentId}::${qk}::rubric` },
          {
            $set: {
              extractionStatus: "failed",
              extractionError: msg,
              faissIngestionStatus: "failed",
              faissIngestionError: msg,
            },
          }
        ).catch(() => {});
        console.warn("[AUTOMARK-REF] ⚠️ Rubric ingestion failed:", msg);
      }
    });
  } catch (error) {
    console.error("❌ uploadRubricForAutomark error:", error);
    return res.status(500).json({ success: false, error: "Failed to upload rubric", details: error.message });
  }
};

/**
 * Upload a CLO file/text artifact for an assessment, then ingest into the
 * Assessment Reference FAISS index.
 *
 * POST /api/assessments/:assessmentId/upload-clo
 * multipart/form-data:
 * - cloFile: file (pdf/docx/jpg/png)
 *
 * Notes:
 * - Stored as questionKey="ALL" and referenceType="clo".
 */
exports.uploadCloForAutomark = async (req, res) => {
  try {
    const { assessmentId } = req.params;
    if (!assessmentId) {
      return res.status(400).json({ success: false, error: "assessmentId is required" });
    }
    if (!req.file?.path) {
      return res.status(400).json({ success: false, error: "cloFile is required" });
    }

    const assessment = await Assessment.findById(assessmentId).lean();
    if (!assessment) {
      return res.status(404).json({ success: false, error: "Assessment not found" });
    }

    const replaceFlag =
      String(req.query?.replace || req.body?.replace || "")
        .trim()
        .toLowerCase() === "true";

    const existing = await AssessmentReferenceRaw.findOne({
      assessmentId: assessment._id,
      referenceType: "clo",
    })
      .select("_id extractionStatus faissIngestionStatus source")
      .lean();

    if (existing && !replaceFlag) {
      return res.status(409).json({
        success: false,
        error: "CLO already exists for this assessment. Set replace=true to overwrite.",
        code: "CLO_EXISTS",
        current: {
          extractionStatus: existing.extractionStatus || "pending",
          faissIngestionStatus: existing.faissIngestionStatus || "pending",
          source: existing.source || "",
        },
      });
    }

    const title = `${assessment.title || "Assessment"} - CLO`;
    const qk = "ALL";

    await AssessmentReferenceRaw.findOneAndUpdate(
      { referenceKey: `${assessmentId}::${qk}::clo` },
      {
        $setOnInsert: {
          assessmentId,
          questionKey: qk,
          referenceType: "clo",
          referenceKey: `${assessmentId}::${qk}::clo`,
        },
        $set: {
          source: req.file.originalname || path.basename(req.file.path),
          title,
          extractionStatus: "pending",
          faissIngestionStatus: "pending",
          faissIngestionError: "",
        },
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      message: "CLO upload received. Ingestion started.",
      assessmentId,
      file: { originalName: req.file.originalname, storedPath: req.file.path },
    });

    setImmediate(async () => {
      const startedAt = Date.now();
      try {
        const result = await ingestAssessmentReference({
          assessmentId,
          type: "clo",
          questionId: "ALL",
          filePath: req.file.path,
          splitSampleAnswer: false,
          questionCount: 0,
          title,
        });

        const durationMs = Date.now() - startedAt;
        const chunks = Number(result?.total_chunks_created ?? 0) || 0;
        const embeddings = Number(result?.total_embeddings_created ?? chunks) || chunks;

        await AssessmentReferenceRaw.findOneAndUpdate(
          { referenceKey: `${assessmentId}::${qk}::clo` },
          {
            $set: {
              extractionStatus: "completed",
              extractor: result?.extractor || "",
              pageCount: Number(result?.page_count ?? 0) || 0,
              pageMetadata: Array.isArray(result?.page_metadata) ? result.page_metadata : [],
              visualCount: Number(result?.visual_count ?? 0) || 0,
              ocrEnabled: Boolean(result?.ocr_enabled),
              ocrStatus: result?.ocr_status || "",
              ocrError: result?.ocr_error || "",
              ocrCount: Number(result?.ocr_count ?? 0) || 0,
              ocrCharCount: Number(result?.ocr_char_count ?? 0) || 0,
              extractedAt: new Date(),
              faissIngestionStatus: "completed",
              faissChunkCount: chunks,
              numChunks: chunks,
              numEmbeddings: embeddings,
              faissIngestionDurationMs: durationMs,
              faissIngestionError: "",
              faissIngestedAt: new Date(),
            },
          }
        );
      } catch (e) {
        const msg = e?.message || String(e);
        await AssessmentReferenceRaw.findOneAndUpdate(
          { referenceKey: `${assessmentId}::${qk}::clo` },
          {
            $set: {
              extractionStatus: "failed",
              extractionError: msg,
              faissIngestionStatus: "failed",
              faissIngestionError: msg,
            },
          }
        ).catch(() => {});
        console.warn("[AUTOMARK-REF] ⚠️ CLO ingestion failed:", msg);
      }
    });
  } catch (error) {
    console.error("❌ uploadCloForAutomark error:", error);
    return res.status(500).json({ success: false, error: "Failed to upload CLO", details: error.message });
  }
};

// Update assessment status
exports.updateAssessmentStatus = async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const { status } = req.body;

    const assessment = await Assessment.findByIdAndUpdate(
      assessmentId,
      { status },
      { new: true }
    );

    if (!assessment) {
      return res.status(404).json({ error: "Assessment not found" });
    }

    res.status(200).json({
      success: true,
      message: `Assessment ${status}`,
      assessment
    });
  } catch (error) {
    console.error("Error updating assessment:", error);
    res.status(500).json({ error: "Failed to update assessment", details: error.message });
  }
};

// ✅ PUBLISH ASSESSMENT FUNCTION
// Called when: Immediate publish OR cron job triggers scheduled publish
async function publishAssessment(assessmentId, course) {
  try {
    console.log(`\n🚀 Publishing assessment: ${assessmentId}`);
    
    // Fetch assessment
    const assessment = await Assessment.findById(assessmentId);
    if (!assessment) {
      throw new Error('Assessment not found');
    }

    // Fetch full CLO data
    const clos = await CLO.find({ _id: { $in: assessment.cloIds } }).populate('bloomLevelId');
    
    // ✅ GENERATE QUESTIONS
    const { generateQuestions } = require('../utils/ollama');
    
    const TYPE_MAP = {
      'short': 'short-answer',
      'short-answer': 'short-answer',
      'mcq': 'mcq',
      'coding': 'coding'
    };

    console.log(`📋 Question Template from DB: "${assessment.questionTemplate}"`);
    const normalizedTemplate = TYPE_MAP[assessment.questionTemplate] || 'mcq';
    console.log(`📋 Normalized Question Type: "${assessment.questionTemplate}" → "${normalizedTemplate}"`);

    console.log('🤖 Generating questions...');
    console.log(`   📚 CLOs fetched: ${clos.length}`);
    clos.forEach((clo, idx) => {
      console.log(`      CLO ${idx + 1}: "${clo.description?.substring(0, 50)}..." (cloNumber: ${clo.cloNumber})`);
    });
    
    if (clos.length === 0) {
      throw new Error('No CLOs found for assessment. Cannot generate questions.');
    }
    
    const questions = await generateQuestions({
      clos: clos,
      courseTitle: course.courseTitle,
      questionType: normalizedTemplate,
      questionCount: assessment.questionCount,
      difficultyLevel: assessment.difficultyLevel,
      description: assessment.description,
      assessmentType: assessment.type
    });

    console.log(`   📝 Questions generated: ${questions.length}`);
    if (questions.length > 0) {
      questions.slice(0, 2).forEach((q, idx) => {
        console.log(`      Question ${idx + 1}: "${(q.questionText || 'MISSING').substring(0, 40)}..."`);
      });
    }

    if (questions.length === 0) {
      throw new Error('Failed to generate any questions. Check Ollama connection and logs above.');
    }

    // ✅ CALCULATE AND DISTRIBUTE MARKS
    const marksPerQuestion = Math.floor(assessment.totalMarks / questions.length);
    const extraMarks = assessment.totalMarks % questions.length;

    console.log(`📊 Marks: ${assessment.totalMarks} ÷ ${questions.length} = ${marksPerQuestion} each (+${extraMarks} extra)`);

    // ✅ SAVE QUESTIONS TO DATABASE
    const savedQuestions = await Promise.all(
      questions.map((q, index) => {
        const questionMarks = marksPerQuestion + (index < extraMarks ? 1 : 0);
        
        // Map questions to their CLOs to get descriptions
        const cloIndex = q.cloIndex || 0;
        const clo = clos[cloIndex];
        // ✅ FIXED: Safely check if CLO number already has "CLO-" prefix
        const rawCloNumber = clo?.cloNumber || `${cloIndex + 1}`;
        const cloNum = String(rawCloNumber).includes('CLO-') ? String(rawCloNumber) : `CLO-${rawCloNumber}`;
        const cloDescription = `${cloNum} ${clo?.description || `Learning Outcome ${cloIndex + 1}`}`;
        
        console.log(`      📋 CLO ${cloIndex}: rawNum="${rawCloNumber}" → final="${cloNum}"`);
        
        // ✅ VALIDATE MCQ QUESTIONS BEFORE SAVING
        let questionToSave = {
          ...q,
          marks: questionMarks,
          assessmentId: assessment._id,
          courseCode: course.courseCode,
          cloIndex: cloIndex,
          cloDescription: cloDescription
        };
        
        // Validate MCQ format
        if (questionToSave.questionType === 'mcq') {
          questionToSave = validateMCQBeforeSaving(questionToSave, index + 1);
        }
        
        console.log(`   📝 Question ${index + 1} BEFORE save:`);
        console.log(`      questionText: "${(questionToSave.questionText || '❌ MISSING').substring(0, 50)}..."`);
        console.log(`      questionType: ${questionToSave.questionType}`);
        if (questionToSave.questionType === 'mcq') {
          console.log(`      options: ${questionToSave.options?.length || 0} (MCQ)`);
          const correctCount = questionToSave.options?.filter(o => o.isCorrect).length || 0;
          console.log(`      correctAnswers: ${correctCount}`);
        } else {
          console.log(`      options: ${questionToSave.options?.length || 0} items`);
        }
        
        return Question.create(questionToSave).then(savedQ => {
          // ✅ DEBUG: Log AFTER saving
          console.log(`   ✅ Question ${index + 1} AFTER save (DB):`);
          console.log(`      _id: ${savedQ._id}`);
          console.log(`      questionText: "${(savedQ.questionText || '❌ MISSING').substring(0, 50)}..."`);
          return savedQ;
        });
      })
    );

    // ✅ UPDATE ASSESSMENT WITH QUESTIONS
    assessment.questions = savedQuestions.map(q => q._id);
    console.log(`✅ Saved ${savedQuestions.length} questions`);

    // ✅ DEBUG: Verify questions were saved with questionText
    console.log(`\n📋 Verifying saved questions:`);
    savedQuestions.slice(0, 3).forEach((q, idx) => {
      console.log(`   Q${idx + 1}:`);
      console.log(`      questionText: "${(q.questionText || 'MISSING').substring(0, 60)}..."`);
      console.log(`      questionType: ${q.questionType}`);
      console.log(`      cloDescription: ${q.cloDescription}`);
      console.log(`      options.length: ${q.options?.length || 0}`);
    });
    console.log('');

    // ✅ GENERATE PDFS
    const { generateAssessmentPDF, generateAnswerKeyPDF } = require('../utils/pdfGenerator');

    console.log('📄 Generating PDFs...');
    
    // Fetch teacher name from Firebase
    let teacherName = 'Teacher';
    try {
      const { firestore } = require('../config/firebase');
      const teacherDoc = await firestore.collection('users').doc(assessment.teacherId).get();
      if (teacherDoc.exists) {
        teacherName = teacherDoc.data().name || teacherDoc.data().displayName || 'Teacher';
      }
      console.log(`👨‍🏫 Teacher: ${teacherName}`);
    } catch (teacherError) {
      console.warn(`⚠️ Could not fetch teacher name from Firebase:`, teacherError.message);
    }

    const pdfPath = await generateAssessmentPDF(assessment, savedQuestions, course);
    const pdfFilename = path.basename(pdfPath);

    const answerKeyPath = await generateAnswerKeyPDF(assessment, savedQuestions, course, teacherName);
    const answerKeyFilename = path.basename(answerKeyPath);

    assessment.assessmentPdfFile = pdfFilename;
    assessment.answerKeyPdfFile = answerKeyFilename;
    assessment.pdfUrl = `http://localhost:5000/api/assessments/pdf/${pdfFilename}`;
    
    console.log(`✅ PDFs generated: ${pdfFilename}, ${answerKeyFilename}`);

    // ✅ UPDATE STATUS TO PUBLISHED AND SAVE TO MONGODB
    assessment.status = 'published';
    assessment.sentAt = new Date();
    await assessment.save();

    console.log(`✅ Assessment saved to MongoDB: ${assessment._id}`);
    console.log(`   Status: ${assessment.status}`);
    console.log(`   PDF URL: ${assessment.pdfUrl}`);
    console.log(`   Answer Key: ${answerKeyFilename}`);
    console.log(`🎉 Assessment published successfully!`);

    // ⏳ SEND NOTIFICATIONS ASYNCHRONOUSLY (non-blocking)
    // Fire and forget - don't await or catch
    const assessmentTypeLabel = assessment.type === 'quiz' ? '📝 QUIZ' : '📋 ASSIGNMENT';
    console.log(`\n${assessmentTypeLabel} - Triggering notifications for:`);
    console.log(`   👨‍🏫 Teacher: ${assessment.teacherId}`);
    console.log(`   📚 Course: ${course.courseTitle} (${course.courseCode})`);
    console.log(`   🔔 Will notify: Teacher + Students + Admins`);
    sendNotificationsAsync(assessment, course);

    return assessment;

  } catch (error) {
    console.error('❌ Error publishing assessment:', error.message);
    throw error;
  }
}

/**
 * Send notifications to Firebase Firestore (async, non-blocking)
 * Uses Firebase notificationService for real-time notifications
 */
async function sendNotificationsAsync(assessment, course) {
  try {
    const typeLabel = assessment.type === 'quiz' ? 'QUIZ' : 'ASSIGNMENT';
    console.log(`\n📬 [ASYNC] Sending Firebase notifications for ${typeLabel}...`);
    console.log(`   Assessment Type: ${assessment.type}`);
    console.log(`   Assessment Title: ${assessment.title}`);
    console.log(`   MongoDB Course ID: ${course._id}`);
    console.log(`   Course Code: ${course.courseCode}`);
    
    // ✅ FETCH ENROLLED STUDENTS FROM FIREBASE (not MongoDB)
    // Enrollment data is stored in Firebase users collection with registeredCourses array
    const { firestore } = require('../config/firebase');
    
    // ✅ FETCH TEACHER NAME FROM FIREBASE
    let teacherName = 'Teacher';
    try {
      const teacherDoc = await firestore.collection('users').doc(assessment.teacherId).get();
      if (teacherDoc.exists) {
        teacherName = teacherDoc.data().name || teacherDoc.data().displayName || 'Teacher';
      }
    } catch (teacherError) {
      console.warn(`⚠️ Could not fetch teacher name from Firebase:`, teacherError.message);
    }
    console.log(`   👨‍🏫 Teacher: ${teacherName}`);
    
    // First, find the Firebase course that matches this MongoDB course
    const coursesRef = firestore.collection('courses');
    const courseQuery = coursesRef.where('mongodbCourseId', '==', course._id.toString());
    const courseSnapshot = await courseQuery.get();
    
    let firebaseCourseId = null;
    let studentIds = [];
    
    if (courseSnapshot.empty) {
      console.log(`   ⚠️ [ASYNC] No Firebase course found with mongodbCourseId: ${course._id}`);
      console.log(`   💡 TIP: Make sure the Firebase course has mongodbCourseId field set`);
      console.log(`   📢 Will still notify teacher and admins (but no students)...`);
    } else {
      // Get the Firebase course ID (students have THIS ID in their registeredCourses)
      firebaseCourseId = courseSnapshot.docs[0].id;
      console.log(`   🔍 Found Firebase Course ID: ${firebaseCourseId}`);
      
      const usersRef = firestore.collection('users');
      const studentsQuery = usersRef.where('role', '==', 'student');
      const studentsSnapshot = await studentsQuery.get();
      
      console.log(`   📊 Total students in Firebase: ${studentsSnapshot.size}`);
      
      // Filter to only students enrolled in THIS course (using Firebase course ID)
      const enrolledStudents = [];
      studentsSnapshot.forEach(doc => {
        const studentData = doc.data();
        const registeredCourses = studentData.registeredCourses || [];
        const enrolledCourses = studentData.enrolledCourses || [];
        const courses = studentData.courses || [];
        
        // Check if student is enrolled (using Firebase course ID, check all possible arrays)
        if (registeredCourses.includes(firebaseCourseId) || 
            enrolledCourses.includes(firebaseCourseId) || 
            courses.includes(firebaseCourseId)) {
          enrolledStudents.push({
            id: doc.id,
            email: studentData.email,
            name: studentData.displayName || studentData.email
          });
        }
      });
      
      console.log(`   ✅ Found ${enrolledStudents.length} enrolled students for course ${course.courseCode}`);
      
      if (enrolledStudents.length === 0) {
        console.log(`   ⚠️ [ASYNC] No enrolled students found in course ${course.courseCode}`);
        console.log(`   📋 MongoDB Course ID: ${course._id}`);
        console.log(`   📋 Firebase Course ID: ${firebaseCourseId}`);
        console.log(`   💡 TIP: Make sure students have '${firebaseCourseId}' in their registeredCourses/enrolledCourses/courses array in Firebase`);
        console.log(`   📢 Will still notify teacher and admins...`);
      }

      studentIds = enrolledStudents.map(s => s.id);
      console.log(`   📧 [ASYNC] Sending notifications to ${studentIds.length} students via Firebase`);
      if (studentIds.length > 0) {
        console.log(`   👥 Students:`, enrolledStudents.map(s => s.email).join(', '));
      }
    }
    
    // Fire notification service in background (don't block)
    console.log(`\n🚀 [${typeLabel}] Calling notifyAssessmentCreated...`);
    setImmediate(async () => {
      try {
        await notifyAssessmentCreated(
          assessment,
          course,
          assessment.teacherId,
          teacherName,
          studentIds
        );
        console.log(`✅ [${typeLabel}] Firebase notifications sent successfully!`);
        console.log(`   📊 Total sent: ${studentIds.length} students + 1 teacher + admins`);
      } catch (error) {
        console.warn(`⚠️ [${typeLabel}] Firebase notification error:`, error.message);
      }
    });

  } catch (error) {
    // Silently fail - log only, never throw
    console.warn(`⚠️ [ASYNC] Notification service error:`, error.message);
    console.error(`   Stack:`, error.stack);
  }
}

// Get all assessments for admin view
exports.getAllAssessments = async (req, res) => {
  try {
    const { status, type, limit, skip } = req.query;
    
    console.log(`🔍 [getAllAssessments] Fetching all assessments`);
    console.log(`   Status filter: ${status || 'all'}`);
    console.log(`   Type filter: ${type || 'all'}`);
    
    // Build query filter
    const filter = {};
    if (status) {
      filter.status = status;
    }
    if (type) {
      filter.type = type;
    }
    
    // Fetch assessments with pagination
    const assessments = await Assessment.find(filter)
      .populate('courseId', 'courseCode courseTitle')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) || 100)
      .skip(parseInt(skip) || 0)
      .lean();
    
    console.log(`✅ Found ${assessments.length} assessments`);
    
    // Enhance assessments with teacher info from Firebase
    const { firestore } = require('../config/firebase');
    const enhancedAssessments = await Promise.all(
      assessments.map(async (assessment) => {
        let teacherName = 'Unknown Teacher';
        try {
          if (assessment.teacherId) {
            const teacherDoc = await firestore.collection('users').doc(assessment.teacherId).get();
            if (teacherDoc.exists) {
              const teacherData = teacherDoc.data();
              teacherName = teacherData.name || teacherData.email || 'Unknown Teacher';
            }
          }
        } catch (err) {
          console.warn(`   Unable to fetch teacher name for ${assessment.teacherId}:`, err.message);
        }
        
        return {
          _id: assessment._id,
          title: assessment.title,
          type: assessment.type,
          status: assessment.status,
          courseCode: assessment.courseId?.courseCode || assessment.courseCode,
          courseTitle: assessment.courseId?.courseTitle || 'Unknown Course',
          teacherName,
          teacherId: assessment.teacherId,
          totalMarks: assessment.totalMarks,
          duration: assessment.duration,
          difficultyLevel: assessment.difficultyLevel,
          questionTemplate: assessment.questionTemplate,
          questionCount: assessment.questionCount,
          createdAt: assessment.createdAt,
          scheduledTime: assessment.scheduledTime,
          submissionDeadline: assessment.submissionDeadline,
          pdfUrl: assessment.pdfUrl,
          assessmentPdfFile: assessment.assessmentPdfFile,
          answerKeyPdfFile: assessment.answerKeyPdfFile
        };
      })
    );
    
    // Get total count for pagination
    const totalCount = await Assessment.countDocuments(filter);
    
    res.status(200).json({
      success: true,
      assessments: enhancedAssessments,
      count: enhancedAssessments.length,
      total: totalCount
    });
  } catch (error) {
    console.error("Error fetching all assessments:", error);
    res.status(500).json({ 
      error: "Failed to fetch assessments", 
      details: error.message 
    });
  }
};

// Update Assessment Due Date and notify students
exports.updateAssessmentDueDate = async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const { dueDate, dueTime, teacherId } = req.body;
    
    console.log(`📝 updateAssessmentDueDate called`);
    console.log(`   assessmentId: ${assessmentId}`);
    console.log(`   dueDate: ${dueDate}`);
    console.log(`   dueTime: ${dueTime}`);
    console.log(`   teacherId: ${teacherId}`);

    // Validate input
    if (!dueDate || !dueTime) {
      return res.status(400).json({ 
        success: false, 
        error: "Due date and time are required" 
      });
    }

    // Find the assessment
    const assessment = await Assessment.findById(assessmentId).populate('courseId');
    if (!assessment) {
      return res.status(404).json({ 
        success: false, 
        error: "Assessment not found" 
      });
    }

    // Verify teacher ownership
    if (assessment.teacherId !== teacherId) {
      return res.status(403).json({ 
        success: false, 
        error: "Unauthorized: You can only update your own assessments" 
      });
    }

    // Update the assessment
    assessment.dueDate = dueDate;
    assessment.dueTime = dueTime;
    // Keep the unified deadline field in sync so student UI can unfreeze correctly.
    // Student UI uses `submissionDeadline || dueDate`.
    assessment.submissionDeadline = new Date(`${dueDate}T${dueTime}`).toISOString();
    await assessment.save();

    console.log(`✅ Due date updated for assessment: ${assessment.title}`);
    console.log(`   New due date: ${dueDate} at ${dueTime}`);

    // Send notifications to students
    try {
      const { firestore } = require('../config/firebase');
      
      // Get teacher name
      let teacherName = 'Your teacher';
      try {
        const teacherDoc = await firestore.collection('users').doc(teacherId).get();
        if (teacherDoc.exists) {
          teacherName = teacherDoc.data().name || teacherDoc.data().displayName || 'Your teacher';
        }
      } catch (err) {
        console.warn(`Could not fetch teacher name:`, err.message);
      }

      // Find Firebase course id for this assessment's course.
      // Primary: mongodbCourseId mapping. Fallback: courseCode mapping.
      let firebaseCourseId = null;
      try {
        const coursesRef = firestore.collection('courses');

        if (assessment.courseId && assessment.courseId._id) {
          const byMongoId = await coursesRef
            .where('mongodbCourseId', '==', assessment.courseId._id.toString())
            .get();

          if (!byMongoId.empty) {
            firebaseCourseId = byMongoId.docs[0].id;
          }
        }

        if (!firebaseCourseId && assessment.courseCode) {
          const byCourseCode = await coursesRef
            .where('courseCode', '==', assessment.courseCode)
            .get();

          if (!byCourseCode.empty) {
            firebaseCourseId = byCourseCode.docs[0].id;
          }
        }
      } catch (courseLookupErr) {
        console.warn(`⚠️ Error mapping course to Firebase:`, courseLookupErr.message);
      }

      if (firebaseCourseId) {
        // Find enrolled students
        const usersRef = firestore.collection('users');

        // Fast path: students registered for this course.
        let enrolledStudents = [];
        try {
          const regSnap = await usersRef
            .where('registeredCourses', 'array-contains', firebaseCourseId)
            .get();
          regSnap.forEach(d => enrolledStudents.push(d.id));
        } catch (err) {
          // If index isn't available, fallback to scan below.
        }

        // Backward compat: also check enrolledCourses/courses arrays
        if (enrolledStudents.length === 0) {
          const studentsSnapshot = await usersRef.where('role', '==', 'student').get();
          studentsSnapshot.forEach(doc => {
            const studentData = doc.data();
            const registeredCourses = studentData.registeredCourses || [];
            const enrolledCourses = studentData.enrolledCourses || [];
            const courses = studentData.courses || [];
            if (
              registeredCourses.includes(firebaseCourseId) ||
              enrolledCourses.includes(firebaseCourseId) ||
              courses.includes(firebaseCourseId)
            ) {
              enrolledStudents.push(doc.id);
            }
          });
        }

        // Remove duplicates
        enrolledStudents = [...new Set(enrolledStudents)];

        console.log(`📢 Notifying ${enrolledStudents.length} students about due date change`, {
          firebaseCourseId,
          courseCode: assessment.courseCode
        });

        // Create notification for each student
        const { admin } = require('../config/firebase');
        const nowTs = admin.firestore.FieldValue.serverTimestamp();

        for (const studentId of enrolledStudents) {
          const notificationRef = firestore.collection('notifications').doc();
          await notificationRef.set({
            recipientId: studentId,
            recipientRole: 'student',
            recipientType: 'student',
            type: 'assessment_due_date_updated',
            title: 'Due Date Updated',
            message: `${teacherName} has updated the due date for "${assessment.title}" (${assessment.courseCode}) to ${dueDate} at ${dueTime}`,
            assessmentId: assessmentId,
            assessmentTitle: assessment.title,
            courseCode: assessment.courseCode,
            courseId: assessment.courseId?._id,
            newDueDate: dueDate,
            newDueTime: dueTime,
            createdAt: nowTs,
            timestamp: nowTs,
            read: false
          });
        }

        console.log(`✅ Notifications sent to students`);
      } else {
        console.warn(`⚠️ Could not map course to Firebase, skipping student notifications`, {
          courseId: assessment.courseId?._id?.toString?.(),
          courseCode: assessment.courseCode
        });
      }

      // Notify teacher
      const teacherNotifRef = firestore.collection('notifications').doc();
      await teacherNotifRef.set({
        recipientId: teacherId,
        recipientRole: 'teacher',
        recipientType: 'teacher',
        type: 'assessment_due_date_updated',
        title: 'Due Date Updated',
        message: `You have updated the due date for "${assessment.title}" to ${dueDate} at ${dueTime}`,
        assessmentId: assessmentId,
        assessmentTitle: assessment.title,
        courseCode: assessment.courseCode,
        newDueDate: dueDate,
        newDueTime: dueTime,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        read: false
      });

    } catch (notifError) {
      console.warn(`⚠️ Error sending notifications:`, notifError.message);
      // Don't fail the request if notifications fail
    }

    res.status(200).json({
      success: true,
      message: `Due date updated successfully. Students have been notified.`,
      assessment: {
        _id: assessment._id,
        title: assessment.title,
        dueDate: assessment.dueDate,
        dueTime: assessment.dueTime
      }
    });

  } catch (error) {
    console.error("Error updating assessment due date:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to update due date", 
      details: error.message 
    });
  }
};

// Delete an assessment
exports.deleteAssessment = async (req, res) => {
  try {
    const { assessmentId } = req.params;

    console.log(`🗑️ deleteAssessment called for: ${assessmentId}`);

    // Find the assessment
    const assessment = await Assessment.findById(assessmentId);
    if (!assessment) {
      console.log(`❌ Assessment not found: ${assessmentId}`);
      return res.status(404).json({ 
        success: false,
        error: "Assessment not found" 
      });
    }

    console.log(`📋 Assessment found: ${assessment.title}`);
    console.log(`   Type: ${assessment.type}`);
    console.log(`   Status: ${assessment.status}`);

    // Delete associated PDF files from filesystem
    const pdfsDir = path.join(__dirname, '../pdfs');
    if (assessment.assessmentPdfFile) {
      try {
        const assessmentPdfPath = path.join(pdfsDir, assessment.assessmentPdfFile);
        if (fs.existsSync(assessmentPdfPath)) {
          fs.unlinkSync(assessmentPdfPath);
          console.log(`✅ Deleted assessment PDF: ${assessment.assessmentPdfFile}`);
        }
      } catch (fileError) {
        console.warn(`⚠️ Could not delete assessment PDF file:`, fileError.message);
      }
    }

    if (assessment.answerKeyPdfFile) {
      try {
        const answerKeyPdfPath = path.join(pdfsDir, assessment.answerKeyPdfFile);
        if (fs.existsSync(answerKeyPdfPath)) {
          fs.unlinkSync(answerKeyPdfPath);
          console.log(`✅ Deleted answer key PDF: ${assessment.answerKeyPdfFile}`);
        }
      } catch (fileError) {
        console.warn(`⚠️ Could not delete answer key PDF file:`, fileError.message);
      }
    }

    // Delete associated questions from MongoDB
    if (assessment.questions && assessment.questions.length > 0) {
      try {
        await Question.deleteMany({ _id: { $in: assessment.questions } });
        console.log(`✅ Deleted ${assessment.questions.length} associated questions`);
      } catch (questionError) {
        console.warn(`⚠️ Could not delete all questions:`, questionError.message);
      }
    }

    // Delete associated submissions from MongoDB
    try {
      const deletedSubmissions = await Submission.deleteMany({ assessmentId });
      console.log(`✅ Deleted ${deletedSubmissions.deletedCount} associated submissions`);
    } catch (submissionError) {
      console.warn(`⚠️ Could not delete all submissions:`, submissionError.message);
    }

    // Delete the assessment itself
    await Assessment.findByIdAndDelete(assessmentId);
    console.log(`✅ Assessment record deleted from MongoDB: ${assessmentId}`);

    res.status(200).json({
      success: true,
      message: "Assessment deleted successfully",
      deletedAssessment: {
        _id: assessment._id,
        title: assessment.title,
        type: assessment.type
      }
    });

  } catch (error) {
    console.error("❌ Error deleting assessment:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to delete assessment",
      details: error.message 
    });
  }
};