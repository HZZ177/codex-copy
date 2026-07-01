# 页面 E2E runtime 可操作性调研清单

在生成 E2E CSV 合同前，对每个页面场景完成以下调研。调研目标是形成**直观 CSV 合同**，供官方 Playwright MCP runtime 在执行时按语义锚点操作页面；不是为了沉淀长期 PageObject/POM 或生成 case-specific Python 脚本。

## 1. 页面入口

- [ ] 读取 `admin_frontend/src/router/routes.ts`
- [ ] 确认 `path`
- [ ] 确认 `name`
- [ ] 确认 `meta.title`
- [ ] 确认 `meta.permission`
- [ ] 拼出实际访问路径，如 `/agent-manage/<path>`
- [ ] 在 CSV `page_route` 中记录页面路由

## 2. 权限

- [ ] 页面权限，如 `page:agent`
- [ ] 按钮权限，如 `btn:agent:create`
- [ ] 是否依赖 `isSuperAdmin`
- [ ] 权限缺失时如何判断：页面是否跳 403、目标按钮是否不可见、失败截图是否能说明问题
- [ ] 在 CSV `preconditions` 中记录所需权限和认证方式

## 3. 布局组件

- [ ] 是否使用 `tl` / `tl-filter` / `tl-table` / `tl-drawer`
- [ ] 是否使用 Ant Design Vue 原生 `a-drawer` / `a-modal`
- [ ] 是否存在 title slot，避免按根节点文本猜测
- [ ] 是否存在表单 class，如 `.agent-drawer-form`
- [ ] 是否存在 loading/spinner，需要等待页面稳定

## 4. MCP runtime 语义锚点

优先提取用户可见、MCP snapshot 可观察的锚点：

- [ ] button 文案
- [ ] input placeholder
- [ ] textarea placeholder
- [ ] form label
- [ ] modal title
- [ ] tab 文案
- [ ] table column title / 表格中应出现的文本
- [ ] toast/message 文案（若作为断言）

CSV `selector_contract` 建议写成半结构化文本：

```text
route=/agent-manage/agent; button=新增 Agent; input.placeholder=请输入 Agent 名称; modal.title=填写新版本描述; table.contains=Agent 名称
```

注意：`selector_contract` 是运行时语义锚点，不是长期 selector 资产。不要为它另建 JSON/DSL 文件。

## 5. 保存链路

- [ ] 点击保存是否直接提交
- [ ] 是否先打开二次确认或版本描述 modal
- [ ] 成功后页面状态如何变化：抽屉关闭、列表刷新、toast 等
- [ ] 成功后的页面可见断言是什么：列表文本、详情文本、状态文案等
- [ ] 不把网络响应作为默认执行证据

## 6. Fixture 与清理

- [ ] 测试数据前缀是否明确，如 `e2e-agent-`
- [ ] 创建数据来自页面操作；页面 E2E 不得在页面创建失败后改用 API 创建来通过
- [ ] 页面是否有删除/撤销/清空等清理入口
- [ ] 清理是否能通过页面完成搜索 → 删除 → 确认 → 再搜索验证
- [ ] 是否拒绝清理非 E2E 前缀数据
- [ ] CSV `fixture_contract` 和 `cleanup` 是否都明确写出安全前缀；若页面无清理入口，应写清理受限

## 7. 断言与证据

- [ ] 页面可见结果断言
- [ ] 成功截图路径
- [ ] 失败截图路径
- [ ] CSV `result_state`、`evidence_path`、`notes` 是否能表达结果
- [ ] 不默认生成 manifest、action-log、network、console、snapshot 文件

## 8. 风险记录

- [ ] 无 `data-testid`
- [ ] 选择器依赖中文文案
- [ ] Ant Design Vue 中文按钮可访问文本可能插入空格，如 `保存` → `保 存`
- [ ] 抽屉 DOM 由内部组件生成
- [ ] 权限依赖测试用户
- [ ] 官方 Playwright MCP 未配置或不可用
- [ ] 真实后端数据污染风险
- [ ] E2E 并行不安全
