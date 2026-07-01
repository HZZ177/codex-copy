---
name: dev-plan-e2e
description: |
  Dev Plan 后置/旁路 E2E 验证技能。用于在 dev-plan 生成后产出独立的页面级 E2E CSV 合同，并在 dev-plan-execute 完成后按 CSV 合同使用官方 Playwright MCP runtime 像真实用户一样操作页面、做页面可见结果断言、截图留证并回填结果。

  使用场景：/dev-plan-e2e、E2E 合同、页面级验收、Playwright MCP、真实后端页面验证、dev-plan 后生成 E2E CSV、dev-plan-execute 后执行 E2E。

  本 skill 独立于 dev-plan/dev-plan-execute，不修改业务代码，不回流修复；正式执行默认只保留 CSV 状态与截图证据。CSV 是唯一 E2E 合同，不沉淀长期 PageObject/POM、case-specific 脚本、接口日志、console/network/action-log 等非页面操作产物。
invocation: "manual"
argument-hint: "<Plan/Issues CSV 路径 | --execute E2E合同CSV | --check E2E合同CSV>"
---

# Dev Plan E2E（CSV 合同 + Playwright MCP Runtime 验证）

## 目标

`dev-plan-e2e` 是主开发流程外的轻量页面级 E2E 验证 skill，服务于两个时间点：

1. **合同准备模式**：在 `/dev-plan` 生成 Plan + Issues CSV 后调用，读取 Plan、Issues CSV、DES/REQ、宪法与前端页面代码，产出 `.dev/e2e/contracts/*.csv` E2E CSV 合同。
2. **执行验证模式**：在 `/dev-plan-execute` 完成后调用，按 E2E CSV 合同逐条使用**官方 Playwright MCP runtime**模拟真实用户操作页面、依据页面可见结果判断是否通过、截图留证并回填 CSV 状态。

本 skill 的重点是嵌入开发线性流程，快速证明当前需求页面核心路径是否真实可用。它不负责长期 POM/PageObject 资产沉淀；稳定回归资产应由测试团队或专项流程另行维护。正式执行不追求接口级审计或日志级排障，默认只做页面操作闭环。

## 核心原则：效率优先

`dev-plan-e2e` 本身应当是**沉淀后的高效率 E2E skill**，不是每次执行时再探索、再反复优化流程的实验场。当前对本 skill 的调试讨论属于建设阶段；一旦进入实际使用，skill 应默认按轻量、高确定性的闭环执行。

执行模式默认采用最小闭环：少读文件、少调用 MCP、少落盘证据、快速得出可信结论。

- 合同准备阶段负责识别页面路由、用户可见锚点和页面清理路径；执行阶段默认不重复阅读大量源码。
- 成功路径只保留 CSV 状态和必要截图；`snapshot` 只作为 MCP 运行时观察手段，不默认落盘。
- 正式执行不默认采集接口请求、console、network、action-log、manifest 等非页面操作产物。
- 执行完成并回填 CSV 后，默认关闭 Playwright MCP browser session，避免残留 Chrome；除非失败现场需要用户立即查看。
- skill 的正式行为应稳定、轻量、可重复；流程改进发生在 skill 维护阶段，不应污染单次 E2E 执行产物。
- 若一个简单创建类用例需要大量手工往返或产生 CSV/截图之外的大量文件，应视为 skill 设计问题并在维护阶段修正，而不是作为正常执行模式。

### 默认执行预算

单条普通页面创建/编辑用例的目标：

- 交互耗时：优先控制在 2–5 分钟内；环境未就绪应快速阻塞。
- 成功路径 MCP 调用：导航/登录、运行时 snapshot 观察、表单操作、保存、页面可见断言、截图、页面清理，避免重复观察。
- 成功路径 evidence：默认只保留 CSV 回填 + 1 张成功截图；必要时可保留失败截图。
- 失败路径 evidence：默认只保留 CSV 失败摘要 + 1 张失败截图；不默认保存 snapshot/network/console/action-log。
- 若确需深度诊断（network/console/action-log/snapshot 落盘），必须由用户明确要求进入诊断模式，不属于默认 E2E 执行。

## 非目标（强制）

- 不修改业务代码、前端代码、后端代码、DES、REQ、Dev Plan 或主 Issues CSV。
- 不因 E2E 失败自动回到开发流程修复。
- 不降低断言，不把真实页面 E2E 降级为 pytest、API smoke test 或纯接口造数。
- 不把 E2E CSV 当成需求源；E2E CSV 只是 E2E 合同与执行状态投影。
- 不清理非 E2E 前缀测试数据。
- 不自建完整浏览器自动化 MCP。
- 不维护长期 PageObject/POM、页面资产 registry、case plan JSON、动作 DSL 文件。
- 不生成 `.dev/e2e/scripts/<contract>/<case_id>.py` 这类 case-specific Python Playwright 脚本。
- 不兼容旧脚本生成模式；旧的 `script_path` 字段和 `e2e_state=已生成` 已删除。

## 触发方式

```text
/dev-plan-e2e <.dev/plans/*.md 或 .dev/issues/*.csv>
/dev-plan-e2e --execute <.dev/e2e/contracts/*.csv>
/dev-plan-e2e --check <.dev/e2e/contracts/*.csv>
```

- 无 `--execute` / `--check`：进入**合同准备模式**。
- `--execute`：进入**执行验证模式**。
- `--check`：只读查看 E2E CSV 状态。

## 产物路径

```text
.dev/e2e/
├── contracts/       # E2E CSV 合同（唯一合同）
├── evidence/        # 截图证据；默认只保留 success/failure 截图
└── reports/         # 汇总报告（可选，默认不生成）
```

文件命名：

- E2E 合同优先复用 Plan/Issues 同 basename：`.dev/e2e/contracts/<plan-issues-basename>.csv`
- 对应证据目录：`.dev/e2e/evidence/<plan-issues-basename>/<case_id>/<run_id>/`
- 成功截图：`.dev/e2e/evidence/<plan-issues-basename>/<case_id>/<run_id>/success.png`
- 失败截图：`.dev/e2e/evidence/<plan-issues-basename>/<case_id>/<run_id>/failure.png`
- `run_id` 统一使用 `YYYY-MM-DD_HH-mm-ss`。

其中 `<plan-issues-basename>` 必须与 `.dev/plans/<same-basename>.md`、`.dev/issues/<same-basename>.csv` 对齐，不再额外追加 `-e2e`。若没有上游 Plan/Issues（如临时 demo），也必须使用同格式时间戳 slug：`YYYY-MM-DD_HH-mm-ss-<slug>.csv`。

若目标合同文件已存在，默认禁止静默覆盖；需要覆盖时必须由用户明确说明。

## E2E CSV schema

CSV 是唯一 E2E 合同和状态投影。固定表头：

```text
case_id,priority,source_issue_id,title,refs,page_route,auth_profile,preconditions,selector_contract,fixture_contract,steps,assertions,cleanup,e2e_state,result_state,evidence_path,owner,notes
```

### 字段说明

| 字段 | 说明 |
|------|------|
| `case_id` | E2E 用例 ID，如 `e2e-001` |
| `priority` | `P0|P1|P2` |
| `source_issue_id` | 来源 dev-plan issue id |
| `title` | E2E 用例标题 |
| `refs` | Plan/DES/REQ/页面代码最小引用；可包含 API 代码作为合同准备参考，但正式执行默认不做接口断言 |
| `page_route` | 页面路由，如 `/agent-manage/agent`；非页面场景填 `N/A` |
| `auth_profile` | 认证方式，如 `skip_sso_dev`、`manual_token`、`super_admin_token`、`skip_sso_dev_or_E2E_WEB_TOKEN` |
| `preconditions` | 后端、前端、权限、官方 Playwright MCP、环境变量等前置条件 |
| `selector_contract` | 页面语义锚点合同：按钮、placeholder、modal 标题、表格列等；不是长期 selector 资产 |
| `fixture_contract` | 测试数据前缀、创建方式、清理策略 |
| `steps` | 用户操作步骤，保持直观可读 |
| `assertions` | 页面可见结果断言摘要；默认不写 API/DB/日志断言 |
| `cleanup` | 页面清理动作与安全约束；默认优先通过页面删除/撤销 |
| `e2e_state` | `待准备|已准备|跳过` |
| `result_state` | `未执行|进行中|通过|失败|阻塞|跳过` |
| `evidence_path` | 截图证据路径，通常为 success.png 或 failure.png |
| `owner` | 负责人，默认空 |
| `notes` | 失败原因、skip 原因、环境说明、时间戳、`schema_version=2.0; execution_mode=mcp-runtime` 等 |

### CSV 单元格表达建议

`selector_contract` 保持半结构化、可读，例如：

```text
route=/agent-manage/agent; button=新增 Agent; input.placeholder=请输入 Agent 名称; modal.title=填写新版本描述; table.contains=Agent 名称
```

`steps` 保持用户动作序列，例如：

```text
打开页面; 点击新增 Agent; 填写名称/描述/主体提示词; 保存; 填写版本描述; 确认保存; 搜索并验证表格
```

`assertions` 保持验收断言，例如：

```text
UI: 表格包含测试 Agent 名称和描述；清理后页面搜索结果不再包含测试 Agent
```

`cleanup` 必须直观写清安全边界，例如：

```text
仅清理 name 以 e2e-agent- 开头的数据; 删除使用 id+versionSeq
```

## 状态机

### 准备状态 `e2e_state`

- `待准备`：合同信息不足，不能执行。
- `已准备`：合同足够，可由官方 Playwright MCP runtime 执行。
- `跳过`：合同层面跳过。

### 执行状态 `result_state`

- `未执行`：尚未运行。
- `进行中`：当前 case 已开始执行。
- `通过`：合同断言通过，证据已落盘。
- `失败`：页面操作、业务断言或清理失败，证据已落盘。
- `阻塞`：环境、认证、权限、官方 Playwright MCP 缺失、服务不可用等导致无法有效验证。
- `跳过`：用户授权或合同声明跳过。

可执行条件：

```text
e2e_state=已准备 and result_state=未执行
```

## 合同准备模式

### 输入

- Plan 路径：`.dev/plans/*.md`
- 或 Issues CSV 路径：`.dev/issues/*.csv`，自动定位同 basename 的 Plan。

### 读取顺序（强制）

1. 读取 Plan frontmatter：`issues_path`、`design_path`、`requirements_path`、`constitution_path`。
2. 读取 Plan 的 `View 1: Review` 与 `View 2: Issue Contract`。
3. 读取 Issues CSV，只作为 issue 索引和 dev/test 状态参考。
4. 读取 DES/REQ 中与验收、页面操作、测试相关章节。
5. 读取 `.ktaicoding/CONSTITUTION.md` 中测试、前端、运行环境约束。
6. 对候选页面场景读取前端页面代码；API 代码只在需要理解保存后页面行为或页面删除入口时作为辅助参考，不能把正式 E2E 执行变成接口测试。

### 候选 E2E 场景识别

优先纳入：

- 页面表单、抽屉、弹窗、表格、搜索、分页、跳转。
- 权限按钮显隐，如 `hasButtonPerm('btn:xxx:create')`。
- 前后端字段契约，如请求 alias、响应字段、表格列。
- 必须通过真实后端数据证明的验收项。
- 用户验收主要发生在页面上的核心路径。

暂不纳入：

- 纯后端算法。
- 纯 DB migration。
- 纯 worker/定时任务，除非 DES/Plan 明确要求页面观测。
- 无页面入口的内部协议。

### 页面可测性调研（强制）

对每个页面 E2E 候选场景，必须先完成 runtime 可操作性调研：

1. 读 `admin_frontend/src/router/routes.ts`，确认 route、name、title、page permission。
2. 读页面 `index.vue`，确认 `tl-*` 布局、按钮、权限 gating、保存链路。
3. 读 `data.ts` 与 `components/*.vue`，提取 button 文案、placeholder、form label、modal title、tab 文案、table column title。
4. 如页面保存/删除链路不清晰，可读 `admin_frontend/src/api/<module>/index.ts` 辅助理解页面行为；正式执行仍只走页面操作，不做接口调用或接口断言。
5. 记录官方 Playwright MCP 运行时需要观察的语义锚点；snapshot 只在运行时查看，不默认落盘为 evidence。
6. 在合同中记录不稳定锚点风险：
   - 不盲猜 `.ant-drawer`；
   - `tl-drawer` 标题 slot 可能不在 `.ant-drawer` 根节点；
   - Ant Design Vue 中文按钮可访问文本可能出现空格，如 `保存` → `保 存`；
   - 优先依赖用户可见语义、placeholder、modal title、表格文本。

### 输出

1. 生成 E2E 用例 JSON 中间数据（仅作为 `generate-e2e-csv.py` 输入，不是合同）。
2. 调用 `scripts/generate-e2e-csv.py` 生成 E2E CSV。
3. 调用 `scripts/validate-e2e-csv.py` 校验。
4. 汇报合同路径、用例数量、P0 用例、跳过/待确认项。

合同准备模式只生成 CSV 合同，不生成 Playwright 脚本，不执行浏览器，不生成第二份 case plan/DSL 文件。

## 执行验证模式

### 输入

`.dev/e2e/contracts/*.csv`

### 官方 Playwright MCP Runtime 执行协议

执行验证模式使用官方 Playwright MCP 作为浏览器运行时能力。`dev-plan-e2e` 不自建浏览器自动化 MCP，不生成长期 PageObject，不生成 case-specific Python Playwright 脚本。

#### MCP 边界

官方 Playwright MCP 只负责“手和眼”：打开页面、观察页面、点击、输入/填充、等待、截图。snapshot 是运行时观察页面结构的手段，不是默认落盘文档。

`dev-plan-e2e` skill 负责：读取 E2E CSV，解释 `selector_contract`、`fixture_contract`、`steps`、`assertions`、`cleanup`，决定下一步页面动作，依据页面可见结果判断断言是否满足，截图留证，并回填 E2E CSV 状态。

正式执行默认不使用 MCP network/console 作为证据来源，不保存接口日志、console 日志、action-log 或 manifest；除非用户明确要求进入诊断模式。

#### MCP 可用性

执行前必须确认当前 Codex 环境已暴露官方 Playwright MCP 工具。工具名以当前环境实际暴露为准，正式执行默认只使用页面操作能力：navigate、click、type/fill、wait、snapshot（运行时查看）、screenshot。

若官方 Playwright MCP 不可用：

- 不得自建替代 server；
- 不得退化为生成 Python Playwright 脚本；
- 应将当前 case 标记为 `result_state=阻塞`；
- `notes` 追加 `Playwright MCP unavailable`；
- `evidence_path` 留空或指向失败截图（若已截图）。

### 执行循环

1. 调用 `scripts/validate-e2e-csv.py` 校验合同。
2. 找到第一条满足条件的用例：`e2e_state=已准备` 且 `result_state=未执行`。
3. 写入 `result_state=进行中`。
4. 创建 evidence run 目录。
5. 从 CSV 行解释临时执行上下文：
   - `page_route` → navigate 目标；
   - `auth_profile` / `preconditions` → 认证与环境前置；
   - `selector_contract` / `steps` → 页面动作语义；
   - `assertions` → 页面可见结果断言；
   - `fixture_contract` / `cleanup` → 测试数据前缀与页面清理规则。
6. 走页面操作快速路径：一次 navigate/login，运行时 snapshot 定位语义锚点，批量 fill/click 完成主流程。
7. 依据页面可见结果断言：例如列表出现目标名称、详情页展示目标字段、toast/状态文本符合预期。
8. 通过页面入口完成清理：例如搜索目标数据后点击删除/确认，再搜索确认页面不再展示目标数据。
9. 成功路径只写最小 evidence：CSV 回填 + 1 张成功截图；失败路径只写 CSV 失败摘要 + 1 张失败截图。
10. 当前 case 完成并回填 CSV 后关闭 Playwright MCP browser session；若失败现场需要用户查看页面，可在 `notes` 中说明并暂不关闭。
11. 根据结果更新当前 E2E CSV，继续下一条，直到没有可执行用例。

### 快速路径策略

- 不要在执行阶段反复读取已在合同中固化的页面源码；只有合同失效或断言需要解释时才回读源码。
- snapshot 只在运行时帮助 Agent 看页面结构；不要每个动作后保存 snapshot 文件。
- 对表单填写优先用 `browser_fill_form` 一次填多字段。
- 默认不做 API 断言、不读取 network、不执行 `evaluate(fetch)` 作为验证或清理手段。
- 清理优先走页面上的搜索、删除、确认、再搜索验证；如果页面没有清理入口，应在 CSV 中标记清理受限或阻塞，而不是默认改用接口清理。
- 默认不采集 console/network/action-log/manifest；只有用户明确要求诊断模式时才启用。

### 失败处理

失败时只做以下动作：

- 保存一张失败截图。
- 在 E2E CSV `notes` 中记录失败摘要、当前 URL、关键可见文本。
- 不保存 snapshot、action-log、manifest、console、network，除非用户明确要求诊断模式。

禁止：

- 修改业务代码。
- 修改页面以适配测试。
- 修改断言迁就现状。
- 页面创建失败后改用 API 创建来通过。
- 页面断言失败后改用 API/DB/日志断言来通过。
- 回写主 Dev Plan Issues CSV。
- 自动调用 `dev-plan-execute` 返工。

## Evidence 规范

正式执行的 evidence 只服务于“人能确认页面结果”，不服务于接口审计或日志排障。

### 成功路径

成功路径默认只保留 CSV 回填 + 一张成功截图，并在回填完成后关闭 Playwright MCP browser session：

```text
.dev/e2e/evidence/<plan-issues-basename>/<case_id>/<run_id>/
└── success.png
```

CSV 的 `evidence_path` 指向 `success.png`，`notes` 写极简页面结果摘要，例如：

```text
passed_at=2026-06-09; page_assert=created_visible; cleanup=page_deleted
```

### 失败路径

失败路径默认只保留 CSV 回填 + 一张失败截图：

```text
.dev/e2e/evidence/<plan-issues-basename>/<case_id>/<run_id>/
└── failure.png
```

CSV 的 `notes` 写失败摘要，例如：

```text
failed_at=2026-06-09; reason=未看到新增按钮; current_url=...
```

### 默认禁止的 evidence

正式执行默认不生成以下文件：

- `manifest.json`
- `action-log.jsonl`
- `network*.json` / `network.txt`
- `console.json`
- `snapshot*.md` / `snapshot*.json`
- `cleanup-result.json`

这些只属于诊断模式。诊断模式必须由用户明确要求，不能作为默认 E2E 执行产物。

## 查看状态模式

`--check` 调用 `scripts/check-e2e-states.py`，只读输出：总用例数、准备状态统计、执行状态统计、下一条可执行用例、execution mode、失败/阻塞/跳过用例及证据路径。

## 脚本说明

- `scripts/generate-e2e-csv.py`：从 JSON 数组生成固定 schema CSV；JSON 只是生成输入中间格式，不是合同。
- `scripts/validate-e2e-csv.py`：校验表头、必填字段、状态枚举和高风险字段。
- `scripts/check-e2e-states.py`：只读统计 E2E CSV 状态。
- `scripts/update-e2e-result.py`：最小 CSV 回填工具，只更新 `result_state`、`evidence_path`、`notes`。

## 与现有流程的关系

- 上游读取 `dev-plan` 产物，但不修改它。
- 下游可在 `dev-plan-execute` 完成后执行，但不驱动返工。
- E2E CSV 是独立合同，不替代主 Issues CSV。
- 本 skill 只服务开发阶段的运行时验证；稳定回归测试资产沉淀由测试团队或专项流程处理。

## 参考模板与资料

执行本 skill 时优先读取以下资料，避免每次从零发觉页面规律：

- Skill 宪法：`constitution.md`
- E2E 合同模板：`templates/e2e-contract-template.md`
- 页面模式 Cookbook：`references/page-pattern-cookbook.md`
- E2E 场景选择：`references/e2e-scenario-selection.md`
- CSV 合同模式：`references/csv-contract-patterns.md`
- Playwright MCP runtime 启发：`references/runtime-heuristics.md`
- 项目前端约定摘要：`references/project-frontend-conventions.md`
- 页面探索清单：`references/page-e2e-exploration-checklist.md`
- 失败分类：`references/e2e-failure-classification.md`
