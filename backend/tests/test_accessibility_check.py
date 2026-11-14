import io
import sys
import types
import unittest
from unittest.mock import Mock, patch

import docx
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, RGBColor
from flask import Flask

extensions_stub = types.ModuleType("extensions")
extensions_stub.redis_client = None
extensions_stub.reload_clients = Mock()
sys.modules.setdefault("extensions", extensions_stub)

from routes.accessibility import accessibility_bp  # noqa: E402
from services.accessibility_check import (  # noqa: E402
    AccessibilityCheckError,
    check_accessibility,
    contrast_ratio,
)

# ---- synthetic fixtures (no real course content) ----

BAD_HTML = b"""<html><body>
<h1>Sample Unit</h1>
<h3>Skipped level</h3>
<img src="chart.png">
<a href="https://example.org/a">click here</a>
<table><tr><td>a</td><td>b</td></tr></table>
<p style="color:#cccccc">Pale text</p>
<video src="v.mp4"></video>
<a href="https://www.youtube.com/watch?v=synthetic">Watch the demo</a>
</body></html>"""

CLEAN_HTML = b"""<html lang="en"><body>
<h1>Sample Unit</h1><h2>Part one</h2>
<img src="chart.png" alt="Bar chart of synthetic scores">
<img src="rule.png" alt="">
<a href="https://example.org/a">Synthetic course syllabus</a>
<table><tr><th>Name</th><th>Score</th></tr><tr><td>a</td><td>1</td></tr></table>
<p style="color:#000000">Dark text</p>
<video src="v.mp4"><track kind="captions" src="v.vtt"></video>
</body></html>"""


def _png():
    # 1x1 PNG
    import base64
    return io.BytesIO(base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="))


def _add_link(paragraph, url, text):
    rid = paragraph.part.relate_to(
        url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
        is_external=True)
    h = OxmlElement("w:hyperlink")
    h.set(qn("r:id"), rid)
    r = OxmlElement("w:r")
    t = OxmlElement("w:t")
    t.text = text
    r.append(t)
    h.append(r)
    paragraph._p.append(h)


def _docx_bytes(bad=True):
    d = docx.Document()
    d.add_heading("Sample Unit", 1)
    if bad:
        # the default template declares a language; remove it to simulate "not set"
        for el in list(d.styles.element.iter(qn("w:lang"))):
            el.getparent().remove(el)
        d.add_heading("Skipped level", 3)
        d.add_picture(_png(), width=Inches(1))
        _add_link(d.add_paragraph("See "), "https://example.org/a", "click here")
        _add_link(d.add_paragraph("Video: "), "https://vimeo.com/synthetic", "Demo")
        t = d.add_table(rows=2, cols=2)
        t.cell(0, 0).text = "x"
        run = d.add_paragraph().add_run("Pale text")
        run.font.color.rgb = RGBColor(0xCC, 0xCC, 0xCC)
    else:
        d.add_heading("Part one", 2)
        d.add_picture(_png(), width=Inches(1))
        for dp in d.element.body.iter(
                "{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}docPr"):
            dp.set("descr", "A synthetic square")
        _add_link(d.add_paragraph("See "), "https://example.org/a", "Synthetic syllabus")
        t = d.add_table(rows=2, cols=2)
        t.cell(0, 0).text = "x"
        trPr = t.rows[0]._tr.get_or_add_trPr()
        trPr.append(OxmlElement("w:tblHeader"))
        d.core_properties.language = "en-CA"
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def _rules(report):
    return {f["rule"] for f in report["findings"]}


class HtmlChecks(unittest.TestCase):
    def setUp(self):
        self.report = check_accessibility("bad.html", BAD_HTML)

    def test_expected_rules_found(self):
        self.assertEqual(_rules(self.report), {
            "missing-language", "image-missing-alt", "skipped-heading-level",
            "vague-link-text", "table-no-headers", "low-contrast-text",
            "video-no-captions", "video-link-no-caption-mention"})

    def test_each_finding_has_criterion_location_fix(self):
        for f in self.report["findings"]:
            self.assertRegex(f["wcag_criterion"], r"^\d\.\d\.\d$")
            self.assertTrue(f["location"] and f["suggested_fix"])

    def test_criteria_mapping(self):
        crit = {f["rule"]: f["wcag_criterion"] for f in self.report["findings"]}
        self.assertEqual(crit["image-missing-alt"], "1.1.1")
        self.assertEqual(crit["vague-link-text"], "2.4.4")
        self.assertEqual(crit["missing-language"], "3.1.1")
        self.assertEqual(crit["low-contrast-text"], "1.4.3")
        self.assertEqual(crit["table-no-headers"], "1.3.1")

    def test_grouped_by_severity_high_first(self):
        sev = [f["severity"] for f in self.report["findings"]]
        self.assertEqual(sev, sorted(sev, key=("high", "medium", "low").index))
        self.assertTrue(self.report["findings_by_severity"]["high"])

    def test_no_headings(self):
        words = " ".join(["word"] * 200)
        r = check_accessibility("a.html", f'<html lang="en"><body><p>{words}</p></body></html>'.encode())
        self.assertEqual(_rules(r), {"no-headings"})

    def test_empty_link(self):
        r = check_accessibility("a.html", b'<html lang="en"><body><a href="/x"></a></body></html>')
        self.assertIn("empty-link", _rules(r))

    def test_video_link_with_transcript_mention_not_flagged(self):
        html = (b'<html lang="en"><body><a href="https://youtu.be/x">Lecture</a>'
                b'<p>A transcript is linked below.</p></body></html>')
        self.assertNotIn("video-link-no-caption-mention", _rules(check_accessibility("a.html", html)))

    def test_contrast_math(self):
        self.assertAlmostEqual(contrast_ratio((0, 0, 0), (255, 255, 255)), 21.0, places=1)

    def test_clean_html_no_findings(self):
        r = check_accessibility("ok.html", CLEAN_HTML)
        self.assertEqual(r["findings"], [])
        self.assertEqual(r["summary"], "No automated findings.")
        self.assertIn("Manual review is still required", r["disclaimer"])


class DocxChecks(unittest.TestCase):
    def test_bad_docx_rules(self):
        r = check_accessibility("bad.docx", _docx_bytes(bad=True))
        self.assertEqual(_rules(r), {
            "missing-language", "image-missing-alt", "skipped-heading-level",
            "vague-link-text", "table-no-headers", "low-contrast-text",
            "video-link-no-caption-mention"})
        for f in r["findings"]:
            self.assertTrue(f["wcag_criterion"])

    def test_clean_docx_no_findings(self):
        r = check_accessibility("ok.docx", _docx_bytes(bad=False))
        self.assertEqual(r["findings"], [], r["findings"])
        self.assertEqual(r["summary"], "No automated findings.")
        self.assertTrue(r["disclaimer"])


class ErrorHandling(unittest.TestCase):
    def test_unsupported_format(self):
        with self.assertRaisesRegex(AccessibilityCheckError, "Unsupported"):
            check_accessibility("slides.pptx", b"data")

    def test_empty_file(self):
        for name in ("a.html", "a.docx"):
            with self.assertRaises(AccessibilityCheckError):
                check_accessibility(name, b"")

    def test_whitespace_html(self):
        with self.assertRaises(AccessibilityCheckError):
            check_accessibility("a.html", b"   \n")

    def test_corrupt_docx(self):
        with self.assertRaisesRegex(AccessibilityCheckError, "could not be read"):
            check_accessibility("a.docx", b"this is not a zip file")

    def test_html_without_elements(self):
        with self.assertRaises(AccessibilityCheckError):
            check_accessibility("a.html", b"just plain text, no tags")


class RouteTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(accessibility_bp)
        self.client = app.test_client()

    def _post(self, name, data, **extra):
        return self.client.post("/api/materials/accessibility-check",
                                data={"file": (io.BytesIO(data), name), **extra},
                                content_type="multipart/form-data")

    def test_report(self):
        resp = self._post("bad.html", BAD_HTML)
        self.assertEqual(resp.status_code, 200)
        self.assertGreater(resp.get_json()["finding_count"], 0)

    def test_unsupported_is_400(self):
        self.assertEqual(self._post("a.pdf", b"%PDF").status_code, 400)

    def test_missing_file_is_400(self):
        self.assertEqual(self.client.post("/api/materials/accessibility-check").status_code, 400)

    def test_findings_saved_for_review_when_course_given(self):
        with patch("routes.accessibility.review.save_findings") as save:
            self._post("bad.html", BAD_HTML, course_id="7")
        save.assert_called_once()
        self.assertEqual(save.call_args[0][0], 7)

    def test_invalid_decision_rejected(self):
        resp = self.client.post("/api/materials/accessibility-check/1/decision",
                                json={"decision": "maybe"})
        self.assertEqual(resp.status_code, 400)


if __name__ == "__main__":
    unittest.main()
