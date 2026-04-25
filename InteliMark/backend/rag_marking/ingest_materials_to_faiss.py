"""Ingest raw course materials from MongoDB into FAISS vector store.

This script:
1. Connects to MongoDB and reads CourseMaterialRaw documents
2. Chunks the extracted text for each material
3. Generates embeddings for each chunk
4. Stores chunks + embeddings + metadata in FAISS for semantic search

Vector Database: FAISS (local, fast, no API key needed)
Embeddings: Sentence Transformers (PyTorch CPU-only on Windows)

Usage:
    python ingest_materials_to_faiss.py
    # or with options:
    python ingest_materials_to_faiss.py --course-id <mongoObjectId>

No API keys required - everything runs locally!
"""

import argparse
import hashlib
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse
from typing import Any, Optional

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from chunking import chunk_text
from faiss_vector_store import FAISSVectorStore, generate_slide_id, generate_content_hash

# LangChain imports
from langchain_core.documents import Document


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


# ============================================================================
# Smart Embedding Loading with Fallback Strategy
# ============================================================================

def get_embedding_function():
    """Get the best embedding function - local PyTorch or API fallback.
    
    Returns:
        Function with signature: func(texts: List[str]) -> List[List[float]]
    
    Raises:
        RuntimeError: If neither local nor fallback embeddings work
    """
    logger.info("[INGEST] ════════════════════════════════════════════")
    logger.info("[INGEST] Initializing embedding engine")
    logger.info("[INGEST] ════════════════════════════════════════════")
    
    # First, try to import local embeddings
    try:
        logger.info("[INGEST] ➤ Attempting to load local PyTorch embeddings...")
        from embeddings import embed_texts
        logger.info("[INGEST] ✓ Local embeddings imported")
        
        # Quick sanity test
        logger.info("[INGEST] ➤ Running quick embedding test (1 text)...")
        test = embed_texts(["test"], batch_size=1)
        if test and isinstance(test[0], list) and len(test[0]) > 0:
            logger.info(f"[INGEST] ✓ Local embeddings working! Vector size: {len(test[0])}")
            return embed_texts
        else:
            raise RuntimeError("Test embeddings returned invalid format")
            
    except Exception as e:
        logger.error(f"[INGEST] ✗ Local embeddings failed: {type(e).__name__}: {e}")
        logger.warning("[INGEST] ⚠️  This is likely exit code 3221225477 (memory violation)")
        
        # Try fallback
        try:
            logger.info("[INGEST]")
            logger.info("[INGEST] ════════════════════════════════════════════")
            logger.info("[INGEST] Attempting fallback: API-based embeddings")
            logger.info("[INGEST] ════════════════════════════════════════════")
            
            from fallback_embeddings import embed_texts_via_api  # type: ignore[import-not-found]
            logger.info("[INGEST] ➤ Testing API embeddings...")
            
            test = embed_texts_via_api(["test"])
            if test and isinstance(test[0], list):
                logger.warning("[INGEST] ⚠️  Using HF Inference API (slower, but working)")
                logger.warning("[INGEST] Make sure HF_API_TOKEN environment variable is set")
                return embed_texts_via_api
            else:
                raise RuntimeError("API test returned invalid format")
                
        except Exception as api_error:
            logger.error(f"[INGEST] ✗ API fallback also failed: {api_error}")
            logger.error("[INGEST]")
            logger.error("[INGEST] SOLUTIONS:")
            logger.error("[INGEST]   1. Run setup script: python setup_pytorch_windows.py")
            logger.error("[INGEST]   2. Check log messages for specific PyTorch errors")
            logger.error("[INGEST]   3. Try older sentence-transformers: pip install sentence-transformers==3.1.0")
            logger.error("[INGEST]   4. Use API fallback: export HF_API_TOKEN=hf_...")
            logger.error("[INGEST]")
            raise RuntimeError("Both local and API embeddings failed. See logs above.") from e


def get_collection(db, primary_name: str, fallbacks: list[str]):
    """Resolve an existing Mongo collection name with safe fallbacks."""
    names = set(db.list_collection_names())
    ordered_names = [primary_name, *fallbacks]
    existing = [name for name in ordered_names if name in names]

    # Prefer a collection that actually has documents.
    for name in existing:
        if db[name].estimated_document_count() > 0:
            return db[name]

    if existing:
        return db[existing[0]]

    # Fall back to the expected Mongoose default when collection list is empty.
    return db[fallbacks[0] if fallbacks else primary_name]


def get_mongodb_connection():
    """Create MongoDB connection from environment or defaults."""
    try:
        from pymongo import MongoClient  # type: ignore[import-not-found]
    except ImportError:
        logger.error("pymongo not installed. Install with: pip install pymongo")
        sys.exit(1)

    # Match backend behavior: backend/config/db.js uses MONGO_URI.
    # Fallback chain:
    # 1) MONGO_URI
    # 2) MONGODB_URI
    # 3) backend/.env value
    # 4) local default
    mongo_uri = os.environ.get("MONGO_URI") or os.environ.get("MONGODB_URI")

    if not mongo_uri:
        backend_env = Path(__file__).resolve().parent.parent / ".env"
        if backend_env.exists():
            for line in backend_env.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key in {"MONGO_URI", "MONGODB_URI"} and value:
                    mongo_uri = value
                    break

    if not mongo_uri:
        mongo_uri = "mongodb://localhost:27017/InteliMark"

    client = MongoClient(mongo_uri)

    # Use DB from URI when available (Atlas/local custom db), otherwise fallback.
    parsed = urlparse(mongo_uri)
    db_name_from_uri = parsed.path.lstrip("/") if parsed.path else ""
    db_name = db_name_from_uri or "InteliMark"
    db = client[db_name]

    logger.info(f"Using MongoDB database: {db_name}")
    return db


def ingest_course_materials(
    course_id: Optional[str] = None,
    material_id: Optional[str] = None,
    limit: Optional[int] = None,
):
    """Main ingestion pipeline.

    Args:
        course_id: Optional MongoDB ObjectId to filter by course
        limit: Optional limit on number of materials to process

    Returns:
        dict with status, processed count, skipped count, errors
    """
    logger.info("=" * 80)
    logger.info("[PHASE1-PY] Starting FAISS ingestion pipeline")
    logger.info("=" * 80)
    
    # Get embedding function (with fallback strategy)
    try:
        embed_texts = get_embedding_function()
    except Exception as e:
        logger.error(f"[PHASE1-PY] ✗ FATAL: Cannot initialize embeddings")
        logger.error(f"[PHASE1-PY]   {e}")
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "success": False,
            "error": str(e),
            "processed": 0,
            "skipped": 0,
            "errors": 1,
        }
    
    logger.info("[PHASE1-PY] Connecting to MongoDB...")
    db = get_mongodb_connection()
    
    logger.info("[PHASE1-PY] Initializing FAISS vector store...")
    logger.info("[PHASE1-PY] ═══════════════════════════════════════════════════════════")
    logger.info("[PHASE1-PY] SINGLE INDEX PATTERN")
    logger.info("[PHASE1-PY] ├─ if index_exists: vectorstore = FAISS.load_local(...)")
    logger.info("[PHASE1-PY] └─ else: vectorstore = FAISS.from_documents(...)")
    logger.info("[PHASE1-PY] ═══════════════════════════════════════════════════════════")
    vector_store = FAISSVectorStore()

    raw_collection = get_collection(
        db,
        primary_name="CourseMaterialRaw",
        fallbacks=["coursematerialraws"],
    )
    logger.info(f"[PHASE1-PY] Collection: {raw_collection.name}")

    # Keep FAISS synchronized with MongoDB by removing vectors that reference
    # material IDs no longer present in CourseMaterialRaw.
    try:
        valid_material_ids = {
            str(doc["_id"])
            for doc in raw_collection.find({}, {"_id": 1})
        }
        removed_orphans = vector_store.remove_orphan_vectors(valid_material_ids, save=True)
        logger.info(
            f"[PHASE1-PY] FAISS sync complete: removed {removed_orphans} orphan vectors"
        )
    except Exception as sync_error:
        logger.warning(f"[PHASE1-PY] ⚠️ FAISS sync skipped due to error: {sync_error}")

    # Query raw extracted materials
    # Accept both legacy and current statuses.
    query: dict[str, Any] = {"extractionStatus": {"$in": ["completed", "success"]}}

    if material_id:
        try:
            from bson import ObjectId  # type: ignore[import-not-found]

            query["_id"] = ObjectId(material_id)
            logger.info(f"[PHASE1-PY] Filtering by _id (ObjectId): {material_id}")
        except Exception as e:
            query["_id"] = material_id
            logger.info(
                f"[PHASE1-PY] Filtering by _id (string): {material_id} - conversion failed: {e}"
            )

    if course_id:
        # courseId in Mongo is typically an ObjectId. If conversion fails,
        # keep the raw value so string-based records still match.
        try:
            from bson import ObjectId  # type: ignore[import-not-found]

            query["courseId"] = ObjectId(course_id)
            logger.info(f"[PHASE1-PY] Filtering by course (ObjectId): {course_id}")
        except Exception as e:
            query["courseId"] = course_id
            logger.info(f"[PHASE1-PY] Filtering by course (string): {course_id} - conversion failed: {e}")

    logger.info(f"[PHASE1-PY] Query: {query}")
    raw_materials = raw_collection.find(query).limit(limit or 0)
    materials_list = list(raw_collection.find(query).limit(limit or 0))
    logger.info(f"[PHASE1-PY] Found {len(materials_list)} materials ready for ingestion")

    # Track WHY items were skipped so the Node layer can decide whether
    # "0 new chunks" is a real failure (empty text) or a benign skip (already ingested).
    skipped_reasons: dict[str, int] = {
        "empty_raw_text": 0,
        "chunker_returned_empty": 0,
        "global_duplicate": 0,
        "already_ingested": 0,
        "embedding_failed": 0,
        "faiss_add_failed": 0,
        "no_materials_found": 0,
    }
    
    if len(materials_list) == 0:
        logger.warning(f"[PHASE1-PY] ⚠️ NO MATERIALS FOUND!")
        logger.warning(f"[PHASE1-PY]   Query: {query}")
        logger.warning(f"[PHASE1-PY]   Checking what's in CourseMaterialRaw:")
        
        # Debug: show what's IN the collection
        all_materials = list(raw_collection.find({}).limit(5))
        total_count = raw_collection.count_documents({})
        logger.warning(f"[PHASE1-PY]   Total docs in collection: {total_count}")
        for doc in all_materials:
            logger.warning(f"[PHASE1-PY]     - ID: {doc.get('_id')}, extractionStatus: {doc.get('extractionStatus')}, courseId: {doc.get('courseId')}")
        skipped_reasons["no_materials_found"] += 1
    
    processed_count = 0
    skipped_count = 0
    errors_list = []
    total_chunks_created = 0
    total_embeddings_created = 0
    for idx, raw_doc in enumerate(materials_list, 1):
        try:
            material_start_time = datetime.utcnow()
            material_id = str(raw_doc["_id"])
            course_id_val = str(raw_doc.get("courseId", "unknown"))
            raw_text = raw_doc.get("rawText", "").strip()

            logger.info(f"\n[PHASE1-PY] [{idx}/{len(materials_list)}] Processing material {material_id}")
            logger.info(f"  Course: {course_id_val}")
            logger.info(f"  MIME Type: {raw_doc.get('mimeType', 'unknown')}")
            logger.info(f"  Raw text length: {len(raw_text)} chars")

            if not raw_text:
                logger.warning(f"[PHASE1-PY] ⚠️ Skipping material {material_id}: empty raw text")
                skipped_reasons["empty_raw_text"] += 1
                skipped_count += 1
                continue

            # Step 1: Chunk the text
            logger.info(f"[PHASE1-PY] ➤ Step 1: Chunking text (size=400, overlap=50)...")
            logger.info(f"[PHASE1-PY]   Raw text length: {len(raw_text)} chars / ~{len(raw_text.split())} words")
            
            chunks = chunk_text(raw_text, chunk_size=400, overlap=50)
            
            logger.info(f"[PHASE1-PY] ✓ Created {len(chunks)} chunks")
            if chunks:
                for i, chunk in enumerate(chunks[:2]):  # Log first 2 chunks as sample
                    logger.info(f"[PHASE1-PY]   Chunk {i}: {len(chunk)} chars, sample: '{chunk[:50]}...'")
            else:
                logger.warning(f"[PHASE1-PY] ⚠️ WARNING: chunk_text returned EMPTY LIST!")
                logger.warning(f"[PHASE1-PY]   Input text length: {len(raw_text)}")
                logger.warning(f"[PHASE1-PY]   Input words: {len(raw_text.split())}")

            if not chunks:
                logger.warning(f"[PHASE1-PY] ⚠️ No chunks created for material {material_id}")
                skipped_reasons["chunker_returned_empty"] += 1
                skipped_count += 1
                continue

            # ═══════════════════════════════════════════════════════════════════════════════
            # 🔑 GLOBAL DEDUPLICATION LOGIC: Prevent duplicate content across all uploads
            # ═══════════════════════════════════════════════════════════════════════════════
            logger.info(f"[PHASE1-PY] ───────────────────────────────────────────────────────")
            logger.info(f"[PHASE1-PY] GLOBAL DEDUPLICATION CHECK")
            logger.info(f"[PHASE1-PY] ───────────────────────────────────────────────────────")
            
            # Generate SHA256 hash of raw content
            content_hash = generate_content_hash(raw_text)
            logger.info(f"[PHASE1-PY] Content hash: {content_hash[:20]}...")
            
            # ✅ STEP 1: Check for existing hash GLOBALLY (any document, not just current)
            logger.info(f"[PHASE1-PY] ➤ Checking if content exists globally...")
            global_hash_match = raw_collection.find_one(
                {
                    "contentHash": content_hash,
                    "_id": {"$ne": raw_doc["_id"]},
                },
                {"_id": 1}
            )
            
            if global_hash_match:
                existing_id = str(global_hash_match["_id"])
                logger.info(f"[PHASE1-PY] ✓ GLOBAL HASH MATCH DETECTED!")
                logger.info(f"[PHASE1-PY] ─────────────────────────────────────────")
                logger.info(f"[PHASE1-PY] Content already exists in document: {existing_id}")
                logger.info(f"[PHASE1-PY] Current document ID: {material_id}")
                logger.info(f"[PHASE1-PY] Content hash: {content_hash[:20]}...")
                logger.info(f"[PHASE1-PY] ─────────────────────────────────────────")
                logger.info(f"[PHASE1-PY] 🔒 GLOBAL SKIP: Identical content already ingested")
                
                # Get the existing document to reference its chunk/embedding counts
                existing_full_doc = raw_collection.find_one({"contentHash": content_hash})
                ref_chunks = existing_full_doc.get("numChunks", 0) if existing_full_doc else 0
                ref_embeddings = existing_full_doc.get("numEmbeddings", 0) if existing_full_doc else 0
                
                # Mark this document as referencing the existing one
                raw_collection.update_one(
                    {"_id": raw_doc["_id"]},
                    {
                        "$set": {
                            "faissIngestionStatus": "global_duplicate",
                            "referencesDocumentId": existing_id,
                            "contentHash": content_hash,
                            "numChunks": ref_chunks,
                            "numEmbeddings": ref_embeddings,
                            "lastCheckedAt": datetime.utcnow(),
                        }
                    },
                )
                logger.info(f"[PHASE1-PY] ✓ Updated MongoDB to reference original: {existing_id}")
                
                skipped_count += 1
                skipped_reasons["global_duplicate"] += 1
                continue
            
            # ✅ STEP 2: Check for local hash change (same document, different content)
            existing_doc = raw_collection.find_one(
                {"_id": raw_doc["_id"]},
                {"contentHash": 1}
            )
            existing_hash = existing_doc.get("contentHash") if existing_doc else None
            
            if existing_hash == content_hash and existing_hash is not None:
                logger.info(f"[PHASE1-PY] ✓ LOCAL HASH MATCH: Content unchanged")
                logger.info(f"[PHASE1-PY] ─────────────────────────────────────────")
                logger.info(f"[PHASE1-PY] Hash: {existing_hash[:20]}...")
                logger.info(f"[PHASE1-PY] ─────────────────────────────────────────")
                logger.info(f"[PHASE1-PY] 🔒 SKIP: No changes since last ingestion")
                
                # Keep the existing chunk and embedding counts
                existing_chunks = existing_doc.get("numChunks", 0) if existing_doc else 0
                existing_embeddings = existing_doc.get("numEmbeddings", 0) if existing_doc else 0
                logger.info(f"[PHASE1-PY] Chunks: {existing_chunks}, Embeddings: {existing_embeddings}")
                
                skipped_count += 1
                skipped_reasons["already_ingested"] += 1
                raw_collection.update_one(
                    {"_id": raw_doc["_id"]},
                    {
                        "$set": {
                            "faissIngestionStatus": "already_ingested",
                            "numChunks": existing_chunks,
                            "numEmbeddings": existing_embeddings,
                            "lastCheckedAt": datetime.utcnow()
                        }
                    }
                )
                continue
            
            # ✅ STEP 3: Content changed - delete old chunks and insert new
            if existing_hash is not None:
                logger.info(f"[PHASE1-PY] ⚠️  CONTENT CHANGED: Hash differs from last ingestion")
                logger.info(f"[PHASE1-PY] ─────────────────────────────────────────")
                logger.info(f"[PHASE1-PY] Old hash: {existing_hash[:20]}...")
                logger.info(f"[PHASE1-PY] New hash: {content_hash[:20]}...")
                logger.info(f"[PHASE1-PY] ─────────────────────────────────────────")
                logger.info(f"[PHASE1-PY] 🗑️  Removing old chunks from FAISS...")
                
                deleted_count = vector_store.delete_by_metadata("material_id", material_id, save=False)
                logger.info(f"[PHASE1-PY] ✓ Deleted {deleted_count} old chunks")
            else:
                logger.info(f"[PHASE1-PY] ℹ️  FIRST INGESTION: No previous version")
            
            logger.info(f"[PHASE1-PY] ───────────────────────────────────────────────────────")

            # Generate embeddings for all chunks
            logger.info(f"[PHASE1-PY] ➤ Generating embeddings ({len(chunks)} chunks)...")
            
            try:
                embeddings = embed_texts(chunks)
                logger.info(f"[PHASE1-PY] ✓ Generated {len(embeddings)} embeddings")
            except Exception as embed_error:
                logger.error(f"[PHASE1-PY] ❌ Embedding failed: {type(embed_error).__name__}: {embed_error}")
                skipped_count += 1
                skipped_reasons["embedding_failed"] += 1
                errors_list.append(f"Embedding failed for {material_id}: {embed_error}")
                continue

            # Prepare LangChain Documents with deduplication metadata
            logger.info(f"[PHASE1-PY] ➤ Preparing {len(chunks)} LangChain Documents...")
            documents_to_add = []

            for chunk_idx, chunk_text_val in enumerate(chunks):
                doc_metadata = {
                    "material_id": material_id,
                    "course_id": course_id_val,
                    "chunk_index": chunk_idx,
                    "total_chunks": len(chunks),
                    "content_hash": content_hash,
                    "ingested_at": datetime.utcnow().isoformat(),
                    "source": raw_doc.get("mimeType", "unknown"),
                    "source_format": raw_doc.get("sourceFormat", ""),
                }
                
                langchain_doc = Document(page_content=chunk_text_val, metadata=doc_metadata)
                documents_to_add.append(langchain_doc)
            
            logger.info(f"[PHASE1-PY] ✓ Prepared {len(documents_to_add)} Documents")

            # Add to single FAISS index (LangChain pattern: vectorstore.add_documents)
            logger.info(f"[PHASE1-PY] ➤ Adding documents to single FAISS index...")
            try:
                vector_store.add_documents(documents_to_add, save=True)
                logger.info(f"[PHASE1-PY] ✓ Added {len(documents_to_add)} documents to FAISS")
            except Exception as faiss_error:
                logger.error(f"[PHASE1-PY] ❌ FAISS add_documents failed: {faiss_error}")
                errors_list.append(f"FAISS insertion failed: {faiss_error}")
                skipped_count += 1
                skipped_reasons["faiss_add_failed"] += 1
                continue

            # Update MongoDB with ingestion metadata
            logger.info(f"[PHASE1-PY] ➤ Updating MongoDB ingestion record...")
            ingestion_duration_ms = int((datetime.utcnow() - material_start_time).total_seconds() * 1000)
            raw_collection.update_one(
                {"_id": raw_doc["_id"]},
                {
                    "$set": {
                        "faissIngestionStatus": "completed",
                        "contentHash": content_hash,
                        "faissChunkCount": len(chunks),
                        "numChunks": len(chunks),
                        "numEmbeddings": len(embeddings),
                        "faissIngestionDurationMs": ingestion_duration_ms,
                        "faissIngestionError": "",
                        "faissIngestionAt": datetime.utcnow(),
                    }
                },
            )
            logger.info(f"[PHASE1-PY] ✓ MongoDB updated")

            processed_count += 1
            total_chunks_created += len(chunks)
            total_embeddings_created += len(embeddings)

        except Exception as e:
            error_msg = f"Error processing material {raw_doc.get('_id')}: {str(e)}"
            logger.error(f"[PHASE1-PY] ❌ {error_msg}")
            errors_list.append(error_msg)
            
            # Update MongoDB with error status
            try:
                raw_collection.update_one(
                    {"_id": raw_doc.get("_id")},
                    {
                        "$set": {
                            "faissIngestionStatus": "failed",
                            "faissIngestionError": str(e),
                            "numChunks": 0,
                            "numEmbeddings": 0,
                            "faissIngestionAt": datetime.utcnow(),
                        }
                    },
                )
            except Exception as db_error:
                logger.error(f"[PHASE1-PY] Failed to update error status in MongoDB: {db_error}")

    # Summary
    logger.info("\n" + "=" * 80)
    logger.info("[PHASE1-PY] 📊 INGESTION SUMMARY")
    logger.info("=" * 80)
    logger.info(f"✓ Processed: {processed_count}")
    logger.info(f"⊘ Skipped: {skipped_count}")
    logger.info(f"✗ Errors: {len(errors_list)}")
    logger.info(f"📦 Total chunks created: {total_chunks_created}")
    logger.info(f"📊 Total embeddings generated: {total_embeddings_created}")
    if processed_count > 0:
        logger.info(f"📈 Average chunks per material: {total_chunks_created / processed_count:.1f}")
    if errors_list:
        for err in errors_list:
            logger.error(f"  - {err}")
    logger.info("=" * 80)
    
    result = {
        "timestamp": datetime.utcnow().isoformat(),
        "processed": processed_count,
        "processed_count": processed_count,
        "skipped": skipped_count,
        "skipped_count": skipped_count,
        "errors": len(errors_list),
        "error_details": errors_list if errors_list else None,
        "total_chunks_created": total_chunks_created,
        "total_embeddings_created": total_embeddings_created,
        "skipped_reasons": skipped_reasons,
    }

    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Ingest raw course materials into FAISS vector store"
    )
    parser.add_argument(
        "--course-id",
        type=str,
        default=None,
        help="Optional MongoDB ObjectId to process materials from a specific course",
    )
    parser.add_argument(
        "--material-id",
        type=str,
        default=None,
        help="Optional MongoDB material ObjectId to process a single uploaded material",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional limit on number of materials to process",
    )

    args = parser.parse_args()
    
    logger.info("[MAIN] ════════════════════════════════════════════")
    logger.info("[MAIN] InteliMark Ingestion Pipeline - Starting")
    logger.info("[MAIN] ════════════════════════════════════════════")
    logger.info(f"[MAIN] Python version: {sys.version}")
    logger.info(f"[MAIN] Platform: {sys.platform}")
    logger.info(f"[MAIN] Working directory: {os.getcwd()}")
    logger.info("[MAIN]")
    
    try:
        result = ingest_course_materials(
            course_id=args.course_id,
            material_id=args.material_id,
            limit=args.limit,
        )
        
        logger.info("[MAIN]")
        logger.info("[MAIN] ════════════════════════════════════════════")
        logger.info("[MAIN] Ingestion completed successfully")
        logger.info("[MAIN] ════════════════════════════════════════════")
        
        print(json.dumps(result, indent=2))
        sys.exit(0)
        
    except KeyboardInterrupt:
        logger.warning("[MAIN] ⚠️ Ingestion interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error("[MAIN]")
        logger.error("[MAIN] ════════════════════════════════════════════")
        logger.error("[MAIN] ✗ FATAL ERROR")
        logger.error("[MAIN] ════════════════════════════════════════════")
        logger.error(f"[MAIN] {type(e).__name__}: {e}")
        
        # Check for specific error patterns
        import traceback
        tb = traceback.format_exc()
        logger.error(f"[MAIN] Traceback:")
        for line in tb.split("\n"):
            logger.error(f"[MAIN] {line}")
        
        logger.error("[MAIN]")
        logger.error("[MAIN] TROUBLESHOOTING:")
        logger.error("[MAIN]   1. Check Python environment: python -c \"import torch; print(torch.__version__)\"")
        logger.error("[MAIN]   2. Run setup: python setup_pytorch_windows.py")
        logger.error("[MAIN]   3. Check logs for PyTorch errors above")
        logger.error("[MAIN]   4. Try API fallback: export HF_API_TOKEN=hf_...")
        logger.error("[MAIN]")
        
        sys.exit(1)
