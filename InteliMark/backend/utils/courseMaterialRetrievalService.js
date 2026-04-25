/**
 * Course Material Retrieval Service - Query course material chunks from FAISS.
 *
 * Uses the default FAISS index stored in backend/rag_marking/faiss_index (see faiss_vector_store.py).
 * Filters results by metadata.course_id.
 */
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const RAG_DIR = path.join(__dirname, "..", "rag_marking");
const ROOT_DIR = path.join(__dirname, "..", "..");
const VENV_PYTHON = path.join(ROOT_DIR, ".venv-1", "Scripts", "python.exe");
const MATERIAL_INDEX_DIR = path.join(RAG_DIR, "faiss_index");

function resolvePythonExecutable() {
  if (process.env.PYTHON_BIN && process.env.PYTHON_BIN.trim()) {
    const envPython = process.env.PYTHON_BIN.trim();
    if (path.isAbsolute(envPython) && fs.existsSync(envPython)) return envPython;
  }
  if (fs.existsSync(VENV_PYTHON)) return VENV_PYTHON;
  return "python";
}

/**
 * Query FAISS for relevant course material chunks.
 *
 * Options:
 * - topK: number
 * - courseId: string | null (filter results)
 * - materialId: string | null (optional filter)
 */
function queryCourseMaterialChunks(query, options = {}) {
  return new Promise((resolve, reject) => {
    const { topK = 8, courseId = null, materialId = null } = options;
    const pythonExec = resolvePythonExecutable();

    const pythonCode = `
import json
import sys
from pathlib import Path
sys.path.insert(0, r'${RAG_DIR}')

query_text = ${JSON.stringify(String(query || ""))}
top_k = ${Number.isFinite(topK) ? Math.max(1, Number(topK)) : 8}
course_id = ${courseId ? JSON.stringify(String(courseId)) : "None"}
material_id = ${materialId ? JSON.stringify(String(materialId)) : "None"}
index_dir = Path(r'${MATERIAL_INDEX_DIR}')

try:
    from faiss_vector_store import FAISSVectorStore
    store = FAISSVectorStore(index_dir=index_dir)
    result = store.query(query_text, top_k=top_k)
    matches = result.get('matches', []) or []

    out = { 'success': True, 'results': [] }
    for m in matches:
        md = m.get('metadata') or {}
        if course_id is not None and str(md.get('course_id')) != str(course_id):
            continue
        if material_id is not None and str(md.get('material_id')) != str(material_id):
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
    proc.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    proc.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(stderr || stdout || `Python exited with code ${code}`));
      }
      try {
        const parsed = JSON.parse(stdout || "{}");
        if (!parsed?.success) return resolve([]);
        return resolve(Array.isArray(parsed.results) ? parsed.results : []);
      } catch (e) {
        return reject(new Error(`Failed to parse python output: ${e?.message || e}\n${stdout}\n${stderr}`));
      }
    });
  });
}

module.exports = { queryCourseMaterialChunks };

