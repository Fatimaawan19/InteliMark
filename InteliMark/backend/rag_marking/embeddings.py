"""Embedding helpers for course materials.

This file keeps the embedding logic separate from the vector database logic.
That separation is important because it lets us swap the model later without
touching how data is stored or retrieved.

ENHANCED WITH:
- PyTorch CPU-only setup to fix Windows CUDA/DLL crashes
- Comprehensive debug logs before/after embedding
- Error handling with fallback to lighter models
- Memory-safe batch processing
- Exit code 3221225477 fix (memory access violation)
"""

import logging
import os
import sys
from functools import lru_cache
from typing import Any, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer  # type: ignore[import-not-found]

logger = logging.getLogger(__name__)

# Use a stable default on Windows to avoid native crashes while loading larger models.
DEFAULT_MODEL_NAME = os.environ.get("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
FALLBACK_MODEL_NAME = os.environ.get("EMBEDDING_FALLBACK_MODEL", "BAAI/bge-small-en-v1.5")

# ============================================================================
# PyTorch Environment Setup - CRITICAL for Windows stability
# ============================================================================

def _setup_pytorch_environment():
    """Configure PyTorch for stability on Windows.
    
    Fixes common crash issues:
    - Exit code 3221225477 (memory access violation)
    - CUDA/DLL conflicts
    - Torch version mismatches
    """
    logger.info("[EMBEDDINGS-TORCH] Setting up PyTorch environment...")
    
    try:
        import torch  # type: ignore[import-not-found]
        logger.info(f"[EMBEDDINGS-TORCH] PyTorch version: {torch.__version__}")
        logger.info(f"[EMBEDDINGS-TORCH] PyTorch CUDA available: {torch.cuda.is_available()}")
        
        # Force CPU-only mode on Windows to avoid CUDA issues
        if sys.platform == "win32":
            logger.warning("[EMBEDDINGS-TORCH] ⚠️ Windows detected - forcing CPU-only mode")
            os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
            logger.info("[EMBEDDINGS-TORCH] ✓ Set CUDA_VISIBLE_DEVICES=-1 (CPU mode)")
        
        # Additional stability settings
        os.environ["OMP_NUM_THREADS"] = "1"
        os.environ["MKL_NUM_THREADS"] = "1"
        os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
        logger.info("[EMBEDDINGS-TORCH] ✓ Set thread limits for stability")
        
    except ImportError as e:
        logger.error(f"[EMBEDDINGS-TORCH] ✗ PyTorch import failed: {e}")
        logger.error("[EMBEDDINGS-TORCH] Install with: pip install torch --index-url https://download.pytorch.org/whl/cpu")
        raise
    except Exception as e:
        logger.error(f"[EMBEDDINGS-TORCH] ✗ Unexpected error in setup: {e}")
        raise


# Run setup once on module load
_setup_pytorch_environment()


# ============================================================================
# Model Loading with Fallback Strategy
# ============================================================================

@lru_cache(maxsize=2)
def get_embedding_model(model_name: str = DEFAULT_MODEL_NAME) -> "SentenceTransformer":
    """Load the embedding model once and reuse it.

    Why we do this:
    - Loading transformer models is expensive.
    - We only want to pay that cost one time per process.
    - The cache keeps the code simple and fast.
    - If the primary model fails, falls back to a lighter model.
    """
    logger.info(f"[EMBEDDINGS] ════════════════════════════════════════════")
    logger.info(f"[EMBEDDINGS] Loading embedding model: {model_name}")
    logger.info(f"[EMBEDDINGS] ════════════════════════════════════════════")
    
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore[import-not-found]
        
        logger.info(f"[EMBEDDINGS] ➤ Importing model from Hugging Face...")
        logger.info(f"[EMBEDDINGS]   Model: {model_name}")
        
        model = SentenceTransformer(model_name, trust_remote_code=False)
        
        logger.info(f"[EMBEDDINGS] ✓ Model loaded successfully!")
        logger.info(f"[EMBEDDINGS]   Module count: {len(list(model.modules()))}")
        logger.info(f"[EMBEDDINGS] ════════════════════════════════════════════")
        
        return model
        
    except Exception as e:
        logger.error(f"[EMBEDDINGS] ✗ Failed to load model '{model_name}'")
        logger.error(f"[EMBEDDINGS]   Error: {type(e).__name__}: {e}")
        
        # Try fallback model if not already the fallback
        if model_name != FALLBACK_MODEL_NAME:
            logger.warning(f"[EMBEDDINGS] ⚠️ Attempting fallback to lighter model: {FALLBACK_MODEL_NAME}")
            return get_embedding_model(FALLBACK_MODEL_NAME)
        
        raise RuntimeError(f"Failed to load both primary and fallback embedding models") from e


# ============================================================================
# Text Embedding with Memory-Safe Batch Processing
# ============================================================================

def embed_texts(texts: List[str], model_name: str = DEFAULT_MODEL_NAME, batch_size: int = 32) -> List[List[float]]:
    """Convert text chunks into vectors with the primary or fallback model.

    Each vector is a numeric representation of the meaning of the text.
    Similar meanings end up with vectors that are close together.
    
    Parameters:
        texts: List of text strings to embed
        model_name: Model name to use
        batch_size: Process texts in batches to manage memory (default: 32)
    
    Returns:
        List of embedding vectors
    
    NOTE: This function has comprehensive logging to help debug exit code 3221225477
    """
    logger.info(f"[EMBEDDINGS] ════════════════════════════════════════════")
    logger.info(f"[EMBEDDINGS] embed_texts() called with {len(texts)} texts")
    logger.info(f"[EMBEDDINGS] ════════════════════════════════════════════")
    
    if not texts:
        logger.warning(f"[EMBEDDINGS] ⚠️ embed_texts called with empty list!")
        return []
    
    logger.info(f"[EMBEDDINGS] Input validation:")
    logger.info(f"[EMBEDDINGS]   Total texts: {len(texts)}")
    logger.info(f"[EMBEDDINGS]   Min text length: {min(len(t) for t in texts) if texts else 'N/A'}")
    logger.info(f"[EMBEDDINGS]   Max text length: {max(len(t) for t in texts) if texts else 'N/A'}")
    logger.info(f"[EMBEDDINGS]   Avg text length: {sum(len(t) for t in texts) / len(texts) if texts else 'N/A':.0f}")
    
    # Clean texts: remove None, empty strings, and whitespace-only
    cleaned_texts = [t.strip() for t in texts if t and isinstance(t, str) and t.strip()]
    if len(cleaned_texts) < len(texts):
        logger.warning(f"[EMBEDDINGS] ⚠️ Filtered {len(texts) - len(cleaned_texts)} empty/invalid texts")
    
    if not cleaned_texts:
        logger.error(f"[EMBEDDINGS] ✗ No valid texts to embed after cleaning!")
        return []
    
    logger.info(f"[EMBEDDINGS] ➤ Getting embedding model: {model_name}")
    model = get_embedding_model(model_name)
    logger.info(f"[EMBEDDINGS] ✓ Model ready")
    
    try:
        logger.info(f"[EMBEDDINGS] ➤ Encoding texts in batches (batch_size={batch_size})...")
        logger.info(f"[EMBEDDINGS]   Processing {len(cleaned_texts)} texts")
        logger.info(f"[EMBEDDINGS]   Expected: ~{len(cleaned_texts) / batch_size:.1f} batches")
        
        # Process in batches to manage memory - CRITICAL for Windows stability
        all_vectors = []
        for batch_idx in range(0, len(cleaned_texts), batch_size):
            batch_end = min(batch_idx + batch_size, len(cleaned_texts))
            batch = cleaned_texts[batch_idx:batch_end]
            batch_num = batch_idx // batch_size + 1
            total_batches = (len(cleaned_texts) + batch_size - 1) // batch_size
            
            logger.info(f"[EMBEDDINGS]  [Batch {batch_num}/{total_batches}] Processing texts {batch_idx}-{batch_end}...")
            
            try:
                # This is where crashes most commonly occur
                logger.info(f"[EMBEDDINGS]    ➤ Calling model.encode() with {len(batch)} texts")
                batch_vectors = model.encode(batch, normalize_embeddings=True, show_progress_bar=False)
                logger.info(f"[EMBEDDINGS]    ✓ Batch encoding complete. Shape: {batch_vectors.shape}")
                all_vectors.append(batch_vectors)
            except Exception as e:
                logger.error(f"[EMBEDDINGS]    ✗ Batch {batch_num} encoding failed!")
                logger.error(f"[EMBEDDINGS]       Error type: {type(e).__name__}")
                logger.error(f"[EMBEDDINGS]       Error: {e}")
                raise RuntimeError(f"Embedding failed at batch {batch_num}: {e}") from e
        
        logger.info(f"[EMBEDDINGS] ✓ All batches processed")
        
        # Combine batches
        logger.info(f"[EMBEDDINGS] ➤ Combining {len(all_vectors)} batch arrays...")
        import numpy as np  # type: ignore[import-not-found]
        vectors = np.concatenate(all_vectors, axis=0)
        logger.info(f"[EMBEDDINGS] ✓ Combined. Final shape: {vectors.shape}")
        
        # Convert to list
        logger.info(f"[EMBEDDINGS] ➤ Converting numpy array to list format...")
        result = vectors.tolist()
        logger.info(f"[EMBEDDINGS] ✓ Converted to list. Result length: {len(result)}")
        
        logger.info(f"[EMBEDDINGS] ════════════════════════════════════════════")
        logger.info(f"[EMBEDDINGS] ✓ Successfully generated {len(result)} embeddings")
        logger.info(f"[EMBEDDINGS] ════════════════════════════════════════════")
        
        return result
        
    except Exception as e:
        logger.error(f"[EMBEDDINGS] ════════════════════════════════════════════")
        logger.error(f"[EMBEDDINGS] ✗ CRITICAL: Embedding failed!")
        logger.error(f"[EMBEDDINGS]   Error type: {type(e).__name__}")
        logger.error(f"[EMBEDDINGS]   Error details: {e}")
        logger.error(f"[EMBEDDINGS]   Traceback: {e.__traceback__}")
        logger.error(f"[EMBEDDINGS] This is likely exit code 3221225477 (memory violation)")
        logger.error(f"[EMBEDDINGS] ════════════════════════════════════════════")
        raise


# ============================================================================
# Query Embedding
# ============================================================================

def embed_query(query: str, model_name: str = DEFAULT_MODEL_NAME) -> List[float]:
    """Convert a single user question into one vector for retrieval."""
    logger.info(f"[EMBEDDINGS] Encoding query: '{query[:100]}{'...' if len(query) > 100 else ''}'")
    
    try:
        model = get_embedding_model(model_name)
        logger.info(f"[EMBEDDINGS] ➤ Calling model.encode() for query...")
        vector = model.encode([query], normalize_embeddings=True)[0]
        logger.info(f"[EMBEDDINGS] ✓ Query encoded")
        return vector.tolist()
    except Exception as e:
        logger.error(f"[EMBEDDINGS] ✗ Query embedding failed: {e}")
        raise
