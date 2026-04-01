# Plot Ark Architecture

## Stack
- **Frontend**: React + TypeScript + Vite, `frontend/`, port 5173
- **Backend**: Flask + SSE, `backend/app.py`, port 5000
- **Database**: PostgreSQL (plotark/plotark), port 5432
- **Cache**: Redis, port 6380
- **Docker**: frontend, backend, redis, postgres

## Frontend Structure
```
frontend/
├── App.tsx          — 路由文件（26行，#23完成后）
├── types.ts         — 共享类型
├── pages/
│   ├── GeneratePage.tsx   — 课程生成主页面（/generate）
│   ├── CoursesPage.tsx    — 课程历史 (/courses)
│   ├── CoursePage.tsx     — 课程编辑器 (/course/:id)
│   └── GraphPage.tsx      — 知识图谱 (/graph)
└── components/
    ├── GraphViewer.tsx    — LightRAG力导向图
    ├── QuantumScene.tsx   — 3D装饰
    └── Diagrams.tsx       — 图表组件
```

## Key Backend Endpoints
- `POST /api/curriculum/generate` — SSE流式生成（两阶段：skeleton→expand）
- `POST /api/sources/preview` — Tavily research + 人工审核
- `GET /api/history` — 课程历史
- `POST /api/syllabus/import` — PDF/DOCX syllabus解析
- `POST /api/graph/query` — LightRAG知识图谱查询（Redis缓存）
- `POST /api/xapi/statement` — xAPI学习追踪

## Database Tables
- `curricula` — 课程数据（modules/sources存JSONB）
- `xapi_statements` — 学习者行为日志

## AI Integration
- OpenAI GPT-4o-mini (主要生成)
- Google Gemini 2.5 flash (可选)
- Tavily (research agent)
- LightRAG (知识图谱，HKU开源)

## Pedagogical Engine
- Bloom's Taxonomy mapping（按课程代码自动映射认知层级）
- i+1 difficulty progression（模块复杂度递进验证）
- Human-in-the-loop（Tavily源审核）

## Roadmap Priority
1. #23 Multi-page routing（进行中）→ 解锁R18
2. R17 AI免责声明（上线前必须）
3. R18 BYOK Settings页面（依赖#23）
4. #11 Assignment Timeline
