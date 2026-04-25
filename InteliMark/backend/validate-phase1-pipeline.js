#!/usr/bin/env node

/**
 * Phase 1 Pipeline - Validation & Diagnostic Script
 * 
 * Run from either directory:
 * node backend/validate-phase1-pipeline.js  (from root)
 * node validate-phase1-pipeline.js          (from backend)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Determine project root: check if current dir is backend, go up if needed
let projectRoot = __dirname;  // This is the backend directory
if (path.basename(projectRoot) === 'backend') {
  projectRoot = path.dirname(projectRoot);  // Go up to parent (root)
}

// Fallback: keep going up until we find a package.json at root level
while (projectRoot !== path.dirname(projectRoot)) {
  if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
    // Check if this has a backend folder - if yes, this is likely the root
    if (fs.existsSync(path.join(projectRoot, 'backend'))) {
      break;
    }
  }
  projectRoot = path.dirname(projectRoot);
}

console.log('\n' + '='.repeat(80));
console.log('🔍 PHASE 1 PIPELINE VALIDATION');
console.log('='.repeat(80));
console.log(`📍 Project Root: ${projectRoot}\n`);

// Track results
const results = {
  passed: [],
  failed: [],
  warnings: []
};

// ============================================================================
// TEST 1: Environment Variables
// ============================================================================

console.log('📋 TEST 1: Environment Variables');
console.log('─'.repeat(80));

const requiredEnvVars = [
  'TESSERACT_CMD',
  'TESSDATA_PREFIX',
  'RAG_ENABLE_OCR',
  'RAG_AUTO_INGEST',
  'EMBEDDING_MODEL',
  'CUDA_VISIBLE_DEVICES'
];

requiredEnvVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`✓ ${varName}: ${value}`);
    results.passed.push(`Env var ${varName}`);
  } else {
    console.warn(`⚠ ${varName}: NOT SET`);
    results.warnings.push(`Env var ${varName} not set`);
  }
});

console.log('\n');

// ============================================================================
// TEST 2: Tesseract Installation
// ============================================================================

console.log('🔧 TEST 2: Tesseract-OCR Installation');
console.log('─'.repeat(80));

try {
  const tesseractPath = process.env.TESSERACT_CMD || 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe';
  if (fs.existsSync(tesseractPath)) {
    console.log(`✓ Tesseract binary found: ${tesseractPath}`);
    results.passed.push('Tesseract binary');
    
    try {
      const version = execSync('tesseract --version', { encoding: 'utf-8' });
      console.log(`✓ Version: ${version.split('\n')[0]}`);
      results.passed.push('Tesseract version check');
    } catch (e) {
      results.warnings.push('Could not verify Tesseract version');
    }
  } else {
    console.error(`✗ Tesseract not found at: ${tesseractPath}`);
    results.failed.push('Tesseract binary');
  }
} catch (e) {
  results.failed.push('Tesseract check: ' + e.message);
}

// Check tessdata
const tessdataPath = process.env.TESSDATA_PREFIX || 'C:\\Program Files\\Tesseract-OCR\\tessdata';
if (fs.existsSync(tessdataPath)) {
  console.log(`✓ Tessdata directory found: ${tessdataPath}`);
  results.passed.push('Tessdata');
} else {
  console.warn(`⚠ Tessdata not found: ${tessdataPath}`);
  results.warnings.push('Tessdata directory');
}

console.log('\n');

// ============================================================================
// TEST 3: Python Environment
// ============================================================================

console.log('🐍 TEST 3: Python Environment');
console.log('─'.repeat(80));

try {
  // Python should be in .venv-1 at PROJECT ROOT, not in backend
  const pythonCmd = process.env.PYTHON_BIN || '.venv-1/Scripts/python.exe';
  const pythonPath = path.resolve(projectRoot, pythonCmd);
  
  if (fs.existsSync(pythonPath)) {
    console.log(`✓ Python executable found: ${pythonPath}`);
    results.passed.push('Python executable');
    
    try {
      const version = execSync(`"${pythonPath}" --version`, { encoding: 'utf-8' });
      console.log(`✓ Version: ${version.trim()}`);
      results.passed.push('Python version');
    } catch (e) {
      results.warnings.push('Python version check failed');
    }
  } else {
    console.error(`✗ Python not found at: ${pythonPath}`);
    results.failed.push('Python executable');
  }
} catch (e) {
  results.warnings.push('Python check: ' + e.message);
}

console.log('\n');

// ============================================================================
// TEST 4: Python Dependencies
// ============================================================================

console.log('📦 TEST 4: Python Dependencies');
console.log('─'.repeat(80));

const pythonDeps = [
  'faiss',
  'sentence_transformers',
  'pymongo',
  'pdfplumber',
  'python-pptx',
  'pytesseract',
  'PIL',
  'langchain'
];

const pythonCmd = process.env.PYTHON_BIN || '.venv-1/Scripts/python.exe';
const pythonExePath = path.resolve(projectRoot, pythonCmd);

try {
  if (!fs.existsSync(pythonExePath)) {
    console.warn('⚠️  Python not found, skipping dependency check');
    results.warnings.push('Python dependency check skipped (Python not found)');
  } else {
    const depCode = pythonDeps.map(dep => `
try:
  __import__('${dep}')
  print('✓ ${dep}')
except ImportError:
  print('✗ ${dep}')
`).join('');

    const output = execSync(`"${pythonExePath}" -c "${depCode}"`, { encoding: 'utf-8' }).split('\n');
    
    output.forEach(line => {
      if (line.includes('✓')) {
        results.passed.push('Python dep: ' + line);
      } else if (line.includes('✗')) {
        results.failed.push('Python dep: ' + line);
      }
    });
    
    console.log(output.filter(l => l).join('\n'));
  }
} catch (e) {
  console.error('⚠ Could not check Python dependencies:', e.message);
  results.warnings.push('Python dependency check failed');
}

console.log('\n');

// ============================================================================
// TEST 5: Script Files
// ============================================================================

console.log('📁 TEST 5: Required Script Files');
console.log('─'.repeat(80));

const requiredFiles = [
  'backend/rag_marking/ingest_materials_to_faiss.py',
  'backend/rag_marking/extract_course_material_text.py',
  'backend/rag_marking/embeddings.py',
  'backend/rag_marking/chunking.py',
  'backend/rag_marking/faiss_vector_store.py',
  'backend/utils/materialExtractor.js',
  'backend/utils/ingestionService.js'
];

requiredFiles.forEach(file => {
  const fullPath = path.resolve(projectRoot, file);
  if (fs.existsSync(fullPath)) {
    console.log(`✓ ${file}`);
    results.passed.push(`File: ${file}`);
  } else {
    console.error(`✗ ${file}`);
    results.failed.push(`File: ${file}`);
  }
});

console.log('\n');

// ============================================================================
// TEST 6: Configuration Files
// ============================================================================

console.log('⚙️  TEST 6: Configuration Files');
console.log('─'.repeat(80));

const configFiles = [
  { path: 'backend/.env', critical: true },
  { path: '.env', critical: false }
];

configFiles.forEach(({ path: filePath, critical }) => {
  const fullPath = path.resolve(projectRoot, filePath);
  if (fs.existsSync(fullPath)) {
    console.log(`✓ ${filePath}`);
    results.passed.push(`Config: ${filePath}`);
  } else {
    const msg = `${filePath}`;
    if (critical) {
      console.error(`✗ ${msg} (CRITICAL)`);
      results.failed.push(`Config: ${msg}`);
    } else {
      console.warn(`⚠ ${msg}`);
      results.warnings.push(`Config: ${msg}`);
    }
  }
});

console.log('\n');

// ============================================================================
// TEST 7: Directory Permissions
// ============================================================================

console.log('🔐 TEST 7: Directory Permissions');
console.log('─'.repeat(80));

const dirs = [
  'backend/uploads/course_materials_upload',
  'backend/uploads/syllabus_uploads',
  'backend/rag_marking/faiss_index',
  'backend/uploads/student_uploads'
];

dirs.forEach(dir => {
  const fullPath = path.resolve(projectRoot, dir);
  try {
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`✓ Created: ${dir}`);
      results.passed.push(`Directory created: ${dir}`);
    } else {
      console.log(`✓ ${dir} (exists)`);
      results.passed.push(`Directory: ${dir}`);
    }
  } catch (e) {
    console.error(`✗ ${dir}: ${e.message}`);
    results.failed.push(`Directory: ${dir}`);
  }
});

console.log('\n');

// ============================================================================
// SUMMARY
// ============================================================================

console.log('='.repeat(80));
console.log('📊 SUMMARY');
console.log('='.repeat(80) + '\n');

console.log(`✓ PASSED: ${results.passed.length}`);
results.passed.slice(0, 5).forEach(r => console.log(`  • ${r}`));
if (results.passed.length > 5) {
  console.log(`  ... and ${results.passed.length - 5} more`);
}

if (results.warnings.length > 0) {
  console.log(`\n⚠️  WARNINGS: ${results.warnings.length}`);
  results.warnings.forEach(r => console.log(`  • ${r}`));
}

if (results.failed.length > 0) {
  console.log(`\n✗ FAILED: ${results.failed.length}`);
  results.failed.forEach(r => console.log(`  • ${r}`));
}

// Determine overall status
const totalTests = results.passed.length + results.failed.length + results.warnings.length;
const passRate = Math.round((results.passed.length / totalTests) * 100);

console.log('\n' + '='.repeat(80));

if (results.failed.length === 0 && results.warnings.length <= 2) {
  console.log(`🎉 PIPELINE READY! (${passRate}% passing)\n`);
  console.log('Next steps:');
  console.log('1. Start server: node backend/server.js');
  console.log('2. Upload a PDF/PPTX file');
  console.log('3. Check backend logs for extraction & ingestion');
  console.log('4. Verify MongoDB for ingestion completion\n');
} else if (results.failed.length > 0) {
  console.log(`⚠️  ISSUES DETECTED - Please fix the failures above\n`);
  console.log('Common fixes:');
  console.log('1. Install Tesseract: https://github.com/UB-Mannheim/tesseract/wiki');
  console.log('2. Reinstall Python deps: pip install -r backend/rag_marking/requirements.txt');
  console.log('3. Check backend/.env for configuration\n');
} else {
  console.log(`✓ MOSTLY READY (${passRate}% passing)\n`);
  console.log('Warnings should not block pipeline operation.\n');
}

console.log('='.repeat(80) + '\n');

// Exit with appropriate code
process.exit(results.failed.length > 0 ? 1 : 0);
