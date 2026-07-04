[English](README.md) | [中文](README.zh.md)

# Plot Ark — Generate · Track · Optimize

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![GitHub stars](https://img.shields.io/github/stars/Schlaflied/Plot-Ark?style=social&cacheSeconds=1)](https://github.com/Schlaflied/Plot-Ark/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/Schlaflied/Plot-Ark?style=social&cacheSeconds=1)](https://github.com/Schlaflied/Plot-Ark/forks)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-SSE-000000?logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![React](https://img.shields.io/badge/React-TypeScript-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-History-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-Cache-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![LightRAG](https://img.shields.io/badge/LightRAG-MIT-orange)](https://github.com/HKUDS/LightRAG)
[![xAPI](https://img.shields.io/badge/xAPI-1.0.3-5C6BC0)](https://xapi.com/)
[![Tavily](https://img.shields.io/badge/Tavily-Research%20Agent-7C3AED)](https://tavily.com/)
[![IMS](https://img.shields.io/badge/Export-IMS%20Common%20Cartridge-2E7D32)](https://www.imsglobal.org/)
[![Awesome](https://awesome.re/badge.svg)](https://github.com/Jenqyang/Awesome-AI-Agents)
[![Built on Hive](https://img.shields.io/badge/Built%20on-Hive-orange?logo=github)](https://github.com/aden-hive/hive)
[![Hive Contributor](https://img.shields.io/badge/Hive-Contributor-brightgreen)](https://github.com/aden-hive/hive/pulls?q=author%3ASchlaflied)

<p align="center">
  <img src="Logo_Agentic.png" alt="Plot Ark Logo" width="200"/>
</p>

<h3 align="center">
  👉 <a href="https://schlaflied.github.io/Plot-Ark/">Visit the Official Landing Page</a> 👈
</h3>

**An open-source, dual-portal (instructor + student) agentic platform that closes the curriculum loop — generate evidence-based course content, track real learner behavior via xAPI, and continuously optimize modules through AI agents with human-in-the-loop control.**

> **Generate** — A Tavily research agent queries academic, video, and news sources before any content is written. Bloom's Taxonomy alignment, Krashen's i+1 difficulty progression, and Cognitive Load Theory are built into the generation pipeline, so the curriculum structure is grounded in how learning actually works. No hallucinated citations.

> **Track** — Every student interaction produces xAPI statements. A 5-node A2A multi-agent pipeline (BehaviorAnalyst · RiskDetector · ContentOptimizer · CohortComparator) analyzes engagement patterns, flags at-risk learners, and surfaces underperforming modules — with a full analytics dashboard and exportable reports.

> **Optimize** — The Curriculum Agent translates analytics findings into targeted module edits. Instructors review each suggestion with a before/after preview and approve or reject changes individually. Approved edits feed back into the next xAPI data cycle — the loop closes.

> **Personalize** — Students build learning profiles with discipline preferences, multi-character persona sets with relationship-mapped narrative anchors, and custom AI instructions. A configurable Agent Team (18 preset models + custom model support across 9 providers) lets users choose their own LLM stack. A template-driven diagnosis engine provides gentle, one-sentence concept-gap guidance — no scores, no rankings, just a map of where to look next.

---

### 🆕 What's New (July 2026)

| Feature | Description |
|---------|-------------|
| 🪞 **Student Self-View (Mirror) Layer** | Students see their own behavioral data — a mirror, not a report card. **Attention footprint** overlays visited concepts on the knowledge graph (amber heat by visit depth, with a "Mastery / My footprint" fill toggle); **Learning Rhythm** renders a 7×24 heatmap of when you actually study, with pattern statements ("You tend to study most on Thursdays, usually around 9pm."). Pure SQL, zero LLM. Shades compare only against your own busiest hour — never against classmates. The institutional-scale port of [Cogito](https://github.com/Schlaflied/Cogito) Directions A & B. |
| 🔍 **Look Back Card — a mirror you can veto** | On demand only — nothing appears until the student asks. Template pattern statements ("You came back to Legal Systems on 4 different days — revisiting is your brain asking to consolidate."), each with a **"Sounds like me / Not quite"** verdict button. *You decide if it's true — your answer stays with you.* Verdicts persist to a student-only LTM (`selfview_snapshots`) that no instructor endpoint can read — the only ground-truth signal in the system, reserved for future personalization. |
| 🗂️ **My Courses, redesigned** | xAPI activity now counts as enrollment (not just feedback). Full-width flip cards — front: course name + mastery dots; back: labeled M1–Mn module bars with per-module tooltips. Keyword search across course names, codes, and module titles. |

### Earlier (May 2026)

| Feature | Description |
|---------|-------------|
| 🤖 **Multi-Model Agent Team** | 18 preset models across 9 providers (OpenAI, Anthropic, Google, DeepSeek, Mistral, xAI, Groq, MiniMax, GLM) + custom model support for any OpenAI-compatible API. ★ Recommended tags, MoE ⚠ architecture warnings, dynamic API key detection. |
| 👤 **Student Profile System** | 4-tab profile (Profile, Customized Learning, My Progress, AI Settings) with avatar, discipline selector, CP/OC narrative anchors, multi-persona sets with relationship tags, and custom AI instructions. |
| 🎓 **Professor Settings Portal** | Full settings page with profile, academic preferences (level, course type, session duration, design approach), custom AmberSelect dropdowns, model defaults, and prompt templates — all with auto-save. |
| 🔐 **Per-Provider API Keys** | Bring your own key — dynamic key inputs appear only for providers currently in use. Fernet-encrypted storage on backend. |

---

### 👥 Who Is This For?

| Role | What You Get |
|------|-------------|
| **Instructors** | AI-generated course content grounded in pedagogy, xAPI analytics dashboard, three-layer HITL optimization suggestions, knowledge graph, exportable reports (PDF/DOCX/Excel/IMS) |
| **Students** | Personalized learning profiles, one-sentence concept-gap diagnosis, narrative-anchored explanations (CP/OC), configurable AI model team, progress visualization, self-view mirror (attention footprint + learning rhythm — visible only to you) |
| **Developers** | Modular Flask + React codebase, Hive-style A2A agent architecture, Docker one-command setup, extensible model routing via OpenAI-compatible SDK |

---

## 🧭 Design Philosophy

Most EdTech AI tools treat artificial intelligence as a threat to be monitored — detecting whether students used AI, flagging "inauthentic" work, enforcing originality.

Plot Ark takes the opposite position.

**AI is a cognitive tool, not a threat.** A student who uses AI to draft an answer, then understands it, refines it, and can explain it in their own words — that student has learned. Copy-paste without comprehension is a student deceiving themselves, not a system to be policed.

Plot Ark has no AI detection mechanism. It never will. The question it asks is not *"did you use AI?"* but *"did learning happen?"* — and it answers that through Bloom's Taxonomy alignment, i+1 difficulty progression, and xAPI learner behavior tracking.

The curriculum engine itself is built the same way: AI generates the structure, pedagogy constrains the output, and the instructor stays in the loop. The tool thinks; the human decides.

This system was built so that no one gets left behind by the system. The author was one of those people who were ignored by the system.

Anthropic's Economic Index (Jan 2026) found r = 0.925 between prompt sophistication and response sophistication — the deeper you engage it, the deeper it responds.

**The same principle runs through [Cogito](https://github.com/Schlaflied/Cogito)** — the author's personal-scale version of this problem. Cogito extracts git diffs and note content from a personal knowledge vault, embeds them semantically, and surfaces cognitive patterns the person wasn't aware of. xAPI is the same methodology at institutional scale: behavioral traces → semantic analysis → patterns formal records miss. A note is a final state. A diff is a decision. An xAPI statement is a moment of engagement. None of these are in the transcript.

---

## 🎬 Demo

**Course generation** — agentic source retrieval, syllabus import, and interactive module adjustment

![Course generation](docs/Course%20generation.gif)

**AI suggestion within course generation** — AI tutors and teaching suggestions directly within the curriculum editor

![AI suggestion within course generation](docs/AI%20suggestion%20within%20course%20generation.gif)

**Student panel with four buttons** — per-module sentiment collection feeding into the analytics loop

![Student panel with four buttons](docs/Student%20panel%20with%20four%20buttons.gif)

**xAPI student data analysis** — 5-node A2A agent pipeline simulating and detecting learner risk

![xAPI student data analysis](docs/xAPI%20student%20data%20analysis.gif)

**Curriculum agent & xAPI rerun** — human-in-the-loop module optimization based on learner data

![Curriculum agent & xAPI rerun](docs/Curriculum%20agent%20%26%20xAPI%20rerun.gif)

**Knowledge Graph RAG** — LightRAG extracts interconnected concepts from your syllabus PDFs into a visual, queryable force-directed network

![LightRAG knowledge graph](docs/LightRAG%20knowledge%20graph.gif)

▶ [Full demo video (Google Drive)](https://drive.google.com/file/d/14SLOJFImW9TqyyXipJL1wumkptir7WuU/view?usp=sharing)

▶ [xAPI + A2A Analytics demo (Google Drive)](https://drive.google.com/file/d/1CVrWfrJ1gGUDf-VD1E9p443-7DKJs5MM/view?usp=drive_link)

---

## ✨ Features

<details>
<summary><strong>🧠 Curriculum Generation</strong></summary>

- **Agentic source research** — Tavily agent runs multi-type queries across academic (JSTOR, Springer, ResearchGate…), video (TED, Coursera, YouTube), and news (HBR, Economist, NYT) domains before generation begins
- **Grounded citations** — verified real URLs injected into the prompt; sources panel shows full titles, type badges (📄/🎬/📰), and estimated read/watch time
- **Structure self-check** — after generation, validates complexity_level progression and module count; auto-retries once if structure is invalid
- **Bloom's Taxonomy alignment** — course code (e.g. ACCT 301) automatically maps to the correct cognitive level (Remember → Create)
- **i+1 difficulty progression** — complexity_level increases across modules so each one builds on the last
- **Cognitive Load constraints** — max 2 readings per module, each with explicit pedagogical rationale
- **Course typology** — project-based, essay, debate/roleplay, lab/simulation, or mixed assessment formats
- **SSE streaming** — content streams token-by-token; research agent status shown before generation starts
- **Syllabus import** — upload PDF or DOCX; GPT extracts topic, course code, level, audience, module count, and required readings to pre-fill the form
- **Course narrative** — a 2–3 sentence "story of the course" generated at the skeleton phase; professor-editable, student read-only

</details>

<details>
<summary><strong>✏️ Module Editor</strong></summary>

- **Single-card navigation** — left/right arrows through modules, or click the sidebar index
- **Drag-and-drop reordering** — restructure the sequence without regenerating
- **Inline editing** — edit every field across all three tabs (Objectives, Resources, Assessment)
- **Add / remove items** — learning objectives, readings, assignments all editable
- **Resource cards** — each reading shows type badge, estimated time, and links directly to the source
- **LocalStorage persistence** — edits survive page refresh
- **Course narrative editing** — professor can edit the course-level narrative inline; students see read-only version

</details>

<details>
<summary><strong>📦 Export</strong></summary>

- **IMS Common Cartridge (.imscc)** — direct import into Canvas, Moodle, D2L
- **PDF export** — client-side jsPDF; readings listed as inline titles per module, full citations collected in a References section at the end
- **DOCX export** — python-docx backend; same structure as PDF
- **Markdown export** — full curriculum with readings and assignments as a .md file
- **Citation format selector** — APA / MLA / Chicago, applied across all export formats
- **Copy to clipboard** — paste into any editor

</details>

<details>
<summary><strong>🕸️ Knowledge Graph (LightRAG)</strong></summary>

- **Material ingestion** — right-side panel always visible; drag-and-drop PDF/PPTX upload (max 15 files, 50MB each); per-file progress tracking; Build Graph button triggers LightRAG ingestion
- **Undergraduate year sidebar** — Year 1–4 + All Courses navigation; courses organized by academic year
- **Course management** — course banner with pill navigation per year; add/delete/rename/drag-reorder course pills; each course has an editable full name tag; changes auto-saved to localStorage
- **Dynamic subject tabs** — add/delete/rename/drag-reorder subject tabs; tab state persists across sessions
- **Force-directed visualization** — interactive 2D graph with dual-channel color encoding: **fill color = mastery level** (green/yellow/red/gray), **border color = knowledge layer** (amber=Core, purple=Supplementary, blue=Student Notes); node size scales with connection count
- **Mastery overlay** — concept mastery derived from xAPI verbs + student feedback; synced automatically after every xAPI analysis run; all untracked concepts shown as unified gray ("Not Learned")
- **Node detail panel** — click any concept to see its definition and connection count
- **Fullscreen mode** — fullscreen toggle with ESC key support
- **Course search** — search courses by name or code across all years; auto-navigates to correct year
- **Concept search** — filter and highlight matching nodes across the graph
- **Knowledge query** — ask natural language questions against the graph; Redis-cached answers (persistent cache)
- **Query history** — starred + deletable history of past questions with subject tags
- **Persistent event loop** — LightRAG async engine runs on a dedicated background thread; no cold-start penalty after first query

</details>

<details>
<summary><strong>👤 Student Profile & AI Settings</strong></summary>

- **4-tab profile** — Profile (avatar + display name), Customized Learning, My Progress, AI Settings
- **Discipline selector** — 5 academic disciplines (Humanities, Social Science, Business, STEM, Health Science) with dynamic example switching; STEM surfaces derivation-focused pedagogy
- **Multi-persona sets** — define multiple character groups with per-character gender, personality descriptions, fandom, relationship tags (Trust, Rivalry, Mentorship, etc.), and linked courses; collapsible panels with default group starring
- **CP/OC narrative system** — students define character pairs (Coupling & Original Character); LLM uses relationship dynamics as semantic anchors for concept explanations
- **My Progress** — color-block mastery overview per course (green/yellow/red/gray); zero numeric values displayed (UX red line)
- **Custom AI instructions** — persistent `custom_prompt` field for students to provide context to the LLM ("I learn best with real-world examples")
- **Prompt ideas library** — clickable example prompts that append directly to the textarea with one click
- **Auto-save** — debounced 800ms save for all profile fields via `PUT /api/profile`
- **One-sentence diagnosis** — template-driven engine (`student_diagnosis.py`) generates gentle concept-gap guidance per course; warm amber/green card on CoursePage with "Jump to Module" navigation
- **Privacy red lines** — no numeric scores, no class comparisons, no rankings; professors cannot see student profiles

</details>

<details>
<summary><strong>🤖 Multi-Model Agent Team (NEW)</strong></summary>

- **18 preset models** across 9 providers: OpenAI (GPT-4o, GPT-4o Mini), Anthropic (Sonnet 4.6, Haiku 4.5, Opus 4.7), Google (Gemini 2.5 Flash, Gemini 3 Flash), DeepSeek (V3, R1), Mistral (Large, Small), xAI (Grok 3, Grok 3 Mini), Groq (Llama 3.3 70B), MiniMax (MiniMax-01), GLM/Zhipu (GLM-4 Flash, GLM-4 Plus)
- **3 agent roles** — 🧠 Primary Explainer, 🔍 Fact Checker, 📝 Style Adapter; each with independent model selection
- **★ Recommended tags** — dense architecture models marked as recommended for Explainer role
- **⚠ MoE warnings** — Mixture-of-Experts models show architecture warning on Explainer role ("may produce inconsistent structured output")
- **Custom model support** — `+ Add custom model` at dropdown bottom; configure name, model_id, base_url, API key, and cost for any OpenAI-compatible endpoint (Ollama, vLLM, local deployments)
- **Dynamic API keys** — key input fields appear only for providers currently selected; per-provider required/not-used indicators
- **Cost estimation** — per-role `~$X.XX/gen` and total `💰 Estimated cost per generation` bar
- **Fernet-encrypted storage** — API keys encrypted at rest; GET returns masked values (`••••••••xxxx`)

</details>

<details>
<summary><strong>🎓 Professor Settings Portal (NEW)</strong></summary>

- **Profile** — avatar, display name, multi-select disciplines, multi-select delivery modes, auto-save with sidebar sync
- **Academic Preferences** — default level (14 grouped options), course type, session duration, design approach, export format; all using custom AmberSelect dropdowns matching the P2 design system
- **Model Defaults** — same ModelSelectionCard as student side; configures course-level default models for the Agent Team
- **Prompt Templates** — custom AI instructions for course generation with clickable idea library
- **Unified auto-save** — 600ms debounce across all fields with visual save status indicators

</details>

<details>
<summary><strong>🤖 A2A Multi-Agent Analytics</strong></summary>

- **5-node pipeline** — `Orchestrator → [BehaviorAnalyst ‖ RiskDetector ‖ ContentOptimizer ‖ CohortComparator] → aggregate → LTM snapshot`. All agents are currently sql-only (Phase 2 = LLM integration pending).
- **PII anonymisation** — student names/emails are anonymised before agent processing; real identities are restored only in the final aggregated report for the professor.
- **xAPI mock data engine** — 4 noise levels (5%/10%/15%/20%) seeded from frontend UI; realistic 6-week timestamp distribution with `HOUR_WEIGHTS` and profile-based student spread (high_performer / average / struggling / disengaged). **Curriculum-aware**: queries `change_log` for applied modules and uses `IMPROVED_VERB_DIST` to simulate realistic post-optimization improvement.
- **Hive-style node architecture** — each agent inherits `BaseNode` with reflexion/retry (max 3), L3 JSON Schema validation, and SQL fallback
- **SharedMemory (Redis)** — agents communicate through Redis-backed shared memory (`a2a:{session_id}:{key}`) with local dict fallback
- **Token usage tracking** — `NodeResult` carries `tokens_in / tokens_out / tokens_cache_read / tokens_cache_write`. Orchestrator prints a token summary table to backend log after each run; report JSON includes a `token_summary` block. Frontend sidebar shows a Token Usage panel (currently all zero — sql-only Phase 1).
- **LTM 3-layer architecture** — Hot (Redis, pipeline runtime), Warm (PostgreSQL `course_analysis_snapshots`, persisted per-run), Cold (`data/ltm/*.md` YAML+Markdown, versioned with course codes)
- **Historical trend visualization** — `TrendChart.tsx` (pure SVG) shows at-risk % and completion rate over time; mini mode + full-screen modal with date labels, larger data points, and summary stat cards
- **SSE real-time streaming** — analysis progress streams via Server-Sent Events; frontend shows live agent status
- **Student Data dashboard** — dedicated full-page analytics view with resizable sidebar, section navigation, noise-level selector, and Token Usage panel
- **Risk detection** — 6 signals; thresholds: medium ≥ 4, high ≥ 7; inactivity windows: 14 / 21 days
- **Cohort comparison** — students grouped into high_performers / average / at_risk / disengaged with avg completion and struggle rates
- **6-section report export** — PDF (Anthropic-style cover), DOCX, Excel. Sections: Behavior Analysis, Risk Assessment, Content Optimization, Cohort Comparison, **Analysis History** (table + matplotlib trend chart), Overview & Recommended Actions. Filenames include course slug + noise label.

</details>

<details>
<summary><strong>🎯 Curriculum Agent — Agentic Curriculum Optimization</strong></summary>

- **Three-layer HITL design** — suggestions are classified into three action tiers based on signal severity and change scope:
  - **Layer 1 — Objectives (AI applies directly)**: amber badge; one-click Apply writes updated learning objectives + reduces complexity_level; before/after confirmation modal; Redo restores original
  - **Layer 2 — References (human-triggered search)**: violet badge; "Search References" button fires a Tavily query against module objectives, returns deduplicated candidates (domain-level dedup vs existing readings); professor selects and adds references directly to `recommended_readings`
  - **Layer 3 — Assignments (AI alert only)**: blue badge; read-only info box summarizing what changed and what the professor should manually review; no Apply button — professor decides
- **Professor Notification Bar** — persistent amber bar on CoursePage alerts professors when suggestions are available, with "Dismiss" and "Review →" buttons
- **Professor Slide-out Drawer** — clicking "Review" opens a 400px drawer with Pending Suggestions (Apply/Search) and Applied Changes (Redo) sections grouped by layer badge
- **Student Notification Bar** — blue bar shows "N modules updated — based on instructor optimization" with Dismiss and Review buttons
- **Student Slide-out Drawer** — clicking "Review" opens a blue-themed drawer listing updated modules with "Go to Module" navigation buttons
- **Draggable Floating Action Button (FAB)** — after dismissing either banner, a draggable floating ball (🤖 amber / ✨ blue) appears at bottom-right; click opens the drawer directly without restoring the banner; hover reveals ✕ to permanently dismiss; supports free-drag to any screen position
- **Auto-analyze on generation** — every new course triggers a background structural analysis immediately after save; generates all three change_type entries so suggestions are ready without waiting for an xAPI run
- **Redo (Undo Apply)** — applied changes store original module data as backup; clicking "Redo" restores the module to its pre-apply state and moves the suggestion back to Pending
- **Module Flags** — `module_flags` table stores flagged modules with signal sources, flag levels (yellow / orange), and detailed metrics
- **Change Log** — `change_log` table records all recommendations with `change_type` (objective_update / reference_suggestion / assignment_alert), status tracking (pending → applied → dismissed), and backup_data for redo
- **Analytics redirect** — "View Full Analytics →" in the professor drawer navigates to the Student Data analytics page

</details>

<details>
<summary><strong>📦 Export Formats</strong></summary>

- **IMS Common Cartridge (.imscc)** for LMS integration (Canvas, Moodle, D2L).
- **PDF, DOCX, and Markdown** with dynamically formatted citations (APA/MLA/Chicago).

</details>

## 🏗️ Architecture

**System Architecture**

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│  Frontend (React + TypeScript + Vite)                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌─────────┐ ┌──────────┐ ┌────────┐│
│  │ Generate  │ │ Courses  │ │  Course  │ │ Knowledge │ │ Student │ │ Student  │ │Settings││
│  │   Page    │ │   Page   │ │   Page   │ │   Graph   │ │  Data   │ │ Profile  │ │ (Prof) ││
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘ └────┬────┘ └────┬─────┘ └───┬────┘│
│       │            │            │              │            │           │            │     │
│  components/ui/  components/generate/    components/analytics/  ModelSelection (shared)   │
│  (Select, Input)   (SyllabusUpload)   (TrendChart, ReportSections, ...)                   │
│                             GraphViewer (2D KG + mastery overlay)                          │
│                                              SSE streaming                                 │
└───────┼────────────┼────────────┼──────────────┼────────────┼───────────┼────────────┼─────┘
        │            │            │              │            │           │            │
        ▼            ▼            ▼              ▼            ▼           ▼            ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│  Backend (Flask + Blueprints)                                                              │
│  ├── app.py (~30 lines, routing)         ├── config.py (18 models + env constants)        │
│  ├── extensions.py (Global instances)    ├── async_loop.py (Event loop)                   │
│  ├──────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  routes/                                                                              │  │
│  │  ├── curriculum.py           generate / skeleton / expand / save                      │  │
│  │  ├── curriculum_agent_routes flags / suggestions / apply / redo                       │  │
│  │  ├── history.py              CRUD + favorite + DOCX export                            │  │
│  │  ├── analytics.py            A2A SSE + history API + export                           │  │
│  │  ├── xapi.py                 xAPI statements + mock data seed                         │  │
│  │  ├── feedback.py             Student sentiment + comments                             │  │
│  │  ├── profile.py              Profile CRUD + model_config + Fernet API keys            │  │
│  │  ├── settings.py             Professor settings (preferences, models, prompts)        │  │
│  │  ├── graph.py                KG data + RAG query + /courses lookup                    │  │
│  │  ├── annotations.py          KG concept annotations + aggregation                     │  │
│  │  ├── sources.py              Tavily source preview                                    │  │
│  │  ├── syllabus.py             PDF/DOCX parse + import                                  │  │
│  │  └── materials.py            LightRAG ingest                                          │  │
│  └──────────────────────────────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────┐  ┌──────────────────────────────────────────┐   │
│  │  agents/ (Hive-style A2A)   │  │  services/                               │   │
│  │  ├── base.py (BaseNode)     │  │  ├── research.py (Tavily)                │   │
│  │  ├── orchestrator.py        │  │  ├── file_parser.py                      │   │
│  │  ├── behavior_analyst.py    │  │  ├── prompt_builder.py                   │   │
│  │  ├── risk_detector.py       │  │  ├── xapi_generator.py (⚡ aware)        │   │
│  │  ├── content_optimizer.py   │  │  ├── student_diagnosis.py (diagnosis)    │   │
│  │  ├── cohort_comparator.py   │  │  ├── report_exporter.py (facade)         │   │
│  │  ├── kg_context_analyst.py  │  │  ├── chart_generator.py (+history)       │   │
│  │  └── curriculum_agent.py    │  │  ├── ltm_writer.py (Cold layer)          │   │
│  │       SharedMemory (Redis)  │  │  ├── threshold_checker.py                │   │
│  └──────────┬──────────────────┘  │  ├── kg_mapper.py (3-layer match)        │   │
│             │                     │  └── export_{pdf,docx,excel}.py          │   │
│             │                     └──────────────┬───────────────────────────┘   │
└─────────────┼────────────────────────────────────┼──────────────────────────────┘
              │                                    │
              ▼                                    ▼
┌───────────────────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────────┐
│  PostgreSQL            │  │  Redis   │  │   LightRAG   │  │  data/ltm/   │
│  ├── curricula         │  │ (🔴 Hot: │  │  GraphML KG  │  │  (🔵 Cold:   │
│  ├── xapi_statements   │  │  pipeline│  │  (Hot Layer) │  │   .md YAML   │
│  ├── student_profiles  │  │  runtime)│  │              │  │   snapshots) │
│  ├── concept_          │  │          │  │              │  │              │
│  │   annotations       │  │          │  │              │  │              │
│  └── 🟡 Warm:          │  │          │  │              │  │              │
│      snapshots/mastery │  │          │  │              │  │              │
└───────────────────────┘  └──────────┘  └──────────────┘  └──────────────┘
```

**Full Project Pipeline**

<img src="docs/Full project pipeline.png" alt="Full Project Pipeline" width="800"/>

**LTM 3-Layer Architecture**

<img src="docs/3-layer LTM.png" alt="LTM 3-Layer Architecture" width="800"/>

**Full Agentic Loop**

<img src="docs/Full agentic loop.png" alt="Full Agentic Loop" width="800"/>

📐 **Full architecture, page-by-page data flows, database schema, red lines, and project structure → [ARCHITECTURE.md](ARCHITECTURE.md)**

---

## 🛠️ Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **Frontend** | React + TypeScript + Vite | Module editor, A2A dashboard, SSE client, drag-and-drop |
| **Backend** | Python + Flask Blueprints | Modular route-based API (10 Blueprints + 6 Agents + 6 Services) |
| **AI** | OpenAI GPT-4o / Google Gemini | Content generation & A2A analysis (via `AI_PROVIDER`); A2A agents are sql-only — **zero LLM cost** for analytics |
| **Research Agent** | Tavily Search API | Pre-generation academic source retrieval |
| **Database** | PostgreSQL | Curricula, xAPI statements, student feedback, `course_analysis_snapshots` (LTM) |
| **Cache & Memory**| Redis | Graph query cache, learner state, A2A shared memory (`a2a:{session}:{key}`) |
| **Knowledge Graph**| LightRAG + networkx + react-force-graph-2d| Course material ingestion → interactive concept graph |
| **Behavior Data** | xAPI 1.0.3 + mini-LRS | Statement ingestion → mock data engine (4 noise levels) → professor analytics panel |
| **Analytics Engine**| A2A multi-agent (Hive-style, sql-only Phase 1) | 5-node pipeline: Orchestrator + 4 parallel agents; token tracking; LTM snapshot |
| **Report Export** | ReportLab + python-docx + openpyxl + matplotlib | PDF (Anthropic-style cover), DOCX, Excel; filenames include course slug + noise label |
| **Curriculum Export** | IMS Common Cartridge + DOCX + PDF + Markdown | LMS-compatible output in multiple formats |
| **Dev** | Docker Compose | Single-command local environment (frontend :5173, backend :5000) |

---

## 🚀 Quick Start

**Prerequisites:** Docker, an OpenAI or Gemini API key, a Tavily API key (free tier at tavily.com)

```bash
git clone https://github.com/Schlaflied/Plot-Ark
cd Plot-Ark

cp .env.example .env
# Set AI_PROVIDER=openai or AI_PROVIDER=gemini
# Add the corresponding API key + TAVILY_API_KEY

docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:5000 |

---

## 🕸️ Using the Knowledge Graph

The knowledge graph feature lets you ingest your own course materials (PDFs, PPTXs, or DOCXs) and explore them as an interactive concept map.

1. Go to the **Knowledge Graph** tab
2. In the **Upload Materials** panel on the right, fill in:
   - **Subject name** (required) — e.g. "Organizational Behavior"
   - **Course code** (optional) — e.g. "ADMS 2400"
   - **Year** (required) — which year of study this course belongs to
3. Drop your PDF / PPTX / DOCX files into the dropzone
4. Click **Build Graph** — ingestion runs in the background (~$0.10–0.30 per 10 PDFs at gpt-4o-mini rates)
5. Once complete, the graph appears automatically under the correct year and course tab

---

## 🗺️ Roadmap

- [x] KG ↔ Curriculum concept mapping — 3-layer matching (word-boundary + abbreviation + reverse lookup)
- [x] Knowledge Map tab — per-module KG concepts with definitions + cross-module dependencies
- [x] Concept mastery tracking — xAPI verb + feedback → `cohort_concept_mastery`; auto-sync after every analysis run
- [x] GraphViewer mastery overlay — fill = mastery level, border = knowledge layer; unified gray for untracked concepts
- [x] KG bidirectional annotation — students mark confused/important; professors mark exam focus; anonymous aggregation feeds confusion heatmap
- [x] KG → Agentic Loop — `KGContextAnalystNode` injects per-concept confusion % + top confused concepts into CurriculumAgent context
- [x] GraphViewer role-split — student view (mastery filters + confusion social signal) vs professor view (high confusion heatmap + exam focus)
- [x] xAPI ↔ KG bridge — KG annotation events mirror to xAPI statements (verb: flagged / noted); full signal unification
- [x] Student Profile — 4-tab profile with avatar, discipline selector (5 disciplines), CP/OC narrative anchors, and progress color blocks
- [x] One-sentence diagnosis — template-driven concept-gap guidance with "Jump to Module" navigation
- [x] AI Settings — custom prompt instructions + clickable ideas library with auto-save
- [x] Multi-persona sets — multiple character groups with relationship tags, gender, personality descriptions, linked courses
- [x] Multi-model Agent Team — 18 preset models across 9 providers + custom model support; ★ recommended tags, ⚠ MoE warnings, dynamic API keys
- [x] Professor Settings Portal — profile, academic preferences, model defaults, prompt templates; all with auto-save
- [x] Per-provider API keys — Fernet-encrypted storage, dynamic detection, masked GET responses
- [ ] Professor prompt template editor — DB-backed prompt management with version control and variable highlighting
- [ ] Assignment Timeline + Due Date calculator
- [ ] A2A Phase 2 — LLM integration for CurriculumAgent (dense model required); other agents remain sql-only
- [ ] Progressive summarization — semester-level LTM summaries for LLM context management
- [ ] LTI 1.3 — push into Canvas / Moodle

---

## 📄 License

GNU Affero General Public License v3.0 — see [LICENSE](LICENSE)

- Free for personal use, research, and open-source projects
- Modifications must be open-sourced under the same license
- Network deployment requires your product to also be open-source
- Commercial licensing — open a GitHub Issue

---

## Featured In

- 🌟 [Awesome-AI-Agents](https://github.com/Jenqyang/Awesome-AI-Agents) — agentic EdTech curriculum engine

---

## ⭐ Star History

<a href="https://www.star-history.com/#Schlaflied/Plot-Ark&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Schlaflied/Plot-Ark&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=Schlaflied/Plot-Ark&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=Schlaflied/Plot-Ark&type=Date" />
 </picture>
</a>

---

## 🙏 Acknowledgements

Architectural inspiration from [Hive](https://github.com/aden-hive/hive) (YC-backed AI agent infrastructure) — the node pipeline, shared memory, and evolution loop patterns informed the agentic curriculum engine design.

Knowledge graph layer powered by [LightRAG](https://github.com/HKUDS/LightRAG) (HKUDS) — incremental knowledge graph construction and prerequisite inference across course materials.

Two-phase generation pipeline design inspired by [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) (Tsinghua University) — the outline-first, then expand pattern informed Plot Ark's curriculum skeleton generation approach.

Built with [Claude](https://claude.ai) (Anthropic) as AI pair programmer.

Special thanks to the two chief quality assurance officers who supervised every late-night coding session — **Icy** (冰糖, white) and **雪梨** (calico):

<p align="center">
  <img src="docs/cats.jpg" alt="Icy and 雪梨 — Chief QA Officers" width="400"/>
</p>

---

<div align="center">

[Report Bug](https://github.com/Schlaflied/Plot-Ark/issues) · [Request Feature](https://github.com/Schlaflied/Plot-Ark/issues)

**Star this repo if it's useful.**

</div>
