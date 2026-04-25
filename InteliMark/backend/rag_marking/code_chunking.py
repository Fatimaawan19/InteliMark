"""Chunking helpers for source code.

We keep chunks relatively small and line-oriented so:
- Retrieval can quote relevant code precisely
- Metadata can include line ranges for explainability
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Tuple


@dataclass(frozen=True)
class CodeChunk:
    text: str
    start_line: int
    end_line: int


def chunk_code_by_lines(
    code: str,
    *,
    chunk_lines: int = 80,
    overlap_lines: int = 10,
) -> List[CodeChunk]:
    """Split code into overlapping line chunks.

    Line-oriented chunking works well across languages without requiring a parser.
    """
    if chunk_lines <= 0:
        raise ValueError("chunk_lines must be > 0")
    if overlap_lines < 0 or overlap_lines >= chunk_lines:
        raise ValueError("overlap_lines must be >= 0 and < chunk_lines")

    lines = code.splitlines()
    if not lines:
        return []

    out: List[CodeChunk] = []
    start = 0
    while start < len(lines):
        end = min(start + chunk_lines, len(lines))
        chunk = "\n".join(lines[start:end]).strip("\n")
        if chunk.strip():
            out.append(CodeChunk(text=chunk, start_line=start + 1, end_line=end))
        if end >= len(lines):
            break
        start = max(0, end - overlap_lines)

    return out

