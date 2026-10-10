---
type: plan
status: active
phase: P3
task: "07"
subtask: "32"
updated: 2026-10-10
---

# 32 — 导弹的转向模块与制导规则

**契约来源：** [spec](../spec.md) 的 S-05（导弹）、AC-07（规则部分）；P3-02 spec 的 [CR-02](../../02/spec.md#cr-02-实体的战斗状态d-01)（`MissileCombat`）、[CR-09](../../02/spec.md#cr-09-与-p3-06-的接口d-03)（共享的转向模块）、[CR-11](../../02/spec.md#cr-11-表现层的归属与已批准的差异d-01)（未定的原版常量）；[executable 的 H5](../../../../original/formats/executable.md#h5-missiles--confirmed-code-unless-marked)。
**依赖：** 03, 12, 14。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 背景

协调者在执行中从 20 拆出本项（2026-10-10）。依据是用户对新增解除阻塞子任务的预先授权，以及用户临时把并行 worker 上限改为 5 的指示。20 原本要等 18（爆炸构造）与 31（引信间隔的读数）。其中纯规则部分既不需要 18，也不需要 31，因此先行，20 改为依赖本项。

## 工作范围

- **共享转向模块（H5，CR-09）：** 新建 `src/core/rules/steering.ts`，作为共享的 Core 规则模块，实现 AI 转向库中导弹使用的子集：
  - 目标点与提前量模式 3（`0x5c8b0`）；
  - 两个限幅 atan2 的比例（`0x5cd1c`）；
  - 控制块输出（`0x5d014`）；
  - 期限算术（`0x5dcd4`）；
  - 热寻的放弃（`0x60aa0`，1 次抽取）。
  P3-08 在其上扩展 AI 机体所需的部分，不另建。输出的 `ControlBlock` 形状按 CR-05。
- **制导规则（H5）：** 新建 `src/core/rules/guidance.ts`，作为纯函数：
  - 首次回调写入的制导块（相对值）与 `homing` 的初值；
  - `0x2ac10` 的阶段转移（时钟化、解除保险、寿命到期与熄火、起爆）与引信检查的时刻；
  - 引信 `0x2adac` 的几何：接触（有 box 的机体，严格的点测试，复用 12 的点测试）与近炸（种类掩码判断阵营、跳过目标以外的同阵营对象），不过滤活动、状态、被毁与 Warp；
  - 起爆的衰减伤害（`contact` 对象的距离按 0）与 `0x2b628` 的冲量与定时旋转（种类不在 `0xf9c7c` 时，6 次抽取）。
- **检查间隔的常量（冲突 29）：** 实现为参数，两种取值（减半或不减半）都有测试。生产取值由 20 按 31 的读数设定。
- **测试：** 用独立推导的期望覆盖转向模块的目标点、提前量、限幅比例、控制块与期限，以及热寻的放弃的抽取；阶段转移与寿命；引信的接触与近炸边界、阵营与不过滤的状态；起爆的衰减与 `0x2b628` 的抽取与写入。

## 不包含

- 导弹的对象更新、`steer` 与 `expire` 请求、起爆时调用 18 的爆炸构造与 15 的伤害入口、事件发出（20）。
- 模式 0 的积分与 `0x21fd8`（P3-06），以及经积分的飞行（22）；AI 机体的转向（P3-08）。

## 关键文件与契约

- [executable 的 H5](../../../../original/formats/executable.md#h5-missiles--confirmed-code-unless-marked) 与 [W11](../../../../original/formats/executable.md#w11-launch-message-8-and-the-two-constructors--confirmed-code)；12 的 `src/core/rules/collision-shapes.ts` 点测试；14 的导弹构造与 `MissileCombat` 初值。
- 计划新增：`src/core/rules/steering.ts`、`src/core/rules/guidance.ts` 及相邻测试。

## 写入范围

- `src/core/rules/steering.ts`：共享的转向模块（新建，P3-08 扩展）。
- `src/core/rules/steering.test.ts`：转向模块测试（新建）。
- `src/core/rules/guidance.ts`：制导块、阶段、引信几何与起爆衰减（新建）。
- `src/core/rules/guidance.test.ts`：制导规则测试（新建）。

## 验收标准

- [ ] 共享转向模块按 CR-09 实现导弹使用的子集，有独立期望的测试；没有替代积分器或近似追踪。
- [ ] H5 的阶段、寿命、引信（接触与近炸）与起爆衰减的规则函数全部覆盖，`0x2b628` 的抽取与写入正确。
- [ ] 冲突 29 的常量是参数，两种取值都有测试，不择一写死。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：以给定的导弹、目标与场景状态断言规则函数的结果；期望由 H5 独立推导，不调用被测实现。

## 完成证据
