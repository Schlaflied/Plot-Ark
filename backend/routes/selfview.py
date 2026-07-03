"""Student self-view routes — personal behavioral mirror (footprint + rhythm).

Serves each student their OWN xAPI traces so the data producer gets
interpretive access to their data (Cogito Direction A/B at LMS scale).

RED-LINE COMPLIANCE:
  - Endpoints return only the requesting student's rows (X-User-Email scoped)
  - No class averages, rankings, or peer comparisons of any kind
  - Behavioral counts (visits / revisits) only — no mastery scores
"""

import re
import json
import datetime
from flask import Blueprint, request, jsonify
from db import get_db

selfview_bp = Blueprint("selfview", __name__)


def _normalize_module_id(raw_id: str) -> str:
    """Normalize an xAPI object_id to 'module_N' (1-indexed).

    xAPI stores module IDs as 'course/X/module/N' (0-indexed);
    downstream consumers (KG mapping, frontend) use 'module_N' (1-indexed).
    """
    m = re.search(r"module/(\d+)", raw_id)
    if m:
        return f"module_{int(m.group(1)) + 1}"
    return raw_id


# ── Shared aggregation helpers (used by footprint, rhythm, retrospect) ────────

def _module_footprint(cur, email: str, course_id: int) -> dict[str, dict]:
    """Per-module aggregates for one student: visits, revisit days, last visit, verbs."""
    module_prefix = f"course/{course_id}/module/%"

    cur.execute("""
        SELECT substring(object_id from 'module/(\\d+)') AS mod_idx,
               COUNT(*) AS visits,
               COUNT(DISTINCT DATE(timestamp)) AS active_days,
               MAX(timestamp) AS last_visited
        FROM xapi_statements
        WHERE actor_email = %s AND object_id LIKE %s
        GROUP BY mod_idx
        ORDER BY mod_idx
    """, (email, module_prefix))
    module_rows = cur.fetchall()

    cur.execute("""
        SELECT substring(object_id from 'module/(\\d+)') AS mod_idx,
               verb, COUNT(*)
        FROM xapi_statements
        WHERE actor_email = %s AND object_id LIKE %s
        GROUP BY mod_idx, verb
    """, (email, module_prefix))
    verb_map: dict[str, dict[str, int]] = {}
    for mod_idx, verb, count in cur.fetchall():
        if mod_idx is None:
            continue
        key = f"module_{int(mod_idx) + 1}"
        verb_map.setdefault(key, {})[verb] = count

    modules: dict[str, dict] = {}
    for mod_idx, visits, active_days, last_visited in module_rows:
        if mod_idx is None:
            continue
        key = f"module_{int(mod_idx) + 1}"
        modules[key] = {
            "visits": visits,
            # Revisits = distinct active days beyond the first
            "revisits": max(0, active_days - 1),
            "last_visited": last_visited.isoformat() if last_visited else None,
            "verbs": verb_map.get(key, {}),
        }
    return modules


def _rhythm_data(cur, email: str, course_id: int) -> dict:
    """7x24 activity matrix + totals for one student. weekday 0 = Sunday (Postgres dow)."""
    prefix = f"course/{course_id}/%"

    cur.execute("""
        SELECT EXTRACT(dow FROM timestamp)::int AS dow,
               EXTRACT(hour FROM timestamp)::int AS hour,
               COUNT(*)
        FROM xapi_statements
        WHERE actor_email = %s AND object_id LIKE %s
        GROUP BY dow, hour
    """, (email, prefix))
    matrix = [[0] * 24 for _ in range(7)]
    for dow, hour, count in cur.fetchall():
        matrix[dow][hour] = count

    cur.execute("""
        SELECT COUNT(*),
               COUNT(DISTINCT DATE(timestamp)),
               MIN(timestamp), MAX(timestamp)
        FROM xapi_statements
        WHERE actor_email = %s AND object_id LIKE %s
    """, (email, prefix))
    total, active_days, first_activity, last_activity = cur.fetchone()

    return {
        "matrix": matrix,
        "total_statements": total,
        "active_days": active_days,
        "first_activity": first_activity,
        "last_activity": last_activity,
    }


@selfview_bp.route("/api/selfview/footprint/<int:course_id>", methods=["GET"])
def get_footprint(course_id: int):
    """Return the student's own attention footprint for a course.

    Module-level: visits, revisit days, last visit, verb breakdown.
    Concept-level: module counts projected onto KG concepts via kg_mapper.
    """
    email = request.headers.get("X-User-Email", "").strip()
    if not email:
        return jsonify({"error": "Missing X-User-Email header"}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503

    try:
        cur = conn.cursor()
        modules = _module_footprint(cur, email, course_id)
        cur.close()
        conn.close()

        # Project module counts onto KG concepts (graceful degradation: no KG → {})
        concepts: dict[str, dict] = {}
        try:
            from services.kg_mapper import get_kg_mapping_for_course
            mapping = get_kg_mapping_for_course(course_id)
            if mapping:
                for mod_num, concept_list in (mapping.get("module_concepts") or {}).items():
                    mod_key = f"module_{mod_num}"
                    footprint = modules.get(mod_key)
                    if not footprint:
                        continue
                    for c in concept_list or []:
                        label = c.get("label") if isinstance(c, dict) else str(c)
                        if not label:
                            continue
                        entry = concepts.setdefault(label, {"visits": 0, "revisits": 0, "last_visited": None})
                        entry["visits"] += footprint["visits"]
                        entry["revisits"] += footprint["revisits"]
                        lv = footprint["last_visited"]
                        if lv and (entry["last_visited"] is None or lv > entry["last_visited"]):
                            entry["last_visited"] = lv
        except Exception as e:
            print(f"[selfview] KG projection skipped for course {course_id}: {e}")

        return jsonify({
            "course_id": course_id,
            "modules": modules,
            "concepts": concepts,
        })
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


@selfview_bp.route("/api/selfview/rhythm/<int:course_id>", methods=["GET"])
def get_rhythm(course_id: int):
    """Return the student's own 7x24 activity matrix for a course.

    matrix[weekday][hour] = statement count; weekday 0 = Sunday (Postgres dow).
    """
    email = request.headers.get("X-User-Email", "").strip()
    if not email:
        return jsonify({"error": "Missing X-User-Email header"}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503

    try:
        cur = conn.cursor()
        rhythm = _rhythm_data(cur, email, course_id)
        cur.close()
        conn.close()

        return jsonify({
            "course_id": course_id,
            "matrix": rhythm["matrix"],
            "total_statements": rhythm["total_statements"],
            "active_days": rhythm["active_days"],
            "first_activity": rhythm["first_activity"].isoformat() if rhythm["first_activity"] else None,
            "last_activity": rhythm["last_activity"].isoformat() if rhythm["last_activity"] else None,
        })
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


@selfview_bp.route("/api/selfview/students/<int:course_id>", methods=["GET"])
def list_students(course_id: int):
    """Demo helper: list mock students with xAPI activity in a course.

    Used by the login page to 'act as' a generated student.
    """
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503

    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT actor_email, actor_name, COUNT(*) AS statements
            FROM xapi_statements
            WHERE object_id LIKE %s
            GROUP BY actor_email, actor_name
            ORDER BY statements DESC
        """, (f"course/{course_id}/%",))
        students = [
            {"email": r[0], "name": r[1], "statements": r[2]}
            for r in cur.fetchall()
        ]
        cur.close()
        conn.close()
        return jsonify({"course_id": course_id, "students": students})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


# ── Retrospect card (4.2): pattern statements + student verdicts ──────────────
# The statements are mirror-tone pattern observations, never metric judgements.
# What gets persisted is only what cannot be recomputed from raw xAPI:
# the statements shown and the student's own "like me / not me" verdicts.

_WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays",
             "Thursdays", "Fridays", "Saturdays"]

_MIN_STATEMENTS_FOR_RETROSPECT = 5


def _hour_label(hour: int) -> str:
    if hour == 0:
        return "midnight"
    if hour == 12:
        return "noon"
    return f"{hour}am" if hour < 12 else f"{hour - 12}pm"


def _module_titles(cur, course_id: int) -> dict[str, str]:
    """Map 'module_N' (1-indexed) → module title from curricula.modules JSONB."""
    cur.execute("SELECT modules FROM curricula WHERE id = %s", (course_id,))
    row = cur.fetchone()
    titles: dict[str, str] = {}
    for i, mod in enumerate(row[0] or [] if row else []):
        title = mod.get("title") if isinstance(mod, dict) else None
        titles[f"module_{i + 1}"] = title or f"Module {i + 1}"
    return titles


def _generate_statements(modules: dict, rhythm: dict, titles: dict[str, str]) -> list[dict]:
    """Build 2-4 mirror-tone pattern statements from footprint + rhythm aggregates.

    Baseline for every comparison is the student's own history — never peers.
    """
    statements: list[dict] = []

    # 1. Revisit pattern — module with the most distinct revisit days
    revisited = [(k, v) for k, v in modules.items() if v["revisits"] >= 2]
    if revisited:
        mod_key, data = max(revisited, key=lambda kv: kv[1]["revisits"])
        title = titles.get(mod_key, mod_key.replace("_", " ").title())
        statements.append({
            "id": f"revisit_{mod_key}",
            "kind": "revisit",
            "text": (
                f"You came back to {title} on {data['revisits'] + 1} different days — "
                "revisiting is your brain asking to consolidate."
            ),
        })

    # 2. Rhythm peak — the student's own busiest weekday/hour cell
    matrix = rhythm["matrix"]
    peak_count = 0
    peak_dow, peak_hour = None, None
    for dow in range(7):
        for hour in range(24):
            if matrix[dow][hour] > peak_count:
                peak_count = matrix[dow][hour]
                peak_dow, peak_hour = dow, hour
    if peak_dow is not None and peak_count >= 2:
        statements.append({
            "id": "rhythm_peak",
            "kind": "rhythm",
            "text": (
                f"Most of your studying happened around {_hour_label(peak_hour)} "
                f"on {_WEEKDAYS[peak_dow]}."
            ),
        })

    # 3. Footprint breadth — how far the trail reaches, and where it lingers
    if modules and titles:
        deepest_key = max(modules, key=lambda k: modules[k]["visits"])
        deepest_title = titles.get(deepest_key, deepest_key.replace("_", " ").title())
        statements.append({
            "id": "breadth",
            "kind": "breadth",
            "text": (
                f"You've explored {len(modules)} of {len(titles)} modules so far, "
                f"and spent the most time in {deepest_title}."
            ),
        })

    # 4. Recent-change trend — last two weeks vs the two weeks before them,
    #    anchored to the student's own last activity (mock data may end in the past)
    first, last = rhythm["first_activity"], rhythm["last_activity"]
    if first and last and (last - first).days >= 28:
        statements.append({
            "id": "trend_recent",
            "kind": "trend",
            "text": "__TREND_PLACEHOLDER__",  # filled by caller with SQL window counts
        })

    return statements[:4]


@selfview_bp.route("/api/selfview/retrospect/<int:course_id>", methods=["POST"])
def create_retrospect(course_id: int):
    """Generate (or return) this period's retrospect card for the student.

    Only fires when the student explicitly asks to look back (UX red line:
    the mirror speaks only when spoken to). Idempotent per email+course+period.
    """
    email = request.headers.get("X-User-Email", "").strip()
    if not email:
        return jsonify({"error": "Missing X-User-Email header"}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503

    try:
        cur = conn.cursor()

        # Idempotency: same student + course + ISO week → return the existing card
        iso = datetime.date.today().isocalendar()
        period = f"{iso[0]}-W{iso[1]:02d}"
        cur.execute("""
            SELECT id, statements_shown, verdicts FROM selfview_snapshots
            WHERE email = %s AND course_id = %s AND period = %s
            ORDER BY created_at DESC LIMIT 1
        """, (email, course_id, period))
        existing = cur.fetchone()
        if existing:
            cur.close()
            conn.close()
            return jsonify({
                "snapshot_id": existing[0],
                "period": period,
                "statements": existing[1] or [],
                "verdicts": existing[2] or [],
                "status": "existing",
            })

        rhythm = _rhythm_data(cur, email, course_id)
        if (rhythm["total_statements"] or 0) < _MIN_STATEMENTS_FOR_RETROSPECT:
            cur.close()
            conn.close()
            return jsonify({
                "status": "not_enough_data",
                "period": period,
                "statements": [],
            })

        modules = _module_footprint(cur, email, course_id)
        titles = _module_titles(cur, course_id)
        statements = _generate_statements(modules, rhythm, titles)

        # Fill the trend statement with real window counts (self-baseline only)
        for s in statements:
            if s["id"] != "trend_recent":
                continue
            anchor = rhythm["last_activity"]
            cur.execute("""
                SELECT COUNT(*) FILTER (WHERE timestamp > %s - INTERVAL '14 days'),
                       COUNT(*) FILTER (WHERE timestamp <= %s - INTERVAL '14 days'
                                          AND timestamp > %s - INTERVAL '28 days')
                FROM xapi_statements
                WHERE actor_email = %s AND object_id LIKE %s
            """, (anchor, anchor, anchor, email, f"course/{course_id}/%"))
            recent, before = cur.fetchone()
            if before and recent > before * 1.25:
                s["text"] = "Your last two weeks look busier than the two before them."
            elif before and recent * 1.25 < before:
                s["text"] = "Your last two weeks look quieter than the two before them — rhythms shift, that's normal."
            else:
                s["text"] = "Your pace over the last month has stayed fairly steady."

        # Persist: statements shown + slim summaries (verdicts start empty)
        footprint_summary = {
            k: {"visits": v["visits"], "revisits": v["revisits"]}
            for k, v in modules.items()
        }
        rhythm_summary = {
            "total_statements": rhythm["total_statements"],
            "active_days": rhythm["active_days"],
            "first_activity": rhythm["first_activity"].isoformat() if rhythm["first_activity"] else None,
            "last_activity": rhythm["last_activity"].isoformat() if rhythm["last_activity"] else None,
        }
        cur.execute("""
            INSERT INTO selfview_snapshots
                (email, course_id, period, rhythm_summary, footprint_summary, statements_shown)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (email, course_id, period,
              json.dumps(rhythm_summary), json.dumps(footprint_summary),
              json.dumps(statements)))
        snapshot_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()

        return jsonify({
            "snapshot_id": snapshot_id,
            "period": period,
            "statements": statements,
            "verdicts": [],
            "status": "created",
        })
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


@selfview_bp.route("/api/selfview/verdict", methods=["POST"])
def record_verdict():
    """Record the student's 'like me / not me' verdict on one statement.

    The verdict is the only ground truth in the system — the mirror can be
    overruled by its owner. One verdict per statement; re-voting overwrites.
    """
    email = request.headers.get("X-User-Email", "").strip()
    if not email:
        return jsonify({"error": "Missing X-User-Email header"}), 400

    data = request.get_json(force=True)
    snapshot_id = data.get("snapshot_id")
    statement_id = data.get("statement_id")
    verdict = data.get("verdict")
    if not snapshot_id or not statement_id or verdict not in ("like_me", "not_me"):
        return jsonify({"error": "Required: snapshot_id, statement_id, verdict ∈ {like_me, not_me}"}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503

    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT email, verdicts FROM selfview_snapshots WHERE id = %s",
            (snapshot_id,),
        )
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({"error": "Snapshot not found"}), 404
        if row[0] != email:
            cur.close()
            conn.close()
            return jsonify({"error": "Not your snapshot"}), 403

        verdicts = [v for v in (row[1] or []) if v.get("statement_id") != statement_id]
        verdicts.append({
            "statement_id": statement_id,
            "verdict": verdict,
            "at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        })
        cur.execute(
            "UPDATE selfview_snapshots SET verdicts = %s WHERE id = %s",
            (json.dumps(verdicts), snapshot_id),
        )
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"snapshot_id": snapshot_id, "verdicts": verdicts})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500
