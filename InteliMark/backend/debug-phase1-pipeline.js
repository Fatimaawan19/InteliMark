#!/usr/bin/env node
/**
 * Phase 1 Pipeline Debugging Script
 * 
 * Tests each stage of the Phase 1 pipeline:
 * 1. Environment readiness
 * 2. Extraction function
 * 3. OCR configuration
 * 4. Ingestion readiness
 * 
 * Usage: node debug-phase1-pipeline.js <path-to-pdf-or-pptx>
 */

const path = require('path');
const fs = require('fs');
const { extractTextFromMaterial, isExtractionReady, isOcrReady, getExtractionEnvironmentStatus } = require('./utils/materialExtractor');
const { isIngestionReady } = require('./utils/ingestionService');

const args = process.argv.slice(2);
const testFilePath = args[0];

console.log('\n' + '═'.repeat(80));
console.log('🧪 PHASE 1 PIPELINE DEBUG TEST');
console.log('═'.repeat(80) + '\n');

// ===== STAGE 1: ENVIRONMENT VALIDATION =====
console.log('📋 STAGE 1: Environment Validation');
console.log('─'.repeat(60));

const extractionReady = isExtractionReady();
const ocrReady = isOcrReady();
const ingestionReady = isIngestionReady();
const envStatus = getExtractionEnvironmentStatus();

console.log(`✓ Extraction Ready: ${extractionReady}`);
console.log(`  ├─ Python: ${envStatus.extraction.pythonFound ? '✓' : '✗'} ${envStatus.extraction.pythonPath}`);
console.log(`  └─ Script: ${envStatus.extraction.scriptExists ? '✓' : '✗'} ${envStatus.extraction.scriptPath}`);

console.log(`✓ OCR Ready: ${ocrReady ? 'YES' : 'NO (optional)'}`);
if (ocrReady) {
  console.log(`  └─ Tesseract: ${envStatus.ocr.tesseractPath}`);
}

console.log(`✓ Ingestion Ready: ${ingestionReady}`);

if (!extractionReady) {
  console.log('\n❌ Extraction environment not ready. Aborting.');
  process.exit(1);
}

// ===== STAGE 2: FILE VALIDATION =====
console.log('\n\n📋 STAGE 2: File Validation');
console.log('─'.repeat(60));

if (!testFilePath) {
  console.log('Usage: node debug-phase1-pipeline.js <path-to-pdf-or-pptx>');
  console.log('\nNo test file provided. Running environment-only test.\n');
  process.exit(0);
}

if (!fs.existsSync(testFilePath)) {
  console.log(`❌ File not found: ${testFilePath}`);
  process.exit(1);
}

const fileStats = fs.statSync(testFilePath);
const mimeType = testFilePath.toLowerCase().endsWith('.pdf') ? 
                 'application/pdf' : 
                 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

console.log(`✓ File: ${path.basename(testFilePath)}`);
console.log(`  ├─ Size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);
console.log(`  └─ Type: ${mimeType}`);

// ===== STAGE 3: EXTRACTION TEST =====
console.log('\n\n📋 STAGE 3: Extraction Test');
console.log('─'.repeat(60));

const enableOcr = ocrReady; // Use OCR if available

console.log(`Testing extraction with OCR ${enableOcr ? 'ENABLED' : 'DISABLED'}...`);
console.log('');

extractTextFromMaterial(testFilePath, { enableOcr })
  .then((result) => {
    console.log('\n✅ EXTRACTION SUCCESSFUL\n');
    console.log('Results:');
    console.log(`  ├─ Pages: ${result.page_count}`);
    console.log(`  ├─ Characters: ${result.char_count}`);
    console.log(`  ├─ Visual elements: ${result.visual_count}`);
    console.log(`  ├─ Equations: ${result.equation_count || 0}`);
    console.log(`  ├─ Extractor: ${result.extractor}`);
    
    if (enableOcr) {
      console.log(`  ├─ OCR Status: ${result.ocr_status || 'completed'}`);
      console.log(`  ├─ OCR Count: ${result.ocr_count || 0}`);
      console.log(`  └─ OCR Chars: ${result.ocr_char_count || 0}`);
    }
    
    console.log('\n📊 Sample Extracted Text (first 500 chars):');
    console.log('─'.repeat(60));
    console.log(result.text.substring(0, 500) + '...');
    console.log('─'.repeat(60));
    
    // ===== STAGE 4: INGESTION READINESS =====
    console.log('\n\n📋 STAGE 4: Ingestion Readiness');
    console.log('─'.repeat(60));
    
    if (ingestionReady) {
      console.log('✅ Ingestion environment is ready');
      console.log('   Material can be automatically embedded after upload');
    } else {
      console.log('⚠️  Ingestion environment not ready');
      console.log('   Material will extract but NOT embed to FAISS');
      console.log('   Run manual ingestion after fixing environment');
    }
    
    console.log('\n' + '═'.repeat(80));
    console.log('✅ PHASE 1 EXTRACTION PIPELINE WORKING');
    console.log('═'.repeat(80) + '\n');
  })
  .catch((err) => {
    console.log('\n❌ EXTRACTION FAILED\n');
    console.log('Error:', err.message);
    
    if (err.reason) {
      console.log('Reason:', err.reason);
    }
    
    if (err.stderr) {
      console.log('\nStderr:');
      console.log(err.stderr.substring(0, 500));
    }
    
    if (err.runtime) {
      console.log('\nRuntime Context:');
      console.log(JSON.stringify(err.runtime, null, 2));
    }
    
    console.log('\n' + '═'.repeat(80));
    console.log('❌ PHASE 1 EXTRACTION PIPELINE BROKEN');
    console.log('═'.repeat(80) + '\n');
    
    process.exit(1);
  });
