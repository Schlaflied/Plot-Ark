# Plot Ark — Agentic Curriculum Engine

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![GitHub stars](https://img.shields.io/github/stars/Schlaflied/Plot-Ark?style=social)](https://github.com/Schlaflied/Plot-Ark/stargazers)

<p align="center">
  <img src="Logo_Agentic.png" alt="Plot Ark Logo" width="200"/>
</p>

**An open-source agentic curriculum engine that generates pedagogically grounded course content through narrative frameworks.**

> Unlike static AI course generators, Plot Ark applies evidence-based instructional design principles — Bloom's Taxonomy, Krashen's i+1 difficulty scaffolding, and Cognitive Load Theory — so the curriculum it generates is structured the way learning actually works.

---

## Features

<details>
<summary><strong>Curriculum Generation</strong></summary>

- **Bloom's Taxonomy alignment** — course code (e.g. ACCT 301) automatically maps to the correct cognitive level (Remember → Create)
- **i+1 difficulty progression** — complexity_level increases across modules so each one builds on the last
- **Cognitive Load constraints** — max 2 readings per module, each with explicit pedagogical rationale
- **Course typology** — project-based, essay, debate/roleplay, lab/simulation, or mixed assessment formats
- **SSE streaming** — content streams token-by-token as it's generated

</details>

<details>
<summary><strong>Module Editor</strong></summary>

- **Single-card navigation** — left/right arrows through modules, or click the sidebar index
- **Drag-and-drop reordering** — restructure the sequence without regenerating
- **Inline editing** — edit every field across all three tabs (Objectives, Resources, Assessment)
- **Add / remove items** — learning objectives, readings, assignments all editable
- **LocalStorage persistence** — edits survive page refresh

</details>

<details>
<summary><strong>Export</strong></summary>

- **IMS Common Cartridge (.imscc)** — direct import into Canvas, Moodle, D2L
- **Markdown export** — full curriculum with readings and assignments as a .md file
- **Copy to clipboard** — paste into any editor

</details>

<details>
<summary><strong>Agentic Layer (Roadmap)</strong></summary>

- **xAPI event collection** — fine-grained learner behavior (watched, skipped, struggled)
- **Redis learner state** — real-time profile (mastered / struggling / recommended_next)
- **LightRAG + PostgreSQL/AGE** — knowledge graph built from uploaded textbooks, prerequisite inference
- **Professor LTM** — system learns instructor preferences from edit history (diff-based, no surveys)
- **Multilingual concept bridging** — explain in learner's native language, preserve English terminology

</details>

---

## Architecture

```
Parameters (topic, level, course_code, course_type, module_count)
        ↓
Curriculum Agent — Bloom's mapping, i+1 scaffolding, cognitive load rules
        ↓
Gemini API — streaming JSON generation (SSE)
        ↓
Module Editor — instructor edits, reorders, approves
        ↓
Export — .imscc / .md → LMS
```

**Planned agentic loop:**
```
xAPI behavior events → Curriculum Agent → Redis learner state → Narrative Engine → LMS
```

---

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **Frontend** | React + TypeScript + Vite | Module editor, SSE client, drag-and-drop |
| **Backend** | Python + Flask + SSE | Streaming curriculum generation |
| **AI** | Google Gemini API | Content generation |
| **Cache** | Redis | Learner state (roadmap) |
| **Knowledge Graph** | LightRAG + PostgreSQL + Apache AGE | Prerequisite inference (roadmap) |
| **Behavior Data** | xAPI + LRS | Learner event stream (roadmap) |
| **Export** | IMS Common Cartridge | LMS-compatible output |
| **Dev** | Docker Compose | Single-command local environment |

---

## Quick Start

**Prerequisites:** Docker, a Gemini API key

```bash
git clone https://github.com/Schlaflied/Plot-Ark.git
cd Plot-Ark

cp .env.example .env
# Add your GEMINI_API_KEY to .env

docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:5000 |

---

## Project Structure

```
plot-ark/
├── docker-compose.yml
├── .env.example
├── frontend/                  ← React + TypeScript + Vite
│   ├── Dockerfile
│   ├── App.tsx                ← Main UI
│   ├── components/
│   └── vite.config.ts
└── backend/                   ← Flask
    ├── Dockerfile
    └── app.py                 ← SSE endpoint, Bloom's mapping, prompt engine
```

---

## Roadmap

- [x] Flask SSE streaming backend
- [x] React frontend with module card navigation
- [x] Docker Compose dev environment
- [x] Bloom's Taxonomy course code mapping
- [x] i+1 difficulty progression
- [x] Inline module editing (all fields)
- [x] Drag-and-drop module reordering
- [x] IMS Common Cartridge + Markdown export
- [ ] PostgreSQL history — persist curricula across sessions
- [ ] xAPI statement ingestion
- [ ] Redis learner state management
- [ ] LightRAG + PostgreSQL/AGE knowledge graph
- [ ] Professor LTM — preference learning from edit history
- [ ] LTI 1.3 — push into Canvas / Moodle

---

## License

GNU Affero General Public License v3.0 — see [LICENSE](LICENSE)

- Free for personal use, research, and open-source projects
- Modifications must be open-sourced under the same license
- Network deployment requires your product to also be open-source
- Commercial licensing — open a GitHub Issue

---

## Acknowledgements

Architectural inspiration from [Hive](https://github.com/aden-hive/hive) (YC-backed AI agent infrastructure) — the node pipeline, shared memory, and evolution loop patterns informed the agentic curriculum engine design.

Knowledge graph layer powered by [LightRAG](https://github.com/HKUDS/LightRAG) (HKUDS) — incremental knowledge graph construction and prerequisite inference across course materials.

Built with [Claude](https://claude.ai) (Anthropic) as AI pair programmer.

---

<div align="center">

[Report Bug](https://github.com/Schlaflied/Plot-Ark/issues) · [Request Feature](https://github.com/Schlaflied/Plot-Ark/issues)

**Star this repo if it's useful.**

</div>
