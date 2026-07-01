# CSV 合同模式

CSV 合同写到可执行语义级，不写 CSS selector、XPath、Playwright ref 或接口细节。

## 创建类

```text
selector_contract: route=...; button=新增; input.placeholder=...; drawer.title=...; button=保存; table.column=...; row.action=更多/删除
fixture_contract: name_prefix=e2e-<module>-; 通过页面创建; 通过页面搜索验证
steps: 打开页面; 点击新增; 填写必填字段; 保存; 搜索名称; 验证表格包含数据; 截图; 页面删除; 再搜索确认不存在
assertions: 表格包含测试名称和关键字段; 清理后暂无数据
cleanup: 仅通过页面清理 name 以 e2e-<module>- 开头的数据
```

## 编辑类

```text
selector_contract: row.action=编辑; drawer.title=编辑; button=保存; table.contains=更新后的字段
fixture_contract: 依赖已有 e2e 前缀数据或前置创建步骤
steps: 搜索测试数据; 点击编辑; 修改字段; 保存; 搜索验证更新结果; 还原或删除测试数据
assertions: 表格/详情显示更新后的字段
cleanup: 删除测试数据或恢复原值
```

## 删除类

```text
selector_contract: row.action=更多/删除; modal.title=确认删除; button=确认
fixture_contract: name_prefix=e2e-<module>-; 只删除测试数据
steps: 搜索测试数据; 点击删除; 确认; 再搜索
assertions: 页面显示暂无数据或目标行不存在
cleanup: 删除动作本身就是清理
```

## Chat / 流式输出类

```text
selector_contract: combobox=应用; textbox=用户 ID; button=开始会话; textbox.placeholder=输入...; button=发送; button=停止; message.role=user/assistant
fixture_contract: test_user=e2e-user 或固定测试用户; prompt_prefix=e2e-chat-
steps: 选择上下文; 开始会话; 输入短消息; 发送; 等待 assistant 输出完成; 截图; 停止未完成流
assertions: 用户消息可见; assistant 消息可见; streaming 结束后发送按钮恢复
cleanup: 停止未完成流; 不默认删除历史会话，除非页面有安全删除入口
```

## Trace / 只读详情类

```text
selector_contract: textbox.placeholder=请输入 Trace ID; button=查询; table.column=Session ID; button=查看; title=Trace Explorer; section=当前 Trace 树; section=旁路事件
fixture_contract: read_only=true; 使用现有查询结果或 Plan 提供的 trace_id
steps: 打开页面; 查询; 点击查看; 展开/折叠树; 点击节点或旁路事件
assertions: Trace 列表可见; Explorer 可见; 树/旁路事件区域可见; 详情弹层可见
cleanup: 无写操作
```

## 监控 / 图表类

```text
selector_contract: combobox=应用; combobox=版本; button=查询; metric=总成本; section=Top10 排名; chart.tab=总成本; button=fullscreen
fixture_contract: read_only=true
steps: 打开页面; 使用默认或指定筛选; 查询; 切换 tab; 打开并关闭全屏
assertions: 指标卡可见; 图表容器或空态可见; Top10 区可见; 时间范围文案可见
cleanup: 关闭弹层/全屏; 不点击重跑聚合
```
