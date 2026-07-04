[English](ARCHITECTURE.md) | [中文](ARCHITECTURE.zh.md)

# Plot Ark Architecture

> This document is organized by **what the user sees**, not by technical layer. Every page section answers three questions: what appears on screen → which endpoint feeds it → which table or agent computes it. For the product story and quick start, see the [README](README.md).

---

## Stack

| Layer | Technology | Port |
|-------|-----------|------|
| **Frontend** | React + TypeScript + Vite | 5173 |
| **Backend** | Python 3.11 + Flask Blueprints | 5000 |
| **Database** | PostgreSQL | 5432 |
| **Cache / Shared Memory** | Redis | 6380 |
| **Knowledge Graph** | LightRAG (embedded, GraphML) | — |
| **Orchestration** | Docker Compose | — |

Identity: the frontend stores the login email in localStorage (`AuthContext`) and sends it as an `X-User-Email` header. Student-facing endpoints trust this header (demo-grade auth — LTI 1.3 JWT is the planned replacement). Routes are role-guarded: `/generate`, `/student-data`, `/settings` are professor-only; `/profile` is student-only.

---

## Two Portals, Page by Page

### 🎓 Instructor Portal

#### GeneratePage (`/generate`)

| What you see | Endpoint | Behind it |
|---|---|---|
| Syllabus upload → form auto-fill | `POST /api/syllabus/import` | `file_parser.py` extracts topic / code / level / module count from PDF/DOCX |
| Source review panel (approve/reject before generation) | `POST /api/sources/preview` | `research.py` — Tavily multi-type queries (academic / video / news) + credibility scoring. Human-in-the-loop: nothing enters the prompt without approval |
| Streaming course generation | `POST /api/curriculum/generate` (SSE) | Two-phase: skeleton → per-module expand. `prompt_builder.py` renders prompts from DB templates (professor's `custom_instructions` injected); Bloom's mapping, i+1 progression, and cognitive-load caps enforced in the prompt + post-validation |
| Course saved → suggestions ready immediately | save → auto-analyze | `curriculum_agent_routes.auto_analyze_course()` runs a structural analysis in the background and writes `change_log` entries, so the CoursePage drawer has content before any xAPI run |

#### CoursesPage (`/courses`)

| What you see | Endpoint | Behind it |
|---|---|---|
| Course dashboard cards + favorites | `GET /api/history` | `curricula` table CRUD (`history.py`) |

#### CoursePage (`/course/:id`)

| What you see | Endpoint | Behind it |
|---|---|---|
| Module editor (3 tabs, drag-reorder, inline edit) | `GET/PUT /api/history/<id>` | `curricula.modules` JSONB |
| Amber notification bar + slide-out Curriculum Drawer | `GET /api/curriculum/flags`, `GET /api/curriculum/suggestions` | `module_flags` + `change_log` tables; flags come from `threshold_checker.py` (single-agent signal = yellow badge, two-agent compound = orange + modal) |
| Three-layer HITL suggestions | `POST /api/curriculum/apply`, `/redo`, `/references/search`, `/references/apply` | L1 Objectives: AI applies directly with before/after preview + redo backup. L2 References: professor-triggered Tavily search. L3 Assignments: read-only alert, professor decides |
| Student view: four-button feedback per module | `POST /api/feedback` | `student_feedback` table + Redis real-time cache (`feedback:<course>:<module>`) |
| Student view: one-sentence diagnosis card | `GET /api/profile/diagnosis/<course_id>` | `student_diagnosis.py` — template-driven, warm tone, zero numbers (red line R1/R5) |
| Student view: blue "modules updated" bar + drawer | `GET /api/curriculum/changes/<course_id>` | `change_log` filtered to applied entries |
| Exports | client jsPDF / `POST /api/curriculum/export/*` | PDF, DOCX, Markdown, IMS Common Cartridge |

#### StudentDataPage (`/student-data`) — A2A Analytics Dashboard

| What you see | Endpoint | Behind it |
|---|---|---|
| Noise selector + seed button | `POST /api/xapi/seed` | `xapi_generator.py` — 4 noise levels, 6-week realistic timestamps, profile spread; curriculum-aware (reads `change_log`, simulates post-optimization improvement) |
| Live agent progress + report sections | `POST /api/analytics/report` (SSE) | The 6-agent pipeline (see below); PII anonymised before agents run, restored only in the final professor report |
| Trend chart (at-risk % over time) | analytics history API | `course_analysis_snapshots` (Warm LTM) |
| Report export | `POST /api/analytics/export/{pdf,docx,excel}` | ReportLab (Anthropic-style cover) / python-docx / openpyxl; matplotlib charts embedded |

#### SettingsPage (`/settings`)

| What you see | Endpoint | Behind it |
|---|---|---|
| Profile, academic preferences, model defaults | `GET/PUT /api/settings` | Professor settings row; AmberSelect design system; 600ms debounced auto-save |
| Prompt template editor (3 slots) | `GET/PUT /api/prompts` | `prompt_templates` table — `custom_instructions` per slot (generate / skeleton / expand), injected by `prompt_builder.py` at render time. Prompts are hot-editable without code changes |

### 🪞 Student Portal

#### GraphPage (`/graph`)

| What you see | Endpoint | Behind it |
|---|---|---|
| Force-directed knowledge graph | `GET /api/graph/*` | LightRAG GraphML per course; `networkx` + `react-force-graph-2d` |
| Fill = mastery, border = knowledge layer | `GET /api/mastery/all` (or per course) | `cohort_concept_mastery` — derived by `mastery_tracker.py` from xAPI verbs × four-button feedback, auto-synced after every analysis run |
| **"Mastery / My footprint" fill toggle** (student role) | `GET /api/selfview/footprint/<course_id>` | Student's own xAPI rows → per-module visits/revisits → projected onto KG concepts via `kg_mapper.py`. Amber heat scaled to the student's own max — never to classmates |
| Concept annotations (confused / important / exam focus) | `POST /api/kg/annotate` | `concept_annotations` table; anonymous aggregation feeds the professor confusion heatmap and mirrors to xAPI statements |
| Natural-language graph query | `POST /api/graph/query` | LightRAG query, Redis-cached |
| Material ingestion panel | `POST /api/materials/ingest` | PDF/PPTX/DOCX → LightRAG → GraphML (background, dedicated event loop in `async_loop.py`) |

#### StudentProfilePage (`/profile`) — 4 tabs

| Tab | What you see | Endpoint | Behind it |
|---|---|---|---|
| Profile | Avatar, display name | `GET/PUT /api/profile` | `student_profiles` table, 800ms debounced auto-save |
| Customized Learning | Discipline, CP/OC persona sets, custom AI instructions | same `PUT /api/profile` | `persona_sets` / `custom_prompt` columns — semantic anchors for future LLM explanations |
| My Progress | **My Courses flip cards** (front: name + mastery dots; back: labeled M1–Mn bars; keyword search incl. module titles) | `GET /api/profile/courses` | Enrollment = three-source UNION: feedback ∪ annotations ∪ **xAPI activity** (course id parsed from `object_id`) |
| My Progress | **Learning Rhythm** 7×24 heatmap + pattern sentence | `GET /api/selfview/rhythm/<course_id>` | Pure SQL `dow × hour` aggregation of the student's own statements. Shades compare only against their own busiest hour |
| My Progress | **Look Back card** — appears only on click | `POST /api/selfview/retrospect/<course_id>` | Template pattern statements (revisit / rhythm peak / breadth / trend), idempotent per ISO week, persisted to `selfview_snapshots` |
| My Progress | "Sounds like me / Not quite" verdict buttons | `POST /api/selfview/verdict` | Owner-checked, revotable; verdicts are the system's only ground-truth signal, reserved for future personalization |
| AI Settings | Agent Team model selection (18 presets × 9 providers + custom), per-provider API keys | `GET /api/profile/models`, `PUT /api/profile` | `model_config` JSONB; Fernet-encrypted keys, masked on GET; ★ dense-recommended and ⚠ MoE warnings enforced in UI |

---

## A2A Multi-Agent Pipeline (6 agents, all sql-only)

```
POST /api/analytics/report (SSE)
        │
        ▼
 OrchestratorNode
        │ ① anonymise PII (Student_001..N ↔ real identities)
        │ ② dispatch, one SSE event per agent
        ▼
 BehaviorAnalyst ─► RiskDetector ─► ContentOptimizer ─► CohortComparator
 verb/module        6 signals       under/over-        4 groups
 engagement         med≥4 hi≥7      performing         (high / average /
                    inactivity      modules             at-risk / disengaged)
                    14/21 days
        │ ③ threshold_checker: 1 agent flags = yellow · 2 agents = orange
        ▼
 KGContextAnalyst ──► CurriculumAgent
 slim KG context      reads Cold LTM history (data/ltm/*.md),
 for flagged          separates structural issues (3+ consecutive
 modules only         flagged runs) from one-off anomalies,
                      writes recommendations → change_log
        │ ④ de-anonymise for professor report · ⑤ save snapshots
        ▼
 course_analysis_snapshots (Warm) + data/ltm/*.md (Cold) + report JSON
```

Every agent inherits `BaseNode` (Hive reflexion pattern: try → L3 JSON Schema judge → retry ×3 → SQL fallback) and communicates through Redis SharedMemory (`a2a:{session_id}:{key}`, TTL 1h, local-dict fallback).

```python
@dataclass
class NodeResult:
    status: str          # "success" | "fallback" | "error"
    data: dict
    agent_name: str
    duration_ms: int
    retries_used: int
    error: Optional[str]
    tokens_in: int       # all 0 in Phase 1 (sql-only) — ready for LLM phase
    tokens_out: int
    tokens_cache_read: int
    tokens_cache_write: int
```

**Phase status:** all 6 agents run sql-only today. The LLM plumbing (per-role model config, encrypted keys, DB prompt templates) is fully built and waiting for the LLM integration sprint.

---

## LTM — Two Tracks, One Data Source

The same xAPI stream deposits memory on both sides of the platform:

| | Instructor track — "how is the course doing" | Student track — "how am I doing" |
|---|---|---|
| **Hot** | Redis SharedMemory (pipeline runtime, TTL 1h) | — |
| **Warm** | `course_analysis_snapshots` (per analysis run) | `selfview_snapshots` (per Look Back, per ISO week) |
| **Cold** | `data/ltm/{course_id}_{date}.md` (YAML frontmatter; CurriculumAgent reads the last 10 to detect recurring issues) | — |

The student track deliberately stores **only what cannot be recomputed** from raw xAPI: the pattern statements that were shown, and the student's verdicts on them. Footprint and rhythm are recomputed live.

---

## Database Schema

```
curricula
  id, topic, level, audience, course_code, course_type,
  module_count, modules (JSONB), sources (JSONB),
  is_favorite, created_at

xapi_statements
  id, actor_email, actor_name, verb, object_id, object_name,
  timestamp, curriculum_topic
  indexes: actor_email, verb, object_id, curriculum_topic, timestamp
  note: course linkage is parsed from object_id ('course/N/...')

student_feedback
  id, course_id, module_index, module_title, sentiment,
  comment, student_id, created_at
  index: course_id

student_profiles
  id, email, display_name, preferred_style, persona_sets (JSONB),
  avatar_url, discipline, custom_prompt, model_config (JSONB),
  created_at, updated_at

cohort_concept_mastery
  course_id, module_id, concept, mastery_level,
  valid_from / valid_to (time-windowed)

module_flags / change_log
  flags: module_id, flag_level (yellow/orange), signal sources, metrics
  change_log: change_type (objective_update / reference_suggestion /
  assignment_alert), status (pending → applied → dismissed), backup_data

selfview_snapshots                 ← student-side LTM (mirror layer)
  id, email, course_id, period (ISO week),
  rhythm_summary (JSONB), footprint_summary (JSONB),
  statements_shown (JSONB), verdicts (JSONB)
  index: email, course_id, created_at DESC
  Never readable from any instructor endpoint.

course_analysis_snapshots          ← instructor-side Warm LTM
  id, course_id, run_at, noise_label,
  risk_distribution (JSONB), total_students, at_risk_count, high_risk_count,
  top_signals (JSONB), module_engagement_summary (JSONB),
  verb_distribution (JSONB), cohort_groups (JSONB)
  index: course_id, run_at DESC
```

---

## Key Backend Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/curriculum/generate` | SSE: skeleton → expand (two-phase) |
| `POST` | `/api/sources/preview` | Tavily research + credibility score |
| `GET`  | `/api/history` | Curricula CRUD |
| `POST` | `/api/syllabus/import` | PDF/DOCX → form auto-fill |
| `POST` | `/api/xapi/seed` | Generate mock xAPI data (noise level param) |
| `POST` | `/api/analytics/report` | SSE: run the 6-agent A2A pipeline |
| `POST` | `/api/analytics/export/{pdf,docx,excel}` | Report export |
| `GET`  | `/api/curriculum/flags` / `suggestions` | Module flags + HITL suggestions |
| `POST` | `/api/curriculum/apply` / `redo` | Apply / undo a suggestion (with backup) |
| `POST` | `/api/graph/query` | LightRAG NL query (Redis-cached) |
| `POST` | `/api/materials/ingest` | LightRAG PDF/PPTX/DOCX ingestion |
| `POST` | `/api/kg/annotate` | Student/professor concept annotations |
| `GET`  | `/api/mastery/<course_id>` · `/api/mastery/all` | Concept mastery map |
| `GET/PUT` | `/api/profile` · `/api/settings` · `/api/prompts` | Student profile / professor settings / prompt templates |
| `GET`  | `/api/profile/courses` | Student's enrolled courses (feedback ∪ annotations ∪ xAPI) |
| `GET`  | `/api/selfview/footprint/<course_id>` | Own attention footprint + KG concept projection (X-User-Email) |
| `GET`  | `/api/selfview/rhythm/<course_id>` | Own 7×24 study-rhythm matrix (X-User-Email) |
| `GET`  | `/api/selfview/students/<course_id>` | Demo helper: mock students with statement counts |
| `POST` | `/api/selfview/retrospect/<course_id>` | On-demand Look Back card, idempotent per ISO week |
| `POST` | `/api/selfview/verdict` | "Sounds like me / Not quite" verdict (owner-checked) |

---

## Red Lines (product soul — enforced in code)

1. **No numeric scores, rankings, or class comparisons** are ever shown to a student. Performance data (mastery) renders as colors only; the diagnosis engine speaks in "might help / could try" tone.
2. **Behavioral data is different from performance data**: a student may see their own rhythm, footprint, and revisit counts — but the comparison baseline is always their own past, never other students.
3. **The mirror speaks only when asked**: the Look Back card does not exist until the student clicks. No ambient judgment.
4. **The mirror can be vetoed**: every pattern statement carries "Sounds like me / Not quite". The student is the final interpretive authority; their verdicts are stored as ground truth.
5. **Privacy wall**: `selfview_snapshots` and student profiles are unreadable from every instructor endpoint. Professors see cohort aggregates; students see themselves.
6. **No AI detection, ever.** The question is "did learning happen?", not "did you use AI?".

---

## Pedagogical Engine

- **Bloom's Taxonomy mapping** — course code (e.g. ACCT 301) → cognitive level (Remember → Create)
- **i+1 difficulty progression** — `complexity_level` validated to increase across modules
- **Cognitive Load constraints** — max 2 readings per module, each with explicit rationale
- **Human-in-the-loop** — Tavily sources approved before generation; every curriculum change previewed before apply

---

## AI Integration

- **OpenAI GPT-4o / GPT-4o-mini** — content generation (`AI_PROVIDER=openai`)
- **Google Gemini 2.5 Flash** — alternative provider (`AI_PROVIDER=gemini`)
- **18 preset models × 9 providers** + custom OpenAI-compatible endpoints — per-role Agent Team (Explainer / Fact Checker / Style Adapter)
- **Tavily Search API** — pre-generation academic source retrieval
- **LightRAG** (HKUDS, MIT) — knowledge graph construction and NL query

---

## Export Formats

| Output | Library | Notes |
|--------|---------|-------|
| PDF (analytics) | ReportLab | Anthropic-style cover; matplotlib charts embedded |
| DOCX (analytics) | python-docx | Matching layout to PDF |
| Excel | openpyxl | Raw data sheets per section |
| PDF (curriculum) | jsPDF (client-side) | Readings inline, References section |
| DOCX (curriculum) | python-docx | Same structure as curriculum PDF |
| IMS Common Cartridge | Python zip | Direct import to Canvas / Moodle / D2L |
| Markdown | Plain text | Full curriculum with readings and assignments |

---

## Project Structure

```
plot-ark/
├── docker-compose.yml
├── docs/                                ← Demo GIFs + architecture diagrams
│
├── backend/                             ← Flask (modular Blueprints)
│   ├── app.py                           ← Entry point (registers Blueprints)
│   ├── config.py                        ← 18 preset models + env constants
│   ├── extensions.py                    ← Global singletons (Flask, AI, Redis)
│   ├── async_loop.py                    ← Background event loop (LightRAG)
│   ├── db.py                            ← PostgreSQL ops + table creation
│   ├── constants.py                     ← Bloom's taxonomy, formats
│   ├── routes/
│   │   ├── curriculum.py                ← generate / skeleton / expand / save
│   │   ├── curriculum_agent_routes.py   ← flags / suggestions / apply / redo / references
│   │   ├── history.py                   ← curricula CRUD + favorite + export
│   │   ├── analytics.py                 ← A2A SSE + history + export
│   │   ├── xapi.py                      ← xAPI statements + mock seed
│   │   ├── feedback.py                  ← four-button sentiment + comments
│   │   ├── profile.py                   ← student profile + model_config + courses
│   │   ├── selfview.py                  ← 🪞 footprint / rhythm / retrospect / verdict
│   │   ├── settings.py                  ← professor settings portal
│   │   ├── prompts.py                   ← DB prompt template editor (3 slots)
│   │   ├── mastery.py                   ← concept mastery map + sync
│   │   ├── graph.py                     ← KG data + RAG query
│   │   ├── annotations.py               ← KG concept annotations
│   │   ├── sources.py                   ← Tavily source preview
│   │   ├── syllabus.py                  ← PDF/DOCX parse + import
│   │   └── materials.py                 ← LightRAG ingest
│   ├── agents/                          ← Hive-style A2A (all sql-only)
│   │   ├── base.py                      ← BaseNode + SharedMemory + NodeResult
│   │   ├── orchestrator.py              ← coordinator + SSE + anonymisation
│   │   ├── behavior_analyst.py          ├── risk_detector.py
│   │   ├── content_optimizer.py         ├── cohort_comparator.py
│   │   ├── kg_context_analyst.py        ← KG ↔ CurriculumAgent bridge
│   │   └── curriculum_agent.py          ← Cold-LTM trend analysis → recommendations
│   └── services/
│       ├── research.py                  ← Tavily + credibility scoring
│       ├── prompt_builder.py            ← prompts from DB templates
│       ├── xapi_generator.py            ← mock data engine (curriculum-aware)
│       ├── kg_mapper.py                 ← KG ↔ module concept mapping
│       ├── mastery_tracker.py           ← xAPI × feedback → mastery
│       ├── threshold_checker.py         ← yellow/orange compound flags
│       ├── student_diagnosis.py         ← warm one-sentence diagnosis
│       ├── ltm_writer.py                ← Cold LTM .md snapshots
│       ├── lightrag_service.py          ├── file_parser.py
│       ├── report_exporter.py           ├── chart_generator.py
│       └── export_{pdf,docx,excel}.py
│
├── frontend/                            ← React + TypeScript + Vite
│   ├── App.tsx                          ← Router (role-guarded routes)
│   ├── context/AuthContext.tsx          ← email + role → X-User-Email header
│   ├── pages/
│   │   ├── GeneratePage.tsx             ← course generation (professor)
│   │   ├── CoursesPage.tsx              ← dashboard
│   │   ├── CoursePage.tsx               ← module editor + drawers + feedback
│   │   ├── StudentDataPage.tsx          ← A2A analytics dashboard (professor)
│   │   ├── SettingsPage.tsx             ← professor settings (professor)
│   │   ├── GraphPage.tsx                ← knowledge graph
│   │   ├── StudentProfilePage.tsx       ← 🪞 4-tab profile + mirror layer (student)
│   │   └── LoginPage.tsx
│   ├── components/
│   │   ├── GraphViewer.tsx              ← force graph + mastery/footprint fill toggle
│   │   ├── ModelSelection.tsx           ← Agent Team card (18 presets + custom)
│   │   ├── ModuleCard.tsx / ModuleSidebar.tsx
│   │   ├── IngestPanel.tsx / QueryPanel.tsx / NodeDetailPanel.tsx
│   │   ├── GraphToolbar.tsx / CourseBanner.tsx / YearSidebar.tsx
│   │   ├── ui/
│   │   │   ├── AmberSelect.tsx          ← THE dropdown (site-wide standard)
│   │   │   ├── Input.tsx / Select.tsx / DraggableFab.tsx / ToolbarDropdown.tsx
│   │   ├── analytics/                   ← ReportSections, TrendChart, drawers, flags
│   │   ├── dashboard/                   ← CourseCard, MiniCalendar
│   │   └── generate/                    ← SyllabusUpload, SourceReview, SkeletonReview
│   └── hooks/                           ← useIngest, useQuery, useCourseManager
│
└── data/
    ├── ltm/                             ← Cold LTM .md snapshots (instructor track)
    ├── materials/                       ← course PDFs/PPTXs (gitignored)
    └── lightrag_storage*/               ← KG data (gitignored, regenerable)
```
