import datetime
import unittest

from flask import Flask

from routes.enterprise_followup import enterprise_followup_bp
from services.enterprise_followup import (
    aggregate_followup,
    evidence_card,
    is_due,
    validate_intervals,
    validate_min_group_size,
    validate_response,
)


class AggregationTests(unittest.TestCase):
    def test_counts_and_shares(self):
        statuses = ["applying"] * 4 + ["partly_applying"] * 2 + ["not_yet"] * 2 + ["no_opportunity"] * 2
        agg = aggregate_followup(invited=10, statuses=statuses, min_group_size=5)
        self.assertEqual(agg["responded"], 10)
        self.assertEqual(agg["coverage"], 1.0)
        self.assertEqual(agg["counts"], {
            "applying": 4, "partly_applying": 2, "not_yet": 2, "no_opportunity": 2,
        })
        self.assertEqual(agg["evidence_status"], "sufficient")
        self.assertFalse(agg["breakdown_suppressed"])

    def test_no_opportunity_is_not_counted_as_not_applying(self):
        # 4 managers: 2 applying, 2 no opportunity. Nobody is "not applying".
        agg = aggregate_followup(4, ["applying", "applying", "no_opportunity", "no_opportunity"], min_group_size=2)
        self.assertEqual(agg["counts"]["not_yet"], 0)
        self.assertEqual(agg["counts"]["no_opportunity"], 2)
        # no_opportunity must be excluded from the denominator: 2/2, not 2/4.
        self.assertEqual(agg["applying_share"], 1.0)
        self.assertEqual(agg["no_opportunity_share"], 0.5)

    def test_not_yet_lowers_applying_share_but_no_opportunity_does_not(self):
        with_not_yet = aggregate_followup(4, ["applying", "applying", "not_yet", "not_yet"], min_group_size=2)
        with_no_opp = aggregate_followup(4, ["applying", "applying", "no_opportunity", "no_opportunity"], min_group_size=2)
        self.assertEqual(with_not_yet["applying_share"], 0.5)
        self.assertEqual(with_no_opp["applying_share"], 1.0)

    def test_all_no_opportunity_has_no_applying_share(self):
        agg = aggregate_followup(3, ["no_opportunity"] * 3, min_group_size=2)
        self.assertIsNone(agg["applying_share"])

    def test_below_min_group_size_withholds_breakdown(self):
        agg = aggregate_followup(invited=6, statuses=["applying"] * 4, min_group_size=5)
        self.assertTrue(agg["breakdown_suppressed"])
        self.assertIsNone(agg["counts"])
        self.assertIsNone(agg["applying_share"])
        self.assertIsNone(agg["no_opportunity_share"])
        self.assertEqual(agg["evidence_status"], "insufficient_data")
        self.assertEqual(agg["responded"], 4)  # coverage itself is still reported

    def test_exactly_min_group_size_is_shown(self):
        agg = aggregate_followup(invited=6, statuses=["applying"] * 5, min_group_size=5)
        self.assertFalse(agg["breakdown_suppressed"])
        self.assertIsNotNone(agg["counts"])

    def test_low_coverage_is_insufficient_even_with_breakdown(self):
        agg = aggregate_followup(invited=20, statuses=["applying"] * 5, min_group_size=5)
        self.assertEqual(agg["coverage"], 0.25)
        self.assertEqual(agg["evidence_status"], "insufficient_data")

    def test_no_invited_managers(self):
        agg = aggregate_followup(0, [], min_group_size=5)
        self.assertEqual(agg["coverage"], 0.0)
        self.assertEqual(agg["evidence_status"], "insufficient_data")

    def test_aggregate_contains_no_individual_fields(self):
        agg = aggregate_followup(5, ["applying"] * 5, min_group_size=5)
        self.assertEqual(
            set(agg),
            {"invited", "responded", "coverage", "min_group_size", "breakdown_suppressed",
             "evidence_status", "counts", "applying_share", "no_opportunity_share"},
        )


class EvidenceCardTests(unittest.TestCase):
    def test_card_cites_coverage(self):
        agg = aggregate_followup(10, ["applying"] * 6 + ["no_opportunity"] * 2, min_group_size=5)
        card = evidence_card("Privacy", "Q3", 30, agg)
        self.assertEqual(card["type"], "manager_follow_up")
        self.assertIn("80% coverage", card["summary"])
        self.assertIn("not counted as not applying", card["summary"])

    def test_card_says_insufficient_data_and_hides_counts(self):
        agg = aggregate_followup(10, ["not_yet"] * 2, min_group_size=5)
        card = evidence_card("Privacy", "Q3", 90, agg)
        self.assertEqual(card["evidence_status"], "insufficient_data")
        self.assertIn("Insufficient data", card["summary"])
        self.assertIsNone(card["counts"])


class ValidationTests(unittest.TestCase):
    def test_default_and_sorted_intervals(self):
        self.assertEqual(validate_intervals(None), [30, 90])
        self.assertEqual(validate_intervals([90, 30, 30, 14]), [14, 30, 90])

    def test_invalid_intervals(self):
        for bad in ([], [0], [-5], ["30"], [True], [10_000], list(range(1, 10)), "30"):
            with self.assertRaises(ValueError, msg=str(bad)):
                validate_intervals(bad)

    def test_min_group_size(self):
        self.assertEqual(validate_min_group_size(None), 5)
        with self.assertRaises(ValueError):
            validate_min_group_size(1)

    def test_response_validation(self):
        self.assertEqual(validate_response("no_opportunity", "  hi "), ("no_opportunity", "hi"))
        with self.assertRaises(ValueError):
            validate_response("great", "")
        with self.assertRaises(ValueError):
            validate_response("applying", "x" * 501)

    def test_is_due(self):
        anchor = datetime.date(2026, 1, 1)
        self.assertFalse(is_due(anchor, 30, datetime.date(2026, 1, 30)))
        self.assertTrue(is_due(anchor, 30, datetime.date(2026, 1, 31)))


class AccessBoundaryTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(enterprise_followup_bp)
        self.client = app.test_client()

    def test_admin_endpoints_reject_non_admin(self):
        base = "/api/enterprise/programs/1/followup"
        for method, path in [
            ("get", f"{base}/config"), ("put", f"{base}/config"),
            ("post", f"{base}/managers"), ("get", f"{base}/coverage"),
            ("get", f"{base}/snapshots"),
        ]:
            for headers in ({}, {"X-User-Role": "enterprise_user"}):
                response = getattr(self.client, method)(path, headers=headers, json={})
                self.assertEqual(response.status_code, 403, f"{method} {path}")

    def test_manager_endpoints_require_identity(self):
        self.assertEqual(self.client.get("/api/enterprise/followup/mine").status_code, 401)
        response = self.client.put("/api/enterprise/followup/mine/1/30", json={"status": "applying"})
        self.assertEqual(response.status_code, 401)

    def test_invalid_status_rejected_before_db(self):
        response = self.client.put(
            "/api/enterprise/followup/mine/1/30",
            headers={"X-User-Email": "m@example.test"}, json={"status": "ranked_top"},
        )
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
