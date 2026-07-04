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

**一款开源的双端（教授 + 学生）主动式课程平台，完整覆盖课程闭环：基于教学理论生成课程内容、通过 xAPI 追踪真实学习行为，并借助 AI Agent 在人在回路控制下持续优化课程模块。**

> **生成（Generate）** — Tavily 研究 Agent 在内容生成前检索经验证的学术、视频与新闻来源。布鲁姆认知分类法、Krashen 的 i+1 难度递进和认知负荷理论内置于生成流水线，确保课程结构符合真实学习规律。不会出现幻觉引用。

> **追踪（Track）** — 学生的每一次交互均生成 xAPI 语句。一条 5 节点 A2A 多 Agent 流水线（行为分析师 · 风险检测器 · 内容优化器 · 群组对比器）分析学习参与模式、标记高风险学习者、识别表现欠佳的模块，并提供完整的分析仪表板与可导出报告。

> **优化（Optimize）** — 课程 Agent 将分析结果转化为具体的模块修改建议。教师通过修改前后对比预览逐一审阅并批准或拒绝每条 AI 建议。已批准的修改回流至下一轮学习数据周期——闭环完成。

> **个性化（Personalize）** — 学生可以建立学习画像：学科偏好、多角色人设组（含关系映射的叙事锚点）、自定义 AI 指令。可配置 Agent 团队（18 个预设模型 + 自定义模型，覆盖 9 家 provider）让用户自选 LLM 组合。模板驱动的诊断引擎提供温和的一句话概念差距指引——无分数、无排名，只有"去哪里看"的地图。

---

### 🆕 最近更新（2026 年 7 月）

| 功能 | 说明 |
|------|------|
| 🪞 **学生自见层（镜子层）** | 学生看见自己的行为数据——是镜子，不是成绩单。**注意力足迹**将去过的概念叠加在知识图谱上（琥珀色热度随访问深度加深，"Mastery / My footprint" 填色切换）；**学习节律**以 7×24 热力图呈现你真实的学习时间，配模式陈述（"你通常在周四晚 9 点左右学习最多"）。纯 SQL 零 LLM。色深只与你自己最忙的时段比较——永远不与同学比较。这是 [Cogito](https://github.com/Schlaflied/Cogito) Direction A & B 方法论的机构规模移植。 |
| 🔍 **回望卡——可以被否决的镜子** | 只在学生主动点击时出现。模板化模式陈述（"你在 Legal Systems 上回访了 4 天——回访是大脑在要求巩固"），每条配 **"像我 / 不太像"** 投票按钮。*真不真由你决定——你的回答只属于你。* 投票持久化到学生专属 LTM（`selfview_snapshots`），任何教授端点永远读不到——这是全系统唯一的 ground truth 信号，留给未来的个性化。 |
| 🗂️ **My Courses 改版** | xAPI 学习行为即算 enrolled（不再只认 feedback）。全宽翻转卡片——正面：课程名 + 掌握度圆点；背面：带标注的 M1–Mn 模块条 + 逐模块 tooltip。关键词搜索覆盖课程名、课号、模块标题。 |

### 更早（2026 年 5 月）

| 功能 | 说明 |
|------|------|
| 🤖 **多模型 Agent 团队** | 9 家 provider 的 18 个预设模型（OpenAI、Anthropic、Google、DeepSeek、Mistral、xAI、Groq、MiniMax、GLM）+ 自定义模型支持任意 OpenAI 兼容 API。★ 推荐标签、MoE ⚠ 架构警告、动态 API Key 检测。 |
| 👤 **学生画像系统** | 4 标签页画像（Profile、Customized Learning、My Progress、AI Settings），含头像、学科选择、CP/OC 叙事锚点、多角色人设组（含关系标签）、自定义 AI 指令。 |
| 🎓 **教授设置门户** | 完整设置页：个人信息、学术偏好（难度级别、课程类型、课时、教学设计、导出格式）、自定义 AmberSelect 下拉、模型默认值、Prompt 模板——全部自动保存。 |
| 🔐 **按 Provider 的 API Key** | 自带密钥——仅显示当前使用的 provider 的密钥输入框。后端 Fernet 加密存储。 |

---

### 👥 目标用户

| 角色 | 你将获得 |
|------|---------|
| **教师** | 基于教学理论的 AI 课程生成、xAPI 分析仪表板、三层人在回路优化建议、知识图谱、可导出报告（PDF/DOCX/Excel/IMS） |
| **学生** | 个性化学习画像、一句话概念差距诊断、叙事锚定解释（CP/OC）、可配置 AI 模型团队、进度可视化、自见镜子层（注意力足迹 + 学习节律——只有你自己可见） |
| **开发者** | 模块化 Flask + React 代码库、Hive 风格 A2A Agent 架构、Docker 一键启动、通过 OpenAI 兼容 SDK 的可扩展模型路由 |

---

## 🧭 设计理念

大多数 EdTech AI 工具将人工智能视为需要监控的威胁——检测学生是否使用了 AI，标记"非原创"作品，强制要求原创性。

Plot Ark 持完全相反的立场。

**AI 是认知工具，不是威胁。** 一个用 AI 起草答案、然后真正理解它、完善它、并能用自己的语言解释它的学生——这个学生学到了东西。不加理解地复制粘贴，是学生在欺骗自己，而不是需要被系统惩罚的问题。

Plot Ark 没有 AI 检测机制，也永远不会有。它问的不是"你用了 AI 吗？"，而是"学习发生了吗？"——并通过布鲁姆认知分类法对齐、i+1 难度递进和 xAPI 学习行为追踪来回答这个问题。

课程引擎本身也遵循同样的逻辑：AI 生成结构，教学理论约束输出，教师始终掌握最终决策权。工具负责思考；人负责决定。

这个系统的设计初衷，是让没有人被系统漏掉。作者本人，就是那个曾经被漏掉的人。

Anthropic 经济指数报告（2026年1月）发现，prompt 复杂度与回复复杂度之间的相关系数 r = 0.925 —— 你投入的思考越深，它给出的回应越深。

**同样的方法论贯穿于 [Cogito](https://github.com/Schlaflied/Cogito)** —— 作者对这个问题的个人规模版本。Cogito 从个人知识库中提取 git diff 和笔记内容，进行语义嵌入，浮现出本人未曾意识到的认知模式。xAPI 是同一套方法论在机构规模上的实现：行为痕迹 → 语义分析 → 正式记录遗漏的模式。笔记是最终状态。diff 是一次决定。xAPI 语句是一个参与的瞬间。这些都不在成绩单上。

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

**知识图谱 RAG (Knowledge Graph RAG)** — LightRAG 从大纲 PDF 中抽取相互关联的概念，构建可视化、可查询的力导向知识网络

![LightRAG knowledge graph](docs/LightRAG%20knowledge%20graph.gif)

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
<summary><strong>👤 学生画像与 AI 设置</strong></summary>

- **4 标签页画像** — Profile（头像 + 显示名）、Customized Learning、My Progress、AI Settings
- **学科选择器** — 5 个学术领域（人文、社科、商科、STEM、健康科学），动态示例切换；STEM 自动突出推导类教学法
- **多角色人设组** — 定义多组角色对，每组含性别、性格描述、fandom、关系标签（信任、对抗、师徒等）及关联课程；可折叠面板 + 默认组收藏
- **CP/OC 叙事系统** — 学生定义角色对（Coupling & Original Character）；LLM 使用关系动态作为概念解释的语义锚点
- **My Progress** — 按课程显示颜色块掌握度（绿/黄/红/灰）；不显示任何数值（UX 红线）
- **自定义 AI 指令** — 持久化 `custom_prompt` 文本框，学生可以为 LLM 提供学习偏好上下文
- **Prompt 灵感库** — 可点击的示例 prompt，一键追加到文本框
- **自动保存** — 800ms 防抖保存所有画像字段
- **一句话诊断** — 模板驱动引擎（`student_diagnosis.py`）生成温和的概念差距指引；CoursePage 内琥珀/绿色诊断卡片 + "Jump to Module" 导航
- **隐私红线** — 无数值分数、无班级对比、无排名；教授不可查看学生画像

</details>

<details>
<summary><strong>🤖 多模型 Agent 团队（新功能）</strong></summary>

- **18 个预设模型**，覆盖 9 家 provider：OpenAI（GPT-4o、GPT-4o Mini）、Anthropic（Sonnet 4.6、Haiku 4.5、Opus 4.7）、Google（Gemini 2.5 Flash、Gemini 3 Flash）、DeepSeek（V3、R1）、Mistral（Large、Small）、xAI（Grok 3、Grok 3 Mini）、Groq（Llama 3.3 70B）、MiniMax（MiniMax-01）、GLM/智谱（GLM-4 Flash、GLM-4 Plus）
- **3 个 Agent 角色** — 🧠 主讲解员、🔍 事实核查员、📝 风格适配器；各自独立选模型
- **★ 推荐标签** — Dense 架构模型在 Explainer 角色标记为推荐
- **⚠ MoE 警告** — MoE 模型在 Explainer 角色显示架构警告（"可能产生不一致的结构化输出"）
- **自定义模型** — 下拉底部 `+ Add custom model`；配置名称、model_id、base_url、API Key、成本，支持任意 OpenAI 兼容端点（Ollama、vLLM、本地部署）
- **动态 API Key** — 仅显示当前选用 provider 的密钥输入框；逐 provider 显示 required / not used
- **成本估算** — 每角色 `~$X.XX/gen` + 总计 `💰 Estimated cost per generation` 条
- **Fernet 加密存储** — API Key 静态加密；GET 返回掩码值（`••••••••xxxx`）

</details>

<details>
<summary><strong>🎓 教授设置门户（新功能）</strong></summary>

- **个人信息** — 头像、显示名、多选学科、多选教学模式，自动保存并同步侧边栏
- **学术偏好** — 默认难度级别（14 个分组选项）、课程类型、课时时长、教学设计方法、导出格式；全部使用自定义 AmberSelect 下拉组件
- **模型默认值** — 与学生端相同的 ModelSelectionCard；配置 Agent 团队的课程级默认模型
- **Prompt 模板** — 课程生成的自定义 AI 指令 + 可点击灵感库
- **统一自动保存** — 所有字段 600ms 防抖 + 可视化保存状态指示器

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
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│  前端 (React + TypeScript + Vite)                                                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌───────────────┐ ┌────────┐ ┌────┐│
│  │ Generate  │ │ Courses  │ │  Course  │ │ Knowledge │ │ Student Data  │ │Student │ │设置││
│  │   Page    │ │   Page   │ │   Page   │ │   Graph   │ │    Page       │ │Profile │ │教授││
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘ └──────┬────────┘ └───┬────┘ └──┬─┘│
│       │            │            │              │              │              │          │  │
│  components/ui/  components/generate/    components/analytics/    ModelSelection (共享) │  │
│  (Select, Input)   (SyllabusUpload)   (TrendChart, ReportSections, ...)                  │
│                         GraphViewer（2D 知识图谱 + 掌握度叠层）                             │
│                                              SSE 流式传输                                  │
└───────┼────────────┼────────────┼──────────────┼──────────────┼──────────┼──────────┼──────┘
        │            │            │              │              │          │          │
        ▼            ▼            ▼              ▼              ▼          ▼          ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│  后端 (Flask + Blueprints)                                                                  │
│  ├── app.py (~30 行，仅路由)             ├── config.py (18 模型 + 环境常量)                  │
│  ├── extensions.py (单例：AI、Redis 等)  ├── async_loop.py (后台异步循环)                    │
│  ├──────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  routes/                                                                              │  │
│  │  ├── curriculum.py           生成 / 验架 / 展开 / 保存                                │  │
│  │  ├── curriculum_agent_routes 标记 / 建议 / 应用 / 撤销 / 变更                         │  │
│  │  ├── history.py              CRUD + 收藏 + DOCX 导出                                  │  │
│  │  ├── analytics.py            A2A SSE 分析 + PDF/DOCX/Excel 导出                       │  │
│  │  ├── xapi.py                 xAPI 语句 + Mock 数据种子                                │  │
│  │  ├── feedback.py             学生情绪反馈 + 评论收集                                   │  │
│  │  ├── profile.py              Profile CRUD + model_config + Fernet API Key 加密        │  │
│  │  ├── settings.py             教授设置（偏好、模型、Prompt 模板）                        │  │
│  │  ├── graph.py                知识图谱 + RAG 查询 + /courses 查询                      │  │
│  │  ├── annotations.py          KG 概念标注（confused / important / exam_focus）          │  │
│  │  ├── sources.py              Tavily 源预览                                            │  │
│  │  ├── syllabus.py             PDF/DOCX 解析 + 导入                                     │  │
│  │  └── materials.py            LightRAG 材料摄入                                        │  │
│  └──────────────────────────────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────┐  ┌────────────────────────────────────┐   │
│  │  agents/ (Hive 风格 A2A)    │  │  services/                         │   │
│  │  ├── base.py (BaseNode)     │  │  ├── research.py (Tavily)          │   │
│  │  ├── orchestrator.py        │  │  ├── file_parser.py                │   │
│  │  ├── behavior_analyst.py    │  │  ├── prompt_builder.py             │   │
│  │  ├── risk_detector.py       │  │  ├── xapi_generator.py (⚡ aware)  │   │
│  │  ├── content_optimizer.py   │  │  ├── report_exporter.py (facade)   │   │
│  │  ├── cohort_comparator.py   │  │  ├── chart_generator.py (+history) │   │
│  │  ├── kg_context_analyst.py  │  │  ├── ltm_writer.py (Cold layer)    │   │
│  │  └── curriculum_agent.py    │  │  ├── threshold_checker.py          │   │
│  │       SharedMemory (Redis)  │  │  ├── kg_mapper.py（3 层匹配）      │   │
│  └──────────┬──────────────────┘  │  └── export_{pdf,docx,excel}.py   │   │
│             │                     └─────────────┬──────────────────────┘   │
└─────────────┼───────────────────────────────────┼──────────────────────────┘
              │                                   │
              ▼                                   ▼
┌───────────────────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────────┐
│  PostgreSQL            │  │  Redis   │  │   LightRAG   │  │  data/ltm/   │
│  ├── curricula         │  │ (🔴 Hot: │  │  GraphML KG  │  │  (🔵 Cold:   │
│  ├── xapi_statements   │  │  流水线  │  │  （Hot 层）  │  │   .md YAML   │
│  ├── concept_          │  │  运行时) │  │              │  │   归档快照)  │
│  │   annotations       │  │          │  │              │  │              │
│  └── 🟡 Warm:          │  │          │  │              │  │              │
│      快照 / mastery    │  │          │  │              │  │              │
└───────────────────────┘  └──────────┘  └──────────────┘  └──────────────┘
```

**完整项目流水线**

<img src="docs/Full project pipeline.png" alt="Full Project Pipeline" width="800"/>

**LTM 三层架构**

<img src="docs/3-layer LTM.png" alt="LTM 3-Layer Architecture" width="800"/>

**完整主动式循环**

<img src="docs/Full agentic loop.png" alt="Full Agentic Loop" width="800"/>

📐 **完整架构、逐页数据流、数据库 Schema、红线与项目结构 → [ARCHITECTURE.zh.md](ARCHITECTURE.zh.md)**

---

## 🛠️ 技术栈

| 层级 | 技术 | 职责 |
|------|------|------|
| **前端** | React + TypeScript + Vite | 模块编辑器、A2A 仪表板、SSE 客户端、拖拽排序 |
| **后端** | Python + Flask Blueprints | 模块化路由 API（10 个 Blueprints + 6 个 Agents + 6 个 Services） |
| **AI** | OpenAI GPT-4o / Google Gemini | 内容生成与 A2A 分析（通过 `AI_PROVIDER` 可插拔）；A2A agents 纯 SQL——**分析零 LLM 成本** |
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

## 🗺️ 路线图

- [x] KG ↔ Curriculum 概念映射 — 三层匹配引擎（词边界正则 + 缩写剥离 + 反向查找）
- [x] Knowledge Map 标签页 — 每模块显示 KG 概念定义 + 跨模块依赖关系
- [x] 概念掌握度追踪 — xAPI 动词 + 学生反馈 → `cohort_concept_mastery`；每次分析后自动同步
- [x] GraphViewer 掌握度叠加层 — 填充色=掌握度，描边色=知识层级；无数据概念统一灰色
- [x] KG 双向标注 — 学生标记困惑/重要；教授标记考试重点；匿名聚合生成困惑热力图
- [x] KG → Agentic Loop — `KGContextAnalystNode` 将逐概念困惑度% + 最困惑概念列表注入 CurriculumAgent 上下文
- [x] GraphViewer 角色分流 — 学生端（掌握度过滤 + 困惑社交信号）vs 教授端（高困惑热力图 + 考试重点）
- [x] xAPI ↔ KG 信号桥接 — KG 标注事件同步写入 xAPI statement（动词：flagged / noted）；信号完全统一
- [x] 学生画像 — 4 标签页画像：头像、学科选择器（5 大领域）、CP/OC 叙事锚点、进度颜色块
- [x] 一句话诊断 — 模板驱动概念差距指引 + "Jump to Module" 导航
- [x] AI 设置 — 自定义 Prompt 指令 + 可点击灵感库 + 自动保存
- [x] 多角色人设组 — 多组角色对 + 关系标签、性别、性格描述、关联课程
- [x] 多模型 Agent 团队 — 9 家 provider 的 18 个预设模型 + 自定义模型；★ 推荐标签、⚠ MoE 警告、动态 API Key
- [x] 教授设置门户 — 个人信息、学术偏好、模型默认值、Prompt 模板；全部自动保存
- [x] 按 Provider API Key — Fernet 加密存储、动态检测、掩码 GET 返回
- [ ] 教授 Prompt 模板编辑器 — 数据库驱动的 Prompt 管理 + 版本控制 + 变量高亮
- [ ] 作业时间轴 + 截止日期计算器
- [ ] A2A Phase 2 — CurriculumAgent 接入 LLM（必须 dense 模型）；其余 Agent 保持 sql-only
- [ ] 渐进式摘要 — 学期级 LTM 摘要用于 LLM 上下文管理
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

[![GitHub stars](https://img.shields.io/github/stars/Schlaflied/Plot-Ark?style=for-the-badge&logo=github&color=amber)](https://github.com/Schlaflied/Plot-Ark/stargazers) · [在 star-history.com 查看实时图表 →](https://www.star-history.com/#Schlaflied/Plot-Ark&Date)

<!-- 图表嵌入暂时下架：star 数据点太少时渲染出来是空白坐标轴。
     等 star 涨起来后用官方片段恢复：

<a href="https://www.star-history.com/#Schlaflied/Plot-Ark&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Schlaflied/Plot-Ark&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=Schlaflied/Plot-Ark&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=Schlaflied/Plot-Ark&type=Date" />
 </picture>
</a>
-->

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
