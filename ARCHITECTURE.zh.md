[English](ARCHITECTURE.md) | [中文](ARCHITECTURE.zh.md)

# Plot Ark 架构

> 本文档按**用户看得见的表面**组织，而不是按技术分层。每个页面小节回答三个问题：屏幕上出现什么 → 数据来自哪个端点 → 端点背后查哪张表、哪个 agent 在算。产品介绍与快速上手见 [README](README.zh.md)。

---

## 技术栈

| 层 | 技术 | 端口 |
|-------|-----------|------|
| **前端** | React + TypeScript + Vite | 5173 |
| **后端** | Python 3.11 + Flask Blueprints | 5000 |
| **数据库** | PostgreSQL | 5432 |
| **缓存 / 共享内存** | Redis | 6380 |
| **知识图谱** | LightRAG（嵌入式，GraphML） | — |
| **编排** | Docker Compose | — |

身份机制：前端把登录邮箱存进 localStorage（`AuthContext`），请求时带 `X-User-Email` header；学生端端点信任这个 header（demo 级认证，计划中的替代方案是 LTI 1.3 JWT）。路由按角色守卫：`/generate`、`/student-data`、`/settings` 仅教授可见；`/profile` 仅学生可见。

---

## 双门户，逐页拆解

### 🎓 教授门户

#### GeneratePage（`/generate`）

| 屏幕上是什么 | 端点 | 背后 |
|---|---|---|
| Syllabus 上传 → 表单自动填充 | `POST /api/syllabus/import` | `file_parser.py` 从 PDF/DOCX 提取主题 / 课号 / 难度 / 模块数 |
| 来源审核面板（生成前批准/拒绝） | `POST /api/sources/preview` | `research.py` —— Tavily 多类型检索（学术 / 视频 / 新闻）+ 可信度评分。人在回路：未经批准的来源不进 prompt |
| 流式课程生成 | `POST /api/curriculum/generate`（SSE） | 两段式：skeleton → 逐模块 expand。`prompt_builder.py` 从 DB 模板渲染 prompt（注入教授的 `custom_instructions`）；Bloom's 映射、i+1 难度递进、认知负荷上限在 prompt + 后校验中强制执行 |
| 课程保存 → 建议立即就绪 | save → auto-analyze | `curriculum_agent_routes.auto_analyze_course()` 后台跑结构分析并写 `change_log`，所以 CoursePage 的抽屉不用等 xAPI 分析就有内容 |

#### CoursesPage（`/courses`）

| 屏幕上是什么 | 端点 | 背后 |
|---|---|---|
| 课程仪表板卡片 + 收藏 | `GET /api/history` | `curricula` 表 CRUD（`history.py`） |

#### CoursePage（`/course/:id`）

| 屏幕上是什么 | 端点 | 背后 |
|---|---|---|
| 模块编辑器（3 个标签页、拖拽排序、行内编辑） | `GET/PUT /api/history/<id>` | `curricula.modules` JSONB |
| 琥珀色通知栏 + 滑出式 Curriculum Drawer | `GET /api/curriculum/flags`、`GET /api/curriculum/suggestions` | `module_flags` + `change_log` 表；flag 由 `threshold_checker.py` 产生（单 agent 信号 = 黄色 badge，双 agent 复合 = 橙色 + 弹窗） |
| 三层 HITL 建议 | `POST /api/curriculum/apply`、`/redo`、`/references/search`、`/references/apply` | L1 目标：AI 直接应用，带 before/after 预览 + redo 备份。L2 参考文献：教授手动触发 Tavily 检索。L3 作业：只读提醒，教授自己决定 |
| 学生视图：每模块四按钮反馈 | `POST /api/feedback` | `student_feedback` 表 + Redis 实时缓存（`feedback:<course>:<module>`） |
| 学生视图：一句话诊断卡 | `GET /api/profile/diagnosis/<course_id>` | `student_diagnosis.py` —— 模板驱动、暖语气、零数字（红线 R1/R5） |
| 学生视图：蓝色"模块已更新"栏 + 抽屉 | `GET /api/curriculum/changes/<course_id>` | `change_log` 中已应用的条目 |
| 导出 | 客户端 jsPDF / `POST /api/curriculum/export/*` | PDF、DOCX、Markdown、IMS Common Cartridge |

#### StudentDataPage（`/student-data`）—— A2A 分析仪表板

| 屏幕上是什么 | 端点 | 背后 |
|---|---|---|
| 噪声选择器 + seed 按钮 | `POST /api/xapi/seed` | `xapi_generator.py` —— 4 档噪声、6 周真实时间戳分布、学生画像分布；课程感知（读 `change_log`，模拟优化后的真实改善） |
| 实时 agent 进度 + 报告分节 | `POST /api/analytics/report`（SSE） | 6-agent 流水线（见下文）；agent 运行前 PII 匿名化，仅在最终教授报告中还原 |
| 趋势图（at-risk % 随时间变化） | analytics history API | `course_analysis_snapshots`（Warm LTM） |
| 报告导出 | `POST /api/analytics/export/{pdf,docx,excel}` | ReportLab（Anthropic 风格封面）/ python-docx / openpyxl；内嵌 matplotlib 图表 |

#### SettingsPage（`/settings`）

| 屏幕上是什么 | 端点 | 背后 |
|---|---|---|
| 个人信息、学术偏好、模型默认值 | `GET/PUT /api/settings` | 教授设置行；AmberSelect 设计系统；600ms 防抖自动保存 |
| Prompt 模板编辑器（3 槽位） | `GET/PUT /api/prompts` | `prompt_templates` 表 —— 每槽位（generate / skeleton / expand）的 `custom_instructions`，由 `prompt_builder.py` 渲染时注入。改 prompt 不用改代码 |

### 🪞 学生门户

#### GraphPage（`/graph`）

| 屏幕上是什么 | 端点 | 背后 |
|---|---|---|
| 力导向知识图谱 | `GET /api/graph/*` | 每门课一个 LightRAG GraphML；`networkx` + `react-force-graph-2d` |
| 填充色 = 掌握度，描边色 = 知识层 | `GET /api/mastery/all`（或按课程） | `cohort_concept_mastery` —— 由 `mastery_tracker.py` 从 xAPI verbs × 四按钮反馈推导，每次分析后自动同步 |
| **"Mastery / My footprint" 填色切换**（学生角色） | `GET /api/selfview/footprint/<course_id>` | 学生本人的 xAPI 记录 → 每模块 visits/revisits → 经 `kg_mapper.py` 投影到 KG 概念。琥珀色热度以学生自己的最大值为基线——永远不与同学比较 |
| 概念标注（confused / important / exam focus） | `POST /api/kg/annotate` | `concept_annotations` 表；匿名聚合喂给教授端困惑热力图，并镜像为 xAPI statement |
| 自然语言图谱问答 | `POST /api/graph/query` | LightRAG 查询，Redis 缓存 |
| 材料上传面板 | `POST /api/materials/ingest` | PDF/PPTX/DOCX → LightRAG → GraphML（后台专用事件循环 `async_loop.py`） |

#### StudentProfilePage（`/profile`）—— 4 个标签页

| 标签页 | 屏幕上是什么 | 端点 | 背后 |
|---|---|---|---|
| Profile | 头像、显示名 | `GET/PUT /api/profile` | `student_profiles` 表，800ms 防抖自动保存 |
| Customized Learning | 学科、CP/OC 人设组、自定义 AI 指令 | 同 `PUT /api/profile` | `persona_sets` / `custom_prompt` 列 —— 未来 LLM 解释的语义锚点 |
| My Progress | **My Courses 翻转卡**（正面：课程名 + 掌握度圆点；背面：带标注的 M1–Mn 模块条；关键词搜索含模块标题） | `GET /api/profile/courses` | Enrollment = 三源 UNION：feedback ∪ annotations ∪ **xAPI 行为**（course id 从 `object_id` 解析） |
| My Progress | **学习节律** 7×24 热力图 + 模式陈述句 | `GET /api/selfview/rhythm/<course_id>` | 纯 SQL 的 `dow × hour` 聚合，只算本人数据。色深只与自己最忙的时段比较 |
| My Progress | **回望卡（Look Back）**—— 点击才出现 | `POST /api/selfview/retrospect/<course_id>` | 模板模式陈述（revisit / 节律峰值 / 广度 / 趋势），按 ISO 周幂等，持久化到 `selfview_snapshots` |
| My Progress | "像我 / 不太像" 投票按钮 | `POST /api/selfview/verdict` | 归属校验、可改选；投票是全系统唯一的 ground truth 信号，留给未来的个性化 |
| AI Settings | Agent 团队模型选择（18 预设 × 9 provider + 自定义）、按 provider 的 API key | `GET /api/profile/models`、`PUT /api/profile` | `model_config` JSONB；Fernet 加密存储，GET 时掩码返回；★ dense 推荐与 ⚠ MoE 警告在 UI 层强制执行 |

---

## A2A 多 Agent 流水线（6 个 agent，全部 sql-only）

```
POST /api/analytics/report (SSE)
        │
        ▼
 OrchestratorNode
        │ ① PII 匿名化（Student_001..N ↔ 真实身份）
        │ ② 顺序 dispatch，每个 agent 完成发一条 SSE
        ▼
 BehaviorAnalyst ─► RiskDetector ─► ContentOptimizer ─► CohortComparator
 verb/模块参与度    6 信号风险打分    表现欠佳/优秀       4 组分群
                   med≥4 hi≥7       模块识别           （高分 / 平均 /
                   不活跃 14/21 天                       风险 / 脱离）
        │ ③ threshold_checker：单 agent flag = 黄 · 双 agent = 橙
        ▼
 KGContextAnalyst ──► CurriculumAgent
 只给 flagged 模块     读 Cold LTM 历史（data/ltm/*.md），
 注入 slim KG 上下文   区分结构性问题（连续 3+ 次被 flag）
                      与一次性异常，生成建议 → change_log
        │ ④ 教授报告 de-anonymise · ⑤ 保存快照
        ▼
 course_analysis_snapshots（Warm）+ data/ltm/*.md（Cold）+ 报告 JSON
```

每个 agent 继承 `BaseNode`（Hive reflexion 模式：try → L3 JSON Schema 校验 → 重试 ×3 → SQL fallback），通过 Redis SharedMemory 通信（`a2a:{session_id}:{key}`，TTL 1 小时，Redis 不可用时退化为本地 dict）。

```python
@dataclass
class NodeResult:
    status: str          # "success" | "fallback" | "error"
    data: dict
    agent_name: str
    duration_ms: int
    retries_used: int
    error: Optional[str]
    tokens_in: int       # Phase 1（sql-only）全为 0 —— 为 LLM 阶段预留
    tokens_out: int
    tokens_cache_read: int
    tokens_cache_write: int
```

**阶段状态**：6 个 agent 目前全部 sql-only。LLM 管道（按角色模型配置、加密 key、DB prompt 模板）已全部建好，等待 LLM 接入 Sprint。

---

## LTM —— 双轨，同源

同一份 xAPI 数据流在平台两端各自沉淀记忆：

| | 教授轨 ——"这门课怎么样" | 学生轨 ——"我怎么样" |
|---|---|---|
| **Hot** | Redis SharedMemory（流水线运行时，TTL 1h） | — |
| **Warm** | `course_analysis_snapshots`（每次分析一行） | `selfview_snapshots`（每次回望、每 ISO 周一行） |
| **Cold** | `data/ltm/{course_id}_{date}.md`（YAML frontmatter；CurriculumAgent 读最近 10 份检测反复出现的问题） | — |

学生轨刻意**只存原始 xAPI 无法重算的东西**：展示过的模式陈述句，和学生对它们的投票。足迹和节律永远实时重算。

---

## 数据库 Schema

```
curricula
  id, topic, level, audience, course_code, course_type,
  module_count, modules (JSONB), sources (JSONB),
  is_favorite, created_at

xapi_statements
  id, actor_email, actor_name, verb, object_id, object_name,
  timestamp, curriculum_topic
  索引: actor_email, verb, object_id, curriculum_topic, timestamp
  注: 课程关联从 object_id（'course/N/...'）解析

student_feedback
  id, course_id, module_index, module_title, sentiment,
  comment, student_id, created_at
  索引: course_id

student_profiles
  id, email, display_name, preferred_style, persona_sets (JSONB),
  avatar_url, discipline, custom_prompt, model_config (JSONB),
  created_at, updated_at

cohort_concept_mastery
  course_id, module_id, concept, mastery_level,
  valid_from / valid_to（时间窗）

module_flags / change_log
  flags: module_id, flag_level (yellow/orange), 信号来源, 指标
  change_log: change_type (objective_update / reference_suggestion /
  assignment_alert), status (pending → applied → dismissed), backup_data

selfview_snapshots                 ← 学生端 LTM（镜子层）
  id, email, course_id, period (ISO 周),
  rhythm_summary (JSONB), footprint_summary (JSONB),
  statements_shown (JSONB), verdicts (JSONB)
  索引: email, course_id, created_at DESC
  任何教授端点永远不可读。

course_analysis_snapshots          ← 教授端 Warm LTM
  id, course_id, run_at, noise_label,
  risk_distribution (JSONB), total_students, at_risk_count, high_risk_count,
  top_signals (JSONB), module_engagement_summary (JSONB),
  verb_distribution (JSONB), cohort_groups (JSONB)
  索引: course_id, run_at DESC
```

---

## 核心后端端点

| 方法 | 路径 | 说明 |
|--------|------|-------------|
| `POST` | `/api/curriculum/generate` | SSE：skeleton → expand（两段式） |
| `POST` | `/api/sources/preview` | Tavily 检索 + 可信度评分 |
| `GET`  | `/api/history` | 课程 CRUD |
| `POST` | `/api/syllabus/import` | PDF/DOCX → 表单自动填充 |
| `POST` | `/api/xapi/seed` | 生成 mock xAPI 数据（噪声参数） |
| `POST` | `/api/analytics/report` | SSE：运行 6-agent A2A 流水线 |
| `POST` | `/api/analytics/export/{pdf,docx,excel}` | 报告导出 |
| `GET`  | `/api/curriculum/flags` / `suggestions` | 模块 flag + HITL 建议 |
| `POST` | `/api/curriculum/apply` / `redo` | 应用 / 撤销建议（带备份） |
| `POST` | `/api/graph/query` | LightRAG 自然语言查询（Redis 缓存） |
| `POST` | `/api/materials/ingest` | LightRAG PDF/PPTX/DOCX 摄取 |
| `POST` | `/api/kg/annotate` | 学生/教授概念标注 |
| `GET`  | `/api/mastery/<course_id>` · `/api/mastery/all` | 概念掌握度地图 |
| `GET/PUT` | `/api/profile` · `/api/settings` · `/api/prompts` | 学生画像 / 教授设置 / prompt 模板 |
| `GET`  | `/api/profile/courses` | 学生已选课程（feedback ∪ annotations ∪ xAPI） |
| `GET`  | `/api/selfview/footprint/<course_id>` | 本人注意力足迹 + KG 概念投影（X-User-Email） |
| `GET`  | `/api/selfview/rhythm/<course_id>` | 本人 7×24 学习节律矩阵（X-User-Email） |
| `GET`  | `/api/selfview/students/<course_id>` | Demo 助手：mock 学生及语句数 |
| `POST` | `/api/selfview/retrospect/<course_id>` | 按需生成回望卡，ISO 周幂等 |
| `POST` | `/api/selfview/verdict` | "像我 / 不太像" 投票（归属校验） |

---

## 红线（产品灵魂——在代码里强制执行）

1. **永远不给学生看数值分数、排名、班级对比。** 表现类数据（掌握度）只以颜色呈现；诊断引擎只用"might help / could try"的语气说话。
2. **行为数据不同于表现数据**：学生可以看自己的节律、足迹、回访次数——但对比基线永远是过去的自己，绝不是其他学生。
3. **镜子只在被问到时说话**：回望卡在学生点击之前不存在。没有环境式审判。
4. **镜子可以被否决**：每条模式陈述都带"像我 / 不太像"。学生是最终解释权威；他们的投票作为 ground truth 存储。
5. **隐私墙**：`selfview_snapshots` 和学生画像对所有教授端点不可读。教授看到的是群体聚合；学生看到的是自己。
6. **永远没有 AI 检测。** 问题是"学习发生了吗？"，不是"你用 AI 了吗？"。

---

## 教学论引擎

- **Bloom's Taxonomy 映射** —— 课号（如 ACCT 301）→ 认知层级（Remember → Create）
- **i+1 难度递进** —— `complexity_level` 跨模块递增校验
- **认知负荷约束** —— 每模块最多 2 篇阅读材料，每篇附明确的教学理由
- **人在回路** —— Tavily 来源生成前审批；每个课程变更应用前预览

---

## AI 集成

- **OpenAI GPT-4o / GPT-4o-mini** —— 内容生成（`AI_PROVIDER=openai`）
- **Google Gemini 2.5 Flash** —— 备选 provider（`AI_PROVIDER=gemini`）
- **18 预设模型 × 9 provider** + 自定义 OpenAI 兼容端点 —— 按角色配置的 Agent 团队（Explainer / Fact Checker / Style Adapter）
- **Tavily Search API** —— 生成前学术来源检索
- **LightRAG**（HKUDS，MIT）—— 知识图谱构建与自然语言查询

---

## 导出格式

| 输出 | 库 | 说明 |
|--------|---------|-------|
| PDF（分析报告） | ReportLab | Anthropic 风格封面；内嵌 matplotlib 图表 |
| DOCX（分析报告） | python-docx | 与 PDF 版式一致 |
| Excel | openpyxl | 每节一张原始数据表 |
| PDF（课程） | jsPDF（客户端） | 阅读材料行内展示，末尾 References 汇总 |
| DOCX（课程） | python-docx | 与课程 PDF 结构一致 |
| IMS Common Cartridge | Python zip | 直接导入 Canvas / Moodle / D2L |
| Markdown | 纯文本 | 完整课程含阅读材料与作业 |

---

## 项目结构

```
plot-ark/
├── docker-compose.yml
├── docs/                                ← Demo GIF + 架构图
│
├── backend/                             ← Flask（模块化 Blueprints）
│   ├── app.py                           ← 入口（注册 Blueprints）
│   ├── config.py                        ← 18 预设模型 + 环境常量
│   ├── extensions.py                    ← 全局单例（Flask、AI、Redis）
│   ├── async_loop.py                    ← 后台事件循环（LightRAG）
│   ├── db.py                            ← PostgreSQL 操作 + 建表
│   ├── constants.py                     ← Bloom's taxonomy、格式常量
│   ├── routes/
│   │   ├── curriculum.py                ← generate / skeleton / expand / save
│   │   ├── curriculum_agent_routes.py   ← flags / suggestions / apply / redo / references
│   │   ├── history.py                   ← 课程 CRUD + 收藏 + 导出
│   │   ├── analytics.py                 ← A2A SSE + 历史 + 导出
│   │   ├── xapi.py                      ← xAPI statements + mock seed
│   │   ├── feedback.py                  ← 四按钮情绪 + 评论
│   │   ├── profile.py                   ← 学生画像 + model_config + courses
│   │   ├── selfview.py                  ← 🪞 足迹 / 节律 / 回望 / 投票
│   │   ├── settings.py                  ← 教授设置门户
│   │   ├── prompts.py                   ← DB prompt 模板编辑器（3 槽位）
│   │   ├── mastery.py                   ← 概念掌握度地图 + 同步
│   │   ├── graph.py                     ← KG 数据 + RAG 查询
│   │   ├── annotations.py               ← KG 概念标注
│   │   ├── sources.py                   ← Tavily 来源预览
│   │   ├── syllabus.py                  ← PDF/DOCX 解析 + 导入
│   │   └── materials.py                 ← LightRAG 摄取
│   ├── agents/                          ← Hive 风格 A2A（全部 sql-only）
│   │   ├── base.py                      ← BaseNode + SharedMemory + NodeResult
│   │   ├── orchestrator.py              ← 协调器 + SSE + 匿名化
│   │   ├── behavior_analyst.py          ├── risk_detector.py
│   │   ├── content_optimizer.py         ├── cohort_comparator.py
│   │   ├── kg_context_analyst.py        ← KG ↔ CurriculumAgent 桥
│   │   └── curriculum_agent.py          ← Cold LTM 趋势分析 → 建议
│   └── services/
│       ├── research.py                  ← Tavily + 可信度评分
│       ├── prompt_builder.py            ← 从 DB 模板渲染 prompt
│       ├── xapi_generator.py            ← mock 数据引擎（课程感知）
│       ├── kg_mapper.py                 ← KG ↔ 模块概念映射
│       ├── mastery_tracker.py           ← xAPI × 反馈 → 掌握度
│       ├── threshold_checker.py         ← 黄/橙复合信号 flag
│       ├── student_diagnosis.py         ← 暖语气一句话诊断
│       ├── ltm_writer.py                ← Cold LTM .md 快照
│       ├── lightrag_service.py          ├── file_parser.py
│       ├── report_exporter.py           ├── chart_generator.py
│       └── export_{pdf,docx,excel}.py
│
├── frontend/                            ← React + TypeScript + Vite
│   ├── App.tsx                          ← 路由（按角色守卫）
│   ├── context/AuthContext.tsx          ← email + 角色 → X-User-Email header
│   ├── pages/
│   │   ├── GeneratePage.tsx             ← 课程生成（教授）
│   │   ├── CoursesPage.tsx              ← 仪表板
│   │   ├── CoursePage.tsx               ← 模块编辑器 + 抽屉 + 反馈
│   │   ├── StudentDataPage.tsx          ← A2A 分析仪表板（教授）
│   │   ├── SettingsPage.tsx             ← 教授设置（教授）
│   │   ├── GraphPage.tsx                ← 知识图谱
│   │   ├── StudentProfilePage.tsx       ← 🪞 4 标签页画像 + 镜子层（学生）
│   │   └── LoginPage.tsx
│   ├── components/
│   │   ├── GraphViewer.tsx              ← 力导向图 + 掌握度/足迹填色切换
│   │   ├── ModelSelection.tsx           ← Agent 团队卡（18 预设 + 自定义）
│   │   ├── ModuleCard.tsx / ModuleSidebar.tsx
│   │   ├── IngestPanel.tsx / QueryPanel.tsx / NodeDetailPanel.tsx
│   │   ├── GraphToolbar.tsx / CourseBanner.tsx / YearSidebar.tsx
│   │   ├── ui/
│   │   │   ├── AmberSelect.tsx          ← 全站唯一下拉标准件
│   │   │   ├── Input.tsx / Select.tsx / DraggableFab.tsx / ToolbarDropdown.tsx
│   │   ├── analytics/                   ← ReportSections、TrendChart、抽屉、flag
│   │   ├── dashboard/                   ← CourseCard、MiniCalendar
│   │   └── generate/                    ← SyllabusUpload、SourceReview、SkeletonReview
│   └── hooks/                           ← useIngest、useQuery、useCourseManager
│
└── data/
    ├── ltm/                             ← Cold LTM .md 快照（教授轨）
    ├── materials/                       ← 课程 PDF/PPTX（gitignored）
    └── lightrag_storage*/               ← KG 数据（gitignored，可重建）
```
