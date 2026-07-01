# Playwright MCP Runtime Heuristics

## 基本循环

1. navigate 到 `page_route`。
2. 等待页面稳定。
3. snapshot 观察语义锚点。
4. 批量 fill/click 执行用户动作。
5. 状态变化后重新 snapshot。
6. 做页面可见断言。
7. 保存一张 success/failure 截图。
8. 回填 CSV。
9. 关闭 browser session。

## 调用策略

- 成功路径不要每一步都 snapshot；只在页面结构变化后 snapshot：导航后、打开抽屉/弹窗后、打开下拉/更多菜单后、保存后、删除确认后。
- 表单填写优先使用 `browser_fill_form`。
- 中文按钮要允许 Ant Design Vue 可访问文本插空格，例如 `保存` 可能是 `保 存`。
- 浮层类交互必须重新 snapshot：Select 下拉、Dropdown 更多菜单、Modal.confirm、Popover。
- 表格横向滚动或固定列下，优先用行文本 + 行内按钮语义定位，不使用列下标。

## 等待规则

- 不盲等长时间；优先等待可见状态变化。
- 保存后等待抽屉关闭、modal 关闭、toast 出现、表格刷新或目标文本出现。
- Chat 流式输出等待发送按钮恢复、停止按钮消失、assistant 消息不再变化。
- 图表页等待指标卡/空态/图表容器出现即可，不做像素级图表断言。

## 失败处理

失败时只做：

- 保存 failure.png。
- CSV notes 记录失败分类、当前 URL、关键可见文本摘要。
- 默认关闭 browser session；若需要用户现场查看，notes 说明暂不关闭原因。

不要：

- 读取 network/console 作为默认证据。
- 改用 API 验证页面失败。
- 写 action-log 或 snapshot 文件。

## 高风险动作

默认不点击：

- 批量删除。
- 重跑聚合。
- fork 调试会话。
- 发布、启用、停用、授权等会影响共享状态的按钮。

若合同明确要求，必须有安全前缀、只读范围或用户授权说明。
