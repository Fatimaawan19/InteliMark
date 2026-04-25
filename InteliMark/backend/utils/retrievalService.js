/**
 * Retrieval Service - Query course materials from FAISS vector store.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const RAG_DIR = path.join(__dirname, '..', 'rag_marking');
const VENV_PYTHON = path.join(RAG_DIR, '.venv', 'Scripts', 'python.exe');

function resolvePythonExecutable() {
  if (process.env.PYTHON_BIN && process.env.PYTHON_BIN.trim()) {
    return process.env.PYTHON_BIN.trim();
  }
  if (fs.existsSync(VENV_PYTHON)) {
    return VENV_PYTHON;
  }
  return 'python';
}

/**
 * Query FAISS for relevant course material chunks.
 */
function queryMaterials(query, options = {}) {
  return new Promise((resolve, reject) => {
    const { topK = 5, courseId = null } = options;
    const pythonExec = resolvePythonExecutable();

    const pythonCode = `
import json
import sys
sys.path.insert(0, r'${RAG_DIR}')

query_text = ${JSON.stringify(String(query || ''))}
top_k = ${Number.isFinite(topK) ? Math.max(1, Number(topK)) : 5}
course_id = ${courseId ? JSON.stringify(String(courseId)) : 'None'}

try:
    from faiss_vector_store import FAISSVectorStore

    store = FAISSVectorStore()
    result = store.query(query_text, top_k=top_k)
    matches = result.get('matches', []) or []

    output = {
        'success': True,
        'query': query_text,
        'results': []
    }

    for match in matches:
        metadata = match.get('metadata') or {}

        if course_id is not None and str(metadata.get('course_id')) != str(course_id):
            continue

        output['results'].append({
            'rank': len(output['results']) + 1,
            'id': str(match.get('id')),
            'text': match.get('text') or '',
            'similarity': float(match.get('score') or 0.0),
            'metadata': metadata,
        })

    print(json.dumps(output))

except Exception as e:
    print(json.dumps({
        'success': False,
        'error': str(e),
        'type': type(e).__name__,
    }))
    sys.exit(1)
`;

    const pythonProcess = spawn(pythonExec, ['-c', pythonCode], {
      cwd: RAG_DIR,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timeoutId = setTimeout(() => {
      pythonProcess.kill();
      reject(new Error('Retrieval query timed out after 30 seconds'));
    }, 30000);

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.warn(`[Retrieval-FAISS] Python stderr: ${data.toString()}`);
    });

    pythonProcess.on('close', (code) => {
      clearTimeout(timeoutId);

      if (code !== 0) {
        reject(new Error(`Retrieval process failed (code ${code}). Error: ${stderr || 'No error message'}`));
        return;
      }

      if (!stdout) {
        reject(new Error('Retrieval process returned empty output'));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        if (!result.success) {
          reject(new Error(`FAISS retrieval failed: ${result.error || 'Unknown error'}`));
          return;
        }

        resolve(result.results || []);
      } catch (parseErr) {
        reject(new Error(`Failed to parse retrieval output: ${parseErr.message}\nRaw output: ${stdout.substring(0, 300)}`));
      }
    });

    pythonProcess.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to spawn retrieval process: ${err.message}`));
    });
  });
}

/**
 * Format retrieval results for LLM context.
 */
function formatResultsForContext(results, options = {}) {
  const { includeMetadata = true, maxChars = 1000 } = options;

  if (!results || results.length === 0) {
    return 'No relevant course materials found in FAISS vector store.';
  }

  const lines = ['### Relevant Course Materials (from FAISS):'];

  results.forEach((result, idx) => {
    const relevancePercent = (Number(result.similarity || 0) * 100).toFixed(0);
    lines.push(`\n**[${idx + 1}] Relevance: ${relevancePercent}%**`);

    if (includeMetadata && result.metadata) {
      const { filename, page, chunk_index, source, source_type } = result.metadata;
      if (filename) lines.push(`Source: ${filename}`);
      if (page) lines.push(`Page: ${page}`);
      if (chunk_index !== undefined) lines.push(`Chunk: ${chunk_index}`);
      if (source) lines.push(`Type: ${source}`);
      if (source_type) lines.push(`Format: ${source_type}`);
    }

    const text = String(result.text || '');
    const textPreview = text.length > maxChars ? text.substring(0, maxChars) + '...' : text;
    lines.push(`\n${textPreview}\n`);
  });

  return lines.join('\n');
}

/**
 * Course-specific retrieval wrapper for chat context.
 */
async function getContextForStudentQuery(studentQuery, courseId) {
  try {
    const results = await queryMaterials(studentQuery, {
      topK: 5,
      courseId,
    });

    return {
      query: studentQuery,
      courseId,
      resultsFound: results.length,
      contextForLLM: formatResultsForContext(results),
      rawResults: results,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Retrieval] Failed to get context:', error.message);
    return {
      query: studentQuery,
      courseId,
      resultsFound: 0,
      contextForLLM: 'Unable to retrieve course materials at this time.',
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Health check for FAISS vector store.
 */
async function healthCheck() {
  return new Promise((resolve, reject) => {
    const pythonExec = resolvePythonExecutable();
    const pythonCode = `
import json
import sys
sys.path.insert(0, r'${RAG_DIR}')

try:
    from faiss_vector_store import FAISSVectorStore
    store = FAISSVectorStore()
    stats = store.stats()
    print(json.dumps({
        'status': 'healthy',
        'vector_store': 'FAISS',
        **stats,
    }))
except Exception as e:
    print(json.dumps({
        'status': 'unhealthy',
        'error': str(e)
    }))
    sys.exit(1)
`;

    const pythonProcess = spawn(pythonExec, ['-c', pythonCode], {
      cwd: RAG_DIR,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', () => {
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new Error(`Failed to check FAISS health: ${err.message}. ${stderr}`));
      }
    });

    pythonProcess.on('error', (err) => {
      reject(new Error(`Failed to spawn health check process: ${err.message}`));
    });
  });
}

module.exports = {
  queryMaterials,
  formatResultsForContext,
  getContextForStudentQuery,
  healthCheck,
};
