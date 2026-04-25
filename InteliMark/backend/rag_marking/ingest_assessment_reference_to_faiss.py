"""Ingest assessment reference artifacts into a dedicated FAISS index.

This index is used by the auto-marking module as the "reference truth" store:
- Sample answers (per quiz question)
- Marking rubrics (per question)
- CLO text (per question/CLO)

We keep this index separate from:
- Course materials word bank (faiss_index)
- Student submissions (faiss_submissions_index)

Usage examples:
  # Ingest raw text rubric
  python ingest_assessment_reference_to_faiss.py --assessment-id <id> --question-id Q1 --type rubric --text "..."

  # Ingest a sample answer PDF
  python ingest_assessment_reference_to_faiss.py --assessment-id <id> --question-id Q1 --type sample_answer --file "..\\uploads\\sample.pdf"
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any

sys_path = str(Path(__file__).parent)
import sys

if sys_path not in sys.path:
    sys.path.insert(0, sys_path)

from chunking import chunk_text
from faiss_vector_store import FAISSVectorStore, generate_content_hash
from langchain_core.documents import Document

# Reuse robust extraction + OCR helpers from course-material extractor
from extract_course_material_text import (
    _build_ocr_engine,
    _extract_from_docx,
    _extract_with_pdfplumber,
    _extract_with_pymupdf,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


REFERENCE_INDEX_DIR = Path(__file__).resolve().parent / "faiss_assessment_reference_index"
REFERENCE_INDEX_DIR.mkdir(parents=True, exist_ok=True)


def _split_sample_answer_by_question(raw_text: str, question_count: int) -> dict[str, str]:
    """Split a combined sample-answer text into per-question sections.

    We look for common headings like:
    - Q1, Q1), Q1:, Q1.
    - Question 1, Question 1:

    Returns mapping: {"Q1": "...", "Q2": "..."}.
    If no headings are found, returns {"ALL": raw_text}.
    """
    if not raw_text.strip():
        return {}

    # Find all question headings with their positions
    pattern = re.compile(r"(?im)^(?:\s*)(?:q|question)\s*([0-9]{1,3})\s*[\).:\-]?\s*$")
    matches = list(pattern.finditer(raw_text))
    if not matches:
        # If teacher created this assessment with a known question_count and it is 1,
        # treat the entire file as Q1 to avoid leaving Q1::sample_answer stuck pending.
        if question_count == 1:
            return {"Q1": raw_text.strip()}
        return {"ALL": raw_text.strip()}

    # Build slices
    sections: dict[str, str] = {}
    for idx, m in enumerate(matches):
        qn = int(m.group(1))
        key = f"Q{qn}"
        start = m.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(raw_text)
        body = raw_text[start:end].strip()
        if body:
            sections[key] = body

    # If we found headings but none had bodies, fallback
    if not sections:
        return {"ALL": raw_text.strip()}

    # Optional: If question_count is provided, keep only Q1..Qn
    if question_count and question_count > 0:
        filtered = {k: v for k, v in sections.items() if k.startswith("Q")}
        # don't hard fail if counts mismatch; keep whatever found
        if filtered:
            return filtered

    return sections


def _extract_text_from_file(file_path: Path) -> dict[str, Any]:
    ext = file_path.suffix.lower()
    # IMPORTANT: assessment-reference extraction has its own flags so we don't disturb
    # the course-materials pipeline behavior.
    enable_ocr = str(os.environ.get("ASSESS_REF_ENABLE_OCR", "false")).lower() in {"1", "true", "yes", "on"}
    extract_images = str(os.environ.get("ASSESS_REF_EXTRACT_IMAGES", "false")).lower() in {"1", "true", "yes", "on"}
    ocr_reader, ocr_status, ocr_error = _build_ocr_engine(enable_ocr)

    if ext == ".pdf":
        try:
            extracted = _extract_with_pymupdf(str(file_path), ocr_reader=ocr_reader)
        except Exception:
            extracted = _extract_with_pdfplumber(str(file_path))

        # Detect embedded images (visual content) even if OCR is disabled.
        try:
            import fitz  # PyMuPDF

            doc = fitz.open(str(file_path))
            embedded_images = 0
            for page_index in range(len(doc)):
                page = doc[page_index]
                embedded_images += len(page.get_images(full=True) or [])
            extracted["visual_count"] = max(int(extracted.get("visual_count", 0) or 0), embedded_images)
        except Exception:
            extracted["visual_count"] = int(extracted.get("visual_count", 0) or 0)

        # Optional: OCR embedded images in PDFs (diagrams/screenshots).
        if extract_images and ocr_reader:
            try:
                import fitz  # PyMuPDF

                doc = fitz.open(str(file_path))
                ocr_snippets: list[str] = []
                visual_count = int(extracted.get("visual_count", 0) or 0)

                for page_index in range(len(doc)):
                    page = doc[page_index]
                    images = page.get_images(full=True) or []
                    for img_idx, img in enumerate(images, start=1):
                        xref = img[0]
                        try:
                            base = doc.extract_image(xref)
                            img_bytes = base.get("image")
                            if not img_bytes:
                                continue
                            ocr_text = (ocr_reader(img_bytes) or "").strip()
                            if ocr_text:
                                ocr_snippets.append(
                                    f"[PDF_IMAGE_OCR page={page_index+1} image={img_idx}]\n{ocr_text}"
                                )
                            visual_count += 1
                        except Exception:
                            continue

                if ocr_snippets:
                    combined = (str(extracted.get("text") or "") + "\n\n" + "\n\n".join(ocr_snippets)).strip()
                    extracted["text"] = combined
                    extracted["extractor"] = str(extracted.get("extractor") or "pdf") + "+image-ocr"
                extracted["visual_count"] = visual_count
            except Exception:
                # Non-fatal: keep text-only extraction
                pass
        return {
            **extracted,
            "has_visual_content": int(extracted.get("visual_count", 0) or 0) > 0,
            "ocr_enabled": bool(ocr_reader),
            "ocr_status": ocr_status,
            "ocr_error": ocr_error,
        }

    if ext == ".docx":
        extracted = _extract_from_docx(str(file_path))

        # Detect embedded images (visual content) even if OCR is disabled.
        try:
            import zipfile

            with zipfile.ZipFile(str(file_path), "r") as zf:
                media_files = [n for n in zf.namelist() if n.startswith("word/media/")]
            extracted["visual_count"] = max(int(extracted.get("visual_count", 0) or 0), len(media_files))
        except Exception:
            extracted["visual_count"] = int(extracted.get("visual_count", 0) or 0)

        # Optional: OCR embedded images from DOCX (word/media/*).
        if extract_images and ocr_reader:
            try:
                import zipfile

                ocr_snippets: list[str] = []
                visual_count = int(extracted.get("visual_count", 0) or 0)
                with zipfile.ZipFile(str(file_path), "r") as zf:
                    media_files = [n for n in zf.namelist() if n.startswith("word/media/")]
                    for idx, name in enumerate(media_files, start=1):
                        try:
                            img_bytes = zf.read(name)
                            ocr_text = (ocr_reader(img_bytes) or "").strip()
                            if ocr_text:
                                ocr_snippets.append(f"[DOCX_IMAGE_OCR image={idx}]\n{ocr_text}")
                            visual_count += 1
                        except Exception:
                            continue

                if ocr_snippets:
                    combined = (str(extracted.get("text") or "") + "\n\n" + "\n\n".join(ocr_snippets)).strip()
                    extracted["text"] = combined
                    extracted["extractor"] = str(extracted.get("extractor") or "docx") + "+image-ocr"
                extracted["visual_count"] = visual_count
            except Exception:
                pass
        return {
            **extracted,
            "has_visual_content": int(extracted.get("visual_count", 0) or 0) > 0,
            "ocr_enabled": bool(ocr_reader),
            "ocr_status": ocr_status if ocr_reader else "disabled",
            "ocr_error": ocr_error if ocr_reader else "",
        }

    # images: OCR only
    if ext in {".jpg", ".jpeg", ".png"}:
        if not ocr_reader:
            return {
                "text": "",
                "page_count": 0,
                "pages": [],
                "extractor": "ocr-disabled",
                "visual_count": 1,
                "ocr_blocks": [],
                "has_visual_content": True,
                "ocr_enabled": False,
                "ocr_status": ocr_status,
                "ocr_error": ocr_error,
            }
        try:
            img_bytes = file_path.read_bytes()
            ocr_text = (ocr_reader(img_bytes) or "").strip()
        except Exception as e:
            return {
                "text": "",
                "page_count": 0,
                "pages": [],
                "extractor": "ocr-failed",
                "visual_count": 1,
                "ocr_blocks": [],
                "has_visual_content": True,
                "ocr_enabled": True,
                "ocr_status": "failed",
                "ocr_error": str(e),
            }

        blocks = [{"page": 1, "text": ocr_text[:1200]}] if ocr_text else []
        return {
            "text": ocr_text,
            "page_count": 1,
            "pages": [{"page": 1, "char_count": len(ocr_text), "visual_count": 1}],
            "extractor": "pytesseract",
            "visual_count": 1,
            "ocr_blocks": blocks,
            "has_visual_content": True,
            "ocr_enabled": True,
            "ocr_status": "ready" if ocr_text else "empty",
            "ocr_error": ocr_error,
        }

    raise ValueError(f"Unsupported reference file type: {ext}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--assessment-id", required=True, type=str)
    # For your updated design: one CLO per assessment + one sample answer per assessment.
    # Keep question-id optional for future expansion, but default to "ALL".
    parser.add_argument("--question-id", required=False, type=str, default="ALL")
    parser.add_argument(
        "--type",
        required=True,
        choices=["sample_answer", "rubric", "clo"],
        help="Reference artifact type",
    )
    parser.add_argument("--text", type=str, default=None, help="Raw text input")
    parser.add_argument("--file", type=str, default=None, help="Path to file (pdf/docx/jpg/png)")
    parser.add_argument("--title", type=str, default="", help="Optional display title")
    parser.add_argument(
        "--split-sample-answer",
        action="store_true",
        help="If set and type=sample_answer, will split one file into per-question sections.",
    )
    parser.add_argument(
        "--question-count",
        type=int,
        default=0,
        help="Optional expected question count (for split mode).",
    )

    args = parser.parse_args()

    assessment_id = str(args.assessment_id).strip()
    question_id = str(args.question_id or "ALL").strip() or "ALL"
    ref_type = str(args.type).strip()

    if not assessment_id:
        print(json.dumps({"success": False, "error": "assessment-id is required"}))
        return

    if not args.text and not args.file:
        print(json.dumps({"success": False, "error": "Provide either --text or --file"}))
        return

    extracted: dict[str, Any] = {}
    source_label = "text"

    if args.file:
        fp = Path(args.file).expanduser().resolve()
        if not fp.exists():
            print(json.dumps({"success": False, "error": f"File not found: {fp}"}))
            return
        extracted = _extract_text_from_file(fp)
        source_label = fp.name
        raw_text = str(extracted.get("text") or "").strip()
    else:
        raw_text = str(args.text or "").strip()
        extracted = {
            "text": raw_text,
            "page_count": 0,
            "pages": [],
            "extractor": "raw-text",
            "visual_count": 0,
            "ocr_blocks": [],
            "ocr_enabled": False,
            "ocr_status": "disabled",
            "ocr_error": "",
        }

    if not raw_text:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": "No extractable text found (empty)",
                    "assessment_id": assessment_id,
                    "question_id": question_id,
                    "type": ref_type,
                }
            )
        )
        return

    store = FAISSVectorStore(index_dir=REFERENCE_INDEX_DIR)

    # Split sample answer into per-question sections if requested.
    sections: dict[str, str]
    if ref_type == "sample_answer" and bool(args.split_sample_answer):
        sections = _split_sample_answer_by_question(raw_text, int(args.question_count or 0))
    else:
        sections = {question_id: raw_text}

    all_documents: list[Document] = []
    total_chunks_created = 0

    for q_key, section_text in sections.items():
        if not section_text.strip():
            continue

        content_hash = generate_content_hash(section_text)
        chunks = chunk_text(section_text, chunk_size=400, overlap=50)
        if not chunks:
            continue

        # Remove old chunks for this specific reference (re-ingest support)
        reference_key = f"{assessment_id}::{q_key}::{ref_type}"
        _ = store.delete_by_metadata("reference_key", reference_key, save=False)

        for idx, ch in enumerate(chunks):
            md = {
                "doc_type": "assessment_reference",
                "reference_key": reference_key,
                "assessment_id": assessment_id,
                "question_id": q_key,
                "reference_type": ref_type,
                "title": str(args.title or ""),
                "source": source_label,
                "chunk_index": idx,
                "total_chunks": len(chunks),
                "content_hash": content_hash,
                "ingested_at": datetime.utcnow().isoformat(),
            }
            all_documents.append(Document(page_content=ch, metadata=md))
            total_chunks_created += 1

    if not all_documents:
        print(json.dumps({"success": False, "error": "No documents produced for ingestion"}))
        return

    store.add_documents(all_documents, save=True)

    ocr_blocks = extracted.get("ocr_blocks") or []
    ocr_char_count = sum(len((b.get("text") or "")) for b in ocr_blocks) if isinstance(ocr_blocks, list) else 0

    print(
        json.dumps(
            {
                "timestamp": datetime.utcnow().isoformat(),
                "success": True,
                "assessment_id": assessment_id,
                "question_id": question_id,
                "type": ref_type,
                "source": source_label,
                "processed_count": len(sections),
                "section_keys": list(sections.keys()),
                "total_chunks_created": int(total_chunks_created),
                "total_embeddings_created": int(total_chunks_created),
                "visual_count": int(extracted.get("visual_count", 0) or 0),
                "page_count": int(extracted.get("page_count", 0) or 0),
                "page_metadata": extracted.get("pages") or [],
                "extractor": str(extracted.get("extractor") or ""),
                "ocr_enabled": bool(extracted.get("ocr_enabled")),
                "ocr_status": str(extracted.get("ocr_status") or ""),
                "ocr_error": str(extracted.get("ocr_error") or ""),
                "ocr_count": len(ocr_blocks) if isinstance(ocr_blocks, list) else 0,
                "ocr_char_count": int(ocr_char_count),
            }
        )
    )


if __name__ == "__main__":
    main()

