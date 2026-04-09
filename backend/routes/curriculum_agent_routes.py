"""Curriculum Agent routes: flags, suggestions, apply, redo, changes.

Split from curriculum.py to keep files maintainable.
"""

import json
from flask import Blueprint, request, jsonify

curriculum_agent_bp = Blueprint("curriculum_agent", __name__)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Module Flags
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@curriculum_agent_bp.route("/api/curriculum/flags/<int:course_id>", methods=["GET"])
def get_curriculum_flags(course_id):
    """Return active (non-dismissed) module flags for a course.

    Used by the frontend badge component to poll for flagged modules.
    """
    from db import get_db
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503

    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, module_id, flag_level, signals, created_at
            FROM module_flags
            WHERE course_id = %s AND dismissed = FALSE
            ORDER BY created_at DESC
        """, (course_id,))
        cols = ["id", "module_id", "flag_level", "signals", "created_at"]
        flags = []
        for row in cur.fetchall():
            flag = dict(zip(cols, row))
            if flag.get("created_at"):
                flag["created_at"] = flag["created_at"].isoformat()
            flags.append(flag)
        cur.close()
        conn.close()
        return jsonify({"course_id": course_id, "flags": flags, "count": len(flags)})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


@curriculum_agent_bp.route("/api/curriculum/analyze", methods=["POST"])
def run_curriculum_analysis():
    """Run the Curriculum Agent on flagged modules.

    Body JSON:
      {
        "course_id": int,
        "flagged_modules": [{"module_id": str, "module_name": str, "signals": [...]}]
      }

    Returns the agent's recommendations and historical trend analysis.
    """
    from agents.curriculum_agent import CurriculumAgentNode
    from agents.base import SharedMemory
    from extensions import redis_client

    data = request.get_json()
    course_id = data.get("course_id")
    flagged_modules = data.get("flagged_modules", [])

    if not course_id:
        return jsonify({"error": "course_id is required"}), 400

    sm = SharedMemory(f"curriculum-{course_id}", redis_client)
    sm.set("course_id", course_id)
    sm.set("flagged_modules", flagged_modules)

    agent = CurriculumAgentNode()
    result = agent.execute(sm)

    return jsonify({
        "status": result.status,
        "data": result.data,
        "duration_ms": result.duration_ms,
    })


@curriculum_agent_bp.route("/api/curriculum/flags/<int:flag_id>/dismiss", methods=["POST"])
def dismiss_flag(flag_id):
    """Mark a module flag as dismissed (user chose to ignore it)."""
    from db import get_db
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503

    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE module_flags SET dismissed = TRUE WHERE id = %s",
            (flag_id,),
        )
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"status": "dismissed", "flag_id": flag_id})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Suggestions
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@curriculum_agent_bp.route("/api/curriculum/suggestions/<int:course_id>", methods=["GET"])
def get_curriculum_suggestions(course_id):
    """Return human-readable curriculum suggestions for the CoursePage drawer.

    Returns status field (pending / applied) so frontend can split into
    two sections: "Pending Suggestions" and "Applied Changes".
    """
    from db import get_db
    conn = get_db()
    if not conn:
        return jsonify({"suggestions": []}), 200

    suggestions = []
    try:
        cur = conn.cursor()

        # 1. Try change_log first (Curriculum Agent has already run)
        cur.execute("""
            SELECT module_id, recommendation, flag_reason, status, timestamp
            FROM change_log
            WHERE course_id = %s AND status != 'dismissed'
            ORDER BY timestamp DESC
            LIMIT 15
        """, (str(course_id),))
        for row in cur.fetchall():
            suggestions.append({
                "module_id": row[0],
                "module_name": row[0],
                "recommendation": row[1],
                "reasons": row[2] if row[2] else [],
                "source": "curriculum_agent",
                "status": row[3],       # pending | applied
            })

        # 2. If no change_log entries, fall back to raw flags
        if not suggestions:
            cur.execute("""
                SELECT module_id, flag_level, signals
                FROM module_flags
                WHERE course_id = %s AND dismissed = FALSE
                ORDER BY created_at DESC
                LIMIT 10
            """, (course_id,))
            for row in cur.fetchall():
                module_id, flag_level, signals = row
                rec = _translate_flag_to_suggestion(module_id, flag_level, signals)
                suggestions.append(rec)

        cur.close()
        conn.close()
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        print(f"[Curriculum Suggestions] Error: {e}")

    return jsonify({"course_id": course_id, "suggestions": suggestions})


def _translate_flag_to_suggestion(module_id: str, flag_level: str, signals) -> dict:
    """Convert raw flag data into a human-readable recommendation."""
    parts = []

    if isinstance(signals, list):
        for sig in signals:
            source = sig.get("source", "") if isinstance(sig, dict) else ""
            detail = sig.get("detail", str(sig)) if isinstance(sig, dict) else str(sig)
            parts.append(detail)
    elif isinstance(signals, dict):
        parts.append(str(signals))

    if not parts:
        parts = ["This module has been flagged for review based on student performance data."]

    recommendation = " ".join(parts)

    return {
        "module_id": module_id,
        "module_name": module_id,
        "recommendation": recommendation,
        "flag_level": flag_level,
        "source": "threshold_checker",
        "status": "pending",
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Apply / Redo
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _apply_module_mutation(modules: list, module_id: str, recommendation: str) -> tuple:
    """Mutate a module's content based on the recommendation text.

    Returns (mutated_modules, original_module_backup).
    Uses Python-generated content (no real LLM).
    """
    idx = int(module_id.replace("module_", "")) - 1
    if idx < 0 or idx >= len(modules):
        return modules, None

    original = json.dumps(modules[idx])  # backup
    m = modules[idx]
    rec_lower = recommendation.lower()

    # ── Assessment: split into checkpoints ────────────────────────────────
    if "assessment" in rec_lower or "checkpoint" in rec_lower:
        assignments = m.get("assignments", [])
        if assignments:
            first = assignments[0] if isinstance(assignments[0], str) else assignments[0].get("title", "Assignment")
            base = first if isinstance(first, str) else str(first)
            m["assignments"] = [
                f"{base} — Checkpoint 1 (Formative, 15%)",
                f"{base} — Checkpoint 2 (Summative, 25%)",
            ]
        else:
            m["assignments"] = [
                "Progress Check — Short Reflection (Formative, 15%)",
                "Module Assessment — Applied Analysis (Summative, 25%)",
            ]

    # ── Reading: add introductory material ────────────────────────────────
    if "reading" in rec_lower or "introductory" in rec_lower or "source" in rec_lower:
        readings = m.get("recommended_readings", [])
        intro_reading = {
            "title": f"Introductory Guide: Foundations for {m.get('title', 'This Module')}",
            "type": "article",
            "estimated_time": "15 min",
            "url": "https://scholar.google.com",
            "rationale": "Added by Curriculum Agent — bridges prerequisite gap identified in student data.",
        }
        m["recommended_readings"] = [intro_reading] + readings

    # ── Case study / practical ────────────────────────────────────────────
    if "case study" in rec_lower or "practical" in rec_lower:
        readings = m.get("recommended_readings", [])
        case_reading = {
            "title": f"Case Study: Real-World Applications in {m.get('title', 'This Module')}",
            "type": "article",
            "estimated_time": "20 min",
            "url": "https://hbr.org",
            "rationale": "Added by Curriculum Agent — supplements theory with applied scenario.",
        }
        m["recommended_readings"] = readings + [case_reading]

    # ── Peer discussion ───────────────────────────────────────────────────
    if "peer" in rec_lower or "discussion" in rec_lower or "collaborative" in rec_lower:
        objectives = m.get("learning_objectives", [])
        objectives.append("Engage in peer discussion to synthesize key concepts before the main assessment")
        m["learning_objectives"] = objectives

    # ── Optional marking ──────────────────────────────────────────────────
    if "optional" in rec_lower:
        readings = m.get("recommended_readings", [])
        if len(readings) > 2:
            for r in readings[2:]:
                if isinstance(r, dict):
                    r["rationale"] = "(Optional) " + r.get("rationale", "Supplementary reading.")

    # ── Complexity reduction ──────────────────────────────────────────────
    if "complexity" in rec_lower or "dense" in rec_lower:
        cl = m.get("complexity_level", 4)
        if isinstance(cl, (int, float)) and cl > 1:
            m["complexity_level"] = cl - 1

    modules[idx] = m
    return modules, original


@curriculum_agent_bp.route("/api/curriculum/suggestions/apply", methods=["POST"])
def apply_curriculum_suggestion():
    """Apply a curriculum suggestion — actually mutates the module content.

    1. Reads the current modules JSON from the curricula table.
    2. Applies Python-generated mutations based on the recommendation text.
    3. Writes the updated modules back to the DB.
    4. Stores original module data as backup in change_log for redo.
    5. Updates change_log status to 'applied'.

    Request body:
        { "course_id": 24, "module_id": "module_1" }
    """
    from db import get_db
    data = request.get_json() or {}
    course_id = data.get("course_id")
    module_id = data.get("module_id")

    if not course_id or not module_id:
        return jsonify({"error": "course_id and module_id are required"}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500

    try:
        cur = conn.cursor()

        # 1. Get current modules JSON
        cur.execute("SELECT modules FROM curricula WHERE id = %s", (course_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({"error": "Course not found"}), 404

        modules_raw = row[0]
        if isinstance(modules_raw, str):
            modules = json.loads(modules_raw)
        elif modules_raw is not None:
            modules = modules_raw
        else:
            modules = []

        # 2. Get the recommendation text for this module
        cur.execute("""
            SELECT id, recommendation, flag_reason
            FROM change_log
            WHERE course_id = %s AND module_id = %s AND status = 'pending'
            ORDER BY timestamp DESC LIMIT 1
        """, (str(course_id), module_id))
        cl_row = cur.fetchone()
        if not cl_row:
            cur.close()
            conn.close()
            return jsonify({"error": "No pending suggestion found for this module"}), 404

        cl_id, recommendation, flag_reason = cl_row

        # 3. Apply mutations to the module
        mutated_modules, original_backup = _apply_module_mutation(
            modules, module_id, recommendation
        )

        # 4. Write mutated modules back to curricula
        cur.execute(
            "UPDATE curricula SET modules = %s WHERE id = %s",
            (json.dumps(mutated_modules), course_id),
        )

        # 5. Update change_log: set status=applied and store backup
        cur.execute("""
            UPDATE change_log
            SET status = 'applied', backup_data = %s
            WHERE id = %s
        """, (original_backup, cl_id))

        # Also dismiss related module_flags
        cur.execute("""
            UPDATE module_flags
            SET dismissed = TRUE
            WHERE course_id = %s AND module_id = %s AND dismissed = FALSE
        """, (course_id, module_id))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({
            "status": "applied",
            "course_id": course_id,
            "module_id": module_id,
            "message": f"Module {module_id} content has been updated based on the AI recommendation.",
        })
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@curriculum_agent_bp.route("/api/curriculum/suggestions/redo", methods=["POST"])
def redo_curriculum_suggestion():
    """Undo an applied curriculum suggestion — restore original module content.

    1. Reads the backup_data from change_log.
    2. Restores the original module into the curricula modules JSON.
    3. Sets change_log status back to 'pending'.

    Request body:
        { "course_id": 24, "module_id": "module_1" }
    """
    from db import get_db
    data = request.get_json() or {}
    course_id = data.get("course_id")
    module_id = data.get("module_id")

    if not course_id or not module_id:
        return jsonify({"error": "course_id and module_id are required"}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500

    try:
        cur = conn.cursor()

        # 1. Get the backup from change_log
        cur.execute("""
            SELECT id, backup_data
            FROM change_log
            WHERE course_id = %s AND module_id = %s AND status = 'applied' AND backup_data IS NOT NULL
            ORDER BY timestamp DESC LIMIT 1
        """, (str(course_id), module_id))
        cl_row = cur.fetchone()
        if not cl_row:
            cur.close()
            conn.close()
            return jsonify({"error": "No applied suggestion with backup found"}), 404

        cl_id, backup_data = cl_row
        original_module = json.loads(backup_data) if isinstance(backup_data, str) else backup_data

        # 2. Get current modules JSON
        cur.execute("SELECT modules FROM curricula WHERE id = %s", (course_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({"error": "Course not found"}), 404

        modules_raw = row[0]
        if isinstance(modules_raw, str):
            modules = json.loads(modules_raw)
        elif modules_raw is not None:
            modules = modules_raw
        else:
            modules = []

        # 3. Restore original module
        idx = int(module_id.replace("module_", "")) - 1
        if 0 <= idx < len(modules):
            modules[idx] = original_module

        # 4. Write restored modules back to curricula
        cur.execute(
            "UPDATE curricula SET modules = %s WHERE id = %s",
            (json.dumps(modules), course_id),
        )

        # 5. Set change_log status back to pending, clear backup
        cur.execute("""
            UPDATE change_log
            SET status = 'pending', backup_data = NULL
            WHERE id = %s
        """, (cl_id,))

        # Re-enable module flag
        cur.execute("""
            UPDATE module_flags
            SET dismissed = FALSE
            WHERE course_id = %s AND module_id = %s
        """, (course_id, module_id))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({
            "status": "reverted",
            "course_id": course_id,
            "module_id": module_id,
            "message": f"Module {module_id} has been reverted to its original content.",
        })
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Student-facing changes
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@curriculum_agent_bp.route("/api/curriculum/changes/<int:course_id>", methods=["GET"])
def get_curriculum_changes(course_id):
    """Return recently applied module changes for student-facing notifications.

    Shows what modules were updated so students know the curriculum has evolved.
    """
    from db import get_db
    conn = get_db()
    if not conn:
        return jsonify({"changes": []}), 200

    changes = []
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT module_id, recommendation, flag_reason, timestamp
            FROM change_log
            WHERE course_id = %s AND status = 'applied'
            ORDER BY timestamp DESC
            LIMIT 5
        """, (str(course_id),))
        for row in cur.fetchall():
            changes.append({
                "module_id": row[0],
                "recommendation": row[1],
                "reasons": row[2] if row[2] else [],
                "timestamp": str(row[3]) if row[3] else None,
            })
        cur.close()
        conn.close()
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        print(f"[Curriculum Changes] Error: {e}")

    return jsonify({"course_id": course_id, "changes": changes})
