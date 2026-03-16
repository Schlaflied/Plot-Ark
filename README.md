# Plot Ark — Curriculum Engine

**AI-powered narrative curriculum design for higher education.**

Plot Ark generates comprehensive, pedagogically grounded course modules using evidence-based instructional design principles — Bloom's Taxonomy, Krashen's i+1 difficulty scaffolding, and Cognitive Load Theory (Sweller). Built for instructors who want AI as a starting point, not a final answer.

Live demo: [plot-ark.com](https://plot-ark.com)

---

## What it does

- Generate full curriculum outlines from a topic, level, audience, and course type
- Each module includes learning objectives (Bloom's-aligned), a narrative hook, recommended readings with pedagogical rationale, and assessments
- Difficulty progression across modules (complexity 1→5) following i+1 principles
- Inline editing — instructors can modify every field, reorder modules via drag-and-drop, and export their final version
- Export as Markdown or IMS Common Cartridge (.imscc) for direct LMS import (Canvas, Moodle, D2L)
- Streamed generation via SSE so you see content as it's built

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript + Vite |
| Backend | Python + Flask + SSE |
| AI | Google Gemini API |
| Infrastructure | Docker Compose |
| Export | IMS Common Cartridge, Markdown |
| Planned | xAPI + LRS, Redis learner state, LightRAG knowledge graph, PostgreSQL + Apache AGE |

---

## Local Development

**Prerequisites:** Docker, a Gemini API key

```bash
git clone https://github.com/Schlaflied/Plot-Ark.git
cd Plot-Ark
cp .env.example .env
# Add your GEMINI_API_KEY to .env
docker compose up --build
```

Frontend: `localhost:5173`
Backend: `localhost:5000`

---

## Architecture

```
frontend/          React app (Vite + TypeScript)
  App.tsx          Main UI — form, module cards, citations, export
  components/      Scene and diagram components

backend/           Flask API
  app.py           SSE streaming endpoint, Bloom's mapping, prompt engine

docker-compose.yml frontend + backend + redis (learner state layer, roadmap)
```

---

## Roadmap

- [ ] PostgreSQL history — persist generated curricula across sessions
- [ ] Professor LTM — learn preferences from edit history (diff-based)
- [ ] xAPI integration — track learner behavior events
- [ ] LightRAG + PostgreSQL/AGE — knowledge graph from uploaded textbooks
- [ ] LTI 1.3 — push directly into Canvas / Moodle
- [ ] Multilingual support — concept bridging in learner's native language

---

## Acknowledgements

Built with architectural inspiration from [Hive](https://github.com/aden-hive/hive) (YC-backed AI agent infrastructure) — particularly the node pipeline, shared memory, and evolution loop patterns that inform the agentic curriculum engine design.

AI pair programming by [Claude](https://claude.ai) (Anthropic).

---

## License

GNU Affero General Public License v3.0 — see [LICENSE](LICENSE)

This means: free to use, modify, and distribute, but any modified version deployed as a network service must also be open source under AGPL-3.0.
