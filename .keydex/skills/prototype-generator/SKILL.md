---
name: prototype-generator
description: |
  **确保使用此技能** 当用户需要「根据需求生成UI原型」「创建原型页面」「需求转原型」「/prototype」「改造原型」「优化页面原型」或任何涉及前端页面原型生成的请求时。

  本技能将需求文档转换为高保真HTML原型页面，使用 React + antd 5.x 真实组件渲染，确保视觉效果与 Ant Design Pro 完全一致。原型全屏展示，需求说明通过右下角浮动按钮打开抽屉查看。同时自动生成目录页（index.html），通过左上角浮动按钮打开抽屉切换浏览所有原型。每个页面由独立subagent生成并经审查subagent验收。

  **触发关键词**: 生成原型、创建原型、需求转原型、原型页面、画原型、/prototype、改造原型、重做原型
---

# Prototype Generator（原型生成器）

## 目标

将需求文档转换为**高保真 HTML 原型页面**，输出独立 HTML 文件：

- 使用 **React + antd 5.x 真实组件**渲染（非手写 HTML 类名），确保视觉效果与生产级 Ant Design Pro 应用一致
- 原型页面**全屏展示**，Ant Design Pro 标准后台布局（Sider + Header + Content）
- 右下角浮动按钮 + antd Drawer 查看当前页面的需求说明
- 自动生成目录页（`index.html`），左上角浮动按钮打开抽屉切换浏览所有原型

## 技术方案

**核心变更**：不再使用 antd CSS + 手写 HTML 类名（该方式无法还原 antd 渲染效果）。
改为在 HTML 文件中通过 CDN 加载 React 18 + antd 5.x UMD 包，使用 `<script type="text/babel">` 编写 JSX，渲染**真实的 antd React 组件**。

优势：
- 100% 还原 antd 组件的真实渲染效果（Table、Select、Form 等完全可用）
- 交互组件自动可用（Select 下拉、Table 排序/筛选、Pagination 翻页、Drawer 动画）
- 样式由 antd CSS-in-JS 自动注入，无需手写 CSS 类名或引入 antd.min.css
- 使用 @ant-design/icons 真实图标，不使用 emoji

## 工作流程

```
读取输入 → 评估页面清单 → 需求确认（强制） → 逐页subagent生成 → 审查验收 → 目录页输出
```

### Phase 1: 读取输入

**场景A（根据需求生成新原型）：**
- 用户未指定需求文档时，提示指定路径
- 已指定时，读取需求文档，提取：用户故事、功能列表、业务流程、数据结构

**场景B（旧原型改造）：**
- 读取旧原型 HTML 文件
- 分析页面结构、组件、交互逻辑
- 输出旧页面分析报告，与用户确认改造范围

### Phase 2: 评估页面清单

基于需求分析需要的前端页面，输出表格：

| 序号 | 页面名称 | 页面类型 | 功能描述 | 优先级 |
|-----|---------|---------|---------|-------|
| 1 | xxx列表 | list | 展示xxx数据 | P0 |
| 2 | xxx详情 | detail | 展示详细信息 | P0 |
| 3 | 新建xxx | form | 表单填写 | P0 |

**等待用户确认页面清单后再继续。** 用户确认前不得进入后续阶段。

### Phase 3: 需求确认（强制，不可跳过）

这是生成前的关键环节。跳过需求确认会导致原型完成度低、返工率高，因此**必须执行**。

**对每个页面逐一确认**，每轮最多3个问题，从以下维度展开：

1. **布局与结构**：整体布局方案（顶栏+侧边栏、纯顶栏、无框架等）、模块划分、导航结构、面包屑层级
2. **数据与展示**：表格列定义（列名、列宽、数据类型）、表单字段（字段名、类型、校验规则、是否必填）、详情分组
3. **交互逻辑**：操作按钮及其行为、编辑方式（抽屉/弹窗/跳转新页面）、状态流转（如：草稿→审核中→已发布）、批量操作
4. **边界场景**：空数据展示方案、加载中状态、错误提示方式、权限控制

**进入生成阶段的前提条件（必须至少满足一项）：**
- 用户明确表示「可以开始生成」「确认没问题」
- 用户对所有页面的澄清问题逐一回答后表示满意
- 用户主动表示「不需要再确认了，直接生成」

如果用户提供的信息不够详细，主动补充合理的默认方案并明确告知用户，等用户确认后再继续。

### Phase 4: 逐页生成 + 审查验收

**核心原则：每个页面独立生成，禁止一次性批量生成所有页面。**

逐页生成让每个 subagent 专注于一个页面，产出质量更高。可以同时并行派发多个页面。

#### 4.1 为每个页面派发生成 subagent

使用 Task 工具为每个页面派发独立的 subagent。

**subagent prompt 模板：**

```
你是一个高级前端原型设计师，擅长 Ant Design Pro 风格的后台页面设计。
请根据以下需求生成一个高保真 HTML 原型页面。

## 页面信息
- 页面名称：{page_name}
- 页面类型：{page_type}（list/form/detail/dashboard）
- 输出路径：{output_path}/{file_name}

## 需求描述
{从 Phase 3 确认结果中提取的该页面完整需求}

## 页面关联
{该页面与其他页面的关联关系}

## 侧边栏菜单
{本组原型的所有页面菜单列表，标明当前页面选中}

## 技术规范和设计规范
请按顺序读取以下两个文件，严格遵循其中的技术方案和设计规范：
1. {skill_path}/docs/output-format.md — HTML 输出格式规范（CDN 依赖、React 编码规范、完整示例）
2. {skill_path}/docs/design-guide.md — Ant Design 设计规范（布局规范、页面模式、组件用法、禁止事项）

## 关键要求（必须逐项遵守）

### 技术要求
1. 使用 React 18 + antd 5.x + @ant-design/icons CDN 加载，在 <script type="text/babel"> 中编写 JSX
2. 所有组件从全局变量 window.antd 和 window.icons 解构，不使用 import 语句
3. 使用真实的 antd React 组件（Table、Form、Select、Descriptions 等），不手写 HTML 类名
4. antd 5.x CSS-in-JS 自动注入样式，不需要引入 antd.min.css

### 设计要求
5. 采用 Ant Design Pro 标准后台布局：左侧 Sider（dark 主题, 208px）+ 顶部 Header（白色, 64px）+ Content 区域
6. Sider 包含 Logo 和 Menu 组件，菜单至少 4-6 项，当前页面高亮
7. Header 包含 Breadcrumb + 右侧用户信息（Badge + BellOutlined + Avatar + 用户名）
8. 使用 @ant-design/icons 图标，禁止使用 emoji
9. 严格按照 design-guide.md 中的页面类型模式设计（列表页/详情页/表单页的标准结构）

### 数据要求
10. 所有数据为 mock 数据，表格至少 5-8 条真实感数据（真实姓名、合理时间、差异化状态）
11. 表格分页总条数使用不规则数字（如 156、1234），不要正好 50/100
12. Table 必须设置 rowKey，每列必须定义 width

### 交互要求
13. 右下角放置浮动按钮（antd Button shape="circle"），点击打开 antd Drawer 展示需求说明
14. 需求说明抽屉内使用 antd Card + Descriptions 组件组织内容
15. Mock 交互使用 message.success() / message.info() 提示操作结果
16. 删除操作必须用 Popconfirm 二次确认
17. 操作列用 Space + Divider type="vertical" 分隔

请将完整的 HTML 文件写入 {output_path}/{file_name}。
```

#### 4.2 为每个页面派发审查 subagent

每个页面生成完成后，**必须**派发审查 subagent 验收。审查 subagent 与生成 subagent 独立。

**审查 subagent prompt 模板：**

```
你是一个前端原型审查专家。请审查以下 HTML 原型文件的质量。

## 审查文件
路径：{file_path}
请先读取该文件。

## 原始需求
{该页面的需求描述}

## 设计规范
请先读取设计规范作为审查基准：
- {skill_path}/docs/design-guide.md

## 审查维度（每项 20 分，满分 100 分）

### 1. 技术合规性（20分）
- 是否使用 React + antd 5.x CDN 方案（检查 script 标签）
- 是否使用真实 antd 组件（Table、Form、Select 等），而非手写 HTML 类名
- 是否使用 @ant-design/icons，而非 emoji
- 组件从全局变量解构，无 import 语句

### 2. 布局与设计（20分）
- 是否采用 Ant Design Pro 标准布局（Sider + Header + Content）
- Sider 是否有至少 4 个菜单项，含当前选中高亮
- Header 是否包含 Breadcrumb + 用户信息（Avatar、通知等）
- 整体间距、层级是否符合 Ant Design 设计规范

### 3. 功能完成度（20分）
- 需求中描述的所有功能模块是否都已体现
- 表格列/表单字段是否与需求一致
- 操作按钮是否齐全
- 导航、面包屑、标题等基础元素是否完整

### 4. 数据与细节（20分）
- Mock 数据是否至少 5-8 条，且具有真实感
- 状态标签是否使用 Tag 组件并有颜色差异
- Table 是否设置了 rowKey 和列 width
- 分页是否包含 showTotal 和 showSizeChanger

### 5. 交互完整性（20分）
- 右下角浮动按钮是否存在且使用 antd Button 组件
- 需求说明 Drawer 是否使用 antd Drawer 组件
- Drawer 内容是否使用 Card + Descriptions 组织
- 删除操作是否有 Popconfirm 确认
- Mock 交互是否使用 message 提示

## 输出格式
请以 JSON 格式输出审查结果：
{
  "page_name": "xxx",
  "passed": true/false,  // 总分 >= 80 为通过
  "score": 85,
  "dimensions": {
    "technical": {"score": 18, "issues": []},
    "layout": {"score": 16, "issues": ["Header 缺少通知图标"]},
    "completeness": {"score": 17, "issues": []},
    "details": {"score": 18, "issues": []},
    "interaction": {"score": 16, "issues": ["Drawer 内容过于简单"]}
  },
  "critical_issues": ["必须修复的问题"],
  "suggestions": ["建议改进的问题"]
}
```

#### 4.3 审查未通过时的处理

如果审查未通过（`passed: false` 或总分低于 80），执行以下流程：

1. **第一次重试**：将审查报告中的问题反馈给新的生成 subagent，要求针对性修复。重新生成后再次审查。
2. **第二次重试**：如果仍未通过，同上处理。
3. **超过 2 次重试**：停止重试，将审查报告展示给用户，由用户决定是否接受当前版本或提供补充指导。

### Phase 5: 目录页生成与文件输出

**输出目录：** `docs/prototype/`

**命名规则：**
- 新原型：`prototype-{YYYYMMDD}-{序号}-{页面名称}.html`
- 改造原型：`prototype-{YYYYMMDD}-{页面名称}-v{版本}.html`
- 目录页：`index.html`

**重要原则（场景B）：**
- 生成新文件（新日期/版本号）
- 保留旧文件（绝不覆盖）

**目录页**：
- 使用 output-format.md 中的目录页模板（React + antd Drawer + iframe）
- iframe 全屏加载原型页面
- 左上角浮动按钮打开 Drawer 展示原型文件列表
- 点击文件切换 iframe 内容
- 默认加载第一个原型文件

每次生成原型后，自动创建或更新 `index.html` 目录页。

## 场景B（旧原型改造）特殊处理

```
读取旧原型 → 分析结构 → 确认改造需求 → 生成新原型 → 保留旧文件
```

**关键原则：**
- **绝不直接修改旧文件**：生成全新 HTML 文件
- **保留旧文件**：作为备份和对比参考
- **新文件名区分**：使用新的日期或递增版本号
- **技术升级**：旧原型如果是 HTML 类名方案，改造时升级为 React + antd 方案

## 页面类型支持

| 类型 | 说明 | 核心 antd 组件 |
|-----|------|---------------|
| list | 列表页 | Table, Input, Select, Button, Tag, Popconfirm, Space |
| form | 表单页 | Form, Form.Item, Input, Select, DatePicker, Button |
| detail | 详情页 | Descriptions, Card, Table, Tag, Badge |
| dashboard | 仪表盘 | Statistic, Row, Col, Card, Table |

## 约束与限制

- **必须使用 React + antd 5.x CDN 方案**：真实组件渲染，非手写 HTML 类名
- **使用 @ant-design/icons 图标**：不使用 emoji
- **Ant Design Pro 标准布局**：Sider（dark, 208px）+ Header（white, 64px）+ Content
- **全屏响应式布局**：原型页面不设固定宽度
- **Mock 数据**：所有数据为硬编码 mock 数据，无真实 API 调用，表格至少 5-8 条真实感数据
- **单页面原型**：每个 HTML 文件只包含一个页面原型
- **浮动按钮 + Drawer**：需求说明通过右下角浮动按钮触发 antd Drawer 展示
- **目录页**：批量生成后必须更新 `index.html` 目录页
- **逐页生成**：每个页面由独立 subagent 生成
- **审查验收**：每个页面生成后必须经过审查 subagent 验收

## 参考资源

- **设计规范**：`docs/design-guide.md` — Ant Design 设计规范（布局、页面模式、组件用法、禁止事项）
- **输出格式**：`docs/output-format.md` — HTML 输出格式规范（CDN 依赖、React 编码规范、完整示例）
- **目录页脚本**：`scripts/generate_index.py` — 生成/更新目录页（辅助参考）

## 自检清单

- [ ] HTML 文件可在浏览器正常打开，React + antd 正确渲染
- [ ] 使用 React + antd 5.x CDN（非 antd.min.css + 手写 HTML 类名）
- [ ] 使用真实 antd 组件（Table、Form、Select、Descriptions 等）
- [ ] 使用 @ant-design/icons 图标（非 emoji）
- [ ] Ant Design Pro 标准布局（Sider + Header + Content）
- [ ] Sider 至少 4 个菜单项，当前页面高亮
- [ ] Header 有 Breadcrumb + 用户信息
- [ ] Mock 数据至少 5-8 条，具有真实感，状态有差异
- [ ] Table 设置了 rowKey 和列 width
- [ ] 右下角浮动按钮 + Drawer 展示需求说明
- [ ] Drawer 内使用 Card + Descriptions 组织需求说明
- [ ] 删除操作有 Popconfirm 确认
- [ ] 文件保存到 docs/prototype/ 目录，文件名符合命名规范
- [ ] 场景B：旧文件已保留（未被覆盖）
- [ ] 目录页（index.html）已生成/更新
- [ ] 需求确认环节已执行（未跳过）
- [ ] 每个页面均经过审查 subagent 验收
