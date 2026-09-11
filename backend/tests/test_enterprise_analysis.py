import json
import unittest
from pathlib import Path
from unittest.mock import patch

from services.enterprise_analysis import build_enterprise_report
from services.enterprise_ltm import write_enterprise_cold_snapshot


def _program():
    return {
        "id": 12,
        "name": "Data Privacy & Security",
        "engine_course_id": 44,
        "organization_id": 3,
        "organization_slug": "acme-learning",
        "cohort_id": 8,
        "cohort_label": "Q3",
        "content_version": 2,
        "training_source_count": 1,
        "report_source_count": 1,
    }


class EnterpriseAnalysisTests(unittest.TestCase):
    def test_friction_generates_evidence_backed_suggestion(self):
        rows = [{
            "module_id": "module-4",
            "module_title": "Handling customer data",
            "learners": 20,
            "events": 20,
            "completion_rate": 0.6,
            "average_score": 62,
            "median_duration_seconds": 2040,
            "average_attempts": 1.8,
            "learner_refs": [f"learner_{i}" for i in range(20)],
        }]
        pulses = {"module-4": {"partial": 4, "unlocated": 3, "understood": 3}}
        report = build_enterprise_report(_program(), rows, pulses)
        self.assertEqual(report["metrics"]["learners"], 20)
        self.assertEqual(report["metrics"]["content_issues"], 1)
        self.assertIn("completion is 60%", report["suggestions"][0]["evidence"])
        self.assertEqual(report["privacy"]["learner_identifiers_in_report"], False)
        self.assertNotIn("learner_refs", report["modules"][0])

    def test_second_run_reports_completion_delta(self):
        previous = {"metrics": {"completion_rate": 0.6}}
        rows = [{
            "module_id": "m1", "module_title": "Intro", "learners": 10,
            "events": 10, "completion_rate": 0.8, "average_score": 80,
            "median_duration_seconds": 600, "average_attempts": 1,
            "learner_refs": [f"l{i}" for i in range(10)],
        }]
        report = build_enterprise_report(_program(), rows, {}, previous)
        self.assertTrue(report["comparison"]["has_previous"])
        self.assertEqual(report["comparison"]["completion_delta"], 0.2)

    def test_cold_ltm_is_scoped_and_aggregate_only(self):
        report = build_enterprise_report(_program(), [], {})
        report["run_id"] = 91
        with patch.object(Path, "mkdir"), patch.object(Path, "write_text") as write_text:
            path = Path(write_enterprise_cold_snapshot(report, Path("ltm-root")))
        self.assertEqual(path.parts[-4:], ("enterprise", "acme-learning", "12", "run-91.json"))
        payload = json.loads(write_text.call_args.args[0])
        self.assertEqual(payload["privacy"]["learner_identifiers_in_report"], False)
        self.assertNotIn("learner_ref", json.dumps(payload))

    def test_suggestion_contract_carries_persistable_status(self):
        rows = [{
            "module_id": "m1", "module_title": "Risky module", "learners": 10,
            "events": 10, "completion_rate": 0.4, "average_score": 55,
            "median_duration_seconds": 900, "average_attempts": 2,
            "learner_refs": [f"l{i}" for i in range(10)],
        }]
        report = build_enterprise_report(_program(), rows, {})
        self.assertGreater(len(report["suggestions"]), 0)
        self.assertNotIn("status", report["suggestions"][0])
        # Persistence assigns status and latest-analysis overlays it from the
        # source-of-truth enterprise_suggestions row after a human decision.


if __name__ == "__main__":
    unittest.main()
