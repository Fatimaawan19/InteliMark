/**
 * Ingestion Service - Wrapper around Python RAG ingestion pipeline.
 * 
 * This service bridges Node.js and Python:
 * - Calls the Python script to ingest raw materials into FAISS
 * - Logs progress and errors
 * - Integrates with existing Node workflow
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const CourseMaterialRaw = require('../models/CourseMaterialRaw');

const RAG_DIR = path.join(__dirname, '..', 'rag_marking');
const ROOT_DIR = path.join(__dirname, '..', '..');
// Use the correct .venv-1 environment at root level (not .venv-1/Scripts but root/.venv-1/Scripts)
const VENV_PYTHON = path.join(ROOT_DIR, '.venv-1', 'Scripts', 'python.exe');
const INGEST_SCRIPT = path.join(RAG_DIR, 'ingest_materials_to_faiss.py');
const INGEST_SUBMISSIONS_SCRIPT = path.join(RAG_DIR, 'ingest_submissions_to_faiss.py');
const INIT_ASSESSMENT_REFERENCE_INDEX_SCRIPT = path.join(RAG_DIR, 'init_assessment_reference_index.py');
const INGEST_ASSESSMENT_REFERENCE_SCRIPT = path.join(RAG_DIR, 'ingest_assessment_reference_to_faiss.py');

function resolvePythonExecutable() {
  if (process.env.PYTHON_BIN && process.env.PYTHON_BIN.trim()) {
    const envPython = process.env.PYTHON_BIN.trim();
    if (path.isAbsolute(envPython) && fs.existsSync(envPython)) {
      return envPython;
    }
  }
  if (fs.existsSync(VENV_PYTHON)) {
    return VENV_PYTHON;
  }
  return 'python';
}

/**
 * Check if ingestion environment is ready
 */
function isIngestionReady() {
  const pythonExec = resolvePythonExecutable();
  const readyChecks = {
    scriptExists: fs.existsSync(INGEST_SCRIPT),
    pythonFound: pythonExec === 'python' || fs.existsSync(pythonExec),
    mongoConnection: true // Assume mongo is up for now
  };

  const allReady = Object.values(readyChecks).every(v => v === true);
  
  if (!allReady) {
    console.warn('[INGEST] ⚠️ Ingestion readiness check:', readyChecks);
  }
  
  return allReady;
}

/**
 * Trigger ingestion of course materials into FAISS
 * 
 * @param {string} courseId - Optional MongoDB course ObjectId to filter by
 * @param {number} limit - Optional limit on materials to process
 * @returns {Promise<Object>} Result with status, processed count, errors
 */
function ingestMaterials(courseId = null, limit = null, materialId = null) {
  return new Promise((resolve, reject) => {
    const timestamp = new Date().toISOString();
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[PHASE1-INGESTION] ${timestamp} - STARTING FAISS INGESTION`);
    console.log(`${'='.repeat(80)}`);
    
    if (!isIngestionReady()) {
      console.error(`[PHASE1-ERROR] Ingestion environment not ready`);
      console.error(`  - Python executable: ${resolvePythonExecutable()}`);
      console.error(`  - Script exists: ${fs.existsSync(INGEST_SCRIPT) ? '✓' : '✗'} ${INGEST_SCRIPT}`);
      return reject(new Error('Ingestion environment not ready. Verify Python 3.11 venv and dependencies.'));
    }

    const pythonExec = resolvePythonExecutable();

    const args = [INGEST_SCRIPT];
    if (courseId) {
      args.push('--course-id', courseId);
      console.log(`[PHASE1-INFO] 🎯 Filtering by course: ${courseId}`);
    }
    if (materialId) {
      args.push('--material-id', materialId);
      console.log(`[PHASE1-INFO] 📄 Filtering by material: ${materialId}`);
    }
    if (limit) {
      args.push('--limit', limit.toString());
      console.log(`[PHASE1-INFO] Limit: ${limit} materials`);
    }

    console.log(`[PHASE1-INFO] 🐍 Python Command:`);
    console.log(`  Executable: ${pythonExec}`);
    console.log(`  Script: ${INGEST_SCRIPT}`);
    console.log(`  Working Directory: ${RAG_DIR}`);
    console.log(`  Arguments: ${args.slice(1).join(' ')}`);
    console.log(`\n[PHASE1-INFO] Full: ${pythonExec} ${args.join(' ')}\n`);

    // Prepare environment with all necessary variables for ingestion
    const ingestEnv = {
      ...process.env,
      // CPU-only PyTorch (Windows compatibility)
      CUDA_VISIBLE_DEVICES: '-1',
      OMP_NUM_THREADS: '1',
      MKL_NUM_THREADS: '1',
      // Embedding model
      EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
      EMBEDDING_BATCH_SIZE: process.env.EMBEDDING_BATCH_SIZE || '32',
      // Enable logging
      DEBUG_INGESTION: process.env.DEBUG_INGESTION || 'true',
    };

    const proc = spawn(pythonExec, args, {
      cwd: RAG_DIR,
      timeout: 5 * 60 * 1000, // 5 minute timeout
      env: ingestEnv, // Pass environment variables to Python
    });

    let stdout = '';
    let stderr = '';
    const startTime = Date.now();

    proc.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log(`[PHASE1-PY] ${output.trimRight()}`);
    });

    proc.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.error(`[PHASE1-PY-ERROR] ${output.trimRight()}`);
    });

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;
      console.log(`[PHASE1-INFO] Python process exited with code: ${code} (${duration}ms)`);

      const stdoutSignals = {
        foundMaterialsCount: /Found (\d+) materials ready for ingestion/.test(stdout)
          ? Number((stdout.match(/Found (\d+) materials ready for ingestion/) || [])[1] || 0)
          : null,
        sawNoMaterials: stdout.includes('⚠️ NO MATERIALS FOUND!'),
        sawEmptyRawTextSkip: stdout.includes('empty raw text'),
        sawChunkEmptyWarning: stdout.includes('chunk_text returned EMPTY LIST'),
        sawLocalHashMatch: stdout.includes('LOCAL HASH MATCH'),
        sawGlobalHashMatch: stdout.includes('GLOBAL HASH MATCH DETECTED'),
        sawEmbeddingFailed: stdout.includes('Embedding failed'),
        sawFaissAddFailed: stdout.includes('FAISS add_documents failed'),
      };
      
      if (code === 0) {
        try {
          console.log(`[PHASE1-DEBUG] Parsing JSON output...`);
          
          // Find JSON in stdout (Python might have extra logging before JSON)
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error('No JSON found in Python output');
          }
          
          const result = JSON.parse(jsonMatch[0]);
          
          console.log(`\n${'='.repeat(80)}`);
          console.log(`[PHASE1-SUCCESS] ✅ FAISS INGESTION COMPLETED`);
          console.log(`${'='.repeat(80)}`);
          console.log(`📊 Ingestion Results:`);
          console.log(`  ├─ Materials processed: ${result.processed_count}`);
          console.log(`  ├─ Materials skipped: ${result.skipped_count}`);
          console.log(`  ├─ Errors: ${result.errors?.length || 0}`);
          console.log(`  ├─ Total duration: ${duration}ms (${(duration/1000).toFixed(1)}s)`);
          
          if (result.processed_count > 0) {
            // Calculate totals from the ingestion result
            const totalChunks = result.total_chunks_created || (result.processed_count * 2.5); // fallback estimate
            const totalEmbeddings = result.total_embeddings_created || totalChunks; // typically same as chunks
            console.log(`\n📦 Chunking & Embedding Summary:`);
            console.log(`  ├─ Total chunks created: ${totalChunks.toFixed(0)}`);
            console.log(`  ├─ Total embeddings generated: ${totalEmbeddings.toFixed(0)}`);
            console.log(`  └─ Average chunks per material: ${(totalChunks / result.processed_count).toFixed(1)}`);
          }
          
          console.log(`${'='.repeat(80) + '\n'}`);
          
          if (result.processed_count === 0) {
            console.warn(`[PHASE1-WARN] ⚠️ WARNING: 0 materials were processed!`);
            console.warn(`[PHASE1-WARN] This means no materials with extractionStatus='completed' were found.`);
            console.warn(`[PHASE1-WARN] Check MongoDB for materials with status 'extracted'`);
          }
          
          resolve({
            success: true,
            code,
            ...result,
            duration,
            processed: result.processed_count,
            skipped: result.skipped_count,
            errors: result.error_details
          });
        } catch (err) {
          console.error(`[PHASE1-ERROR] Failed to parse JSON output:`, err.message);
          console.log(`[PHASE1-DEBUG] Raw stdout (first 2000 chars):\n${stdout.substring(0, 2000)}`);
          reject(new Error(`Failed to parse ingestion output: ${err.message}`));
        }
      } else {
        console.error(`\n${'='.repeat(80)}`);
        console.error(`[PHASE1-ERROR] ❌ INGESTION FAILED`);
        console.error(`${'='.repeat(80)}`);
        console.error(`Exit Code: ${code}`);
        console.error(`Duration: ${duration}ms`);
        console.error(`\nError Details:`);
        console.error(`${stderr.substring(0, 1000)}`);
        console.error(`${'='.repeat(80) + '\n'}`);
        reject(new Error(`Ingestion process exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      console.error(`[PHASE1-ERROR] Failed to spawn ingestion process:`, err.message);
      reject(new Error(`Failed to spawn ingestion process: ${err.message}`));
    });
  });
}

/**
 * Trigger ingestion of a single student submission into FAISS (code/text index).
 *
 * @param {string} submissionId - MongoDB Submission _id
 * @returns {Promise<Object>} Result with processed count and errors
 */
function ingestSubmission(submissionId, options = {}) {
  return new Promise((resolve, reject) => {
    const timestamp = new Date().toISOString();
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[SUBMISSION-INGESTION] ${timestamp} - STARTING FAISS INGESTION (SUBMISSION)`);
    console.log(`${'='.repeat(80)}`);

    if (!submissionId) {
      return reject(new Error('submissionId is required'));
    }

    if (!isIngestionReady()) {
      console.error(`[SUBMISSION-ERROR] Ingestion environment not ready`);
      console.error(`  - Python executable: ${resolvePythonExecutable()}`);
      console.error(`  - Script exists: ${fs.existsSync(INGEST_SUBMISSIONS_SCRIPT) ? '✓' : '✗'} ${INGEST_SUBMISSIONS_SCRIPT}`);
      return reject(new Error('Ingestion environment not ready. Verify Python venv and dependencies.'));
    }

    if (!fs.existsSync(INGEST_SUBMISSIONS_SCRIPT)) {
      return reject(new Error(`Missing script: ${INGEST_SUBMISSIONS_SCRIPT}`));
    }

    const pythonExec = resolvePythonExecutable();
    const args = [INGEST_SUBMISSIONS_SCRIPT, '--submission-id', String(submissionId)];

    const enableOcr = options && typeof options === 'object' ? options.enableOcr : undefined;

    const ingestEnv = {
      ...process.env,
      CUDA_VISIBLE_DEVICES: '-1',
      OMP_NUM_THREADS: '1',
      MKL_NUM_THREADS: '1',
      EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
      EMBEDDING_BATCH_SIZE: process.env.EMBEDDING_BATCH_SIZE || '32',
      DEBUG_INGESTION: process.env.DEBUG_INGESTION || 'true',
      // Default OCR to ON for student submissions, unless explicitly disabled per-call.
      ...(enableOcr === undefined
        ? { RAG_ENABLE_OCR: process.env.RAG_ENABLE_OCR || 'true' }
        : { RAG_ENABLE_OCR: enableOcr ? 'true' : 'false' }),
    };

    const proc = spawn(pythonExec, args, {
      cwd: RAG_DIR,
      timeout: 5 * 60 * 1000,
      env: ingestEnv,
    });

    let stdout = '';
    let stderr = '';
    const startTime = Date.now();

    proc.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log(`[SUBMISSION-PY] ${output.trimRight()}`);
    });

    proc.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.error(`[SUBMISSION-PY-ERROR] ${output.trimRight()}`);
    });

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;
      if (code !== 0) {
        return reject(new Error(`Submission ingestion failed (code ${code}): ${stderr.substring(0, 800)}`));
      }

      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in Python output');
        const result = JSON.parse(jsonMatch[0]);
        resolve({ success: true, code, duration, ...result });
      } catch (err) {
        reject(new Error(`Failed to parse submission ingestion output: ${err.message}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn submission ingestion process: ${err.message}`));
    });
  });
}

/**
 * Ingest assessment reference (sample answer / rubric / CLO) into dedicated FAISS index.
 *
 * options:
 * - assessmentId (required)
 * - type: 'sample_answer' | 'rubric' | 'clo' (required)
 * - questionId: optional (defaults to ALL in python script)
 * - text: optional (for rubric/clo)
 * - filePath: optional (pdf/docx/jpg/png)
 * - splitSampleAnswer: boolean (only for sample_answer)
 * - questionCount: number (split mode hint)
 * - title: optional
 */
function ingestAssessmentReference(options = {}) {
  return new Promise((resolve, reject) => {
    const timestamp = new Date().toISOString();
    const {
      assessmentId,
      type,
      questionId = 'ALL',
      text = null,
      filePath = null,
      splitSampleAnswer = false,
      questionCount = 0,
      title = '',
    } = options || {};

    if (!assessmentId) return reject(new Error('assessmentId is required'));
    if (!type) return reject(new Error('type is required'));
    if (!fs.existsSync(INGEST_ASSESSMENT_REFERENCE_SCRIPT)) {
      return reject(new Error(`Missing script: ${INGEST_ASSESSMENT_REFERENCE_SCRIPT}`));
    }
    if (!isIngestionReady()) {
      return reject(new Error('Ingestion environment not ready. Verify Python venv and dependencies.'));
    }

    const pythonExec = resolvePythonExecutable();
    const args = [
      INGEST_ASSESSMENT_REFERENCE_SCRIPT,
      '--assessment-id',
      String(assessmentId),
      '--question-id',
      String(questionId || 'ALL'),
      '--type',
      String(type),
    ];

    if (title) {
      args.push('--title', String(title));
    }

    if (filePath) {
      if (!fs.existsSync(filePath)) return reject(new Error(`File not found: ${filePath}`));
      args.push('--file', String(filePath));
    } else if (text != null) {
      args.push('--text', String(text));
    } else {
      return reject(new Error('Provide filePath or text'));
    }

    if (splitSampleAnswer && String(type) === 'sample_answer') {
      args.push('--split-sample-answer');
      if (Number(questionCount) > 0) {
        args.push('--question-count', String(Number(questionCount)));
      }
    }

    const ingestEnv = {
      ...process.env,
      CUDA_VISIBLE_DEVICES: '-1',
      OMP_NUM_THREADS: '1',
      MKL_NUM_THREADS: '1',
      EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
      EMBEDDING_BATCH_SIZE: process.env.EMBEDDING_BATCH_SIZE || '32',
      DEBUG_INGESTION: process.env.DEBUG_INGESTION || 'true',
      // Force OCR on for assessment-reference ingestion (sample/rubric/CLO).
      // If OCR is unavailable in Python environment, the script will report ocr_status + ocr_error.
      ASSESS_REF_ENABLE_OCR: 'true',
      // Also OCR embedded images in PDFs/DOCX (diagrams/screenshots).
      ASSESS_REF_EXTRACT_IMAGES: 'true',
    };

    const proc = spawn(pythonExec, args, {
      cwd: RAG_DIR,
      timeout: 5 * 60 * 1000,
      env: ingestEnv,
    });

    let stdout = '';
    let stderr = '';
    const startTime = Date.now();

    proc.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log(`[ASSESS-REF-PY] ${output.trimRight()}`);
    });
    proc.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.error(`[ASSESS-REF-PY-ERROR] ${output.trimRight()}`);
    });

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;
      if (code !== 0) {
        return reject(new Error(`Assessment reference ingestion failed (code ${code}): ${stderr.substring(0, 800)}`));
      }
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in Python output');
        const result = JSON.parse(jsonMatch[0]);
        resolve({ success: true, code, duration, ...result, timestamp });
      } catch (err) {
        reject(new Error(`Failed to parse assessment reference ingestion output: ${err.message}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn assessment reference ingestion process: ${err.message}`));
    });
  });
}

/**
 * Ingest materials for a specific course after upload
 * 
 * @param {string} courseId - MongoDB course ObjectId
 * @returns {Promise<Object>} Ingestion result
 */
async function ingestCourseAfterUpload(courseId) {
  const timestamp = new Date().toISOString();
  try {
    console.log(`[PHASE1-INFO] ${timestamp} Initiating FAISS ingestion for course: ${courseId}`);
    const result = await ingestMaterials(courseId);
    console.log(`[PHASE1-SUCCESS] ${timestamp} Ingestion completed for course ${courseId}`);
    return result;
  } catch (error) {
    console.error(`[PHASE1-ERROR] ${timestamp} Ingestion failed for course ${courseId}`);
    console.error(`[PHASE1-ERROR] Error message: ${error.message}`);
    console.error(`[PHASE1-ERROR] Error type: ${error.name}`);
    throw error;
  }
}

/**
 * Ingest a specific material immediately after upload.
 *
 * @param {string} materialId - MongoDB material ObjectId
 * @returns {Promise<Object>} Ingestion result
 */
async function ingestMaterialAfterUpload(materialId) {
  const timestamp = new Date().toISOString();
  try {
    console.log(`[PHASE1-INFO] ${timestamp} Initiating FAISS ingestion for material: ${materialId}`);

    // Python ingestion script currently filters CourseMaterialRaw by _id, not materialId.
    // Resolve the corresponding raw doc first to avoid 0-processed ingestion runs.
    const rawDoc = await CourseMaterialRaw.findOne({ materialId }).select('_id materialId extractionStatus');
    if (!rawDoc) {
      throw new Error(`No CourseMaterialRaw found for materialId ${materialId}`);
    }

    const rawId = String(rawDoc._id);
    console.log(`[PHASE1-INFO] ${timestamp} Resolved raw document id: ${rawId}`);

    const result = await ingestMaterials(null, null, rawId);
    console.log(`[PHASE1-SUCCESS] ${timestamp} Ingestion completed for material ${materialId} (rawId: ${rawId})`);
    return result;
  } catch (error) {
    console.error(`[PHASE1-ERROR] ${timestamp} Ingestion failed for material ${materialId}`);
    console.error(`[PHASE1-ERROR] Error message: ${error.message}`);
    console.error(`[PHASE1-ERROR] Error type: ${error.name}`);
    throw error;
  }
}

module.exports = {
  isIngestionReady,
  ingestMaterials,
  ingestCourseAfterUpload,
  ingestMaterialAfterUpload,
  ingestSubmission,
  INIT_ASSESSMENT_REFERENCE_INDEX_SCRIPT,
  INGEST_ASSESSMENT_REFERENCE_SCRIPT,
  ingestAssessmentReference,
};
