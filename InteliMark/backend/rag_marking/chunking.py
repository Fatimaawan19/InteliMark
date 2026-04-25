"""Text chunking helpers.

Chunking is the bridge between raw extracted text and vector search.
We split long documents into smaller pieces so the embedding model and the
vector database can work with them effectively.
"""

from typing import List


def chunk_text(text: str, chunk_size: int = 400, overlap: int = 50) -> List[str]:
    """Split text into overlapping chunks.

    Why overlap matters:
    - A topic can start at the end of one chunk and continue in the next.
    - Small overlap keeps the meaning connected across chunk boundaries.
    """

    words = text.split()
    if not words:
        return []

    if overlap >= chunk_size:
        raise ValueError("overlap must be smaller than chunk_size")

    chunks: List[str] = []
    start = 0

    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunks.append(" ".join(words[start:end]))

        if end == len(words):
            break

        start = end - overlap

    return chunks
