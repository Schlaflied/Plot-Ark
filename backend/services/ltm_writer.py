"""LTM Cold Layer Writer — persists analysis snapshots as .md files with YAML frontmatter.

After each A2A pipeline run, writes a compressed summary of flagged modules
and key metrics to data/ltm/{course_id}_{YYYY-MM-DD}.md.

These files are consumed by the Curriculum Agent to detect structural
(recurring) issues vs one-off anomalies.
"""

import os
import datetime
from pathlib import Path


# Storage root — Docker mounts ./data:/data, so /data/ltm inside container
# For local dev, resolve relative to this file's parent (backend/) → ../data/ltm
_LTM_DIR = Path(os.getenv("LTM_DIR", str(Path(__file__).resolve().parent.parent / "data" / "ltm")))


def write_cold_snapshot(report: dict) -> str | None:
    """Extract key metrics from an orchestrator report and write a Cold LTM .md file.

    Args:
        report: The full aggregated report dict from OrchestratorNode._aggregate_report().

    Returns:
        The absolute path of the written file, or None on failure.
    """
    course_id = report.get("course_id")
    if not course_id:
        return None

    today = datetime.date.today().isoformat()
    ra = report.get("risk_assessment", {})
    co = report.get("content_optimization", {})
    ba = report.get("behavior_analysis", {})

    # ── Identify flagged modules ──────────────────────────────────────────
    flagged_modules = _extract_flagged_modules(ra, co, ba, course_id)

    total_students = ra.get("total_students_analyzed", 0)
    at_risk_list = ra.get("at_risk_students", [])
    at_risk_pct = round(len(at_risk_list) / max(total_students, 1), 2)

    # Overall completion rate from module engagement
    modules_engagement = ba.get("module_engagement", [])
    completion_rates = [m.get("completion_rate", 0) for m in modules_engagement]
    overall_completion = round(sum(completion_rates) / max(len(completion_rates), 1), 2)

    # ── Count existing snapshots to set version ───────────────────────────
    _LTM_DIR.mkdir(parents=True, exist_ok=True)
    existing = sorted(_LTM_DIR.glob(f"{course_id}_*.md"))
    version = len(existing) + 1

    # ── Build YAML frontmatter ────────────────────────────────────────────
    lines = ["---"]
    lines.append(f"course_id: {course_id}")
    lines.append(f"analysis_date: {today}")
    lines.append(f"version: {version}")

    if flagged_modules:
        lines.append("modules_flagged:")
        for fm in flagged_modules:
            lines.append(f"  - module_id: {fm['module_id']}")
            reasons_str = "[" + ", ".join(fm["reasons"]) + "]"
            lines.append(f"    reasons: {reasons_str}")
            for k, v in fm.get("metrics", {}).items():
                lines.append(f"    {k}: {v}")

    lines.append(f"cohort_at_risk_pct: {at_risk_pct}")
    lines.append(f"overall_completion_rate: {overall_completion}")
    lines.append("---")
    lines.append("")

    # ── Build markdown summary ────────────────────────────────────────────
    lines.append("## Analysis Summary")
    lines.append("")

    if flagged_modules:
        for fm in flagged_modules:
            reasons_text = ", ".join(fm["reasons"])
            lines.append(f"**{fm['module_id']}** flagged for: {reasons_text}.")
            for k, v in fm.get("metrics", {}).items():
                lines.append(f"  - {k}: {v}")
            lines.append("")
    else:
        lines.append("No modules flagged in this analysis run.")
        lines.append("")

    lines.append(f"Cohort at-risk: {at_risk_pct:.0%} ({len(at_risk_list)} of {total_students} students).")
    lines.append(f"Overall course completion rate: {overall_completion:.0%}.")
    lines.append("")

    # ── Write file ────────────────────────────────────────────────────────
    filename = f"{course_id}_{today}.md"
    filepath = _LTM_DIR / filename

    try:
        filepath.write_text("\n".join(lines), encoding="utf-8")
        print(f"[LTM Cold] Written: {filepath}")
        return str(filepath)
    except Exception as e:
        print(f"[LTM Cold] Write error: {e}")
        return None


def read_cold_history(course_id: int, max_files: int = 10) -> list[dict]:
    """Read the most recent N Cold LTM snapshots for a course.

    Returns a list of parsed dicts with keys: analysis_date, version,
    modules_flagged (list of module_id strings), cohort_at_risk_pct,
    overall_completion_rate.
    """
    _LTM_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(_LTM_DIR.glob(f"{course_id}_*.md"), reverse=True)[:max_files]

    history = []
    for f in files:
        try:
            content = f.read_text(encoding="utf-8")
            parsed = _parse_frontmatter(content)
            if parsed:
                history.append(parsed)
        except Exception as e:
            print(f"[LTM Cold] Read error {f}: {e}")

    return history


def _extract_flagged_modules(ra: dict, co: dict, ba: dict, course_id: int) -> list[dict]:
    """Cross-reference risk_detector and content_optimizer outputs to find flagged modules."""
    flagged = []

    # From content_optimizer: underperforming modules
    underperforming = {m["module_id"]: m for m in co.get("underperforming_content", [])}

    # From risk_detector: build per-module at-risk count
    at_risk_students = ra.get("at_risk_students", [])
    total_students = ra.get("total_students_analyzed", 0)

    # From behavior_analyst: module engagement data
    module_engagement = {m["module_id"]: m for m in ba.get("module_engagement", [])}

    # Check each underperforming module for compounding signals
    for mod_id, mod_data in underperforming.items():
        reasons = []
        metrics = {}

        # Signal from content_optimizer
        if mod_data.get("struggle_rate", 0) > 0.2:
            reasons.append("high_struggle_rate")
            metrics["struggle_rate"] = mod_data["struggle_rate"]

        if mod_data.get("failure_rate", 0) > 0.15:
            reasons.append("high_failure_rate")
            metrics["failure_rate"] = mod_data["failure_rate"]

        if mod_data.get("negative_feedback", 0) > 2:
            reasons.append("negative_feedback")
            metrics["negative_feedback_count"] = mod_data["negative_feedback"]

        # Signal from behavior_analyst
        engagement = module_engagement.get(mod_id, {})
        if engagement.get("completion_rate", 1) < 0.5:
            reasons.append("low_completion_rate")
            metrics["completion_rate"] = engagement.get("completion_rate", 0)

        if reasons:
            flagged.append({
                "module_id": mod_id,
                "reasons": reasons,
                "metrics": metrics,
            })

    return flagged


def _parse_frontmatter(content: str) -> dict | None:
    """Parse YAML frontmatter from a Cold LTM .md file. Lightweight, no PyYAML needed."""
    if not content.startswith("---"):
        return None

    parts = content.split("---", 2)
    if len(parts) < 3:
        return None

    yaml_block = parts[1].strip()
    result = {}
    current_module = None
    modules_flagged = []

    for line in yaml_block.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue

        if stripped == "modules_flagged:":
            continue

        if stripped.startswith("- module_id:"):
            current_module = {"module_id": stripped.split(":", 1)[1].strip()}
            modules_flagged.append(current_module)
            continue

        if current_module and stripped.startswith("reasons:"):
            # Parse simple list like [a, b, c]
            raw = stripped.split(":", 1)[1].strip().strip("[]")
            current_module["reasons"] = [r.strip() for r in raw.split(",") if r.strip()]
            continue

        if current_module and ":" in stripped and not stripped.startswith("-"):
            k, v = stripped.split(":", 1)
            try:
                current_module[k.strip()] = float(v.strip())
            except ValueError:
                current_module[k.strip()] = v.strip()
            continue

        # Top-level key
        if ":" in stripped and not stripped.startswith("-"):
            current_module = None
            k, v = stripped.split(":", 1)
            key = k.strip()
            val = v.strip()
            try:
                result[key] = float(val)
            except ValueError:
                result[key] = val

    if modules_flagged:
        result["modules_flagged"] = modules_flagged

    return result
