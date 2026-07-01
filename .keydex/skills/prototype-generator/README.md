# Prototype Generator（原型生成器）

根据需求文档生成 Ant Design 风格的前端原型HTML页面。

## 功能

- 读取需求文档（REQ文档或产品说明）
- 评估页面清单并与用户确认
- **强制需求确认环节**（不可跳过，确保原型完成度）
- 查看项目现有页面现状（判断新增/修改）
- 通过提问澄清需求细节（每轮最多3问）
- **逐页派发subagent生成原型**（每个页面独立subagent，避免上下文爆炸）
- **审查subagent验收**（生成后自动审查，未通过则重新生成）
- **使用真正的 Ant Design CSS（`antd.min.css`）生成高保真原型**
- 输出全屏原型 + 浮动按钮 + 需求说明抽屉
- **支持旧原型改造**（生成新文件，保留旧文件）

## 触发方式

### 场景A：根据需求生成新原型
```
/prototype
/生成原型
根据需求生成原型页面
```

### 场景B：旧原型改造
```
/改造原型
/优化原型
旧原型需要修改
```

## 工作流程

### 场景A：新原型
```
1. 读取需求文档
2. 评估页面清单（等待用户确认）
3. 需求确认（强制执行，不可跳过）
4. 逐页派发subagent生成 + 审查subagent验收
5. 生成目录页 → 输出到 docs/prototype
```

### 场景B：旧原型改造
```
1. 读取旧原型HTML → 分析结构
2. 确认改造需求（每轮最多3问）
3. 逐页派发subagent生成新原型 + 审查验收
4. 输出（新文件名，保留旧文件）
```

## 输出格式

### 场景A：新原型
```
docs/prototype/
├── index.html                              # 目录页（浮动按钮+抽屉导航）
├── prototype-20240325-user-list.html       # 全屏原型 + 浮动按钮 + 需求说明抽屉
├── prototype-20240325-user-detail.html
└── prototype-20240325-user-form.html
```

### 场景B：旧原型改造
```
docs/prototype/
├── prototype-20240320-user-list.html      # 旧文件（保留）
├── prototype-20240325-user-list-v2.html   # 新文件（改造后）
└── ...
```

## 页面结构

每个HTML原型文件包含：
- **全屏原型**：Ant Design 风格的页面，宽度自适应（无固定宽度限制），使用 mock 数据
- **右下角浮动按钮**：点击打开需求说明抽屉
- **需求说明抽屉**：从右侧滑入，展示交互说明文档

### 目录页（index.html）
- **iframe 全屏预览**：默认加载第一个原型页面
- **左上角浮动按钮**：点击打开目录抽屉
- **目录抽屉**：从左侧滑入，展示原型文件列表，点击切换

## 核心设计理念

1. **全屏展示**：原型页面不设固定宽度，像真实网页一样呈现
2. **按需查看**：需求说明和目录都隐藏在抽屉中，最大化原型展示空间
3. **逐页生成**：每个页面独立subagent生成，确保每页都有足够的关注度和完成度
4. **质量保障**：审查subagent对每页验收，未通过则重新生成

## 技能目录结构

```
prototype-generator/
├── SKILL.md                   # 主技能文档
├── README.md                  # 使用说明
├── docs/
│   ├── design-guide.md        # Ant Design设计规范
│   └── output-format.md       # HTML输出格式规范
├── evals/
│   └── evals.json             # 测试用例
└── scripts/
    ├── generate_page.py       # 单页面生成
    ├── batch_generate.py      # 多页面并行生成
    ├── generate_index.py      # 目录页生成（浮动按钮+抽屉）
    └── generator.py           # 辅助生成器类
```

## 参考资源

- `docs/design-guide.md` - Ant Design 4.x 设计规范（使用真正的 `antd.min.css`）
- `docs/output-format.md` - HTML输出格式详细规范（含浮动按钮+抽屉、目录页模板）
