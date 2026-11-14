"""LMS export mapping presets for the Enterprise L&D workspace.

A preset maps the column names a given platform tends to use in completion /
activity exports onto Plot Ark's vendor-neutral evidence fields. Presets are
only *proposals*: the caller always gets back the unmatched and ambiguous
columns, can override any field, and nothing is dropped silently.

File-based exports only; no credentials and no live LMS connections.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass

from openpyxl import load_workbook

from services.enterprise_ingest import _completion, _number

# Evidence fields a mapping can target. ``learner_ref``, ``module`` (id or
# title) and ``completion`` are required; the rest are optional.
EVIDENCE_FIELDS = (
    "learner_ref", "module_id", "module_title", "completion",
    "score", "duration_seconds", "attempts", "occurred_at",
)
REQUIRED_FIELDS = ("learner_ref", "completion")
FIELD_LABELS = {
    "learner_ref": "Learner identifier",
    "module_id": "Module / content ID",
    "module_title": "Module / content title",
    "completion": "Completion status or date",
    "score": "Score",
    "duration_seconds": "Time spent",
    "attempts": "Attempts",
    "occurred_at": "Activity / completion date",
}

MAX_ROWS = 200_000
MIN_DETECTION_MATCHES = 3


class MappingError(ValueError):
    """Raised for files or mappings that cannot be turned into evidence."""


@dataclass(frozen=True)
class Preset:
    platform: str
    label: str
    source_note: str
    # field -> aliases, in priority order (first match wins; others are
    # reported as ambiguous, never dropped).
    columns: dict


# Field names come from each vendor's public documentation / community
# articles (D2L Brightspace Data Sets, Canvas gradebook export reserved
# columns, Workday Learning enrollment & completion reports). Exports differ
# by tenant configuration, which is why every proposal is reviewable.
PRESETS: dict[str, Preset] = {
    "workday_learning": Preset(
        platform="workday_learning",
        label="Workday Learning",
        source_note="Learning Enrollment / Learner Records style report",
        columns={
            "learner_ref": ("Employee ID", "Worker ID", "Worker", "Employee", "Learner"),
            "module_id": ("Learning Content ID", "Learning Course ID", "Content ID"),
            "module_title": ("Learning Content", "Learning Content Title", "Course Title", "Enrolled Content"),
            "completion": ("Completion Status", "Enrollment Status", "Completion Date"),
            "score": ("Score", "Final Score", "Grade"),
            "duration_seconds": ("Time Spent", "Duration", "Total Time Spent"),
            "attempts": ("Attempts", "Attempt Count"),
            "occurred_at": ("Completion Date and Time", "Completion Date", "Last Activity Date"),
        },
    ),
    "d2l_brightspace": Preset(
        platform="d2l_brightspace",
        label="D2L Brightspace",
        source_note="Data Hub Content User Progress / Completion data sets",
        columns={
            "learner_ref": ("UserId", "User Id", "Username", "OrgDefinedId"),
            "module_id": ("ContentObjectId", "Content Object Id", "OrgUnitId"),
            "module_title": ("Title", "ContentObjectTitle", "Content Object Title", "Topic"),
            "completion": ("IsRead", "AutomaticDateCompleted", "ManualDateCompleted", "Completion Status"),
            "score": ("Score", "Grade Value", "PointsNumerator"),
            "duration_seconds": ("TimeInContent", "Time In Content", "Time Spent"),
            "attempts": ("Attempts", "AttemptNumber"),
            "occurred_at": ("LastVisited", "Last Visited", "AutomaticDateCompleted", "LastModified"),
        },
    ),
    "canvas": Preset(
        platform="canvas",
        label="Canvas",
        source_note="Gradebook / course participation export",
        columns={
            "learner_ref": ("SIS User ID", "ID", "Student ID", "SIS Login ID", "Student SIS ID"),
            "module_id": ("Module ID", "Assignment ID", "Course ID"),
            "module_title": ("Module", "Module Name", "Assignment", "Course Name", "Course"),
            "completion": ("Completion Status", "Completed", "Requirement Status", "Submission Status"),
            "score": ("Current Score", "Final Score", "Unposted Current Score", "Score"),
            "duration_seconds": ("Total Activity Time", "Time Spent", "Activity Time"),
            "attempts": ("Attempts", "Attempt"),
            "occurred_at": ("Last Activity", "Last Accessed", "Submitted At", "Last Activity Date"),
        },
    ),
}


def _key(value) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value).lower())


def list_presets() -> list[dict]:
    return [
        {"platform": p.platform, "label": p.label, "source_note": p.source_note}
        for p in PRESETS.values()
    ]


# --------------------------------------------------------------------------
# Reading tabular files
# --------------------------------------------------------------------------

def read_table(filename: str, content: bytes) -> tuple[list[str], list[dict]]:
    """Return ``(headers, rows)`` or raise MappingError for malformed files."""
    name = filename.lower()
    if not content or not content.strip():
        raise MappingError(f"{filename} is empty")
    try:
        if name.endswith(".csv"):
            headers, rows = _read_csv(content)
        elif name.endswith(".xlsx"):
            headers, rows = _read_xlsx(content)
        else:
            raise MappingError(f"{filename}: only CSV and XLSX exports can be mapped")
    except MappingError:
        raise
    except Exception as exc:  # malformed zip/xml/csv
        raise MappingError(f"{filename} could not be read as a table: {exc}") from exc
    headers = [h for h in headers if h]
    if not headers:
        raise MappingError(f"{filename} has no header row")
    if len(set(_key(h) for h in headers)) != len(headers):
        raise MappingError(f"{filename} has duplicate column headers; rename them and re-upload")
    if len(rows) > MAX_ROWS:
        raise MappingError(f"{filename} has more than {MAX_ROWS} rows")
    return headers, rows


def _read_csv(content: bytes):
    if b"\x00" in content[:4096]:
        raise MappingError("file appears to be binary, not CSV")
    text = content.decode("utf-8-sig", errors="replace")
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    headers = [(h or "").strip() for h in (reader.fieldnames or [])]
    rows = []
    for raw in reader:
        rows.append({
            h.strip(): v for h, v in raw.items()
            if h is not None and h.strip()
        })
    return headers, rows


def _read_xlsx(content: bytes):
    workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    try:
        iterator = workbook.active.iter_rows(values_only=True)
        headers = [str(v or "").strip() for v in next(iterator, ())]
        rows = []
        for values in iterator:
            if not any(v is not None and str(v).strip() for v in values):
                continue
            rows.append({
                headers[i]: v for i, v in enumerate(values)
                if i < len(headers) and headers[i]
            })
    finally:
        workbook.close()
    return headers, rows


# --------------------------------------------------------------------------
# Proposing a mapping
# --------------------------------------------------------------------------

def _match_preset(headers: list[str], preset: Preset) -> dict:
    by_key: dict[str, list[str]] = {}
    for header in headers:
        by_key.setdefault(_key(header), []).append(header)

    mapping: dict[str, str] = {}
    ambiguous: dict[str, list[str]] = {}
    used: set[str] = set()
    for field in EVIDENCE_FIELDS:
        candidates: list[str] = []
        for alias in preset.columns.get(field, ()):
            for header in by_key.get(_key(alias), []):
                if header not in candidates:
                    candidates.append(header)
        # Prefer a column no other field has already claimed.
        free = [c for c in candidates if c not in used]
        chosen = (free or candidates or [None])[0]
        if chosen is None:
            continue
        mapping[field] = chosen
        used.add(chosen)
        others = [c for c in candidates if c != chosen]
        if others:
            ambiguous[field] = others
    return {"mapping": mapping, "ambiguous": ambiguous}


def propose_mapping(headers: list[str], platform: str | None = None) -> dict:
    """Propose a mapping for ``headers``.

    ``platform`` may be a preset id, ``"auto"``/None to detect, or anything
    else (including ``"manual"``) which falls back to manual mapping.
    """
    requested = (platform or "auto").strip().lower()
    if requested == "auto":
        scored = []
        for preset in PRESETS.values():
            match = _match_preset(headers, preset)
            scored.append((len(match["mapping"]), preset, match))
        scored.sort(key=lambda item: -item[0])
        best_score, preset, match = scored[0]
        tie = len(scored) > 1 and scored[1][0] == best_score
        if best_score < MIN_DETECTION_MATCHES or tie:
            preset, match = None, None
    elif requested in PRESETS:
        preset = PRESETS[requested]
        match = _match_preset(headers, preset)
    else:
        preset, match = None, None

    if preset is None:
        mapping, ambiguous, detected = {}, {}, None
    else:
        mapping, ambiguous, detected = match["mapping"], match["ambiguous"], preset.platform

    mapped_columns = set(mapping.values())
    unmatched = [h for h in headers if h not in mapped_columns]
    missing = missing_required(mapping)
    return {
        "platform": detected,
        "platform_label": preset.label if preset else None,
        "manual_required": preset is None,
        "mapping": mapping,
        "ambiguous": ambiguous,
        "unmatched_columns": unmatched,
        "missing_required": missing,
        "columns": headers,
        "fields": [
            {"field": f, "label": FIELD_LABELS[f], "required": f in REQUIRED_FIELDS or f in ("module_id", "module_title")}
            for f in EVIDENCE_FIELDS
        ],
    }


def missing_required(mapping: dict) -> list[str]:
    missing = [f for f in REQUIRED_FIELDS if not mapping.get(f)]
    if not mapping.get("module_id") and not mapping.get("module_title"):
        missing.append("module_id or module_title")
    return missing


# --------------------------------------------------------------------------
# Applying a mapping
# --------------------------------------------------------------------------

def validate_mapping(mapping: dict, headers: list[str]) -> dict:
    clean: dict[str, str] = {}
    for field, column in (mapping or {}).items():
        if field not in EVIDENCE_FIELDS:
            raise MappingError(f"Unknown evidence field: {field}")
        if column in (None, ""):
            continue
        if column not in headers:
            raise MappingError(f"Column '{column}' (for {FIELD_LABELS[field]}) is not in the file")
        clean[field] = column
    missing = missing_required(clean)
    if missing:
        labels = [FIELD_LABELS.get(m, m.replace("_", " ")) for m in missing]
        raise MappingError("Missing required field(s): " + ", ".join(labels) + ". Choose a column for each.")
    return clean


def apply_mapping(rows: list[dict], mapping: dict) -> list[dict]:
    """Turn raw rows into evidence events using a validated mapping."""
    completion_col = mapping["completion"]
    completion_is_date = "date" in _key(completion_col)
    events = []
    for index, row in enumerate(rows, start=1):
        def get(field):
            col = mapping.get(field)
            value = row.get(col) if col else None
            return None if value in (None, "") else value

        learner = get("learner_ref")
        if learner is None:
            learner = f"row-{index}"
        module_id = get("module_id")
        module_title = get("module_title")
        module_id = str(module_id if module_id is not None else (module_title or "course"))
        module_title = str(module_title if module_title is not None else module_id)

        raw_completion = get("completion")
        completed = (
            raw_completion is not None if completion_is_date else _completion(raw_completion)
        )
        events.append({
            "learner_ref": str(learner),
            "module_id": module_id,
            "module_title": module_title,
            "event_type": "completed" if completed else "progressed",
            "completion": completed,
            "score": _number(get("score")),
            "duration_seconds": _number(get("duration_seconds")),
            "attempts": int(_number(get("attempts"), 1)),
            "occurred_at": get("occurred_at"),
            "raw": row,
        })
    return events


def map_report(filename: str, content: bytes, platform: str | None = None,
               overrides: dict | None = None) -> tuple[dict, list[dict], dict]:
    """Read a report, propose (or take) a mapping, and produce events.

    Returns ``(proposal, events, final_mapping)``. Raises MappingError when
    required fields cannot be mapped, so callers can show the user which.
    """
    headers, rows = read_table(filename, content)
    proposal = propose_mapping(headers, platform)
    mapping = dict(proposal["mapping"])
    if overrides:
        mapping.update({k: v for k, v in overrides.items()})
        mapping = {k: v for k, v in mapping.items() if v not in (None, "")}
    final = validate_mapping(mapping, headers)
    return proposal, apply_mapping(rows, final), final
