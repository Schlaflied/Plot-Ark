[English](README.md) | 中文

# Plot Ark — 生成 · 追踪 · 优化

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

**一款开源主动式平台，完整覆盖课程闭环：基于教学理论生成课程内容、通过 xAPI 追踪真实学习行为，并借助 AI 驱动的反馈循环持续优化课程模块。**

> **生成（Generate）** — Tavily 研究 Agent 在内容生成前检索经验证的学术、视频与新闻来源。布鲁姆认知分类法、Krashen 的 i+1 难度递进和认知负荷理论内置于生成流水线，确保课程结构符合真实学习规律。不会出现幻觉引用。

> **追踪（Track）** — 学生的每一次交互均生成 xAPI 语句。一条 5 节点 A2A 多 Agent 流水线（行为分析师 · 风险检测器 · 内容优化器 · 群组对比器）分析学习参与模式、标记高风险学习者、识别表现欠佳的模块，并提供完整的分析仪表板与可导出报告。

> **优化（Optimize）** — 课程 Agent 将分析结果转化为具体的模块修改建议。教师通过修改前后对比预览逐一审阅并批准或拒绝每条 AI 建议。已批准的修改回流至下一轮学习数据周期——闭环完成。

---

## 🧭 设计理念

大多数 EdTech AI 工具将人工智能视为需要监控的威胁——检测学生是否使用了 AI，标记"非原创"作品，强制要求原创性。

Plot Ark 持完全相反的立场。

**AI 是认知工具，不是威胁。** 一个用 AI 起草答案、然后真正理解它、完善它、并能用自己的语言解释它的学生——这个学生学到了东西。不加理解地复制粘贴，是学生在欺骗自己，而不是需要被系统惩罚的问题。

Plot Ark 没有 AI 检测机制，也永远不会有。它问的不是"你用了 AI 吗？"，而是"学习发生了吗？"——并通过布鲁姆认知分类法对齐、i+1 难度递进和 xAPI 学习行为追踪来回答这个问题。

课程引擎本身也遵循同样的逻辑：AI 生成结构，教学理论约束输出，教师始终掌握最终决策权。工具负责思考；人负责决定。

这个系统的设计初衷，是让没有人被系统漏掉。作者本人，就是那个曾经被漏掉的人。

Anthropic 经济指数报告（2026年1月）发现，prompt 复杂度与回复复杂度之间的相关系数 r = 0.925 —— 你投入的思考越深，它给出的回应越深。

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
<summary><strong>🧠 课程生成</strong></summary>

- **主动式信源检索** — Tavily Agent 在生成前跨多种领域发起检索：学术（JSTOR、Springer、ResearchGate…）、视频（TED、Coursera、YouTube）以及新闻（HBR、Economist、NYT）
- **可信引用** — 经验证的真实 URL 直接注入提示词；信源面板显示完整标题、类型标签（📄/🎬/📰）及预计阅读/观看时长
- **结构自检** — 生成完成后自动验证 complexity_level 递进关系与模块数量；结构无效时自动重试一次
- **布鲁姆认知分类法对齐** — 课程代码（如 ACCT 301）自动映射到对应认知层级（记忆 → 创造）
- **i+1 难度递进** — complexity_level 在各模块间递增，每个模块都建立在前一个基础之上
- **认知负荷约束** — 每个模块最多 2 篇阅读材料，每篇均附有明确的教学理论依据
- **课程类型** — 支持项目制、论文、辩论/角色扮演、实验/模拟，或混合评估形式
- **SSE 流式生成** — 内容逐 token 流式输出；生成开始前显示研究 Agent 状态
- **大纲导入** — 上传 PDF 或 DOCX；GPT 自动提取主题、课程代码、难度级别、目标受众、模块数量及必读材料，预填充表单
- **课程叙事** — 在骨架生成阶段自动生成 2–3 句话的"课程故事"；教授可编辑，学生只读

</details>

<details>
<summary><strong>✏️ 模块编辑器</strong></summary>

- **单卡片导航** — 左右箭头逐模块切换，或点击侧边栏索引直接跳转
- **拖拽排序** — 无需重新生成即可调整模块顺序
- **内联编辑** — 三个标签页（学习目标、资源、评估）中的每个字段均可直接编辑
- **增删条目** — 学习目标、阅读材料、作业均可自由增删
- **资源卡片** — 每条阅读材料展示类型标签、预计时长，并直接链接到原始信源
- **LocalStorage 持久化** — 编辑内容在页面刷新后仍然保留
- **课程叙事编辑** — 教授可直接内联编辑课程级别的叙事文本；学生端仅展示只读版本

</details>

<details>
<summary><strong>📦 导出</strong></summary>

- **IMS Common Cartridge（.imscc）** — 可直接导入 Canvas、Moodle、D2L
- **PDF 导出** — 客户端 jsPDF；每模块显示阅读材料标题，完整引用汇总至结尾 References 部分
- **DOCX 导出** — python-docx 后端；结构与 PDF 导出一致
- **Markdown 导出** — 将含阅读材料与作业的完整课程导出为 .md 文件
- **引用格式选择器** — APA / MLA / Chicago，适用于所有导出格式
- **复制到剪贴板** — 一键粘贴到任意编辑器

</details>

<details>
<summary><strong>🕸️ 知识图谱（LightRAG）</strong></summary>

- **材料导入面板** — 右侧常驻面板；拖拽上传 PDF/PPTX（最多 15 个文件，每个 50MB）；逐文件进度追踪；Build Graph 按钮触发 LightRAG 导入
- **学年侧边栏** — Year 1–4 + All Courses 导航；课程按学年分类展示
- **课程管理** — 每个学年有课程横幅与 pill 导航；支持增删/重命名/拖拽排序 course pill；每门课有可编辑的完整课程名标签；修改自动保存至 localStorage
- **动态学科标签页** — 支持增删/重命名/拖拽排序学科标签；标签状态跨 session 持久化
- **力导向可视化** — 交互式 2D 图谱，双通道颜色编码：**填充色 = 掌握度**（绿/黄/红/灰），**描边色 = 知识层级**（琥珀=Core、紫=Supplementary、蓝=Student Notes）；节点大小随连接数缩放
- **掌握度叠加层** — 概念掌握度由 xAPI 动词 + 学生反馈推导；每次 xAPI 分析后自动同步；无数据概念统一显示为灰色（"Not Learned"）
- **节点详情面板** — 点击任意概念节点查看其定义与连接数
- **全屏模式** — 全屏切换，支持 ESC 键退出
- **课程搜索** — 按名称或课程代码跨学年搜索；自动定位到对应学年
- **概念搜索** — 在图谱中筛选并高亮匹配节点
- **知识查询** — 用自然语言对图谱提问；Redis 缓存答案（持久化缓存）
- **查询历史** — 可收藏和删除的历史记录，附学科标签
- **持久事件循环** — LightRAG 异步引擎运行于独立后台线程；首次查询后不再有冷启动延迟

</details>

<details>
<summary><strong>🤖 A2A 多 Agent 分析系统</strong></summary>

- **5 节点流水线** — `Orchestrator → [BehaviorAnalyst ‖ RiskDetector ‖ ContentOptimizer ‖ CohortComparator] → aggregate → LTM snapshot`。当前所有 Agent 均为 sql-only（Phase 2 = LLM 集成待开发）。
- **PII 匿名化** — 学生姓名/邮箱在进入 Agent 前全部匿名化；真实身份仅在最终报告聚合后恢复，供教授查看。
- **xAPI Mock 数据引擎** — 支持 4 种噪声级别（5%/10%/15%/20%），通过前端 UI 选择；基于 `HOUR_WEIGHTS` 的真实 6 周时间戳分布；按学生画像分布（高绩效/普通/挣扎/脱离）。**课程感知模式**：查询 `change_log` 表中已批准的模块，使用 `IMPROVED_VERB_DIST` 模拟优化后改善效果。
- **Hive 风格节点架构** — 每个 Agent 继承 `BaseNode`，支持 reflexion/重试（最多 3 次）、L3 JSON Schema 校验、SQL Fallback
- **SharedMemory (Redis)** — Agent 间通过 `a2a:{session_id}:{key}` 键名在 Redis 共享内存通信，支持本地 dict 降级
- **Token 用量追踪** — `NodeResult` 携带 `tokens_in / tokens_out / tokens_cache_read / tokens_cache_write` 字段；Orchestrator 在每次运行后向后端日志打印 Token 汇总表。
- **LTM 三层架构** — Hot（Redis，流水线运行时）、Warm（PostgreSQL `course_analysis_snapshots`，每次分析快照）、Cold（`data/ltm/*.md` YAML+Markdown，版本化归档）
- **历史趋势可视化** — `TrendChart.tsx`（纯 SVG）显示 at-risk % 与 completion rate 随时间变化；迷你模式 + 全屏 Modal（日期标签、更大数据点、概览数据卡片）
- **SSE 实时流式反馈** — 分析进度通过 Server-Sent Events 流式传输；前端实时显示 Agent 状态
- **Student Data 仪表板** — 独立全页分析视图，可拖拽侧边栏、分区导航、噪声级别选择器、Token Usage 面板
- **风险检测** — 6 个信号；阈值：中风险 ≥ 4，高风险 ≥ 7；不活跃窗口：14 / 21 天
- **群组对比** — 学生分为 high_performers / average / at_risk / disengaged 四个群组，含平均完成率与困难率
- **6 分区报告导出** — PDF（Anthropic 风格封面）、DOCX、Excel。包含：行为分析、风险评估、内容优化、群组对比、**分析历史**（表格 + matplotlib 趋势图）、总览与建议。文件名含课程 slug + 噪声标签。

</details>

<details>
<summary><strong>🎯 课程 Agent — 主动式课程优化</strong></summary>

- **三层人在回路（HITL）设计** — 建议按信号强度和变更范围分为三个操作层级：
  - **第一层 — 学习目标（AI 直接改）**：琥珀色徽章；一键 Apply 写入更新后的 learning objectives 并降低 complexity_level；弹出修改前后对比确认框；支持 Redo 还原
  - **第二层 — 参考资料（用户触发搜索）**：紫色徽章；”Search References”按钮基于模块学习目标调用 Tavily 搜索，返回去重候选项（按域名去重，排除已有 readings）；教授勾选后直接写入 `recommended_readings`
  - **第三层 — 作业（AI 只提醒）**：蓝色徽章；只读提示框说明变更背景和建议教授手动核查的内容；没有 Apply 按钮，教授自行决定
- **教授通知栏** — CoursePage 顶部琰琥色持久通知栏，当 AI 生成的课程建议可用时提醒教授，附带”Dismiss”和”Review →”按钮
- **教授滑出抽屉** — 点击”Review”从右侧滑出 400px 建议抽屉，按徽章层级分组展示待处理建议（Apply / Search）与已应用变更（Redo）
- **学生通知栏** — 蓝色横幅显示”N 个模块已更新 — 基于教师优化”，附带 Dismiss 和 Review 按钮
- **学生滑出抽屉** — 点击”Review”打开蓝色主题抽屉，列出更新的模块并带有”Go to Module”导航按钮
- **可拖拽悬浮球（FAB）** — 关闭通知栏后，右下角出现可拖拽的悬浮球（🤖 琰琥色 / ✨ 蓝色）；点击直接打开抽屉（不恢复 banner）；hover 显示 ✕ 可彻底关闭；支持自由拖拽到屏幕任意位置
- **生成后自动分析** — 每门新课保存后立即触发后台结构分析，生成全部三种 change_type 建议条目，无需等待 xAPI 运行即可看到建议
- **Redo（撤销 Apply）** — 应用的变更会备份原始模块数据；点击”Redo”恢复模块到应用前状态，并将建议移回待处理
- **模块标记** — `module_flags` 表存储被标记的模块，包含信号来源、标记级别及详细指标
- **变更日志** — `change_log` 表记录所有建议，含 `change_type` 字段（objective_update / reference_suggestion / assignment_alert）、状态追踪（pending → applied → dismissed）及 backup_data
- **分析跳转** — 教授抽屉中的”View Full Analytics →”按钮直接导航到 Student Data 分析页面

</details>

<details>
<summary><strong>📦 导出格式</strong></summary>

- **IMS Common Cartridge (.imscc)** 无缝对接主流 LMS (Canvas, Moodle, D2L)。
- **PDF、DOCX 及 Markdown** 并支持自适应引用格式切换 (APA/MLA/Chicago)。

</details>

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
│  │  ├── graph.py                知识图谱 + RAG 查询 + KG↔Module 映射     │   │
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
│  └──────────┬──────────────────┘  │  ├── kg_mapper.py (KG↔Module)       │   │
│             │                     │  └── export_{pdf,docx,excel}.py    │   │
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

## 🕸️ 使用知识图谱

知识图谱功能支持上传课程材料（PDF、PPTX 或 DOCX），并将其可视化为交互式概念地图。

1. 点击顶部导航栏的 **Knowledge Graph** 标签
2. 在右侧 **Upload Materials** 面板中填写：
   - **Subject name**（必填）— 例如 "Organizational Behavior"
   - **Course code**（选填）— 例如 "ADMS 2400"
   - **Year**（必填）— 该课程所属学年
3. 将 PDF / PPTX / DOCX 文件拖入上传区域
4. 点击 **Build Graph** — 后台自动运行知识图谱构建（约 $0.10–0.30 / 每 10 个 PDF，gpt-4o-mini 计费）
5. 构建完成后，图谱自动出现在对应学年和课程标签下


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
│   │   ├── curriculum_agent_routes.py   ← /api/curriculum/ 标记、建议、应用、撤销、references/search、references/apply、auto-analyze
│   │   ├── history.py                   ← /api/history/* + /api/curriculum/export/docx
│   │   ├── sources.py                   ← Tavily 源预览
│   │   ├── graph.py                     ← 知识图谱 + RAG 查询 + /api/graph/kg-mapping
│   │   ├── mastery.py                   ← /api/mastery/* 概念掌握度图 + 同步触发
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
│   │   ├── kg_mapper.py                 ← KG ↔ Module 概念映射（三层匹配：词边界 + 缩写剥离 + 反向查找）
│   │   ├── mastery_tracker.py           ← 由 xAPI 动词 + 学生反馈推导每个概念的掌握度
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
│   │   │   ├── KgMappingPanel.tsx       ← KG ↔ Module 覆盖率侧边栏（进度条 + 统计摘要）
│   │   │   ├── CurriculumApplyModal.tsx ← AI 建议应用确认弹窗
│   │   │   ├── CurriculumDrawer.tsx     ← 教授端滑出抽屉（三层 HITL：Apply / Search References / Alert）
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

- [x] KG ↔ Curriculum 概念映射 — 三层匹配引擎（词边界正则 + 缩写剥离 + 反向查找）
- [x] Knowledge Map 标签页 — 每模块显示 KG 概念定义 + 跨模块依赖关系
- [x] 概念掌握度追踪 — xAPI 动词 + 学生反馈 → `cohort_concept_mastery`；每次分析后自动同步
- [x] GraphViewer 掌握度叠加层（学生端）— 填充色=掌握度，描边色=知识层级；无数据概念统一灰色
- [ ] KG → Agentic Loop — 将 KG 上下文注入 CurriculumAgent 建议
- [ ] GraphViewer 教授端视图 — 群组聚合掌握度（每个概念有多少学生掌握）
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
