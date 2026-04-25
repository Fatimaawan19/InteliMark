# Query Vector Database - Quick Start

## ✅ Use System Python (Option 1)

All packages are already installed in your system Python. No virtual environment needed.

### Check Chunks in FAISS

```powershell
cd backend\rag_marking
python -c "from faiss_vector_store import FAISSVectorStore; store = FAISSVectorStore(); print(f'Total chunks: {store.index.ntotal}')"
```

**Result:** Shows the number of chunks stored in FAISS

### View More Details

```powershell
python -c "from faiss_vector_store import FAISSVectorStore; s = FAISSVectorStore(); print(f'Chunks: {s.index.ntotal}\nMetadata: {len(s.metadata)}\nDimensions: {s.index.d}')"
```

---

## ℹ️ Current Status

| Item | Value |
|------|-------|
| Total Chunks | 20 |
| Embeddings Dim | 384 |
| File Size | 30 KB |
| Location | `backend/rag_marking/faiss_index/course_materials.index` |

---

## 🎯 Remember

- **Don't activate `.venv-1`** - just use `python` directly
- System Python has all packages: faiss, torch, sentence-transformers, etc.
- Run commands from project root or specify full path
