import tempfile
import unittest
from pathlib import Path
from unittest import mock

from services import ltm_writer, measurement_plan as mp


def _plan(**overrides):
    base = {
        "intended_behavior_change": "Managers give weekly feedback",
        "evaluation_levels": [3, 1],
        "evidence_sources": ["lms_export", "manager_followup", "learner_pulse"],
        "timing": "30 and 90 days after launch",
        "reviewer": "L&D lead",
    }
    base.update(overrides)
    return base


class NormalizeTests(unittest.TestCase):
    def test_normalizes_and_dedupes(self):
        plan = mp.normalize_plan(_plan(evaluation_levels=[3, 1, 3],
                                       evidence_sources=["lms_export", "lms_export"]))
        self.assertEqual(plan["evaluation_levels"], [1, 3])
        self.assertEqual(plan["evidence_sources"], ["lms_export"])

    def test_rejects_unknown_source_and_level(self):
        with self.assertRaises(ValueError):
            mp.normalize_plan(_plan(evidence_sources=["telepathy"]))
        with self.assertRaises(ValueError):
            mp.normalize_plan(_plan(evaluation_levels=[5]))
        with self.assertRaises(ValueError):
            mp.normalize_plan(_plan(evaluation_levels=[True]))

    def test_empty_input_gives_empty_plan(self):
        self.assertEqual(mp.normalize_plan(None), mp.empty_plan())


class VersioningTests(unittest.TestCase):
    def test_only_drafts_are_editable(self):
        self.assertTrue(mp.can_edit(mp.STATUS_DRAFT))
        self.assertFalse(mp.can_edit(mp.STATUS_APPROVED))

    def test_new_version_copies_previous_plan_independently(self):
        previous = mp.normalize_plan(_plan())
        copied = mp.copy_plan_for_new_version(previous)
        self.assertEqual(copied, previous)
        copied["evidence_sources"].append("business_metric")
        self.assertNotIn("business_metric", previous["evidence_sources"])

    def test_first_version_starts_empty(self):
        self.assertEqual(mp.copy_plan_for_new_version(None), mp.empty_plan())


class GapDetectionTests(unittest.TestCase):
    def test_lists_planned_sources_without_evidence(self):
        plan = mp.normalize_plan(_plan())
        result = mp.compare_plan_to_evidence(plan, ["lms_report"])
        self.assertTrue(result["has_plan"])
        self.assertEqual(result["collected"], ["lms_export"])
        self.assertEqual(result["gaps"], ["manager_followup", "learner_pulse"])

    def test_no_gaps_when_all_collected_and_unplanned_reported(self):
        plan = mp.normalize_plan(_plan(evidence_sources=["lms_export"]))
        result = mp.compare_plan_to_evidence(plan, ["lms_report", "business_metric"])
        self.assertEqual(result["gaps"], [])
        self.assertEqual(result["unplanned"], ["business_metric"])

    def test_no_plan_means_no_gaps(self):
        for plan in (None, {}):
            result = mp.compare_plan_to_evidence(plan, ["lms_report"])
            self.assertFalse(result["has_plan"])
            self.assertEqual(result["gaps"], [])


class SnapshotTests(unittest.TestCase):
    REPORT = {"course_id": 7, "risk_assessment": {}, "content_optimization": {},
              "behavior_analysis": {}}

    def _write(self, **extra):
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(ltm_writer, "_LTM_DIR", Path(tmp)), \
                mock.patch("db.get_db", return_value=None):
            path = ltm_writer.write_cold_snapshot({**self.REPORT, **extra})
            return Path(path).read_text(encoding="utf-8")

    def test_snapshot_includes_plan_and_gaps(self):
        ctx = {"version": 2, "status": "approved", "plan": mp.normalize_plan(_plan()),
               "source_kinds": ["lms_report"]}
        text = self._write(measurement_plan_context=ctx)
        self.assertIn("measurement_plan_version: 2", text)
        self.assertIn("measurement_plan_status: approved", text)
        self.assertIn("measurement_plan_sources: [lms_export, manager_followup, learner_pulse]", text)
        self.assertIn("## Measurement Plan (v2, approved)", text)
        self.assertIn("Planned evidence not yet collected**: manager_followup, learner_pulse", text)
        parsed = ltm_writer._parse_frontmatter(text)
        self.assertEqual(parsed["measurement_plan_version"], 2)

    def test_snapshot_without_plan_is_unchanged(self):
        text = self._write()
        self.assertNotIn("measurement_plan", text)
        self.assertNotIn("Measurement Plan", text)


if __name__ == "__main__":
    unittest.main()
