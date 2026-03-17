# Plot Ark — External Feedback Log

> 收录来自ID领域专业人士的外部反馈。用于产品迭代决策和背书引用。

---

## Russ Suvorov — Applied Linguist & CALL Specialist, Western University

**日期：** 2026-03-17
**背景：** Russ是Western Education的CALL课程教授，Yuting的研究生导师之一。Yuting向他发送了Plot Ark的介绍邮件，他主动回复了详细反馈。他是这个工具的第一批外部专业用户。

---

### Feedback Point 1 — 教学设计框架：ADDIE vs. Agile

**原话意思：** ADDIE对线性课程设计没问题，但真实的课程开发往往是迭代的，需要支持cyclical/rapid prototyping的设计流程。

**设计含义：**
- 当前Plot Ark采用线性ADDIE流程（分析→设计→开发→实施→评估）
- 实际ID工作更接近SAM（Successive Approximation Model）或Agile ID
- 建议添加`Design Approach`选项：ADDIE（线性） vs SAM（迭代），后者在大纲中插入"Rapid Prototype → Evaluate → Revise"循环

**优先级：** Medium — 架构影响小，主要是prompt分支和UI改动

---

### Feedback Point 2 — Bloom's分类法与学习者层级校准

**原话意思：** Bloom's本身没问题，但学习目标必须与课程难度匹配。ESL初级课不应该出现"评估"和"创造"层级的目标。

**设计含义：**
- 现有`level`字段（beginner/intermediate/advanced）已存在但未联动Bloom's选择
- 需要在LO生成prompt中加入层级约束规则：
  - Beginner → Remember / Understand 优先
  - Intermediate → Apply / Analyze
  - Advanced → Evaluate / Create
- 这是**最小改动、最高价值**的修复点

**优先级：** High — 直接影响核心输出质量，改动集中在prompt层

---

### Feedback Point 3 — Tavily内容质量与来源过滤

**原话意思：** Tavily抓取的内容质量参差不齐，Q1学术期刊和博客帖子混在一起。需要设置质量标准（Q1 journal only），过滤掠夺性期刊，并加入human-in-the-loop让教育者自己决定用哪些资源。

**设计含义：**
- 现有Tavily管道无来源质量过滤
- 三个方向：
  1. Search query加约束（优先`.edu`、JSTOR、Google Scholar域名）
  2. 后处理过滤层（GPT对来源评级：学术数据库 > 政府/教育机构 > 博客）
  3. **Human-in-the-loop Review Sources步骤**（生成大纲前让用户勾选/删除资源）
- 第3点是他明确指出的，也是最符合ID工作流的设计

**优先级：** High — 影响所有课程输出的可信度；human-in-the-loop是下一个sprint的核心功能

---

## 反馈摘要 & 对路线图的影响

| 反馈点 | 当前状态 | 优先级 | 下一步 |
|--------|----------|--------|--------|
| ADDIE vs Agile设计流程 | 仅ADDIE | Medium | 添加SAM选项，prompt分支 |
| Bloom's层级校准 | 无联动 | **High** | prompt加learner-level规则 |
| Tavily内容质量过滤 | 无过滤 | **High** | Human-in-the-loop来源审阅步骤 |

---

*记录人：Yuting Sun | 2026-03-17 | Claude Sonnet 4.6*
