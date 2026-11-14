import json
import sqlite3
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from flask import Flask

extensions_stub = types.ModuleType("extensions")
extensions_stub.redis_client = None
extensions_stub.reload_clients = Mock()
sys.modules.setdefault("extensions", extensions_stub)

from routes.feedback_triage import feedback_triage_bp  # noqa: E402
from services import feedback_triage as triage  # noqa: E402
from services import feedback_triage_review as review  # noqa: E402

FIXTURE = Path(__file__).parent / "fixtures" / "feedback" / "synthetic_feedback.csv"


def fixture_rows():
    return triage.parse_feedback_csv(FIXTURE.read_text(encoding="utf-8"))


def by_label(result, fragment):
    for t in result["escalations"] + result["monitor"]:
        if fragment in t["label"]:
            return t
    return None


class TriageTests(unittest.TestCase):
    def test_fixture_topics_counts_and_escalation_list(self):
        r = triage.triage_feedback(fixture_rows())
        video = by_label(r, "video")
        pace = by_label(r, "pace")
        quiz = by_label(r, "quiz")
        # L01 posted the same video complaint three times: counts once.
        self.assertEqual(video["distinct_learners"], 4)
        self.assertEqual(pace["distinct_learners"], 3)
        self.assertEqual(quiz["distinct_learners"], 2)
        self.assertEqual({t["label"] for t in r["escalations"]},
                         {video["label"], pace["label"], "Cannot log in"})
        self.assertEqual([t["label"] for t in r["monitor"]], [quiz["label"]])
        self.assertEqual(video["triggered_rule"], triage.RULE_THRESHOLD)
        self.assertEqual(quiz["triggered_rule"], triage.RULE_MONITOR)
        self.assertEqual(r["summary"]["suppressed_small_topics"], 1)  # the lone coffee comment

    def test_threshold_change_changes_list(self):
        rows = fixture_rows()
        low = triage.triage_feedback(rows, {"raise_now_min_learners": 2})
        high = triage.triage_feedback(rows, {"raise_now_min_learners": 4})
        self.assertEqual(by_label(low, "quiz")["level"], "raise_now")
        self.assertEqual(by_label(high, "pace")["level"], "monitor")
        self.assertEqual(by_label(high, "video")["level"], "raise_now")
        self.assertEqual(low["summary"]["raise_now"], 3)
        self.assertEqual(high["summary"]["raise_now"], 1)

    def test_single_blocker_flagged_at_count_one(self):
        r = triage.triage_feedback(
            [{"learner_id": "A", "comment": "I cannot submit my assignment, the button is broken."}],
            {"raise_now_min_learners": 5})
        self.assertEqual(len(r["escalations"]), 1)
        t = r["escalations"][0]
        self.assertEqual(t["distinct_learners"], 1)
        self.assertEqual(t["level"], "blocker")
        self.assertEqual(t["triggered_rule"], triage.RULE_BLOCKER)
        # One person must not be identifiable: examples withheld below group size.
        self.assertEqual(t["examples"], [])
        self.assertTrue(t["examples_withheld"])

    def test_empty_inputs(self):
        for rows in ([], None, [{"learner_id": "", "comment": "x"}, {"learner_id": "A", "comment": "  "}]):
            r = triage.triage_feedback(rows)
            self.assertEqual(r["escalations"], [])
            self.assertEqual(r["monitor"], [])
            self.assertEqual(r["summary"]["topics_found"], 0)
        self.assertEqual(triage.parse_feedback_csv(""), [])
        self.assertEqual(triage.parse_feedback_csv("learner_id,comment\n"), [])

    def test_topic_below_minimum_group_size_is_hidden(self):
        one = [{"learner_id": "A", "comment": "The glossary page has a confusing layout."}]
        r = triage.triage_feedback(one)
        self.assertEqual(r["escalations"] + r["monitor"], [])
        self.assertEqual(r["summary"]["suppressed_small_topics"], 1)
        # The privacy floor cannot be configured away.
        r = triage.triage_feedback(one, {"min_group_size": 1, "raise_now_min_learners": 1})
        self.assertEqual(r["escalations"] + r["monitor"], [])
        self.assertEqual(r["config"]["min_group_size"], triage.MIN_GROUP_SIZE_FLOOR)

    def test_duplicate_comments_from_same_learner_count_once(self):
        rows = [{"learner_id": "A", "comment": "Video keeps buffering during the lecture."}] * 5
        rows += [{"learner_id": "A", "comment": "Lecture video buffering is awful."}] * 3
        r = triage.triage_feedback(rows, {"raise_now_min_learners": 3})
        self.assertEqual(r["escalations"] + r["monitor"], [])
        self.assertEqual(r["summary"]["suppressed_small_topics"], 1)

    def test_output_has_no_learner_ids_and_examples_are_shortened(self):
        rows = fixture_rows() + [{"learner_id": "L99", "course_ref": "MOD2",
                                  "comment": "video buffering " + "very long " * 60 + "mail me at a@b.com"}]
        result = triage.triage_feedback(rows)
        blob = json.dumps(result)
        for i in list(range(1, 12)) + [99]:
            self.assertNotIn(f"L{i:02d}", blob)
        self.assertNotIn("a@b.com", blob)
        for t in result["escalations"]:
            for ex in t["examples"]:
                self.assertLessEqual(len(ex), 120)

    def test_config_validation(self):
        for bad in ({"raise_now_min_learners": 0}, {"nope": 1}, {"similarity_threshold": 2}, "x"):
            with self.assertRaises(ValueError):
                triage.normalize_config(bad)

    def test_csv_requires_columns(self):
        with self.assertRaises(ValueError):
            triage.parse_feedback_csv("a,b\n1,2\n")


# ── Route + review flow (sqlite stands in for Postgres) ──────────────────

class FakeCursor:
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

    def close(self):
        pass


def make_db():
    raw = sqlite3.connect(":memory:", check_same_thread=False)
    raw.executescript("""
        CREATE TABLE change_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL,
            module_id TEXT NOT NULL, timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
            flag_reason TEXT, recommendation TEXT, agent TEXT DEFAULT 'curriculum_agent',
            status TEXT DEFAULT 'pending', backup_data TEXT,
            change_type TEXT DEFAULT 'objective_update', detail TEXT);
    """)
    return raw


class RouteTests(unittest.TestCase):
    def setUp(self):
        self.raw = make_db()
        patcher = patch("db.get_db", lambda: FakeConn(self.raw), create=True)
        patcher.start()
        self.addCleanup(patcher.stop)
        app = Flask(__name__)
        app.register_blueprint(feedback_triage_bp)
        self.client = app.test_client()

    def analyze(self, **extra):
        return self.client.post("/api/feedback-triage/analyze",
                                json={"course_id": 1, "csv": FIXTURE.read_text(encoding="utf-8"), **extra})

    def test_analyze_stores_pending_and_review_flow(self):
        body = self.analyze().get_json()
        self.assertEqual(body["summary"]["blockers"], 1)
        items = body["escalations"]
        self.assertEqual(len(items), 3)
        self.assertTrue(all(i["status"] == "pending" for i in items))

        # Re-running replaces pending items rather than duplicating them.
        self.assertEqual(len(self.analyze().get_json()["escalations"]), 3)
        items = self.client.get("/api/feedback-triage/1").get_json()["escalations"]
        self.assertEqual(len(items), 3)

        iid = items[0]["id"]
        ok = self.client.post(f"/api/feedback-triage/{iid}/decision", json={"decision": "accept"})
        self.assertEqual(ok.get_json()["escalation"]["status"], "applied")
        again = self.client.post(f"/api/feedback-triage/{iid}/decision", json={"decision": "reject"})
        self.assertEqual(again.status_code, 409)
        rev = self.client.post(f"/api/feedback-triage/{items[1]['id']}/decision", json={"decision": "revise"})
        self.assertEqual(rev.status_code, 400)
        rej = self.client.post(f"/api/feedback-triage/{items[2]['id']}/decision", json={"decision": "reject"})
        self.assertEqual(rej.get_json()["escalation"]["status"], "dismissed")
        # Stored like other recommendations, so applied ones reach LTM snapshots.
        row = self.raw.execute("SELECT agent, change_type, status FROM change_log WHERE id = ?", (iid,)).fetchone()
        self.assertEqual(row, (review.AGENT, review.CHANGE_TYPE, "applied"))

    def test_empty_file_and_bad_input(self):
        r = self.client.post("/api/feedback-triage/analyze", json={"course_id": 1, "csv": ""})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["escalations"], [])
        self.assertEqual(self.client.post("/api/feedback-triage/analyze",
                                          json={"csv": ""}).status_code, 400)
        self.assertEqual(self.analyze(config={"raise_now_min_learners": 0}).status_code, 400)

    def test_threshold_via_route(self):
        r = self.analyze(config={"raise_now_min_learners": 2}).get_json()
        self.assertEqual(r["summary"]["raise_now"], 3)


if __name__ == "__main__":
    unittest.main()
