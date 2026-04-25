"""Ingest student submissions (code/text) from MongoDB into a dedicated FAISS index.

Why separate index?
- Avoid mixing reference course materials with student answers
- Retrieval can be scoped to a specific submission/assessment/course

Usage:
  python ingest_submissions_to_faiss.py --submission-id <mongoObjectId>
  python ingest_submissions_to_faiss.py --assessment-id <mongoObjectId> --limit 50
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).parent))

from code_chunking import chunk_code_by_lines
from chunking import chunk_text
from faiss_vector_store import FAISSVectorStore, generate_content_hash
from langchain_core.documents import Document
from extract_course_material_text import (
    _build_ocr_engine,
    _extract_with_pymupdf,
    _extract_with_pdfplumber,
    _extract_from_docx,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


SUBMISSIONS_INDEX_DIR = Path(__file__).resolve().parent / "faiss_submissions_index"
SUBMISSIONS_INDEX_DIR.mkdir(parents=True, exist_ok=True)


def get_mongodb_connection():
    try:
        from pymongo import MongoClient  # type: ignore[import-not-found]
    except ImportError:
        logger.error("pymongo not installed. Install with: pip install pymongo")
        sys.exit(1)

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
    parsed = urlparse(mongo_uri)
    db_name_from_uri = parsed.path.lstrip("/") if parsed.path else ""
    db_name = db_name_from_uri or "InteliMark"
    db = client[db_name]
    logger.info(f"Using MongoDB database: {db_name}")
    return db


def _safe_read_text(file_path: Path) -> str:
    # Try UTF-8 first, then fall back to latin-1 to avoid crashing on odd encodings
    try:
        return file_path.read_text(encoding="utf-8")
    except Exception:
        return file_path.read_text(encoding="latin-1", errors="ignore")


CODE_EXTS = {
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".cs",
    ".go",
    ".rb",
    ".php",
    ".rs",
    ".swift",
    ".kt",
    ".scala",
    ".sql",
    ".md",
    ".txt",
}

TEXT_DOC_EXTS = {".pdf", ".docx"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png"}


def _resolve_upload_path(submission_file: dict[str, Any]) -> Optional[Path]:
    # submissionFiles.fileUrl is like: /uploads/student_uploads/<filename>
    file_url = str(submission_file.get("fileUrl") or "")
    filename = str(submission_file.get("filename") or "")
    if not filename:
        return None

    # backend/uploads/student_uploads/<filename>
    backend_dir = Path(__file__).resolve().parent.parent
    uploads_dir = backend_dir / "uploads" / "student_uploads"
    p = uploads_dir / filename
    if p.exists():
        return p

    # Fallback: try to infer from fileUrl
    if file_url:
        file_url = file_url.replace("\\", "/")
        if "/uploads/student_uploads/" in file_url:
            inferred = uploads_dir / file_url.split("/uploads/student_uploads/")[-1]
            if inferred.exists():
                return inferred
    return None


def ingest_submission(submission: dict[str, Any], vector_store: FAISSVectorStore) -> dict[str, Any]:
    submission_id = str(submission.get("_id"))
    assessment_id = str(submission.get("assessmentId"))
    course_id = str(submission.get("courseId"))
    teacher_id = str(submission.get("teacherId"))
    student_id = str(submission.get("studentId"))

    files = submission.get("submissionFiles") or []
    if not isinstance(files, list) or len(files) == 0:
        return {"success": False, "error": "Submission has no files", "chunks": 0}

    # Delete existing vectors for this submission (supports re-ingest)
    deleted = vector_store.delete_by_metadata("submission_id", submission_id, save=False)
    if deleted:
        logger.info(f"[SUBMIT-INGEST] Deleted {deleted} old chunks for submission_id={submission_id}")

    documents: list[Document] = []
    total_chunks = 0
    processed_files = 0
    skipped_files = 0
    visual_count = 0
    equation_count = 0
    ocr_count = 0
    ocr_char_count = 0
    page_count = 0
    page_metadata: list[dict[str, Any]] = []
    combined_raw_text_parts: list[str] = []
    extractor_used: set[str] = set()
    found_text = False
    found_code = False
    found_graphical = False

    enable_ocr = str(os.environ.get("RAG_ENABLE_OCR", "false")).lower() in {"1", "true", "yes", "on"}
    ocr_reader, ocr_status, ocr_error = _build_ocr_engine(enable_ocr)

    for f in files:
        path_obj = _resolve_upload_path(f)
        if not path_obj:
            logger.warning(f"[SUBMIT-INGEST] Missing file on disk for entry: {f.get('filename')}")
            continue

        ext = path_obj.suffix.lower()
        if ext in IMAGE_EXTS:
            visual_count += 1
            found_graphical = True

        # 1) CODE/TEXT-LIKE FILES (.py, .txt, etc) -> code chunking by lines
        if ext in CODE_EXTS:
            raw = _safe_read_text(path_obj)
            if not raw.strip():
                skipped_files += 1
                continue

            processed_files += 1
            extractor_used.add("code-text")
            found_code = True

            # Keep a (bounded) copy of raw for SubmissionRaw.rawText (audit/debug)
            if len(raw) <= 200_000:
                combined_raw_text_parts.append(f"[FILE:{path_obj.name}]\n{raw}")
            else:
                combined_raw_text_parts.append(f"[FILE:{path_obj.name}]\n{raw[:200_000]}\n...[truncated]...")

            content_hash = generate_content_hash(raw)
            code_chunks = chunk_code_by_lines(raw, chunk_lines=80, overlap_lines=10)
            if not code_chunks:
                skipped_files += 1
                continue

            for idx, ch in enumerate(code_chunks):
                md = {
                    "doc_type": "submission",
                    "submission_id": submission_id,
                    "assessment_id": assessment_id,
                    "course_id": course_id,
                    "teacher_id": teacher_id,
                    "student_id": student_id,
                    "file_name": str(f.get("filename") or path_obj.name),
                    "original_name": str(f.get("originalName") or ""),
                    "file_ext": ext,
                    "chunk_index": idx,
                    "total_chunks": len(code_chunks),
                    "start_line": ch.start_line,
                    "end_line": ch.end_line,
                    "content_hash": content_hash,
                    "ingested_at": datetime.utcnow().isoformat(),
                }
                documents.append(Document(page_content=ch.text, metadata=md))
                total_chunks += 1
            continue

        # 2) PDF/DOCX -> extract text then word-chunk like course materials
        if ext in TEXT_DOC_EXTS:
            processed_files += 1
            try:
                if ext == ".pdf":
                    try:
                        extracted = _extract_with_pymupdf(str(path_obj), ocr_reader=ocr_reader)
                    except Exception:
                        extracted = _extract_with_pdfplumber(str(path_obj))
                else:
                    extracted = _extract_from_docx(str(path_obj))

                extractor_used.add(str(extracted.get("extractor") or "extractor"))

                text = str(extracted.get("text") or "").strip()
                pages = extracted.get("pages") or []
                pc = int(extracted.get("page_count") or 0)
                vc = int(extracted.get("visual_count") or 0)
                ocr_blocks = extracted.get("ocr_blocks") or []

                page_count += pc
                visual_count += vc
                if vc > 0:
                    found_graphical = True
                for p in pages:
                    # Preserve per-file info
                    page_metadata.append(
                        {
                            "file": path_obj.name,
                            "page": p.get("page"),
                            "char_count": p.get("char_count"),
                            "visual_count": p.get("visual_count", 0),
                        }
                    )

                if ocr_blocks:
                    ocr_count += len(ocr_blocks)
                    ocr_char_count += sum(len((b.get("text") or "")) for b in ocr_blocks)

                if text:
                    found_text = True
                    if len(text) <= 200_000:
                        combined_raw_text_parts.append(f"[FILE:{path_obj.name}]\n{text}")
                    else:
                        combined_raw_text_parts.append(f"[FILE:{path_obj.name}]\n{text[:200_000]}\n...[truncated]...")

                    content_hash = generate_content_hash(text)
                    text_chunks = chunk_text(text, chunk_size=400, overlap=50)
                    for idx, chunk_val in enumerate(text_chunks):
                        md = {
                            "doc_type": "submission",
                            "submission_id": submission_id,
                            "assessment_id": assessment_id,
                            "course_id": course_id,
                            "teacher_id": teacher_id,
                            "student_id": student_id,
                            "file_name": str(f.get("filename") or path_obj.name),
                            "original_name": str(f.get("originalName") or ""),
                            "file_ext": ext,
                            "chunk_index": idx,
                            "total_chunks": len(text_chunks),
                            "content_hash": content_hash,
                            "ingested_at": datetime.utcnow().isoformat(),
                        }
                        documents.append(Document(page_content=chunk_val, metadata=md))
                        total_chunks += 1
                else:
                    skipped_files += 1
            except Exception as e:
                skipped_files += 1
                logger.warning(f"[SUBMIT-INGEST] Failed extracting {path_obj.name}: {type(e).__name__}: {e}")
            continue

        # 3) Images -> OCR (if enabled) and embed OCR text (if any)
        if ext in IMAGE_EXTS:
            processed_files += 1
            extractor_used.add("image-ocr")
            if not ocr_reader:
                skipped_files += 1
                continue

            try:
                img_bytes = path_obj.read_bytes()
                ocr_text = (ocr_reader(img_bytes) or "").strip()
                if not ocr_text:
                    skipped_files += 1
                    continue

                ocr_count += 1
                ocr_char_count += len(ocr_text)
                found_text = True
                combined_raw_text_parts.append(f"[IMAGE_TEXT:{path_obj.name}]\n{ocr_text[:5000]}")

                content_hash = generate_content_hash(ocr_text)
                # treat as small doc: chunk like normal text
                text_chunks = chunk_text(ocr_text, chunk_size=200, overlap=30)
                for idx, chunk_val in enumerate(text_chunks):
                    md = {
                        "doc_type": "submission",
                        "submission_id": submission_id,
                        "assessment_id": assessment_id,
                        "course_id": course_id,
                        "teacher_id": teacher_id,
                        "student_id": student_id,
                        "file_name": str(f.get("filename") or path_obj.name),
                        "original_name": str(f.get("originalName") or ""),
                        "file_ext": ext,
                        "chunk_index": idx,
                        "total_chunks": len(text_chunks),
                        "content_hash": content_hash,
                        "ingested_at": datetime.utcnow().isoformat(),
                    }
                    documents.append(Document(page_content=chunk_val, metadata=md))
                    total_chunks += 1
            except Exception as e:
                skipped_files += 1
                logger.warning(f"[SUBMIT-INGEST] OCR failed for {path_obj.name}: {type(e).__name__}: {e}")
            continue

        # Anything else
        logger.info(f"[SUBMIT-INGEST] Skipping unsupported submission file type: {path_obj.name} ({ext})")
        skipped_files += 1
        continue

    if not documents:
        content_types: list[str] = []
        if found_text:
            content_types.append("text")
        if found_code:
            content_types.append("code")
        if found_graphical:
            content_types.append("graphical")
        return {
            "success": False,
            "error": "No supported text/code chunks produced",
            "chunks": 0,
            "processed_files": processed_files,
            "skipped_files": skipped_files,
            "visual_count": visual_count,
            "equation_count": equation_count,
            "ocr_enabled": bool(ocr_reader),
            "ocr_status": ocr_status,
            "ocr_error": ocr_error,
            "ocr_count": ocr_count,
            "ocr_char_count": ocr_char_count,
            "page_count": page_count,
            "page_metadata": page_metadata,
            "extractor": ",".join(sorted(extractor_used)) if extractor_used else "",
            "raw_text": "\n\n".join(combined_raw_text_parts).strip(),
            "content_types": content_types,
        }

    vector_store.add_documents(documents, save=True)
    content_types: list[str] = []
    if found_text:
        content_types.append("text")
    if found_code:
        content_types.append("code")
    if found_graphical:
        content_types.append("graphical")
    return {
        "success": True,
        "chunks": total_chunks,
        "total_chunks_created": total_chunks,
        "total_embeddings_created": total_chunks,
        "processed_files": processed_files,
        "skipped_files": skipped_files,
        "visual_count": visual_count,
        "equation_count": equation_count,
        "ocr_enabled": bool(ocr_reader),
        "ocr_status": ocr_status,
        "ocr_error": ocr_error,
        "ocr_count": ocr_count,
        "ocr_char_count": ocr_char_count,
        "page_count": page_count,
        "page_metadata": page_metadata,
        "extractor": ",".join(sorted(extractor_used)) if extractor_used else "",
        "raw_text": "\n\n".join(combined_raw_text_parts).strip(),
        "content_types": content_types,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--submission-id", type=str, default=None)
    parser.add_argument("--assessment-id", type=str, default=None)
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    db = get_mongodb_connection()
    collection = db.get_collection("submission")

    query: dict[str, Any] = {}
    if args.submission_id:
        query["_id"] = args.submission_id
        # Try ObjectId if available
        try:
            from bson import ObjectId  # type: ignore[import-not-found]
            query["_id"] = ObjectId(args.submission_id)
        except Exception:
            pass
    if args.assessment_id:
        query["assessmentId"] = args.assessment_id
        try:
            from bson import ObjectId  # type: ignore[import-not-found]
            query["assessmentId"] = ObjectId(args.assessment_id)
        except Exception:
            pass

    docs = list(collection.find(query).limit(args.limit or 0))
    if not docs:
        print(json.dumps({"success": False, "error": f"No submissions found for query: {query}"}))
        return

    store = FAISSVectorStore(index_dir=SUBMISSIONS_INDEX_DIR)

    # If a single submission-id was provided, print the full per-submission result.
    # Node expects fields like raw_text/extractor/content_types/ocr_* for updating SubmissionRaw.
    if args.submission_id and len(docs) == 1:
        try:
            res = ingest_submission(docs[0], store)
            res["timestamp"] = datetime.utcnow().isoformat()
            print(json.dumps(res))
        except Exception as e:
            print(json.dumps({"success": False, "error": f"{type(e).__name__}: {e}"}))
        return

    processed = 0
    total_chunks = 0
    errors: list[str] = []

    for sub in docs:
        try:
            res = ingest_submission(sub, store)
            if res.get("success"):
                processed += 1
                total_chunks += int(res.get("chunks") or 0)
            else:
                errors.append(f"{sub.get('_id')}: {res.get('error')}")
        except Exception as e:
            errors.append(f"{sub.get('_id')}: {type(e).__name__}: {e}")

    print(
        json.dumps(
            {
                "timestamp": datetime.utcnow().isoformat(),
                "success": processed > 0 and len(errors) == 0,
                "processed_count": processed,
                "total_chunks_created": total_chunks,
                "errors": errors,
            }
        )
    )


if __name__ == "__main__":
    main()

