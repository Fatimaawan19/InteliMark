# RAG Ingestion Pipeline Guide

## Overview

The RAG pipeline processes course materials uploaded by teachers and makes them searchable with semantic search.

```
Raw PDF/Document
    ↓
[Extract Text] (PyMuPDF/pdfplumber)
    ↓
Save to MongoDB (CourseMaterialRaw)
    ↓
[Ingest to FAISS] (Local Vector DB)
  - Chunk text (400 words, 50-word overlap)
  - Generate embeddings (sentence-transformers)
  - Store in FAISS for semantic search
    ↓
Enable semantic search for student queries
```

## Architecture

### Components

1. **Extraction Layer** (`backend/rag_marking/extract_course_material_text.py`)
   - Runs when a teacher uploads material
   - Extracts text from PDFs
   - Saves raw text and metadata to MongoDB

2. **Ingestion Pipeline** (`backend/rag_marking/ingest_materials_to_faiss.py`)
   - Orchestrates chunking, embedding, and storage
   - Runs on-demand or after extraction
   - Updates MongoDB with ingestion status
   - Uses `FAISSVectorStore`

3. **Python RAG Modules**
   - `chunking.py`: Splits text into overlapping chunks
   - `embeddings.py`: Generates vectors using sentence-transformers
   - `faiss_vector_store.py`: Local FAISS wrapper with metadata persistence
   - `fallback_embeddings.py`: API-based embeddings fallback

4. **Node.js Integration** (`backend/utils/ingestionService.js`)
   - Spawns the Python ingestion process
   - Handles stderr/stdout logging
   - Bridges the Node backend with the Python pipeline

### Storage

- **MongoDB Collections**
  - `CourseMaterial`: Metadata about uploaded materials
  - `CourseMaterialRaw`: Raw extracted text + extraction status

- **FAISS (Local Vector Database)**
  - Local, fast vector storage
  - Contains text chunks with embeddings and metadata
  - Indexed by chunk id, material id, and semantic similarity
  - Stored on disk alongside metadata for persistence

## Usage

### Command Line (Direct Python)

```bash
cd backend/rag_marking

# Activate environment
.\.venv311\Scripts\activate

# Run ingestion for all unprocessed materials
python ingest_materials_to_faiss.py

# Run ingestion for a specific course
python ingest_materials_to_faiss.py --course-id <MONGO_OBJECT_ID>

# Run ingestion with a limit (for quick tests)
python ingest_materials_to_faiss.py --limit 5
```

### From Node.js Backend

```javascript
const { ingestMaterials, ingestCourseAfterUpload } = require('./utils/ingestionService');

try {
  const result = await ingestMaterials();
  console.log(`Processed ${result.processed} materials`);
} catch (error) {
  console.error('Ingestion failed:', error.message);
}

app.post('/api/courses/:courseId/upload-material', async (req, res) => {
  try {
    const ingestResult = await ingestCourseAfterUpload(courseId);
    res.json({
      uploadSuccess: true,
      ingestionStatus: ingestResult,
    });
  } catch (error) {
    console.warn('Ingestion queued but may have failed:', error.message);
    res.json({ uploadSuccess: true, ingestionWarning: error.message });
  }
});
```

## Configuration

### Python Environment

Required packages:

```
PyMuPDF==1.25.3
pdfplumber==0.11.5
sentence-transformers==3.4.1
faiss-cpu
pymongo>=3.12.0
pytesseract>=0.3.10
```

Setup:

```bash
cd backend/rag_marking
python -m venv .venv311
.\.venv311\Scripts\pip install -r requirements.txt
```

### MongoDB Connection

Environment variable:

```
MONGODB_URI=mongodb://localhost:27017/InteliMark
```

Defaults to localhost if not set.

### OCR (Tesseract) Configuration

OCR is optional and helps when slides contain text inside images or screenshots.

1. Install Tesseract OCR binary on Windows.
2. Set backend env vars:
   - `RAG_ENABLE_OCR=true`
   - `TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe`
   - Optional: `TESSDATA_PREFIX=C:\Program Files\Tesseract-OCR\tessdata`
3. Restart the backend.

Per-upload override is supported in the upload request body:

- `enableOcr=true`

Upload response includes OCR diagnostics:

- `ocrEnabled` (boolean)
- `ocrStatus` (`disabled`, `ready`, `unavailable`)
- `ocrError` (non-empty when unavailable)

### FAISS Persistence

Vector database stored at:

```
backend/rag_marking/faiss_index/
```

This directory is persistent across backend restarts.

## Monitoring & Troubleshooting

### Check Status

```bash
# Verify all packages are installed
cd backend/rag_marking
.\.venv311\Scripts\python -c "import faiss, sentence_transformers; print('OK')"

# Check FAISS connection
.\.venv311\Scripts\python -c "from faiss_vector_store import FAISSVectorStore; v = FAISSVectorStore(); print(f'Total vectors: {v.index.ntotal}')"

# Check MongoDB connection
.\.venv311\Scripts\python -c "from pymongo import MongoClient; c = MongoClient(); print(f'Connected: {c.server_info()}')"
```

### Logs

- **Python ingestion logs**: Printed to console and captured by the Node process
- **MongoDB updates**: `CourseMaterialRaw.faissIngestionStatus` and related FAISS fields
- **FAISS persistence**: `backend/rag_marking/faiss_index/` directory

### Common Issues

1. **"Module not found" errors**
   - Verify Python 3.11 venv is active
   - Run: `.\.venv311\Scripts\pip install -r requirements.txt`

2. **"No space left on device"**
   - Related to disk space during package install
   - Clean temp: `Remove-Item $env:TEMP\* -Recurse -Force`
   - Clear pip cache: `.\.venv311\Scripts\pip cache purge`

3. **MongoDB connection fails**
   - Verify MongoDB is running: `netstat -ano | findstr :27017`
   - Check the connection string in backend `.env` or code

4. **FAISS index not found after restart**
   - Check that `backend/rag_marking/faiss_index/` exists
   - Verify the index and metadata files are present

5. **OCR unavailable / Tesseract not found**
   - Install Tesseract binary (Python package alone is not enough)
   - Verify the path in `TESSERACT_CMD`
   - Check from PowerShell:
     - `& "C:\Program Files\Tesseract-OCR\tesseract.exe" --version`

## Next Steps

### Immediate (Ready Now)

1. **Test ingestion** with sample materials:
   ```bash
   python ingest_materials_to_faiss.py --limit 1
   ```

2. **Build retrieval endpoint** to query the vector store:
   ```python
   from faiss_vector_store import FAISSVectorStore

   store = FAISSVectorStore()
   results = store.query("machine learning", top_k=5)
   ```

3. **Integrate into the student query workflow**:
   - When a student asks a question, retrieve related materials
   - Use the retrieved context in the chatbot prompt

### Future Enhancements

- Real-time ingestion status dashboard
- Batch ingestion scheduler (daily/weekly)
- Support for different document formats (DOCX, PPT)
- Fine-tuned embedding models for domain-specific accuracy
- Incremental updates for only new materials

## Testing

### Manual Test with Sample Material

```python
from bson import ObjectId
from pymongo import MongoClient

base_db = MongoClient()["InteliMark"]
base_db.CourseMaterialRaw.insert_one({
    "courseId": ObjectId("..."),
    "rawText": "This is sample course content about machine learning...",
    "extractionStatus": "success",
    "mimeType": "application/pdf",
})

# Run ingestion
python ingest_materials_to_faiss.py --limit 1

# Query results
from faiss_vector_store import FAISSVectorStore
store = FAISSVectorStore()
results = store.query("machine learning", top_k=3)
print(results)
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Teacher Dashboard                       │
│              (Upload Course Material)                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │ Backend Upload Route  │
         │ (courseRoutes.js)     │
         └───────┬───────────────┘
                 │
                 ▼
    ┌────────────────────────────┐
    │ Save to uploads folder     │
    │ Create CourseMaterial      │
    └────────┬───────────────────┘
             │
             ▼
    ┌────────────────────────────┐
    │ Extract Text (PyMuPDF)     │
    │ Save to CourseMaterialRaw  │
    └────────┬───────────────────┘
             │
             ▼
    ┌────────────────────────────┐
    │ Ingestion Pipeline         │
    │ (ingest_materials_to_faiss.py) │
    ├────────────────────────────┤
    │ • Chunk text (400 words)   │
    │ • Generate embeddings      │
    │ • Upsert to FAISS          │
    │ • Update Mongo status      │
    └────────┬───────────────────┘
             │
             ▼
    ┌────────────────────────────┐
    │ Persistent FAISS Store     │
    │ (faiss_index/)             │
    └────────────────────────────┘
             ▲
             │
    ┌────────┴───────────────────┐
    │ Student Query Workflow     │
    │ • Embed question           │
    │ • Query FAISS              │
    │ • Return top K results     │
    │ • Feed to chatbot prompt   │
    └────────────────────────────┘
```
