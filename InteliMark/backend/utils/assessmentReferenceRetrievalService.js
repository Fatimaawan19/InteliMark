/**
 * Assessment Reference Retrieval Service - Query sample answers/rubrics/CLO text from FAISS.
 *
 * Uses a dedicated FAISS index stored in backend/rag_marking/faiss_assessment_reference_index.
 * Documents are filtered in-process by metadata (assessment_id, question_id, reference_type).
 */
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const RAG_DIR = path.join(__dirname, "..", "rag_marking");
const ROOT_DIR = path.join(__dirname, "..", "..");
const VENV_PYTHON = path.join(ROOT_DIR, ".venv-1", "Scripts", "python.exe");
const REFERENCE_INDEX_DIR = path.join(RAG_DIR, "faiss_assessment_reference_index");

function resolvePythonExecutable() {
  if (process.env.PYTHON_BIN && process.env.PYTHON_BIN.trim()) {
    const envPython = process.env.PYTHON_BIN.trim();
    if (path.isAbsolute(envPython) && fs.existsSync(envPython)) return envPython;
  }
  if (fs.existsSync(VENV_PYTHON)) return VENV_PYTHON;
  return "python";
}

/**
 * Query FAISS for relevant assessment reference chunks.
 *
 * Options:
 * - topK: number
 * - assessmentId: string | null
 * - questionId: string | null (ex: "Q1", "ALL")
 * - referenceType: "sample_answer" | "rubric" | "clo" | null
 */
function queryAssessmentReferenceChunks(query, options = {}) {
  return new Promise((resolve, reject) => {
    const {
      topK = 8,
      assessmentId = null,
      questionId = null,
      referenceType = null,
    } = options;

    const pythonExec = resolvePythonExecutable();

    const pythonCode = `
import json
import sys
from pathlib import Path
sys.path.insert(0, r'${RAG_DIR}')

query_text = ${JSON.stringify(String(query || ""))}
top_k = ${Number.isFinite(topK) ? Math.max(1, Number(topK)) : 8}
assessment_id = ${assessmentId ? JSON.stringify(String(assessmentId)) : "None"}
question_id = ${questionId ? JSON.stringify(String(questionId)) : "None"}
reference_type = ${referenceType ? JSON.stringify(String(referenceType)) : "None"}
index_dir = Path(r'${REFERENCE_INDEX_DIR}')

try:
    from faiss_vector_store import FAISSVectorStore
    store = FAISSVectorStore(index_dir=index_dir)
    result = store.query(query_text, top_k=top_k)
    matches = result.get('matches', []) or []
    out = { 'success': True, 'results': [] }

    for m in matches:
        md = m.get('metadata') or {}
        if assessment_id is not None and str(md.get('assessment_id')) != str(assessment_id):
            continue
        if question_id is not None and str(md.get('question_id')) != str(question_id):
            continue
        if reference_type is not None and str(md.get('reference_type')) != str(reference_type):
            continue

        out['results'].append({
            'id': str(m.get('id')),
            'text': m.get('text') or '',
            'similarity': float(m.get('score') or 0.0),
            'metadata': md,
        })

    print(json.dumps(out))
except Exception as e:
    print(json.dumps({ 'success': False, 'error': str(e), 'type': type(e).__name__ }))
    sys.exit(1)
`;

    const proc = spawn(pythonExec, ["-c", pythonCode], {
      cwd: RAG_DIR,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timeoutMs = Number(process.env.ASSESSMENT_REF_RETRIEVAL_TIMEOUT_MS || 120000);
    const timeoutId = setTimeout(() => {
      proc.kill();
      reject(new Error(`Assessment reference retrieval timed out after ${Math.round(timeoutMs / 1000)} seconds`));
    }, timeoutMs);

    proc.stdout.on("data", (data) => (stdout += data.toString()));
    proc.stderr.on("data", (data) => (stderr += data.toString()));

    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      if (code !== 0) {
        reject(new Error(`Assessment reference retrieval failed (code ${code}): ${stderr || "No stderr"}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        if (!parsed.success) return reject(new Error(parsed.error || "Unknown retrieval error"));
        resolve(parsed.results || []);
      } catch (e) {
        reject(new Error(`Failed to parse assessment reference retrieval output: ${e.message}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to spawn assessment reference retrieval: ${err.message}`));
    });
  });
}

module.exports = { queryAssessmentReferenceChunks };

