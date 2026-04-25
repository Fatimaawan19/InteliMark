/**
 * COMMAND REFERENCE: How to Query FAISS Vector Database
 * 
 * This file shows you all the ways to check chunks in your vector DB
 * Copy and run these commands yourself to learn!
 */

// ============================================================================
// 🔍 QUICK ANSWER
// ============================================================================
// Current chunks in vector DB: 20 chunks
// (From the FAISS index at: backend/rag_marking/faiss_index/course_materials.index)

// ============================================================================
// 📚 COMMAND REFERENCE - COPY & PASTE TO LEARN
// ============================================================================

/*

COMMAND 1️⃣  - Quick One-Liner (Fastest)
═══════════════════════════════════════════════════════════════════════════════

cd backend/rag_marking && python -c "from faiss_vector_store import FAISSVectorStore; store = FAISSVectorStore(); print(f'Total chunks: {store.index.ntotal}')"

✅ What it does:
   • Loads the FAISS vector store
   • Calls store.index.ntotal (returns total vectors in index)
   • Prints the result
   
📊 Output example: Total chunks: 20


COMMAND 2️⃣  - Using Metadata (Alternative)
═══════════════════════════════════════════════════════════════════════════════

cd backend/rag_marking && python -c "from faiss_vector_store import FAISSVectorStore; store = FAISSVectorStore(); print(f'Chunks from metadata: {len(store.metadata)}')"

✅ What it does:
   • Same as above but using len(store.metadata)
   • Both methods return the same count
   
📊 Output example: Chunks from metadata: 20


COMMAND 3️⃣  - Check File Size & Info
═══════════════════════════════════════════════════════════════════════════════

# Windows PowerShell:
$file = "C:\Users\Nazim\Desktop\InteliMark\backend\rag_marking\faiss_index\course_materials.index"
(Get-Item $file).Length / 1KB  # Get size in KB
(Get-Item $file).LastWriteTime  # See when it was last updated

✅ What it does:
   • Shows file size (bigger = more chunks stored)
   • Shows last modification time
   
📊 Output example: 
   30.04 KB
   Friday, April 18, 2026 10:59:35 PM


COMMAND 4️⃣  - Interactive Python Shell
═══════════════════════════════════════════════════════════════════════════════

cd backend/rag_marking
python

# Then in the Python shell, run these commands:
from faiss_vector_store import FAISSVectorStore
store = FAISSVectorStore()

# Get chunk count
print(f"Total chunks: {store.index.ntotal}")

# See metadata about chunks
print(f"Metadata records: {len(store.metadata)}")

# Check embedding dimension
print(f"Embedding dimension: {store.index.d}")

# Look at first 3 chunks
for i, meta in enumerate(store.metadata[:3]):
    print(f"Chunk {i}: {meta}")

# Exit: type 'exit()' or Ctrl+Z

✅ What it does:
   • Lets you explore the vector DB interactively
   • See detailed metadata for each chunk
   • Understand the structure


COMMAND 5️⃣  - MongoDB Alternative (See Material Breakdown)
═══════════════════════════════════════════════════════════════════════════════

# From backend directory:
node learn-query-chunks.js

# Or manually via MongoDB shell:
mongosh

# In MongoDB shell:
use fyp_db
db.coursematerialraws.aggregate([
  { $match: { faissIngestionStatus: "completed" } },
  { $group: { _id: null, totalChunks: { $sum: "$numChunks" }, totalMaterials: { $sum: 1 } } }
])

✅ What it does:
   • Shows chunks grouped by material
   • Lets you see which materials contributed how many chunks
   • Good for debugging ingestion


═══════════════════════════════════════════════════════════════════════════════
*/

// ============================================================================
// 📖 EXPLANATION OF CONCEPTS (LEARN THIS!)
// ============================================================================

/*

1. WHAT IS A "CHUNK"?
   ─────────────────
   • A chunk is a piece of text (usually ~400 characters)
   • Long documents are split into multiple chunks
   • Each chunk gets embedded (converted to a vector)
   • Example:
     - Document: "Introduction to machine learning... [5000 chars total]"
     - After chunking: 2 chunks of ~400 chars each
     - Each chunk gets an embedding (384-dimensional vector)


2. WHAT IS AN EMBEDDING?
   ─────────────────────
   • A vector representation of text (numbers, not words)
   • 384 dimensions = 384 numbers per chunk
   • Can find similar chunks using math (distance between vectors)
   • Used for semantic search: "Find chunks similar to this query"


3. WHAT IS FAISS?
   ──────────────
   • Facebook AI Similarity Search
   • Local vector database (runs on your computer)
   • Stores embeddings + can search them FAST
   • File: backend/rag_marking/faiss_index/course_materials.index
   • No API key needed, no cloud dependency


4. HOW ARE CHUNKS TRACKED?
   ──────────────────────
   Location 1: FAISS Index File
      └─ Contains actual vectors + chunk IDs
   
   Location 2: MongoDB (CourseMaterialRaw)
      └─ Contains numChunks field per material
      └─ Can sum these to get total (should match FAISS)


5. THE WORKFLOW:
   ──────────────
   
   Step 1: Extract text from PDF/PPT
           └─ Result: rawText in MongoDB
   
   Step 2: Split into chunks (~400 chars)
           └─ Result: List of chunk texts
           └─ Stored in: numChunks field
   
   Step 3: Generate embeddings
           └─ Result: 384-dim vectors per chunk
           └─ Stored in: numEmbeddings field
   
   Step 4: Store in FAISS
           └─ Result: Fast semantic search ready
           └─ Stored in: faiss_index/course_materials.index
   
   Step 5: When user asks question
           └─ Query embedding generated
           └─ Find similar chunks using FAISS
           └─ Return relevant chunks to LLM


═════════════════════════════════════════════════════════════════════════════════
*/

// ============================================================================
// 📊 CURRENT STATUS (from your system)
// ============================================================================

/*

FAISS VECTOR DATABASE STATUS:
────────────────────────────────────────────────────────────────────────────────
✅ Total chunks stored:              20 chunks
✅ Index file size:                  30.04 KB
✅ Embedding dimension:              384 (sentence-transformers/all-MiniLM-L6-v2)
✅ Average size per chunk:           1,538 bytes (~1.5 KB per chunk)
✅ Last updated:                     April 18, 2026, 10:59:35 PM

MONGODB INGESTION STATUS:
────────────────────────────────────────────────────────────────────────────────
📍 Materials with status="completed":  10 materials
📍 Total chunks (numChunks sum):       0 (old records, need re-ingestion)
📍 New fields added:                   ✅ numChunks, numEmbeddings


RECOMMENDATION:
────────────────────────────────────────────────────────────────────────────────
• Re-ingest remaining materials to populate numChunks/numEmbeddings
• Current FAISS index has 20 chunks from initial ingestion
• After re-ingestion, MongoDB will match FAISS count

═════════════════════════════════════════════════════════════════════════════════
*/

console.log(`

╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║  📚 COMMAND REFERENCE: Query Vector Database                              ║
║                                                                            ║
║  Current Status: 20 chunks in FAISS                                       ║
║                                                                            ║
║  Copy any command above and run it yourself to learn!                     ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝

`);
