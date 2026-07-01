# 原型 HTML 输出格式规范

## 设计理念

原型页面的核心目标是尽可能还原真实网页体验。为此：
- 使用 **React + antd 5.x 真实组件**渲染（非手写 HTML 类名）
- 原型内容**全屏展示**，不设固定宽度限制
- 需求说明**隐藏在右下角浮动按钮的抽屉中**，需要时打开查看
- 目录页的文件列表**隐藏在左上角浮动按钮的抽屉中**，需要时打开切换

---

## 一、HTML 基础结构

每个原型页面是一个独立的 HTML 文件，通过 CDN 加载 React + antd：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>原型 - {页面名称}</title>
  <!-- React 18 -->
  <script src="https://registry.npmmirror.com/react/18.3.1/files/umd/react.development.js"></script>
  <script src="https://registry.npmmirror.com/react-dom/18.3.1/files/umd/react-dom.development.js"></script>
  <!-- Day.js (antd 依赖) -->
  <script src="https://registry.npmmirror.com/dayjs/1.11.13/files/dayjs.min.js"></script>
  <!-- antd 5.x (含 CSS-in-JS，无需单独 CSS 文件) -->
  <script src="https://registry.npmmirror.com/antd/5.23.4/files/dist/antd.min.js"></script>
  <!-- Ant Design Icons -->
  <script src="https://registry.npmmirror.com/@ant-design/icons/5.6.1/files/dist/index.umd.min.js"></script>
  <!-- Babel (JSX 编译) -->
  <script src="https://registry.npmmirror.com/@babel/standalone/7.26.9/files/babel.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    #root { min-height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    // ============ 从全局解构 antd 组件 ============
    const {
      Layout, Menu, Table, Button, Space, Tag, Input, Select,
      Card, Breadcrumb, Avatar, Badge, Dropdown, Typography,
      Divider, Popconfirm, message, Descriptions, Form,
      Modal, Drawer, Switch, DatePicker, Row, Col, Statistic,
      Empty, Spin, Tooltip, Tabs, Steps, Timeline, Alert,
      InputNumber, Radio, Checkbox, Upload, ConfigProvider
    } = antd;
    const { Header, Sider, Content, Footer } = Layout;
    const { Title, Text, Paragraph } = Typography;
    const { TextArea } = Input;

    // ============ 从全局解构 Icons ============
    const {
      PlusOutlined, SearchOutlined, ReloadOutlined,
      EditOutlined, DeleteOutlined, DownloadOutlined,
      SettingOutlined, UserOutlined, HomeOutlined,
      BellOutlined, EllipsisOutlined, AppstoreOutlined,
      ArrowLeftOutlined, FileOutlined, DashboardOutlined,
      TeamOutlined, ToolOutlined, SafetyOutlined,
      CodeOutlined, ApiOutlined, MenuFoldOutlined,
      MenuUnfoldOutlined, ExclamationCircleOutlined,
      CheckCircleOutlined, CloseCircleOutlined,
      InfoCircleOutlined, UploadOutlined,
      EyeOutlined, CopyOutlined, SyncOutlined,
      FilterOutlined, ExportOutlined, ImportOutlined
    } = icons;

    // ============ App 组件 ============
    function App() {
      // ... 页面逻辑和渲染
    }

    // ============ 渲染 ============
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<App />);
  </script>
</body>
</html>
```

### CDN 依赖说明

| 库 | CDN 地址 | 全局变量 | 用途 |
|----|---------|---------|------|
| React | `registry.npmmirror.com/react/18.3.1/files/umd/react.development.js` | `React` | UI 框架 |
| ReactDOM | `registry.npmmirror.com/react-dom/18.3.1/files/umd/react-dom.development.js` | `ReactDOM` | DOM 渲染 |
| Day.js | `registry.npmmirror.com/dayjs/1.11.13/files/dayjs.min.js` | `dayjs` | antd 日期依赖 |
| antd | `registry.npmmirror.com/antd/5.23.4/files/dist/antd.min.js` | `antd` | 组件库 |
| Icons | `registry.npmmirror.com/@ant-design/icons/5.6.1/files/dist/index.umd.min.js` | `icons` | 图标库 |
| Babel | `registry.npmmirror.com/@babel/standalone/7.26.9/files/babel.min.js` | - | JSX 编译 |

> **重要**：antd 5.x 使用 CSS-in-JS，不需要引入单独的 CSS 文件。样式在组件渲染时自动注入。

### 编码规范

1. **所有组件从全局变量解构**，不使用 `import` 语句
2. **使用 `React.useState`** 管理状态（不用 `const [x, setX] = useState()`）
3. **使用 `<script type="text/babel">`** 编写 JSX
4. **antd 组件用法与 React 项目完全一致**，直接写 JSX
5. **Mock 函数用 `message.success()`** 提示操作结果

---

## 二、完整列表页示例

以下是一个**可直接运行**的列表页原型参考。所有原型页面应参考此质量标准。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>原型 - 用户列表</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/dayjs@1/dayjs.min.js"></script>
  <script src="https://unpkg.com/antd@5/dist/antd.min.js"></script>
  <script src="https://unpkg.com/@ant-design/icons@5/dist/index.umd.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    #root { min-height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const {
      Layout, Menu, Table, Button, Space, Tag, Input, Select,
      Card, Breadcrumb, Avatar, Badge, Typography, Divider,
      Popconfirm, message, Drawer, ConfigProvider
    } = antd;
    const { Header, Sider, Content } = Layout;
    const { Title, Text } = Typography;
    const {
      PlusOutlined, SearchOutlined, ReloadOutlined,
      EditOutlined, DeleteOutlined, DownloadOutlined,
      SettingOutlined, UserOutlined, HomeOutlined,
      BellOutlined, TeamOutlined, FileOutlined,
      DashboardOutlined, SafetyOutlined
    } = icons;

    const menuItems = [
      { key: 'dashboard', icon: <DashboardOutlined />, label: '工作台' },
      { key: 'users', icon: <TeamOutlined />, label: '用户管理' },
      { key: 'roles', icon: <SafetyOutlined />, label: '角色权限' },
      { key: 'logs', icon: <FileOutlined />, label: '操作日志' },
      { key: 'settings', icon: <SettingOutlined />, label: '系统设置' },
    ];

    const mockData = [
      { id: '1', name: '张伟', email: 'zhangwei@company.com', role: '系统管理员', status: '启用', department: '技术部', createdAt: '2025-01-15 09:30' },
      { id: '2', name: '李娜', email: 'lina@company.com', role: '运营专员', status: '启用', department: '运营部', createdAt: '2025-02-20 14:15' },
      { id: '3', name: '王磊', email: 'wanglei@company.com', role: '开发工程师', status: '禁用', department: '技术部', createdAt: '2025-03-01 10:45' },
      { id: '4', name: '赵敏', email: 'zhaomin@company.com', role: '产品经理', status: '启用', department: '产品部', createdAt: '2025-03-10 16:20' },
      { id: '5', name: '陈浩', email: 'chenhao@company.com', role: '测试工程师', status: '待激活', department: '质量部', createdAt: '2025-03-25 08:00' },
      { id: '6', name: '刘洋', email: 'liuyang@company.com', role: '运维工程师', status: '启用', department: '技术部', createdAt: '2025-04-05 11:30' },
      { id: '7', name: '周婷', email: 'zhouting@company.com', role: '设计师', status: '启用', department: '设计部', createdAt: '2025-04-12 09:15' },
      { id: '8', name: '吴鹏', email: 'wupeng@company.com', role: '数据分析师', status: '禁用', department: '数据部', createdAt: '2025-04-20 13:45' },
    ];

    function App() {
      const [collapsed, setCollapsed] = React.useState(false);
      const [reqDrawerOpen, setReqDrawerOpen] = React.useState(false);

      const statusColorMap = {
        '启用': 'success',
        '禁用': 'error',
        '待激活': 'warning',
      };

      const columns = [
        { title: '用户名', dataIndex: 'name', key: 'name', width: 100 },
        { title: '邮箱', dataIndex: 'email', key: 'email', width: 220 },
        { title: '部门', dataIndex: 'department', key: 'department', width: 100 },
        { title: '角色', dataIndex: 'role', key: 'role', width: 120 },
        {
          title: '状态', dataIndex: 'status', key: 'status', width: 90,
          render: (status) => <Tag color={statusColorMap[status] || 'default'}>{status}</Tag>
        },
        {
          title: '注册时间', dataIndex: 'createdAt', key: 'createdAt', width: 170,
          render: (text) => <Text type="secondary">{text}</Text>
        },
        {
          title: '操作', key: 'action', width: 150,
          render: (_, record) => (
            <Space split={<Divider type="vertical" />}>
              <a onClick={() => message.info(`编辑用户：${record.name}`)}>编辑</a>
              <a onClick={() => message.info(`查看详情：${record.name}`)}>详情</a>
              <Popconfirm title="确定删除该用户吗？" onConfirm={() => message.success(`已删除：${record.name}`)} okText="确定" cancelText="取消">
                <a style={{ color: '#ff4d4f' }}>删除</a>
              </Popconfirm>
            </Space>
          )
        }
      ];

      return (
        <ConfigProvider>
          <Layout style={{ minHeight: '100vh' }}>
            <Sider
              collapsible
              collapsed={collapsed}
              onCollapse={setCollapsed}
              theme="dark"
              width={208}
            >
              <div style={{
                height: 64, display: 'flex', alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? 0 : '0 16px', overflow: 'hidden'
              }}>
                <div style={{
                  width: 32, height: 32, background: '#1677ff', borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 'bold', fontSize: 16, flexShrink: 0
                }}>A</div>
                {!collapsed && (
                  <span style={{ color: '#fff', marginLeft: 12, fontSize: 16, fontWeight: 500, whiteSpace: 'nowrap' }}>
                    管理后台
                  </span>
                )}
              </div>
              <Menu
                theme="dark"
                selectedKeys={['users']}
                mode="inline"
                items={menuItems}
              />
            </Sider>
            <Layout>
              <Header style={{
                background: '#fff', padding: '0 24px', height: 64,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxShadow: '0 1px 4px rgba(0,21,41,0.08)'
              }}>
                <Breadcrumb items={[
                  { title: <><HomeOutlined /> 首页</> },
                  { title: '用户管理' }
                ]} />
                <Space size={16}>
                  <Badge count={3}>
                    <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
                  </Badge>
                  <Space>
                    <Avatar icon={<UserOutlined />} />
                    <Text>管理员</Text>
                  </Space>
                </Space>
              </Header>
              <Content style={{ margin: 24 }}>
                <Title level={4} style={{ marginBottom: 16 }}>用户列表</Title>

                {/* 搜索筛选卡片 */}
                <Card style={{ marginBottom: 16 }}>
                  <Space wrap size={[16, 12]}>
                    <Input placeholder="用户名" style={{ width: 200 }} prefix={<SearchOutlined />} allowClear />
                    <Input placeholder="邮箱" style={{ width: 220 }} allowClear />
                    <Select placeholder="全部部门" style={{ width: 150 }} allowClear
                      options={[
                        { value: 'tech', label: '技术部' },
                        { value: 'ops', label: '运营部' },
                        { value: 'product', label: '产品部' },
                        { value: 'design', label: '设计部' },
                      ]}
                    />
                    <Select placeholder="全部状态" style={{ width: 130 }} allowClear
                      options={[
                        { value: 'active', label: '启用' },
                        { value: 'disabled', label: '禁用' },
                        { value: 'pending', label: '待激活' },
                      ]}
                    />
                    <Button type="primary" icon={<SearchOutlined />} onClick={() => message.success('搜索完成')}>搜索</Button>
                    <Button icon={<ReloadOutlined />} onClick={() => message.info('已重置筛选条件')}>重置</Button>
                  </Space>
                </Card>

                {/* 数据表格卡片 */}
                <Card>
                  <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space>
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => message.info('打开新增用户表单')}>新增用户</Button>
                      <Button icon={<DownloadOutlined />} onClick={() => message.info('导出用户数据')}>导出</Button>
                    </Space>
                  </div>
                  <Table
                    columns={columns}
                    dataSource={mockData}
                    rowKey="id"
                    pagination={{
                      total: 156,
                      pageSize: 10,
                      showSizeChanger: true,
                      showTotal: (total) => `共 ${total} 条`,
                      pageSizeOptions: ['10', '20', '50'],
                    }}
                  />
                </Card>
              </Content>
            </Layout>
          </Layout>

          {/* 需求说明浮动按钮 */}
          <Button
            type="primary"
            shape="circle"
            size="large"
            icon={<FileOutlined />}
            onClick={() => setReqDrawerOpen(true)}
            style={{
              position: 'fixed', bottom: 32, right: 32, width: 48, height: 48,
              boxShadow: '0 4px 12px rgba(22,119,255,0.4)', zIndex: 999
            }}
          />

          {/* 需求说明抽屉 */}
          <Drawer
            title="用户列表 — 需求说明"
            open={reqDrawerOpen}
            onClose={() => setReqDrawerOpen(false)}
            width={520}
          >
            <Card size="small" title="页面概述" style={{ marginBottom: 12 }}>
              <Text type="secondary" style={{ lineHeight: 1.8 }}>
                本页面用于管理系统用户，支持搜索、新增、编辑和删除操作。
                用户可按用户名、邮箱、部门、状态进行筛选。
              </Text>
            </Card>
            <Card size="small" title="搜索区域" style={{ marginBottom: 12 }}>
              <Descriptions column={1} size="small">
                <Descriptions.Item label="搜索按钮">根据输入条件筛选表格数据</Descriptions.Item>
                <Descriptions.Item label="重置按钮">清空所有搜索条件，恢复初始列表</Descriptions.Item>
              </Descriptions>
            </Card>
            <Card size="small" title="数据表格" style={{ marginBottom: 12 }}>
              <Descriptions column={1} size="small">
                <Descriptions.Item label="列定义">用户名、邮箱、部门、角色、状态、注册时间、操作</Descriptions.Item>
                <Descriptions.Item label="分页">默认每页 10 条，支持 10/20/50 条切换</Descriptions.Item>
              </Descriptions>
            </Card>
            <Card size="small" title="操作按钮">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="新增">打开抽屉表单，填写后提交创建</Descriptions.Item>
                <Descriptions.Item label="编辑">打开编辑表单，数据自动回显</Descriptions.Item>
                <Descriptions.Item label="删除">二次确认后删除记录</Descriptions.Item>
                <Descriptions.Item label="导出">导出当前筛选结果为 Excel</Descriptions.Item>
              </Descriptions>
            </Card>
          </Drawer>
        </ConfigProvider>
      );
    }

    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<App />);
  </script>
</body>
</html>
```

---

## 三、完整详情页示例（核心结构）

```jsx
function DetailPage() {
  const [reqDrawerOpen, setReqDrawerOpen] = React.useState(false);

  const descItems = [
    { key: 'name', label: '名称', children: '智能客服主流程' },
    { key: 'status', label: '状态', children: <Tag color="success">已发布</Tag> },
    { key: 'version', label: '版本号', children: 'v5' },
    { key: 'creator', label: '创建人', children: '张伟' },
    { key: 'createdAt', label: '创建时间', children: '2025-03-15 09:30:00' },
    { key: 'updatedAt', label: '更新时间', children: '2025-03-28 14:22:00' },
    { key: 'description', label: '描述', children: '主要处理售后场景的智能对话流程', span: 3 },
  ];

  return (
    <>
      {/* 放在 Content 区域内 */}
      <div style={{ marginBottom: 16 }}>
        <a onClick={() => message.info('返回列表')} style={{ marginBottom: 8, display: 'inline-block' }}>
          <Space><ArrowLeftOutlined />返回列表</Space>
        </a>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Scene 版本详情</Title>
        <Space>
          <Button icon={<EditOutlined />} onClick={() => message.info('进入编辑')}>编辑</Button>
          <Button type="primary" onClick={() => message.info('保存为新版本')}>保存为新版本</Button>
        </Space>
      </div>

      <Card title="基础信息" style={{ marginBottom: 16 }}>
        <Descriptions column={3} bordered items={descItems} />
      </Card>

      <Card title="Agent 编排" style={{ marginBottom: 16 }}>
        <Table
          rowKey="slot"
          columns={[
            { title: '槽位', dataIndex: 'slot', width: 120 },
            { title: 'Agent', dataIndex: 'agentName', width: 180 },
            { title: '版本', dataIndex: 'version', width: 80 },
            { title: '模型参数', dataIndex: 'params', width: 200 },
          ]}
          dataSource={[
            { slot: '主对话', agentName: '售后主 Agent', version: 'v12', params: 'temperature 0.3 · max_tokens 4096' },
            { slot: '工单摘要', agentName: '摘要 Agent', version: 'v4', params: 'temperature 0.1' },
          ]}
          pagination={false}
          size="middle"
        />
      </Card>
    </>
  );
}
```

---

## 四、完整表单页示例（核心结构）

```jsx
function FormPage() {
  return (
    <>
      <Title level={4} style={{ marginBottom: 16 }}>新建 Agent</Title>
      <Card>
        <Form layout="vertical" style={{ maxWidth: 800 }} onFinish={() => message.success('提交成功')}>
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item label="Agent 名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
                <Input placeholder="请输入 Agent 名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="类型" name="type" rules={[{ required: true, message: '请选择类型' }]}>
                <Select placeholder="请选择类型" options={[
                  { value: 'chat', label: '对话型' },
                  { value: 'task', label: '任务型' },
                  { value: 'retrieval', label: '检索型' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="系统提示词" name="systemPrompt">
            <Input.TextArea rows={4} placeholder="请输入系统提示词" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} placeholder="请输入描述" />
          </Form.Item>
          <Divider />
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space>
              <Button onClick={() => message.info('返回')}>取消</Button>
              <Button type="primary" htmlType="submit">提交</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </>
  );
}
```

---

## 五、需求说明浮动按钮 + 抽屉

每个原型页面必须包含需求说明功能：

```jsx
function RequirementFAB({ pageName, children }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      {/* 右下角浮动按钮 */}
      <Button
        type="primary"
        shape="circle"
        size="large"
        icon={<FileOutlined />}
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 32, right: 32,
          width: 48, height: 48,
          boxShadow: '0 4px 12px rgba(22,119,255,0.4)',
          zIndex: 999
        }}
      />
      {/* 需求说明抽屉 */}
      <Drawer
        title={`${pageName} — 需求说明`}
        open={open}
        onClose={() => setOpen(false)}
        width={520}
      >
        {children}
      </Drawer>
    </>
  );
}

// 在 App 中使用：
function App() {
  return (
    <ConfigProvider>
      <Layout>...</Layout>
      <RequirementFAB pageName="用户列表">
        <Card size="small" title="页面概述" style={{ marginBottom: 12 }}>
          <Text type="secondary">页面功能描述...</Text>
        </Card>
        <Card size="small" title="操作说明" style={{ marginBottom: 12 }}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="新增">打开表单...</Descriptions.Item>
            <Descriptions.Item label="编辑">编辑记录...</Descriptions.Item>
          </Descriptions>
        </Card>
      </RequirementFAB>
    </ConfigProvider>
  );
}
```

### 需求说明抽屉内容结构

使用 antd `Card` + `Descriptions` 组件组织需求说明（不要手写 div）：

```jsx
<Drawer title="页面名 — 需求说明" open={open} onClose={onClose} width={520}>
  <Card size="small" title="页面概述" style={{ marginBottom: 12 }}>
    <Text type="secondary" style={{ lineHeight: 1.8 }}>
      {/* 功能描述文字 */}
    </Text>
  </Card>

  <Card size="small" title="搜索区域" style={{ marginBottom: 12 }}>
    <Descriptions column={1} size="small">
      <Descriptions.Item label="字段名">说明</Descriptions.Item>
    </Descriptions>
  </Card>

  <Card size="small" title="数据表格" style={{ marginBottom: 12 }}>
    <Descriptions column={1} size="small">
      <Descriptions.Item label="列定义">列名列表</Descriptions.Item>
      <Descriptions.Item label="分页">每页条数说明</Descriptions.Item>
    </Descriptions>
  </Card>

  <Card size="small" title="操作按钮" style={{ marginBottom: 12 }}>
    <Descriptions column={1} size="small">
      <Descriptions.Item label="新增">说明</Descriptions.Item>
      <Descriptions.Item label="编辑">说明</Descriptions.Item>
      <Descriptions.Item label="删除">说明</Descriptions.Item>
    </Descriptions>
  </Card>

  <Card size="small" title="边界场景">
    <Descriptions column={1} size="small">
      <Descriptions.Item label="空数据">展示 Empty 组件</Descriptions.Item>
      <Descriptions.Item label="加载中">显示 Spin 加载状态</Descriptions.Item>
    </Descriptions>
  </Card>
</Drawer>
```

---

## 六、目录页模板（index.html）

目录页使用 iframe 全屏预览原型，文件列表通过左上角浮动按钮打开抽屉查看。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>原型目录</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/dayjs@1/dayjs.min.js"></script>
  <script src="https://unpkg.com/antd@5/dist/antd.min.js"></script>
  <script src="https://unpkg.com/@ant-design/icons@5/dist/index.umd.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; }
    #root { width: 100vw; height: 100vh; }
    iframe { width: 100%; height: 100%; border: none; display: block; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { Button, Drawer, List, Typography, Tag, Space, ConfigProvider } = antd;
    const { Text, Title } = Typography;
    const { MenuOutlined, FileOutlined } = icons;

    const prototypeFiles = [
      // 根据实际生成的文件填充
      { name: '用户列表', file: 'prototype-xxx-user-list.html', type: 'list', date: '2025-03-30' },
      { name: '用户详情', file: 'prototype-xxx-user-detail.html', type: 'detail', date: '2025-03-30' },
    ];

    const typeColorMap = { list: 'blue', detail: 'green', form: 'orange', dashboard: 'purple' };

    function App() {
      const [drawerOpen, setDrawerOpen] = React.useState(false);
      const [currentFile, setCurrentFile] = React.useState(prototypeFiles[0]?.file || '');
      const [currentName, setCurrentName] = React.useState(prototypeFiles[0]?.name || '');

      const handleSelect = (item) => {
        setCurrentFile(item.file);
        setCurrentName(item.name);
        setDrawerOpen(false);
      };

      return (
        <ConfigProvider>
          <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <iframe src={currentFile} title={currentName} />

            {/* 左上角导航按钮 */}
            <Button
              type="primary"
              icon={<MenuOutlined />}
              onClick={() => setDrawerOpen(true)}
              style={{
                position: 'fixed', top: 16, left: 16, zIndex: 999,
                boxShadow: '0 2px 8px rgba(22,119,255,0.4)'
              }}
            />

            {/* 目录抽屉 */}
            <Drawer
              title={
                <div>
                  <Title level={5} style={{ margin: 0 }}>原型目录</Title>
                  <Text type="secondary" style={{ fontSize: 13 }}>共 {prototypeFiles.length} 个原型页面</Text>
                </div>
              }
              placement="left"
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              width={360}
            >
              <List
                dataSource={prototypeFiles}
                renderItem={(item) => (
                  <List.Item
                    onClick={() => handleSelect(item)}
                    style={{
                      cursor: 'pointer', padding: '12px 16px', borderRadius: 6,
                      background: item.file === currentFile ? '#e6f4ff' : 'transparent',
                      borderLeft: item.file === currentFile ? '3px solid #1677ff' : '3px solid transparent',
                      marginBottom: 4
                    }}
                  >
                    <List.Item.Meta
                      avatar={<FileOutlined style={{ fontSize: 20, color: '#1677ff' }} />}
                      title={item.name}
                      description={
                        <Space size={8}>
                          <Tag color={typeColorMap[item.type]}>{item.type}</Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>{item.date}</Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </Drawer>
          </div>
        </ConfigProvider>
      );
    }

    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<App />);
  </script>
</body>
</html>
```

---

## 七、重要规则

1. **使用真实 antd React 组件**，不要手写 HTML 类名
2. **从全局变量解构**（`window.antd`、`window.icons`），不用 `import`
3. **使用 `<script type="text/babel">`** 编写 JSX
4. **antd 5.x 不需要单独 CSS 文件**，CSS-in-JS 自动注入
5. **每个页面必须有需求说明 FAB + Drawer**
6. **使用 `@ant-design/icons` 图标**，不用 emoji
7. **Mock 数据至少 5-8 条**，具有真实感
8. **Table 必须设置 `rowKey`**
9. **每列必须定义 `width`**
10. **删除操作必须用 `Popconfirm` 确认**
11. **所有原型页面共享统一的布局结构**（Sider + Header + Content）
12. **侧边栏菜单至少 4-6 项**，含当前选中高亮
