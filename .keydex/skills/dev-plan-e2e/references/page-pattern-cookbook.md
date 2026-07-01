# 页面模式 Cookbook

本文件沉淀项目级页面模式，不记录具体页面 selector、XPath 或 MCP ref。

## 1. 标准 CRUD 表格页

代表页面：Agent、Skill、MCP、业务线、用户、角色、评测用例等。

常见结构：

- `tl-filter` 搜索区：输入框、下拉框、日期范围、查询、重置、新增。
- `tl-table` 表格区：列标题、行数据、详情/编辑/更多。
- `tl-drawer` 表单区：新增/编辑/详情复用一个抽屉。
- 删除通常在行操作或“更多”菜单中，可能弹 `Modal.confirm`。

E2E 合同建议：

```text
selector_contract: route=...; search.placeholder=...; button=新增; table.column=...; row.action=更多/删除; drawer.title=...; modal.title=确认删除
steps: 打开页面; 搜索前缀; 新增; 填表; 保存; 搜索验证; 页面删除; 再搜索确认暂无数据
assertions: 表格包含测试名称/描述; 清理后暂无数据
cleanup: 仅删除 name 以 e2e- 前缀开头的数据
```

MCP 运行时规则：

- 先 snapshot 一次定位搜索区、表格和新增按钮。
- 表单优先 `fill_form` 一次填写多字段。
- 点击“更多”后必须重新 snapshot 获取浮层菜单。
- 点击删除后必须重新 snapshot 获取确认弹窗。

## 2. 抽屉 + 二次弹窗保存

代表：Agent 新增保存后填写版本描述。

常见风险：

- Ant Design Vue 中文按钮在可访问文本里可能变成 `保 存`、`确 认`。
- 保存后可能不是立即提交，而是打开二次 modal。
- 抽屉 title slot 不一定在根节点可见。

合同建议记录：

```text
selector_contract: button=保存; modal.title=填写新版本描述; modal.textarea.placeholder=请输入本次新版本的变更说明; button=确认保存
```

## 3. Chat / 流式输出页

代表：调试工具、Chat 工作台。

常见结构：

- 左侧上下文配置：应用、用户、版本、会话列表。
- 中间消息区：空态、消息气泡、发送中/停止。
- 底部 composer：输入框、上传、发送。
- 右侧调试/详情面板：模型配置、System Prompt、工具/Skill 绑定。

E2E 合同建议：

```text
selector_contract: combobox=应用; textbox=用户 ID; button=开始会话; textbox.placeholder=输入协作消息; button=发送/停止; message.contains=...
steps: 选择应用和版本; 输入用户; 开始会话; 输入短消息; 发送; 等待 assistant 消息完成; 可选打开 trace
assertions: 会话创建成功; 用户消息可见; assistant 输出从 streaming 变为完成态; 停止按钮在流式期间可见
cleanup: 若有取消/停止按钮，先停止未完成流; 测试会话使用 e2e 前缀或固定测试用户隔离
```

MCP 运行时规则：

- 流式输出不要盲等固定长时间；优先等待“停止按钮消失 / 发送按钮恢复 / assistant 消息不再变化”。
- 可用短 prompt 降低等待成本。
- 不默认保存 console/network；失败时只截图并在 notes 写当前可见状态。

## 4. Trace / Explorer 只读追踪页

代表：链路追踪、Trace Explorer、调试页 Trace 弹窗。

常见结构：

- 筛选区：业务线、Session ID、Trace ID、用户 ID、应用、状态、时间范围。
- 列表区：Session 行、Trace 数、最新 Trace 状态、查看按钮。
- Explorer：顶级 Trace 列表、Trace 树、旁路事件树、节点详情、fork/跳转调试。

E2E 合同建议：

```text
selector_contract: textbox.placeholder=请输入 Trace ID; button=查询; table.column=Session ID; button=查看; title=Trace Explorer; button=全部折叠到一级节点; section=旁路事件
steps: 打开追踪页; 输入或使用默认时间范围查询; 点击查看; 在 Explorer 中点击树节点/旁路事件; 返回列表
assertions: Trace 列表可见; Explorer 标题可见; Trace 树或旁路事件区可见; 节点详情可打开
cleanup: 只读无清理; fork 调试属于写/派生动作，默认不执行
```

MCP 运行时规则：

- 默认把 Trace Explorer 作为只读 E2E。
- `从该轮fork调试会话` 会产生新会话，除非合同明确要求，否则不点击。
- 树节点、旁路事件、折叠按钮点击后需要重新 snapshot。

## 5. 监控 / 图表页

代表：数据监控、监控分析、指标库、报告页。

常见结构：

- 顶部筛选：业务线/应用、版本、粒度、时间范围、查询、重置、重跑聚合。
- 指标卡：总成本、总 Token、会话数、Trace 总数、活跃用户数。
- 图表区：tab、Top10、全屏按钮、空态。
- 重跑聚合通常是写操作，需要确认合同是否允许。

E2E 合同建议：

```text
selector_contract: combobox=应用; combobox=版本; combobox=粒度; button=查询; metric=总成本; section=Top10 排名; button=fullscreen
steps: 打开页面; 保持默认筛选或选择测试范围; 查询; 切换图表 tab; 打开/关闭全屏
assertions: 指标卡可见; 图表/空态可见; Top10 区可见; 查询时间范围文案更新
cleanup: 只读无清理; 重跑聚合默认不执行
```

MCP 运行时规则：

- 图表 canvas/svg 不适合做精细数值断言；优先断言标题、tab、空态/容器、指标卡文案。
- 全屏弹层打开后必须关闭，避免影响后续 case。
- `重跑聚合` 属于副作用操作，默认跳过。
