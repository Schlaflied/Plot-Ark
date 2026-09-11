import io
import unittest
import zipfile

from openpyxl import Workbook

from services.enterprise_ingest import (
    normalize_learning_rows,
    parse_enterprise_source,
    validate_upload_batch,
)


class EnterpriseIngestTests(unittest.TestCase):
    def test_csv_rows_normalize_without_claiming_xapi(self):
        csv_bytes = (
            b"User ID,Module,Completion,Score,Duration Seconds,Attempts\n"
            b"alice@example.test,privacy-1,completed,88,420,2\n"
        )
        parsed = parse_enterprise_source("report.csv", csv_bytes, "lms_report")
        self.assertEqual(parsed.source_kind, "lms_report")
        self.assertEqual(len(parsed.events), 1)
        event = parsed.events[0]
        self.assertEqual(event["learner_ref"], "alice@example.test")
        self.assertEqual(event["module_id"], "privacy-1")
        self.assertTrue(event["completion"])
        self.assertEqual(event["score"], 88)
        self.assertEqual(event["attempts"], 2)

    def test_xlsx_rows_normalize(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["Learner ID", "Module ID", "Status", "Grade"])
        sheet.append(["learner-7", "module-2", "passed", 91])
        stream = io.BytesIO()
        workbook.save(stream)
        parsed = parse_enterprise_source("report.xlsx", stream.getvalue(), "lms_report")
        self.assertEqual(parsed.metadata["row_count"], 1)
        self.assertTrue(parsed.events[0]["completion"])
        self.assertEqual(parsed.events[0]["score"], 91)

    def test_scorm_manifest_and_visible_html_are_extracted(self):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w") as archive:
            archive.writestr(
                "imsmanifest.xml",
                """<?xml version="1.0"?>
                <manifest identifier="demo"><organizations><organization identifier="org">
                <item identifier="m1" identifierref="r1"><title>Handling customer data</title></item>
                </organization></organizations><resources><resource identifier="r1" href="index.html" /></resources>
                </manifest>""",
            )
            archive.writestr("index.html", "<h1>Retention policy</h1><script>ignore()</script><p>Keep data for 30 days.</p>")
        parsed = parse_enterprise_source("course.zip", stream.getvalue(), "training_content")
        self.assertEqual(parsed.metadata["format"], "scorm")
        self.assertEqual(parsed.metadata["module_count"], 1)
        self.assertIn("Retention policy", parsed.extracted_text)
        self.assertNotIn("ignore()", parsed.extracted_text)

    def test_scorm_zip_slip_is_rejected(self):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w") as archive:
            archive.writestr("imsmanifest.xml", "<manifest />")
            archive.writestr("../outside.html", "unsafe")
        with self.assertRaisesRegex(ValueError, "unsafe path"):
            parse_enterprise_source("course.zip", stream.getvalue(), "training_content")

    def test_batch_limits_match_upload_contract(self):
        with self.assertRaisesRegex(ValueError, "Up to 5"):
            validate_upload_batch([(f"r{i}.csv", b"a\n") for i in range(6)], "lms_report")
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            validate_upload_batch([("notes.txt", b"text")], "training_content")

    def test_missing_values_get_stable_row_defaults(self):
        events = normalize_learning_rows([{"Module": "intro"}])
        self.assertEqual(events[0]["learner_ref"], "row-1")
        self.assertEqual(events[0]["module_id"], "intro")
        self.assertFalse(events[0]["completion"])


if __name__ == "__main__":
    unittest.main()
