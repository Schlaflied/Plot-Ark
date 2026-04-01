"""
Report Exporter — generates PDF, DOCX, and Excel reports with matplotlib charts.

Uses Plot-Ark brand colors (amber/stone). All labels in English.
"""

import io
import json
from datetime import datetime

# ── Matplotlib setup (non-interactive backend) ────────────────────────────────
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker

# Plot-Ark brand palette
COLORS = {
    "amber_500": "#f59e0b",
    "amber_600": "#d97706",
    "amber_300": "#fcd34d",
    "stone_700": "#44403c",
    "stone_500": "#78716c",
    "stone_300": "#d6d3d1",
    "red_500": "#ef4444",
    "red_400": "#f87171",
    "green_500": "#22c55e",
    "green_400": "#4ade80",
    "blue_500": "#3b82f6",
    "yellow_400": "#facc15",
    "bg_dark": "#1c1917",
}

BAR_COLORS = [COLORS["amber_500"], COLORS["stone_500"], COLORS["red_400"],
              COLORS["green_400"], COLORS["blue_500"], COLORS["yellow_400"]]


def _setup_chart_style():
    """Apply Plot-Ark dark theme to matplotlib."""
    plt.rcParams.update({
        "figure.facecolor": COLORS["bg_dark"],
        "axes.facecolor": "#292524",
        "axes.edgecolor": COLORS["stone_500"],
        "axes.labelcolor": COLORS["stone_300"],
        "text.color": COLORS["stone_300"],
        "xtick.color": COLORS["stone_300"],
        "ytick.color": COLORS["stone_300"],
        "font.family": "sans-serif",
        "font.size": 10,
    })


def _fig_to_bytes(fig) -> bytes:
    """Convert a matplotlib figure to PNG bytes and close it."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf.read()

class ReportExporter:
    """Generate PDF / DOCX / Excel from A2A analysis results."""

    def generate_charts(self, report: dict) -> dict:
        """Generate all charts as PNG bytes. Returns {chart_name: bytes}."""
        _setup_chart_style()
        charts = {}

        ba = report.get("behavior_analysis", {})
        ra = report.get("risk_assessment", {})
        co = report.get("content_optimization", {})
        cc = report.get("cohort_comparison", {})

        # 1. Module Completion Bar Chart
        modules = ba.get("module_engagement", [])
        if modules:
            fig, ax = plt.subplots(figsize=(10, 5))
            names = [m.get("module_name", "?")[:25] for m in modules]
            rates = [m.get("completion_rate", 0) * 100 for m in modules]
            struggles = [m.get("struggles", 0) for m in modules]

            x = range(len(names))
            ax.bar(x, rates, color=COLORS["amber_500"], alpha=0.85, label="Completion %")
            ax.set_xticks(x)
            ax.set_xticklabels(names, rotation=45, ha="right", fontsize=8)
            ax.set_ylabel("Completion Rate (%)")
            ax.set_title("Module Completion Rates")
            ax.legend()
            plt.tight_layout()
            charts["module_completion_bar"] = _fig_to_bytes(fig)

        # 2. Engagement Trend Line
        daily = ba.get("engagement_metrics", {}).get("daily_activity", [])
        if daily:
            fig, ax = plt.subplots(figsize=(10, 4))
            dates = [d["date"] for d in daily]
            users = [d.get("active_users", 0) for d in daily]
            actions = [d.get("actions", 0) for d in daily]

            ax.plot(dates, users, color=COLORS["amber_500"], marker="o", linewidth=2, label="Active Students")
            ax2 = ax.twinx()
            ax2.plot(dates, actions, color=COLORS["stone_500"], marker="s", linewidth=1, linestyle="--", label="Total Actions")
            ax2.set_ylabel("Actions", color=COLORS["stone_500"])
            ax.set_ylabel("Active Students", color=COLORS["amber_500"])
            ax.set_title("Daily Engagement Trend")
            ax.tick_params(axis="x", rotation=45)
            lines1, labels1 = ax.get_legend_handles_labels()
            lines2, labels2 = ax2.get_legend_handles_labels()
            ax.legend(lines1 + lines2, labels1 + labels2, loc="upper left")
            plt.tight_layout()
            charts["engagement_trend_line"] = _fig_to_bytes(fig)

        # 3. Risk Distribution Pie
        risk_dist = ra.get("risk_distribution", {})
        if risk_dist and sum(risk_dist.values()) > 0:
            fig, ax = plt.subplots(figsize=(6, 6))
            labels_list = []
            sizes = []
            colors = []
            color_map = {"low": COLORS["green_500"], "medium": COLORS["yellow_400"], "high": COLORS["red_500"]}
            for level in ["low", "medium", "high"]:
                val = risk_dist.get(level, 0)
                if val > 0:
                    labels_list.append(f"{level.title()} Risk ({val})")
                    sizes.append(val)
                    colors.append(color_map[level])

            if sizes:
                ax.pie(sizes, labels=labels_list, colors=colors, autopct="%1.0f%%",
                       textprops={"color": "white", "fontsize": 11}, startangle=90)
                ax.set_title("Student Risk Distribution")
                plt.tight_layout()
                charts["risk_distribution_pie"] = _fig_to_bytes(fig)

        # 4. Verb Distribution Bar
        verbs = ba.get("verb_distribution", {})
        if verbs:
            fig, ax = plt.subplots(figsize=(8, 4))
            v_names = list(verbs.keys())
            v_counts = list(verbs.values())
            colors_list = [BAR_COLORS[i % len(BAR_COLORS)] for i in range(len(v_names))]
            ax.barh(v_names, v_counts, color=colors_list)
            ax.set_xlabel("Count")
            ax.set_title("Learning Activity Distribution")
            plt.tight_layout()
            charts["verb_distribution_bar"] = _fig_to_bytes(fig)

        # 5. Cohort Comparison Grouped Bar
        groups = cc.get("groups", {})
        if groups:
            fig, ax = plt.subplots(figsize=(10, 5))
            g_names = [n.replace("_", " ").title() for n in groups.keys()]
            comp_rates = [groups[k].get("avg_completion", 0) * 100 for k in groups]
            struggle_rates = [groups[k].get("avg_struggle", 0) * 100 for k in groups]
            counts = [groups[k].get("count", 0) for k in groups]

            x = range(len(g_names))
            width = 0.35
            ax.bar([i - width/2 for i in x], comp_rates, width, color=COLORS["green_400"], label="Avg Completion %")
            ax.bar([i + width/2 for i in x], struggle_rates, width, color=COLORS["red_400"], label="Avg Struggle %")

            # Add count labels on top
            for i, cnt in enumerate(counts):
                ax.text(i, max(comp_rates[i], struggle_rates[i]) + 2, f"n={cnt}",
                        ha="center", fontsize=9, color=COLORS["stone_300"])

            ax.set_xticks(x)
            ax.set_xticklabels(g_names)
            ax.set_ylabel("Rate (%)")
            ax.set_title("Cohort Performance Comparison")
            ax.legend()
            plt.tight_layout()
            charts["cohort_comparison_bar"] = _fig_to_bytes(fig)

        return charts

    # ── PDF Export ─────────────────────────────────────────────────────────────

    def export_pdf(self, report: dict) -> bytes:
        """Generate a PDF report with embedded charts using ReportLab."""
        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import letter
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import inch
            from reportlab.platypus import (
                SimpleDocTemplate, Paragraph, Spacer, Image,
                Table, TableStyle, PageBreak,
            )
        except ImportError:
            return self._fallback_text_report(report, "pdf")

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=letter,
                                topMargin=0.75*inch, bottomMargin=0.75*inch)
        styles = getSampleStyleSheet()

        # Custom styles
        title_style = ParagraphStyle("PlotArkTitle", parent=styles["Title"],
                                     textColor=colors.HexColor(COLORS["amber_500"]),
                                     fontSize=24, spaceAfter=4)
        subtitle_style = ParagraphStyle("PlotArkSubtitle", parent=styles["Heading1"],
                                        textColor=colors.HexColor(COLORS["stone_700"]),
                                        fontSize=18, spaceAfter=4)
        meta_style = ParagraphStyle("PlotArkMeta", parent=styles["Normal"],
                                    textColor=colors.HexColor(COLORS["stone_500"]),
                                    fontSize=9, spaceAfter=12)
        h2_style = ParagraphStyle("PlotArkH2", parent=styles["Heading2"],
                                  textColor=colors.HexColor(COLORS["amber_600"]),
                                  fontSize=16, spaceAfter=8, spaceBefore=16)
        body_style = ParagraphStyle("PlotArkBody", parent=styles["Normal"],
                                    fontSize=10, spaceAfter=6)

        elements = []
        charts = self.generate_charts(report)

        # ── Cover with course metadata ─────────────────────────────────────
        cm = report.get("course_meta", {})
        elements.append(Paragraph("Plot-Ark Analytics Report", title_style))
        elements.append(Paragraph(cm.get("topic", "Untitled Course"), subtitle_style))
        meta_parts = []
        if cm.get("level"):
            meta_parts.append(cm["level"])
        if cm.get("course_type"):
            meta_parts.append(cm["course_type"])
        if cm.get("module_count"):
            meta_parts.append(f"{cm['module_count']} modules")
        if cm.get("course_code"):
            meta_parts.append(cm["course_code"])
        meta_parts.append(f"Generated: {report.get('generated_at', datetime.now().isoformat())[:10]}")
        elements.append(Paragraph(" · ".join(meta_parts), meta_style))
        elements.append(Spacer(1, 0.3*inch))

        # Executive Summary
        summary = report.get("executive_summary", [])
        if summary:
            elements.append(Paragraph("Executive Summary", h2_style))
            for point in summary:
                elements.append(Paragraph(f"• {point}", body_style))
            elements.append(Spacer(1, 0.2*inch))

        # Section 1: Behavior Analysis
        elements.append(Paragraph("1. Behavior Analysis", h2_style))
        if "engagement_trend_line" in charts:
            elements.append(Image(io.BytesIO(charts["engagement_trend_line"]),
                                  width=6*inch, height=2.5*inch))
        if "verb_distribution_bar" in charts:
            elements.append(Spacer(1, 0.2*inch))
            elements.append(Image(io.BytesIO(charts["verb_distribution_bar"]),
                                  width=5.5*inch, height=2.5*inch))

        # Section 2: Risk Assessment
        elements.append(PageBreak())
        elements.append(Paragraph("2. Risk Assessment", h2_style))
        if "risk_distribution_pie" in charts:
            elements.append(Image(io.BytesIO(charts["risk_distribution_pie"]),
                                  width=4*inch, height=4*inch))

        ra = report.get("risk_assessment", {})
        at_risk = ra.get("at_risk_students", [])
        if at_risk:
            elements.append(Paragraph(f"At-Risk Students ({len(at_risk)})", h2_style))
            table_data = [["Name", "Risk", "Score", "Key Signal"]]
            for s in at_risk[:15]:
                sig = s.get("signals", [""])[0] if s.get("signals") else ""
                table_data.append([s["name"], s["risk_level"].upper(), str(s["risk_score"]), sig[:50]])

            t = Table(table_data, colWidths=[1.5*inch, 0.8*inch, 0.6*inch, 3.5*inch])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(COLORS["stone_700"])),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor(COLORS["stone_700"])),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor(COLORS["stone_300"])),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f4")]),
            ]))
            elements.append(t)

        # Section 3: Content Optimization
        elements.append(PageBreak())
        elements.append(Paragraph("3. Content Optimization", h2_style))
        if "module_completion_bar" in charts:
            elements.append(Image(io.BytesIO(charts["module_completion_bar"]),
                                  width=6*inch, height=3*inch))

        co = report.get("content_optimization", {})
        under = co.get("underperforming_content", [])
        if under:
            elements.append(Paragraph("Modules Needing Attention", h2_style))
            for m in under[:5]:
                elements.append(Paragraph(
                    f"<b>{m['module_name']}</b> — Struggle: {m['struggle_rate']:.0%}, "
                    f"Completion: {m['completion_rate']:.0%}", body_style))
                for s in m.get("suggestions", []):
                    elements.append(Paragraph(f"  → {s}", body_style))

        # Section 4: Cohort Comparison
        elements.append(PageBreak())
        elements.append(Paragraph("4. Cohort Comparison", h2_style))
        if "cohort_comparison_bar" in charts:
            elements.append(Image(io.BytesIO(charts["cohort_comparison_bar"]),
                                  width=6*inch, height=3*inch))

        cc = report.get("cohort_comparison", {})
        for insight in cc.get("insights", []):
            elements.append(Paragraph(f"• {insight}", body_style))

        # Section 5: Overview & Recommended Actions
        elements.append(PageBreak())
        elements.append(Paragraph("5. Overview & Recommended Actions", h2_style))
        elements.append(Spacer(1, 0.1*inch))

        overview_lines = self._generate_overview(report)
        for line in overview_lines:
            elements.append(Paragraph(line, body_style))

        doc.build(elements)
        return buf.getvalue()

    # ── DOCX Export ────────────────────────────────────────────────────────────

    def export_docx(self, report: dict) -> bytes:
        """Generate DOCX report with embedded charts."""
        try:
            from docx import Document
            from docx.shared import Inches, Pt, RGBColor
            from docx.enum.text import WD_ALIGN_PARAGRAPH
        except ImportError:
            return self._fallback_text_report(report, "docx")

        doc = Document()
        charts = self.generate_charts(report)

        # Title
        title = doc.add_heading("Plot-Ark Analytics Report", level=0)
        for run in title.runs:
            run.font.color.rgb = RGBColor(0xD9, 0x77, 0x06)  # amber_600

        # Course metadata
        cm = report.get("course_meta", {})
        p_meta = doc.add_paragraph()
        meta_parts = []
        if cm.get("level"):
            meta_parts.append(cm["level"])
        if cm.get("course_type"):
            meta_parts.append(cm["course_type"])
        if cm.get("module_count"):
            meta_parts.append(f"{cm['module_count']} modules")
        if cm.get("course_code"):
            meta_parts.append(cm["course_code"])
        meta_parts.append(f"Generated: {report.get('generated_at', '')[:10]}")
        p_meta.add_run(" · ".join(meta_parts)).font.size = Pt(9)

        # Executive Summary
        doc.add_heading("Executive Summary", level=1)
        for point in report.get("executive_summary", []):
            doc.add_paragraph(f"• {point}")

        # Section 1: Behavior Analysis
        doc.add_heading("1. Behavior Analysis", level=1)
        if "engagement_trend_line" in charts:
            doc.add_picture(io.BytesIO(charts["engagement_trend_line"]), width=Inches(5.5))
        if "verb_distribution_bar" in charts:
            doc.add_picture(io.BytesIO(charts["verb_distribution_bar"]), width=Inches(5))

        # Section 2: Risk Assessment
        doc.add_heading("2. Risk Assessment", level=1)
        if "risk_distribution_pie" in charts:
            doc.add_picture(io.BytesIO(charts["risk_distribution_pie"]), width=Inches(3.5))

        ra = report.get("risk_assessment", {})
        at_risk = ra.get("at_risk_students", [])
        if at_risk:
            doc.add_heading("At-Risk Students", level=2)
            table = doc.add_table(rows=1, cols=4)
            table.style = "Table Grid"
            hdr = table.rows[0].cells
            hdr[0].text, hdr[1].text, hdr[2].text, hdr[3].text = "Name", "Risk", "Score", "Key Signal"
            for s in at_risk[:15]:
                row = table.add_row().cells
                row[0].text = s["name"]
                row[1].text = s["risk_level"].upper()
                row[2].text = str(s["risk_score"])
                row[3].text = (s.get("signals", [""])[0])[:60]

        # Section 3: Content
        doc.add_heading("3. Content Optimization", level=1)
        if "module_completion_bar" in charts:
            doc.add_picture(io.BytesIO(charts["module_completion_bar"]), width=Inches(5.5))

        co = report.get("content_optimization", {})
        for m in co.get("underperforming_content", [])[:5]:
            p = doc.add_paragraph()
            run = p.add_run(m["module_name"])
            run.bold = True
            p.add_run(f" — Struggle: {m['struggle_rate']:.0%}, Completion: {m['completion_rate']:.0%}")
            for s in m.get("suggestions", []):
                doc.add_paragraph(f"  → {s}")

        # Section 4: Cohort
        doc.add_heading("4. Cohort Comparison", level=1)
        if "cohort_comparison_bar" in charts:
            doc.add_picture(io.BytesIO(charts["cohort_comparison_bar"]), width=Inches(5.5))
        for insight in report.get("cohort_comparison", {}).get("insights", []):
            doc.add_paragraph(f"• {insight}")

        # Section 5: Overview
        doc.add_heading("5. Overview & Recommended Actions", level=1)
        for line in self._generate_overview(report):
            doc.add_paragraph(line)

        buf = io.BytesIO()
        doc.save(buf)
        return buf.getvalue()

    # ── Excel Export ───────────────────────────────────────────────────────────

    def export_excel(self, report: dict, course_id: int = 0) -> bytes:
        """Generate multi-sheet Excel with raw data + summaries."""
        try:
            from openpyxl import Workbook
            from openpyxl.styles import Font, PatternFill, Alignment
        except ImportError:
            return b"openpyxl not installed"

        from db import get_db

        wb = Workbook()
        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill("solid", fgColor="44403C")  # stone_700
        red_fill = PatternFill("solid", fgColor="FCA5A5")
        yellow_fill = PatternFill("solid", fgColor="FDE68A")

        # ── Sheet 1: Raw xAPI Data ────────────────────────────────────────────
        ws1 = wb.active
        ws1.title = "Raw xAPI Data"
        raw_headers = ["Student Name", "Email", "Verb", "Object ID", "Object Name", "Timestamp", "Course"]
        for c, h in enumerate(raw_headers, 1):
            cell = ws1.cell(row=1, column=c, value=h)
            cell.font = header_font
            cell.fill = header_fill

        conn = get_db()
        if conn:
            try:
                cur = conn.cursor()
                cur.execute("""
                    SELECT actor_name, actor_email, verb, object_id, object_name, timestamp, curriculum_topic
                    FROM xapi_statements
                    WHERE object_id LIKE %s
                    ORDER BY timestamp
                """, (f"course/{course_id}/%",))
                for r_idx, row in enumerate(cur.fetchall(), 2):
                    for c_idx, val in enumerate(row, 1):
                        ws1.cell(row=r_idx, column=c_idx,
                                 value=val.isoformat() if hasattr(val, "isoformat") else val)
                cur.close()
                conn.close()
            except Exception as e:
                print(f"Excel raw data error: {e}")
                if conn:
                    conn.close()

        # ── Sheet 2: Module Summary ───────────────────────────────────────────
        ws2 = wb.create_sheet("Module Summary")
        ba = report.get("behavior_analysis", {})
        mod_headers = ["Module", "Students", "Completions", "Struggles",
                       "Completion Rate", "Drop-off Rate"]
        for c, h in enumerate(mod_headers, 1):
            cell = ws2.cell(row=1, column=c, value=h)
            cell.font = header_font
            cell.fill = header_fill

        for r_idx, m in enumerate(ba.get("module_engagement", []), 2):
            ws2.cell(row=r_idx, column=1, value=m.get("module_name", ""))
            ws2.cell(row=r_idx, column=2, value=m.get("unique_students", 0))
            ws2.cell(row=r_idx, column=3, value=m.get("completions", 0))
            ws2.cell(row=r_idx, column=4, value=m.get("struggles", 0))
            ws2.cell(row=r_idx, column=5, value=m.get("completion_rate", 0))
            ws2.cell(row=r_idx, column=6, value=m.get("drop_off_rate", 0))

        # ── Sheet 3: Student Roster ───────────────────────────────────────────
        ws3 = wb.create_sheet("Student Roster")
        stu_headers = ["Name", "Email", "Risk Level", "Risk Score",
                       "Total Actions", "Mastered", "Struggled", "Failed", "Completion Rate"]
        for c, h in enumerate(stu_headers, 1):
            cell = ws3.cell(row=1, column=c, value=h)
            cell.font = header_font
            cell.fill = header_fill

        ra = report.get("risk_assessment", {})
        for r_idx, s in enumerate(ra.get("at_risk_students", []), 2):
            ws3.cell(row=r_idx, column=1, value=s.get("name", ""))
            ws3.cell(row=r_idx, column=2, value=s.get("email", ""))
            risk_cell = ws3.cell(row=r_idx, column=3, value=s.get("risk_level", ""))
            ws3.cell(row=r_idx, column=4, value=s.get("risk_score", 0))
            stats = s.get("stats", {})
            ws3.cell(row=r_idx, column=5, value=stats.get("total_actions", 0))
            ws3.cell(row=r_idx, column=6, value=stats.get("mastered", 0))
            ws3.cell(row=r_idx, column=7, value=stats.get("struggled", 0))
            ws3.cell(row=r_idx, column=8, value=stats.get("failed", 0))
            ws3.cell(row=r_idx, column=9, value=stats.get("completion_rate", 0))

            # Conditional formatting
            if s.get("risk_level") == "high":
                risk_cell.fill = red_fill
            elif s.get("risk_level") == "medium":
                risk_cell.fill = yellow_fill

        # ── Sheet 4: Feedback Summary ─────────────────────────────────────────
        ws4 = wb.create_sheet("Feedback Summary")
        fb_headers = ["Module", "Got It", "Mostly", "Something Off", "Didn't Read"]
        for c, h in enumerate(fb_headers, 1):
            cell = ws4.cell(row=1, column=c, value=h)
            cell.font = header_font
            cell.fill = header_fill

        # Get feedback from DB
        conn = get_db()
        if conn:
            try:
                cur = conn.cursor()
                cur.execute("""
                    SELECT module_index, module_title,
                        COUNT(*) FILTER (WHERE sentiment = 'got-it') as got_it,
                        COUNT(*) FILTER (WHERE sentiment = 'mostly') as mostly,
                        COUNT(*) FILTER (WHERE sentiment = 'off') as off,
                        COUNT(*) FILTER (WHERE sentiment = 'not-read') as not_read
                    FROM student_feedback
                    WHERE course_id = %s
                    GROUP BY module_index, module_title
                    ORDER BY module_index
                """, (course_id,))
                for r_idx, row in enumerate(cur.fetchall(), 2):
                    ws4.cell(row=r_idx, column=1, value=row[1] or f"Module {row[0]}")
                    ws4.cell(row=r_idx, column=2, value=row[2])
                    ws4.cell(row=r_idx, column=3, value=row[3])
                    ws4.cell(row=r_idx, column=4, value=row[4])
                    ws4.cell(row=r_idx, column=5, value=row[5])
                cur.close()
                conn.close()
            except Exception as e:
                print(f"Excel feedback error: {e}")
                if conn:
                    conn.close()

        # Auto-width columns
        for ws in [ws1, ws2, ws3, ws4]:
            for col in ws.columns:
                max_length = 0
                for cell in col:
                    try:
                        if cell.value:
                            max_length = max(max_length, len(str(cell.value)))
                    except Exception:
                        pass
                ws.column_dimensions[col[0].column_letter].width = min(max_length + 2, 50)

        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

    def _generate_overview(self, report: dict) -> list:
        """Generate Section 5 overview with data synthesis and recommendations."""
        lines = []
        ra = report.get("risk_assessment", {})
        co = report.get("content_optimization", {})
        ba = report.get("behavior_analysis", {})
        cc = report.get("cohort_comparison", {})
        cm = report.get("course_meta", {})

        # Data Summary
        lines.append("<b>Data Summary</b>")
        total = ra.get("total_students_analyzed", 0)
        at_risk = ra.get("at_risk_students", [])
        high_risk = [s for s in at_risk if s.get("risk_level") == "high"]
        lines.append(f"• Total students analyzed: {total}")
        lines.append(f"• At-risk students: {len(at_risk)} ({len(high_risk)} high-risk)")
        under = co.get("underperforming_content", [])
        high_perf = co.get("high_performing_content", [])
        lines.append(f"• Underperforming modules: {len(under)}")
        lines.append(f"• High-performing modules: {len(high_perf)}")
        groups = cc.get("groups", {})
        dis = groups.get("disengaged", {})
        if dis.get("count", 0) > 0:
            pct = (dis["count"] / max(total, 1)) * 100
            lines.append(f"• Disengaged students: {dis['count']} ({pct:.0f}%)")
        lines.append("")

        # Recommended Improvements
        lines.append("<b>Recommended Improvements</b>")
        if len(at_risk) > 5:
            lines.append(
                f"🔴 HIGH — {len(at_risk)} students are at risk. Schedule 1-on-1 check-ins "
                f"with high-risk students and provide supplementary materials."
            )
        for m in under:
            sug = m.get("suggestions", ["Review and simplify content."])[0]
            lines.append(
                f"🟡 MEDIUM — Module \"{m['module_name']}\" has a "
                f"{m['struggle_rate']:.0%} struggle rate. {sug}"
            )
        if dis.get("count", 0) > 3:
            lines.append(
                f"🟡 MEDIUM — {dis['count']} students show disengaged behavior. "
                f"Consider implementing engagement incentives or personal outreach."
            )
        peak = ba.get("engagement_metrics", {}).get("peak_activity_hours", [])
        if any(h >= 22 or h <= 5 for h in peak):
            lines.append(
                "⚪ LOW — Unusual late-night/early-morning activity detected. "
                "May indicate different time zones or poor time management."
            )
        if len(at_risk) == 0 and len(under) == 0:
            lines.append("✅ No critical issues found. Continue monitoring student progress.")

        return lines

    def _fallback_text_report(self, report: dict, fmt: str) -> bytes:
        """Generate plain-text fallback if libraries not installed."""
        lines = ["Plot-Ark Analytics Report", "=" * 40, ""]
        for point in report.get("executive_summary", []):
            lines.append(f"• {point}")
        lines.append("")
        lines.append("(Install reportlab/python-docx for full report)")
        return "\n".join(lines).encode("utf-8")
