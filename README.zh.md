[English](README.md) | 中文

# Plot Ark — 主动式课程引擎

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
  👉 <a href="https://schlaflied.github.io/Plot-Ark/">访问精美的互动式官方主页</a> 👈
</h3>

**一款开源主动式课程引擎，通过叙事框架生成基于教学理论的课程内容。**

> 与静态 AI 课程生成器不同，Plot Ark 将循证教学设计原则落地于实践——布鲁姆认知分类法、Krashen 的 i+1 难度递进、以及认知负荷理论——确保生成的课程结构符合真实学习规律。

> **主动式流水线** — Tavily 研究 Agent 优先检索真实学术来源，再将经验证的 URL 注入生成提示词。不会出现幻觉引用。

> **多 AI 提供商** — 通过单个环境变量在 OpenAI（GPT-4o-mini）和 Google Gemini 之间自由切换，自带 API Key 即可使用。

---

## 🎬 演示

**课程生成 (Course generation)** — 主动式信源检索、大纲导入与交互式模块调整

![Course generation](docs/Course%20generation.gif)

**生成过程中的 AI 建议 (AI suggestion)** — 将 AI 助教与教学建议直接嵌入课程编辑器

![AI suggestion within course generation](docs/AI%20suggestion%20within%20course%20generation.gif)

**带四按钮的学生面板 (Student panel)** — 每模块情绪收集，数据回流到分析闭环

![Student panel with four buttons](docs/Student%20panel%20with%20four%20buttons.gif)

**xAPI 学生数据分析 (Data analysis)** — 5 节点 A2A 分析流水线，模拟并检测学习者预警风险

![xAPI student data analysis](docs/xAPI%20student%20data%20analysis.gif)

**课程 Agent 与 xAPI 重演 (Curriculum agent & xAPI rerun)** — 基于学习者数据的、人在回路的模块内容优化

![Curriculum agent & xAPI rerun](docs/Curriculum%20agent%20%26%20xAPI%20rerun.gif)

▶ [完整演示视频（Google Drive）](https://drive.google.com/file/d/14SLOJFImW9TqyyXipJL1wumkptir7WuU/view?usp=sharing)

▶ [xAPI + A2A 分析演示视频（Google Drive）](https://drive.google.com/file/d/1CVrWfrJ1gGUDf-VD1E9p443-7DKJs5MM/view?usp=drive_link)

---

## ✨ 功能特性

<details>
<summary><strong>🧠 课程生成与编辑</strong></summary>

- **主动式信源检索** — Tavily Agent 优先检索学术、视频及新闻资源，确保引用真实有效。
- **教学理论约束** — 严格对齐布鲁姆认知分类法，执行 i+1 难度递进与认知负荷限制。
- **交互式大纲导入** — 自动解析 PDF/DOCX 大纲元数据与必读材料。
- **SSE 流式传输与内联编辑** — 内容逐 token 加载，支持全量拖拽排序与实时内联文字编辑。

</details>

<details>
<summary><strong>🕸️ 知识图谱 (LightRAG)</strong></summary>

- **材料摄入** — 拖拽上传 PDF/PPTX 自动在后台构建交互式力导向图谱。
- **多级课程维系** — 学年分类、课程 Pill 导航与动态的学科标签页管理。
- **RAG 知识查询** — 对图谱进行自然语言问答，带持久化 Redis 缓存与对应节点高亮。

</details>

<details>
<summary><strong>🤖 A2A 多 Agent 分析与课程 Agent</strong></summary>

- **5 节点 Hive 架构** — 协调器统领 BehaviorAnalyst、RiskDetector、ContentOptimizer 及 CohortComparator。
- **课程感知的 xAPI 数据** — 真实的学习行为仿真，自动感知并适应最近被优化的课程模块。
- **三层 LTM 架构** — Hot 层（Redis）、Warm 层（PostgreSQL 快照）以及 Cold 层（版本化 Markdown YAML）。
- **人在回路的课程优化** — Curriculum Agent 动态推送模块改进建议，支持全量还原 (Undo) 历史追踪。
- **多维报告生成** — 导出包含风险检测与历史趋势图的 PDF/DOCX/Excel 专业图表报告。

</details>

<details>
<summary><strong>📦 导出格式</strong></summary>

- **IMS Common Cartridge (.imscc)** 无缝对接主流 LMS (Canvas, Moodle, D2L)。
- **PDF、DOCX 及 Markdown** 并支持自适应引用格式切换 (APA/MLA/Chicago)。

</details>

## 🧭 设计理念

大多数 EdTech AI 工具将人工智能视为需要监控的威胁——检测学生是否使用了 AI，标记"非原创"作品，强制要求原创性。

Plot Ark 持完全相反的立场。

**AI 是认知工具，不是威胁。** 一个用 AI 起草答案、然后真正理解它、完善它、并能用自己的语言解释它的学生——这个学生学到了东西。不加理解地复制粘贴，是学生在欺骗自己，而不是需要被系统惩罚的问题。

Plot Ark 没有 AI 检测机制，也永远不会有。它问的不是"你用了 AI 吗？"，而是"学习发生了吗？"——并通过布鲁姆认知分类法对齐、i+1 难度递进和 xAPI 学习行为追踪来回答这个问题。

课程引擎本身也遵循同样的逻辑：AI 生成结构，教学理论约束输出，教师始终掌握最终决策权。工具负责思考；人负责决定。

Anthropic 经济指数报告（2026年1月）发现，prompt 复杂度与回复复杂度之间的相关系数 r = 0.925 —— 你投入的思考越深，它给出的回应越深。

---

## 🏗️ 架构

**系统架构**

```
┌────────────────────────────────────────────────────────────────────────────┐
│  前端 (React + TypeScript + Vite)                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌───────────────┐  │
│  │ Generate  │ │ Courses  │ │  Course  │ │ Knowledge │ │ Student Data  │  │
│  │   Page    │ │   Page   │ │   Page   │ │   Graph   │ │    Page       │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘ └──────┬────────┘  │
│       │            │            │              │              │           │
│  components/ui/  components/generate/    components/analytics/           │
│  (Select, Input)   (SyllabusUpload)   (TrendChart, ReportSections, ...)  │
│                                              SSE 流式传输               │
└───────┼────────────┼────────────┼──────────────┼──────────────┼──────────┘
        │            │            │              │              │
        ▼            ▼            ▼              ▼              ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  后端 (Flask + Blueprints)                                                 │
│  ├── app.py (~30 行，仅路由)             ├── config.py (仅环境常量)        │
│  ├── extensions.py (单例：AI、Redis 等)  ├── async_loop.py (后台异步循环)  │
│  ├─────────────────────────────────────────────────────────────────────┐   │
│  │  routes/                                                            │   │
│  │  ├── curriculum.py           生成 / 验架 / 展开 / 保存                 │   │
│  │  ├── curriculum_agent_routes 标记 / 建议 / 应用 / 撤销 / 变更      │   │
│  │  ├── history.py              CRUD + 收藏 + DOCX 导出                 │   │
│  │  ├── analytics.py            A2A SSE 分析 + PDF/DOCX/Excel 导出     │   │
│  │  ├── xapi.py                 xAPI 语句 + Mock 数据种子              │   │
│  │  ├── feedback.py             学生情绪反馈 + 评论收集                │   │
│  │  ├── graph.py                知识图谱 + RAG 查询                     │   │
│  │  ├── sources.py              Tavily 源预览                           │   │
│  │  ├── syllabus.py             PDF/DOCX 解析 + 导入                    │   │
│  │  └── materials.py            LightRAG 材料摄入                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────┐  ┌────────────────────────────────────┐   │
│  │  agents/ (Hive 风格 A2A)    │  │  services/                         │   │
│  │  ├── base.py (BaseNode)     │  │  ├── research.py (Tavily)          │   │
│  │  ├── orchestrator.py        │  │  ├── file_parser.py                │   │
│  │  ├── behavior_analyst.py    │  │  ├── prompt_builder.py             │   │
│  │  ├── risk_detector.py       │  │  ├── xapi_generator.py (⚡ aware)  │   │
│  │  ├── content_optimizer.py   │  │  ├── report_exporter.py (facade)   │   │
│  │  ├── cohort_comparator.py   │  │  ├── chart_generator.py (+history) │   │
│  │  └── curriculum_agent.py    │  │  ├── ltm_writer.py (Cold layer)    │   │
│  │       SharedMemory          │  │  ├── threshold_checker.py           │   │
│  └──────────┬──────────────────┘  │  └── export_{pdf,docx,excel}.py    │   │
│             │                     └─────────────┬──────────────────────┘   │
└─────────────┼───────────────────────────────────┼──────────────────────────┘
              │                                   │
              ▼                                   ▼
┌───────────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  PostgreSQL       │  │    Redis     │  │   LightRAG   │  │  data/ltm/   │
│  (curricula       │  │  (🔴 Hot:    │  │   (KG data)  │  │  (🔵 Cold:   │
│  + xapi           │  │   pipeline   │  │              │  │   .md YAML   │
│  + 🟡 Warm:       │  │   runtime)   │  │              │  │   snapshots) │
│  snapshots)       │  │              │  │              │  │              │
└───────────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

**LTM（长期记忆）三层架构**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     LTM 三层架构                                        │
├──────────────────┬───────────────────┬──────────────────────────────────┤
│  🔴 Hot 层       │  🟡 Warm 层        │  🔵 Cold 层                      │
│  Redis           │  PostgreSQL        │  data/ltm/*.md                   │
│                  │                   │                                  │
│  • 流水线         │  • course_analysis_│  • YAML frontmatter              │
│    运行时状态     │    snapshots 表   │    (course_code, topic,          │
│  • SSE 流式传输   │  • 每次运行指标   │     curriculum_version)          │
│  • Token 用量    │  • at_risk_count  │  • 模块表现汇总表                │
│  • TTL 自动       │  • completion rates│  • 已应用变更日志               │
│    过期           │  • verb_distribution│  • 🤖 Agent vs 👤 Prof 追踪    │
│                  │  • 历史趋势        │  • 每日版本化：_v{N}             │
│                  │    图表数据源      │  • 永不删除                     │
└──────────────────┴───────────────────┴──────────────────────────────────┘
```

**课程生成流水线**

<img src="docs/Course generation.png" alt="Course Generation Pipeline" width="800"/>

**RAG 与知识图谱导入**

<img src="docs/RAG flowchart.png" alt="RAG & Knowledge Graph Ingestion" width="800"/>

**A2A 多 Agent 分析架构**

<img src="docs/A2A%20agent%20Structure.png" alt="A2A 多 Agent 分析架构" width="800"/>

**A2A 分析流水线**

![A2A Analytics Pipeline](docs/A2A%20Analytics%20Pipeline.png)

**主动式循环：**
```
xAPI 事件 → A2A 评估 → LTM（Hot+Warm+Cold）→ Curriculum Agent → 教授人在回路 → Apply → ⚡ 课程感知重新种子 → A2A 重新评估（改善后数据）→ 更新 LTM
```

---

## 🛠️ 技术栈

| 层级 | 技术 | 职责 |
|------|------|------|
| **前端** | React + TypeScript + Vite | 模块编辑器、A2A 仪表板、SSE 客户端、拖拽排序 |
| **后端** | Python + Flask Blueprints | 模块化路由 API（8 个 Blueprints + 6 个 Agents + 5 个 Services） |
| **AI** | OpenAI GPT-4o / Google Gemini | 内容生成与 A2A 分析（通过 `AI_PROVIDER` 可插拔） |
| **研究 Agent** | Tavily Search API | 生成前学术信源检索 |
| **数据库** | PostgreSQL | 课程、xAPI 语句、学生反馈、`course_analysis_snapshots`（LTM） |
| **缓存与内存**| Redis | 图谱查询缓存、学习者状态、A2A 共享内存（`a2a:{session}:{key}`） |
| **知识图谱** | LightRAG + networkx + react-force-graph-2d| 课程材料导入 → 交互式概念图谱 |
| **行为数据** | xAPI 1.0.3 + mini-LRS | 语句采集 → Mock 数据引擎（4 种噪声级别）→ 教授分析面板 |
| **分析引擎** | A2A 多 Agent（Hive 风格，sql-only Phase 1） | 5 节点流水线：Orchestrator + 4 个并行 Agent；Token 追踪；LTM 快照 |
| **报告导出** | ReportLab + python-docx + openpyxl + matplotlib | PDF（Anthropic 风格封面）、DOCX、Excel；文件名含课程 slug + 噪声标签 |
| **课程导出** | IMS Common Cartridge + DOCX + PDF + Markdown | 多格式兼容主流 LMS 的输出 |
| **开发** | Docker Compose | 一键启动本地环境（前端 :5173，后端 :5000） |

---

## 🚀 快速开始

**前置条件：** Docker、OpenAI 或 Gemini API Key、Tavily API Key（tavily.com 免费层）

```bash
git clone https://github.com/Schlaflied/Plot-Ark.git
cd Plot-Ark

cp .env.example .env
# 设置 AI_PROVIDER=openai 或 AI_PROVIDER=gemini
# 填入对应的 API Key + TAVILY_API_KEY

docker compose up --build
```

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:5173 |
| 后端 | http://localhost:5000 |


---

## 📁 项目结构

```
plot-ark/
├── docker-compose.yml
├── .env.example
├── docs/
│   ├── Course generation.gif                    ← 演示: 主动式课程生成、大纲导入与模块排序
│   ├── AI suggestion within course generation.gif ← 演示: 课程编辑器中的 AI 助教建议
│   ├── Student panel with four buttons.gif      ← 演示: 每模块学情情绪收集反馈
│   ├── xAPI student data analysis.gif           ← 演示: 5 节点多 Agent 数据分析流水线
│   └── Curriculum agent & xAPI rerun.gif        ← 演示: 人在回路的课程内容动态优化闭环
│
├── backend/                             ← Flask（模块化 Blueprints）
│   ├── app.py                           ← 入口文件（~30 行，注册 Blueprints）
│   ├── config.py                        ← 纯环境常量与配置变量
│   ├── extensions.py                    ← 全局单例服务（Flask app、AI 客户端、Redis）
│   ├── async_loop.py                    ← 后台事件异步循环管理器
│   ├── db.py                            ← PostgreSQL 操作
│   ├── constants.py                     ← Bloom's 分类、会话约束、评估格式
│   ├── routes/
│   │   ├── curriculum.py                ← /api/curriculum/*（生成、验架、展开、保存）
│   │   ├── curriculum_agent_routes.py   ← /api/curriculum/ 标记、建议、应用、撤销、变更
│   │   ├── history.py                   ← /api/history/* + /api/curriculum/export/docx
│   │   ├── sources.py                   ← Tavily 源预览
│   │   ├── graph.py                     ← 知识图谱 + RAG 查询
│   │   ├── xapi.py                      ← xAPI 语句 + 种子生成器
│   │   ├── analytics.py                 ← A2A SSE 分析 + 导出接口
│   │   ├── feedback.py                  ← 学生情绪反馈收集
│   │   ├── syllabus.py                  ← PDF/DOCX 解析 + 导入
│   │   └── materials.py                 ← LightRAG 材料摄入
│   ├── agents/
│   │   ├── base.py                      ← BaseNode + SharedMemory + NodeResult
│   │   ├── orchestrator.py              ← 多 Agent 协调器（含 SSE）
│   │   ├── behavior_analyst.py          ← xAPI 动词/模块参与度分析
│   │   ├── risk_detector.py             ← 多信号风险评分
│   │   ├── content_optimizer.py         ← 模块表现交叉分析
│   │   ├── cohort_comparator.py         ← 学生群组对比
│   │   └── curriculum_agent.py          ← AI 驱动的课程优化 Agent
│   ├── services/
│   │   ├── research.py                  ← Tavily 搜索 + 可信度评分
│   │   ├── file_parser.py               ← PDF/PPTX/DOCX 文本提取
│   │   ├── prompt_builder.py            ← 集中组装的 AI Prompt 模板
│   │   ├── lightrag_service.py          ← LightRAG 实例管理
│   │   ├── xapi_generator.py            ← Mock xAPI 数据 + 噪声注入
│   │   ├── ltm_writer.py                ← LTM (course_analysis_snapshots) 存档读取/写入
│   │   ├── threshold_checker.py         ← 解析 agent 评估多级门限值
│   │   ├── report_exporter.py           ← 用于报告生成的薄调度 Facade
│   │   ├── chart_generator.py           ← Matplotlib 数据可视化与品牌颜色
│   │   ├── export_pdf.py                ← ReportLab PDF 绘制逻辑
│   │   ├── export_docx.py               ← python-docx Word 文档生成
│   │   └── export_excel.py              ← openpyxl Excel 表格生成
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/                            ← React + TypeScript + Vite
│   ├── App.tsx                          ← 路由注册（React Router v7）
│   ├── pages/
│   │   ├── GeneratePage.tsx             ← 课程生成表单
│   │   ├── CoursePage.tsx               ← 模块编辑器 + 导出
│   │   ├── CoursesPage.tsx              ← 课程仪表板
│   │   ├── GraphPage.tsx                ← 知识图谱查看器
│   │   └── StudentDataPage.tsx          ← A2A 多 Agent 分析仪表板
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Select.tsx               ← 可复用下拉选择
│   │   │   ├── Input.tsx                ← 可复用文本输入框
│   │   │   ├── DraggableFab.tsx         ← 可拖拽悬浮球（教授/学生通用）
│   │   │   └── ToolbarDropdown.tsx      ← 工具栏图标下拉菜单
│   │   ├── dashboard/
│   │   │   ├── CourseCard.tsx            ← 课程卡片、特殊功能卡片、新建卡片
│   │   │   └── MiniCalendar.tsx          ← 紧凑月历小组件
│   │   ├── generate/
│   │   │   ├── SyllabusUpload.tsx       ← 拖拽上传大纲解析
│   │   │   ├── SourceReview.tsx         ← 审核 Tavily 检索的学术信源
│   │   │   └── SkeletonReview.tsx       ← 审核课程模块骨架
│   │   ├── analytics/
│   │   │   ├── ReportSections.tsx       ← A2A 分析报告的展示组件
│   │   │   ├── TrendChart.tsx           ← SVG 趋势图（迷你 + 全屏 Modal）
│   │   │   ├── CurriculumApplyModal.tsx ← AI 建议应用确认弹窗
│   │   │   ├── CurriculumDrawer.tsx     ← 教授端滑出抽屉（Apply / Redo）
│   │   │   ├── StudentChangesDrawer.tsx ← 学生端滑出抽屉（Go to Module）
│   │   │   ├── AISuggestionsSection.tsx ← AI 专属建议详情展示区块
│   │   │   ├── FlagBadge.tsx            ← 模块预警状态红色/琥珀色徽章
│   │   │   └── FlagModal.tsx            ← 详细预警说明与信号来源模态框
│   │   ├── ModuleCard.tsx               ← 拆分的单个课程模块卡片
│   │   ├── ModuleSidebar.tsx            ← 课程模块侧边导航栏
│   │   ├── GraphViewer.tsx              ← 核心力导向图渲染
│   │   ├── GraphToolbar.tsx             ← 学科标签页、节点/课程搜索
│   │   ├── CourseBanner.tsx             ← 课程药丸、拖拽、内联重命名
│   │   ├── NodeDetailPanel.tsx          ← 节点详情悬浮面板
│   │   ├── IngestPanel.tsx              ← 文件上传与 LightRAG 摄入逻辑
│   │   ├── QueryPanel.tsx               ← RAG 查询输入与历史记录
│   │   ├── YearSidebar.tsx              ← 学年 1-4 侧边导航
│   │   └── Diagrams.tsx                 ← Mermaid 图表组件
│   ├── hooks/
│   │   ├── useIngest.ts                 ← 上传轮询逻辑与状态
│   │   ├── useQuery.ts                  ← RAG 问答逻辑与历史状态
│   │   └── useCourseManager.ts          ← 课程 CRUD 与持久化
│   ├── constants/
│   │   ├── theme.ts                     ← GraphViewer 共享 UI 常量
│   │   └── formOptions.ts               ← LEVELS, COURSE_TYPES, SESSION_DURATIONS
│   ├── Dockerfile
│   └── vite.config.ts
│
└── data/
    ├── materials/                       ← 课程 PDF/PPTX（已 gitignore）
    ├── ltm/                             ← LTM Cold 层 .md 快照（版本化 YAML）
    └── lightrag_storage*/               ← 知识图谱数据（已 gitignore，可重新生成）
```

---

## 🗺️ 路线图

- [ ] 作业时间轴 + 截止日期计算器
- [ ] A2A Phase 2 — 为四个专业 Agent 集成 LLM 分析能力
- [ ] 渐进式摘要 — 学期级 LTM 摘要用于 LLM 上下文管理
- [ ] Professor LTM — 从编辑历史学习偏好
- [ ] LTI 1.3 — 推送至 Canvas / Moodle

---

## 📄 许可证

GNU Affero 通用公共许可证 v3.0 — 详见 [LICENSE](LICENSE)

- 个人使用、学术研究及开源项目免费
- 修改版本必须以相同许可证开源
- 网络部署要求你的产品同样开源
- 商业授权 — 请提交 GitHub Issue 联系

---

## 收录

- 🌟 [Awesome-AI-Agents](https://github.com/Jenqyang/Awesome-AI-Agents) — 主动式 EdTech 课程引擎

---

## ⭐ Star 历史

<a href="https://www.star-history.com/?repos=Schlaflied%2FPlot-Ark&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=Schlaflied/Plot-Ark&type=date&theme=dark&legend=top-left&v=2" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=Schlaflied/Plot-Ark&type=date&legend=top-left&v=2" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=Schlaflied/Plot-Ark&type=date&legend=top-left&v=2" />
 </picture>
</a>

---

## 🙏 致谢

架构灵感来源于 [Hive](https://github.com/aden-hive/hive)（YC 投资的 AI Agent 基础设施）——节点流水线、共享记忆与进化循环模式为主动式课程引擎的设计提供了重要参考。

知识图谱层由 [LightRAG](https://github.com/HKUDS/LightRAG)（HKUDS）驱动——实现跨课程材料的增量知识图谱构建与前置知识推断。

两阶段生成流水线设计灵感来源于 [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC)（清华大学）——先生成大纲骨架、再逐模块展开的模式为 Plot Ark 的课程骨架生成方法提供了参考。

以 [Claude](https://claude.ai)（Anthropic）为 AI 结对编程伙伴构建完成。

特别感谢两位首席质量保证官，全程监督每一个深夜 coding session —— **Icy**（冰糖，白猫）与**雪梨**（三花猫）：

<p align="center">
  <img src="docs/cats.jpg" alt="Icy 冰糖与雪梨 — 首席质量保证官" width="400"/>
</p>

---

<div align="center">

[报告 Bug](https://github.com/Schlaflied/Plot-Ark/issues) · [请求功能](https://github.com/Schlaflied/Plot-Ark/issues)

**如果这个项目对你有用，请给个 Star。**

</div>
