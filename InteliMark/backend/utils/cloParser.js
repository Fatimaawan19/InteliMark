// // cloParser.js - FIXED VERSION
// Utility for extracting and creating CLOs from syllabus text

const CLO = require("../models/CLO");
const BloomTaxonomy = require("../models/BloomTaxonomy");

// Helper: Get Bloom level details
function getBloomLevelDetails(level) {
  const bloomDetails = {
    'Remembering': {
      levelNumber: 1,
      complexity: 'Lower Order Thinking Skills (LOTS)',
      description: 'Recall or recognize information',
      keywords: ['define', 'list', 'name', 'recall', 'recognize', 'remember', 'retrieve', 'state'],
      questionStarters: ['What is...', 'Who...', 'When...', 'Where...', 'Which...', 'How many...']
    },
    'Understanding': {
      levelNumber: 2,
      complexity: 'Lower Order Thinking Skills (LOTS)',
      description: 'Explain ideas or concepts',
      keywords: ['describe', 'explain', 'identify', 'locate', 'recognize', 'report', 'select', 'translate'],
      questionStarters: ['What is the main idea...', 'Can you explain...', 'What does it mean...', 'Describe...']
    },
    'Applying': {
      levelNumber: 3,
      complexity: 'Lower Order Thinking Skills (LOTS)',
      description: 'Use information in new situations',
      keywords: ['apply', 'demonstrate', 'employ', 'illustrate', 'interpret', 'operate', 'practice', 'schedule', 'use'],
      questionStarters: ['How would you...', 'What would happen if...', 'Can you use...', 'How can you apply...']
    },
    'Analyzing': {
      levelNumber: 4,
      complexity: 'Higher Order Thinking Skills (HOTS)',
      description: 'Break down information into parts',
      keywords: ['analyze', 'categorize', 'compare', 'contrast', 'debate', 'diagram', 'differentiate', 'discriminate', 'distinguish', 'examine', 'experiment', 'question', 'test'],
      questionStarters: ['What are the parts...', 'How does it compare...', 'What is the relationship...', 'What is the theme...']
    },
    'Evaluating': {
      levelNumber: 5,
      complexity: 'Higher Order Thinking Skills (HOTS)',
      description: 'Make judgments based on criteria',
      keywords: ['appraise', 'argue', 'assess', 'critique', 'defend', 'judge', 'justify', 'predict', 'prioritize', 'prove', 'rank', 'rate', 'recommend', 'select'],
      questionStarters: ['What is your opinion...', 'Do you agree...', 'What is the best...', 'How would you decide...']
    },
    'Creating': {
      levelNumber: 6,
      complexity: 'Higher Order Thinking Skills (HOTS)',
      description: 'Put elements together to form a new whole',
      keywords: ['arrange', 'assemble', 'collect', 'compose', 'construct', 'create', 'design', 'develop', 'formulate', 'manage', 'organize', 'plan', 'prepare', 'produce', 'propose', 'set up'],
      questionStarters: ['How would you design...', 'Can you create...', 'What would you invent...', 'How can you improve...']
    },
  };
  return bloomDetails[level];
}

// Helper: Capitalize Bloom level
function capitalizeBloomLevel(level) {
  if (!level) return '';
  const map = {
    remembering: 'Remembering',
    understanding: 'Understanding',
    applying: 'Applying',
    analyzing: 'Analyzing',
    evaluating: 'Evaluating',
    creating: 'Creating',
  };
  const normalized = level.trim().toLowerCase();
  return map[normalized] || level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();
}

// ✅ FIX: Ensure universal Bloom levels exist in database
async function ensureBloomLevelsExist() {
  console.log('📚 Ensuring universal Bloom Taxonomy levels exist...');

  const bloomLevels = [
    'Remembering', 'Understanding', 'Applying',
    'Analyzing', 'Evaluating', 'Creating'
  ];

  for (const levelName of bloomLevels) {
    const details = getBloomLevelDetails(levelName);

    // Check if level already exists
    const existing = await BloomTaxonomy.findOne({ levelName });

    if (!existing) {
      await BloomTaxonomy.create({
        levelName: levelName,
        levelNumber: details.levelNumber,
        complexity: details.complexity,
        description: details.description,
        actionVerbs: details.keywords,
        questionStarters: details.questionStarters,
        keywords: details.keywords,
        isActive: true
      });
      console.log(`✅ Created Bloom level: ${levelName}`);
    } else {
      console.log(`ℹ️ Bloom level already exists: ${levelName}`);
    }
  }
}

// Main function: Parse CLOs from extracted text
async function parseCLOsFromText(text, course) {
  const clos = [];
  console.log('🔍 Starting CLO extraction from text...');
  console.log('📏 Input text length:', text.length);

  // ✅ FIX: Ensure universal Bloom levels exist before creating CLOs
  await ensureBloomLevelsExist();

  // Pre-fetch Bloom Levels into a map for faster/safer lookup
  const blooms = await BloomTaxonomy.find({});
  const bloomMap = new Map();
  blooms.forEach(b => {
    bloomMap.set(b.levelName.toLowerCase(), b);
    bloomMap.set(b.levelName, b); // Case sensitive fallback
  });

  if (!text || text.trim().length < 50) {
    console.warn('⚠️ WARNING: Extracted text is empty or too short! PDF might not have selectable text.');
    console.log('📄 Received text:', text.substring(0, 200));
    return clos;
  }

  // Find the CLO section first
  const cloSectionMatch = text.match(/Course Learning Outcomes[\s\S]{0,5000}/i) ||
    text.match(/CLO[\s-]?1[\s\S]{0,3000}/i) ||
    text.match(/Learning Outcomes[\s\S]{0,3000}/i) ||
    text.match(/Course Outcomes[\s\S]{0,3000}/i) ||
    text.match(/Student Learning Outcomes[\s\S]{0,3000}/i);
  let cloText = text;
  if (cloSectionMatch) {
    cloText = cloSectionMatch[0];
    console.log('📄 Found CLO section, using it for parsing (length:', cloText.length, ')');
    console.log('📄 CLO section preview:', cloText.substring(0, 500));
  } else {
    console.log('📄 No specific CLO section found, searching entire text (length:', cloText.length, ')');
    console.log('📄 Full text preview:', text.substring(0, 1000));
  }
  console.log('📄 Searching in CLO text, length:', cloText.length);

  // Main pattern - updated to handle CLO-CLO- prefix and multiline text
  const cloPattern = /CLO(?:-CLO)?-?(\d+)[:\s]+([\s\S]*?)(?=CLO(?:-CLO)?-?\d|Learning Outcome|$)/gi;

  // Alternative patterns
  const altPatterns = [
    /CLO[\s-]?(\d+)[\s:]*([\s\S]+?)(?:\r?\n\r?\n|$)/gi,
    /(\d+)\.\s*([\s\S]+?)(?:\r?\n\r?\n|$)/gi,
    /Learning Outcome[\s-]?(\d+)[\s:]*([\s\S]+?)(?:\r?\n\r?\n|$)/gi
  ];
  let foundCLOs = new Set();

  // Helper to process a CLO match
  async function processCloMatch(cloNumber, rawDescription, course, clos, foundCLOs) {
    const cloCode = "CLO-" + cloNumber;

    if (foundCLOs.has(cloCode)) return;

    // Extract Bloom level from description
    let bloomLevel = 'Understanding'; // default
    const bloomKeywords = ['Remembering', 'Understanding', 'Applying', 'Analyzing', 'Evaluating', 'Creating'];
    for (const keyword of bloomKeywords) {
      if (rawDescription.toLowerCase().includes(keyword.toLowerCase())) {
        bloomLevel = keyword;
        break;
      }
    }

    let description = rawDescription
      .replace(/\s+/g, ' ')
      .replace(/^[\d\s-:.]+/, '') // Remove leading numbers/hyphens
      .replace(/[\s-:]+$/, '')     // Remove trailing punctuation
      .trim();

    // ✅ FIX: Remove Bloom level text from the end of description (e.g. "Applying 2")
    const bloomRegex = new RegExp(`\\b(${bloomKeywords.join('|')})\\b.*$`, 'i');
    description = description.replace(bloomRegex, '').trim();

    // Also remove trailing numbers if any look like levels (e.g. " 2", " 2,3")
    description = description.replace(/[\s,]+\d+[\s,]*$/, '').trim();
    description = description.replace(/[\s-]+$/, '').trim();

    // DSF-specific cleanup: some DSF syllabi include extra sections (quizzes/books)
    // that get appended into CLO-5. Trim those while leaving other courses unchanged.
    const isDSF =
      String(course?.courseTitle || '').toLowerCase().includes('data science fundamentals') ||
      String(course?.courseName || '').toLowerCase().includes('data science fundamentals') ||
      String(course?.courseCode || '').toUpperCase().startsWith('DS');
    if (isDSF && String(cloNumber) === '5') {
      // Stop at common syllabus section headers accidentally captured
      const stopTokens = [
        'Quizzes',
        'Assignments',
        'Mid Term',
        'Final Term',
        'Textbook',
        'Reference Book',
        'Reference Books',
      ];
      for (const token of stopTokens) {
        const idx = description.toLowerCase().indexOf(token.toLowerCase());
        if (idx > 0) {
          description = description.slice(0, idx).trim();
        }
      }
      // Prefer the first sentence if multiple got concatenated.
      const firstSentence = description.split('.').map(s => s.trim()).filter(Boolean)[0];
      if (firstSentence && firstSentence.length >= 5) {
        description = firstSentence.endsWith('.') ? firstSentence : `${firstSentence}.`;
      }
    }

    if (description.length < 5) {
      console.log(`⚠️ CLO-${cloNumber}: Description too short (${description.length} chars)`);
      return;
    }

    try {
      const bloomLevelDetails = getBloomLevelDetails(bloomLevel);
      if (!bloomLevelDetails) {
        console.warn(`⚠️ CLO-${cloNumber}: Invalid Bloom level: ${bloomLevel}`);
        return;
      }

      const existingCLO = await CLO.findOne({ courseId: course._id, cloNumber: cloCode });
      if (!existingCLO) {
        // ✅ FIX: Reference existing universal Bloom level instead of creating new one
        // Use pre-fetched map for reliability
        const normalizedLevel = capitalizeBloomLevel(bloomLevel);
        const bloomLevelDoc = bloomMap.get(normalizedLevel) || bloomMap.get(normalizedLevel.toLowerCase());

        if (!bloomLevelDoc) {
          console.error(`❌ Bloom level not found: ${bloomLevel} (Normalized: ${normalizedLevel})`);
          console.error(`   Available levels: ${Array.from(bloomMap.keys()).join(', ')}`);
          return;
        }

        // ✅ FIX: Create CLO with reference to universal Bloom level
        const clo = await CLO.create({
          courseId: course._id,
          courseCode: course.courseCode,
          teacherId: course.teacherId, // ✅ Added teacherId
          cloNumber: cloCode,
          unitNumber: '1',
          description,
          bloomLevelId: bloomLevelDoc._id, // ✅ FIXED: Changed from bloomTaxonomyLevel to bloomLevelId
          learningLevel: '1',
          graduateAttribute: '',
          isLabCLO: description.toLowerCase().includes('lab') || parseInt(cloNumber) > 4
        });

        console.log(`✅ CLO-${cloNumber} created with Bloom level: ${bloomLevel} (ID: ${bloomLevelDoc._id})`);
        clos.push(clo);
        foundCLOs.add(cloCode);
      } else {
        console.log(`ℹ️ CLO-${cloNumber} already exists, skipping`);
      }
    } catch (error) {
      console.error(`❌ Error creating CLO-${cloNumber}:`, error.message);
    }
  }

  // Try main pattern first
  let mainPatternMatches = 0;
  let match;
  console.log('🔍 Using new CLO pattern...');
  while ((match = cloPattern.exec(cloText)) !== null) {
    mainPatternMatches++;
    console.log(`🔍 Found CLO match #${mainPatternMatches}:`, match[1], match[2]?.substring(0, 80));
    await processCloMatch(match[1], match[2], course, clos, foundCLOs);
  }
  console.log(`✅ Main pattern found ${mainPatternMatches} CLOs`);

  // If main pattern found nothing, try alternative patterns
  if (mainPatternMatches === 0) {
    console.log('ℹ️ Main pattern found no CLOs, trying alternative patterns...');
    for (let i = 0; i < altPatterns.length; i++) {
      const altPattern = altPatterns[i];
      let altMatches = 0;
      while ((match = altPattern.exec(cloText)) !== null) {
        altMatches++;
        console.log(`🔍 Alt pattern ${i} found CLO: ${match[1]} - ${match[2]?.substring(0, 60)}`);
        await processCloMatch(match[1], match[2], course, clos, foundCLOs);
      }
      if (altMatches > 0) {
        console.log(`✅ Alt pattern ${i} found ${altMatches} CLOs`);
        break;
      }
    }
  }

  console.log(`📊 Total CLOs created: ${clos.length}`);
  return clos;
}

module.exports = {
  parseCLOsFromText,
  getBloomLevelDetails,
  capitalizeBloomLevel,
  ensureBloomLevelsExist // ✅ Export new function
};