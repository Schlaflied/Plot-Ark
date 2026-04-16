"""Demo seed route — one-click load of sample data for first-time users.

POST /api/demo/seed  (SSE)
  1. Guard: skip if courses already exist
  2. Seed curriculum flags + change_log  (seed_curriculum_demo.seed())
  3. Seed xAPI mock data                 (xapi_generator.generate_all_courses)
  4. Seed student feedback               (xapi_generator.seed_all_feedback)
  5. Auto-analyze every course           (_run_structural_analysis per course)

GET /api/demo/status
  Returns { has_data: bool } — frontend uses this to show/hide the banner.
"""

import json
from flask import Blueprint, Response, stream_with_context, jsonify
from db import get_db

demo_bp = Blueprint("demo", __name__)


def _has_courses() -> bool:
    conn = get_db()
    if not conn:
        return False
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM curricula")
        count = cur.fetchone()[0]
        cur.close()
        conn.close()
        return count > 0
    except Exception:
        try:
            conn.close()
        except Exception:
            pass
        return False


def _sse(msg: str, status: str = "progress") -> str:
    return f"data: {json.dumps({'status': status, 'message': msg})}\n\n"


@demo_bp.route("/api/demo/status", methods=["GET"])
def demo_status():
    return jsonify({"has_data": _has_courses()})


@demo_bp.route("/api/demo/seed", methods=["POST"])
def seed_demo():
    """Stream demo seed progress via SSE."""

    def event_stream():
        if _has_courses():
            yield _sse("Courses already exist — skipping seed.", "done")
            return

        # ── Step 1: Seed flags + change_log ──────────────────────────────────
        yield _sse("Creating demo courses and flags…")
        try:
            from seed_curriculum_demo import seed as run_seed
            run_seed()
            yield _sse("Flags and change log seeded.")
        except Exception as e:
            yield _sse(f"Flag seed error: {e}", "error")
            return

        # Collect course IDs for subsequent steps
        conn = get_db()
        course_ids = []
        if conn:
            try:
                cur = conn.cursor()
                cur.execute("SELECT id FROM curricula ORDER BY id")
                course_ids = [r[0] for r in cur.fetchall()]
                cur.close()
                conn.close()
            except Exception:
                try:
                    conn.close()
                except Exception:
                    pass

        # ── Step 2: Seed xAPI + feedback ─────────────────────────────────────
        yield _sse(f"Seeding student behaviour data for {len(course_ids)} courses…")
        try:
            from services.xapi_generator import generate_all_courses, seed_all_feedback
            generate_all_courses(noise_ratio=0.08)
            seed_all_feedback(noise_ratio=0.08)
            yield _sse("Student behaviour data ready.")
        except Exception as e:
            yield _sse(f"xAPI seed error: {e}", "error")
            # Non-fatal — continue to analysis

        # ── Step 3: Auto-analyze every course ────────────────────────────────
        yield _sse(f"Running curriculum analysis ({len(course_ids)} courses)…")
        from routes.curriculum_agent_routes import _run_structural_analysis
        errors = 0
        for cid in course_ids:
            try:
                _run_structural_analysis(cid)
            except Exception as e:
                errors += 1
                print(f"[DemoSeed] auto-analyze error course {cid}: {e}")
        if errors:
            yield _sse(f"Analysis complete ({errors} courses skipped due to errors).")
        else:
            yield _sse("Curriculum analysis complete.")

        yield _sse("All done — your demo environment is ready!", "done")

    return Response(
        stream_with_context(event_stream()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
