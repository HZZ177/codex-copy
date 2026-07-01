---
name: "dev-plan-execute"
description: |
  基于 Issues CSV 连续执行开发任务：以 CSV 为状态源，以 DES/REQ、Plan、项目宪法为语义与约束源完成所有 issue。通过 /dev-plan-execute 触发。

  测试与构建命令从 .ktaicoding/CONSTITUTION.md（若存在）与仓库工程文件解析，不硬编码单一语言。与 dev-plan 配对。

  使用场景：/dev-plan-execute、执行 Issue、开发计划执行、CSV 驱动开发。
invocation: "manual"
argument-hint: "<issues CSV 文件路径>"
---

你现在处于「Dev Plan 执行模式」（同义：原 `execute-issues` skill，已迁移为本目录）。

目标：以 `.dev/issues/*.csv` 为**状态源**，并结合 **DES（若有）、REQ（若有）**、Plan 文件中的 **Review View / Issue Contract**、以及 **项目宪法**，连续完成所有 issue，最后整体交付给用户验收。

## 一、核心思想

这套流程中，文件职责分离：

- **设计文档（DES）**：技术设计主来源（若 `design_path` 或 `design_refs` 指向 DES）
- **需求文档（REQ）**：业务边界与验收追溯（若 `requirements_path` 或 `design_refs` 指向 REQ）
- **项目宪法**（`.ktaicoding/CONSTITUTION.md`）：运行时、构建、测试 §6、分层等硬约束；**具体测试命令须在执行前按宪法 + 仓库解析，不得写死为某一种语言**
- **Plan**：合同正文
  - `View 1: Review` 负责解释为什么这样做
  - `View 2: Issue Contract` 负责定义每条 issue 的完整执行边界、设计锚点、测试和约束
- **Issues CSV**：状态投影，只负责执行顺序、状态流转和中断恢复

**强制要求**：

- CSV 是**唯一状态源**
- DES + REQ + Plan + 宪法（若存在）共同构成**语义与约束源**
- 执行时绝不能只看 CSV 就直接写代码
- 每条 issue 开始前，必须先深入阅读：
  1. Plan frontmatter 中的 `design_path` / `requirements_path`（若有），并打开对应 DES/REQ
  2. 该 issue 的 `design_refs` 指向的 DES/REQ 段落
  3. 对应 Plan 的 `View 1: Review` 中的关键决策 / 覆盖决策 / 执行约束
  4. 对应 Plan 的 `View 2: Issue Contract` 条目
  5. 对应代码 refs
- **不能偏离** DES/REQ/Plan/宪法已确认的技术路径与约束；如发现冲突、歧义、无法落地，先记录并向用户反馈，而不是自行改路线

**重要：你不负责 Git 提交。整体完成后由人工验收、人工提交。**

## 二、工具链与测试命令（启动时必须解析）

在开始执行任何 issue 前，完成**一次**工具链解析，并在「任务概览」中写出本轮采用的**验证命令模板**（供 Step 5 与最终汇报使用）：

1. **读取宪法（若存在）**  
   路径优先顺序：Plan frontmatter 的 `constitution_path`（若填）→ 默认 `.ktaicoding/CONSTITUTION.md`。  
   提取：**§1.3 技术栈**、**§2 技术约束**（构建与打包）、**§6 测试规范**（框架、目录、命名）。

2. **仓库探测（补充宪法未写明或需确认的细节）**  
   非穷尽示例：`pom.xml` / `build.gradle` / `settings.gradle.kts`；`go.mod`；`pyproject.toml` / `requirements.txt`；`package.json`（后端子项目时指向对应目录）。用于推断构建与测试入口。

3. **确定「单条 issue 完成后的验证方式」**  
   - 若宪法 §6 已规定测试命令或任务名：以宪法为准（如 `mvn test`、`gradle test`、`go test ./...` 等）。  
   - 若项目为 **Python** 且需运行解释器/ pytest：再检测项目根目录 `.venv/Scripts/python.exe`（Windows）或 `.venv/bin/python`（Unix）；**仅在此类项目**下要求虚拟环境；Windows 下对含 `.venv` 的路径**使用 PowerShell** 执行命令。  
   - 若宪法与仓库均无法确定：在 Review/约束与 issue `notes` 中向用户澄清前，可采用**最小合理**的项目惯例命令，并在 `notes` 留痕。

4. **测试落盘目录（写测试文件时）**  
   - 若宪法规定测试根目录与命名：遵循宪法。  
   - **否则**：本范式默认 **`.dev/test/`**；文件名建议包含 `test_<csv-slug>` 与项目所用扩展名（由技术栈决定，如 `.py`、`.java` 等）。

## 三、核心约定

1. CSV 是唯一状态源：只读写这一份 CSV 的状态字段
2. DES/REQ + Plan + 宪法是语义与约束源：实现含义、边界、设计路线、测试依据均须从中获取
3. 一行一更新：每完成一行后立即写回 CSV
4. 以 CSV 文件为单位连续执行：所有行连续完成，中间不停顿，全部完成后统一向用户汇报
5. 跳过已完成：`dev_state=已完成` 且 `test_state=已完成` 的 issue 直接跳过
6. 执行顺序：每条 issue 遵循 读设计 → 读约束 → 写实现 → 写测试 → 跑测试 → 写回状态
7. 不做 Git 操作
8. 状态枚举固定：
   - `dev_state`：`未开始|进行中|已完成`
   - `test_state`：`未开始|进行中|已完成|失败`
9. KISS / YAGNI：不做无关重构，不引入新架构，不擅自偏离已确认路线
10. 发现设计冲突必须停下来澄清：若 DES、REQ、Plan、宪法、现有代码冲突，或 issue 信息不足以安全编码，必须记录并向用户反馈

## 四、输入

1. `$ARGUMENTS` 为 issues CSV 路径（必须提供）
2. 这个 CSV 文件是唯一状态源，只读写这一份 CSV
3. 禁止新建其他 CSV 文件
4. CSV 固定表头必须是：

```text
id,priority,title,refs,dev_state,test_state,owner,notes
```

5. 必须自动定位与该 CSV **同 basename** 的 Plan 文件：
   - `.dev/plans/<same-basename>.md`
   - 找不到就报错并停止执行
6. 从 Plan frontmatter 读取（若存在）：`constitution_path`、`design_path`、`requirements_path`
7. 执行前读取：
   - 若 `design_path` 存在：读取 DES
   - 若 `requirements_path` 存在：读取 REQ（可与 DES 叠加）

## 五、整体执行流程

### 启动：首次读取 CSV + 定位 Plan / DES / REQ / 宪法 + 输出概览

1. 读取 CSV，校验表头
2. 定位对应 Plan 文件
3. 解析工具链与验证命令（见**第二节**）
4. 读取 Plan：`View 1: Review`、`View 2: Issue Contract`
5. 按 frontmatter 与后续需要读取 DES/REQ
6. 若存在宪法路径且文件存在，加载宪法中与本次任务相关的约束摘要（用于执行全程）
7. 统计总条数、已完成条数、待执行条数
8. 输出执行计划摘要：

```text
任务概览：
- 总计: X 条
- 已完成（跳过）: X 条
- 待执行: X 条
- Plan: <plan路径>
- DES: <路径或无>
- REQ: <路径或无>
- 宪法: <路径或无>
- 本轮验证命令（示例）: <一条或多条，来自 §2 解析>

执行顺序：
1. [id] title
2. [id] title
...

开始执行。
```

9. 根据待执行条数判定执行模式，进入执行循环

### 执行模式判定

- **≤10 行 → 轻量模式**：首次读取后按内存顺序执行，不逐行重读 CSV
- **>10 行 → 逐行读取模式**：每完成一行写回 CSV 后，重新读取文件找下一条未完成行

共同约束：每完成一行都必须立即写回 CSV。

### 轻量模式执行循环（≤10 行）

```text
1. 首次读取 CSV，记录所有待执行行
2. for 每条待执行行:
   a. 执行该行（见「单条 issue 的执行步骤」）
   b. 写回 CSV
3. 全部完成 → 进入整体汇报
```

### 逐行读取模式执行循环（>10 行）

```text
loop:
  1. 重新读取 CSV → 找到第一条未完成行
  2. 如果没有未完成行 → 退出循环，进入整体汇报
  3. 执行该行（见「单条 issue 的执行步骤」）
  4. 写回 CSV
  5. 回到 1
```

## 六、单条 issue 的执行步骤

### Step 1: 锁定目标

- 将 `dev_state` 置为 `进行中`
- `test_state` 保持 `未开始`
- 写回 CSV

### Step 2: 深入上下文收集（必须执行，不能跳过）

按以下顺序收集并理解上下文：

1. 在 Plan 的 `View 2: Issue Contract` 中定位当前 `id` 对应条目
2. 读取该 issue 条目的：`summary`、`design_refs`、`code_refs`、`acceptance_criteria`、`test_cases`、`constraints`、`depends_on`
3. 根据 `design_refs` 与已加载的 DES/REQ，阅读对应设计段落
4. 回到 Plan 的 `View 1: Review`，读取与本条 issue 有关的设计来源、关键决策、否决方案、执行约束
5. 再读取 `code_refs` 和 CSV 中 `refs` 指向的代码

**严格要求**：

- 若 DES/REQ 已给出实现路径，执行时必须按该路径落地，不能擅自重设计
- 若 Plan 对设计做了覆盖，必须以 Plan 的覆盖决策为准
- 若宪法条文与实现相关，不得违反；冲突须停下澄清
- 若尚未搞懂本条 issue 的设计语义，不允许开始写实现

### Step 3: 写实现

- 写最小代码满足该 issue 的 `acceptance_criteria`
- 复用项目既有模式，不引入新架构
- 不偏离 `constraints`

### Step 4: 标记开发完成

- 将 `dev_state` 置为 `已完成`
- 将 `test_state` 置为 `进行中`
- 写回 CSV

### Step 5: 写测试并验证

- 测试文件位置：**宪法优先**；否则本范式默认 `.dev/test/`
- 根据该 issue 的 `test_cases` 编写测试
- 使用**第二节**解析得到的验证命令运行测试，确认通过

### Step 6: 处理测试结果

- **测试通过**：`test_state` → `已完成`；`notes` 追加 `done_at:<日期>`；写回 CSV；继续下一条
- **测试失败，可修复**：修复实现后重跑验证命令；通过后按「测试通过」处理
- **测试失败，无法修复**：`test_state` → `失败`；`notes` 追加 `test_failed:<原因>`；写回 CSV；跳到下一条

## 七、阻塞处理

单条 issue 遇到无法自行解决的问题时：

1. `notes` 记录：`blocked:<原因>`、已做排查、与 DES/REQ/Plan/宪法的冲突点（如有）、建议的下一步
2. `dev_state` 保持 `进行中`
3. 写回 CSV
4. 跳到下一条继续执行，不因单条阻塞而停止整体流程

## 八、完成：整体交接汇报

所有 issue 处理完毕后，输出整体交付报告；**「建议验收时运行」须填写第二节解析得到的真实命令**，勿硬编码为 pytest（除非该项目解析结果即为 pytest）。

```text
任务执行完毕

完成：X/Y 条
测试失败：Z 条（如有）
阻塞：W 条（如有）

--- 各 issue 摘要 ---

[id-010] title — ✅ 完成
  设计依据: <DES/REQ 锚点 / Plan issue>
  实现: path/to/file
  测试: path/to/test（X 个用例，全部通过）

...

--- 整体测试 ---

建议验收时运行: <第二节解析的验证命令>

等待你的验收。验收通过后请自行 git commit。
如需修改某条 issue，请指定 id 和问题。
```

## 九、用户回应后的行为

- 用户说「某条有问题/改一下 XXX-020」→ 重新读取该条对应的 Plan issue 与 DES/REQ 设计，再只重执行该条
- 用户说「Plan 改了」→ 必须重新读取最新 Plan
- 用户说「重跑」→ 重新读取 CSV + Plan + DES/REQ + 宪法，执行所有未完成的行
- 用户说「全部重跑」→ 将所有 `dev_state` 和 `test_state` 重置为 `未开始`，从头执行

## 十、进度查看

用户可随时运行脚本查看整体进度（将 `<skill-root>` 替换为已安装的 `dev-plan-execute` 技能根目录，如本仓库 `skills/dev-plan-execute`）：

```bash
python <skill-root>/scripts/check-states.py <csv路径>
```
