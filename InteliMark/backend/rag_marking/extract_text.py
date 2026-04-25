import json
import os
import sys
import time


def _extract_with_pymupdf(file_path: str):
    import fitz  # PyMuPDF

    doc = fitz.open(file_path)
    pages = []
    full_text = []
    for i, page in enumerate(doc, start=1):
        text = page.get_text("text") or ""
        pages.append({"page": i, "char_count": len(text)})
        full_text.append(text)
    combined = "\n".join(full_text).strip()
    return {
        "text": combined,
        "page_count": len(doc),
        "pages": pages,
        "extractor": "pymupdf",
    }


def _extract_with_pdfplumber(file_path: str):
    import pdfplumber

    pages = []
    full_text = []
    with pdfplumber.open(file_path) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            pages.append({"page": i, "char_count": len(text)})
            full_text.append(text)
    combined = "\n".join(full_text).strip()
    return {
        "text": combined,
        "page_count": len(pages),
        "pages": pages,
        "extractor": "pdfplumber",
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Missing file path argument"}))
        sys.exit(1)

    file_path = sys.argv[1]
    if not os.path.exists(file_path):
        print(json.dumps({"success": False, "error": f"File not found: {file_path}"}))
        sys.exit(1)

    started = time.time()
    try:
        result = _extract_with_pymupdf(file_path)
    except Exception:
        try:
            result = _extract_with_pdfplumber(file_path)
        except Exception as extraction_error:
            print(json.dumps({"success": False, "error": str(extraction_error)}))
            sys.exit(1)

    duration_ms = int((time.time() - started) * 1000)
    text = result["text"]

    print(
        json.dumps(
            {
                "success": True,
                "text": text,
                "char_count": len(text),
                "page_count": result["page_count"],
                "pages": result["pages"],
                "extractor": result["extractor"],
                "duration_ms": duration_ms,
            }
        )
    )


if __name__ == "__main__":
    main()
