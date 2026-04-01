"""File text extraction: PDF, PPTX, DOCX."""

import os
import io
import fitz  # pymupdf
import docx as _docx_lib


def extract_text_from_bytes(filename: str, content: bytes) -> str:
    """Extract plain text from PDF, PPTX, or DOCX bytes."""
    ext = os.path.splitext(filename.lower())[1]
    if ext == ".pdf":
        doc = fitz.open(stream=content, filetype="pdf")
        pages = [page.get_text() for page in doc]
        doc.close()
        return "\n".join(pages)
    elif ext == ".pptx":
        from pptx import Presentation
        prs = Presentation(io.BytesIO(content))
        texts = []
        for slide in prs.slides:
            for shape in slide.shapes:
                if shape.has_text_frame:
                    texts.append(shape.text)
        return "\n".join(texts)
    elif ext == ".docx":
        doc = _docx_lib.Document(io.BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    return ""
