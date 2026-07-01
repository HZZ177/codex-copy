# Dev Plan E2E CSV 合同模板

## 产物

```text
.dev/e2e/contracts/<plan-issues-basename>.csv
```

`<plan-issues-basename>` 优先复用 `.dev/plans/<same-basename>.md` 与 `.dev/issues/<same-basename>.csv` 的同名 basename，不额外追加 `-e2e`；无上游 Plan/Issues 的临时 demo 使用 `YYYY-MM-DD_HH-mm-ss-<slug>.csv`。

CSV 是 dev-plan-e2e 的唯一合同与状态投影。不要为单条 case 额外生成 `case.plan.json`、动作 DSL 文件、页面资产 registry、PageObject 或 Python Playwright 脚本。

## 固定表头

```text
case_id,priority,source_issue_id,title,refs,page_route,auth_profile,preconditions,selector_contract,fixture_contract,steps,assertions,cleanup,e2e_state,result_state,evidence_path,owner,notes
```

## 合同编写原则

1. E2E CSV 是独立 E2E 合同，不是需求源。
2. 每条用例必须能追溯到 Plan Issue、DES/REQ 或页面代码；API 代码只作为理解页面行为的辅助参考，不作为默认执行断言。
3. 页面用例必须包含 `selector_contract`，不能只写“测试页面”。
4. `selector_contract` 记录运行时语义锚点，不是长期 selector 资产。
5. 涉及真实数据的用例必须包含 `fixture_contract` 和 `cleanup`。
6. `cleanup` 必须有安全前缀限制，禁止清理非 E2E 数据。
7. 合同默认使用官方 Playwright MCP runtime 执行，不生成 Python Playwright case 脚本。
8. 失败只记录 CSV 状态和截图 evidence，不修改业务代码，不降低断言。
9. 正式执行默认只模拟真实用户页面操作，不保存接口日志、console、network、action-log、manifest 或 snapshot 文件。
10. 执行完成并回填 CSV 后默认关闭 Playwright MCP browser session，避免残留 Chrome。

## 状态默认值

```text
e2e_state=已准备
result_state=未执行
evidence_path=
notes=schema_version=2.0; execution_mode=mcp-runtime
```

## Agent 创建页面示例

```csv
"case_id","priority","source_issue_id","title","refs","page_route","auth_profile","preconditions","selector_contract","fixture_contract","steps","assertions","cleanup","e2e_state","result_state","evidence_path","owner","notes"
"e2e-001","P1","issue-xxx","通过页面新建测试 Agent 并验证页面可见结果","Plan#issue-xxx; admin_frontend/src/pages/agent/index.vue; admin_frontend/src/pages/agent/components/AgentBasicFields.vue; admin_frontend/src/pages/agent/components/AgentPromptSection.vue","/agent-manage/agent","skip_sso_dev_or_E2E_WEB_TOKEN","admin_frontend:5183 可用; 登录用户具备 page:agent 和 btn:agent:create; 官方 Playwright MCP 可用; 若未提供 E2E_WEB_TOKEN 则后端需支持开发免登","route=/agent-manage/agent; button=新增 Agent; input.placeholder=请输入 Agent 名称; textarea.placeholder=请输入 Agent 描述，说明其用途和功能; textarea.placeholder=填写 Agent 的主体提示词内容。; modal.title=填写新版本描述; modal.textarea.placeholder=请输入本次新版本的变更说明; table.contains=Agent 名称","name_prefix=e2e-agent-; 通过页面创建; 通过页面搜索验证; 优先通过页面删除/确认清理","打开 Agent 页面; 点击新增 Agent; 填写名称/描述/主体提示词; 保存; 填写版本描述; 确认保存; 页面搜索名称; 页面删除测试 Agent; 再次搜索确认不存在","UI: 页面表格包含同名 Agent 名称和描述; UI: 清理后页面搜索结果不再包含该 Agent; Evidence: success/failure 截图","仅通过页面清理 name 以 e2e-agent- 开头的记录; 若页面无清理入口则标记清理受限/失败，不默认改用接口清理","已准备","未执行","","","schema_version=2.0; execution_mode=mcp-runtime"
```
