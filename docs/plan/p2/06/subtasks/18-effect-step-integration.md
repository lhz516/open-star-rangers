---
type: plan
status: active
phase: P2
task: "06"
subtask: "18"
updated: 2026-10-06
---

# 18 — 效果步骤、生产输入与作业集成

**契约来源：** [spec](../spec.md) 的[效果几何数据](../spec.md#效果几何数据)中“来源”“步骤、预算与组”“完整性”；生产 Asset 中的效果几何数据行；错误码与失败边界一览中的效果条目；AC-20，以及 AC-08 至 AC-10 的同步。
**依赖：** 15, 16, 17。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。由 2026-10-06 的 spec 修订加入，见 [goal 执行记录](../goal.md#执行记录)。

## 工作范围

- **效果步骤（`original-data/conversion/`）：** 在 `convert-models` 阶段内、模型步骤之后运行：
  - 读取 RENS 弹丸记录表与 EXE 区域，校验格式规则；
  - 编码三个 payload，按模型份额扣除 `assets`、`dependencyEdges`、payload 字节，以及展开后的 `vertices` 与 `triangles`（每面角数 − 2）；
  - 把映射标为 `verified`，结果并入 `models` 组；
  - 失败位置按 spec 的效果位置语法，没有部分结果。
- **生产输入：** 三个 `data` Asset 的声明与映射。RENS 条目与 EXE 区域清单（对象、偏移、长度、用途）只放在生产常量中；置信度为 likely，带 U-027。
- **作业：** [import-job.ts](../../../../../src/workers/import-job.ts) 在同一阶段调用效果步骤，协议版本与阶段不变。
- **合成光盘：** 加入合成 RENS 与合成 EXE（区域位置与生产常量一致），更新 `sliceCoveredFiles`、Worker 场景、作业与管线测试，以及 E2E 的 `models` 用例与期望用量。
- **文档：** 同步[源码结构](../../../../engineering/source-structure.md)与[工程约定](../../../../engineering/README.md)。

## 不包含

- 本地基准（19）；歧义贴图（12）。

## 关键文件与契约

- 新增效果步骤与生产效果输入模块；修改 `import-job.ts`、合成测试支持、作业、管线与 E2E 测试。
- 生产代码不新增调试 API；仓库中没有原版值。

## 验收标准

- [ ] AC-20：合成光盘上效果步骤得到三个 `data` Asset，`models` 组不再有效果角色的 `role-cardinality`；用量恰等于按 payload 布局与展开规模计算的期望，并计入模型份额；上界计算以常量与测试断言。
- [ ] 失败按失败边界一览逐行验证：区域或记录损坏时步骤失败、位置正确、没有部分结果。
- [ ] 作业阶段与协议版本不变；`pnpm test:e2e e2e/import-worker.spec.ts --project=development` 与全部项目通过。
- [ ] `pnpm check` 通过。

## 验证方法

- Node、`MessageChannel` 集成与 E2E。
- 完成前按 execute-goal 做 rubber-duck 与 simplify。

## 完成证据
