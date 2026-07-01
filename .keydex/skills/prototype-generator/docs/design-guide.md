# Ant Design 原型设计规范

本规范指导原型生成器产出 **Ant Design Pro 风格**的高保真原型页面。
使用 **React 18 + antd 5.x 真实组件**渲染，确保视觉效果与生产级 Ant Design Pro 应用一致。

> **核心原则**：使用真实的 antd React 组件，而非手写 HTML 类名。
> antd 的 CSS 需要精确的 DOM 结构才能正确渲染，手写类名无法保证效果。

---

## 一、设计 Token（antd 5.x）

| Token | 值 | 用途 |
|-------|-----|------|
| colorPrimary | `#1677ff` | 主按钮、链接、选中态 |
| colorSuccess | `#52c41a` | 成功状态标签 |
| colorWarning | `#faad14` | 警告状态标签 |
| colorError | `#ff4d4f` | 错误状态、危险操作 |
| colorText | `rgba(0,0,0,0.88)` | 主要文字 |
| colorTextSecondary | `rgba(0,0,0,0.65)` | 次要文字 |
| colorTextTertiary | `rgba(0,0,0,0.45)` | 辅助文字、时间、描述 |
| colorBorder | `#d9d9d9` | 边框 |
| colorBgLayout | `#f5f5f5` | 页面背景 |
| colorBgContainer | `#ffffff` | 容器背景 |
| borderRadius | `6px` | 组件圆角 |
| borderRadiusLG | `8px` | 卡片圆角 |

---

## 二、全局布局规范

所有管理后台原型必须采用 **Ant Design Pro 标准布局**：

```
┌──────────────────────────────────────────────────────┐
│ [Logo] 系统名称                   🔔(3) 管理员 [👤] │  ← Header 64px, 白底+阴影
├───────────┬──────────────────────────────────────────┤
│           │  首页 / 用户管理                          │  ← Breadcrumb
│  📊 首页  │                                          │
│  👥 用户  │  用户列表                                 │  ← Typography.Title level={4}
│  🤖 Agent │  ┌──────────────────────────────────┐    │
│  ⚙ 设置  │  │                                  │    │
│  📝 日志  │  │     Content Area                 │    │  ← 内容区域
│           │  │                                  │    │
│  (208px)  │  │              (flex: 1)           │    │
│  dark主题 │  └──────────────────────────────────┘    │
└───────────┴──────────────────────────────────────────┘
```

### 布局参数

| 元素 | 规格 |
|------|------|
| Header | 高 64px，白色背景，`boxShadow: '0 1px 4px rgba(0,21,41,0.08)'` |
| Sider | 宽 208px，dark 主题（#001529），支持 collapsible |
| Content | padding 24px，背景 #f5f5f5 |
| 卡片间距 | marginBottom: 16px |

### Header 必须包含

- **左侧**：Logo 方块（32×32, 主色背景, 白色字母）+ 系统名称
- **右侧**：通知铃铛（`Badge` + `BellOutlined`，带数字）+ `Avatar`（`UserOutlined`）+ 用户名文字

### Sider 必须包含

- Logo 区域（高度与 Header 对齐）
- `Menu` 组件，**至少 4-6 个菜单项**（含 1 个当前选中高亮）
- 菜单项使用 `@ant-design/icons` 图标，不用 emoji
- 支持 `collapsible` 属性

### Content 区域结构

每个页面的 Content 区域从上到下依次为：
1. `Breadcrumb` 面包屑（必须）
2. 页面标题 `Typography.Title level={4}`（必须）
3. 页面内容（卡片组）

---

## 三、列表页设计模式

这是最常见的后台页面类型，结构如下：

```
Breadcrumb
PageTitle
┌─── SearchCard ────────────────────────────────────┐
│  [Input]  [Select]  [DatePicker]  [搜索]  [重置]  │
└───────────────────────────────────────────────────┘
┌─── TableCard ─────────────────────────────────────┐
│  [+ 新增]  [导出]                      共 156 条  │
│  ─────────────────────────────────────────────────│
│  名称    │ 状态   │ 创建时间     │ 操作           │
│  张三    │ ● 启用 │ 2025-03-25  │ 编辑 · 删除    │
│  ...     │ ...    │ ...         │ ...            │
│  ─────────────────────────────────────────────────│
│                           共 156 条  « 1 2 3 » 10条/页 │
└───────────────────────────────────────────────────┘
```

### 搜索筛选区

- 用 `Card` 包裹，内部用 `Space wrap` 或 `Row`+`Col` 排列
- 筛选字段 ≤ 3 个：单行排列
- 筛选字段 > 3 个：两行或可折叠
- 搜索按钮 `type="primary"` + `SearchOutlined` 图标
- 重置按钮 `type="default"` + `ReloadOutlined` 图标

### 工具栏

- 放在 Table 上方，使用 `div` + `flex` + `space-between`
- 左侧：操作按钮（新增 `PlusOutlined`、导出 `DownloadOutlined`）
- 右侧：总条数文字（colorTextTertiary 色）

### 表格设计要点

- **columns 数组**：每列必须定义 `title`、`dataIndex`、`key`、`width`
- **列宽分配原则**：
  - 序号列：60-80px
  - 名称/标题列：150-250px（视内容而定）
  - 状态列：80-120px
  - 时间列：160-180px
  - 操作列：按操作数量分配，每个操作约 50px
- **状态列渲染**：使用 `Tag` 组件，颜色映射：
  - 成功/启用/已发布 → `color="success"`
  - 错误/禁用/已拒绝 → `color="error"`
  - 警告/待审核 → `color="warning"`
  - 处理中/进行中 → `color="processing"`
  - 默认/草稿 → `color="default"`
- **操作列渲染**：
  - ≤ 3 个操作：用 `Space split={<Divider type="vertical" />}` 分隔
  - \> 3 个操作：前 2 个直接展示，剩余放 `Dropdown` 的 `更多` 按钮
  - 查看/编辑用蓝色 `<a>` 链接
  - 删除必须用 `Popconfirm` 包裹，文案「确定删除该记录吗？」
- **分页**：使用 Table 的 `pagination` prop，设置 `showTotal`、`showSizeChanger`

### Mock 数据规范

- **至少 5-8 条**，推荐 8 条
- 数据必须有**真实感**：真实中文姓名、公司邮箱格式、合理时间间隔
- 不同行的状态要有**差异**（不能全部「启用」，要有禁用/待审核等）
- 总条数使用不规则数字（如 156、1,234）不要正好 50、100

---

## 四、详情页设计模式

```
Breadcrumb
┌─── PageHeader ─────────────────────────────────────┐
│  ← 返回   详情标题           [编辑]  [保存为新版本] │
└────────────────────────────────────────────────────┘
┌─── DescriptionsCard ──────────────────────────────┐
│  基础信息                                          │
│  名称: xxx          │  状态: ● 启用                │
│  创建时间: xxx      │  更新时间: xxx               │
│  描述: xxxxxxxxxxxxxx                              │
└────────────────────────────────────────────────────┘
┌─── RelatedTableCard ──────────────────────────────┐
│  关联数据标题                                      │
│  Table...                                         │
└────────────────────────────────────────────────────┘
```

### 基础信息展示

- **必须使用 `Descriptions` 组件**（不要用 div 手动排列键值对）
- Props: `column={2}` 或 `column={3}`，`bordered` 可选
- items 数组: `{ key, label, children, span }`
- 长文本字段设置 `span={2}` 或 `span={3}` 占整行
- 状态字段在 children 中渲染 `Tag` 或 `Badge`

### 页面头部

- 使用 `<a>` 或按钮实现「返回」操作
- 标题和操作按钮同行，`flex` + `space-between`
- 操作按钮组：保存（primary）、保存为新版本（default）、删除（danger）

### 关联数据

- 用独立的 `Card` 包裹 `Table`
- Card 的 `title` 标明数据类型
- Card 的 `extra` 可放「添加」按钮

---

## 五、表单页设计模式

```
Breadcrumb
PageTitle
┌─── FormCard ──────────────────────────────────────┐
│  Form.Item: 名称 *         [_______________]      │
│  Form.Item: 类型 *         [Select ▾      ]      │
│  Form.Item: 描述           [               ]      │
│                            [               ]      │
│  ─────────────────────────────────────────────────│
│                              [取消]  [提交]       │
└────────────────────────────────────────────────────┘
```

### 表单布局

- **使用 antd `Form` + `Form.Item` 组件**（不要手写 label+input div）
- 简单表单：`layout="vertical"`，单列，字段宽度 100% 或 `maxWidth: 600px`
- 复杂表单：`layout="horizontal"`，`labelCol={{ span: 6 }}`，`wrapperCol={{ span: 14 }}`
- 字段分组多的表单：用多个 Card 或 Divider 分隔
- 必填字段在 `rules` 中设置 `required: true`，Form.Item 自动显示 * 号

### 表单操作

- 放在表单底部，用 `Divider` 分隔
- 对齐方式：居中或靠右
- 提交按钮 `type="primary"`，取消按钮 `type="default"`

---

## 六、仪表盘设计模式

```
Breadcrumb
PageTitle
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│ 总数  │ │ 活跃  │ │ 增长  │ │ 告警  │  ← Row + Col + Card + Statistic
│ 1,234│ │  890 │ │ +12% │ │   3  │
└──────┘ └──────┘ └──────┘ └──────┘
┌─── ChartCard ─────────────────────────────────────┐
│  图表区域（使用 div 占位 + 说明文字）               │
└────────────────────────────────────────────────────┘
┌─── RecentCard ────────────────────────────────────┐
│  最近活动 Table / Timeline                        │
└────────────────────────────────────────────────────┘
```

- 统计卡片：`Row gutter={16}` + `Col span={6}` + `Card` + `Statistic`
- Statistic 可用 `prefix` 显示图标、`valueStyle` 设颜色
- 图表区域：本期用 `div` 占位（灰色背景 + 文字说明「图表区域」），高度 300-400px

---

## 七、常见交互模式

| 交互 | 实现方式 |
|------|---------|
| 新增/编辑 | 打开 `Modal` 或右侧 `Drawer`（推荐 Drawer） |
| 删除确认 | `Popconfirm` 包裹删除链接 |
| 状态切换 | `Switch` 组件 + 确认 |
| 批量操作 | Table `rowSelection` + 批量操作按钮 |
| 消息提示 | `message.success()` / `message.error()` |
| 搜索 | 点击搜索按钮触发（非实时搜索） |
| 重置 | 清空筛选条件，回到默认状态 |

---

## 八、禁止事项（严格遵守）

1. ❌ 使用 emoji 代替 antd icons（必须用 `@ant-design/icons`）
2. ❌ 侧边栏只有 1-2 个菜单项（至少 4 个）
3. ❌ Header 缺少用户信息区域
4. ❌ 用手写 div 模拟 antd 组件（必须用真实 antd 组件）
5. ❌ Mock 数据使用「示例数据1」「测试数据」（必须有真实感）
6. ❌ 所有行状态都一样（必须有差异化）
7. ❌ 详情页用普通文字排列键值对（应使用 `Descriptions`）
8. ❌ 表单不使用 `Form` 组件（应使用 `Form` + `Form.Item`）
9. ❌ 使用 `import` 语句（CDN 模式下不支持，从全局变量解构）
10. ❌ 表格没有定义列宽（必须为每列设置合理 width）
11. ❌ 操作列删除没有确认（必须用 `Popconfirm`）
12. ❌ 忘记设置 Table 的 `rowKey` prop

---

## 九、组件速查表

| 场景 | 组件 | 关键用法 |
|------|------|---------|
| 主按钮 | `<Button type="primary" icon={<PlusOutlined />}>新增</Button>` | |
| 数据表格 | `<Table columns={cols} dataSource={data} rowKey="id" pagination={{...}} />` | |
| 键值展示 | `<Descriptions column={2} bordered items={items} />` | |
| 表单 | `<Form layout="vertical"><Form.Item label="名称" name="name" rules={[{required:true}]}><Input /></Form.Item></Form>` | |
| 状态标签 | `<Tag color="success">启用</Tag>` | |
| 选择器 | `<Select options={opts} placeholder="请选择" style={{width:200}} />` | |
| 弹出确认 | `<Popconfirm title="确定删除？" onConfirm={fn}><a>删除</a></Popconfirm>` | |
| 消息提示 | `message.success('操作成功')` | |
| 徽标数 | `<Badge count={5}><BellOutlined /></Badge>` | |
| 头像 | `<Avatar icon={<UserOutlined />} />` | |
| 统计数 | `<Statistic title="总用户数" value={1234} />` | |
| 空状态 | `<Empty description="暂无数据" />` | |
| 栅格 | `<Row gutter={16}><Col span={6}>...</Col></Row>` | |
| 抽屉 | `<Drawer title="编辑" open={open} onClose={fn} width={520}>...</Drawer>` | |
| 弹窗 | `<Modal title="确认" open={open} onOk={fn} onCancel={fn}>...</Modal>` | |
| 开关 | `<Switch checked={v} onChange={fn} />` | |
| 日期 | `<DatePicker placeholder="请选择日期" />` | |

---

## 十、常用 Icons

从 `window.icons` 解构使用：

| 场景 | 图标名 |
|------|--------|
| 新增 | `PlusOutlined` |
| 搜索 | `SearchOutlined` |
| 重置/刷新 | `ReloadOutlined` |
| 编辑 | `EditOutlined` |
| 删除 | `DeleteOutlined` |
| 下载/导出 | `DownloadOutlined` |
| 设置 | `SettingOutlined` |
| 用户 | `UserOutlined` |
| 首页 | `HomeOutlined` |
| 通知 | `BellOutlined` |
| 返回 | `ArrowLeftOutlined` |
| 更多 | `EllipsisOutlined` |
| 应用 | `AppstoreOutlined` |
| 文件 | `FileOutlined` |
| 仪表盘 | `DashboardOutlined` |
| 团队 | `TeamOutlined` |
| 工具 | `ToolOutlined` |
| 安全 | `SafetyOutlined` |
| 代码 | `CodeOutlined` |
| API | `ApiOutlined` |
