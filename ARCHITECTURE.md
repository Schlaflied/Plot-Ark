# Plot Ark Architecture

## Stack

| Layer | Technology | Port |
|-------|-----------|------|
| **Frontend** | React + TypeScript + Vite | 5173 |
| **Backend** | Python 3.11 + Flask Blueprints | 5000 |
| **Database** | PostgreSQL | 5432 |
| **Cache / Shared Memory** | Redis | 6380 |
| **Knowledge Graph** | LightRAG (embedded) | — |
| **Orchestration** | Docker Compose | — |

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Frontend (React + TypeScript + Vite, :5173)                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌───────────────┐  │
│  │ Generate  │ │ Courses  │ │  Course  │ │ Knowledge │ │ Student Data  │  │
│  │   Page    │ │   Page   │ │   Page   │ │   Graph   │ │    Page       │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘ └──────┬────────┘  │
│       │            │            │              │              │           │
│  components/ui/  components/generate/    hooks/ (useIngest, useQuery)    │
│  (Select, Input)   (SyllabusUpload)             SSE streaming            │
└───────┼────────────┼────────────┼──────────────┼──────────────┼──────────┘
        │            │            │              │              │
        ▼            ▼            ▼              ▼              ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  Backend (Flask + Blueprints, :5000)                                       │
│  ├── app.py (~30 lines)            ├── config.py (env constants)           │
│  ├── extensions.py (singletons)    ├── async_loop.py (bg event loop)       │
│  ├── db.py (PostgreSQL ops)        ├── constants.py (Bloom's, formats)     │
│  ├─────────────────────────────────────────────────────────────────────┐   │
│  │  routes/                                                            │   │
│  │  ├── curriculum.py    generate / skeleton / expand / save           │   │
│  │  ├── history.py       CRUD + favorite + DOCX export                 │   │
│  │  ├── analytics.py     A2A SSE analysis + PDF/DOCX/Excel export      │   │
│  │  ├── xapi.py          xAPI statements + mock data seed              │   │
│  │  ├── graph.py         KG data + RAG query                           │   │
│  │  ├── sources.py       Tavily source preview                         │   │
│  │  ├── syllabus.py      PDF/DOCX parse + import                       │   │
│  │  └── materials.py     LightRAG ingest                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────┐  ┌────────────────────────────────────┐   │
│  │  agents/ (Hive-style A2A)   │  │  services/                         │   │
│  │  ├── base.py (BaseNode)     │  │  ├── research.py (Tavily)          │   │
│  │  ├── orchestrator.py        │  │  ├── file_parser.py                │   │
│  │  ├── behavior_analyst.py    │  │  ├── prompt_builder.py             │   │
│  │  ├── risk_detector.py       │  │  ├── xapi_generator.py             │   │
│  │  ├── content_optimizer.py   │  │  ├── report_exporter.py (facade)   │   │
│  │  └── cohort_comparator.py   │  │  ├── chart_generator.py            │   │
│  └──────────┬──────────────────┘  │  └── export_{pdf,docx,excel}.py    │   │
│             │  SharedMemory       └─────────────┬──────────────────────┘   │
└─────────────┼───────────────────────────────────┼──────────────────────────┘
              │                                   │
              ▼                                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  PostgreSQL  │  │    Redis     │  │   LightRAG   │
│  curricula   │  │  cache +     │  │  KG storage  │
│  xapi_stmts  │  │  shared mem  │  │              │
│  snapshots   │  │  (a2a:*)     │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## A2A Multi-Agent Analytics Pipeline

```
Frontend (noise selector: 5/10/15/20% + seed button)
        │
        ├─── POST /api/xapi/seed ──► xapi_generator.py
        │                            (HOUR_WEIGHTS, profile spread,
        │                             realistic 6-week timestamps)
        │
        └─── POST /api/analytics/report (SSE stream)
                        │
                        ▼
               OrchestratorNode
                        │
               ① anonymise PII
               (Student_001..N ↔ real names/emails)
                        │
               ② dispatch (sequential, SSE per agent)
                        │
          ┌─────────────┼─────────────┬─────────────┐
          ▼             ▼             ▼             ▼
   BehaviorAnalyst  RiskDetector  ContentOptimizer  CohortComparator
   verb/module      6 signals     underperforming   4 groups
   engagement       med≥4 hi≥7    & high-perf       (high_performers /
                    inactivity:   modules            average /
                    14/21 days                       at_risk /
                                                     disengaged)
          │             │             │             │
          └─────────────┴─────────────┴─────────────┘
                        │
               ③ anonymise agent outputs
                        │
               ④ aggregate
               (de-anonymise at_risk_students,
                build token_summary,
                executive_summary)
                        │
               ⑤ _save_snapshot()
                        │
          ┌─────────────┴──────────────────┐
          ▼                                ▼
course_analysis_snapshots           final report JSON
(PostgreSQL LTM)                    → SSE "report done"
  risk_distribution                 → PDF / DOCX / Excel
  module_engagement_summary           (Anthropic-style cover,
  verb_distribution                    course slug + noise label
  cohort_groups                        in filename)
  noise_label
  at_risk_count / high_risk_count
```

**Post-pipeline agents (not shown above):** KGContextAnalyst injects a slim KG context for flagged modules, then CurriculumAgent reads Cold LTM history (`data/ltm/*.md`) to separate structural issues from one-off anomalies — full chain: BA → RD → CO → CC → KGContextAnalyst → CurriculumAgent.

**Student Self-View (Mirror) layer:** `routes/selfview.py` serves each student their own xAPI-derived footprint (per-module visits/revisits projected onto KG concepts via `kg_mapper`) and 7×24 study rhythm. Personal endpoints filter strictly by the student's own `actor_email`; no class averages, rankings, or mastery scores are ever returned. Rendered as a GraphViewer fill layer ("My footprint") and a rhythm heatmap card on the Student Profile page.

**Phase status:** All 6 agents are currently `sql-only`. Token fields in `NodeResult` are ready for Phase 2 LLM integration — `tokens_in / tokens_out / tokens_cache_read / tokens_cache_write`.

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

student_feedback
  id, course_id, module_index, module_title, sentiment,
  comment, student_id, created_at
  index: course_id

course_analysis_snapshots          ← LTM warm layer
  id, course_id, run_at, noise_label,
  risk_distribution (JSONB), total_students, at_risk_count, high_risk_count,
  top_signals (JSONB), module_engagement_summary (JSONB),
  verb_distribution (JSONB), cohort_groups (JSONB)
  index: course_id, run_at DESC
```

---

## BaseNode / NodeResult

```python
@dataclass
class NodeResult:
    status: str          # "success" | "fallback" | "error"
    data: dict
    agent_name: str
    duration_ms: int
    retries_used: int
    error: Optional[str]
    tokens_in: int       # 0 in Phase 1 (sql-only)
    tokens_out: int
    tokens_cache_read: int
    tokens_cache_write: int
```

`BaseNode.execute()` implements the Hive reflexion pattern:
`try → L3 JSON Schema judge → retry (max 3) → SQL fallback`

SharedMemory keys use namespace `a2a:{session_id}:{key}` in Redis (TTL 1h), with local dict fallback when Redis is unavailable.

---

## Key Backend Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/curriculum/generate` | SSE: skeleton → expand (two-phase) |
| `POST` | `/api/sources/preview` | Tavily research + credibility score |
| `GET`  | `/api/history` | Curricula CRUD |
| `POST` | `/api/syllabus/import` | PDF/DOCX → form auto-fill |
| `POST` | `/api/xapi/seed` | Generate mock xAPI data (noise level param) |
| `GET`  | `/api/analytics/report` | SSE: run A2A pipeline for course_id |
| `POST` | `/api/analytics/export/pdf` | ReportLab PDF (Anthropic-style cover) |
| `POST` | `/api/analytics/export/docx` | python-docx report |
| `POST` | `/api/analytics/export/excel` | openpyxl spreadsheet |
| `POST` | `/api/graph/query` | LightRAG NL query (Redis-cached) |
| `POST` | `/api/materials/ingest` | LightRAG PDF/PPTX/DOCX ingestion |
| `GET`  | `/api/selfview/footprint/<course_id>` | Student's own attention footprint: per-module visits/revisits/verbs + KG concept projection (X-User-Email) |
| `GET`  | `/api/selfview/rhythm/<course_id>` | Student's own 7×24 study-rhythm matrix (X-User-Email) |
| `GET`  | `/api/selfview/students/<course_id>` | Demo helper: list mock students with statement counts |

---

## AI Integration

- **OpenAI GPT-4o-mini** — primary content generation (via `AI_PROVIDER=openai`)
- **Google Gemini 2.5 Flash** — alternative (via `AI_PROVIDER=gemini`)
- **Tavily Search API** — pre-generation academic source retrieval
- **LightRAG** (HKUDS, MIT) — knowledge graph construction and NL query

---

## Pedagogical Engine

- **Bloom's Taxonomy mapping** — course code (e.g. ACCT 301) → cognitive level (Remember → Create)
- **i+1 difficulty progression** — `complexity_level` validated to increase across modules
- **Cognitive Load constraints** — max 2 readings per module, each with explicit rationale
- **Human-in-the-loop** — Tavily sources reviewed and approved/rejected before generation

---

## Export Formats

| Output | Library | Notes |
|--------|---------|-------|
| PDF (analytics) | ReportLab | Anthropic-style cover: left-aligned brand line, large title, HRFlowable, 4-col metadata table; matplotlib charts embedded |
| DOCX (analytics) | python-docx | Matching layout to PDF; charts as images |
| Excel | openpyxl | Raw data sheets per section |
| PDF (curriculum) | jsPDF (client-side) | Readings inline per module, References section |
| DOCX (curriculum) | python-docx | Same structure as curriculum PDF |
| IMS Common Cartridge | Python zip | Direct import to Canvas / Moodle / D2L |
| Markdown | Plain text | Full curriculum with readings and assignments |
