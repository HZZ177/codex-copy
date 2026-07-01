# 项目前端 E2E 约定摘要

## 访问与认证

- 前端 base path：`/agent-manage`。
- 本地开发端口通常是 `http://localhost:5183/agent-manage`。
- 开发免登可通过 URL query 触发：

```text
?sso_token=dev_e2e&portal_url=http%3A%2F%2Flocalhost%3A5183%2Fagent-manage&portal_backend_url=http%3A%2F%2Flocalhost%3A8001
```

- 首次进入可能出现 loading，等待后 query 会被清理，用户显示为“开发测试用户”。

## 路由与菜单

- 路由定义在 `admin_frontend/src/router/routes.ts`。
- 实际访问路径 = `/agent-manage` + route path。
- 菜单按业务线/权限渲染，目标页面不可见时优先判断权限或业务线。

## 常见组件

- 标准表格：`tl-filter` + `tl-table` + `a-table`。
- 标准抽屉：`tl-drawer` + `useDrawer(PAGE_NAME)`。
- 标准搜索：`useForm` + `data.ts` 的 `searchSchema`。
- 标准分页：Ant Design Vue pagination。
- 常见确认：`Modal.confirm` 或 `a-modal`。

## 权限线索

- 页面权限通常在 route meta：`permission: 'page:xxx'`。
- 按钮权限常见：`hasButtonPerm('btn:xxx:create')`、`btn:xxx:update`、`btn:xxx:delete`。
- E2E 如果看不到目标按钮，优先分类为权限/合同阻塞，不要绕过页面。

## 页面探索优先级

合同准备阶段优先读：

1. `router/routes.ts`。
2. 目标页面 `index.vue`。
3. 目标页面 `data.ts`。
4. `components/*.vue` 中的表单、抽屉、modal。
5. 必要时读 API 文件辅助理解页面行为，但执行阶段不做 API 断言。

## 实探过的代表模式

- `/debug`：调试配置 + 会话列表 + 开始会话 + 右侧调试面板，适合作为 Chat/流式模式。
- `/workbench`：目标/版本前置选择 + 历史会话 + composer，适合作为上下文准备后的协作 Chat 模式。
- `/trace` / `/trace/explorer`：筛选表格 + Trace 树 + 旁路事件，只读探索为主。
- `/monitor/dashboard`：筛选 + 指标卡 + Top10 + 图表 tab + 全屏，图表以容器/标题/空态断言为主。
- `/agent`：标准 CRUD + 抽屉 + 二次版本描述 modal + 更多菜单删除。
