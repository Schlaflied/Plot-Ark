"""Safe parsers and normalizers for Enterprise L&D source uploads."""

from __future__ import annotations

import csv
import io
import os
import re
import zipfile
from dataclasses import dataclass, field
from html.parser import HTMLParser
from xml.etree import ElementTree

from openpyxl import load_workbook

from services.file_parser import extract_text_from_bytes


CONTENT_EXTENSIONS = {".zip", ".pdf", ".pptx", ".docx"}
REPORT_EXTENSIONS = {".csv", ".xlsx"}
MAX_CONTENT_FILES = 10
MAX_REPORT_FILES = 5
MAX_CONTENT_BYTES = 50 * 1024 * 1024
MAX_REPORT_BYTES = 25 * 1024 * 1024
MAX_SCORM_ENTRIES = 2_000
MAX_SCORM_UNCOMPRESSED_BYTES = 200 * 1024 * 1024


@dataclass
class ParsedSource:
    filename: str
    source_kind: str
    extracted_text: str = ""
    metadata: dict = field(default_factory=dict)
    events: list[dict] = field(default_factory=list)


class _VisibleTextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts: list[str] = []
        self._hidden_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag.lower() in {"script", "style", "noscript"}:
            self._hidden_depth += 1

    def handle_endtag(self, tag):
        if tag.lower() in {"script", "style", "noscript"} and self._hidden_depth:
            self._hidden_depth -= 1

    def handle_data(self, data):
        if not self._hidden_depth and data.strip():
            self.parts.append(data.strip())


def validate_upload_batch(files: list[tuple[str, bytes]], source_kind: str) -> None:
    """Enforce the same limits advertised by the Enterprise GUI."""
    is_report = source_kind == "lms_report"
    allowed = REPORT_EXTENSIONS if is_report else CONTENT_EXTENSIONS
    max_files = MAX_REPORT_FILES if is_report else MAX_CONTENT_FILES
    max_bytes = MAX_REPORT_BYTES if is_report else MAX_CONTENT_BYTES

    if not files:
        raise ValueError("No files uploaded")
    if len(files) > max_files:
        raise ValueError(f"Up to {max_files} {source_kind} files are allowed per upload")

    for filename, content in files:
        ext = os.path.splitext(filename.lower())[1]
        if ext not in allowed:
            raise ValueError(f"Unsupported {source_kind} file type: {ext or 'unknown'}")
        if len(content) > max_bytes:
            raise ValueError(f"{filename} exceeds the {max_bytes // (1024 * 1024)} MB limit")


def parse_enterprise_source(filename: str, content: bytes, source_kind: str) -> ParsedSource:
    ext = os.path.splitext(filename.lower())[1]
    if source_kind == "lms_report":
        rows = _read_csv(content) if ext == ".csv" else _read_xlsx(content)
        return ParsedSource(
            filename=filename,
            source_kind=source_kind,
            metadata={"row_count": len(rows), "columns": list(rows[0]) if rows else []},
            events=normalize_learning_rows(rows),
        )
    if ext == ".zip":
        return _parse_scorm(filename, content)
    text = extract_text_from_bytes(filename, content)
    return ParsedSource(
        filename=filename,
        source_kind=source_kind,
        extracted_text=text,
        metadata={"format": ext.lstrip("."), "character_count": len(text)},
    )


def _safe_zip_entries(archive: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    entries = archive.infolist()
    if len(entries) > MAX_SCORM_ENTRIES:
        raise ValueError("SCORM package contains too many files")
    if sum(item.file_size for item in entries) > MAX_SCORM_UNCOMPRESSED_BYTES:
        raise ValueError("SCORM package expands beyond the 200 MB safety limit")
    for item in entries:
        normalized = item.filename.replace("\\", "/")
        if normalized.startswith("/") or any(part == ".." for part in normalized.split("/")):
            raise ValueError("SCORM package contains an unsafe path")
        if item.flag_bits & 0x1:
            raise ValueError("Encrypted SCORM packages are not supported")
    return entries


def _parse_scorm(filename: str, content: bytes) -> ParsedSource:
    if not zipfile.is_zipfile(io.BytesIO(content)):
        raise ValueError("The ZIP file is not a valid SCORM package")
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        entries = _safe_zip_entries(archive)
        manifest_entry = next(
            (entry for entry in entries if entry.filename.lower().endswith("imsmanifest.xml")),
            None,
        )
        if not manifest_entry:
            raise ValueError("SCORM package is missing imsmanifest.xml")
        try:
            root = ElementTree.fromstring(archive.read(manifest_entry))
        except ElementTree.ParseError as exc:
            raise ValueError("SCORM manifest is not valid XML") from exc

        modules: list[dict] = []
        for item in root.iter():
            if item.tag.rsplit("}", 1)[-1] != "item":
                continue
            title = next(
                (
                    child.text.strip()
                    for child in item
                    if child.tag.rsplit("}", 1)[-1] == "title" and child.text and child.text.strip()
                ),
                "Untitled module",
            )
            modules.append({
                "id": item.attrib.get("identifier", f"module-{len(modules) + 1}"),
                "resource_id": item.attrib.get("identifierref", ""),
                "title": title,
            })

        text_parts = [module["title"] for module in modules]
        html_entries = [
            entry for entry in entries
            if entry.filename.lower().endswith((".html", ".htm")) and entry.file_size <= 5 * 1024 * 1024
        ][:100]
        for entry in html_entries:
            raw = archive.read(entry)
            decoded = raw.decode("utf-8", errors="replace")
            parser = _VisibleTextParser()
            parser.feed(decoded)
            if parser.parts:
                text_parts.append(f"[{entry.filename}] " + " ".join(parser.parts))

    extracted = "\n\n".join(text_parts)
    return ParsedSource(
        filename=filename,
        source_kind="training_content",
        extracted_text=extracted,
        metadata={
            "format": "scorm",
            "manifest": manifest_entry.filename,
            "module_count": len(modules),
            "modules": modules,
            "html_files_read": len(html_entries),
            "character_count": len(extracted),
        },
    )


def _read_csv(content: bytes) -> list[dict]:
    text = content.decode("utf-8-sig", errors="replace")
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    return [dict(row) for row in csv.DictReader(io.StringIO(text), dialect=dialect)]


def _read_xlsx(content: bytes) -> list[dict]:
    workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    sheet = workbook.active
    iterator = sheet.iter_rows(values_only=True)
    headers = [str(value or "").strip() for value in next(iterator, ())]
    rows = []
    for values in iterator:
        if not any(value is not None and str(value).strip() for value in values):
            continue
        rows.append({headers[index]: value for index, value in enumerate(values) if index < len(headers)})
    workbook.close()
    return rows


def _key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _pick(row: dict, aliases: tuple[str, ...], default=None):
    keyed = {_key(str(key)): value for key, value in row.items()}
    for alias in aliases:
        value = keyed.get(_key(alias))
        if value not in (None, ""):
            return value
    return default


def _number(value, default=0):
    if value in (None, ""):
        return default
    try:
        return float(str(value).strip().rstrip("%"))
    except ValueError:
        return default


def _completion(value) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "complete", "completed", "passed"}


def normalize_learning_rows(rows: list[dict]) -> list[dict]:
    """Map common LMS export columns into a vendor-neutral event contract."""
    events = []
    for index, row in enumerate(rows, start=1):
        learner = str(_pick(row, ("learner_id", "student_id", "user_id", "email", "learner", "student"), f"row-{index}"))
        module_id = str(_pick(row, ("module_id", "activity_id", "sco_id", "module", "course_module"), "course"))
        module_title = str(_pick(row, ("module_title", "activity_name", "module_name", "title"), module_id))
        completed = _completion(_pick(row, ("completion", "completed", "completion_status", "status"), False))
        events.append({
            "learner_ref": learner,
            "module_id": module_id,
            "module_title": module_title,
            "event_type": "completed" if completed else "progressed",
            "completion": completed,
            "score": _number(_pick(row, ("score", "result_score", "grade"))),
            "duration_seconds": _number(_pick(row, ("duration_seconds", "time_seconds", "duration", "time_spent"))),
            "attempts": int(_number(_pick(row, ("attempts", "attempt_count", "tries")), 1)),
            "occurred_at": _pick(row, ("timestamp", "completed_at", "date", "occurred_at")),
            "raw": row,
        })
    return events
