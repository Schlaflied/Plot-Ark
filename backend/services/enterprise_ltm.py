"""Cold, aggregate-only LTM snapshots for Enterprise learning programs."""

from __future__ import annotations

import json
import os
from pathlib import Path


def write_enterprise_cold_snapshot(report: dict, root: Path | None = None) -> str:
    base = root or Path(os.getenv("LTM_DIR", Path(__file__).resolve().parent.parent / "data" / "ltm"))
    org_slug = report["organization"]["slug"]
    program_id = int(report["program_id"])
    target = base / "enterprise" / org_slug / str(program_id)
    target.mkdir(parents=True, exist_ok=True)
    run_id = int(report["run_id"])
    path = target / f"run-{run_id}.json"
    aggregate = {
        "program_id": program_id,
        "program_name": report["program_name"],
        "cohort": report["cohort"],
        "content_version": report["content_version"],
        "generated_at": report["generated_at"],
        "metrics": report["metrics"],
        "evidence_coverage": report["evidence_coverage"],
        "comparison": report["comparison"],
        "modules": report["modules"],
        "suggestions": report["suggestions"],
        "privacy": report["privacy"],
    }
    path.write_text(json.dumps(aggregate, indent=2, ensure_ascii=False), encoding="utf-8")
    return str(path)
