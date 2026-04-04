"""
PDF Report Exporter — generates McKinsey-style PDF via ReportLab.

Uses Plot-Ark brand palette from chart_generator.
"""

import io
from datetime import datetime

from services.chart_generator import COLORS, generate_charts


def _generate_overview(report: dict) -> list:
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
            f"HIGH — {len(at_risk)} students are at risk. Schedule 1-on-1 check-ins "
            f"with high-risk students and provide supplementary materials."
        )
    for m in under:
        sug = m.get("suggestions", ["Review and simplify content."])[0]
        lines.append(
            f"MEDIUM — Module \"{m['module_name']}\" has a "
            f"{m['struggle_rate']:.0%} struggle rate. {sug}"
        )
    if dis.get("count", 0) > 3:
        lines.append(
            f"MEDIUM — {dis['count']} students show disengaged behavior. "
            f"Consider implementing engagement incentives or personal outreach."
        )
    peak = ba.get("engagement_metrics", {}).get("peak_activity_hours", [])
    if any(h >= 22 or h <= 5 for h in peak):
        lines.append(
            "LOW — Unusual late-night/early-morning activity detected. "
            "May indicate different time zones or poor time management."
        )
    if len(at_risk) == 0 and len(under) == 0:
        lines.append("No critical issues found. Continue monitoring student progress.")

    return lines


def export_pdf(report: dict) -> bytes:
    """Generate a PDF report with embedded charts using ReportLab."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Image,
            Table, TableStyle, PageBreak, HRFlowable, KeepTogether
        )
    except ImportError:
        lines = ["Plot-Ark Analytics Report", "=" * 40, ""]
        for point in report.get("executive_summary", []):
            lines.append(f"• {point}")
        lines.append("")
        lines.append("(Install reportlab for full report)")
        return "\n".join(lines).encode("utf-8")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter,
                            topMargin=0.5*inch, bottomMargin=0.5*inch,
                            leftMargin=0.5*inch, rightMargin=0.5*inch)
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle("PlotArkTitle", parent=styles["Title"],
                                 textColor=colors.HexColor(COLORS["stone_900"]),
                                 fontSize=24, spaceAfter=4)
    subtitle_style = ParagraphStyle("PlotArkSubtitle", parent=styles["Heading1"],
                                    textColor=colors.HexColor(COLORS["stone_700"]),
                                    fontSize=18, spaceBefore=4, spaceAfter=4)
    meta_style = ParagraphStyle("PlotArkMeta", parent=styles["Normal"],
                                textColor=colors.HexColor(COLORS["stone_500"]),
                                fontSize=9, spaceAfter=12)
    h2_style = ParagraphStyle("PlotArkH2", parent=styles["Heading2"],
                              textColor=colors.HexColor(COLORS["stone_900"]),
                              fontSize=16, spaceAfter=2, spaceBefore=12)
    body_style = ParagraphStyle("PlotArkBody", parent=styles["Normal"],
                                fontSize=10, spaceAfter=6)

    stat_card_num = ParagraphStyle("StatNum", textColor=colors.HexColor(COLORS["coffee"]), fontSize=36, fontName="Helvetica-Bold", leading=40, alignment=1, spaceAfter=4)
    stat_card_lbl = ParagraphStyle("StatLbl", textColor=colors.HexColor(COLORS["stone_500"]), fontSize=9, fontName="Helvetica-Bold", alignment=1)
    insight_style = ParagraphStyle("PlotArkInsight", parent=styles["Normal"], textColor=colors.HexColor(COLORS["stone_500"]), fontSize=9, fontName="Helvetica-Oblique", spaceBefore=4, spaceAfter=8, leftIndent=10, rightIndent=10)
    callout_style = ParagraphStyle("PlotArkCallout", textColor=colors.HexColor(COLORS["coffee"]), fontSize=48, fontName="Helvetica-Bold", leading=56, spaceAfter=8, spaceBefore=4)
    callout_label = ParagraphStyle("PlotArkCalloutLbl", textColor=colors.HexColor(COLORS["stone_500"]), fontSize=12, fontName="Helvetica-Bold", spaceAfter=16)

    def draw_header_footer(canvas, doc_obj):
        canvas.saveState()
        canvas.setFont("Helvetica-Bold", 10)
        canvas.setFillColor(colors.HexColor(COLORS["coffee"]))
        canvas.drawString(0.5*inch, letter[1] - 0.4*inch, "Plot Ark Analytics")
        canvas.setFont("Helvetica", 9)
        canvas.setFillColor(colors.HexColor(COLORS["stone_500"]))
        canvas.drawRightString(letter[0] - 0.5*inch, letter[1] - 0.4*inch, report.get("course_meta", {}).get("topic", "Untitled Course"))
        canvas.drawCentredString(letter[0]/2, 0.3*inch, f"Page {doc_obj.page} | Generated: {report.get('generated_at', datetime.now().isoformat())[:10]}")
        canvas.restoreState()

    elements = []
    charts = generate_charts(report)

    # ── Cover with course metadata ─────────────────────────────────────
    cm = report.get("course_meta", {})
    elements.append(Spacer(1, 1.5*inch))
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

    # Executive Summary Stat Cards
    ba = report.get("behavior_analysis", {})
    ra = report.get("risk_assessment", {})

    total_students = sum(ra.get("risk_distribution", {}).values())
    if total_students == 0:
        total_students = max([m.get("unique_students", 0) for m in ba.get("module_engagement", [])] + [0])

    mods = ba.get("module_engagement", [])
    avg_comp = sum(m.get("completion_rate", 0) for m in mods) / len(mods) if mods else 0
    total_at_risk = len(ra.get("at_risk_students", []))
    high = ra.get("risk_distribution", {}).get("high", 0)
    medium = ra.get("risk_distribution", {}).get("medium", 0)
    low = ra.get("risk_distribution", {}).get("low", 0)

    # Row 1: 2-column top stats
    top_stat_data = [
        [
            [Paragraph(str(total_students), stat_card_num), Paragraph("TOTAL STUDENTS", stat_card_lbl)],
            [Paragraph(f"{avg_comp * 100:.0f}%", stat_card_num), Paragraph("AVG COMPLETION", stat_card_lbl)],
        ]
    ]
    t_top = Table(top_stat_data, colWidths=[3.75*inch]*2)
    t_top.setStyle(TableStyle([
        ("ALIGN", (0,0), (-1,-1), "CENTER"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ]))
    elements.append(t_top)
    elements.append(Spacer(1, 0.18*inch))

    # Row 2: At-risk breakdown — two centered lines
    breakdown_total_style = ParagraphStyle(
        "BreakdownTotal", parent=stat_card_num, fontSize=20, alignment=1,
    )
    breakdown_detail_style = ParagraphStyle(
        "BreakdownDetail", parent=stat_card_lbl, fontSize=11, alignment=1, spaceAfter=0,
    )
    elements.append(Paragraph(f"{total_at_risk} AT RISK IN TOTAL", breakdown_total_style))
    elements.append(Spacer(1, 0.06*inch))
    elements.append(Paragraph(
        f"{high} HIGH-RISK  |  {medium} MEDIUM-RISK  |  {low} LOW-RISK",
        breakdown_detail_style,
    ))
    elements.append(Spacer(1, 0.2*inch))

    # ── Table of Contents ──────────────────────────────────────────────
    toc_heading = ParagraphStyle("PlotArkToC", parent=styles["Heading2"],
                                 textColor=colors.HexColor(COLORS["stone_700"]),
                                 fontSize=14, spaceAfter=8, spaceBefore=8)
    link_style = ParagraphStyle("PlotArkLink", parent=styles["Normal"],
                                textColor=colors.HexColor(COLORS["blue_500"]),
                                fontSize=11, spaceAfter=4)

    elements.append(Paragraph("Table of Contents", toc_heading))
    toc_items = [
        ("sec_behavior", "1. Behavior Analysis"),
        ("sec_risk", "2. Risk Assessment"),
        ("sec_content", "3. Content Optimization"),
        ("sec_cohort", "4. Cohort Comparison"),
        ("sec_overview", "5. Overview & Recommended Actions")
    ]
    for anchor, label in toc_items:
        elements.append(Paragraph(f'<font color="{COLORS["blue_500"]}"><a href="#{anchor}">{label}</a></font>', link_style))
    elements.append(PageBreak())

    # Section 1: Behavior Analysis
    elements.append(Paragraph('<a name="sec_behavior"/>1. Behavior Analysis', h2_style))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#D1D5DB"), spaceBefore=2, spaceAfter=12))

    ba = report.get("behavior_analysis", {})

    verbs = ba.get("verb_distribution", {})
    if verbs:
        MASTERY_VERBS = ["completed", "passed"]
        STRUGGLE_VERBS = ["struggled", "failed"]
        engagement_verbs = [v for v in verbs if v not in MASTERY_VERBS and v not in STRUGGLE_VERBS]

        total = sum(verbs.values())

        def _group_count(verb_list):
            return sum(verbs.get(v, 0) for v in verb_list)

        def _pct(count):
            return f"{(count / total * 100):.1f}%" if total > 0 else "0.0%"

        def _breakdown_str(verb_list):
            parts = [f"{v}: {verbs[v]}" for v in verb_list if v in verbs]
            return "\n".join(parts) if parts else "—"

        group_style_normal = ParagraphStyle("VGNormal", fontSize=9, textColor=colors.HexColor(COLORS["stone_700"]), leading=13)
        group_style_count = ParagraphStyle("VGCount", fontSize=22, fontName="Helvetica-Bold", leading=28, alignment=1)
        group_style_label = ParagraphStyle("VGLabel", fontSize=8, fontName="Helvetica-Bold", leading=12, alignment=1)
        group_style_pct = ParagraphStyle("VGPct", fontSize=9, textColor=colors.HexColor(COLORS["stone_500"]), leading=12, alignment=1)
        group_style_breakdown = ParagraphStyle("VGBreak", fontSize=8, textColor=colors.HexColor(COLORS["stone_700"]), leading=12, alignment=1)

        mastery_count = _group_count(MASTERY_VERBS)
        struggle_count = _group_count(STRUGGLE_VERBS)
        engagement_count = _group_count(engagement_verbs)

        def _cell(label, count, pct_str, verb_list, count_color):
            breakdown = "\n".join(f"{v}: {verbs[v]}" for v in verb_list if v in verbs) or "—"
            return [
                Paragraph(label, ParagraphStyle("VGLbl", fontSize=8, fontName="Helvetica-Bold", alignment=1,
                                                textColor=colors.HexColor(count_color), leading=12)),
                Paragraph(str(count), ParagraphStyle("VGCt", fontSize=22, fontName="Helvetica-Bold",
                                                     alignment=1, textColor=colors.HexColor(count_color), leading=28)),
                Paragraph(pct_str + " of total", ParagraphStyle("VGP", fontSize=8, alignment=1,
                                                                 textColor=colors.HexColor(COLORS["stone_500"]), leading=12)),
                Paragraph(breakdown, ParagraphStyle("VGB", fontSize=8, alignment=1,
                                                    textColor=colors.HexColor(COLORS["stone_700"]), leading=12)),
            ]

        total_students = report.get("risk_assessment", {}).get("total_students_analyzed", 0)
        total_label = f"Total: {total} learning events across {total_students} students"
        elements.append(Paragraph(total_label, ParagraphStyle("VerbTotal", fontSize=9,
                                                               textColor=colors.HexColor(COLORS["stone_500"]),
                                                               spaceAfter=6)))

        verb_table_data = [[
            _cell("MASTERY", mastery_count, _pct(mastery_count), MASTERY_VERBS, "#15803D"),
            _cell("STRUGGLE", struggle_count, _pct(struggle_count), STRUGGLE_VERBS, "#B91C1C"),
            _cell("ENGAGEMENT", engagement_count, _pct(engagement_count), engagement_verbs, "#92400E"),
        ]]

        t = Table(verb_table_data, colWidths=[2.17*inch]*3)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#D1FAE5")),
            ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#FEE2E2")),
            ("BACKGROUND", (2, 0), (2, 0), colors.HexColor("#FFFBEB")),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("LINEBEFORE", (1, 0), (2, 0), 0.5, colors.HexColor(COLORS["oat_dark"])),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor(COLORS["oat_dark"])),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 0.2*inch))

    peak = ba.get("engagement_metrics", {}).get("peak_activity_hours", [])
    if peak:
        peak_str = ", ".join([f"{h}:00" for h in peak])
        elements.append(Paragraph(f"<b>Peak Activity Hours:</b> {peak_str}", body_style))
        elements.append(Spacer(1, 0.2*inch))

    if "engagement_trend_line" in charts:
        elements.append(Image(io.BytesIO(charts["engagement_trend_line"]),
                              width=6.5*inch, height=2.8*inch))
        elements.append(Paragraph('The daily engagement trend indicates overall student activity volume versus active unique students. High peaks generally align with deadlines or new module releases.', insight_style))

    if "verb_distribution_bar" in charts:
        elements.append(Spacer(1, 0.2*inch))
        elements.append(Image(io.BytesIO(charts["verb_distribution_bar"]),
                              width=6.5*inch, height=2.8*inch))
        elements.append(Paragraph('Action distribution reveals the dominant types of learning interactions. A high volume of passive text verbs (e.g., "viewed", "read") compared to active ones (e.g., "completed", "passed") may suggest a need for more interactive assessments.', insight_style))

    # Section 2: Risk Assessment
    elements.append(PageBreak())
    elements.append(Paragraph('<a name="sec_risk"/>2. Risk Assessment', h2_style))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#D1D5DB"), spaceBefore=2, spaceAfter=8))

    ra = report.get("risk_assessment", {})
    high_risk_count = ra.get("risk_distribution", {}).get("high", 0)
    at_risk = ra.get("at_risk_students", [])

    risk_section_elements = []
    risk_section_elements.append(Paragraph(str(high_risk_count), callout_style))
    risk_section_elements.append(Paragraph("HIGH RISK STUDENTS NEEDING ATTENTION", callout_label))

    if "risk_distribution_pie" in charts:
        risk_section_elements.append(Image(io.BytesIO(charts["risk_distribution_pie"]),
                                           width=3.5*inch, height=3.0*inch))
        risk_section_elements.append(Paragraph(
            'The risk pie chart groups students into Low, Medium, and High risk categories '
            'based on learning progress and struggle rates.', insight_style))

    if at_risk:
        risk_section_elements.append(Paragraph(f"At-Risk Students ({len(at_risk)})", h2_style))
        table_data = [["Name", "Risk", "Score", "Key Signal"]]
        for s in at_risk[:15]:
            sig = s.get("signals", [""])[0] if s.get("signals") else ""
            table_data.append([
                Paragraph(s["name"], body_style),
                s["risk_level"].upper(),
                str(s["risk_score"]),
                Paragraph(sig, body_style)
            ])

        t = Table(table_data, colWidths=[1.5*inch, 0.8*inch, 0.6*inch, 3.5*inch], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(COLORS["oat_dark"])),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor(COLORS["stone_800"])),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor(COLORS["stone_700"])),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("LINEBELOW", (0, 0), (-1, 0), 0.4, colors.HexColor(COLORS["stone_300"])),
            ("LINEBELOW", (0, 1), (-1, -2), 0.3, colors.HexColor(COLORS["stone_200"])),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor(COLORS["oat_white"]), colors.HexColor(COLORS["oat_mid"])]),
        ]))
        risk_section_elements.append(t)

    elements.append(KeepTogether(risk_section_elements))

    # Section 3: Content Optimization
    elements.append(PageBreak())
    elements.append(Paragraph('<a name="sec_content"/>3. Content Optimization', h2_style))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#D1D5DB"), spaceBefore=2, spaceAfter=8))

    modules = report.get("behavior_analysis", {}).get("module_engagement", [])
    if modules:
        elements.append(Paragraph("Module Engagement Summary", ParagraphStyle("PlotArkH3", parent=h2_style, fontSize=12, spaceBefore=0)))
        table_data = [["#", "Module", "Students", "Completion", "Struggle"]]
        for idx, m in enumerate(modules, 1):
            name_str = m.get("module_name", "")
            table_data.append([
                f"M{idx}",
                Paragraph(name_str, body_style),
                str(m.get("unique_students", 0)),
                f"{m.get('completion_rate', 0)*100:.0f}%",
                f"{m.get('struggle_rate', 0)*100:.0f}%"
            ])
        t = Table(table_data, colWidths=[0.4*inch, 2.8*inch, 0.8*inch, 1.0*inch, 1.0*inch])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(COLORS["oat_dark"])),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor(COLORS["stone_800"])),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor(COLORS["stone_700"])),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("LINEBELOW", (0, 0), (-1, 0), 0.4, colors.HexColor(COLORS["stone_300"])),
            ("LINEBELOW", (0, 1), (-1, -2), 0.3, colors.HexColor(COLORS["stone_200"])),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor(COLORS["oat_white"]), colors.HexColor(COLORS["oat_mid"])]),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 0.2*inch))

    if "module_completion_bar" in charts:
        elements.append(Image(io.BytesIO(charts["module_completion_bar"]),
                              width=6.5*inch, height=2.8*inch))
        elements.append(Paragraph('Completion rates across all modules. Significant dips commonly correlate with increased difficulty or unoptimized content delivery requiring attention.', insight_style))

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
    elements.append(Paragraph('<a name="sec_cohort"/>4. Cohort Comparison', h2_style))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#D1D5DB"), spaceBefore=2, spaceAfter=8))

    if "cohort_comparison_bar" in charts:
        elements.append(Image(io.BytesIO(charts["cohort_comparison_bar"]),
                              width=6.5*inch, height=2.8*inch))
        elements.append(Paragraph('This bar chart segments learners by cohort risk level (High vs Avg vs Low), highlighting how initial disengagement compounds into widening struggle percentage gaps.', insight_style))

    cc = report.get("cohort_comparison", {})
    for insight in cc.get("insights", []):
        elements.append(Paragraph(f"• {insight}", body_style))

    # Section 5: Overview & Recommended Actions
    elements.append(PageBreak())
    elements.append(Paragraph('<a name="sec_overview"/>5. Overview & Recommended Actions', h2_style))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#D1D5DB"), spaceBefore=2, spaceAfter=8))
    elements.append(Spacer(1, 0.1*inch))

    overview_lines = _generate_overview(report)
    for line in overview_lines:
        elements.append(Paragraph(line, body_style))

    doc.build(elements, onFirstPage=draw_header_footer, onLaterPages=draw_header_footer)
    return buf.getvalue()
