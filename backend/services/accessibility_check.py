"""First-pass accessibility check for course materials (HTML and DOCX).

Tests only the subset of WCAG 2.1 that can be detected automatically from document
structure. It cannot prove a document is accessible: screen-reader behaviour, keyboard
use, caption quality, reading order and many contrast cases still need manual review.
Findings are advisory and assess the materials, not learners or instructors.

Parsing uses BeautifulSoup (HTML) and python-docx (DOCX). No existing lightweight Python
WCAG checker covers DOCX, so the rules below are small and each names its criterion.
"""

import io
import os
import re
from urllib.parse import urlparse

from bs4 import BeautifulSoup

SUPPORTED_EXTENSIONS = (".html", ".htm", ".docx")
SEVERITY_ORDER = ("high", "medium", "low")

DISCLAIMER = (
    "Automated checks cover only part of WCAG 2.1 and cannot show that a document is "
    "accessible. Manual review is still required: screen reader testing, keyboard use, "
    "caption quality, reading order and colour contrast beyond explicit text colours."
)
NO_FINDINGS_MESSAGE = "No automated findings."

VAGUE_LINK_TEXT = {
    "click here", "here", "link", "this link", "read more", "more", "learn more",
    "click", "this", "details", "info", "more info", "more information",
}
VIDEO_HOSTS = ("youtube.com", "youtu.be", "vimeo.com", "wistia.com", "loom.com", "kaltura.com")
VIDEO_EXTENSIONS = (".mp4", ".webm", ".mov", ".m4v", ".avi")
CAPTION_WORDS = re.compile(r"caption|transcript|subtitle", re.IGNORECASE)

NAMED_COLORS = {
    "black": (0, 0, 0), "white": (255, 255, 255), "red": (255, 0, 0), "gray": (128, 128, 128),
    "grey": (128, 128, 128), "silver": (192, 192, 192), "yellow": (255, 255, 0),
    "lightgray": (211, 211, 211), "lightgrey": (211, 211, 211), "blue": (0, 0, 255),
    "green": (0, 128, 0), "orange": (255, 165, 0), "navy": (0, 0, 128),
}

CRITERIA = {
    "1.1.1": "Non-text Content",
    "1.2.2": "Captions (Prerecorded)",
    "1.3.1": "Info and Relationships",
    "1.4.3": "Contrast (Minimum)",
    "2.4.4": "Link Purpose (In Context)",
    "2.4.6": "Headings and Labels",
    "3.1.1": "Language of Page",
}


class AccessibilityCheckError(Exception):
    """Unsupported format or unreadable file."""


def _finding(rule, severity, criterion, location, message, fix):
    return {
        "rule": rule,
        "severity": severity,
        "wcag_criterion": criterion,
        "wcag_name": CRITERIA[criterion],
        "location": location,
        "message": message,
        "suggested_fix": fix,
    }


# ---------- colour contrast ----------

def parse_color(value):
    if not value:
        return None
    v = value.strip().lower()
    if v in NAMED_COLORS:
        return NAMED_COLORS[v]
    m = re.fullmatch(r"#([0-9a-f]{3}|[0-9a-f]{6})", v)
    if m:
        h = m.group(1)
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    m = re.fullmatch(r"rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)", v)
    if m:
        return tuple(min(255, int(g)) for g in m.groups())
    return None


def _luminance(rgb):
    def ch(c):
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(fg, bg):
    l1, l2 = _luminance(fg), _luminance(bg)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def _contrast_finding(fg, bg, location, large=False):
    """Return a finding if fg/bg fall below WCAG AA; bg defaults to white if unspecified."""
    ratio = contrast_ratio(fg, bg or (255, 255, 255))
    needed = 3.0 if large else 4.5
    if ratio >= needed:
        return None
    note = "" if bg else " (assuming a white background)"
    return _finding(
        "low-contrast-text", "medium", "1.4.3", location,
        f"Text colour contrast is {ratio:.1f}:1, below the {needed}:1 minimum{note}.",
        f"Use a darker text colour or lighter background to reach at least {needed}:1.",
    )


def _is_video_url(url):
    if not url:
        return False
    p = urlparse(url)
    host = (p.netloc or "").lower()
    return any(host == h or host.endswith("." + h) for h in VIDEO_HOSTS) or \
        p.path.lower().endswith(VIDEO_EXTENSIONS)


def _check_headings(levels, findings, has_body_text):
    """levels: list of (level, text, location) in document order."""
    if not levels:
        if has_body_text:
            findings.append(_finding(
                "no-headings", "medium", "2.4.6", "Document",
                "The document has no headings.",
                "Add real heading styles to structure the content so learners can navigate it."))
        return
    prev = 0
    for level, text, loc in levels:
        if prev and level > prev + 1:
            findings.append(_finding(
                "skipped-heading-level", "medium", "1.3.1", loc,
                f"Heading level jumps from H{prev} to H{level} (\"{text[:40]}\").",
                f"Use H{prev + 1} here, or restructure so levels are not skipped."))
        prev = level


def _video_link_finding(url, doc_text, findings, location):
    if not CAPTION_WORDS.search(doc_text):
        findings.append(_finding(
            "video-link-no-caption-mention", "medium", "1.2.2", location,
            "Video link found, but the document never mentions captions or a transcript.",
            "Confirm the video has accurate captions and link to a transcript."))


# ---------- HTML ----------

def check_html(content: bytes):
    try:
        html = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        html = content.decode("latin-1")
    if not html.strip():
        raise AccessibilityCheckError("The file is empty.")
    soup = BeautifulSoup(html, "html.parser")
    if not soup.find(True):
        raise AccessibilityCheckError("The file does not contain any HTML elements.")
    findings = []

    root = soup.find("html")
    if not root or not (root.get("lang") or "").strip():
        findings.append(_finding(
            "missing-language", "medium", "3.1.1", "<html>",
            "The page language is not set.",
            'Add a lang attribute, e.g. <html lang="en">.'))

    for i, img in enumerate(soup.find_all("img"), 1):
        decorative = img.get("role") in ("presentation", "none") or img.get("aria-hidden") == "true"
        if img.get("alt") is None and not decorative:
            src = (img.get("src") or "")[:40]
            findings.append(_finding(
                "image-missing-alt", "high", "1.1.1", f"Image {i} ({src})",
                "Image has no alt attribute.",
                'Add alt text describing the image, or alt="" if it is purely decorative.'))

    levels = []
    for h in soup.find_all(re.compile(r"^h[1-6]$")):
        txt = h.get_text(strip=True)
        levels.append((int(h.name[1]), txt, f"<{h.name}> \"{txt[:30]}\""))
    body_text = soup.get_text(" ", strip=True)
    _check_headings(levels, findings, len(body_text.split()) > 150)

    for a in soup.find_all("a", href=True):
        text = a.get_text(" ", strip=True)
        aria = (a.get("aria-label") or "").strip()
        labelled = aria or (a.get("title") or "").strip() or a.find("img", alt=lambda v: bool(v))
        if not text and not labelled:
            findings.append(_finding(
                "empty-link", "high", "2.4.4", f"Link to {a['href'][:40]}",
                "Link has no text.", "Add descriptive link text."))
        elif text.lower().strip(" .:!") in VAGUE_LINK_TEXT and not aria:
            findings.append(_finding(
                "vague-link-text", "medium", "2.4.4", f"Link \"{text}\" to {a['href'][:40]}",
                f"Link text \"{text}\" gives no context out of its surroundings.",
                "Rewrite the link text to say where it goes, e.g. \"Course syllabus (PDF)\"."))
        if _is_video_url(a["href"]):
            _video_link_finding(a["href"], body_text, findings, f"Link to {a['href'][:50]}")

    for i, table in enumerate(soup.find_all("table"), 1):
        if table.get("role") in ("presentation", "none"):
            continue
        if not table.find("th"):
            findings.append(_finding(
                "table-no-headers", "high", "1.3.1", f"Table {i}",
                "Table has no header cells.",
                "Mark the header row or column with <th> (and scope) elements."))

    for el in soup.find_all(style=True):
        style = {}
        for decl in el["style"].split(";"):
            k, _, v = decl.partition(":")
            if k.strip():
                style[k.strip().lower()] = v.strip()
        fg = parse_color(style.get("color"))
        if not fg or not el.get_text(strip=True):
            continue
        bg = parse_color(style.get("background-color") or style.get("background"))
        size = re.match(r"(\d+(?:\.\d+)?)(pt|px)", style.get("font-size", ""))
        large = bool(size and ((size.group(2) == "pt" and float(size.group(1)) >= 18) or
                               (size.group(2) == "px" and float(size.group(1)) >= 24)))
        f = _contrast_finding(fg, bg, f"<{el.name}> \"{el.get_text(strip=True)[:30]}\"", large)
        if f:
            findings.append(f)

    for i, v in enumerate(soup.find_all("video"), 1):
        if not v.find("track", kind=lambda k: bool(k) and k.lower() in ("captions", "subtitles")):
            findings.append(_finding(
                "video-no-captions", "high", "1.2.2", f"Video {i}",
                "Video element has no captions track.",
                'Add <track kind="captions"> with a caption file.'))

    return findings


# ---------- DOCX ----------

_NS_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_NS_WP = "{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}"
_NS_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def check_docx(content: bytes):
    import docx
    if not content:
        raise AccessibilityCheckError("The file is empty.")
    try:
        doc = docx.Document(io.BytesIO(content))
    except Exception as e:
        raise AccessibilityCheckError(
            f"The file could not be read as a DOCX document ({e.__class__.__name__}).")
    findings = []
    body = doc.element.body

    # language: core properties, style defaults, or any run
    lang_set = bool((doc.core_properties.language or "").strip())
    if not lang_set:
        for el in list(doc.styles.element.iter(_NS_W + "lang")) + list(body.iter(_NS_W + "lang")):
            if el.get(_NS_W + "val") or el.get(_NS_W + "eastAsia"):
                lang_set = True
                break
    if not lang_set:
        findings.append(_finding(
            "missing-language", "medium", "3.1.1", "Document",
            "The document language is not set.",
            "Set the proofing language (Review > Language) so screen readers pick the right voice."))

    # images
    for i, dp in enumerate(body.iter(_NS_WP + "docPr"), 1):
        if not ((dp.get("descr") or "").strip() or (dp.get("title") or "").strip()):
            findings.append(_finding(
                "image-missing-alt", "high", "1.1.1", f"Image {i}",
                "Image has no alternative text.",
                "Right-click the image > Alt Text, and describe it (or mark it decorative)."))

    # headings
    levels, words = [], 0
    for n, p in enumerate(doc.paragraphs, 1):
        text = p.text.strip()
        words += len(text.split())
        name = (p.style.name if p.style is not None else "") or ""
        m = re.fullmatch(r"Heading (\d)", name)
        if m and text:
            levels.append((int(m.group(1)), text, f"Paragraph {n} \"{text[:30]}\""))
    _check_headings(levels, findings, words > 150)

    # hyperlinks
    doc_text = "\n".join(p.text for p in doc.paragraphs)
    for h in body.iter(_NS_W + "hyperlink"):
        rid = h.get(_NS_R + "id")
        url = doc.part.rels[rid].target_ref if rid in doc.part.rels else ""
        text = "".join(t.text or "" for t in h.iter(_NS_W + "t")).strip()
        if not text:
            findings.append(_finding(
                "empty-link", "high", "2.4.4", f"Link to {url[:40]}",
                "Link has no text.", "Add descriptive link text."))
        elif text.lower().strip(" .:!") in VAGUE_LINK_TEXT:
            findings.append(_finding(
                "vague-link-text", "medium", "2.4.4", f"Link \"{text}\" to {url[:40]}",
                f"Link text \"{text}\" gives no context out of its surroundings.",
                "Rewrite the link text to say where it goes."))
        if _is_video_url(url):
            _video_link_finding(url, doc_text, findings, f"Link to {url[:50]}")

    # tables
    for i, t in enumerate(doc.tables, 1):
        first = t.rows[0]._tr if t.rows else None
        marked = first is not None and first.find(f"{_NS_W}trPr/{_NS_W}tblHeader") is not None
        if not marked:
            findings.append(_finding(
                "table-no-headers", "high", "1.3.1", f"Table {i}",
                "Table has no header row marked.",
                'Select the first row > Table Properties > Row > "Repeat as header row".'))

    # explicit text colours (assumes a white page unless run shading is set)
    seen = set()
    for r in body.iter(_NS_W + "r"):
        c = r.find(f"{_NS_W}rPr/{_NS_W}color")
        text = "".join(t.text or "" for t in r.iter(_NS_W + "t")).strip()
        if c is None or not text:
            continue
        fg = parse_color("#" + (c.get(_NS_W + "val") or ""))
        if not fg:
            continue
        bg = None
        shd = r.find(f"{_NS_W}rPr/{_NS_W}shd")
        if shd is not None and shd.get(_NS_W + "fill") not in (None, "auto"):
            bg = parse_color("#" + shd.get(_NS_W + "fill"))
            if bg is None:
                continue
        sz = r.find(f"{_NS_W}rPr/{_NS_W}sz")
        large = bool(sz is not None and sz.get(_NS_W + "val", "0").isdigit()
                     and int(sz.get(_NS_W + "val")) >= 36)  # half-points
        f = _contrast_finding(fg, bg, f"Text \"{text[:30]}\"", large)
        if f and (fg, bg) not in seen:
            seen.add((fg, bg))
            findings.append(f)
    return findings


# ---------- entry point ----------

def check_accessibility(filename: str, content: bytes) -> dict:
    ext = os.path.splitext((filename or "").lower())[1]
    if ext not in SUPPORTED_EXTENSIONS:
        raise AccessibilityCheckError(
            f"Unsupported file type '{ext or filename}'. Supported: HTML and DOCX "
            "(PDF and PPTX are not covered yet).")
    if not content:
        raise AccessibilityCheckError("The file is empty.")
    findings = check_docx(content) if ext == ".docx" else check_html(content)
    findings.sort(key=lambda f: SEVERITY_ORDER.index(f["severity"]))
    grouped = {s: [f for f in findings if f["severity"] == s] for s in SEVERITY_ORDER}
    return {
        "filename": filename,
        "format": "docx" if ext == ".docx" else "html",
        "finding_count": len(findings),
        "findings": findings,
        "findings_by_severity": grouped,
        "summary": NO_FINDINGS_MESSAGE if not findings else
        f"{len(findings)} automated finding(s): " +
        ", ".join(f"{len(v)} {k}" for k, v in grouped.items() if v) + ".",
        "disclaimer": DISCLAIMER,
    }
