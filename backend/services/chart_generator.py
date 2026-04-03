"""
Chart Generator — matplotlib chart rendering for analytics reports.

Uses Plot-Ark brand colors (amber/stone). All charts returned as PNG bytes.
"""

import io

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker


# ── Plot-Ark Brand Palette (shared across all exporters) ──────────────────────

COLORS = {
    "amber_500": "#f59e0b",
    "amber_600": "#d97706",
    "amber_300": "#fcd34d",
    "amber_50":  "#fffbeb",
    "coffee":    "#7C5C44",
    "coffee_light": "#F5EDE6",
    "coffee_mid":   "#E8D5C8",
    "stone_900": "#1c1917",
    "stone_800": "#292524",
    "stone_700": "#44403c",
    "stone_500": "#78716c",
    "stone_300": "#d6d3d1",
    "stone_200": "#e7e5e4",
    "stone_100": "#f5f5f4",
    "oat_white": "#F9F8F4",
    "oat_mid":   "#F2F1ED",
    "oat_dark":  "#E8E0D0",
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
    """Apply Plot-Ark warm oat style to matplotlib."""
    plt.rcParams.update({
        "figure.facecolor": "#FFFFFF",
        "axes.facecolor": "#FFFFFF",
        "axes.edgecolor": "none",
        "axes.labelcolor": COLORS["stone_700"],
        "axes.grid": True,
        "grid.color": COLORS["stone_200"],
        "grid.linestyle": "--",
        "grid.linewidth": 0.6,
        "grid.alpha": 0.8,
        "text.color": COLORS["stone_800"],
        "xtick.color": COLORS["stone_500"],
        "ytick.color": COLORS["stone_500"],
        "xtick.bottom": False,
        "ytick.left": False,
        "font.family": "sans-serif",
        "font.size": 10,
    })


def fig_to_bytes(fig) -> bytes:
    """Convert a matplotlib figure to PNG bytes and close it."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor="#FFFFFF")
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def generate_charts(report: dict) -> dict:
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
        fig, ax = plt.subplots(figsize=(8, 3.5))
        names = [m.get("module_name", "?")[:25] for m in modules]
        rates = [m.get("completion_rate", 0) * 100 for m in modules]
        struggles = [m.get("struggles", 0) for m in modules]

        x = range(len(names))
        bars = ax.bar(x, rates, color=COLORS["coffee_light"], edgecolor=COLORS["coffee"], linewidth=1.5)
        for bar, rate in zip(bars, rates):
            ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.8,
                    f"{rate:.0f}%", ha="center", va="bottom", fontsize=8, color=COLORS["stone_700"])
        short_labels = [f"M{i+1}" for i in range(len(names))]
        ax.set_xticks(x)
        ax.set_xticklabels(short_labels, rotation=0, fontsize=9)
        ax.set_ylabel("Completion Rate (%)")
        ax.set_title("Module Completion Rates", fontweight="bold", color=COLORS["stone_900"])
        plt.tight_layout()
        charts["module_completion_bar"] = fig_to_bytes(fig)

    # 2. Engagement Trend Line
    daily = ba.get("engagement_metrics", {}).get("daily_activity", [])
    if daily:
        fig, ax = plt.subplots(figsize=(8, 3.5))
        dates = [d["date"] for d in daily]
        users = [d.get("active_users", 0) for d in daily]
        actions = [d.get("actions", 0) for d in daily]

        ax.plot(dates, users, color=COLORS["coffee"], marker="o", linewidth=2.5, label="Active Students")
        ax2 = ax.twinx()
        ax2.plot(dates, actions, color=COLORS["stone_500"], marker="s", linewidth=1.5, linestyle="--", label="Total Actions")
        ax2.set_ylabel("Actions", color=COLORS["stone_500"])
        ax.set_ylabel("Active Students", color=COLORS["coffee"])
        ax.set_title("Daily Engagement Trend", fontweight="bold")
        ax.tick_params(axis="x", rotation=45)
        lines1, labels1 = ax.get_legend_handles_labels()
        lines2, labels2 = ax2.get_legend_handles_labels()
        ax.legend(lines1 + lines2, labels1 + labels2, loc="upper right")
        plt.tight_layout()
        charts["engagement_trend_line"] = fig_to_bytes(fig)

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
            wedges, texts, autotexts = ax.pie(
                sizes, colors=colors, autopct="%1.0f%%",
                textprops={"fontsize": 12, "fontweight": "bold"},
                startangle=90, pctdistance=0.55,
            )
            for at in autotexts:
                at.set_color("white")
            ax.legend(
                wedges, labels_list,
                loc="center left", bbox_to_anchor=(1.0, 0.5),
                fontsize=10, frameon=False,
            )
            ax.set_title("Student Risk Distribution", pad=16)
            plt.tight_layout()
            charts["risk_distribution_pie"] = fig_to_bytes(fig)

    # 4. Verb Distribution Bar
    verbs = ba.get("verb_distribution", {})
    if verbs:
        fig, ax = plt.subplots(figsize=(8, 3.5))
        v_names = list(verbs.keys())
        v_counts = list(verbs.values())
        colors_list = [COLORS["coffee_light"] if i == 0 else COLORS["oat_mid"] for i in range(len(v_names))]
        edge_list = [COLORS["coffee"] if i == 0 else COLORS["stone_500"] for i in range(len(v_names))]
        bars = ax.barh(v_names, v_counts, color=colors_list, edgecolor=edge_list, linewidth=1.5)
        for bar, count in zip(bars, v_counts):
            ax.text(bar.get_width() + 0.5, bar.get_y() + bar.get_height()/2,
                    str(count), va="center", fontsize=8, color=COLORS["stone_700"])
        ax.set_xlabel("Count")
        ax.set_title("Learning Activity Distribution", fontweight="bold", color=COLORS["stone_900"])
        plt.tight_layout()
        charts["verb_distribution_bar"] = fig_to_bytes(fig)

    # 5. Cohort Comparison Grouped Bar
    groups = cc.get("groups", {})
    if groups:
        fig, ax = plt.subplots(figsize=(8, 3.5))
        g_names = [n.replace("_", " ").title() for n in groups.keys()]
        comp_rates = [groups[k].get("avg_completion", 0) * 100 for k in groups]
        struggle_rates = [groups[k].get("avg_struggle", 0) * 100 for k in groups]
        counts = [groups[k].get("count", 0) for k in groups]

        x = range(len(g_names))
        width = 0.35

        comp_bars = ax.bar([i - width/2 for i in x], comp_rates, width, color=COLORS["coffee_light"], edgecolor=COLORS["coffee"], linewidth=1.5, label="Avg Completion %")
        str_bars = ax.bar([i + width/2 for i in x], struggle_rates, width, color=COLORS["oat_mid"], edgecolor=COLORS["stone_500"], linewidth=1.5, label="Avg Struggle %")
        for bar, val in zip(list(comp_bars) + list(str_bars), comp_rates + struggle_rates):
            if val > 0:
                ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
                        f"{val:.0f}%", ha="center", va="bottom", fontsize=7, color=COLORS["stone_700"])

        ax.set_xticks(x)
        ax.set_xticklabels([f"{n}\n(n={c})" for n, c in zip(g_names, counts)])
        ax.set_ylabel("Rate (%)")
        ax.set_title("Cohort Performance Comparison", fontweight="bold")
        ax.legend()
        plt.tight_layout()
        charts["cohort_comparison_bar"] = fig_to_bytes(fig)

    return charts
