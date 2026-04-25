"""LangChain FAISS Vector Store - Production-ready RAG pipeline.

Single persistent FAISS index with deduplication support.
- Uses LangChain's FAISS wrapper for clean API
- Auto-loads/saves from disk
- Prevents duplicate embeddings using content_hash
- Production-ready error handling and logging
"""

import hashlib
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, cast

from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_core.documents import Document

logger = logging.getLogger(__name__)

# Single index location for entire system
DEFAULT_INDEX_DIR = Path(__file__).resolve().parent / "faiss_index"
DEFAULT_INDEX_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


class FAISSVectorStore:
    """LangChain FAISS vector store with deduplication support.
    
    Features:
    - Single persistent index (index.faiss + index.pkl)
    - Auto-loads existing index on startup
    - Deduplication using slide_id + content_hash
    - Delete old chunks before re-inserting updated ones
    - Production-ready error handling and logging
    """

    def __init__(
        self,
        index_dir: Optional[Path] = None,
        embedding_model: str = DEFAULT_EMBEDDING_MODEL,
    ) -> None:
        """Initialize LangChain FAISS vector store.
        
        Parameters:
            index_dir: Directory for FAISS index (default: faiss_index/)
            embedding_model: HuggingFace model for embeddings
        """
        self.index_dir = Path(index_dir or DEFAULT_INDEX_DIR)
        self.index_dir.mkdir(parents=True, exist_ok=True)
        
        self.embedding_model = embedding_model
        self.index_path = str(self.index_dir)
        self.vectorstore: Optional[FAISS] = None
        
        logger.info("[FAISS] ═══════════════════════════════════════════════════════════")
        logger.info("[FAISS] LangChain FAISS Vector Store (Single Index)")
        logger.info("[FAISS] ───────────────────────────────────────────────────────────")
        logger.info(f"[FAISS] Index directory: {self.index_dir}")
        logger.info(f"[FAISS] Embedding model: {embedding_model}")
        
        # Initialize embeddings
        try:
            self.embeddings = HuggingFaceEmbeddings(
                model_name=embedding_model,
                model_kwargs={"device": "cpu"}  # Force CPU on Windows
            )
            logger.info(f"[FAISS] ✅ Embeddings initialized")
        except Exception as e:
            logger.error(f"[FAISS] ❌ Failed to init embeddings: {e}")
            raise
        
        # Load existing index or create new
        self._load_or_create_index()
        
        logger.info("[FAISS] ═══════════════════════════════════════════════════════════")

    def _load_or_create_index(self) -> None:
        """Load existing FAISS index or create new one.
        
        Single Index Pattern:
        ├─ if index_exists:
        │   └─ vectorstore = FAISS.load_local(...)
        └─ else:
            └─ vectorstore = FAISS.from_documents(...)
        
        Then add_documents() is called for new/updated content.
        """
        index_file = self.index_dir / "index.faiss"
        
        # ═══════════════════════════════════════════════════════════════
        # SINGLE INDEX ENFORCEMENT: Load if exists
        # ═══════════════════════════════════════════════════════════════
        if index_file.exists():
            logger.info("[FAISS] ► Single Index Load Pattern")
            logger.info("[FAISS] ├─ Index exists: YES")
            logger.info("[FAISS] └─ Action: FAISS.load_local(...)")
            
            try:
                self.vectorstore = FAISS.load_local(
                    self.index_path,
                    self.embeddings,
                    allow_dangerous_deserialization=True
                )
                vector_count = self._count_vectors()
                logger.info(f"[FAISS] ✅ Loaded successfully: {vector_count} vectors")
                
            except Exception as e:
                logger.error(f"[FAISS] ❌ Failed to load index: {e}")
                logger.warning(f"[FAISS] ⚠️  Falling back to new index...")
                self._create_new_index()
        
        # ═══════════════════════════════════════════════════════════════
        # SINGLE INDEX ENFORCEMENT: Create if doesn't exist
        # ═══════════════════════════════════════════════════════════════
        else:
            logger.info("[FAISS] ► Single Index Creation Pattern")
            logger.info("[FAISS] ├─ Index exists: NO")
            logger.info("[FAISS] └─ Action: FAISS.from_documents(...)")
            self._create_new_index()

    def _create_new_index(self) -> None:
        """Create a fresh FAISS index."""
        logger.info("[FAISS] ➤ Creating new FAISS index...")
        
        # Create empty index with one dummy document
        dummy_doc = Document(
            page_content="[placeholder]",
            metadata={"placeholder": True, "slide_id": "placeholder"}
        )
        self.vectorstore = FAISS.from_documents(
            [dummy_doc],
            self.embeddings
        )
        
        # Remove the dummy document to keep index clean
        try:
            # Get the ID from docstore and remove it
            docstore_dict = cast(Dict[str, Any], self.vectorstore.docstore._dict)  # type: ignore
            for doc_id, doc in docstore_dict.items():
                if doc.metadata.get("placeholder"):
                    self.vectorstore.delete([doc_id])
                    break
        except Exception:
            pass  # Not critical if dummy removal fails
        
        # Save immediately
        self._save_index()
        logger.info("[FAISS] ✅ New index created and saved")

    def _save_index(self) -> None:
        """Save FAISS index to disk."""
        try:
            if self.vectorstore is None:
                logger.error("[FAISS] ❌ Cannot save: vectorstore not initialized")
                return
            self.vectorstore.save_local(self.index_path)
            index_file = self.index_dir / "index.faiss"
            if index_file.exists():
                size_kb = index_file.stat().st_size / 1024
                logger.info(f"[FAISS] ✅ Saved index ({size_kb:.1f} KB)")
        except Exception as e:
            logger.error(f"[FAISS] ❌ Failed to save index: {e}")
            raise

    def _count_vectors(self) -> int:
        """Get total number of vectors in index."""
        try:
            if self.vectorstore is None:
                return 0
            return self.vectorstore.index.ntotal
        except Exception:
            return 0

    def add_documents(
        self,
        documents: List[Document],
        save: bool = True,
    ) -> None:
        """Add documents to FAISS index.
        
        Parameters:
            documents: List of LangChain Documents
            save: Whether to save index to disk after adding
        """
        if not documents:
            logger.warning("[FAISS] ⚠️  add_documents called with empty list")
            return

        logger.info(f"[FAISS] ➤ Adding {len(documents)} documents...")
        
        try:
            if self.vectorstore is None:
                raise RuntimeError("Vector store not initialized")
            self.vectorstore.add_documents(documents)
            logger.info(f"[FAISS] ✅ Added {len(documents)} documents")
            logger.info(f"[FAISS]    • Total vectors now: {self._count_vectors()}")
            
            if save:
                self._save_index()
                
        except Exception as e:
            logger.error(f"[FAISS] ❌ Failed to add documents: {e}")
            raise

    def delete_by_metadata(
        self,
        metadata_key: str,
        metadata_value: Any,
        save: bool = True,
    ) -> int:
        """Delete all chunks with specific metadata value.
        
        Example:
            delete_by_metadata("slide_id", "course_123#file.pptx#5")
        
        Returns:
            Number of documents deleted
        """
        try:
            if self.vectorstore is None:
                logger.warning("[FAISS] ⚠️  Cannot delete: vectorstore not initialized")
                return 0
            
            if not hasattr(self.vectorstore, 'docstore'):
                logger.warning("[FAISS] ⚠️  Cannot delete: docstore not available")
                return 0
            
            # Find all docs with matching metadata
            to_delete = []
            docstore = self.vectorstore.docstore
            
            # Use proper API to iterate documents
            if hasattr(docstore, '_dict'):
                # Access private _dict with type casting for Pylance compatibility
                docstore_dict = cast(Dict[str, Any], docstore._dict)  # type: ignore
                for doc_id, doc in docstore_dict.items():
                    if doc.metadata.get(metadata_key) == metadata_value:
                        to_delete.append(doc_id)
            else:
                logger.warning("[FAISS] ⚠️  Cannot access docstore internals")
                return 0
            
            if to_delete:
                logger.info(f"[FAISS] ➤ Deleting {len(to_delete)} old chunks for {metadata_key}={metadata_value}")
                self.vectorstore.delete(to_delete)
                logger.info(f"[FAISS] ✅ Deleted {len(to_delete)} chunks")
                logger.info(f"[FAISS]    • Total vectors now: {self._count_vectors()}")
                
                if save:
                    self._save_index()
                
                return len(to_delete)
            else:
                logger.info(f"[FAISS] ℹ️  No chunks found for {metadata_key}={metadata_value}")
                return 0
                
        except Exception as e:
            logger.error(f"[FAISS] ❌ Failed to delete by metadata: {e}")
            return 0

    def remove_orphan_vectors(
        self,
        valid_material_ids: set[str],
        save: bool = True,
    ) -> int:
        """Remove vectors whose material_id no longer exists in MongoDB.

        Parameters:
            valid_material_ids: Set of current material IDs from MongoDB
            save: Whether to save index to disk after cleanup

        Returns:
            Number of deleted orphan vectors
        """
        if self.vectorstore is None:
            logger.warning("[FAISS] ⚠️  Cannot sync: vectorstore not initialized")
            return 0

        try:
            docstore = self.vectorstore.docstore
            if not hasattr(docstore, "_dict"):
                logger.warning("[FAISS] ⚠️  Cannot sync: docstore internals unavailable")
                return 0

            docstore_dict = cast(Dict[str, Any], docstore._dict)  # type: ignore
            orphan_doc_ids: List[str] = []

            for doc_id, doc in docstore_dict.items():
                material_id = str(doc.metadata.get("material_id", "")).strip()
                if not material_id:
                    # Keep documents without material_id metadata to avoid accidental loss.
                    continue
                if material_id not in valid_material_ids:
                    orphan_doc_ids.append(doc_id)

            if not orphan_doc_ids:
                logger.info("[FAISS] ℹ️  No orphan vectors found. Index is synchronized with MongoDB.")
                return 0

            logger.info(f"[FAISS] 🧹 Removing {len(orphan_doc_ids)} orphan vectors...")
            self.vectorstore.delete(orphan_doc_ids)
            logger.info(f"[FAISS] ✅ Removed {len(orphan_doc_ids)} orphan vectors")
            logger.info(f"[FAISS]    • Total vectors now: {self._count_vectors()}")

            if save:
                self._save_index()

            return len(orphan_doc_ids)

        except Exception as e:
            logger.error(f"[FAISS] ❌ Failed orphan cleanup: {e}")
            return 0

    def query(
        self,
        query_text: str,
        top_k: int = 5,
    ) -> Dict[str, Any]:
        """Query the vector store for similar documents.
        
        Parameters:
            query_text: Text to search for
            top_k: Number of results to return
        
        Returns:
            Dictionary with matches and metadata
        """
        try:
            logger.info(f"[FAISS] 🔍 Querying for: '{query_text[:100]}'")
            
            if self.vectorstore is None:
                logger.warning("[FAISS] ⚠️  Cannot query: vectorstore not initialized")
                return {"query": query_text, "matches": [], "n_results": 0}
            
            results = self.vectorstore.similarity_search_with_score(query_text, top_k)
            
            matches = []
            for doc, score in results:
                matches.append({
                    "text": doc.page_content,
                    "metadata": doc.metadata,
                    "score": 1 / (1 + score),  # Convert distance to similarity
                })
            
            logger.info(f"[FAISS] ✅ Found {len(matches)} matches")
            return {
                "query": query_text,
                "matches": matches,
                "n_results": len(matches),
            }
            
        except Exception as e:
            logger.error(f"[FAISS] ❌ Query failed: {e}")
            return {"query": query_text, "matches": [], "n_results": 0}

    def stats(self) -> Dict[str, Any]:
        """Get vector store statistics."""
        index_file = self.index_dir / "index.faiss"
        metadata_file = self.index_dir / "index.pkl"
        
        index_size = index_file.stat().st_size if index_file.exists() else 0
        metadata_size = metadata_file.stat().st_size if metadata_file.exists() else 0
        
        return {
            "total_vectors": self._count_vectors(),
            "index_dir": str(self.index_dir),
            "index_file": str(index_file),
            "metadata_file": str(metadata_file),
            "index_size_kb": index_size / 1024,
            "metadata_size_kb": metadata_size / 1024,
            "total_size_kb": (index_size + metadata_size) / 1024,
            "embedding_model": self.embedding_model,
        }

    def save_local(self, folder_path: Optional[str] = None) -> None:
        """Save vectorstore to disk (LangChain compatibility)."""
        if folder_path:
            self.index_dir = Path(folder_path)
            self.index_dir.mkdir(parents=True, exist_ok=True)
            self.index_path = str(self.index_dir)
        
        self._save_index()

    def load_local(self, folder_path: Optional[str] = None) -> None:
        """Load vectorstore from disk (LangChain compatibility)."""
        if folder_path:
            self.index_dir = Path(folder_path)
            self.index_path = str(self.index_dir)
        
        self._load_or_create_index()


# ============================================================================
# Deduplication utilities
# ============================================================================

def generate_slide_id(course_id: str, file_name: str, slide_number: int) -> str:
    """Generate unique slide_id from course_id + file_name + slide_number.
    
    Example:
        generate_slide_id("course_123", "presentation.pptx", 5)
        → "course_123#presentation.pptx#5"
    """
    return f"{course_id}#{file_name}#{slide_number}"


def generate_content_hash(content: str) -> str:
    """Generate SHA256 hash of content for deduplication.
    
    Example:
        hash = generate_content_hash("This is slide content")
        # Can detect if slide content changed
    """
    return hashlib.sha256(content.encode()).hexdigest()

    def _load_or_create_index(self) -> None:
        """Load existing FAISS index from disk or create new one.
        
        Supports both new (index.faiss/index.pkl) and legacy 
        (course_materials.index/course_materials_metadata.pkl) formats.
        Automatically migrates legacy files to new format.
        """
        # Try new format first
        if self.index_file.exists() and self.metadata_file.exists():
            # Check if it's a real file with data, not an empty placeholder
            if self.index_file.stat().st_size > 100 and self.metadata_file.stat().st_size > 10:
                logger.info(f"[FAISS] ➤ Loading existing index from disk (new format)...")
                self._load_index_files(self.index_file, self.metadata_file)
                return
        
        # Try legacy format
        legacy_index = self.index_dir / "course_materials.index"
        legacy_metadata = self.index_dir / "course_materials_metadata.pkl"
        
        if legacy_index.exists() and legacy_metadata.exists():
            logger.info(f"[FAISS] ➤ Found legacy index format, migrating to new format...")
            logger.info(f"[FAISS]    • Loading from: course_materials.index / course_materials_metadata.pkl")
            
            try:
                self._load_index_files(legacy_index, legacy_metadata)
                
                # Migrate to new format
                logger.info(f"[FAISS] ➤ Saving as new format...")
                self._save_to_disk()
                
                logger.info(f"[FAISS] ✅ Migration complete!")
                logger.info(f"[FAISS]    • New files: index.faiss / index.pkl")
                return
                
            except Exception as e:
                logger.error(f"[FAISS] ❌ Migration failed: {e}")
                logger.warning(f"[FAISS] ⚠️  Creating new index instead...")
                self._create_new_index()
                return
        
        # No existing index, create new
        logger.info(f"[FAISS] ➤ No existing index found. Creating new one...")
        self._create_new_index()

    def _load_index_files(self, index_file: Path, metadata_file: Path) -> None:
        """Load FAISS index and metadata from files."""
        try:
            self.index = faiss.read_index(str(index_file))
            with open(metadata_file, "rb") as f:
                self.metadata = pickle.load(f)
            
            self.embedding_dim = self.index.d
            
            logger.info(f"[FAISS] ✅ Loaded successfully!")
            logger.info(f"[FAISS]    • Vectors: {self.index.ntotal}")
            logger.info(f"[FAISS]    • Metadata records: {len(self.metadata)}")
            logger.info(f"[FAISS]    • File size: {index_file.stat().st_size / 1024:.1f} KB")
            
        except Exception as e:
            logger.error(f"[FAISS] ❌ Failed to load index: {e}")
            raise

    def _create_new_index(self) -> None:
        """Create a fresh FAISS index."""
        logger.info(f"[FAISS] ➤ Creating new FAISS index (dimension: {self.embedding_dim})")
        self.index = faiss.IndexFlatL2(self.embedding_dim)
        self.metadata = []
        logger.info(f"[FAISS] ✅ New index created")
        
        # Ensure files exist but are empty initially
        if not self.index_file.exists():
            faiss.write_index(self.index, str(self.index_file))
        if not self.metadata_file.exists():
            with open(self.metadata_file, "wb") as f:
                pickle.dump([], f)
        
        logger.info(f"[FAISS]    • Files initialized:")
        logger.info(f"[FAISS]      - {self.index_file.name}")
        logger.info(f"[FAISS]      - {self.metadata_file.name}")

    @staticmethod
    def _infer_embedding_dim(model_name: str) -> int:
        """Best-effort dimension inference for common embedding models."""
        normalized = (model_name or "").lower()
        if "all-minilm-l6-v2" in normalized:
            return 384
        if "bge-small" in normalized:
            return 384
        if "bge-m3" in normalized:
            return 1024
        return 1024

    def upsert(
        self,
        ids: List[str],
        documents: List[str],
        metadatas: List[Dict[str, Any]],
        embeddings: Optional[List[List[float]]] = None,
    ) -> None:
        """Store chunks with embeddings in FAISS.
        
        Automatically saves to disk after adding vectors.

        Parameters:
            ids: List of unique chunk identifiers
            documents: List of chunk text strings
            metadatas: List of metadata dictionaries
            embeddings: Optional pre-computed embeddings; if None, will be generated
        """
        if not documents:
            logger.warning(f"[FAISS] ⚠️  Upsert called with empty documents list!")
            return

        logger.info(f"[FAISS] ───────────────────────────────────────────────────────────")
        logger.info(f"[FAISS] Upserting {len(documents)} documents")
        
        # Generate or use provided embeddings
        if embeddings is None:
            logger.info(f"[FAISS] ➤ Generating embeddings for {len(documents)} documents...")
            embeddings = embed_texts(documents, self.embedding_model)
            logger.info(f"[FAISS] ✅ Generated {len(embeddings)} embeddings")
        else:
            logger.info(f"[FAISS] ➤ Using pre-computed {len(embeddings)} embeddings")

        # Filter out duplicates
        existing_ids = {record["id"] for record in self.metadata}
        filtered_items = [
            (chunk_id, document, metadata, embedding)
            for chunk_id, document, metadata, embedding in zip(ids, documents, metadatas, embeddings)
            if chunk_id not in existing_ids
        ]

        if not filtered_items:
            logger.info("[FAISS] ℹ️  No new chunk IDs to add; all are duplicates")
            return

        if len(filtered_items) != len(ids):
            skipped = len(ids) - len(filtered_items)
            logger.info(f"[FAISS] ⊘ Skipped {skipped} duplicate chunk(s)")

        ids = [item[0] for item in filtered_items]
        documents = [item[1] for item in filtered_items]
        metadatas = [item[2] for item in filtered_items]
        embeddings = [item[3] for item in filtered_items]

        # Convert embeddings to numpy array (float32 for FAISS)
        embeddings_array = np.array(embeddings, dtype=np.float32)
        logger.info(f"[FAISS] ➤ Embedding array shape: {embeddings_array.shape}")

        # Validate dimensions
        if embeddings_array.ndim != 2 or embeddings_array.shape[1] != self.index.d:
            raise RuntimeError(
                f"Embedding dimension mismatch: vectors are {embeddings_array.shape[1] if embeddings_array.ndim == 2 else 'invalid'}, "
                f"but FAISS index expects {self.index.d}. Rebuild FAISS index or align EMBEDDING_MODEL."
            )
        
        # Add embeddings to index
        logger.info(f"[FAISS] ➤ Adding {len(embeddings_array)} vectors to index...")
        self.index.add(embeddings_array)
        
        # Store metadata
        for chunk_id, text, metadata in zip(ids, documents, metadatas):
            self.metadata.append({
                "id": chunk_id,
                "text": text,
                "metadata": metadata,
            })
        
        logger.info(f"[FAISS] ✅ Added {len(embeddings)} vectors")
        logger.info(f"[FAISS]    • Total vectors in index: {self.index.ntotal}")
        logger.info(f"[FAISS]    • Total metadata records: {len(self.metadata)}")
        
        # Save to disk
        self._save_to_disk()


