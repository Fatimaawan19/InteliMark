#!/usr/bin/env node
/**
 * Phase 1 Environment Diagnostic Script
 * 
 * Verifies all components needed for the Phase 1 pipeline:
 * 1. Extraction (Python + script)
 * 2. OCR (Tesseract)
 * 3. Ingestion (Python + FAISS + embeddings)
 * 
 * Usage: node verify-phase1-environment.js
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');

console.log('\n' + '═'.repeat(80));
console.log('🔍 PHASE 1 PIPELINE ENVIRONMENT VERIFICATION');
console.log('═'.repeat(80) + '\n');

// Colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function check(name, condition, details = '') {
  const status = condition ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
  console.log(`  ${status} ${name}`);
  if (details) console.log(`      ${colors.blue}${details}${colors.reset}`);
  return condition;
}

function section(title) {
  console.log(`\n${colors.blue}${title}${colors.reset}`);
  console.log('─'.repeat(60));
}

// ===== EXTRACTION CHECKS =====
section('1️⃣  EXTRACTION ENVIRONMENT');

const venv1Python = path.join(ROOT, '.venv-1', 'Scripts', 'python.exe');
const fallbackVenvPython = path.join(BACKEND, 'rag_marking', '.venv311', 'Scripts', 'python.exe');
const extractScriptPath = path.join(BACKEND, 'rag_marking', 'extract_course_material_text.py');

const pythonFound = fs.existsSync(venv1Python) || fs.existsSync(fallbackVenvPython);
const pythonPath = fs.existsSync(venv1Python) ? venv1Python : fallbackVenvPython;
const scriptFound = fs.existsSync(extractScriptPath);

check('Python venv executable', pythonFound, pythonPath);
check('Extraction script exists', scriptFound, extractScriptPath);

const extractionReady = pythonFound && scriptFound;
console.log(`\n  ${extractionReady ? colors.green : colors.red}Status: ${extractionReady ? 'READY ✓' : 'NOT READY ✗'}${colors.reset}`);

// ===== OCR CHECKS =====
section('2️⃣  OCR ENVIRONMENT');

const tesseractPaths = [
  process.env.TESSERACT_CMD,
  process.env.TESSERACT_PATH,
  'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
  'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe',
];

let tesseractFound = false;
let tesseractPath = null;

for (const p of tesseractPaths) {
  if (!p) continue;
  if (fs.existsSync(p)) {
    tesseractFound = true;
    tesseractPath = p;
    break;
  }
}

check('Tesseract OCR installed', tesseractFound, tesseractPath || 'Not found in standard paths');

if (tesseractFound) {
  const tessdataPrefix = process.env.TESSDATA_PREFIX || 'C:\\Program Files\\Tesseract-OCR\\tessdata';
  const tessdataExists = fs.existsSync(tessdataPrefix);
  check('TESSDATA_PREFIX available', tessdataExists, tessdataPrefix);
}

const ocrReady = tesseractFound;
console.log(`\n  ${ocrReady ? colors.green : colors.yellow}Status: ${ocrReady ? 'READY ✓' : 'OPTIONAL (will skip OCR) ⚠️'}${colors.reset}`);

if (!ocrReady) {
  console.log(`\n  ${colors.yellow}ℹ️ To enable OCR:${colors.reset}`);
  console.log('     1. Download: https://github.com/UB-Mannheim/tesseract/wiki');
  console.log('     2. Install to default location or set TESSERACT_CMD env var');
  console.log('     3. Restart node server');
}

// ===== INGESTION CHECKS =====
section('3️⃣  INGESTION ENVIRONMENT');

const ingestScriptPath = path.join(BACKEND, 'rag_marking', 'ingest_materials_to_faiss.py');
const ingestScriptFound = fs.existsSync(ingestScriptPath);

check('Ingestion script exists', ingestScriptFound, ingestScriptPath);
check('Python venv executable', pythonFound, pythonPath);

// Try to check if Python has required packages
console.log('\n  Checking Python packages...');
const checkPkgs = spawn(pythonPath, ['-m', 'pip', 'list'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let pipOutput = '';
checkPkgs.stdout.on('data', (data) => {
  pipOutput += data.toString();
});

checkPkgs.on('close', (code) => {
  const packages = {
    'faiss': false,
    'sentence-transformers': false,
    'pdfplumber': false,
    'python-pptx': false,
  };

  for (const pkg of Object.keys(packages)) {
    packages[pkg] = pipOutput.toLowerCase().includes(pkg.toLowerCase());
  }

  const pkgStatus = {
    faiss: check('FAISS package', packages.faiss),
    transformers: check('sentence-transformers', packages['sentence-transformers']),
    pdfplumber: check('pdfplumber', packages.pdfplumber),
    pptx: check('python-pptx', packages['python-pptx']),
  };

  const ingestReady = ingestScriptFound && pythonFound && 
                      pkgStatus.faiss && pkgStatus.transformers && 
                      pkgStatus.pdfplumber && pkgStatus.pptx;
  
  console.log(`\n  ${ingestReady ? colors.green : colors.red}Status: ${ingestReady ? 'READY ✓' : 'NOT READY ✗'}${colors.reset}`);

  // ===== OVERALL SUMMARY =====
  section('📊 OVERALL PHASE 1 PIPELINE STATUS');

  const allReady = extractionReady && ingestReady;

  console.log(`\n  Extraction:   ${extractionReady ? colors.green + '✓ READY' : colors.red + '✗ BLOCKED'}${colors.reset}`);
  console.log(`  OCR:          ${ocrReady ? colors.green + '✓ ENABLED' : colors.yellow + '⚠ OPTIONAL'}${colors.reset}`);
  console.log(`  Ingestion:    ${ingestReady ? colors.green + '✓ READY' : colors.red + '✗ BLOCKED'}${colors.reset}`);

  console.log('\n' + '═'.repeat(80));
  if (allReady) {
    console.log(`${colors.green}✅ PHASE 1 PIPELINE READY FOR PRODUCTION${colors.reset}`);
  } else {
    console.log(`${colors.red}❌ PHASE 1 PIPELINE INCOMPLETE - Fix issues above${colors.reset}`);
  }
  console.log('═'.repeat(80) + '\n');

  // ===== QUICK FIX GUIDE =====
  if (!allReady) {
    console.log(`\n${colors.yellow}🔧 QUICK FIX GUIDE:${colors.reset}\n`);

    if (!pythonFound) {
      console.log('  Python Environment Missing:');
      console.log('    1. Create venv: python -m venv .venv-1');
      console.log('    2. Activate: .venv-1\\Scripts\\activate');
      console.log('    3. Install: pip install -r backend/rag_marking/requirements.txt');
    }

    if (!scriptFound) {
      console.log('\n  Extraction Script Missing:');
      console.log(`    Expected: ${extractScriptPath}`);
    }

    if (!ingestScriptFound) {
      console.log('\n  Ingestion Script Missing:');
      console.log(`    Expected: ${ingestScriptPath}`);
    }

    if (!pkgStatus.faiss || !pkgStatus.transformers || !pkgStatus.pdfplumber || !pkgStatus.pptx) {
      console.log('\n  Missing Python Packages:');
      console.log('    1. Activate venv: .venv-1\\Scripts\\activate');
      console.log('    2. Install: pip install -r backend/rag_marking/requirements.txt');
      console.log('    3. Restart: npm run dev');
      
      if (!packages.pdfplumber) {
        console.log('\n  Specifically, pdfplumber is missing:');
        console.log('    pip install pdfplumber');
      }
    }
  }

  console.log('');
});
