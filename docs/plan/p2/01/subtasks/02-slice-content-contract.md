---
type: plan
status: active
phase: P2
task: "01"
subtask: "02"
updated: 2026-10-03
---

# 02 — 切片内容与 Asset ID 契约

**契约来源：** [spec](../spec.md) 的 S-01、S-03、S-04、S-05、S-08、S-10；AC-01 至 AC-04、AC-09。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在计划新增的 `src/content/` 定义唯一 `classic-p2-slice`、切片定义/schema 版本、封闭资源组、角色基数、Asset ID 语法（8 段、每段 32 字符、总长 128 字符）和 manifest/来源判别数据。
- 定义 `AssetDescriptor`、依赖引用、`ContentOrigin`、`SliceDefinition`、manifest identity、converter/source identity 等纯数据类型；所有跨资源引用使用 Asset ID，不暴露 NOB entry ID。
- 将 01 的合格候选和角色清单写入唯一生产定义；不合格或未确认候选不得写成成功配置。

## 不包含

- 不实现来源 locator、完整性验证、预算累计或浏览器/Worker/IndexedDB 适配。
- 不选定未由 01 证据支持的模型、敌我关系或玩法规则。

## 关键文件与契约

- 计划新增 `src/content/` 内按职责拆分的纯模块文件与邻接测试入口；当前不存在。
- [tsconfig.core.json](../../../../../tsconfig.core.json)与 [工程边界](../../../../../tools/engineering-boundaries.test.ts)约束纯度。

## 验收标准

- [ ] 生产中仅有一份切片定义，完整角色和组基数与 spec 一致。
- [ ] Asset ID、版本、manifest、origin 和依赖数据是可结构化克隆的纯数据，且调用者修改输入不影响内部值。
- [ ] 合成来源和原版来源具有不可混淆的判别形状。

## 验证方法

- Node/Vitest 合成正负 fixture；不读取 `local/`。
- 运行纯模块类型和 lint 边界测试；不适用 browser-testing。

## 完成证据
