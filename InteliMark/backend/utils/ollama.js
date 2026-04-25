const dotenv = require('dotenv');
dotenv.config();

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b'; // ✅ UPGRADED: qwen2.5:7b for better quality (was phi3:mini)
const TIMEOUT_MS = 120000; // 120 seconds (2 minutes) per question
const MAX_RETRIES = 3; // ✅ Try 3 times to get high-quality response
const USE_NATURAL_LANGUAGE = true; // ✅ Use natural language for better performance

// ✅ NEW: Build natural language prompt for better phi3:mini performance
function buildNaturalLanguagePrompt({ clos, courseTitle, questionType, questionCount, difficultyLevel, description = '', assessmentType = 'quiz' }) {
    let prompt = `You are an AI question generator. Generate ONLY valid JSON output.\n\n`;
    prompt += `Course: ${courseTitle}\n`;
    prompt += `Topics: ${clos.map(c => c.description).join(', ')}\n`;
    prompt += `Difficulty: ${difficultyLevel}\n`;
    prompt += `Count: ${questionCount} questions\n\n`;
    
    if (description && assessmentType === 'assignment') {
        prompt += `Assignment Focus: ${description.substring(0, 200)}\n\n`;
    }
    
    prompt += `CRITICAL: Return ONLY valid JSON array. NO explanations, NO markdown, NO code blocks.\n`;
    prompt += `Do NOT wrap in triple backticks or code fence.\n`;
    prompt += `Start with [ and end with ]\n\n`;
    
    prompt += `Return exactly this structure for each question:\n`;
    prompt += `{\n`;
    prompt += `  "questionText": "Clear question here",\n`;
    prompt += `  "questionType": "${questionType}",\n`;
    prompt += `  "options": [{"text": "Option A", "isCorrect": false}, ...],\n`;
    prompt += `  "correctAnswer": "A",\n`;
    prompt += `  "marks": 2\n`;
    prompt += `}\n\n`;
    
    prompt += `Generate ${questionCount} questions:\n`;
    prompt += `[`;
    
    return prompt;
}

/**
 * ✅ NEW: Validate and repair JSON questions from model
 */
function validateAndRepairQuestion(q, questionType) {
    // Fix common typos and issues
    if (!q.questionText) {
        console.warn(`⚠️  Question missing questionText, skipping`);
        return null;
    }
    
    // Ensure questionType is valid
    if (!q.questionType || !['mcq', 'short-answer', 'coding'].includes(q.questionType)) {
        q.questionType = questionType;
    }
    
    // Repair options if they exist
    if (q.options && Array.isArray(q.options)) {
        q.options = q.options.map(opt => {
            const repaired = {};
            
            // Fix "textterm" → "text" typo
            if (opt.textterm && !opt.text) {
                repaired.text = opt.textterm;
            } else {
                repaired.text = opt.text || '';
            }
            
            repaired.isCorrect = opt.isCorrect === true;
            
            return repaired;
        });
    } else if (q.questionType === 'mcq') {
        // Ensure MCQ has options
        q.options = [];
    }
    
    // Ensure correctAnswer exists
    if (!q.correctAnswer) {
        if (q.options && q.options.length > 0) {
            const correctOpt = q.options.find(o => o.isCorrect);
            q.correctAnswer = correctOpt ? String.fromCharCode(65 + q.options.indexOf(correctOpt)) : 'A';
        } else {
            q.correctAnswer = '';
        }
    }
    
    // Ensure marks is a number
    q.marks = parseInt(q.marks) || 2;
    
    return q;
}

/**
 * ✅ NEW: Parse JSON response to extract questions
 */
function parseNaturalLanguageResponse(responseText, questionType, questionCount) {
    try {
        console.log(`      🔍 Parsing response (${responseText.length} chars)...`);
        
        const questions = [];
        
        // ✅ First try: Parse as JSON
        try {
            let jsonText = responseText.trim();
            
            // ✅ IMPROVED: More aggressive markdown code block removal
            console.log(`      🧹 Cleaning markdown blocks...`);
            if (jsonText.includes('```')) {
                // Remove all variants of code fences
                jsonText = jsonText.replace(/```json\s*\n?/gi, '');  // ```json with optional newline
                jsonText = jsonText.replace(/```\s*\n?/gi, '');       // ``` with optional newline
                console.log(`      ✓ Removed code blocks`);
            }
            
            jsonText = jsonText.trim();
            
            // ✅ STRATEGY 1: Try array format [...]
            const openBracketIdx = jsonText.indexOf('[');
            if (openBracketIdx !== -1) {
                console.log(`      🎯 Trying array format...`);
                try {
                    // Find the matching closing bracket by counting brackets
                    let bracketCount = 0;
                    let closeBracketIdx = -1;
                    for (let i = openBracketIdx; i < jsonText.length; i++) {
                        if (jsonText[i] === '[') bracketCount++;
                        if (jsonText[i] === ']') {
                            bracketCount--;
                            if (bracketCount === 0) {
                                closeBracketIdx = i;
                                break;
                            }
                        }
                    }
                    
                    if (closeBracketIdx !== -1) {
                        const jsonArray = jsonText.substring(openBracketIdx, closeBracketIdx + 1);
                        console.log(`      📍 Extracted JSON array: ${jsonArray.length} chars`);
                        
                        const parsed = JSON.parse(jsonArray);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            parsed.slice(0, questionCount).forEach((q, idx) => {
                                const repaired = validateAndRepairQuestion(q, questionType);
                                if (repaired && repaired.questionText) {
                                    questions.push({
                                        questionText: repaired.questionText,
                                        questionType: repaired.questionType || questionType,
                                        options: repaired.options || [],
                                        correctAnswer: repaired.correctAnswer || '',
                                        marks: repaired.marks || 1,
                                        bloomLevel: repaired.bloomLevel || 'Understanding',
                                        explanation: repaired.explanation || ''
                                    });
                                    console.log(`      ✅ Parsed & repaired Q${idx + 1}: "${repaired.questionText.substring(0, 50)}..."`);
                                }
                            });
                        }
                    }
                } catch (arrayErr) {
                    console.log(`      ⚠️  Array format failed: ${arrayErr.message}`);
                }
            }
            
            // ✅ STRATEGY 1B: Try wrapping single object in array [...]
            if (questions.length === 0 && jsonText.startsWith('{')) {
                console.log(`      🎯 Trying single object wrapped in array...`);
                try {
                    // Try to wrap single object in array
                    const wrapped = '[' + jsonText + ']';
                    const parsed = JSON.parse(wrapped);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        parsed.slice(0, questionCount).forEach((q, idx) => {
                            const repaired = validateAndRepairQuestion(q, questionType);
                            if (repaired && repaired.questionText) {
                                questions.push({
                                    questionText: repaired.questionText,
                                    questionType: repaired.questionType || questionType,
                                    options: repaired.options || [],
                                    correctAnswer: repaired.correctAnswer || '',
                                    marks: repaired.marks || 1,
                                    bloomLevel: repaired.bloomLevel || 'Understanding',
                                    explanation: repaired.explanation || ''
                                });
                                console.log(`      ✅ Parsed & repaired Q${idx + 1}: "${repaired.questionText.substring(0, 50)}..."`);
                            }
                        });
                    }
                    console.log(`      ✓ Single object wrapping worked`);
                } catch (wrapErr) {
                    console.log(`      ⚠️  Single object wrap failed: ${wrapErr.message}`);
                }
            }
            
            // ✅ STRATEGY 2: Try non-array JSON objects with proper bracket counting
            if (questions.length === 0) {
                console.log(`      🎯 Trying non-array object format with bracket counting...`);
                try {
                    // Find all complete JSON objects by counting brackets
                    const objects = [];
                    let i = 0;
                    while (i < jsonText.length) {
                        // Find next opening brace
                        while (i < jsonText.length && jsonText[i] !== '{') {
                            i++;
                        }
                        
                        if (i >= jsonText.length) break;
                        
                        const startIdx = i;
                        let braceCount = 0;
                        let endIdx = -1;
                        
                        // Find matching closing brace
                        for (let j = startIdx; j < jsonText.length; j++) {
                            if (jsonText[j] === '{' && (j === startIdx || jsonText[j - 1] !== '\\')) {
                                braceCount++;
                            } else if (jsonText[j] === '}' && jsonText[j - 1] !== '\\') {
                                braceCount--;
                                if (braceCount === 0) {
                                    endIdx = j;
                                    break;
                                }
                            }
                        }
                        
                        if (endIdx !== -1) {
                            const objStr = jsonText.substring(startIdx, endIdx + 1);
                            objects.push(objStr);
                            i = endIdx + 1;
                        } else {
                            i++;
                        }
                    }
                    
                    if (objects.length > 0) {
                        console.log(`      📍 Found ${objects.length} JSON objects via bracket counting`);
                        
                        for (const objStr of objects) {
                            if (questions.length >= questionCount) break;
                            try {
                                const parsed = JSON.parse(objStr);
                                // Skip if it's not an object with questionText (filter out malformed extracts)
                                if (typeof parsed === 'object' && parsed !== null && parsed.questionText) {
                                    const repaired = validateAndRepairQuestion(parsed, questionType);
                                    if (repaired && repaired.questionText) {
                                        questions.push({
                                            questionText: repaired.questionText,
                                            questionType: repaired.questionType || questionType,
                                            options: repaired.options || [],
                                            correctAnswer: repaired.correctAnswer || '',
                                            marks: repaired.marks || 1,
                                            bloomLevel: repaired.bloomLevel || 'Understanding',
                                            explanation: repaired.explanation || ''
                                        });
                                        console.log(`      ✅ Parsed & repaired Q${questions.length}: "${repaired.questionText.substring(0, 50)}..."`);
                                    }
                                }
                            } catch (objErr) {
                                console.log(`      ⚠️  Skipped malformed object: ${objErr.message}`);
                            }
                        }
                    }
                } catch (objFmtErr) {
                    console.log(`      ⚠️  Non-array format failed: ${objFmtErr.message}`);
                }
            }
            
        } catch (jsonErr) {
            console.log(`      ⚠️  JSON parsing failed: ${jsonErr.message}`);
        }
        
        // ✅ Fallback: Parse as natural language if JSON failed
        if (questions.length === 0) {
            console.log(`      📝 Attempting natural language extraction as fallback...`);
            
            // Split by "Question X" pattern
            let questionPattern = /Question\s+(\d+)\s*(?:\([^)]*\))?:\s*\n([\s\S]*?)(?=\n(?:Question\s+\d+|$))/gi;
            let matches = [...responseText.matchAll(questionPattern)];
            
            if (matches.length === 0) {
                questionPattern = /^\s*\d+[\.\)]\s*(.*?)(?=^\s*\d+[\.\)]|$)/gm;
                matches = [...responseText.matchAll(questionPattern)];
            }
            
            for (const match of matches) {
                if (questions.length >= questionCount) break;
                
                const questionContent = match[2] ? match[2].trim() : match[1].trim();
                
                if (!questionContent || questionContent.length < 5) continue;
                
                try {
                    const parsedQ = parseIndividualNLQuestion(questionContent, questionType);
                    if (parsedQ && parsedQ.questionText) {
                        questions.push(parsedQ);
                        console.log(`      ✅ Parsed text Q: "${parsedQ.questionText.substring(0, 50)}..."`);
                    }
                } catch (err) {
                    console.warn(`      ⚠️  Could not parse question: ${err.message}`);
                }
            }
        }
        
        if (questions.length === 0) {
            console.log(`      📄 Response sample:\n${responseText.substring(0, 200)}...`);
            throw new Error(`No valid questions parsed. Response started with: ${responseText.substring(0, 100)}`);
        }
        
        console.log(`      ✅ Successfully parsed ${questions.length}/${questionCount} questions`);
        return questions;
        
    } catch (error) {
        console.error(`      ❌ Parsing failed: ${error.message}`);
        throw error;
    }
}

/**
 * ✅ NEW: Parse individual question from natural language text
 */
function parseIndividualNLQuestion(questionText, questionType) {
    const lines = questionText.split('\n').map(l => l.trim()).filter(l => l);
    
    if (lines.length === 0) {
        throw new Error('Empty question text');
    }
    
    const result = {
        questionText: '',
        questionType: questionType,
        options: [],
        correctAnswer: '',
        marks: 1,
        bloomLevel: 'Understanding',
        explanation: ''
    };
    
    // ✅ IMPROVED: Find question text (all lines before options/answers)
    let optionsStartIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^[A-D]\s*[\)\:]/)) {
            optionsStartIdx = i;
            break;
        }
    }
    
    // If no options found, treat all non-answer lines as question
    if (optionsStartIdx === -1) {
        // Get all lines that aren't answers/expected answers
        const questionLines = lines.filter(l => !l.match(/(?:correct|answer|expected|solution|approach)/i));
        if (questionLines.length > 0) {
            result.questionText = questionLines[0]; // First non-answer line
        } else {
            result.questionText = lines[0]; // Fallback to first line
        }
    } else {
        // Get everything before options as question text
        result.questionText = lines.slice(0, optionsStartIdx).join(' ').trim();
    }
    
    // ✅ IMPROVED: Parse MCQ options with more flexible patterns
    if (questionType === 'mcq') {
        for (let j = 0; j < lines.length; j++) {
            // Match: "A) text", "A: text", "A. text", "A) - text"
            const optMatch = lines[j].match(/^[A-D]\s*[\)\:\.]?\s*[\-]?\s*(.+)$/i);
            if (optMatch) {
                const optionText = optMatch[1].trim();
                result.options.push({
                    text: optionText,
                    isCorrect: false
                });
            }
        }
        
        // ✅ IMPROVED: Find correct answer with flexible patterns
        for (let j = 0; j < lines.length; j++) {
            // Matches: "Correct Answer: A", "Answer: B", "Correct: C", etc.
            const answerMatch = lines[j].match(/(?:correct\s*)?(?:answer|ans)\s*[:=]?\s*(?:is\s+)?([A-D])/i);
            if (answerMatch) {
                const correctLetter = answerMatch[1].toUpperCase();
                const correctIdx = correctLetter.charCodeAt(0) - 65; // A=0, B=1, etc.
                if (correctIdx < result.options.length && correctIdx >= 0) {
                    result.options[correctIdx].isCorrect = true;
                    result.correctAnswer = correctLetter;
                }
                break;
            }
        }
        
        // ✅ IMPROVED: Ensure exactly 4 options for MCQ
        while (result.options.length < 4) {
            result.options.push({
                text: `Option ${String.fromCharCode(65 + result.options.length)}`,
                isCorrect: false
            });
        }
        // Trim to 4 options if more
        result.options = result.options.slice(0, 4);
    } else if (questionType === 'short-answer' || questionType === 'coding') {
        // ✅ IMPROVED: Find expected answer with flexible search
        for (let j = 0; j < lines.length; j++) {
            if (lines[j].match(/(?:expected|solution|answer|approach)/i)) {
                // Get text after this line
                const answerLines = lines.slice(j + 1, Math.min(j + 5, lines.length));
                if (answerLines.length > 0) {
                    result.correctAnswer = answerLines.join(' ').substring(0, 300);
                    break;
                }
            }
        }
        
        if (!result.correctAnswer) {
            // Fallback: take last 2 lines as answer
            if (lines.length > 1) {
                result.correctAnswer = lines.slice(-2).join(' ').substring(0, 300);
            } else {
                result.correctAnswer = 'Sample answer provided by teacher during evaluation';
            }
        }
    }
    
    // ✅ IMPROVED: Better validation
    if (!result.questionText || result.questionText.length < 3) {
        throw new Error(`Question text too short: "${result.questionText}"`);
    }
    
    // Ensure correctAnswer is set
    if (!result.correctAnswer) {
        if (questionType === 'mcq' && result.options.length > 0) {
            // Find first marked as correct, or default to first option
            const correctOpt = result.options.find(o => o.isCorrect);
            result.correctAnswer = correctOpt ? 'A' : 'A';
        } else {
            result.correctAnswer = 'Not specified';
        }
    }
    
    return result;
}

/**
 * ✅ NEW: Generate questions using natural language approach (for assignments)
 */
async function generateQuestionsNaturalLanguage({ clos, courseTitle, questionType = 'mcq', questionCount = 10, difficultyLevel = 'medium', description = '', assessmentType = 'quiz' }) {
    const startTime = Date.now();

    console.log(`🤖 [JSON MODE] Generating ${questionCount} ${questionType} questions for ${courseTitle}`);
    console.log(`📚 CLOs: ${clos.length}, Difficulty: ${difficultyLevel}`);
    if (description) console.log(`📄 Focus: "${description.substring(0, 80)}..."`);
    console.log(`⏱️  Timeout: ${TIMEOUT_MS/1000}s per batch\n`);

    const ollamaOk = await testOllamaConnection();
    if (!ollamaOk) {
        console.error(`❌ Ollama is not running!`);
        throw new Error(`Ollama API unavailable at ${OLLAMA_API_URL}`);
    }

    const prompt = buildNaturalLanguagePrompt({
        clos,
        courseTitle,
        questionType,
        questionCount,
        difficultyLevel,
        description,
        assessmentType
    });

    console.log(`📝 Sending prompt (${prompt.length} chars) to ${OLLAMA_MODEL}...\n`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        let attemptStart;  // ✅ FIX: Declare at loop scope so catch block can access it
        try {
            attemptStart = Date.now();
            console.log(`   🔄 Attempt ${attempt}/${MAX_RETRIES} - Timeout: ${TIMEOUT_MS/1000}s`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

            const response = await fetch(`${OLLAMA_API_URL}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: OLLAMA_MODEL,
                    prompt: prompt,
                    stream: true,      // ✅ USE STREAMING like terminal does
                    keep_alive: '10m',  // ✅ NEW: Keep model in memory for 10 minutes (FAST subsequent calls!)
                    options: {
                        temperature: 0.1,      // Very low for consistent JSON format
                        top_p: 0.9,
                        num_predict: 2000,     // More tokens for full JSON response
                        num_ctx: 2048
                    }
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status}`);
            }

            // ✅ Stream response chunks
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let generatedText = '';
            let chunkCount = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const text = decoder.decode(value);
                const lines = text.split('\n');
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const json = JSON.parse(line);
                            if (json.response) {
                                generatedText += json.response;
                                process.stdout.write('.');
                                chunkCount++;
                            }
                        } catch (e) {
                            // Skip malformed JSON lines
                        }
                    }
                }
            }

            clearTimeout(timeoutId);
            const fetchDuration = ((Date.now() - attemptStart) / 1000).toFixed(1);
            console.log(`   ✅ Response received in ${fetchDuration}s (${chunkCount} chunks)`);
            
            console.log(`   📄 Response: ${generatedText.length} chars\n`);

            // Parse natural language response
            const questions = parseNaturalLanguageResponse(generatedText, questionType, questionCount);
            
            const totalDuration = ((Date.now() - attemptStart) / 1000).toFixed(1);
            console.log(`   ✅ Parsed successfully! Total: ${totalDuration}s\n`);

            // ✅ Inject CLO info and other fields
            const finalQuestions = questions.map((q, idx) => {
                const cloIndex = idx % clos.length;
                const clo = clos[cloIndex];
                
                return {
                    ...q,
                    cloId: clo._id,
                    cloIndex: cloIndex,
                    difficultyLevel: difficultyLevel,
                    bloomLevel: clo?.bloomLevelId?.levelName || 'Understanding',
                    generatedByAI: true,
                    aiPrompt: 'Generated by Ollama (natural language)'
                };
            });

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`🎉 COMPLETE: ${finalQuestions.length}/${questionCount} questions in ${duration}s\n`);
            
            return finalQuestions;

        } catch (error) {
            const qDuration = ((Date.now() - attemptStart) / 1000).toFixed(1);
            console.error(`   ❌ Attempt ${attempt} failed after ${qDuration}s: ${error.message}`);
            
            if (attempt < MAX_RETRIES) {
                console.log(`   🔄 Retrying...\n`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }

            throw new Error(`Could not generate questions after ${MAX_RETRIES} attempts`);
        }
    }
}


const TYPE_MAP = {
    'short': 'short-answer',
    'short-answer': 'short-answer',
    'mcq': 'mcq',
    'coding': 'coding'
};

/**
 * ✅ SEQUENTIAL Generation - Generate questions ONE AT A TIME
 * More reliable for slow models like phi3:mini (60s per question)
 */
async function generateQuestions({ clos, courseTitle, questionType = 'mcq', questionCount = 10, difficultyLevel = 'medium', description = '', assessmentType = 'quiz' }) {
    // ✅ NEW: Use natural language for assignments (they're working great!)
    // Use JSON for quizzes (keep existing flow)
    if (assessmentType === 'assignment' && USE_NATURAL_LANGUAGE) {
        console.log(`\n📋 Using NATURAL LANGUAGE generation for assignment (phi3:mini performs better)\n`);
        return await generateQuestionsNaturalLanguage({
            clos,
            courseTitle,
            questionType,
            questionCount,
            difficultyLevel,
            description,
            assessmentType
        });
    }

    // ✅ Original JSON approach for quizzes
    const normalizedType = TYPE_MAP[questionType] || questionType;
    const startTime = Date.now();

    console.log(`🤖 Generating ${questionCount} questions for ${courseTitle}`);
    console.log(`📋 Question Type: "${questionType}" → "${normalizedType}"`);
    console.log(`📚 CLOs: ${clos.length}, Difficulty: ${difficultyLevel}, Model: ${OLLAMA_MODEL}`);
    if (description) console.log(`📄 Description: "${description.substring(0, 100)}..."`);
    console.log(`⚡ Strategy: SEQUENTIAL (one at a time, more reliable for phi3:mini)`);
    console.log(`⏱️  Timeout: ${TIMEOUT_MS/1000}s per question\n`);

    // ✅ Check if Ollama is available before starting
    const ollamaOk = await testOllamaConnection();
    if (!ollamaOk) {
        console.error(`❌ Ollama is not running! Cannot generate questions.`);
        console.error(`   Start Ollama server at: ${OLLAMA_API_URL}`);
        throw new Error(`Ollama API unavailable at ${OLLAMA_API_URL}`);
    }

    const allQuestions = [];
    const questionsPerCLO = Math.ceil(questionCount / clos.length);

    // Generate questions sequentially across CLOs
    for (let cloIndex = 0; cloIndex < clos.length; cloIndex++) {
        const clo = clos[cloIndex];
        const questionsForThisCLO = Math.min(questionsPerCLO, questionCount - allQuestions.length);

        console.log(`\n📝 CLO ${cloIndex + 1}/${clos.length}: "${clo.description?.substring(0, 60)}..."`);
        console.log(`   📊 Generating ${questionsForThisCLO} questions...`);

        let questionsGeneratedForThisCLO = 0;
        for (let i = 0; i < questionsForThisCLO; i++) {
            const questionNumber = allQuestions.length + 1;
            const qStart = Date.now();
            
            console.log(`   🎯 Question ${questionNumber}/${questionCount} (CLO ${cloIndex + 1}, attempt ${i + 1}/${questionsForThisCLO})`);

            try {
                const question = await generateSingleQuestion({
                    clo,
                    cloIndex,
                    courseTitle,
                    questionType: normalizedType,
                    difficultyLevel,
                    questionNumber,
                    description,
                    assessmentType
                });

                const qDuration = ((Date.now() - qStart) / 1000).toFixed(1);
                allQuestions.push(question);
                questionsGeneratedForThisCLO++;
                console.log(`   ✅ Generated successfully in ${qDuration}s`);
                console.log(`      Generated: ${allQuestions.length}/${questionCount} total, ${questionsGeneratedForThisCLO}/${questionsForThisCLO} for this CLO`);

            } catch (error) {
                const qDuration = ((Date.now() - qStart) / 1000).toFixed(1);
                console.error(`   ❌ Failed after ${qDuration}s: ${error.message}`);
                
                if (error.name === 'AbortError') {
                    console.error(`   ⏱️  Model took >${TIMEOUT_MS/1000}s - timeout exceeded`);
                }
                console.log(`   📊 Current progress: ${allQuestions.length}/${questionCount} questions generated`);
                // Continue to next question even if one fails
            }
        }
        
        if (questionsGeneratedForThisCLO < questionsForThisCLO) {
            console.warn(`   ⚠️  Only generated ${questionsGeneratedForThisCLO}/${questionsForThisCLO} questions for this CLO`);
        } else {
            console.log(`   ✅ Generated all ${questionsGeneratedForThisCLO} questions for this CLO`);
        }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n════════════════════════════════════════════════════════════`);
    console.log(`📊 GENERATION COMPLETE`);
    console.log(`   Generated: ${allQuestions.length}/${questionCount} questions`);
    console.log(`   Duration: ${duration}s`);
    if (allQuestions.length > 0) {
        console.log(`   Average: ${(duration / allQuestions.length).toFixed(1)}s per question`);
    }
    console.log(`════════════════════════════════════════════════════════════`);
    
    if (allQuestions.length === 0) {
        console.error(`❌ FAILED: No questions were generated!`);
        console.error(`   Check Ollama is running: ${OLLAMA_API_URL}`);
        throw new Error('Failed to generate any questions - check Ollama connection');
    } else if (allQuestions.length < questionCount) {
        console.warn(`⚠️  WARNING: Generated ${allQuestions.length}/${questionCount} questions (${Math.round((allQuestions.length/questionCount)*100)}%)`);
        console.warn(`   This may happen if the AI model is having difficulty or timeouts occurred`);
    }

    return allQuestions;
}

/**
 * ✅ Build batch prompt for generating multiple questions at once
 */
function buildBatchPrompt({ clos, courseTitle, questionType, questionCount, difficultyLevel, description = '', assessmentType = 'quiz' }) {
    const typeMap = {
        'mcq': 'multiple-choice with 4 options',
        'short-answer': 'short answer',
        'coding': 'coding problem'
    };

    const questionsPerCLO = Math.ceil(questionCount / clos.length);
    
    let prompt = `⚠️ CRITICAL: Generate ${questionCount} ${typeMap[questionType] || 'MCQ'} questions for "${courseTitle}".\n`;
    prompt += `⚠️ IMPORTANT: ALL questions MUST be of type "${questionType}", NOT mixed types.\n\n`;
    
    if (description && assessmentType === 'assignment') {
        prompt += `Instructions: ${description.substring(0, 150)}\n\n`;
    }
    
    prompt += `Learning Outcomes:\n`;
    clos.forEach((clo, idx) => {
        const numQuestions = Math.min(questionsPerCLO, questionCount - (idx * questionsPerCLO));
        if (numQuestions > 0) {
            prompt += `${idx + 1}. ${clo.description} (${clo.bloomLevelId?.levelName || 'Understanding'}) - ${numQuestions} questions\n`;
        }
    });
    
    prompt += `\nDifficulty: ${difficultyLevel}\n`;
    prompt += `Question Type: ${questionType.toUpperCase()}\n\n`;
    prompt += `⚠️ CRITICAL: ALL ${questionCount} questions MUST be ${questionType.toUpperCase()} ONLY. NO MIXING TYPES.\n\n`;
    prompt += `Return a JSON array of exactly ${questionCount} questions. Each question MUST have this exact format:\n`;
    
    // ✅ Different JSON format based on question type

    switch(questionType) {
        case 'mcq':
            prompt += `For MCQ ONLY (MULTIPLE CHOICE WITH 4 OPTIONS):\n`;
            prompt += `[{"questionText":"The question?","options":[{"text":"Option A","isCorrect":false},{"text":"Option B","isCorrect":true},{"text":"Option C","isCorrect":false},{"text":"Option D","isCorrect":false}],"correctAnswer":"B","marks":1,"cloIndex":0}]\n\n`;
            prompt += `⚠️ MCQ RULES:\n`;
            prompt += `- Exactly 4 options in the array\n`;
            prompt += `- Exactly 1 option with isCorrect:true\n`;
            prompt += `- correctAnswer must be letter (A/B/C/D)\n`;
            prompt += `- This is a MULTIPLE CHOICE question\n`;
            break;
            
        case 'short-answer':
            prompt += `For SHORT-ANSWER ONLY (NO MULTIPLE CHOICE):\n`;
            prompt += `[{"questionText":"What is...?","options":[],"correctAnswer":"The expected 2-3 sentence answer","marks":1,"cloIndex":0}]\n\n`;
            prompt += `⚠️ SHORT-ANSWER RULES:\n`;
            prompt += `- options array MUST BE EMPTY []\n`;
            prompt += `- correctAnswer contains the expected response text\n`;
            prompt += `- This is NOT a multiple choice question\n`;
            prompt += `- Do NOT include A/B/C/D options\n`;
            break;
            
        case 'coding':
            prompt += `For CODING ONLY (NO MULTIPLE CHOICE, ALGORITHM/SOLUTION):\n`;
            prompt += `[{"questionText":"Write a program that...","options":[],"correctAnswer":"Algorithm: 1. Input validation 2. Process 3. Output","marks":3,"cloIndex":0}]\n\n`;
            prompt += `⚠️ CODING RULES:\n`;
            prompt += `- options array MUST BE EMPTY []\n`;
            prompt += `- correctAnswer contains the algorithm/solution approach\n`;
            prompt += `- This is NOT a multiple choice question\n`;
            prompt += `- Do NOT respond with "Which of the following"\n`;
            prompt += `- Do NOT include A/B/C/D options\n`;
            break;
            
        default:
            prompt += `[{"questionText":"...","options":[{"text":"A","isCorrect":false},{"text":"B","isCorrect":true},{"text":"C","isCorrect":false},{"text":"D","isCorrect":false}],"correctAnswer":"B","marks":1,"cloIndex":0}]`;
    }
    
    prompt += `\n⚠️ CRITICAL: Return ONLY valid JSON. Start with [ and end with ].\n`;
    prompt += `⚠️ CRITICAL: Generate ${questionCount} ${questionType.toUpperCase()} questions only. DO NOT mix types.\n`;
    prompt += `Now generate the ${questionCount} ${questionType.toUpperCase()} questions:`;
    
    return prompt;
}

/**
 * ✅ Parse batch response containing multiple questions
 */
function parseBatchResponse(responseText, questionType, clos) {
    try {
        console.log(`   📋 Parsing batch response (${responseText.length} chars)...`);
        
        let jsonText = responseText.trim();
        
        // Remove markdown code blocks
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        
        // Extract JSON array
        const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
            jsonText = arrayMatch[0];
            console.log(`   ✂️  Extracted array: ${jsonText.substring(0, 100)}...`);
        } else {
            console.error(`   ❌ No JSON array found!`);
            console.error(`   📄 Response: ${responseText.substring(0, 300)}`);
            throw new Error('No JSON array found in response');
        }
        
        const parsed = JSON.parse(jsonText);
        
        if (!Array.isArray(parsed)) {
            throw new Error('Response is not an array');
        }
        
        console.log(`   ✅ Parsed ${parsed.length} questions`);
        
        // Clean and map questions
        const questions = parsed.map((q, idx) => {
            // Determine CLO index
            const cloIndex = q.cloIndex !== undefined ? q.cloIndex : idx % clos.length;
            const clo = clos[cloIndex] || clos[0];
            
            // Clean options
            let cleanOptions = [];
            if (Array.isArray(q.options)) {
                cleanOptions = q.options.map((opt, optIdx) => ({
                    text: opt.text || opt.option || `Option ${String.fromCharCode(65 + optIdx)}`,
                    isCorrect: opt.isCorrect !== undefined ? opt.isCorrect : false
                })).filter(opt => opt.text);
            }
            
            // ✅ Enforce question type rules
            let finalOptions = cleanOptions;
            let finalCorrectAnswer = q.correctAnswer || '';
            
            // If batch defaulted to MCQ but user requested coding/short-answer, enforce it
            const resolvedType = TYPE_MAP[q.questionType] || questionType;
            
            if (resolvedType === 'coding' || resolvedType === 'short-answer') {
                // ⚠️ DETECT if AI generated wrong type (MCQ format for non-MCQ)
                if (cleanOptions.length > 0 && (q.questionText.toLowerCase().includes('which of the following') || 
                    q.questionText.toLowerCase().includes('choose the') ||
                    q.questionText.toLowerCase().includes('select the'))) {
                    console.warn(`   ⚠️  [Q${idx + 1}] DETECTED: AI generated MCQ format for ${resolvedType}!`);
                    console.warn(`      ❌ Question text contains MCQ keywords: "${q.questionText.substring(0, 60)}..."`);
                    console.warn(`      ❌ Found ${cleanOptions.length} options but ${resolvedType} should have none`);
                }
                
                // ✅ Non-MCQ: Clear options, keep solution in correctAnswer
                finalOptions = [];
                console.log(`   ℹ️  [Q${idx + 1}] Enforced ${resolvedType}: cleared options`);
            } else if (resolvedType === 'mcq') {
                // ✅ MCQ: Ensure 4 options with 1 correct
                if (finalOptions.length !== 4 || !finalOptions.some(o => o.isCorrect)) {
                    console.warn(`   ⚠️  [Q${idx + 1}] MCQ validation: ${finalOptions.length} options, validating...`);
                    // Will be validated later in assessmentController
                }
            }
            
            return {
                questionText: q.questionText || q.question || '',
                questionType: resolvedType,
                options: finalOptions,
                correctAnswer: finalCorrectAnswer,
                marks: q.marks || 1,
                bloomLevel: q.bloomLevel || clo.bloomLevelId?.levelName || 'Understanding',
                explanation: q.explanation || '',
                cloId: clo._id,
                cloIndex: cloIndex,
                difficultyLevel: q.difficultyLevel || 'medium',
                generatedByAI: true,
                aiPrompt: 'Generated by Ollama (batch)'
            };
        }).filter(q => q.questionText); // Remove empty questions
        
        console.log(`   ✅ Cleaned ${questions.length} valid questions`);
        
        return questions;
        
    } catch (error) {
        console.error(`\n   ❌❌❌ PARSE ERROR ❌❌❌`);
        console.error(`   📋 Error:`, error.message);
        console.error(`   📄 Response (first 500 chars):`);
        console.error(`   ${responseText.substring(0, 500)}`);
        throw new Error('Failed to parse batch response: ' + error.message);
    }
}

/**
 * ✅ Generate a SINGLE question with timeout protection
 * Used by sequential generation (one question at a time)
 */
async function generateSingleQuestion({ clo, cloIndex, courseTitle, questionType, difficultyLevel, questionNumber, description = '', assessmentType = 'quiz' }) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const attemptStart = Date.now();
            console.log(`      🔄 Attempt ${attempt}/${MAX_RETRIES} - Timeout: ${TIMEOUT_MS/1000}s`);
            
            const prompt = buildSingleQuestionPrompt({
                courseTitle,
                cloDescription: clo.description,
                bloomLevel: clo.bloomLevelId?.levelName || 'Understanding',
                questionType,
                difficultyLevel,
                questionNumber,
                description,
                assessmentType
            });

            console.log(`      📝 Prompt: ${prompt.length} chars`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.error(`      ⚠️ ABORTING: ${TIMEOUT_MS/1000}s timeout reached!`);
                controller.abort();
            }, TIMEOUT_MS);

            console.log(`      📡 Sending to Ollama (${OLLAMA_MODEL})...`);
            const fetchStart = Date.now();
            
            const response = await fetch(`${OLLAMA_API_URL}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: OLLAMA_MODEL,
                    prompt: prompt,
                    stream: true,          // ✅ USE STREAMING like terminal does
                    keep_alive: '10m',     // ✅ SPEED BOOST: Keep model loaded for 10 min (no reload time!)
                    options: {
                        temperature: 0.1,      // ✅ LOWER for more consistent, accurate output
                        top_p: 0.85,           // ✅ LOWER to reduce randomness
                        top_k: 20,             // ✅ NEW: Limit vocabulary for more focused output
                        num_predict: 600,      // ✅ INCREASED to 600 for complete 4-option responses
                        num_ctx: 2048,         // ✅ INCREASED for better context understanding
                        repeat_penalty: 1.2    // ✅ NEW: Reduce repetitive output
                    }
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status}`);
            }

            // ✅ Stream response chunks
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let generatedText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const text = decoder.decode(value);
                const lines = text.split('\n');
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const json = JSON.parse(line);
                            if (json.response) {
                                generatedText += json.response;
                                process.stdout.write('.');
                            }
                        } catch (e) {
                            // Skip malformed JSON lines
                        }
                    }
                }
            }

            clearTimeout(timeoutId);
            const fetchDuration = ((Date.now() - fetchStart) / 1000).toFixed(1);
            console.log(`      ✅ Response received in ${fetchDuration}s`);
            
            console.log(`      📄 Response: ${generatedText.length} chars`);
            console.log(`      🔧 Parsing JSON...`);

            // ✅ Parse and inject known fields
            const parsedQuestion = parseSingleQuestion(generatedText, questionType);
            
            const totalDuration = ((Date.now() - attemptStart) / 1000).toFixed(1);
            console.log(`      ✅ Parsed successfully! Total: ${totalDuration}s`);

            return {
                ...parsedQuestion,
                cloId: clo._id,              // ✅ Inject cloId - don't trust AI
                cloIndex: cloIndex,          // ✅ Inject cloIndex for grouping in PDF
                bloomLevel: clo.bloomLevelId?.levelName || 'Understanding', // ✅ Inject bloomLevel from CLO
                difficultyLevel: difficultyLevel,
                questionType: questionType,
                generatedByAI: true,
                aiPrompt: 'Generated by Ollama (sequential)'
            };

        } catch (error) {
            if (error.name === 'AbortError') {
                console.error(`      ⏱️ TIMEOUT after ${TIMEOUT_MS / 1000}s`);
            } else {
                console.error(`      ❌ Attempt ${attempt} error:`, error.message);
            }

            if (attempt < MAX_RETRIES) {
                console.log(`      🔄 Retrying (${attempt + 1}/${MAX_RETRIES})...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }

            // ✅ NEW: On final attempt failure, log more details
            console.error(`      ⚠️ SKIPPING this question after ${MAX_RETRIES} attempts`);
            throw error;
        }
    }
}

/**
 * Build prompt for SINGLE question generation with type-specific JSON format
 * SIMPLIFIED to help phi3:mini understand better
 */
function buildSingleQuestionPrompt({ courseTitle, cloDescription, bloomLevel, questionType, difficultyLevel, questionNumber, description = '', assessmentType = 'quiz' }) {
    // ✅ IMPROVED: More explicit prompt with quality requirements
    let prompt = `You are an expert educational question generator. Create ONE high-quality ${questionType} question.\n\n`;
    prompt += `Course: ${courseTitle}\n`;
    prompt += `Topic: ${cloDescription}\n`;
    prompt += `Bloom's Level: ${bloomLevel}\n`;
    prompt += `Difficulty: ${difficultyLevel}\n\n`;
    
    if (description && assessmentType === 'assignment') {
        prompt += `Focus: ${description.substring(0, 100)}\n\n`;
    }
    
    prompt += `⚠️ QUALITY REQUIREMENTS:\n`;
    prompt += `- Clear, professional grammar and spelling\n`;
    prompt += `- NO placeholder text like "Option A" or "Option B"\n`;
    prompt += `- Each option must be complete and meaningful\n`;
    prompt += `- Options should be distinct and plausible\n\n`;
    
    prompt += `RETURN ONLY THIS JSON FORMAT (no extra text, no markdown, no explanation):\n\n`;
    
    // SPECIFIC JSON format for EACH question type
    if (questionType === 'mcq') {
        prompt += `⚠️ MANDATORY: Multiple Choice Question MUST have EXACTLY 4 OPTIONS - COUNT THEM!\n\n`;
        prompt += `CORRECT FORMAT (4 OPTIONS):\n`;
        prompt += `{"questionType":"mcq","questionText":"Clear question with proper grammar?","options":[{"text":"First complete answer choice","isCorrect":false},{"text":"Second complete answer choice","isCorrect":true},{"text":"Third complete answer choice","isCorrect":false},{"text":"Fourth complete answer choice","isCorrect":false}],"correctAnswer":"B","marks":1}\n\n`;
        
        prompt += `COUNT THE OPTIONS: 1, 2, 3, 4 - You MUST generate ALL FOUR!\n\n`;
        
        prompt += `⚠️ CRITICAL RULES FOR MCQ - MUST FOLLOW EXACTLY:\n`;
        prompt += `1. MUST include "questionType":"mcq"\n`;
        prompt += `2. 🔴 MANDATORY: EXACTLY 4 COMPLETE OPTIONS - NOT 2, NOT 3, MUST BE 4!\n`;
        prompt += `3. 🔴 GENERATE ALL 4 OPTIONS IN THE "options" ARRAY - COUNT: Option 1, Option 2, Option 3, Option 4\n`;
        prompt += `4. Each option text must be at least 10 characters and meaningful (NOT "Option A", "Option B")\n`;
        prompt += `5. MUST mark EXACTLY ONE option with isCorrect:true\n`;
        prompt += `6. correctAnswer MUST be letter (A/B/C/D) matching the correct option\n`;
        prompt += `7. All other 3 options MUST have isCorrect:false\n`;
        prompt += `8. Use proper spelling and grammar\n`;
        prompt += `9. Make all 4 options distinct and plausible\n`;
        prompt += `10. 🔴 REPEAT: You MUST generate 4 OPTIONS, not fewer!\n\n`;
        
        prompt += `VERIFY BEFORE SUBMITTING: Count your options array - does it have 4 items? YES/NO\n`;
        prompt += `If NO, add more options until you have exactly 4!\n\n`;
    } else if (questionType === 'short-answer') {
        prompt += `{"questionType":"short-answer","questionText":"The question text here?","options":[],"correctAnswer":"The expected short answer (1-3 sentences)","marks":1}\n`;
        prompt += `\n⚠️ CRITICAL RULES FOR SHORT-ANSWER - MUST FOLLOW EXACTLY:\n`;
        prompt += `1. MUST include "questionType":"short-answer"\n`;
        prompt += `2. options MUST BE AN EMPTY ARRAY [] - NO CHOICES\n`;
        prompt += `3. correctAnswer MUST CONTAIN the expected response text\n`;
        prompt += `4. THIS IS NOT A MULTIPLE CHOICE QUESTION\n`;
        prompt += `5. DO NOT generate options array with answer choices\n`;
        prompt += `6. DO NOT include A/B/C/D format\n\n`;
    } else if (questionType === 'coding') {
        prompt += `{"questionType":"coding","questionText":"The coding problem statement here?","options":[],"correctAnswer":"Algorithm: 1. Step one 2. Step two 3. Step three","marks":2}\n`;
        prompt += `\n⚠️ CRITICAL RULES FOR CODING - MUST FOLLOW EXACTLY:\n`;
        prompt += `1. MUST include "questionType":"coding"\n`;
        prompt += `2. options MUST BE AN EMPTY ARRAY [] - NO CHOICES\n`;
        prompt += `3. questionText MUST describe the programming problem\n`;
        prompt += `4. correctAnswer MUST CONTAIN pseudo code or algorithm approach\n`;
        prompt += `5. THIS IS NOT A MULTIPLE CHOICE QUESTION\n`;
        prompt += `6. DO NOT generate options like multiple choice\n`;
        prompt += `7. DO NOT include "Which of the following" or answer choices\n\n`;
    } else {
        prompt += `{"questionType":"${questionType}","questionText":"The question text?","options":[],"correctAnswer":"The answer","marks":1}\n\n`;
    }
    
    prompt += `⚠️ REMEMBER: Generate a ${questionType.toUpperCase()} question, ONLY ${questionType.toUpperCase()} format, NO other types\n\n`;
    prompt += `NOW GENERATE THE ${questionType.toUpperCase()} QUESTION IN JSON FORMAT ABOVE:`;
    
    return prompt;
}

/**
 * ✅ NEW: Validate and fix MCQ format to ensure exactly 4 options with 1 correct answer
 * ❌ STRICT MODE: Reject questions with incomplete options instead of padding
 */
function validateAndFixMCQ(question) {
    console.log(`      🔍 MCQ validation: ${question.options?.length || 0} options, ${question.options?.filter(o => o.isCorrect).length || 0} correct`);
    
    if (!question.options || !Array.isArray(question.options)) {
        console.error(`      ❌ REJECTED: No options array found`);
        throw new Error('MCQ must have options array');
    }
    
    // ✅ SMART VALIDATION: Try to complete if 2-3 options, reject if < 2
    if (question.options.length < 2) {
        console.error(`      ❌ REJECTED: Only ${question.options.length} option(s) generated (need at least 2)`);
        throw new Error(`Incomplete MCQ: only ${question.options.length}/4 options generated`);
    } else if (question.options.length < 4) {
        console.warn(`      ⚠️  Only ${question.options.length} options generated, auto-generating ${4 - question.options.length} distractor(s)...`);
        
        // Auto-generate plausible distractor options
        const existingTexts = question.options.map(o => o.text.toLowerCase());
        const distractorTemplates = [
            'None of the above',
            'All of the above',
            'Both A and B',
            'Neither of these options'
        ];
        
        let distractorIndex = 0;
        while (question.options.length < 4) {
            let newText;
            if (distractorIndex < distractorTemplates.length) {
                newText = distractorTemplates[distractorIndex];
            } else {
                newText = `Alternative option ${question.options.length + 1}`;
            }
            
            // Only add if not duplicate
            if (!existingTexts.includes(newText.toLowerCase())) {
                question.options.push({
                    text: newText,
                    isCorrect: false
                });
                console.log(`         ➕ Added distractor: "${newText}"`);
            }
            distractorIndex++;
        }
        
        console.log(`      ✅ Completed to 4 options with ${4 - question.options.length + distractorIndex} auto-generated distractor(s)`);
    } else if (question.options.length > 4) {
        console.warn(`      ⚠️  ${question.options.length} options found, trimming to 4...`);
        question.options = question.options.slice(0, 4);
    }
    
    // ✅ QUALITY CHECK: Reject placeholder or generic options (but allow auto-generated distractors)
    const genericPlaceholders = ['Option A', 'Option B', 'Option C', 'Option D'];
    const allowedDistractors = ['None of the above', 'All of the above', 'Both A and B', 'Neither of these options'];
    
    const hasPlaceholders = question.options.some(opt => {
        if (!opt.text || opt.text.trim().length < 5) return true;
        
        const trimmedText = opt.text.trim();
        
        // Allow our auto-generated distractors
        if (allowedDistractors.includes(trimmedText)) return false;
        
        // Reject generic placeholders
        if (genericPlaceholders.includes(trimmedText)) return true;
        if (/^Option [A-D]$/i.test(trimmedText)) return true;
        
        return false;
    });
    
    if (hasPlaceholders) {
        console.error(`      ❌ REJECTED: Found placeholder or generic options:`);
        question.options.forEach((opt, i) => {
            console.error(`         ${String.fromCharCode(65 + i)}: "${opt.text}"`);
        });
        throw new Error('MCQ has placeholder options - AI did not generate complete content');
    }
    
    // ✅ Ensure exactly 1 correct answer
    const correctCount = question.options.filter(o => o.isCorrect).length;
    if (correctCount === 0) {
        console.warn(`      ⚠️  No correct answer found, marking first option as correct...`);
        question.options[0].isCorrect = true;
        question.correctAnswer = 'A';
    } else if (correctCount > 1) {
        console.warn(`      ⚠️  Multiple correct answers found (${correctCount}), keeping only first...`);
        let foundFirst = false;
        question.options.forEach((o, i) => {
            if (o.isCorrect && !foundFirst) {
                foundFirst = true;
                question.correctAnswer = String.fromCharCode(65 + i); // A, B, C, D
            } else {
                o.isCorrect = false;
            }
        });
    } else if (correctCount === 1) {
        // Find which option is correct and set correctAnswer accordingly
        const correctIdx = question.options.findIndex(o => o.isCorrect);
        question.correctAnswer = String.fromCharCode(65 + correctIdx); // A, B, C, D
        console.log(`      ✅ MCQ valid: 4 options, 1 correct answer (${question.correctAnswer})`);
    }
    
    return question;
}

/**
 * ✅ Parse a single question response - SIMPLIFIED and more forgiving
 */
function parseSingleQuestion(responseText, questionType) {
    try {
        console.log(`      🔧 Parsing response (${responseText.length} chars)...`);
        
        let jsonText = responseText.trim();

        // Remove markdown code blocks
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        // Try to extract JSON object more flexibly
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON object found in response');
        }
        
        jsonText = jsonMatch[0];
        console.log(`      ✂️  Extracted JSON (${jsonText.length} chars)`);

        let parsed;
        try {
            // Try standard JSON parse first
            parsed = JSON.parse(jsonText);
            
            // ✅ NEW: Validate and fix MCQ format
            if (questionType === 'mcq') {
                console.log(`      ✅ Validating MCQ format...`);
                parsed = validateAndFixMCQ(parsed);
            }
        } catch (jsonError) {
            console.warn(`      ⚠️  JSON parse failed: ${jsonError.message}`);
            console.warn(`      🔨 Attempting text extraction...`);
            
            // Manual extraction as fallback
            parsed = {};
            
            // Extract questionText: find content between "questionText":"..."
            const qtMatch = jsonText.match(/"questionText"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
            if (qtMatch) {
                parsed.questionText = qtMatch[1];
                console.log(`      ✅ Extracted questionText`);
            } else {
                console.error(`      ❌ Could not extract questionText`);
                throw new Error('Failed to extract questionText from response');
            }
            
            // Extract correctAnswer
            const caMatch = jsonText.match(/"correctAnswer"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
            parsed.correctAnswer = caMatch ? caMatch[1] : 'Answer not provided';
            
            // Extract marks
            const marksMatch = jsonText.match(/"marks"\s*:\s*(\d+)/);
            parsed.marks = marksMatch ? parseInt(marksMatch[1]) : 1;
            
            // Extract options array
            const optionsMatch = jsonText.match(/"options"\s*:\s*\[\s*([\s\S]*?)\s*\]/);
            if (optionsMatch && optionsMatch[1].trim()) {
                parsed.options = [];
                // Try to parse options
                const optText = optionsMatch[1];
                
                // Find all option objects
                const optionMatches = optText.match(/\{[^}]*"text"[^}]*"isCorrect"[^}]*\}/g) || [];
                if (optionMatches.length > 0) {
                    optionMatches.forEach(optStr => {
                        const textM = optStr.match(/"text"\s*:\s*"([^"]*)"/);
                        const correctM = optStr.match(/"isCorrect"\s*:\s*(true|false)/);
                        if (textM) {
                            parsed.options.push({
                                text: textM[1],
                                isCorrect: correctM ? correctM[1] === 'true' : false
                            });
                        }
                    });
                    console.log(`      ✅ Extracted ${parsed.options.length} options`);
                } else {
                    parsed.options = [];
                }
            } else {
                parsed.options = [];
            }
        }

        // ✅ Validate we have at least questionText
        if (!parsed.questionText || !parsed.questionText.trim()) {
            throw new Error('Parsed question has no valid questionText');
        }

        console.log(`      ✅ Parse successful: "${parsed.questionText.substring(0, 40)}..."`);

        // ✅ Clean up options
        let cleanOptions = [];
        if (Array.isArray(parsed.options) && parsed.options.length > 0) {
            cleanOptions = parsed.options
                .filter(opt => opt && opt.text && opt.text.trim())
                .map((opt, idx) => ({
                    text: opt.text.trim(),
                    isCorrect: opt.isCorrect === true || opt.isCorrect === 'true'
                }));
        }
        
        // ✅ FINAL VALIDATION: Based on question type
        if (questionType === 'mcq') {
            // ✅ FINAL MCQ VALIDATION: Ensure exactly 4 options with 1 correct answer
            const finalQuestion = {
                questionText: parsed.questionText.trim(),
                options: cleanOptions,
                correctAnswer: (parsed.correctAnswer || '').trim(),
                marks: parsed.marks || 1
            };
            
            const validated = validateAndFixMCQ(finalQuestion);
            console.log(`      ✅ MCQ validated and fixed`);
            return {
                questionText: validated.questionText,
                questionType: questionType,
                options: validated.options,
                correctAnswer: validated.correctAnswer,
                marks: validated.marks
            };
        } else if (questionType === 'coding' || questionType === 'short-answer') {
            // ✅ VALIDATION for CODING and SHORT-ANSWER: No options, solution in correctAnswer
            
            // ⚠️ DETECT if AI generated wrong type (MCQ format for non-MCQ)
            if (cleanOptions.length > 0 && (parsed.questionText.toLowerCase().includes('which of the following') || 
                parsed.questionText.toLowerCase().includes('choose the'))) {
                console.warn(`      ⚠️  DETECTED: AI generated MCQ format for ${questionType}!`);
                console.warn(`      ❌ Question text contains MCQ keywords: "${parsed.questionText.substring(0, 50)}..."`);
                console.warn(`      ❌ Found ${cleanOptions.length} options but ${questionType} should have none`);
                throw new Error(`AI generated ${cleanOptions.length} options for ${questionType} type. Generated MCQ instead of ${questionType}.`);
            }
            
            console.log(`      ✅ ${questionType.toUpperCase()} validated - options cleared`);
            return {
                questionText: parsed.questionText.trim(),
                questionType: questionType,
                options: [], // ✅ Force empty options array for coding/short-answer
                correctAnswer: (parsed.correctAnswer || '').trim() || 'Expected response from student',
                marks: parsed.marks || 1,
                bloomLevel: 'Understanding',
                explanation: ''
            };
        }

        // Fallback for unknown types
        return {
            questionText: parsed.questionText.trim(),
            questionType: questionType,
            options: [], // Force empty options for non-MCQ
            correctAnswer: (parsed.correctAnswer || '').trim(),
            marks: parsed.marks || 1,
            bloomLevel: 'Understanding',
            explanation: ''
        };

    } catch (error) {
        console.error(`      ❌ PARSE FAILED: ${error.message}`);
        console.error(`      📄 Response preview: ${responseText.substring(0, 200)}`);
        throw new Error(`Failed to parse question: ${error.message}`);
    }
}

/**
 * Test Ollama connection
 */
async function testOllamaConnection() {
    try {
        console.log(`🔍 Testing Ollama at ${OLLAMA_API_URL}...`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${OLLAMA_API_URL}/api/tags`, {
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            const models = data.models?.map(m => m.name) || [];
            console.log('✅ Ollama is running');
            console.log(`📦 Available models: ${models.join(', ')}`);

            if (models.includes(OLLAMA_MODEL)) {
                console.log(`✅ Model '${OLLAMA_MODEL}' is ready`);
                
                // ✅ SPEED OPTIMIZATION: Preload model into memory for instant first call
                await preloadModel();
            } else {
                console.warn(`⚠️  Model '${OLLAMA_MODEL}' not found`);
                console.warn(`   Run: ollama pull ${OLLAMA_MODEL}`);
            }

            return true;
        }
        return false;
    } catch (error) {
        console.error('❌ Ollama connection failed:', error.message);
        console.error(`   Make sure Ollama is running at: ${OLLAMA_API_URL}`);
        return false;
    }
}

/**
 * ✅ NEW: Preload model into memory for instant generation (no 20-30s wait on first call)
 */
async function preloadModel() {
    try {
        console.log(`🚀 Preloading ${OLLAMA_MODEL} into memory...`);
        const startTime = Date.now();
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const response = await fetch(`${OLLAMA_API_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                prompt: 'Hello',  // Simple prompt to load model
                keep_alive: '10m', // Keep loaded for 10 minutes
                stream: false,
                options: {
                    num_predict: 5  // Just generate a few tokens
                }
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`✅ Model preloaded in ${duration}s - subsequent calls will be INSTANT!`);
            console.log(`💡 Model will stay in memory for 10 minutes after last use`);
        }
    } catch (error) {
        console.warn(`⚠️  Model preload failed (non-critical): ${error.message}`);
    }
}

module.exports = {
    generateQuestions,
    testOllamaConnection,
    preloadModel
};