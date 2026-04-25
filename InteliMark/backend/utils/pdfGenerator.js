const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ─── Color Scheme (Professional + Colorful) ──────────────────────────────────
const COLORS = {
    primary: '#1e40af',        // Rich blue
    secondary: '#3b82f6',      // Bright blue
    accent: '#ef4444',         // Red accent
    success: '#10b981',        // Green
    headerBg: '#1e3a8a',       // Deep blue
    textPrimary: '#1f2937',    // Dark gray
    textSecondary: '#6b7280',  // Medium gray
    textLight: '#9ca3af',      // Light gray
    borderLight: '#e5e7eb',    // Very light gray
    borderMedium: '#d1d5db',   // Light gray
    bgHighlight: '#dbeafe',    // Light blue bg
    white: '#ffffff',
    fillBlank: '#f3f4f6',       // Very light gray for fill-in-the-blank
};

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 45;
const CONTENT_W = PAGE_WIDTH - MARGIN * 2;

// ─── Helper Functions ─────────────────────────────────────────────────────────

// Format date
function formatDate(date) {
    if (!date) return new Date().toLocaleDateString('en-US', { 
        year: 'numeric', month: 'long', day: 'numeric' 
    });
    return new Date(date).toLocaleDateString('en-US', { 
        year: 'numeric', month: 'long', day: 'numeric' 
    });
}

// Format time
function formatTime(date) {
    if (!date) return new Date().toLocaleTimeString('en-US', { 
        hour: '2-digit', minute: '2-digit', hour12: true 
    });
    return new Date(date).toLocaleTimeString('en-US', { 
        hour: '2-digit', minute: '2-digit', hour12: true 
    });
}

// ✅ NEW: Extract data from Mongoose document or plain object
function getQuestionData(question) {
    if (!question) return null;
    // If it's a Mongoose document with _doc, use that
    if (question._doc) return question._doc;
    // If it has toObject method, use that
    if (typeof question.toObject === 'function') return question.toObject();
    // Otherwise return as-is
    return question;
}

function drawProfessionalHeader(doc, assessment, course) {
    // ─── MINIMAL CENTERED HEADER ────────────────────────────────────────────────
    doc.save()
        .rect(0, 0, PAGE_WIDTH, 70)
        .fill(COLORS.headerBg)
        .restore();

    // Assessment title centered in header - MINIMAL DESIGN
    doc.fontSize(28)
        .font('Helvetica-Bold')
        .fillColor(COLORS.white)
        .text(assessment.title, MARGIN, 15, {
            width: CONTENT_W,
            align: 'center'
        });

    // Course code and name below title
    doc.fontSize(11)
        .font('Helvetica')
        .fillColor(COLORS.white)
        .text(`${course.courseCode} · ${course.courseTitle}`, MARGIN, doc.y + 5, {
            width: CONTENT_W,
            align: 'center'
        });

    doc.y = 75;

    // ─── METADATA SUMMARY TABLE (4 COLUMNS) ───────────────────────────────────
    // Shows: Total Marks | Duration (quiz) OR Late Penalty (assignment) | Difficulty | Passing Threshold
    const tableColWidth = CONTENT_W / 4;
    const tableY = doc.y;
    const cellHeight = 30;
    const headerBgColor = '#f3f4f6';
    const borderColor = COLORS.borderMedium;

    // Table header background
    doc.save()
        .rect(MARGIN, tableY, CONTENT_W, cellHeight)
        .fill(headerBgColor)
        .restore();

    // For assignments, show late penalty instead of duration
    const secondColumnHeader = assessment.type === 'assignment' ? 'LATE PENALTY' : 'DURATION';
    const secondColumnValue = assessment.type === 'assignment' 
        ? `${assessment.latePenalty || 0}%` 
        : `${assessment.duration || 30} min`;

    const metadataHeaders = ['TOTAL MARKS', secondColumnHeader, 'DIFFICULTY', 'PASSING THRESHOLD'];
    const metadataValues = [
        assessment.totalMarks || '10',
        secondColumnValue,
        (assessment.difficultyLevel || 'MEDIUM').toUpperCase(),
        `${assessment.threshold || 75}%`
    ];

    metadataHeaders.forEach((header, idx) => {
        const cellX = MARGIN + (idx * tableColWidth);
        
        // Header text
        doc.fontSize(8)
            .font('Helvetica-Bold')
            .fillColor(COLORS.textSecondary)
            .text(header, cellX + 5, tableY + 5, {
                width: tableColWidth - 10,
                align: 'center'
            });

        // Value text
        doc.fontSize(11)
            .font('Helvetica-Bold')
            .fillColor(COLORS.textPrimary)
            .text(metadataValues[idx], cellX + 5, tableY + 15, {
                width: tableColWidth - 10,
                align: 'center'
            });

        // Cell border
        doc.moveTo(cellX, tableY)
            .lineTo(cellX, tableY + cellHeight)
            .strokeColor(borderColor)
            .lineWidth(0.5)
            .stroke();
    });

    // Right border
    doc.moveTo(PAGE_WIDTH - MARGIN, tableY)
        .lineTo(PAGE_WIDTH - MARGIN, tableY + cellHeight)
        .strokeColor(borderColor)
        .lineWidth(0.5)
        .stroke();

    doc.y = tableY + cellHeight + 15;

    // ─── STUDENT INFORMATION SECTION ──────────────────────────────────────────
    const studentInfoY = doc.y;
    const studentColWidth = CONTENT_W / 4;
    const studentFieldHeight = 20;

    const studentFields = ['STUDENT NAME', 'STUDENT ID', 'SECTION', 'DATE'];

    studentFields.forEach((field, idx) => {
        const fieldX = MARGIN + (idx * studentColWidth);
        
        // Label
        doc.fontSize(8)
            .font('Helvetica-Bold')
            .fillColor(COLORS.textSecondary)
            .text(field, fieldX, studentInfoY, {
                width: studentColWidth - 10,
                align: 'left'
            });

        // Underline for writing
        doc.moveTo(fieldX, studentInfoY + 12)
            .lineTo(fieldX + studentColWidth - 5, studentInfoY + 12)
            .strokeColor(COLORS.borderMedium)
            .lineWidth(0.8)
            .stroke();
    });

    doc.y = studentInfoY + studentFieldHeight + 10;

    // ─── INSTRUCTIONS SECTION ─────────────────────────────────────────────────
    const instructionsY = doc.y;
    const instructionsBgColor = '#fef3c7'; // Light yellow
    const instructionsTextColor = '#78350f'; // Brown text

    // Instructions background box - adjusted for 3 key instructions
    doc.save()
        .rect(MARGIN, instructionsY, CONTENT_W, 60)
        .fill(instructionsBgColor)
        .restore();

    // Instructions title
    doc.fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(instructionsTextColor)
        .text('INSTRUCTIONS', MARGIN + 8, instructionsY + 5);

    // Instructions bullet points - Dynamic based on assessment type
    const instructions = ['All questions are compulsory.'];
    
    // For quizzes: show duration
    if (assessment.type === 'quiz') {
        instructions.push(`Total time: ${assessment.duration || 30} minutes.`);
    }
    // For assignments: show late penalty if applicable
    else if (assessment.type === 'assignment') {
        if (assessment.allowLateSubmission && assessment.latePenalty > 0) {
            instructions.push(`Late submissions allowed with ${assessment.latePenalty}% penalty per day.`);
        } else if (assessment.allowLateSubmission) {
            instructions.push('Late submissions allowed without penalty.');
        } else {
            instructions.push('Late submissions not allowed.');
        }
    }
    
    instructions.push(`Total marks: ${assessment.totalMarks || 100}.`);

    let instructionLineY = instructionsY + 18;
    instructions.forEach(instruction => {
        doc.fontSize(9)
            .font('Helvetica')
            .fillColor(instructionsTextColor)
            .text(`• ${instruction}`, MARGIN + 12, instructionLineY, {
                width: CONTENT_W - 20,
                align: 'left'
            });
        instructionLineY = doc.y + 4;
    });

    doc.y = instructionsY + 65;

    // ─── QUESTIONS SECTION HEADER ────────────────────────────────────────────
    doc.moveDown(0.8);
    doc.fontSize(12)
        .font('Helvetica-Bold')
        .fillColor(COLORS.primary)
        .text('Questions', MARGIN, doc.y);

    // Underline
    doc.moveTo(MARGIN, doc.y + 5)
        .lineTo(MARGIN + 65, doc.y + 5)
        .strokeColor(COLORS.accent)
        .lineWidth(2)
        .stroke();

    doc.moveDown(1.5);

    return doc.y;
}

// Draw Short Answer question - clean question paper only
function drawShortAnswerQuestion(doc, question, index, startY) {
    const questionY = drawQuestionHeader(doc, question, index, startY);
    // ✅ CRITICAL: Short answer questions show ONLY the question, NOT the answer
    // Students must provide their own answer in the answer submission
    // ✅ REMOVED: Answer space to keep clean question paper format
    return questionY + 8;
}

// Draw Long Answer question - clean question paper only
function drawLongAnswerQuestion(doc, question, index, startY) {
    const questionY = drawQuestionHeader(doc, question, index, startY);
    // ✅ CRITICAL: Long answer questions show ONLY the question, NOT the expected answer
    // Students must provide their own detailed response in the answer submission
    // ✅ REMOVED: Answer space to keep clean question paper format
    return questionY + 8;
}

// Draw MCQ with properly formatted options
// ✅ IMPORTANT: Do NOT highlight, bold, or mark the correct answer
// Students must NOT see which option is correct in the quiz
function drawMCQQuestion(doc, question, index, startY) {
    const questionY = drawQuestionHeader(doc, question, index, startY);
    let currentY = questionY + 5;

    if (!question.options || question.options.length === 0) {
        return currentY;
    }

    // Draw options with formatting - Times New Roman 12pt, black color
    // ⚠️ CRITICAL: All options must be formatted identically - NO exceptions
    question.options.forEach((option, optIdx) => {
        const letter = String.fromCharCode(97 + optIdx); // a, b, c, d, etc. (lowercase)
        const optionY = currentY;

        // Option with letter and parenthesis: a) Option text
        // ✅ SAFEGUARD: Using uniform formatting - NO highlighting based on option.isCorrect
        doc.fontSize(12)
            .font('Times-Roman')
            .fillColor('#000000')  // ✅ Always black - never highlight correct answer
            .text(`${letter}) ${option.text || option}`, MARGIN + 25, optionY, {
                width: CONTENT_W - 50,
                align: 'left'
            });

        currentY = doc.y + 6;
    });

    // ✅ CRITICAL: No answer indicators (checkmarks, stars, colors) are added
    // ✅ REMOVED: Student answer checkbox to keep clean question paper format
    return currentY + 8;
}

// Draw Fill-in-the-blank question
// ✅ IMPORTANT: Do NOT show the correct answer to students
function drawFillInTheBlanksQuestion(doc, question, index, startY) {
    const questionY = drawQuestionHeader(doc, question, index, startY);
    let currentY = questionY;

    // ✅ CRITICAL: Fill-in-the-blank questions show ONLY the question with blanks
    // The correct answer is NOT displayed to protect question integrity
    // Students must fill in the blanks themselves
    // ✅ REMOVED: Answer lines to keep clean question paper format

    return currentY + 8;
}

// Draw True/False question
// ✅ IMPORTANT: Do NOT highlight or mark the correct answer
// Students must NOT see which option is correct in the quiz
function drawTrueFalseQuestion(doc, question, index, startY) {
    const questionY = drawQuestionHeader(doc, question, index, startY);
    let currentY = questionY + 5;

    const options = [
        { letter: 'a', text: 'True' },
        { letter: 'b', text: 'False' }
    ];

    // ✅ SAFEGUARD: All options formatted identically - NO marking of correct answer
    options.forEach((option) => {
        // Option with letter and parenthesis: a) True  or  b) False
        // ✅ Always using black text - never highlight correct answer
        doc.fontSize(12)
            .font('Times-Roman')
            .fillColor('#000000')  // ✅ Uniform formatting regardless of correctness
            .text(`${option.letter}) ${option.text}`, MARGIN + 25, currentY, {
                width: CONTENT_W - 50
            });

        currentY = doc.y + 6;
    });

    // ✅ CRITICAL: No answer indicators are added
    return currentY + 8;
}

// Helper function: Draw question header (number, text, marks, bloom level)
// ✅ CRITICAL: This function displays ONLY the question text and metadata
// ⚠️ Do NOT display correctAnswer or any answer-related fields
function drawQuestionHeader(doc, question, index, startY) {
    // ✅ DEBUG: Log question object
    if (!question.questionText) {
        console.warn(`⚠️ WARNING: Question ${index} has no questionText!`);
        console.warn(`   Question object keys: ${Object.keys(question).join(', ')}`);
        console.warn(`   Full question object:`, JSON.stringify(question, null, 2));
    }
    
    // Question number with period: "1. Question text..."
    // ✅ SAFEGUARD: Only showing question text - NOT the correctAnswer or isCorrect fields
    doc.fontSize(12)
        .font('Times-Bold')
        .fillColor('#000000')
        .text(`${index}. ${question.questionText || '(Question text missing)'}`, MARGIN, startY, {
            width: CONTENT_W
        });

    let currentY = doc.y + 5;

    // Show marks for the question
    if (question.marks) {
        doc.fontSize(9)
            .font('Helvetica')
            .fillColor(COLORS.textSecondary)
            .text(`Marks: ${question.marks}`, MARGIN, currentY);
        currentY = doc.y + 5;
    }

    return currentY;
}

function drawProfessionalFooter(doc, pageNum) {
    const footerY = PAGE_HEIGHT - 35;

    // Separator line
    doc.moveTo(MARGIN, footerY)
        .lineTo(PAGE_WIDTH - MARGIN, footerY)
        .strokeColor(COLORS.borderLight)
        .lineWidth(0.5)
        .stroke();

    // Footer text
    const now = new Date();
    const dateStr = formatDate(now);
    const timeStr = formatTime(now);

    // Left side: Generated by
    doc.fontSize(8)
        .font('Helvetica')
        .fillColor(COLORS.textSecondary)
        .text('InteliMark Assessment System', MARGIN, footerY + 8, {
            width: CONTENT_W / 2,
            align: 'left'
        });

    // Right side: Generation info
    doc.fontSize(8)
        .fillColor(COLORS.textLight)
        .text(`${dateStr} • ${timeStr}`, PAGE_WIDTH - MARGIN - 150, footerY + 8, {
            width: 150,
            align: 'right'
        });

    // Page number
    if (pageNum) {
        doc.fontSize(8)
            .fillColor(COLORS.textLight)
            .text(`Page ${pageNum}`, MARGIN, footerY + 20, {
                width: CONTENT_W,
                align: 'center'
            });
    }
}

// ─── Main PDF Generator ───────────────────────────────────────────────────────

async function generateAssessmentPDF(assessment, questions, course) {
    return new Promise((resolve, reject) => {
        try {
            // ✅ DEBUG: Log what questions we received for PDF generation
            console.log(`📄 generateAssessmentPDF called with ${questions.length} questions`);
            if (questions.length > 0) {
                console.log(`   First 3 questions:`);
                questions.slice(0, 3).forEach((q, idx) => {
                    console.log(`      Q${idx + 1}:`);
                    console.log(`         questionText: "${(q.questionText || '❌ MISSING').substring(0, 50)}..."`);
                    console.log(`         questionType: ${q.questionType}`);
                    console.log(`         cloDescription: ${q.cloDescription}`);
                });
            }

            const pdfsDir = path.join(__dirname, '../pdfs');
            if (!fs.existsSync(pdfsDir)) {
                fs.mkdirSync(pdfsDir, { recursive: true });
            }

            const filename = `assessment-${assessment._id}-${Date.now()}.pdf`;
            const filepath = path.join(pdfsDir, filename);

            const doc = new PDFDocument({
                size: 'A4',
                margin: 0,
                bufferPages: true,
                info: {
                    Title: assessment.title,
                    Author: 'InteliMark Assessment System',
                    Subject: `${course.courseCode} Assessment`,
                    Creator: 'InteliMark'
                }
            });

            const stream = fs.createWriteStream(filepath);
            doc.pipe(stream);

            // Draw professional header
            let currentY = drawProfessionalHeader(doc, assessment, course);

            currentY += 10;

            // Draw questions with pagination
            let pageNum = 1;

            // ─── GROUP QUESTIONS BY CLO/MODULE ───────────────────────────────
            // Create a map of CLO descriptions to group questions
            // ✅ FIX: Convert Mongoose documents to plain objects first
            const cloMap = new Map();
            questions.forEach((q, idx) => {
                // ✅ FIX: Properly extract question data from Mongoose documents
                const qData = getQuestionData(q);
                if (!qData) {
                    console.warn(`⚠️ Question ${idx} is null or undefined after getQuestionData()`);
                    return;
                }
                
                console.log(`📊 Question ${idx} after extraction:`, {
                    has_questionText: !!qData.questionText,
                    questionText_length: qData.questionText ? qData.questionText.length : 0,
                    questionText_sample: qData.questionText ? qData.questionText.substring(0, 60) : 'MISSING',
                    cloIndex: qData.cloIndex,
                    cloDescription: qData.cloDescription
                });
                
                const cloIndex = qData.cloIndex || 0;
                const cloKey = `CLO_${cloIndex}`;
                if (!cloMap.has(cloKey)) {
                    cloMap.set(cloKey, {
                        description: qData.cloDescription || `Learning Outcome ${cloIndex + 1}`,
                        questions: []
                    });
                }
                
                // ✅ Spread the data to ensure all fields are copied
                const questionCopy = {
                    ...qData,
                    originalIndex: idx + 1
                };
                
                console.log(`📝 Question ${idx} after spread:`, {
                    has_questionText: !!questionCopy.questionText,
                    questionText_sample: questionCopy.questionText ? questionCopy.questionText.substring(0, 60) : 'MISSING'
                });
                
                cloMap.get(cloKey).questions.push(questionCopy);
            });

            // ─── DRAW QUESTIONS GROUPED BY CLO ──────────────────────────────
            let globalQuestionNumber = 1;


            cloMap.forEach((cloData) => {
                // Check if we need a new page
                if (currentY > PAGE_HEIGHT - 150) {
                    drawProfessionalFooter(doc, pageNum);
                    doc.addPage();
                    pageNum++;
                    currentY = MARGIN + 20;
                }

                // Module/CLO Header (shown only once)
                doc.fontSize(12)
                    .font('Helvetica-Bold')
                    .fillColor(COLORS.primary)
                    .text(cloData.description, MARGIN, currentY);

                currentY = doc.y + 5;

                // Underline
                doc.moveTo(MARGIN, currentY)
                    .lineTo(PAGE_WIDTH - MARGIN, currentY)
                    .strokeColor(COLORS.secondary)
                    .lineWidth(1)
                    .stroke();

                currentY += 12;

                // Draw questions in this section
                cloData.questions.forEach((question, idx) => {
                    // Estimate space needed
                    let estimatedHeight = 50; // Base height

                    if (question.questionType === 'mcq' && question.options) {
                        estimatedHeight = 60 + (question.options.length * 18);
                    } else if (question.questionType === 'long-answer') {
                        estimatedHeight = 150;
                    } else if (question.questionType === 'short-answer') {
                        estimatedHeight = 90;
                    } else if (question.questionType === 'fill-in-the-blank') {
                        estimatedHeight = 80;
                    } else if (question.questionType === 'true-false') {
                        estimatedHeight = 75;
                    }

                    if (currentY + estimatedHeight > PAGE_HEIGHT - 80) {
                        drawProfessionalFooter(doc, pageNum);
                        doc.addPage();
                        pageNum++;
                        currentY = MARGIN + 20;
                    }

                    // ✅ Draw question based on type (only supported types: 'mcq', 'short-answer', 'coding')
                    let nextY;
                    switch (question.questionType) {
                        case 'mcq':
                            nextY = drawMCQQuestion(doc, question, globalQuestionNumber, currentY);
                            break;
                        case 'short-answer':
                            nextY = drawShortAnswerQuestion(doc, question, globalQuestionNumber, currentY);
                            break;
                        case 'coding':
                            // ✅ Coding exercises treated like short-answer: show question, no solution code
                            nextY = drawShortAnswerQuestion(doc, question, globalQuestionNumber, currentY);
                            break;
                        default:
                            // ✅ Default to short-answer for any unexpected types
                            nextY = drawShortAnswerQuestion(doc, question, globalQuestionNumber, currentY);
                    }

                    currentY = nextY;
                    globalQuestionNumber++;
                });
            });

            // Final footer
            drawProfessionalFooter(doc, pageNum);

            doc.end();

            stream.on('finish', () => {
                console.log(`✅ Professional PDF generated: ${filepath}`);
                console.log(`   📄 Pages: ${pageNum}`);
                console.log(`   📝 Questions: ${questions.length}`);
                resolve(filepath);
            });

            stream.on('error', reject);

        } catch (error) {
            console.error('❌ PDF generation failed:', error);
            reject(error);
        }
    });
}

// ─── Answer Key Generator ─────────────────────────────────────────────────────

async function generateAnswerKeyPDF(assessment, questions, course, teacherName = 'Teacher') {
    return new Promise((resolve, reject) => {
        try {
            const isAssignment = assessment.type === 'assignment';
            console.log(`\n📋 Generating ${isAssignment ? 'MARKING RUBRIC' : 'ANSWER KEY'} for ${assessment.type}...`);
            if (isAssignment) {
                console.log(`   ✨ Using rubric-style evaluation criteria (not single answers)`);
            }
            
            const pdfsDir = path.join(__dirname, '../pdfs');
            if (!fs.existsSync(pdfsDir)) {
                fs.mkdirSync(pdfsDir, { recursive: true });
            }

            const filename = `answer-key-${assessment._id}-${Date.now()}.pdf`;
            const filepath = path.join(pdfsDir, filename);

            const doc = new PDFDocument({
                size: 'A4',
                margin: 0,
                bufferPages: true
            });

            const stream = fs.createWriteStream(filepath);
            doc.pipe(stream);

            // ─── SIMPLE MINIMAL HEADER ───────────────────────────────────────
            const headerTitle = isAssignment ? 'MARKING RUBRIC' : 'ANSWER KEY';
            
            doc.fontSize(24)
                .font('Helvetica-Bold')
                .fillColor(COLORS.textPrimary)
                .text(headerTitle, MARGIN, 30, {
                    width: CONTENT_W,
                    align: 'center'
                });

            doc.fontSize(14)
                .font('Helvetica')
                .fillColor(COLORS.textSecondary)
                .text(assessment.title, MARGIN, doc.y + 10, {
                    width: CONTENT_W,
                    align: 'center'
                });

            doc.fontSize(11)
                .font('Helvetica')
                .fillColor(COLORS.textSecondary)
                .text(`Course: ${course.courseCode} - ${course.courseTitle}`, MARGIN, doc.y + 5, {
                    width: CONTENT_W,
                    align: 'center'
                });
            
            // Add rubric note for assignments
            if (isAssignment) {
                doc.fontSize(9)
                    .font('Helvetica-Oblique')
                    .fillColor(COLORS.primary)
                    .text('Assessment-based marking guide with evaluation criteria', MARGIN, doc.y + 5, {
                        width: CONTENT_W,
                        align: 'center'
                    });
            }

            // Horizontal line separator
            doc.moveTo(MARGIN, doc.y + 15)
                .lineTo(PAGE_WIDTH - MARGIN, doc.y + 15)
                .strokeColor(COLORS.textPrimary)
                .lineWidth(1)
                .stroke();

            let currentY = doc.y + 25;
            let pageNum = 1;

            // ─── GROUP QUESTIONS BY CLO/MODULE ───────────────────────────────
            // Create a map of CLO descriptions to group questions
            const cloMap = new Map();
            questions.forEach((q, idx) => {
                // ✅ FIX: Properly extract question data from Mongoose documents
                const qData = getQuestionData(q);
                if (!qData) return;
                
                const cloIndex = qData.cloIndex || 0;
                const cloKey = `CLO_${cloIndex}`;
                if (!cloMap.has(cloKey)) {
                    cloMap.set(cloKey, {
                        description: qData.cloDescription || `Learning Outcome ${cloIndex + 1}`,
                        questions: []
                    });
                }
                cloMap.get(cloKey).questions.push({ ...qData, originalIndex: idx + 1 });
            });

            // ─── DRAW QUESTIONS GROUPED BY CLO ──────────────────────────────
            let globalQuestionNumber = 1;

            cloMap.forEach((cloData) => {
                // Check if we need a new page
                if (currentY > PAGE_HEIGHT - 150) {
                    doc.addPage();
                    pageNum++;
                    currentY = MARGIN + 20;
                }

                // Module/CLO Header (shown only once)
                doc.fontSize(12)
                    .font('Helvetica-Bold')
                    .fillColor(COLORS.primary)
                    .text(cloData.description, MARGIN, currentY);

                currentY = doc.y + 5;

                // Underline
                doc.moveTo(MARGIN, currentY)
                    .lineTo(PAGE_WIDTH - MARGIN, currentY)
                    .strokeColor(COLORS.secondary)
                    .lineWidth(1)
                    .stroke();

                currentY += 12;

                // Draw questions in this section
                cloData.questions.forEach((question, idx) => {
                    if (currentY > PAGE_HEIGHT - 80) {
                        doc.addPage();
                        pageNum++;
                        currentY = MARGIN + 20;
                    }

                    // ✅ FIX: Get data from Mongoose document
                    const qData = getQuestionData(question);
                    if (!qData) return;

                    const qText = qData.questionText || '(Question text missing)';
                    
                    if (!qData.questionText) {
                        console.warn(`⚠️ WARNING: Answer key question ${globalQuestionNumber} has no questionText!`);
                    }

                    // ✅ Question number and FULL text (not truncated)
                    doc.fontSize(10)
                        .font('Helvetica-Bold')
                        .fillColor(COLORS.textPrimary)
                        .text(`Q${globalQuestionNumber}. ${qText}`, MARGIN, currentY, {
                            width: CONTENT_W
                        });

                    currentY = doc.y + 10;

                    // ✅ Format answer based on assessment type and question type
                    
                    if (qData.questionType === 'mcq') {
                        // MCQ: Show just the answer letter (same for quiz and assignment)
                        const correctOption = qData.options?.find(o => o.isCorrect);
                        let answerLetter = '';
                        let explanationText = '';
                        
                        if (correctOption && qData.options) {
                            const optIdx = qData.options.indexOf(correctOption);
                            answerLetter = String.fromCharCode(65 + optIdx); // A, B, C, D
                            
                            // Generate explanation if not provided
                            if (qData.explanation && qData.explanation.trim()) {
                                explanationText = qData.explanation;
                            } else {
                                // Generate default explanation from correct option
                                explanationText = `The correct answer is "${correctOption.text}". This option correctly addresses the question requirements.`;
                            }
                        } else if (qData.correctAnswer) {
                            answerLetter = qData.correctAnswer;
                            explanationText = qData.explanation || 'This is the correct answer based on the course material.';
                        }

                        // Answer heading with just the letter
                        currentY += 5;
                        doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.success);
                        doc.text('Correct Answer: ' + answerLetter, MARGIN + 15, currentY);
                        
                        currentY = doc.y + 8;

                        // Explanation (always shown for MCQ)
                        doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.textSecondary);
                        doc.text('Explanation:', MARGIN + 15, currentY);
                        
                        doc.fontSize(9).font('Helvetica').fillColor(COLORS.textPrimary);
                        doc.text(explanationText, MARGIN + 30, doc.y, {
                            width: CONTENT_W - 45,
                            align: 'left'
                        });

                        currentY = doc.y + 8;

                        // Show marks
                        if (qData.marks) {
                            doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary);
                            doc.text('(Marks: ' + qData.marks + ')', MARGIN + 15, currentY);
                            currentY = doc.y + 10;
                        } else {
                            currentY += 2;
                        }

                    } else if (qData.questionType === 'short-answer') {
                        // ✅ ASSIGNMENT: Rubric-style marking guide with key points
                        if (isAssignment) {
                            currentY += 5;
                            doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.primary);
                            doc.text('Marking Rubric:', MARGIN + 15, currentY);
                            currentY = doc.y + 8;

                            // Key marking points
                            const markingPoints = [
                                { label: 'Main Concept', desc: 'Identifies key concept or principle relevant to the question' },
                                { label: 'Correct Terminology', desc: 'Uses appropriate technical terms and definitions accurately' },
                                { label: 'Clear Explanation', desc: 'Provides logical explanation demonstrating understanding' },
                                { label: 'Relevant Example', desc: 'Includes concrete example or application if applicable' }
                            ];

                            const pointMarks = Math.floor(qData.marks / markingPoints.length);
                            const extraMark = qData.marks % markingPoints.length;

                            markingPoints.forEach((point, idx) => {
                                const pointScore = pointMarks + (idx === 0 ? extraMark : 0);
                                
                                // Point label and marks
                                doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.textPrimary);
                                doc.text(`• ${point.label} (${pointScore} mark${pointScore > 1 ? 's' : ''}):`, MARGIN + 25, currentY);
                                
                                // Point description
                                doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary);
                                doc.text(point.desc, MARGIN + 35, doc.y + 3, {
                                    width: CONTENT_W - 50
                                });
                                
                                currentY = doc.y + 6;
                            });

                            // Show expected answer if available (but skip single-letter MCQ answers like "A", "B", "C", "D")
                            const isSingleLetterAnswer = qData.correctAnswer && 
                                qData.correctAnswer.trim().length === 1 && 
                                /^[A-D]$/i.test(qData.correctAnswer.trim());
                            
                            if (qData.correctAnswer && qData.correctAnswer.trim() && !isSingleLetterAnswer) {
                                currentY += 3;
                                doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.textSecondary);
                                doc.text('Expected Response:', MARGIN + 25, currentY);
                                
                                doc.fontSize(8).font('Helvetica-Oblique').fillColor(COLORS.textSecondary);
                                doc.text(qData.correctAnswer, MARGIN + 35, doc.y + 2, {
                                    width: CONTENT_W - 50
                                });
                                currentY = doc.y + 5;
                            }

                            // Total marks at the end
                            doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.success);
                            doc.text(`Total: ${qData.marks} marks`, MARGIN + 25, currentY);
                            currentY = doc.y + 8;

                        } else {
                            // QUIZ: Show simple answer
                            const answerText = qData.correctAnswer || '(Expected response provided by teacher)';

                            currentY += 5;
                            doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.success);
                            doc.text('Answer:', MARGIN + 15, currentY);
                            
                            doc.fontSize(9).font('Helvetica').fillColor(COLORS.textPrimary);
                            doc.text(answerText, MARGIN + 30, doc.y);
                            
                            currentY = doc.y + 5;

                            // Show marks
                            if (qData.marks) {
                                doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary);
                                doc.text('Marks: ' + qData.marks, MARGIN + 15);
                                currentY = doc.y + 5;
                            } else {
                                currentY = doc.y + 3;
                            }
                        }

                    } else if (qData.questionType === 'coding') {
                        // ✅ ASSIGNMENT: Rubric-style evaluation criteria
                        if (isAssignment) {
                            currentY += 5;
                            doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.primary);
                            doc.text('Evaluation Criteria:', MARGIN + 15, currentY);
                            currentY = doc.y + 8;

                            // Evaluation criteria with weighted marks
                            const criteria = [
                                { label: 'Algorithm/Approach', weight: 0.30, desc: 'Correct algorithm or problem-solving approach' },
                                { label: 'Code Correctness', weight: 0.30, desc: 'Code produces correct output and handles edge cases' },
                                { label: 'Logic & Efficiency', weight: 0.25, desc: 'Logical flow and reasonable time/space complexity' },
                                { label: 'Code Quality', weight: 0.15, desc: 'Readable code with proper naming and structure' }
                            ];

                            criteria.forEach((criterion) => {
                                const criterionMarks = Math.round(qData.marks * criterion.weight);
                                
                                // Criterion label and marks
                                doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.textPrimary);
                                doc.text(`• ${criterion.label} (${criterionMarks} mark${criterionMarks > 1 ? 's' : ''}):`, MARGIN + 25, currentY);
                                
                                // Criterion description
                                doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary);
                                doc.text(criterion.desc, MARGIN + 35, doc.y + 3, {
                                    width: CONTENT_W - 50
                                });
                                
                                currentY = doc.y + 6;
                            });

                            // Show expected solution if available (but skip single-letter MCQ answers like "A", "B", "C", "D")
                            const isSingleLetterAnswer = qData.correctAnswer && 
                                qData.correctAnswer.trim().length === 1 && 
                                /^[A-D]$/i.test(qData.correctAnswer.trim());
                            
                            if (qData.correctAnswer && qData.correctAnswer.trim() && !isSingleLetterAnswer) {
                                currentY += 3;
                                doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.textSecondary);
                                doc.text('Expected Solution:', MARGIN + 25, currentY);
                                
                                doc.fontSize(7).font('Courier').fillColor(COLORS.textSecondary);
                                doc.text(qData.correctAnswer, MARGIN + 35, doc.y + 2, {
                                    width: CONTENT_W - 50
                                });
                                currentY = doc.y + 5;
                            } else if (!qData.correctAnswer || qData.correctAnswer.trim().length <= 1) {
                                currentY += 3;
                                doc.fontSize(8).font('Helvetica-Oblique').fillColor(COLORS.textSecondary);
                                doc.text('Expected Output: Verify code produces correct results for all test cases', MARGIN + 25, currentY);
                                currentY = doc.y + 5;
                            }

                            // Total marks at the end
                            doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.success);
                            doc.text(`Total: ${qData.marks} marks`, MARGIN + 25, currentY);
                            currentY = doc.y + 8;

                        } else {
                            // QUIZ: Show simple answer/solution
                            const answerText = qData.correctAnswer || '(Expected solution provided by teacher)';

                            currentY += 5;
                            doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.success);
                            doc.text('Answer:', MARGIN + 15, currentY);
                            
                            doc.fontSize(8).font('Courier').fillColor(COLORS.textPrimary);
                            doc.text(answerText, MARGIN + 30, doc.y, {
                                width: CONTENT_W - 45
                            });
                            
                            currentY = doc.y + 5;

                            // Show marks
                            if (qData.marks) {
                                doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary);
                                doc.text('Marks: ' + qData.marks, MARGIN + 15);
                                currentY = doc.y + 5;
                            } else {
                                currentY = doc.y + 3;
                            }
                        }

                    } else {
                        // Fallback for unknown types
                        const answerText = qData.correctAnswer || 'See rubric';
                        
                        currentY += 5;
                        doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.success);
                        doc.text('Answer:', MARGIN + 15, currentY);
                        
                        doc.fontSize(9).font('Helvetica').fillColor(COLORS.textPrimary);
                        doc.text(answerText, MARGIN + 30, doc.y);
                        
                        currentY = doc.y + 5;

                        if (qData.marks) {
                            doc.fontSize(8).font('Helvetica').fillColor(COLORS.textSecondary);
                            doc.text('Marks: ' + qData.marks, MARGIN + 15);
                            currentY = doc.y + 5;
                        }
                    }

                    // Separator line
                    doc.moveTo(MARGIN, currentY)
                        .lineTo(PAGE_WIDTH - MARGIN, currentY)
                        .strokeColor(COLORS.borderLight)
                        .lineWidth(0.5)
                        .stroke();

                    currentY += 10;
                    globalQuestionNumber++;
                });

                currentY += 8;
            });

            // ─── END OF CONTENT - Add final information ──────────────────────
            // Ensure we have space for the footer
            if (currentY > PAGE_HEIGHT - 100) {
                doc.addPage();
                currentY = MARGIN + 20;
            }

            // Add spacer
            doc.moveDown(3);
            currentY = doc.y;

            // Separator line
            doc.moveTo(MARGIN, currentY)
                .lineTo(PAGE_WIDTH - MARGIN, currentY)
                .strokeColor(COLORS.borderMedium)
                .lineWidth(0.5)
                .stroke();

            // Generated info at the end - centered
            const now = new Date();
            const dateStr = formatDate(now);
            const timeStr = formatTime(now);

            doc.moveDown(2);

            doc.fontSize(10)
                .font('Helvetica')
                .fillColor(COLORS.textPrimary)
                .text(`Generated by InteliMark - ${dateStr}`, MARGIN, doc.y, {
                    width: CONTENT_W,
                    align: 'center'
                });

            doc.fontSize(9)
                .font('Helvetica')
                .fillColor(COLORS.textSecondary)
                .text(`By: ${teacherName}`, MARGIN, doc.y + 5, {
                    width: CONTENT_W,
                    align: 'center'
                });

            doc.end();

            stream.on('finish', () => {
                const docType = isAssignment ? 'marking rubric' : 'answer key';
                console.log(`✅ Professional ${docType} generated: ${filepath}`);
                if (isAssignment) {
                    console.log(`   📊 Includes rubric-style evaluation criteria for grading`);
                }
                resolve(filepath);
            });

            stream.on('error', reject);

        } catch (error) {
            console.error('❌ Answer key generation failed:', error);
            reject(error);
        }
    });
}

module.exports = {
    generateAssessmentPDF,
    generateAnswerKeyPDF
};
