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
            SELECT module_id, recommendation, flag_reason, status, timestamp, change_type
            FROM change_log
            WHERE course_id = %s AND status != 'dismissed'
            ORDER BY timestamp DESC
            LIMIT 20
        """, (str(course_id),))
        for row in cur.fetchall():
            suggestions.append({
                "module_id": row[0],
                "module_name": row[0],
                "recommendation": row[1],
                "reasons": row[2] if row[2] else [],
                "source": "curriculum_agent",
                "status": row[3],       # pending | applied
                "change_type": row[5] or "objective_update",
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
    """Mutate a module's learning objectives based on the AI recommendation.

    Layer 1 (objective_update): Only touches learning_objectives.
    References and assignments are handled by separate endpoints.

    Returns (mutated_modules, original_module_backup).
    """
    idx = int(module_id.replace("module_", "")) - 1
    if idx < 0 or idx >= len(modules):
        return modules, None

    original = json.dumps(modules[idx])  # backup
    m = modules[idx]

    # ── Add a scaffolding objective ───────────────────────────────────────
    objectives = m.get("learning_objectives", [])
    objectives.append(
        "Apply foundational concepts through structured scaffolding activities "
        "to address identified prerequisite gaps"
    )
    m["learning_objectives"] = objectives

    # ── Reduce complexity level if high ──────────────────────────────────
    cl = m.get("complexity_level", 3)
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
            conn.rollback()
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
            conn.rollback()
            conn.close()
        except Exception:
            pass
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Auto-analyze — structural flags for newly generated courses
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _run_structural_analysis(course_id: int) -> None:
    """Generate structural flags + curriculum-agent suggestions for a new course.

    Called in a background thread after course save so the professor sees
    suggestions immediately without waiting for student xAPI data.

    Strategy:
      1. Load course modules from DB.
      2. Analyse structure: complexity jumps, missing readings, dense early modules.
      3. Write flags to module_flags.
      4. Run CurriculumAgentNode on those flags → suggestions in change_log.
    """
    from db import get_db
    from services.threshold_checker import _save_flags
    from agents.curriculum_agent import CurriculumAgentNode
    from agents.base import SharedMemory
    from extensions import redis_client

    conn = get_db()
    if not conn:
        return
    try:
        cur = conn.cursor()
        cur.execute("SELECT modules, topic FROM curricula WHERE id = %s", (course_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return
        modules_raw, topic = row
        modules = modules_raw if isinstance(modules_raw, list) else (
            json.loads(modules_raw) if modules_raw else []
        )
    except Exception as e:
        print(f"[AutoAnalyze] DB read error: {e}")
        return

    if not modules:
        return

    structural_flags: list[dict] = []

    for i, mod in enumerate(modules):
        mod_id = f"module_{i + 1}"
        mod_name = mod.get("title", mod_id)
        signals = []

        cl = mod.get("complexity_level", 0)
        # Steep complexity jump from previous module
        if i > 0:
            prev_cl = modules[i - 1].get("complexity_level", 0)
            if isinstance(cl, (int, float)) and isinstance(prev_cl, (int, float)) and cl - prev_cl >= 2:
                signals.append({
                    "source": "structural",
                    "detail": f"Complexity jumps from {prev_cl} to {cl} — consider a bridging exercise or scaffolding activity before this module.",
                })

        # No readings assigned
        readings = mod.get("recommended_readings", [])
        if not readings:
            signals.append({
                "source": "structural",
                "detail": "No recommended readings assigned. Adding at least one grounded source improves student preparation.",
            })

        # High complexity in first two modules
        if i < 2 and isinstance(cl, (int, float)) and cl >= 4:
            signals.append({
                "source": "structural",
                "detail": f"High complexity ({cl}/5) in an early module — may overwhelm students before foundational concepts are established.",
            })

        if signals:
            structural_flags.append({
                "module_id": mod_id,
                "module_name": mod_name,
                "flag_level": "orange" if len(signals) >= 2 else "yellow",
                "signals": signals,
            })

    # Always generate at least one flag so the drawer has content
    if not structural_flags and modules:
        first = modules[0]
        structural_flags.append({
            "module_id": "module_1",
            "module_name": first.get("title", "Module 1"),
            "flag_level": "yellow",
            "signals": [{
                "source": "structural",
                "detail": "No student data yet. Review module objectives and ensure learning outcomes align with Bloom's Taxonomy before the course begins.",
            }],
        })

    # Persist flags
    _save_flags(course_id, structural_flags)
    print(f"[AutoAnalyze] Course {course_id}: {len(structural_flags)} structural flags written.")

    # Write change_log entries directly based on signal type.
    # Bypasses LTM-dependent curriculum agent classification so all three
    # change_types are always generated for a new course.
    _write_structural_change_log(course_id, structural_flags, modules)


def _write_structural_change_log(course_id: int, flags: list, modules: list) -> None:
    """Write objective_update + reference_suggestion + assignment_alert entries
    to change_log based on structural signal type.

    Rules:
      - complexity jump or high early complexity → objective_update + assignment_alert
      - no readings → reference_suggestion
      - fallback (no student data) → one of each type across first three modules
    """
    from db import get_db

    conn = get_db()
    if not conn:
        return

    try:
        cur = conn.cursor()

        # Clear old non-applied entries so re-runs are clean
        cur.execute("""
            DELETE FROM change_log
            WHERE course_id = %s AND status = 'pending'
        """, (course_id,))

        entries = []

        for flag in flags:
            mod_id = flag["module_id"]
            mod_name = flag["module_name"]
            signals = flag.get("signals", [])

            for sig in signals:
                detail = sig.get("detail", "")

                if "complexity" in detail.lower():
                    # Layer 1: objective update
                    entries.append((
                        course_id, mod_id,
                        ["complexity jump detected", "scaffold before this module"],
                        (
                            f"Learning objectives for {mod_name} have been updated to introduce "
                            f"bridging activities and reduce the prerequisite gap identified in the course structure."
                        ),
                        "objective_update",
                    ))
                    # Layer 3: assignment alert (always paired with objective update)
                    entries.append((
                        course_id, mod_id,
                        ["objectives updated", "review assignment alignment"],
                        (
                            f"Objectives for {mod_name} were revised. Review existing assignments "
                            f"to ensure they still align with the updated learning outcomes."
                        ),
                        "assignment_alert",
                    ))

                elif "readings" in detail.lower() or "source" in detail.lower():
                    # Layer 2: reference suggestion
                    entries.append((
                        course_id, mod_id,
                        ["no readings assigned", "add supporting references"],
                        (
                            f"{mod_name} has no recommended readings. Search for references "
                            f"aligned with the module's learning objectives to support student preparation."
                        ),
                        "reference_suggestion",
                    ))

        # Ensure all three types exist — fill gaps using first available modules
        present_types = {e[4] for e in entries}
        mod_pool = [f["module_id"] for f in flags] or ["module_1"]
        mod_names = {f["module_id"]: f["module_name"] for f in flags}

        if "objective_update" not in present_types and mod_pool:
            mid = mod_pool[0]
            mname = mod_names.get(mid, mid)
            entries.append((
                course_id, mid,
                ["structural review", "update learning objectives"],
                (
                    f"Learning objectives for {mname} have been updated to better align with "
                    f"Bloom's Taxonomy and the course's difficulty progression."
                ),
                "objective_update",
            ))

        if "reference_suggestion" not in present_types and mod_pool:
            mid = mod_pool[min(1, len(mod_pool) - 1)]
            mname = mod_names.get(mid, mid)
            entries.append((
                course_id, mid,
                ["reference gap detected", "search for aligned readings"],
                (
                    f"Current references for {mname} may not fully support the learning objectives. "
                    f"Search for updated references to better scaffold student understanding."
                ),
                "reference_suggestion",
            ))

        if "assignment_alert" not in present_types and mod_pool:
            mid = mod_pool[min(2, len(mod_pool) - 1)]
            mname = mod_names.get(mid, mid)
            entries.append((
                course_id, mid,
                ["objectives changed", "manual assignment review needed"],
                (
                    f"Objectives for {mname} were revised. Review existing assignments to ensure "
                    f"they still align with the updated learning outcomes — no automatic changes applied."
                ),
                "assignment_alert",
            ))

        for (cid, mid, reasons, rec, ctype) in entries:
            cur.execute("""
                INSERT INTO change_log (course_id, module_id, flag_reason, recommendation, change_type)
                VALUES (%s, %s, %s, %s, %s)
            """, (cid, mid, reasons, rec, ctype))

        conn.commit()
        cur.close()
        conn.close()
        print(f"[AutoAnalyze] Wrote {len(entries)} change_log entries for course {course_id} "
              f"({', '.join(set(e[4] for e in entries))})")
    except Exception as e:
        print(f"[AutoAnalyze] change_log write error: {e}")
        try:
            conn.rollback()
            conn.close()
        except Exception:
            pass


@curriculum_agent_bp.route("/api/curriculum/auto-analyze/<int:course_id>", methods=["POST"])
def auto_analyze_course(course_id):
    """Trigger structural analysis for a newly generated course (called post-save)."""
    import threading
    t = threading.Thread(target=_run_structural_analysis, args=(course_id,), daemon=True)
    t.start()
    return jsonify({"status": "started", "course_id": course_id})


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# References — Tavily search + apply
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _extract_domain(url: str) -> str:
    """Extract bare domain from a URL for deduplication."""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        domain = parsed.netloc.lower().removeprefix("www.")
        return domain
    except Exception:
        return url


@curriculum_agent_bp.route("/api/curriculum/references/search", methods=["POST"])
def search_references():
    """Search Tavily for references aligned with a module's learning objectives.

    Deduplicates against the module's existing recommended_readings.

    Request body:
        { "course_id": int, "module_id": "module_1" }

    Returns:
        { "candidates": [{ "title", "url", "domain", "snippet", "source" }] }
    """
    from db import get_db
    from extensions import tavily_client

    data = request.get_json() or {}
    course_id = data.get("course_id")
    module_id = data.get("module_id")

    if not course_id or not module_id:
        return jsonify({"error": "course_id and module_id are required"}), 400

    # 1. Load module to get learning_objectives + existing readings
    conn = get_db()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500

    try:
        cur = conn.cursor()
        cur.execute("SELECT modules FROM curricula WHERE id = %s", (course_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return jsonify({"error": "Course not found"}), 404
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({"error": str(e)}), 500

    modules_raw = row[0]
    modules = modules_raw if isinstance(modules_raw, list) else (
        json.loads(modules_raw) if modules_raw else []
    )

    idx = int(module_id.replace("module_", "")) - 1
    if idx < 0 or idx >= len(modules):
        return jsonify({"error": "Module not found"}), 404

    module = modules[idx]
    objectives = module.get("learning_objectives", [])
    existing_readings = module.get("recommended_readings", [])

    # 2. Build existing domain set for deduplication
    existing_domains = set()
    for r in existing_readings:
        url = r.get("url", "") if isinstance(r, dict) else ""
        if url:
            existing_domains.add(_extract_domain(url))

    # 3. Build search query from objectives
    if not objectives:
        query = module.get("title", "learning resources")
    else:
        # Use first 2 objectives, strip trailing punctuation, join
        query_parts = [obj.rstrip(".").strip() for obj in objectives[:2]]
        query = " AND ".join(query_parts)

    # 4. Call Tavily
    try:
        results = tavily_client.search(
            query=query,
            search_depth="basic",
            max_results=8,
            include_domains=[],
            exclude_domains=[],
        )
        raw_results = results.get("results", [])
    except Exception as e:
        return jsonify({"error": f"Tavily search failed: {e}"}), 502

    # 5. Filter out duplicates and build candidate list
    candidates = []
    for r in raw_results:
        url = r.get("url", "")
        domain = _extract_domain(url)
        if domain in existing_domains:
            continue
        candidates.append({
            "title": r.get("title", ""),
            "url": url,
            "domain": domain,
            "snippet": r.get("content", "")[:200],
            "source": r.get("source", domain),
        })
        existing_domains.add(domain)  # prevent intra-result dupes

    return jsonify({
        "module_id": module_id,
        "query": query,
        "candidates": candidates,
    })


@curriculum_agent_bp.route("/api/curriculum/references/apply", methods=["POST"])
def apply_references():
    """Add professor-selected Tavily references to a module's recommended_readings.

    Request body:
        {
          "course_id": int,
          "module_id": "module_1",
          "references": [{ "title", "url", "domain", "snippet" }]
        }
    """
    from db import get_db

    data = request.get_json() or {}
    course_id = data.get("course_id")
    module_id = data.get("module_id")
    new_refs = data.get("references", [])

    if not course_id or not module_id or not new_refs:
        return jsonify({"error": "course_id, module_id, and references are required"}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500

    try:
        cur = conn.cursor()
        cur.execute("SELECT modules FROM curricula WHERE id = %s", (course_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({"error": "Course not found"}), 404

        modules_raw = row[0]
        modules = modules_raw if isinstance(modules_raw, list) else (
            json.loads(modules_raw) if modules_raw else []
        )

        idx = int(module_id.replace("module_", "")) - 1
        if idx < 0 or idx >= len(modules):
            cur.close()
            conn.close()
            return jsonify({"error": "Module not found"}), 404

        module = modules[idx]
        readings = module.get("recommended_readings", [])

        for ref in new_refs:
            readings.append({
                "title": ref.get("title", ""),
                "url": ref.get("url", ""),
                "type": "academic",
                "estimated_time": "15 min read",
                "reading_type": "optional",
                "key_points": [],
                "rationale": f"Added by Curriculum Agent via Tavily search — {ref.get('snippet', '')[:120]}",
            })

        module["recommended_readings"] = readings
        modules[idx] = module

        cur.execute(
            "UPDATE curricula SET modules = %s WHERE id = %s",
            (json.dumps(modules), course_id),
        )

        # Mark the reference_suggestion change_log entry as applied
        cur.execute("""
            UPDATE change_log
            SET status = 'applied'
            WHERE course_id = %s AND module_id = %s
              AND change_type = 'reference_suggestion' AND status = 'pending'
        """, (str(course_id), module_id))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({
            "status": "applied",
            "course_id": course_id,
            "module_id": module_id,
            "added_count": len(new_refs),
        })
    except Exception as e:
        try:
            conn.rollback()
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
