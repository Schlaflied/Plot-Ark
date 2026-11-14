import json
import sqlite3
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from flask import Flask

extensions_stub = types.ModuleType("extensions")
extensions_stub.redis_client = None
extensions_stub.reload_clients = Mock()
sys.modules.setdefault("extensions", extensions_stub)

from routes.assessment_design import assessment_design_bp  # noqa: E402
from services import assessment_review, ltm_writer  # noqa: E402
from services.assessment_design import (  # noqa: E402
    THINKING_TYPES,
    analyze_assessment_design,
    classify_assessment_item,
)

FIXTURE_MODULES = [
    {
        "title": "Privacy Foundations",
        "learning_objectives": [
            "Define key privacy terms and regulations",
            "Apply consent rules to real customer scenarios",
        ],
        "assignments": [
            {"title": "Terminology Quiz",
             "task_description": "Multiple choice quiz: define and list the key privacy terms."},
            {"title": "Consent Case Study",
             "task_description": "Apply consent rules to a realistic scenario and propose a fix."},
            {"title": "Policy Critique",
             "task_description": "Compare two privacy policies, evaluate their strengths and justify your ranking."},
            {"title": "Learning Journal",
             "task_description": "Reflect on your own experience handling customer data."},
        ],
    },
    {
        "title": "Data Retention",
        "learning_objectives": ["State retention periods for common record types"],
        "assignments": [
            {"title": "Retention Facts", "task_description": "True or false: retention periods. Name the statutory limits."},
        ],
    },
]


class FakeCursor:
    """Runs the app's Postgres-style SQL on sqlite (%s -> ?, lists -> JSON)."""

    def __init__(self, cur):
        self._cur = cur

    def execute(self, sql, params=()):
        params = tuple(json.dumps(p) if isinstance(p, list) else p for p in params)
        self._cur.execute(sql.replace("%s", "?"), params)

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()

    def close(self):
        pass


class FakeConn:
    def __init__(self, raw):
        self._raw = raw

    def cursor(self):
        return FakeCursor(self._raw.cursor())

    def commit(self):
        self._raw.commit()

    def rollback(self):
        self._raw.rollback()

    def close(self):
        pass  # keep the in-memory DB alive across calls


def make_db(modules):
    raw = sqlite3.connect(":memory:", check_same_thread=False)
    raw.executescript("""
        CREATE TABLE curricula (id INTEGER PRIMARY KEY, modules TEXT, topic TEXT,
                                course_code TEXT, level TEXT, course_type TEXT);
        CREATE TABLE change_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL,
            module_id TEXT NOT NULL, timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
            flag_reason TEXT, recommendation TEXT, agent TEXT DEFAULT 'curriculum_agent',
            status TEXT DEFAULT 'pending', backup_data TEXT,
            change_type TEXT DEFAULT 'objective_update', detail TEXT);
    """)
    raw.execute(
        "INSERT INTO curricula (id, modules, topic, course_code, level, course_type) VALUES (1, ?, 'Privacy Training', 'PRIV 101', 'intro', 'mixed')",
        (json.dumps(modules),),
    )
    raw.commit()
    return raw


class ClassificationTests(unittest.TestCase):
    def test_output_shape_and_types(self):
        result = classify_assessment_item({"title": "Quiz", "task_description": "Multiple choice quiz"})
        self.assertEqual(set(result), {"thinking_type", "reason", "confidence"})
        self.assertIn(result["thinking_type"], THINKING_TYPES)
        self.assertTrue(result["reason"])

    def test_each_thinking_type_is_recognised(self):
        expected = {
            "Terminology Quiz": "recall",
            "Consent Case Study": "application",
            "Policy Critique": "analysis",
            "Learning Journal": "reflection",
        }
        analysis = analyze_assessment_design(FIXTURE_MODULES)
        got = {i["item_title"]: i["thinking_type"] for i in analysis["items"]}
        for title, kind in expected.items():
            self.assertEqual(got[title], kind)

    def test_fixture_course_produces_classification_reasons_and_suggestions(self):
        analysis = analyze_assessment_design(FIXTURE_MODULES)
        self.assertEqual(analysis["summary"]["total_items"], 5)
        self.assertEqual(analysis["summary"]["recall_flagged"], 2)
        for item in analysis["items"]:
            self.assertTrue(item["reason"])
            self.assertEqual(item["flagged"], item["thinking_type"] == "recall")
        flagged_titles = {s["item_title"] for s in analysis["suggestions"]}
        self.assertEqual(flagged_titles, {"Terminology Quiz", "Retention Facts"})
        for s in analysis["suggestions"]:
            kinds = {a["kind"] for a in s["alternatives"]}
            self.assertTrue({"reflection_prompt", "application_task", "oral_component"} <= kinds)
            for alt in s["alternatives"]:
                self.assertTrue(alt["suggestion"])
                self.assertIn(s["objective"], alt["rationale"])  # tied to the learning objective

    def test_courses_with_no_assessments(self):
        for modules in ([], None, [{"title": "M1", "learning_objectives": ["x"], "assignments": []}],
                        [{"title": "M1"}]):
            analysis = analyze_assessment_design(modules)
            self.assertEqual(analysis["items"], [])
            self.assertEqual(analysis["suggestions"], [])
            self.assertEqual(analysis["summary"]["total_items"], 0)
            self.assertEqual(analysis["summary"]["recall_flagged"], 0)


class ReviewFlowTests(unittest.TestCase):
    def setUp(self):
        self.raw = make_db(FIXTURE_MODULES)
        patcher = patch("db.get_db", lambda: FakeConn(self.raw))
        patcher.start()
        self.addCleanup(patcher.stop)
        app = Flask(__name__)
        app.register_blueprint(assessment_design_bp)
        self.client = app.test_client()

    def analyze(self):
        resp = self.client.post("/api/curriculum/assessment-design/analyze", json={"course_id": 1})
        self.assertEqual(resp.status_code, 200)
        return resp.get_json()

    def decide(self, sid, **body):
        return self.client.post(f"/api/curriculum/assessment-design/{sid}/decision", json=body)

    def test_analyze_requires_course_id(self):
        resp = self.client.post("/api/curriculum/assessment-design/analyze", json={})
        self.assertEqual(resp.status_code, 400)

    def test_analyze_stores_pending_suggestions(self):
        data = self.analyze()
        self.assertEqual(len(data["suggestions"]), 2)
        self.assertTrue(all(s["status"] == "pending" for s in data["suggestions"]))
        rows = self.raw.execute("SELECT change_type, agent, status FROM change_log").fetchall()
        self.assertEqual(rows, [("assessment_design", "content_optimizer", "pending")] * 2)

    def test_accept_persists_chosen_alternative(self):
        sid = self.analyze()["suggestions"][0]["id"]
        resp = self.decide(sid, decision="accept", alternative_index=3)
        self.assertEqual(resp.status_code, 200)
        saved = self.client.get("/api/curriculum/assessment-design/1").get_json()["suggestions"]
        mine = next(s for s in saved if s["id"] == sid)
        self.assertEqual(mine["status"], "applied")
        self.assertEqual(mine["decision"], "accept")
        self.assertEqual(mine["chosen_alternative"]["kind"], "oral_component")

    def test_reject_persists_and_is_not_regenerated_as_pending(self):
        sid = self.analyze()["suggestions"][0]["id"]
        self.assertEqual(self.decide(sid, decision="reject").status_code, 200)
        status = self.raw.execute("SELECT status FROM change_log WHERE id = ?", (sid,)).fetchone()[0]
        self.assertEqual(status, "dismissed")
        # Re-analysis replaces pending rows only; the decision history is kept.
        self.analyze()
        status = self.raw.execute("SELECT status FROM change_log WHERE id = ?", (sid,)).fetchone()[0]
        self.assertEqual(status, "dismissed")

    def test_revise_stores_instructor_text(self):
        sid = self.analyze()["suggestions"][0]["id"]
        resp = self.decide(sid, decision="revise", revised_text="Oral defence of the quiz answers, 5 minutes.")
        self.assertEqual(resp.status_code, 200)
        suggestion = resp.get_json()["suggestion"]
        self.assertEqual(suggestion["decision"], "revise")
        self.assertEqual(suggestion["recommendation"], "Oral defence of the quiz answers, 5 minutes.")
        rec = self.raw.execute("SELECT recommendation, status FROM change_log WHERE id = ?", (sid,)).fetchone()
        self.assertEqual(rec, ("Oral defence of the quiz answers, 5 minutes.", "applied"))

    def test_invalid_decisions_are_rejected(self):
        sid = self.analyze()["suggestions"][0]["id"]
        self.assertEqual(self.decide(sid, decision="maybe").status_code, 400)
        self.assertEqual(self.decide(sid, decision="revise", revised_text="  ").status_code, 400)
        self.assertEqual(self.decide(sid, decision="accept", alternative_index=99).status_code, 400)
        self.assertEqual(self.decide(9999, decision="accept").status_code, 404)

    def test_cannot_decide_twice(self):
        sid = self.analyze()["suggestions"][0]["id"]
        self.assertEqual(self.decide(sid, decision="accept").status_code, 200)
        self.assertEqual(self.decide(sid, decision="reject").status_code, 409)

    def test_course_without_assessments_returns_empty_result(self):
        self.raw.execute("UPDATE curricula SET modules = ? WHERE id = 1",
                         (json.dumps([{"title": "M1", "learning_objectives": ["x"]}]),))
        data = self.analyze()
        self.assertEqual(data["items"], [])
        self.assertEqual(data["suggestions"], [])
        self.assertEqual(self.client.get("/api/curriculum/assessment-design/1").get_json()["suggestions"], [])

    def test_accepted_suggestion_appears_in_ltm_snapshot(self):
        sid = self.analyze()["suggestions"][0]["id"]
        self.decide(sid, decision="accept", alternative_index=0)
        with tempfile.TemporaryDirectory() as tmp, patch.object(ltm_writer, "_LTM_DIR", Path(tmp)):
            path = ltm_writer.write_cold_snapshot({"course_id": 1})
            text = Path(path).read_text(encoding="utf-8")
        self.assertIn("Curriculum Changes Applied", text)
        self.assertIn("module_1", text)
        self.assertIn(f"#{sid}", text)
        self.assertIn("Agent", text)

    def test_review_store_ignores_other_change_types(self):
        self.raw.execute("INSERT INTO change_log (course_id, module_id, recommendation, change_type) "
                         "VALUES (1, 'module_1', 'x', 'objective_update')")
        self.raw.commit()
        self.assertEqual(assessment_review.list_suggestions(1), [])
        self.assertEqual(self.decide(1, decision="accept").status_code, 404)


if __name__ == "__main__":
    unittest.main()
