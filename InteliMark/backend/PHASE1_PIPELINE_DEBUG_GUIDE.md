# Phase 1 Pipeline - Debugging Guide

## Overview

The Phase 1 pipeline consists of 3 stages:
1. **Extraction** - Extract text from PDF/PPTX files
2. **OCR** (Optional) - Extract text from images using Tesseract
3. **Ingestion** - Generate embeddings and index to FAISS

This guide helps debug when materials fail to process.

---

## Quick Diagnostics

### Check Environment Status
```bash
node backend/verify-phase1-environment.js
```

This will verify:
- ✓ Python venv exists and is accessible
- ✓ Extraction script is present
- ✓ Tesseract OCR is installed (optional)
- ✓ FAISS and required packages are installed
- ✓ Ingestion script is present

### Test Extraction with Sample File
```bash
node backend/debug-phase1-pipeline.js backend/uploads/course_materials_upload/your-file.pdf
```

This will:
1. Validate environment
2. Test text extraction
3. Show extracted content preview
4. Report OCR results if enabled
5. Check ingestion readiness

---

## Common Issues & Fixes

### Issue 1: "Python executable not found"

**Symptoms:**
- Upload fails with "Extraction environment not ready"
- Logs show: `pythonFound: false`

**Causes:**
- `.venv-1` not created
- Python executable path is wrong
- Environment variables not set

**Fixes:**
```bash
# 1. Create virtual environment
python -m venv .venv-1

# 2. Activate it
.venv-1\Scripts\activate

# 3. Install dependencies
pip install -r backend/rag_marking/requirements.txt

# 4. Restart server
npm run dev
```

---

### Issue 2: "Extraction script missing"

**Symptoms:**
- Upload fails with "Extraction environment not ready"
- Logs show: `scriptExists: false`

**Causes:**
- File: `backend/rag_marking/extract_course_material_text.py` not found
- Wrong Python version (needs 3.8+)

**Fixes:**
```bash
# Verify file exists
ls backend/rag_marking/extract_course_material_text.py

# Check Python version
.venv-1\Scripts\python.exe --version  # Should be 3.8+
```

---

### Issue 3: "OCR not available" (but extraction works)

**Symptoms:**
- Material extracts successfully
- OCR fields are empty (ocr_count: 0, ocr_char_count: 0)
- Logs show: `⚠️ OCR ENVIRONMENT NOT READY`

**Causes:**
- Tesseract OCR not installed
- TESSDATA_PREFIX not set correctly

**Fixes:**
```bash
# 1. Download Tesseract installer from:
# https://github.com/UB-Mannheim/tesseract/wiki

# 2. Install to: C:\Program Files\Tesseract-OCR\

# 3. Set environment variable (permanent):
setx TESSERACT_CMD "C:\Program Files\Tesseract-OCR\tesseract.exe"

# 4. Verify installation
"C:\Program Files\Tesseract-OCR\tesseract.exe" --version

# 5. Restart node server
npm run dev
```

**Note:** Materials will extract without OCR. This is not a failure - just less text from images.

---

### Issue 4: "Ingestion environment not ready"

**Symptoms:**
- Material extracts successfully
- Ingestion doesn't start (faissIngestionStatus: "pending")
- Logs show: `⚠️ INGESTION ENVIRONMENT NOT READY`

**Causes:**
- Missing Python packages (FAISS, sentence-transformers)
- Wrong Python version
- MongoDB not accessible

**Fixes:**
```bash
# 1. Verify packages
.venv-1\Scripts\pip.exe list | findstr "faiss sentence"

# 2. If missing, install
.venv-1\Scripts\pip.exe install faiss-cpu sentence-transformers

# 3. Or reinstall all
pip install -r backend/rag_marking/requirements.txt

# 4. Restart server
npm run dev
```

---

### Issue 5: Material uploads but nothing extracts

**Symptoms:**
- Upload response shows success
- CourseMaterial created
- CourseMaterialRaw.extractionStatus stays "pending"
- No errors in logs

**Causes:**
- Python script runs but crashes silently
- Output is not captured properly
- Dependencies missing or incompatible

**Fixes:**
```bash
# 1. Test extraction directly
node backend/debug-phase1-pipeline.js backend/uploads/course_materials_upload/test.pdf

# 2. Check stderr carefully
# Look for import errors, missing packages, etc.

# 3. Verify Python can import modules
.venv-1\Scripts\python.exe -c "import faiss; import sentence_transformers; import pdfplumber; import pptx"

# 4. If imports fail, reinstall
pip install --upgrade faiss-cpu sentence-transformers pdfplumber python-pptx
```

---

## Environment Variables

Add these to your `.env` file to customize behavior:

```bash
# Python executable (usually auto-detected)
PYTHON_BIN=C:\Path\To\.venv-1\Scripts\python.exe

# OCR Settings
RAG_ENABLE_OCR=true
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
TESSDATA_PREFIX=C:\Program Files\Tesseract-OCR\tessdata

# Embedding Model
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_BATCH_SIZE=32

# Debug Logging
DEBUG_INGESTION=true
```

---

## Testing Workflow

### 1. Start Fresh
```bash
# Clear environment
rm -r .venv-1

# Recreate from scratch
python -m venv .venv-1
.venv-1\Scripts\activate
pip install -r backend/rag_marking/requirements.txt
```

### 2. Verify Environment
```bash
node backend/verify-phase1-environment.js
```

Expected output:
```
✓ Python venv executable
✓ Extraction script exists
✓ Tesseract OCR installed
✓ FAISS package
✓ sentence-transformers
✓ pdfplumber
✓ python-pptx
✓ Ingestion script exists

✅ PHASE 1 PIPELINE READY FOR PRODUCTION
```

### 3. Test Extraction
```bash
node backend/debug-phase1-pipeline.js backend/uploads/course_materials_upload/test.pdf
```

Expected output:
```
✅ EXTRACTION SUCCESSFUL

Results:
  ├─ Pages: 5
  ├─ Characters: 2543
  ├─ Visual elements: 8
  ├─ Equations: 2
  ├─ Extractor: pdfplumber
  ├─ OCR Status: completed
  ├─ OCR Count: 3
  └─ OCR Chars: 450

✅ Ingestion environment is ready
```

### 4. Test Upload
```bash
# Use frontend or curl
curl -X POST http://localhost:5000/api/courses/upload-material \
  -F "file=@test.pdf" \
  -F "teacherId=your-id" \
  -F "courseCode=CS101"
```

Check logs for:
- ✅ Step 1: Course found
- ✅ Step 2: CourseMaterial created
- ✅ Step 3: CourseMaterialRaw created
- ✅ Step 4: Extraction running
- ✅ Step 5: Ingestion queued
- ✅ Both records updated with results

---

## Reading Logs

### Successful Upload
```
[INFO] 🔍 Step 4: EXTRACTION - Starting text extraction
[PY] [INFO] Starting extraction...
[PY] [INFO] Found 5 pages, 2543 characters
[SUCCESS] ✅ TEXT EXTRACTION COMPLETED
[INFO] 💾 Saved extraction metadata to MongoDB
[INFO] 🧠 Step 5: INGESTION - Starting background ingestion
[SUCCESS] ✅ BACKGROUND INGESTION COMPLETED
```

### Failed Extraction
```
[ERROR] ❌ EXTRACTION ENVIRONMENT NOT READY
  pythonFound: false
  scriptExists: true
  pythonPath: C:\..\.venv-1\Scripts\python.exe
```

### OCR Disabled (Not Critical)
```
[WARN] ⚠️ OCR ENVIRONMENT NOT READY - Disabling OCR
  tesseractPath: (not found)
[WARN] To enable OCR: Install Tesseract-OCR...
[INFO] Calling extractTextFromMaterial...
[SUCCESS] ✅ TEXT EXTRACTION COMPLETED (without OCR)
```

### Ingestion Skipped (Not Critical)
```
[SUCCESS] ✅ TEXT EXTRACTION COMPLETED
[WARN] ⚠️ INGESTION ENVIRONMENT NOT READY
[WARN] To enable ingestion: Verify Python 3.11 venv...
[INFO] Material extracted but ingestion skipped
```

---

## Manual Ingestion

If extraction succeeds but ingestion is skipped, you can run it manually:

```bash
# Activate venv
.venv-1\Scripts\activate

# Ingest all pending materials
python backend/rag_marking/ingest_materials_to_faiss.py

# Or ingest specific material
python backend/rag_marking/ingest_materials_to_faiss.py --material-id <mongo-id>

# Or ingest specific course
python backend/rag_marking/ingest_materials_to_faiss.py --course-id <course-id>
```

---

## Getting Help

When reporting issues, include:

1. **Environment Check Output**
   ```bash
   node backend/verify-phase1-environment.js > env-check.log
   ```

2. **Debug Pipeline Output**
   ```bash
   node backend/debug-phase1-pipeline.js test-file.pdf > debug-output.log
   ```

3. **Server Logs**
   - Check terminal where `npm run dev` is running
   - Look for [ERROR], [WARN], [PHASE1-*] lines

4. **Database Check**
   ```bash
   # Query MongoDB for the uploaded material
   db.coursematerials.find({originalFileName: /test-file/})
   db.coursematerialraws.find({materialId: ObjectId("...")})
   ```

---

## Performance Notes

### Extraction Time
- Small PDF (< 5 pages): 2-5 seconds
- Large PDF (50+ pages): 10-30 seconds
- With OCR enabled: 2-5x slower

### Ingestion Time
- 100 chunks: 5-10 seconds
- 1000 chunks: 30-60 seconds
- Embedding model download (first time): 2-3 minutes

### Memory Usage
- Python extraction: 100-200 MB
- FAISS ingestion: 300-500 MB with models loaded
- Full pipeline: 500-800 MB

If running low on memory, consider:
- Processing smaller batches
- Disabling OCR to save memory
- Increasing venv heap size

---

## Next Steps

After Phase 1 pipeline is working:
1. Upload materials to test course
2. Verify materials appear in MongoDB
3. Query FAISS index to test retrieval
4. Check frontend shows accurate material counts
5. Proceed to Phase 2 (LLM marking)
