import json
import unittest

from services.evaluation_summary import (
    BANNED_PHRASES,
    FLAG_SELF_REPORT_ONLY,
    FLAG_SINGLE_SOURCE,
    FLAG_SMALL_SAMPLE,
    LEVELS,
    build_summary,
    normalize_level,
    render_markdown,
)

# Synthetic data only.
def rec(source, level, count, self_report=False):
    return {"source": source, "evaluation_level": level, "count": count, "self_report": self_report}


def level(summary, name):
    return next(l for l in summary["levels"] if l["level"] == name)


def all_text(summary):
    return (json.dumps(summary).lower() + "\n" + render_markdown(summary, "Synthetic Program").lower())


class NormalizeTests(unittest.TestCase):
    def test_names_numbers_and_empty(self):
        self.assertEqual(normalize_level("Learning"), "learning")
        self.assertEqual(normalize_level(3), "behavior")
        self.assertIsNone(normalize_level(None))
        self.assertIsNone(normalize_level(""))

    def test_invalid_raises(self):
        for bad in ("outcome", 0, 5, True, ["learning"], 2.5):
            with self.assertRaises(ValueError):
                normalize_level(bad)


class SummaryTests(unittest.TestCase):
    def test_no_evidence_all_levels_say_so(self):
        s = build_summary([])
        for name in LEVELS:
            lv = level(s, name)
            self.assertFalse(lv["has_evidence"])
            self.assertIn(f"No evidence collected at {name} level", lv["statement"])
        self.assertEqual(len(s["gaps"]), 4)
        self.assertEqual(s["status"], "draft_pending_review")

    def test_two_levels_missing_others_explicit(self):
        s = build_summary([rec("lms_report", "learning", 40), rec("confidence_pulse", "learning", 30, True),
                           rec("manager_followup", "behavior", 25)])
        self.assertTrue(level(s, "learning")["has_evidence"])
        self.assertTrue(level(s, "behavior")["has_evidence"])
        self.assertIn("No evidence collected at reaction level", level(s, "reaction")["statement"])
        self.assertIn("No evidence collected at results level", level(s, "results")["statement"])
        md = render_markdown(s, "Synthetic Program")
        self.assertIn("No evidence collected at reaction level", md)
        self.assertIn("No evidence collected at results level", md)

    def test_all_four_levels(self):
        s = build_summary([
            rec("learner_pulse", "reaction", 20), rec("lms_report", "reaction", 20),
            rec("lms_report", "learning", 50), rec("confidence_pulse", "learning", 40, True),
            rec("manager_followup", "behavior", 30), rec("lms_report", "behavior", 30),
            rec("business_metric", "results", 12), rec("finance_export", "results", 12),
        ])
        for name in LEVELS:
            lv = level(s, name)
            self.assertTrue(lv["has_evidence"])
            self.assertEqual(lv["flags"], [])
        self.assertEqual(s["gaps"], [])
        self.assertEqual(level(s, "learning")["total_count"], 90)

    def test_small_sample_and_single_source_flags(self):
        s = build_summary([rec("manager_followup", "behavior", 4)])
        flags = level(s, "behavior")["flags"]
        self.assertIn(FLAG_SMALL_SAMPLE, flags)
        self.assertIn(FLAG_SINGLE_SOURCE, flags)
        self.assertNotIn(FLAG_SELF_REPORT_ONLY, flags)
        self.assertIn("Single source", render_markdown(s))

    def test_self_report_only_flag(self):
        s = build_summary([rec("confidence_pulse", "learning", 50, True), rec("learner_pulse", "learning", 50, True)])
        self.assertEqual(level(s, "learning")["flags"], [FLAG_SELF_REPORT_ONLY])

    def test_mixed_self_report_not_flagged(self):
        s = build_summary([rec("confidence_pulse", "learning", 50, True), rec("lms_report", "learning", 50, False)])
        self.assertNotIn(FLAG_SELF_REPORT_ONLY, level(s, "learning")["flags"])

    def test_missing_and_invalid_tags_not_assigned(self):
        s = build_summary([rec("lms_report", None, 10), rec("lms_report", "", 10),
                           rec("lms_report", "outcome", 10), rec("lms_report", 9, 10),
                           {"source": "x", "count": 5}])
        self.assertEqual(s["untagged_records"], 3)
        self.assertEqual(s["invalid_tag_records"], 2)
        self.assertFalse(any(l["has_evidence"] for l in s["levels"]))
        self.assertIn("not assigned to any level", render_markdown(s))

    def test_gaps_point_to_pulse_surveys(self):
        s = build_summary([])
        text = {g["level"]: g["next_evidence"] for g in s["gaps"]}
        self.assertIn("Manager Follow-up Pulse", text["behavior"])
        self.assertIn("confidence pulse", text["learning"])

    def test_program_level_only(self):
        s = build_summary([rec("lms_report", "learning", 40)])
        self.assertNotIn("learner_ref", json.dumps(s))


class NoCausalLanguageTests(unittest.TestCase):
    def test_banned_phrases_never_appear(self):
        scenarios = [
            [],
            [rec("lms_report", "learning", 40), rec("manager_followup", "behavior", 3)],
            [rec("a", "reaction", 20), rec("b", "reaction", 20), rec("c", "learning", 50), rec("d", "learning", 50),
             rec("e", "behavior", 30), rec("f", "behavior", 30), rec("g", "results", 12, True), rec("h", "results", 12)],
            [rec("lms_report", "bad", 1), rec("lms_report", None, 1)],
        ]
        for records in scenarios:
            text = all_text(build_summary(records))
            for phrase in BANNED_PHRASES:
                self.assertNotIn(phrase, text, f"banned phrase {phrase!r} present")

    def test_banned_list_covers_core_phrases(self):
        for phrase in ("caused", "resulted in", "led to"):
            self.assertIn(phrase, BANNED_PHRASES)

    def test_statement_says_description_only(self):
        s = build_summary([rec("lms_report", "learning", 40)])
        self.assertIn("describes the evidence only", level(s, "learning")["statement"])


if __name__ == "__main__":
    unittest.main()
