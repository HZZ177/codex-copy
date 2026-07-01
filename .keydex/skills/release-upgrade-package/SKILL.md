---
name: release-upgrade-package
description: |
  面向目标版本（target_version）的单文件幂等升级包生成技能。核心标准是生成一个可重复执行的 `upgrade.sql`：文件前半部分定义统一 helper procedures，正文只保留当前目标版本 block，并使用固定板块（New Tables / New Columns & Indexes / Special Objects / Data Backfill / Finalize，其中 Block D 固定输出公共幂等 SQL，如权限配置、白名单、业务线初始化等）。

  默认产物聚焦私有化部署真正会看的和会执行的内容：`upgrade.sql`。不再生成 `CHANGELOG.md`、`release-checklist.md`，也不再以 base_version 基线库、目标基线库构建、baseline_full.sql 作为标准升级主流程；普通 ORM 结构通过固定模板映射为幂等语句，特殊对象通过 special object 模板处理。
invocation: "manual"
argument-hint: "<target_version> [发布说明]"
---

# Release Upgrade Package

你现在处于「发布升级包生成模式」。

目标：围绕**目标版本**生成一个**单文件、可重复执行、适合私有化部署**的升级包。升级核心不再是“某个 base_version 到某个 target_version 的差异 SQL”，而是一个**顺序执行整文件即可的 `upgrade.sql`**。

---

## 一、输入要求

用户必须显式提供：

1. `target_version`

可选输入：

1. 本次迭代发布说明

推荐输入格式：

```text
/release-upgrade-package 0.4.0
```

或：

```text
/release-upgrade-package 0.4.0 .ktaicoding/
```

说明：
- 当前标准发布链路不再要求用户提供 `base_version`
- 也不再要求依赖 `.env` 中升级专用数据库配置来生成标准升级包
- 历史版本兼容由 `upgrade.sql` 内的多版本分段 + 幂等 helper 保证，而不是由版本差异计算保证

---

## 二、输出目录规则

默认输出到：

```text
docs/V<target_version>/update/
```

默认最少生成以下文件：

```text
docs/V<target_version>/update/
  upgrade.sql
```

其中：
- `upgrade.sql`：唯一执行入口

---

## 三、工作原则

1. **本技能直接产出发布材料，不产出泛泛规范说明。**
2. **`upgrade.sql` 是唯一主执行文件。**
3. **`upgrade.sql` 必须可重复执行。**
4. **文件前半部分必须统一定义 helper procedures。**
5. **正文只保留当前目标版本 block，不再累积历史版本段。**
6. **当前版本 block 必须使用固定板块，不允许自由发挥结构。**
7. **升级 SQL 必须非破坏性：禁止 `DROP / DELETE / TRUNCATE`，但允许 helper procedure 用 `DROP PROCEDURE IF EXISTS` 重建升级脚手架。**
8. **普通 ORM 结构变更通过固定模板映射为幂等语句。**
9. **特殊对象（分区、向量索引、全文索引等）必须通过 special object 模板处理。**
10. **默认不再生成 `baseline_full.sql`，也不再把目标基线库构建视为标准主流程。**

---

## 四、`upgrade.sql` 文件结构（强制）

### 1. 文件头：Helper Procedures

文件前半部分统一定义幂等 helper，例如：
- `add_column_if_not_exists(...)`
- `add_index_if_not_exists(...)`
- `add_partition_if_not_exists(...)`
- 其他必要的通用执行 helper

这些 helper 是升级框架的一部分，所有版本段必须复用。

### 2. 文件正文：当前目标版本 block

格式示例：

```sql
-- V0.4.0 开始 --
...
-- V0.4.0 结束 --
```

要求：
- 文件正文只保留当前目标版本 block
- 每次重新生成时，直接按当前仓库 model + special logic 输出最新目标态
- 执行时直接顺序跑完整文件

### 3. 当前版本 block 的固定板块

当前版本 block 必须按以下顺序组织：

1. `Block A: Schema - New Tables`
2. `Block B: Schema - New Columns / Indexes`
3. `Block C: Special Objects`
4. `Block D: Data Backfill / Repair`（固定输出公共幂等 SQL，如权限配置、白名单、业务线初始化等）
5. `Block E: Version Marker / Finalize`

禁止缺块、换序、混写。

---

## 五、执行流程

### Step 1：读取显式输入与必要材料

读取：
1. `target_version`
2. 发布说明（如有）
3. 当前仓库 ORM 模型
4. special object 模板

必须理解：
- 当前目标版本是多少
- 哪些普通结构可自动映射到固定板块
- 哪些对象必须走 special object

### Step 2：生成 `upgrade.sql`

固定通过主生成脚本执行：

```bash
python .Codex/skills/release-upgrade-package/scripts/generate_incremental_sql.py <target_version>
```

说明：
- 虽脚本名暂未改，但职责已切换为生成 `upgrade.sql`
- 生成器必须输出：helper procedures + 当前版本 block

### Step 3：生成升级包

固定通过总控脚本执行：

```bash
python .Codex/skills/release-upgrade-package/scripts/build_release_package.py <target_version>
```

总控脚本内部完成：
1. 生成 `upgrade.sql`
2. 输出产物路径与静态校验结果

---

## 六、校验要求

生成完成后必须自检：

1. `upgrade.sql` 是否存在
2. `upgrade.sql` 是否包含 helper procedures
3. 是否仅包含当前目标版本 block
4. 当前版本 block 是否包含固定五个板块
5. 是否存在未包装的裸 `ALTER TABLE ADD COLUMN/ADD INDEX`
6. 是否存在业务级 `DROP / DELETE / TRUNCATE`
7. special object 是否明确走了专用模板
8. Block D 是否输出统一公共幂等 SQL，且不含按环境定制的数据回填/修复逻辑

---

## 七、最终汇报格式

完成后必须向用户汇报：

```text
本次升级包已生成完成。

目标版本：v0.4.0
输出目录：docs/V0.4.0/update/

主执行文件：docs/V0.4.0/update/upgrade.sql

upgrade.sql 已按“helper procedures + 固定板块”标准生成，可重复执行。
请团队重点评审：
1. helper procedures 是否满足长期复用
2. 当前版本 block 是否符合固定模板
3. special object 处理是否完整
```

---

## 八、禁止事项

1. 不要再生成以 `incremental_from_vX.sql` 为主的标准产物
2. 不要再把基线库构建作为标准发布主流程
3. 不要输出自由结构 SQL
4. 不要把特殊对象混入普通 Block A/B
5. 不要输出业务级 `DROP / DELETE / TRUNCATE`
6. 不要在 Block D 自动生成数据回填、修复或迁移 SQL
7. 不要在未确认目标版本前落盘

---

## 九、成功标准

只有当以下条件全部满足，才算技能执行成功：

1. 已生成目标版本目录
2. 已生成 `upgrade.sql`
3. `upgrade.sql` 已包含 helper procedures
4. `upgrade.sql` 已包含当前版本 block，且结构完整
5. 已通过静态幂等校验
6. 用户可以直接拿 `upgrade.sql` 做线下重复执行
