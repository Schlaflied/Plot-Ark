import unittest

from services.confidence_quality import (
    FLAG_BEHAVIOR_MISMATCH,
    FLAG_STRAIGHT_LINING,
    FLAG_VERY_FAST,
    build_cohort_report,
    mismatch_flag,
    response_flags,
)


def _resp(learner, phase, answers, seconds=60):
    return {"learner": learner, "phase": phase, "answers": answers, "duration_seconds": seconds}


def _cohort(n=6, pre=(2, 3, 2, 3), post=(4, 4, 3, 5)):
    out = []
    for i in range(n):
        out += [_resp(f"l{i}", "pre", list(pre)), _resp(f"l{i}", "post", list(post))]
    return out


class ResponseFlagTests(unittest.TestCase):
    def test_straight_lining_flagged(self):
        self.assertIn(FLAG_STRAIGHT_LINING, response_flags([4, 4, 4, 4], 60))

    def test_varied_answers_not_straight_lining(self):
        self.assertEqual(response_flags([4, 3, 4, 5], 60), [])

    def test_two_identical_items_not_straight_lining(self):
        self.assertNotIn(FLAG_STRAIGHT_LINING, response_flags([3, 3], 60))

    def test_very_fast_completion_flagged(self):
        self.assertIn(FLAG_VERY_FAST, response_flags([1, 3, 4, 2], 2))

    def test_missing_duration_is_not_fast(self):
        self.assertEqual(response_flags([1, 3, 4, 2], None), [])


class MismatchTests(unittest.TestCase):
    pre, post = [2, 2, 2, 3], [5, 5, 4, 5]

    def test_jump_with_little_content_time_flagged(self):
        self.assertTrue(mismatch_flag(self.pre, self.post, {"content_seconds": 20, "avg_score": None}))

    def test_jump_with_low_score_flagged(self):
        self.assertTrue(mismatch_flag(self.pre, self.post, {"content_seconds": 900, "avg_score": 30}))

    def test_jump_backed_by_behavior_not_flagged(self):
        self.assertFalse(mismatch_flag(self.pre, self.post, {"content_seconds": 900, "avg_score": 85}))

    def test_small_change_not_flagged(self):
        self.assertFalse(mismatch_flag([3, 3, 3, 3], [3, 4, 3, 4], {"content_seconds": 5, "avg_score": 10}))

    def test_missing_behavior_not_flagged(self):
        self.assertFalse(mismatch_flag(self.pre, self.post, None))
        self.assertFalse(mismatch_flag(self.pre, self.post, {"content_seconds": None, "avg_score": None}))


class CohortReportTests(unittest.TestCase):
    def test_clean_cohort_reports_change_and_zero_flags(self):
        report = build_cohort_report(_cohort())
        self.assertTrue(report["change_trusted"])
        self.assertEqual(report["flagged"]["share"], 0)
        self.assertEqual(report["all_responses"]["pre_mean"], 2.5)
        self.assertEqual(report["all_responses"]["post_mean"], 4.0)
        self.assertEqual(report["all_responses"]["change"], 1.5)

    def test_flagged_reported_separately_and_not_deleted(self):
        data = _cohort(8)
        for i in range(2):  # two learners straight-line the post survey
            data[i * 2 + 1]["answers"] = [5, 5, 5, 5]
        report = build_cohort_report(data)
        self.assertEqual(report["flagged"]["count"], 2)
        self.assertEqual(report["flagged"]["by_reason"], {FLAG_STRAIGHT_LINING: 2})
        self.assertEqual(report["all_responses"]["n"], 8)
        self.assertEqual(report["unflagged_responses"]["n"], 6)
        self.assertEqual(report["flagged_responses"]["suppressed"], True)  # n=2 < min group
        self.assertEqual(report["unflagged_responses"]["change"], 1.5)

    def test_too_many_flagged_says_change_not_trusted(self):
        data = _cohort(6)
        for r in data:
            if r["phase"] == "post":
                r["duration_seconds"] = 1  # everyone rushed
        report = build_cohort_report(data)
        self.assertFalse(report["change_trusted"])
        self.assertTrue(any("should not be trusted" in n for n in report["notes"]))

    def test_behavior_mismatch_flag_in_cohort(self):
        data = _cohort(6, pre=(2, 2, 2, 3), post=(5, 5, 4, 5))
        behavior = {f"l{i}": {"content_seconds": 10, "avg_score": None} for i in range(6)}
        report = build_cohort_report(data, behavior)
        self.assertEqual(report["flagged"]["by_reason"].get(FLAG_BEHAVIOR_MISMATCH), 6)
        self.assertFalse(report["change_trusted"])

    def test_small_cohort_suppressed_and_no_individual_data(self):
        report = build_cohort_report(_cohort(3))
        self.assertIsNone(report["all_responses"]["change"])
        self.assertNotIn("l0", str(report))

    def test_no_confidence_data_is_neutral(self):
        report = build_cohort_report([])
        self.assertFalse(report["has_data"])
        self.assertTrue(report["change_trusted"])
        self.assertEqual(report["flagged"]["count"], 0)


if __name__ == "__main__":
    unittest.main()
