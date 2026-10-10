---
type: plan
status: active
phase: P3
task: "07"
subtask: "18"
updated: 2026-10-09
---

# 18 — 被毁、爆炸与碎片

**契约来源：** [spec](../spec.md) 的 S-10、AC-12；[被毁、爆炸与碎片](../spec.md#被毁爆炸与碎片)、[联合依赖与阶段时序](../spec.md#联合依赖与阶段时序)、[数值、随机数与逻辑视点](../spec.md#数值随机数与逻辑视点)、技术决定 4、5。
**依赖：** 06, 07, 12, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **爆炸：** 按 06 的 Q-10 结论实现 15 调用的毁伤入口：被毁对象进入 `destroyed-source`（不再更新，仍移动）、爆炸实体（种类位 22）、大小类别与额外爆炸；玩家只设延迟计时，`delayed-player-explosion` 阶段（`destruction.ts` 导出 `run`）在到期后创建爆炸；按 08 定稿的直接创建例外处理首更新、首运动与移除时刻。
- **EXPL 选择：** 按 08 定稿的归属：由 Core 拥有时，每次爆炸只抽取一次（使用 12 的建造期子集，索引指向原始 `ExplosionTable.lists`），写入表现选择器与 `explosion-started`；所选动画帧数与爆炸、被毁对象移除时刻的关系按 Q-10。由表现层拥有时，Core 不抽取，只在事件中给出类别等输入。
- **碎片（种类位 24）：** 判别值 3 按源模型第 1 列表的原序号产生，种类 1、2 跳过部件 1、2，DEBRIS 参数允许原版明确的空引用（逃生舱）；初始运动、旋转、耐久与到期按 Q-10。判别值 1、2 按 08 定稿：属于 Core 时实现事件 `0x10` 的到期、距离与种类门禁，屏幕内门禁使用 08 定稿的逻辑视点，不读渲染器。
- **到期：** 逃生舱 0x140 单位到期时发出 `fragment-expired` 并写入具名待处理状态（不宣称救援已实现）；僚机部件 0 等特例按 Q-10。
- 碎片与爆炸的运动若需移动阶段，接线归 22；本项交付其规则函数。
- **测试：** 创建、首更新、首运动与移除时刻；玩家延迟爆炸从各自原点计时；EXPL 子集与单次选择的映射、重复索引与 RNG 状态；动画与声音不各自抽取；碎片的部件序号、逃生舱的无参数部件与必需参数缺失；各判别值的寿命、耐久、接触与逻辑视点门禁。

## 不包含

- 爆炸与碎片的绘制、缩放与音效（P3-12、P3-14）；被毁视角相机（P3-12）；救援（P3-11）；碎片与机体的碰撞（19）、碎片受击（17）。

## 关键文件与契约

- `src/core/systems/destruction.ts`（11 新建）：毁伤入口、延迟爆炸阶段、爆炸与碎片的按种类更新。
- 使用 12 的 `src/core/rules/explosion-subsets.ts` 与 `src/core/world/rule-data.ts` 的部件元数据与 DEBRIS 映射。
- 计划新增：`src/core/rules/explosions.ts`、`src/core/rules/fragments.ts` 及相邻测试。

## 写入范围

- `src/core/systems/destruction.ts`：毁伤、爆炸与碎片。
- `src/core/systems/destruction.test.ts`：毁伤系统测试（新建）。
- `src/core/rules/explosions.ts`：爆炸类别、EXPL 选择与生命周期（新建）。
- `src/core/rules/explosions.test.ts`：爆炸测试（新建）。
- `src/core/rules/fragments.ts`：碎片产生、初态、耐久与到期（新建）。
- `src/core/rules/fragments.test.ts`：碎片测试（新建）。

## 验收标准

- [ ] AC-12：Q-10 确定的创建、首更新、首运动与移除时刻满足阶段契约；玩家延迟爆炸与逃生舱到期从各自原点计时。
- [ ] AC-12：EXPL 选择的所有权符合 08；子集与单次选择的映射、重复索引与 RNG 状态可核对；动画与声音不各自抽取。
- [ ] AC-12：碎片用原模型部件序号，覆盖允许无 DEBRIS 的逃生舱与必需参数缺失；各判别值的寿命、耐久、接触与逻辑视点门禁正确。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：经正式 `step` 断言事件次序与实体生命周期；随机部分按代码推导的映射与原像计数。
- 不读取渲染状态；原版对照见 27。

## 完成证据
