# dev-plan-e2e 宪法

## 定位

`dev-plan-e2e` 是开发流程旁路的轻量页面级 E2E 验证 skill。它通过 E2E CSV 合同 + 官方 Playwright MCP runtime 验证当前需求的核心用户路径是否真实可用。

它沉淀的是 E2E 方法、页面模式、合同写法和运行时启发，不沉淀长期 PageObject/POM、CSS selector、XPath、MCP ref 或页面级操作资产。

## 必须做

- 合同准备阶段读 Plan / Issues / REQ / DES / 宪法和必要前端代码，提前规划可执行语义级 E2E CSV。
- 执行阶段按 CSV 合同运行，不重新设计用例。
- 使用 MCP snapshot 运行时观察页面结构，但默认不落盘 snapshot。
- 断言优先基于用户可见页面结果。
- 涉及写数据的 case 必须声明安全测试数据前缀与页面清理方式。
- 成功路径默认只保留 CSV 回填和一张 success.png。
- 失败路径默认只保留 CSV 回填和一张 failure.png。
- 执行完成并回填 CSV 后默认关闭 Playwright MCP browser session。

## 禁止做

- 不生成 Python Playwright 脚本。
- 不生成 case.plan.json、动作 DSL、页面资产 registry。
- 不默认采集 network、console、action-log、manifest。
- 不用 API 创建数据来绕过页面创建失败。
- 不用 API/DB/log 断言替代页面断言。
- 不清理非 E2E 前缀数据。
- 不因 E2E 失败自动修改业务代码或回流 dev-plan-execute。

## 允许回读代码的情况

执行阶段默认不重新读源码；仅在以下情况少量回读：

- CSV 语义锚点在页面 snapshot 中不可见。
- 页面存在多个同名按钮/弹窗，运行时无法区分上下文。
- 清理入口不可见，需要确认是否隐藏在更多菜单或权限控制中。
- 失败分类需要判断是环境、权限、合同失效还是页面实现问题。

## 成功标准

一次普通页面 E2E case 应在 2–5 分钟内完成，产物通常只有：

```text
.dev/e2e/contracts/<basename>.csv
.dev/e2e/evidence/<basename>/<case_id>/<run_id>/success.png
```
