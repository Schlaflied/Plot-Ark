"""
Report Exporter — thin facade that delegates to format-specific exporters.

Each export format lives in its own module:
  - services/chart_generator.py  — matplotlib charts + shared COLORS
  - services/export_pdf.py       — ReportLab PDF
  - services/export_docx.py      — python-docx Word document
  - services/export_excel.py     — openpyxl Excel workbook
"""

from services.chart_generator import generate_charts
from services.export_pdf import export_pdf
from services.export_docx import export_docx
from services.export_excel import export_excel


class ReportExporter:
    """Generate PDF / DOCX / Excel from A2A analysis results."""

    def generate_charts(self, report: dict) -> dict:
        return generate_charts(report)

    def export_pdf(self, report: dict) -> bytes:
        return export_pdf(report)

    def export_docx(self, report: dict) -> bytes:
        return export_docx(report)

    def export_excel(self, report: dict, course_id: int = 0) -> bytes:
        return export_excel(report, course_id)
