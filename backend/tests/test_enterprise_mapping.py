import io
import os
import unittest

from openpyxl import Workbook

from services.enterprise_mapping import (
    MappingError,
    map_report,
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
