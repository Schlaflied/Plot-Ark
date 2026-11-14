import io
import os
import unittest

from openpyxl import Workbook

from services.enterprise_mapping import (
    MappingError,
    compare_cohorts,
    map_report,
    normalize_source_label,
    propose_mapping,
    read_table,
)

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "lms")


def _fixture(name: str) -> bytes:
    with open(os.path.join(FIXTURES, name), "rb") as handle:
        return handle.read()


class PresetTests(unittest.TestCase):
    def _run(self, filename, platform=None):
        return map_report(filename, _fixture(filename), platform)

    def test_workday_preset_maps_fixture_without_edits(self):
        proposal, events, mapping = self._run("workday_learning.csv")
        self.assertEqual(proposal["platform"], "workday_learning")
        self.assertEqual(mapping["learner_ref"], "Employee ID")
        self.assertEqual(len(events), 2)
        self.assertTrue(events[0]["completion"])
        self.assertFalse(events[1]["completion"])
        self.assertEqual(events[0]["score"], 88)
        self.assertEqual(events[0]["module_title"], "Data Privacy Basics")
        self.assertEqual(events[0]["duration_seconds"], 1200)

    def test_d2l_preset_maps_fixture_without_edits(self):
        proposal, events, mapping = self._run("d2l_brightspace.csv")
        self.assertEqual(proposal["platform"], "d2l_brightspace")
        self.assertEqual(mapping["learner_ref"], "UserId")
        self.assertEqual(mapping["occurred_at"], "LastVisited")
        self.assertTrue(events[0]["completion"])
        self.assertFalse(events[1]["completion"])
        self.assertEqual(events[0]["module_id"], "9001")

    def test_canvas_preset_maps_fixture_without_edits(self):
        proposal, events, mapping = self._run("canvas.csv")
        self.assertEqual(proposal["platform"], "canvas")
        self.assertEqual(mapping["learner_ref"], "SIS User ID")
        self.assertEqual(mapping["score"], "Current Score")
        self.assertTrue(events[0]["completion"])
        self.assertEqual(events[1]["score"], 45)

    def test_unmatched_and_ambiguous_columns_are_reported_not_dropped(self):
        proposal, _, _ = self._run("canvas.csv")
        self.assertIn("Student", proposal["unmatched_columns"])
        self.assertIn("Section", proposal["unmatched_columns"])
        # "ID" also looked like a learner id but lost to "SIS User ID".
        self.assertEqual(proposal["ambiguous"]["learner_ref"], ["ID"])
        mapped = set(proposal["mapping"].values())
        self.assertEqual(
            set(proposal["columns"]), mapped | set(proposal["unmatched_columns"]),
        )

    def test_user_override_wins(self):
        _, events, mapping = map_report(
            "canvas.csv", _fixture("canvas.csv"), "canvas", {"learner_ref": "ID"},
        )
        self.assertEqual(mapping["learner_ref"], "ID")
        self.assertEqual(events[0]["learner_ref"], "2001")

    def test_xlsx_export_uses_same_presets(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["UserId", "ContentObjectId", "Title", "IsRead", "LastVisited"])
        sheet.append([7, 1, "Topic", 1, "2026-01-01"])
        stream = io.BytesIO()
        workbook.save(stream)
        proposal, events, _ = map_report("export.xlsx", stream.getvalue())
        self.assertEqual(proposal["platform"], "d2l_brightspace")
        self.assertTrue(events[0]["completion"])


class MoodlePresetTests(unittest.TestCase):
    def test_activity_completion_maps_without_edits(self):
        proposal, events, mapping = map_report(
            "moodle_activity_completion.csv", _fixture("moodle_activity_completion.csv"),
        )
        self.assertEqual(proposal["platform"], "moodle")
        self.assertEqual(mapping["learner_ref"], "Username")
        self.assertEqual(mapping["module_title"], "Activity name")
        self.assertEqual(mapping["completion"], "Completion state")
        self.assertEqual(mapping["occurred_at"], "Time completed")
        self.assertEqual([e["completion"] for e in events], [True, False, True])
        # "Complete (pass)" is a Moodle-specific completion value.
        self.assertEqual(events[2]["module_title"], "Policy Quiz")

    def test_ambiguous_and_unmatched_columns_are_surfaced(self):
        proposal, _, _ = map_report(
            "moodle_activity_completion.csv", _fixture("moodle_activity_completion.csv"),
        )
        self.assertEqual(proposal["ambiguous"]["learner_ref"], ["Email address"])
        self.assertEqual(proposal["unmatched_columns"], ["Full name", "Email address"])

    def test_quiz_attempts_parse_text_duration_and_grade(self):
        proposal, events, mapping = map_report(
            "moodle_quiz_attempts.csv", _fixture("moodle_quiz_attempts.csv"),
        )
        self.assertEqual(proposal["platform"], "moodle")
        self.assertEqual(mapping["score"], "Grade/10.00")
        self.assertEqual(mapping["duration_seconds"], "Time taken")
        self.assertTrue(events[0]["completion"])  # State "Finished"
        self.assertEqual(events[0]["score"], 8.5)
        self.assertEqual(events[0]["duration_seconds"], 725)
        self.assertFalse(events[1]["completion"])  # "In progress"
        self.assertIn("Surname", proposal["unmatched_columns"])

    def test_course_logs_map(self):
        proposal, events, mapping = map_report(
            "moodle_course_logs.csv", _fixture("moodle_course_logs.csv"),
        )
        self.assertEqual(proposal["platform"], "moodle")
        self.assertEqual(mapping["module_title"], "Event context")
        self.assertTrue(events[0]["completion"])
        self.assertFalse(events[1]["completion"])
        self.assertIn("IP address", proposal["unmatched_columns"])

    def test_missing_module_column_is_a_clear_error(self):
        # Moodle's quiz results export carries no quiz name column.
        content = b"Username,State,Time taken,Grade/10.00\nlearner01,Finished,5 mins,9\n"
        with self.assertRaisesRegex(MappingError, "module id or module title"):
            map_report("quiz.csv", content, "moodle")

    def test_missing_required_fields_error(self):
        with self.assertRaisesRegex(MappingError, "Learner identifier"):
            map_report("m.csv", b"Activity name,Completion state\nQuiz,Complete\n", "moodle")

    def test_malformed_moodle_files(self):
        with self.assertRaises(MappingError):
            map_report("m.csv", b"\x00\x01binary", "moodle")
        with self.assertRaisesRegex(MappingError, "could not be read"):
            map_report("m.xlsx", b"not a zip", "moodle")

    def test_other_presets_ignore_moodle_value_rules(self):
        content = b"UserId,ContentObjectId,Title,IsRead,TimeInContent\n1,2,T,Finished,5 mins\n"
        _, events, _ = map_report("d2l.csv", content, "d2l_brightspace")
        self.assertFalse(events[0]["completion"])
        self.assertEqual(events[0]["duration_seconds"], 0)


class SourceLabelTests(unittest.TestCase):
    def test_label_combines_site_and_version(self):
        label = normalize_source_label(" Legacy  Moodle ", "Moodle 3.11")
        self.assertEqual(label, {"site": "Legacy Moodle", "version": "Moodle 3.11", "label": "Legacy Moodle · Moodle 3.11"})

    def test_blank_label_is_none_and_long_label_rejected(self):
        self.assertIsNone(normalize_source_label("  ", None))
        with self.assertRaisesRegex(MappingError, "at most"):
            normalize_source_label("x" * 81)

    def test_two_sites_become_two_cohorts_side_by_side(self):
        _, old_events, _ = map_report("a.csv", _fixture("moodle_activity_completion.csv"))
        _, new_events, _ = map_report("b.csv", _fixture("moodle_quiz_attempts.csv"))
        old = normalize_source_label("Legacy", "Moodle 3.11")
        new = normalize_source_label("Main", "Moodle 4.4")
        result = compare_cohorts([
            {"label": old["label"], "source": old, "events": old_events},
            {"label": new["label"], "source": new, "events": new_events},
        ])
        self.assertEqual([c["label"] for c in result["cohorts"]], ["Legacy · Moodle 3.11", "Main · Moodle 4.4"])
        self.assertEqual(result["cohorts"][0]["source"]["version"], "Moodle 3.11")
        self.assertAlmostEqual(result["cohorts"][0]["completion_rate"], 0.6667, places=3)
        self.assertEqual(result["cohorts"][1]["completion_rate"], 0.5)
        self.assertAlmostEqual(result["differences"]["completion_rate"], -0.1667, places=3)
        self.assertTrue(all(c["small_group"] for c in result["cohorts"]))

    def test_three_cohorts_have_no_pairwise_differences(self):
        cohorts = [{"label": str(i), "source": None, "events": []} for i in range(3)]
        self.assertIsNone(compare_cohorts(cohorts)["differences"])


class FallbackTests(unittest.TestCase):
    def test_unknown_platform_falls_back_to_manual(self):
        proposal = propose_mapping(["Foo", "Bar", "Baz"], "some_new_lms")
        self.assertTrue(proposal["manual_required"])
        self.assertIsNone(proposal["platform"])
        self.assertEqual(proposal["mapping"], {})
        self.assertEqual(proposal["unmatched_columns"], ["Foo", "Bar", "Baz"])

    def test_unrecognisable_headers_do_not_auto_detect(self):
        proposal = propose_mapping(["Foo", "Bar", "Baz"])
        self.assertTrue(proposal["manual_required"])

    def test_manual_mapping_can_complete_an_unknown_file(self):
        content = b"who,what,done\nu1,m1,yes\n"
        with self.assertRaisesRegex(MappingError, "Missing required"):
            map_report("x.csv", content, "unknown")
        _, events, _ = map_report(
            "x.csv", content, "unknown",
            {"learner_ref": "who", "module_id": "what", "completion": "done"},
        )
        self.assertEqual(events[0]["learner_ref"], "u1")
        self.assertTrue(events[0]["completion"])


class ErrorTests(unittest.TestCase):
    def test_missing_required_fields_name_the_field(self):
        content = b"UserId,Title\n1,Topic\n"
        with self.assertRaisesRegex(MappingError, "Completion status or date"):
            map_report("d2l.csv", content, "d2l_brightspace")

    def test_override_with_nonexistent_column_is_rejected(self):
        with self.assertRaisesRegex(MappingError, "not in the file"):
            map_report("canvas.csv", _fixture("canvas.csv"), "canvas", {"score": "Nope"})

    def test_unknown_evidence_field_is_rejected(self):
        with self.assertRaisesRegex(MappingError, "Unknown evidence field"):
            map_report("canvas.csv", _fixture("canvas.csv"), "canvas", {"bogus": "ID"})

    def test_empty_file(self):
        with self.assertRaisesRegex(MappingError, "empty"):
            read_table("a.csv", b"   \n")

    def test_header_only_file_has_no_events_but_is_readable(self):
        headers, rows = read_table("a.csv", b"UserId,IsRead\n")
        self.assertEqual(headers, ["UserId", "IsRead"])
        self.assertEqual(rows, [])

    def test_binary_garbage_csv(self):
        with self.assertRaises(MappingError):
            read_table("a.csv", b"\x00\x01\x02binary")

    def test_corrupt_xlsx(self):
        with self.assertRaisesRegex(MappingError, "could not be read"):
            read_table("a.xlsx", b"not a zip file")

    def test_duplicate_headers_rejected(self):
        with self.assertRaisesRegex(MappingError, "duplicate"):
            read_table("a.csv", b"Score,score\n1,2\n")

    def test_unsupported_extension(self):
        with self.assertRaisesRegex(MappingError, "CSV and XLSX"):
            read_table("a.pdf", b"x")


if __name__ == "__main__":
    unittest.main()
