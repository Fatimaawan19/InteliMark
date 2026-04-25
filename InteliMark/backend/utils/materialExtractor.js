const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

function resolvePythonExecutable(backendRoot, projectRoot) {
  const envPython = process.env.PYTHON_BIN ? process.env.PYTHON_BIN.trim() : "";
  if (envPython) {
    // Respect absolute PYTHON_BIN when it exists.
    if (path.isAbsolute(envPython) && fs.existsSync(envPython)) return envPython;

    // Also support relative PYTHON_BIN paths from backend/.env (common on Windows).
    // Resolve relative to project root first (repo root), then backend root.
    const fromProject = path.resolve(projectRoot, envPython);
    if (fs.existsSync(fromProject)) return fromProject;
    const fromBackend = path.resolve(backendRoot, envPython);
    if (fs.existsSync(fromBackend)) return fromBackend;
  }

  // Default to PATH lookup to avoid relative-path ENOENT issues such as
  // ".venv-1/Scripts/python.exe" when Node is launched from a different cwd.
  return "python";
}

function parseExtractorOutput(stdout) {
  const payloadRaw = (stdout || "").trim();
  if (!payloadRaw) return null;

  // Try direct JSON first.
  try {
    return JSON.parse(payloadRaw);
  } catch (_) {
    // Ignore and try to recover JSON line/object from mixed logs.
  }

  const lines = payloadRaw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line.startsWith("{")) continue;
    try {
      return JSON.parse(line);
    } catch (_) {
      // Continue searching older lines.
    }
  }

  // Last attempt: recover trailing JSON block.
  const jsonTail = payloadRaw.match(/\{[\s\S]*\}\s*$/);
  if (jsonTail) {
    try {
      return JSON.parse(jsonTail[0]);
    } catch (_) {
      return null;
    }
  }

  return null;
}

function toEnvBoolean(value) {
  if (value === true || value === "true" || value === "1" || value === 1) return "true";
  return "false";
}

/**
 * Resolve Tesseract-OCR path on Windows
 * Tries multiple common installation paths
 */
function resolveTesseractPath() {
  const commonPaths = [
    process.env.TESSERACT_CMD,
    process.env.TESSERACT_PATH,
    "C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
    "C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe",
    "tesseract.exe" // Fallback to PATH
  ];

  for (const tesserPath of commonPaths) {
    if (!tesserPath) continue;
    
    // If it's just "tesseract.exe", assume it's in PATH
    if (tesserPath === "tesseract.exe") {
      return tesserPath;
    }
    
    // Check if file exists
    if (fs.existsSync(tesserPath)) {
      console.log(`[OCR] ✓ Found Tesseract at: ${tesserPath}`);
      return tesserPath;
    }
  }

  console.warn(`[OCR] ⚠️ Tesseract not found in common paths, trying system PATH`);
  return "tesseract.exe"; // Let system PATH resolve it
}

function extractTextFromMaterial(filePath, options = {}) {
  return new Promise((resolve, reject) => {
    // Backend directory is __dirname (utils folder is inside backend)
    const backendRoot = path.resolve(__dirname, "..");
    // Project root is one level up from backend
    const projectRoot = path.resolve(backendRoot, "..");
    const pythonBin = resolvePythonExecutable(backendRoot, projectRoot);
    const materialPath = path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
    const scriptPath = path.resolve(backendRoot, "rag_marking", "extract_course_material_text.py");

    const enableOcr = options.enableOcr !== undefined ? options.enableOcr : process.env.RAG_ENABLE_OCR;
    const tesseractCmd = options.tesseractCmd || resolveTesseractPath();
    const tessdataPrefix = options.tessdataPrefix || process.env.TESSDATA_PREFIX || "C:\\Program Files\\Tesseract-OCR\\tessdata";
    const runtimeContext = {
      pythonBin,
      scriptPath,
      filePath: materialPath,
      cwd: backendRoot,
      enableOcr: toEnvBoolean(enableOcr),
      tesseractCmd,
    };

    // Show extraction start
    const fileName = path.basename(materialPath);
    console.log('\n' + '═'.repeat(60));
    console.log('📥 PHASE 1: EXTRACTION');
    console.log('═'.repeat(60));
    console.log('📄 File: ' + fileName);
    console.log('🔧 Method: Python extraction (python-pptx/pdfplumber)');
    console.log('🧠 OCR: ' + (toEnvBoolean(enableOcr) === "true" ? "ENABLED ✓" : "DISABLED ✗"));
    if (toEnvBoolean(enableOcr) === "true") {
      console.log('   Tesseract: ' + tesseractCmd);
      console.log('   Tessdata: ' + tessdataPrefix);
    }
    console.log('─'.repeat(60));

    const child = spawn(pythonBin, [scriptPath, materialPath], {
      cwd: backendRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        RAG_ENABLE_OCR: toEnvBoolean(enableOcr),
        TESSERACT_CMD: tesseractCmd,
        TESSDATA_PREFIX: tessdataPrefix,
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      // Show Python output in real-time
      if (text.includes("[INFO]") || text.includes("[DEBUG]")) {
        process.stdout.write(text);
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      // Show errors in real-time
      if (text.includes("[ERROR]") || text.includes("Error")) {
        process.stdout.write("❌ " + text);
      }
    });

    child.on("error", (err) => {
      const error = new Error(`Extractor process failed to start: ${err.message}`);
      error.runtime = runtimeContext;
      reject(error);
    });

    child.on("close", (code) => {
      const payloadRaw = stdout.trim();
      if (!payloadRaw) {
        console.log('\n❌ EXTRACTION FAILED');
        console.log('─'.repeat(60));
        console.log('Error: Extractor returned empty output');
        console.log('stderr: ' + stderr.trim());
        const error = new Error(`Extractor returned empty output. stderr: ${stderr.trim()}`);
        error.stderr = stderr.trim();
        error.stdout = stdout.trim();
        error.exitCode = code;
        error.runtime = runtimeContext;
        return reject(error);
      }

      const payload = parseExtractorOutput(payloadRaw);
      if (!payload) {
        console.log('\n❌ EXTRACTION FAILED');
        console.log('─'.repeat(60));
        console.log('Error: Invalid JSON response from extractor');
        console.log(payloadRaw.substring(0, 500));
        const error = new Error(`Invalid extractor response: ${payloadRaw}`);
        error.stderr = stderr.trim();
        error.stdout = payloadRaw;
        error.exitCode = code;
        error.runtime = runtimeContext;
        return reject(error);
      }

      if (code !== 0 || !payload.success) {
        const errorMessage = payload.error || "Extraction failed";
        const stderrText = stderr.trim();
        const reason =
          payload.reason ||
          payload.error_reason ||
          payload.error_type ||
          stderrText ||
          "No extraction details returned";
        
        console.log('\n❌ EXTRACTION FAILED');
        console.log('─'.repeat(60));
        console.log('Error: ' + (reason ? `${errorMessage}: ${reason}` : errorMessage));
        if (stderrText) console.log('Details: ' + stderrText.substring(0, 200));
        
        const error = new Error(reason ? `${errorMessage}: ${reason}` : errorMessage);
        error.reason = reason;
        error.payload = payload;
        error.stderr = stderrText;
        error.stdout = payloadRaw;
        error.exitCode = code;
        error.runtime = runtimeContext;
        error.errorType = payload.error_type || null;
        return reject(error);
      }

      // SUCCESS - Show results
      console.log('\n✅ EXTRACTION SUCCESS');
      console.log('─'.repeat(60));
      console.log('📊 Results:');
      console.log('  ├─ Text extracted: ' + (payload.char_count || 0) + ' characters');
      console.log('  ├─ Pages/Slides: ' + (payload.page_count || 0));
      console.log('  ├─ Visual elements: ' + (payload.visual_count || 0));
      console.log('  ├─ OCR attempted: ' + (payload.ocr_count || 0) + ' images');
      console.log('  ├─ OCR text found: ' + (payload.ocr_char_count || 0) + ' chars');
      console.log('  └─ Extractor: ' + (payload.extractor || 'unknown'));
      console.log('─'.repeat(60) + '\n');

      resolve(payload);
    });
  });
}

/**
 * Check if extraction environment is ready
 * Validates Python executable and extraction script exist
 */
function isExtractionReady() {
  const backendRoot = path.resolve(__dirname, "..");
  const projectRoot = path.resolve(backendRoot, "..");
  const scriptPath = path.resolve(backendRoot, "rag_marking", "extract_course_material_text.py");
  const pythonBin = resolvePythonExecutable(backendRoot, projectRoot);

  const pythonFound = pythonBin === "python" || fs.existsSync(pythonBin);
  const scriptFound = fs.existsSync(scriptPath);

  return pythonFound && scriptFound;
}

/**
 * Check if OCR environment is ready
 * Validates Tesseract is installed
 */
function isOcrReady() {
  const commonPaths = [
    process.env.TESSERACT_CMD,
    process.env.TESSERACT_PATH,
    "C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
    "C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe",
  ];

  for (const tesserPath of commonPaths) {
    if (!tesserPath) continue;
    if (fs.existsSync(tesserPath)) {
      return true;
    }
  }

  return false; // Tesseract not found in expected paths
}

/**
 * Get detailed environment status for diagnostics
 */
function getExtractionEnvironmentStatus() {
  const backendRoot = path.resolve(__dirname, "..");
  const projectRoot = path.resolve(backendRoot, "..");
  const scriptPath = path.resolve(backendRoot, "rag_marking", "extract_course_material_text.py");
  const pythonBin = resolvePythonExecutable(backendRoot, projectRoot);

  const pythonExists = fs.existsSync(pythonBin) || pythonBin === "python";
  const scriptExists = fs.existsSync(scriptPath);
  const tesseractReady = isOcrReady();

  return {
    extraction: {
      ready: pythonExists && scriptExists,
      pythonFound: pythonExists,
      pythonPath: pythonBin,
      scriptExists: scriptExists,
      scriptPath: scriptPath,
    },
    ocr: {
      ready: tesseractReady,
      tesseractPath: resolveTesseractPath(),
      tessdataPrefix: process.env.TESSDATA_PREFIX || "C:\\Program Files\\Tesseract-OCR\\tessdata",
    }
  };
}

module.exports = {
  extractTextFromMaterial,
  isExtractionReady,
  isOcrReady,
  getExtractionEnvironmentStatus,
};
