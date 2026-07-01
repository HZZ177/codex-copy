# E2E 失败分类

E2E 失败时只记录，不修改代码。失败报告应归类，便于后续人工判断是否进入开发修复流程。

当前 dev-plan-e2e 默认使用 CSV 合同 + 官方 Playwright MCP runtime 执行。MCP 只负责页面观察和操作，不负责放宽合同断言。正式执行默认只保留 CSV 状态与截图证据，不采集接口日志、console、network、action-log 或 snapshot 文件。

## 1. 环境阻塞

特征：测试无法开始或基础服务不可用。

示例：

- 前端 `http://localhost:5183` 不可访问
- admin_backend `http://localhost:8001` 不可访问
- 官方 Playwright MCP 未配置或当前 Claude 环境未暴露 MCP 浏览器工具
- 官方 Playwright MCP browser session 启动失败
- 数据库/Redis 后端启动失败

状态建议：`result_state=阻塞`

## 2. 认证/权限阻塞

特征：页面无法进入或关键按钮不可见。

示例：

- `/auth/sso/login` 失败
- `SKIP_SSO_VALIDATION` 未启用且没有 `E2E_WEB_TOKEN`
- 页面跳 403
- 运行时 snapshot 中看不到 `新增 Agent` 按钮
- `permissionKeys` 不含目标按钮权限

状态建议：`result_state=阻塞` 或 `失败`，取决于是否属于环境前置问题。

## 3. MCP 操作失败

特征：官方 Playwright MCP 可用，但页面操作工具调用失败。

示例：

- `browser_snapshot` 无法返回页面结构
- `browser_click` 目标 ref 失效
- `browser_fill` 目标不是可编辑控件
- 页面跳转后原 ref 失效且重新 snapshot 后仍找不到合同语义目标
- 失败截图保存失败

状态建议：`result_state=失败`；若属于 MCP 环境不可用则标 `阻塞`。

记录：当前 URL、失败截图路径、失败动作摘要。snapshot 只在运行时查看，默认不落盘；除非用户明确要求诊断模式。

## 4. 语义锚点失效

特征：页面存在，但 CSV `selector_contract` 中声明的语义目标在当前页面不可见或不可识别。

示例：

- placeholder 变更
- modal 标题变更
- 抽屉结构变化导致目标表单不可见
- 按钮文案变更
- Ant Design Vue 按钮文本 spacing 可被识别为同义时允许运行时适配；若语义目标不存在则失败

状态建议：`result_state=失败`

记录：当前 URL、失败截图、可见按钮/input/textarea/modal/drawer 的简短文字摘要。MCP snapshot 只在运行时查看，默认不落盘。

## 5. 页面结果断言失败

特征：页面操作完成但页面可见结果不符合 CSV 合同。

示例：

- 点击保存后页面没有成功反馈，也没有回到列表或详情状态
- 页面搜索结果不包含测试数据
- 页面展示字段与输入不一致
- 权限按钮显隐不符合预期
- 清理后页面仍能搜索到测试数据

状态建议：`result_state=失败`

禁止：

- 页面创建失败后改用 API 创建来通过
- 页面搜索失败后改用接口断言来通过
- 字段不一致时放宽页面断言

## 6. 清理失败

特征：验证完成后测试数据未清理，或清理操作不安全。

示例：

- 页面删除失败或确认弹窗不可操作
- 页面没有可用清理入口，且合同要求清理
- 测试数据名前缀不安全，必须拒绝清理
- cleanup/fixture_contract 没有声明 `e2e` 前缀

状态建议：第一版保守处理为 `result_state=失败`，并在 CSV `notes` 中记录 `cleanup_failed` 或 `cleanup_refused`。

## 7. 合同不完整

特征：E2E CSV 无法执行或执行语义不足。

示例：

- 页面用例缺 `selector_contract`
- 缺 `cleanup`
- 缺 `preconditions`
- `refs` 不足以定位页面
- `steps` 过于笼统，无法映射到 MCP runtime 操作
- `assertions` 没有明确页面可见结果断言

状态建议：`e2e_state=待准备` 或 `result_state=阻塞`

## 失败报告必须包含

- case_id
- 失败分类
- 当前 URL
- 截图路径
- 可见按钮、input、textarea、modal/drawer 文本摘要
- 是否已清理测试数据
- 建议下一步，但不得自动修改代码

完整 console、完整 network、action-log、manifest、snapshot 文件只属于用户明确要求的诊断模式；不要把成功路径或默认失败路径的每一步都落盘成文件。执行完成并回填 CSV 后默认关闭 Playwright MCP browser session；若失败现场需要用户查看页面，应在 CSV `notes` 中说明暂不关闭原因。

## 成功路径报告应保持最小

成功路径默认只需要：

- CSV 回填：`result_state=通过`、`evidence_path=<success.png>`、`notes=<极简页面断言与清理摘要>`。
- `success.png`：需要视觉留证时保留一张。

不要默认为一次普通创建用例生成十几个文件。若执行后 evidence 文件数明显膨胀，应优先改进 skill 执行策略。