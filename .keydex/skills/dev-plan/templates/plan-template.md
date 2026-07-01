---
mode: dev-plan
cwd: <当前工作目录>
task: <任务标题或总结>
complexity: <simple|medium|complex>
created_at: <ISO8601 时间戳>
constitution_path: <.ktaicoding/CONSTITUTION.md；若项目无宪法则留空>
design_path: <.ktaicoding/des/DES-*.md；设计后开发计划优先；若无 DES 可留空>
requirements_path: <.ktaicoding/req/REQ-*.md；若有则填写>
issues_path: <对应的 .dev/issues/*.csv 路径>
contract_version: v3
---

# Plan: <任务简要标题>

## View 1: Review

### 任务概述

<用 2-3 句话说明任务背景和目标。>

### 设计来源

#### 主设计文档（DES，优先）

- `<DES 路径；无则写「无」并说明降级依据>`

#### 关联需求文档（REQ）

- `<REQ 路径；无则写「无」>`

#### 项目宪法（对齐约束）

- 已加载：`<constitution_path 或「无」>`
- 与实现相关的对齐摘要：<运行时、构建、测试、分层等；无宪法则说明将依赖仓库探测与本范式默认>

#### 默认沿用的设计

- <列出 DES/REQ 中默认沿用的章节、时序、逻辑块、机制>

#### 本次 Plan 的覆盖 / 补充决策

- <哪些地方沿用 DES/REQ>
- <哪些地方被 Plan 明确覆盖>
- <哪些地方只做 TODO 占位>

### 需求边界（已确认）

#### 本次必须实现

- <必须做的内容>

#### 本次明确不做

- <本次不做的内容>

#### TODO 占位 / 并行模块策略

- <哪些字段/模块由别人并行补齐，本次仅消费或预留>

### 现状分析

<调研项目现状后的关键发现，包括涉及的文件、模块、依赖关系等。>

### 关键决策

- **决策 1**：<选择了什么> — 理由：<为什么这样选，放弃了什么替代方案>
- **决策 2**：...

### 否决方案

- <被否决的方案 1> — 原因：<为什么不采用>
- <被否决的方案 2> — 原因：<为什么不采用>

### 执行约束

- <命名约束>
- <框架 / AI 职责边界>
- <不能偏离的设计约束>
- <占位实现约束>

### 测试策略

#### 测试类型

<本次需求涉及哪些测试类型：单元测试 / 集成测试 / 接口测试 / ...>

#### 测试用例

| 功能点 | 测试用例 | 场景 | 预期结果 |
|--------|---------|------|---------|
| <功能 1> | <用例描述> | 正常/边界/异常 | <预期> |
| ... | ... | ... | ... |

#### 测试文件位置

- **若** `.ktaicoding/CONSTITUTION.md` 存在且 §6「测试规范」已规定目录/框架/命名：以宪法为准。
- **否则**（无宪法或宪法未规定测试布局）：本范式默认将验证用例落盘于 **`.dev/test/`**，文件名建议包含 `test_<csv-slug>` 与项目所用扩展名（如 `.py`、`.java` 等），具体由技术栈与 issue 约定。

### 风险与注意事项

- <风险或注意点 1>
- <风险或注意点 2>

### 参考

- `<DES 或 REQ 或代码路径:行号>`
- 其他有用的说明

---

## View 2: Issue Contract

> 本节是执行合同正文。执行 AI 必须先读对应 issue 条目，再读 `design_refs` 指向的 **DES/REQ** 设计段落，再读 `code_refs` 指向的代码，最后才开始写实现。

### Issue 列表概览

| ID | Priority | Title | Depends On | Summary |
|----|----------|-------|------------|---------|
| <ISSUE-010> | P0 | <标题> | <无 / ISSUE-000> | <一句话摘要> |
| ... | ... | ... | ... | ... |

### <ISSUE-010> <标题>

- `id`: <ISSUE-010>
- `priority`: <P0/P1/P2>
- `title`: <标题>
- `summary`: <1-2 句，说明这条 issue 做什么、边界是什么>
- `design_refs`:
  - `<DES 或 REQ 路径:行号或章节>`
  - `<DES 或 REQ 路径:行号或章节>`
- `code_refs`:
  - `<代码路径:行号>`
  - `<代码路径:行号>`
- `acceptance_criteria`:
  - <验收标准 1>
  - <验收标准 2>
- `test_cases`:
  - <测试场景 1>
  - <测试场景 2>
- `constraints`:
  - <执行时不得偏离的约束 1>
  - <执行时不得偏离的约束 2>
- `depends_on`: <无 / ISSUE-000>
- `notes`: <补充说明>

### <ISSUE-020> <标题>

- `id`: <ISSUE-020>
- `priority`: <P0/P1/P2>
- `title`: <标题>
- `summary`: <...>
- `design_refs`:
  - `<DES 或 REQ 路径:行号>`
- `code_refs`:
  - `<代码路径:行号>`
- `acceptance_criteria`:
  - <...>
- `test_cases`:
  - <...>
- `constraints`:
  - <...>
- `depends_on`: <无 / ISSUE-010>
- `notes`: <...>

---

## CSV Projection

> `.dev/issues/<same-basename>.csv` 必须由本 Plan 的 Issue Contract 直接映射生成，固定表头如下：

```text
id,priority,title,refs,dev_state,test_state,owner,notes
```
