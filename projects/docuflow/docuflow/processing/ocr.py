"""
OCR processing engine — extracts text from various document formats.

Supported formats:
  PDF  → pdfplumber (native text) + Tesseract fallback (scanned pages)
  DOCX → python-docx
  HTML → BeautifulSoup
  PNG/JPEG/TIFF → Tesseract 5
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import pytesseract
from PIL import Image


@dataclass
class OcrPage:
    page_number: int
    text: str
    confidence: float
    is_scanned: bool


@dataclass
class OcrResult:
    pages: list[OcrPage] = field(default_factory=list)
    full_text: str = ""
    total_pages: int = 0
    avg_confidence: float = 0.0
    language: str = "eng"
    error: Optional[str] = None

    def __post_init__(self) -> None:
        if self.pages:
            self.full_text  = "\n\n".join(p.text for p in self.pages)
            self.total_pages = len(self.pages)
            self.avg_confidence = sum(p.confidence for p in self.pages) / len(self.pages)


class OcrEngine:
    """
    Unified OCR engine that selects the best extraction strategy per format.
    """

    def __init__(self, language: str = "eng") -> None:
        self.language = language

    def process(self, content: bytes, content_type: str) -> OcrResult:
        """Extract text from a document, selecting strategy by content type."""
        handlers = {
            "application/pdf": self._process_pdf,
            "application/msword": self._process_docx,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": self._process_docx,
            "text/html": self._process_html,
            "image/png":  self._process_image,
            "image/jpeg": self._process_image,
            "image/tiff": self._process_image,
        }
        handler = handlers.get(content_type)
        if not handler:
            return OcrResult(error=f"Unsupported content type: {content_type}")
        try:
            return handler(content)
        except Exception as exc:
            return OcrResult(error=str(exc))

    def _process_pdf(self, content: bytes) -> OcrResult:
        import pdfplumber
        pages: list[OcrPage] = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for i, page in enumerate(pdf.pages, start=1):
                text = page.extract_text() or ""
                if text.strip():
                    # Native text layer found
                    pages.append(OcrPage(
                        page_number=i,
                        text=text,
                        confidence=1.0,
                        is_scanned=False,
                    ))
                else:
                    # Scanned page — fall back to Tesseract
                    img = page.to_image(resolution=300).original
                    pages.append(self._ocr_image(img, i, is_scanned=True))
        return OcrResult(pages=pages)

    def _process_docx(self, content: bytes) -> OcrResult:
        from docx import Document
        doc = Document(io.BytesIO(content))
        text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        return OcrResult(pages=[OcrPage(1, text, 1.0, False)])

    def _process_html(self, content: bytes) -> OcrResult:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(content, "html.parser")
        for tag in soup(["script", "style"]):
            tag.decompose()
        text = re.sub(r"\s+", " ", soup.get_text()).strip()
        return OcrResult(pages=[OcrPage(1, text, 1.0, False)])

    def _process_image(self, content: bytes) -> OcrResult:
        img = Image.open(io.BytesIO(content)).convert("RGB")
        page = self._ocr_image(img, page_number=1, is_scanned=True)
        return OcrResult(pages=[page])

    def _ocr_image(self, img: Image.Image, page_number: int, is_scanned: bool) -> OcrPage:
        data = pytesseract.image_to_data(
            img,
            lang=self.language,
            output_type=pytesseract.Output.DICT,
        )
        words = [
            (w, int(c))
            for w, c in zip(data["text"], data["conf"])
            if w.strip() and int(c) > 0
        ]
        text = " ".join(w for w, _ in words)
        conf = (sum(c for _, c in words) / len(words) / 100.0) if words else 0.0
        return OcrPage(
            page_number=page_number,
            text=text,
            confidence=conf,
            is_scanned=is_scanned,
        )
