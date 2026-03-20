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

<p align="center">
  <img src="Logo_Agentic.png" alt="Plot Ark Logo" width="200"/>
</p>

**一款开源主动式课程引擎，通过叙事框架生成基于教学理论的课程内容。**

> 与静态 AI 课程生成器不同，Plot Ark 将循证教学设计原则落地于实践——布鲁姆认知分类法、Krashen 的 i+1 难度递进、以及认知负荷理论——确保生成的课程结构符合真实学习规律。

> **主动式流水线** — Tavily 研究 Agent 优先检索真实学术来源，再将经验证的 URL 注入生成提示词。不会出现幻觉引用。

> **多 AI 提供商** — 通过单个环境变量在 OpenAI（GPT-4o-mini）和 Google Gemini 之间自由切换，自带 API Key 即可使用。

---

## 🎬 演示

**research agent&human in the loop** — Tavily 研究 Agent → 人工信源审核 → 批准/拒绝

![research agent&human in the loop](docs/research%20agent%26human%20in%20the%20loop.gif)

**module adjuistment** — 拖拽排序、内联编辑、所有字段均可修改

![module adjuistment](docs/module%20adjuistment.gif)

**syllabus upload** — 拖入 PDF/DOCX → 自动填充表单字段 + 提取必读材料

![syllabus upload](docs/syllabus%20upload.gif)

**Knowledge Graph** — 概念图、节点详情、自然语言查询与节点高亮

![Knowledge Graph](docs/knowledge%20graph.gif)

▶ [完整演示视频（Google Drive）](https://drive.google.com/file/d/14xBVW0lqy2lpF718XlUqynFn2OurXPgu/view?usp=sharing)

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
- **Markdown 导出** — 将含阅读材料与作业的完整课程导出为 .md 文件
- **复制到剪贴板** — 一键粘贴到任意编辑器

</details>

<details>
<summary><strong>🕸️ 知识图谱（LightRAG）</strong></summary>

- **材料导入** — 上传课程 PDF 和 PPTX；`ingest.py` 将其处理为 LightRAG 知识图谱
- **学科标签页** — 按课程独立显示图谱（商业法、CALL）或合并为 All 视图（994 个节点，586 条边）
- **力导向可视化** — 交互式 2D 图谱，暖棕色调配色；节点大小随连接数缩放
- **节点详情面板** — 点击任意概念节点查看其定义与连接数
- **概念搜索** — 在图谱中筛选并高亮匹配节点
- **知识查询** — 用自然语言对图谱提问；Redis 缓存答案（持久化缓存）
- **查询历史** — 可收藏和删除的历史记录，附学科标签
- **持久事件循环** — LightRAG 异步引擎运行于独立后台线程；首次查询后不再有冷启动延迟

</details>

<details>
<summary><strong>🤖 主动式层（路线图）</strong></summary>

- **xAPI mini-LRS** — mock 学习行为数据（experienced/completed/struggled/passed）驱动教授端 Student Data 面板；学习者进度条、卡点概念洞察、语句流
- **xAPI 事件收集** — 精细化学习者行为追踪（已观看、已跳过、遇到困难）
- **Redis 学习者状态** — 实时档案（已掌握 / 需加强 / 推荐下一步）
- **Professor LTM** — 系统通过编辑历史学习讲师偏好（基于差异对比，无需填写问卷）
- **多语言概念桥接** — 用学习者母语解释概念，同时保留英文术语

</details>

## 🧭 设计理念

大多数 EdTech AI 工具将人工智能视为需要监控的威胁——检测学生是否使用了 AI，标记"非原创"作品，强制要求原创性。

Plot Ark 持完全相反的立场。

**AI 是认知工具，不是威胁。** 一个用 AI 起草答案、然后真正理解它、完善它、并能用自己的语言解释它的学生——这个学生学到了东西。不加理解地复制粘贴，是学生在欺骗自己，而不是需要被系统惩罚的问题。

Plot Ark 没有 AI 检测机制，也永远不会有。它问的不是"你用了 AI 吗？"，而是"学习发生了吗？"——并通过布鲁姆认知分类法对齐、i+1 难度递进和 xAPI 学习行为追踪来回答这个问题。

课程引擎本身也遵循同样的逻辑：AI 生成结构，教学理论约束输出，教师始终掌握最终决策权。工具负责思考；人负责决定。

---

## 🏗️ 架构

**课程生成流水线**

<img src="docs/Course generation.png" alt="Course Generation Pipeline" width="800"/>

**RAG 与知识图谱导入**

<img src="docs/RAG flowchart.png" alt="RAG & Knowledge Graph Ingestion" width="800"/>

**规划中的主动式循环：**
```
xAPI 行为事件 → 课程 Agent → Redis 学习者状态 → 叙事引擎 → LMS
```

---

## 🛠️ 技术栈

| 层级 | 技术 | 职责 |
|------|------|------|
| **前端** | React + TypeScript + Vite | 模块编辑器、SSE 客户端、拖拽排序 |
| **后端** | Python + Flask + SSE | 流式课程生成 |
| **AI** | OpenAI GPT-4o-mini / Google Gemini | 内容生成（通过 `AI_PROVIDER` 可插拔切换） |
| **研究 Agent** | Tavily Search API | 生成前学术信源检索 |
| **历史记录** | PostgreSQL | 课程持久化存储，支持收藏 |
| **缓存** | Redis | 学习者状态（路线图） |
| **知识图谱** | LightRAG + networkx + react-force-graph-2d | 课程材料导入 → 交互式概念图谱 |
| **图谱缓存** | Redis + 内存缓存 | 查询结果缓存（持久化）+ RAG 实例复用 |
| **行为数据** | xAPI 1.0.3 + mini-LRS | 语句采集 → Redis 学习者状态 → 教授分析面板（mock 数据；真实 LMS 集成为路线图） |
| **导出** | IMS Common Cartridge | 兼容主流 LMS 的输出格式 |
| **开发** | Docker Compose | 一键启动本地环境 |

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

知识图谱功能让你导入自己的课程材料（PDF 或 PPTX），并将其呈现为交互式概念图谱进行探索。

### 1. 添加材料

将课程 PDF 和/或 PPTX 放入 `data/materials/` 下对应的学科文件夹：

```
data/materials/
├── your-subject/          ← 每个学科一个文件夹
│   ├── week1.pdf
│   ├── week2.pptx
│   └── ...
└── another-subject/
    └── ...
```

### 2. 运行导入脚本

```bash
# 先设置 OpenAI Key（用于 gpt-4o-mini + text-embedding-3-small）
export OPENAI_API_KEY=sk-...

# 在 backend 容器内执行
docker compose exec backend python ingest.py \
  --input data/materials/your-subject \
  --storage data/lightrag_storage_yoursubject
```

导入费用估算：约 $0.10–0.30 / 每 10 个 PDF（gpt-4o-mini 计费标准）。

### 3. 在后端注册学科

在 `backend/app.py` 中，参照 `lightrag_storage_call` 的现有模式，将你的学科添加到 `SUBJECT_MAP`。

### 4. 在前端添加标签页

在 `frontend/components/GraphViewer.tsx` 中，将你的学科添加到 `SUBJECT_TABS`：

```tsx
const SUBJECT_TABS = [
  { key: 'all', label: 'All' },
  { key: 'business-law', label: 'Business Law' },
  { key: 'call', label: 'CALL' },
  { key: 'your-subject', label: 'Your Subject' },  // ← 在此添加
];
```

### 5. 打开知识图谱标签页

在顶部导航栏切换到**知识图谱**。选择你的学科标签，探索概念图，并使用查询栏对材料提出自然语言问题。

---

## 📁 项目结构

```
plot-ark/
├── docker-compose.yml
├── .env.example
├── docs/
│   ├── architecture.md
│   ├── curriculum generate.gif      ← 演示：课程生成流水线
│   └── knowledge graph.gif          ← 演示：知识图谱与查询
├── frontend/                        ← React + TypeScript + Vite
│   ├── Dockerfile
│   ├── index.tsx                    ← 入口文件
│   ├── App.tsx                      ← 主界面（课程引擎 + 学生视图）
│   ├── components/
│   │   └── GraphViewer.tsx          ← LightRAG 知识图谱查看器
│   └── vite.config.ts
├── backend/                         ← Flask
│   ├── Dockerfile
│   ├── app.py                       ← SSE 端点、布鲁姆映射、图谱 API
│   └── ingest.py                    ← LightRAG 导入脚本（PDF + PPTX）
└── data/
    ├── materials/                   ← 放置课程 PDF/PPTX（已加入 .gitignore）
    ├── lightrag_storage/            ← 商业法图谱（已 gitignore，可重新生成）
    └── lightrag_storage_call/       ← CALL 图谱（已 gitignore，可重新生成）
```

---

## 🗺️ 路线图

- [x] Flask SSE 流式后端
- [x] React 前端，支持模块卡片导航
- [x] Docker Compose 开发环境
- [x] 布鲁姆认知分类法课程代码映射
- [x] i+1 难度递进
- [x] 内联模块编辑（所有字段）
- [x] 拖拽模块排序
- [x] IMS Common Cartridge + Markdown 导出
- [x] Tavily 主动式研究流水线 — 生成前检索真实学术信源
- [x] PostgreSQL 历史记录 — 持久化、收藏、删除课程
- [x] LMS 风格模块侧边栏（参考 D2L Brightspace 布局）
- [x] 多类型资源流水线 — 学术/视频/新闻，附类型标签与预计时长
- [x] 结构自检与自动重试 — 验证复杂度递进与模块数量
- [x] LightRAG 知识图谱 — PDF/PPTX 导入 → 交互式力导向概念图
- [x] 知识图谱查询 — 对课程材料图谱进行自然语言问答，Redis 缓存
- [ ] 作业时间轴 + 截止日期计算器
- [x] 人工审核信源 — 在生成前审批/拒绝 Tavily 检索结果
- [x] xAPI mini-LRS — 语句采集、学习者状态、教授分析面板（mock 数据）
- [x] 大纲导入 — PDF/DOCX → 自动填充表单 + 提取必读材料
- [x] 课程叙事 — 骨架生成阶段自动生成课程故事，教授可编辑
- [ ] Redis 学习者状态管理
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

## ⭐ Star 历史

<a href="https://www.star-history.com/?repos=Schlaflied%2FPlot-Ark.git&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=Schlaflied/Plot-Ark.git&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=Schlaflied/Plot-Ark.git&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=Schlaflied/Plot-Ark.git&type=date&legend=top-left" />
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
