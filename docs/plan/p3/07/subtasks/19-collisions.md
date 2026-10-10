---
type: plan
status: active
phase: P3
task: "07"
subtask: "19"
updated: 2026-10-10
---

# 19 — 碰撞

**契约来源：** [spec](../spec.md) 的 S-06（碰撞）、AC-08（碰撞部分）；[命中与碰撞](../spec.md#命中与碰撞)；P3-02 spec 的 [CR-02](../../02/spec.md#cr-02-实体的战斗状态d-01)（`proximity` 与碎片耐久）、[CR-03](../../02/spec.md#cr-03-移动块的模式-12d-03)（写到 `spinning` 块时的抽取）、[CR-06](../../02/spec.md#cr-06-领域事件与次序d-01)（碰撞阶段的事件次序）、[CR-07](../../02/spec.md#cr-07-实例化扩展与系统流水线d-01d-03)（`collision` 阶段）、[CR-09](../../02/spec.md#cr-09-与-p3-06-的接口d-03)（冲量与定时旋转的写入、自动驾驶取消）。
**依赖：** 03, 15, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 H6 实现 `collision` 阶段（`collision.ts` 导出 `run`），只对状态 ≥ 7 的对象，两遍都用本 tick 移动后的位置：
  - **玩家对其他对象（`0x29670`）：** 门禁与玩家条件（不停靠、状态 ≥ 7；不检查被毁、Warp 与被毁视角）；对象为机体（`0xffffe`）与碎片（有 DEBRIS 记录、耐久 > 0）；检测为玩家中心在对方形状中（12 的 `0x29bf4`、`0x29d58`），每个重叠对象都处理。
  - **其他对象之间（`0x29934`）：** A 组（种类 `0x382`）与 B 组（`0xffc7c`）按数组次序；A×A（i < j）与 A×B，B×B 从不检测；只测 A 成员的中心在对方形状中。
  - **响应（`0x29eb8`、`0x2a12c`）：** 伤害公式、除以 (3 − 组) 的位置与大型种类的减半；冲量与定时旋转写入机体移动块（CR-09）：`0x29eb8` 写双方，`0x2a12c` 只写第一方（冲突 42）；每次响应 6 次抽取。写到 `spinning` 块（碎片）时没有字段可写，但抽取照常发生（CR-03）。
  - **碎片接触计数：** 每 tick 的局部量（所有碎片共用，不持久，不进状态与快照）：+0x5C 非零的碎片对玩家只在计数 < 组 × 2 + 2 时造成伤害，超限的接触也计数。碎片的耐久在每次接触都扣减，≤ 0 时调用 18 的击落（`0x24a6c`）。
  - **伤害：** 经 15 的 `0x2a5fc`，攻击者为 `none`，`hit` 的原因为 `collision`（碎片接触也是）。
  - **`proximity`：** 两遍写入（H6），供 P3-08 读取。
  - **自动驾驶取消：** 原版在玩家对机体的每次接触末尾调用 `0x27edc(0)`。P3 中没有可写的状态，不执行；P4 接入自动驾驶时在这一位置加入（CR-09）。
- **测试：**
  - 两遍的次序与筛选；A、B 组与 B×B 不检测；几何边界。
  - 伤害、组因子与大型减半；冲量与定时旋转的写入与第一方限定；6 次抽取（含碎片）。
  - 碎片接触计数的边界（第 组 × 2 + 2 次与下一次）与每 tick 重置；碎片的耐久与击落。
  - `proximity`；同 tick 多次碰撞与死亡只发一次 `object-destroyed`。
  - 期望独立推导。

## 不包含

- 弹丸命中（17）；运动与冲量的消费（P3-06、22）；自动驾驶（P4）；碰撞可视化（P3-04）。

## 关键文件与契约

- `src/core/systems/collision.ts`（11 新建）：碰撞阶段。
- 使用 12 的 `src/core/rules/collision-shapes.ts`、15 的 `0x2a5fc`、18 的碎片实体与击落函数，以及 P3-06 移动块的冲量与定时旋转字段。
- 计划新增：`src/core/rules/collision.ts` 及相邻测试。

## 写入范围

- `src/core/systems/collision.ts`：碰撞阶段。
- `src/core/systems/collision.test.ts`：碰撞系统测试（新建）。
- `src/core/rules/collision.ts`：碰撞判定、响应与伤害公式（新建）。
- `src/core/rules/collision.test.ts`：碰撞规则测试（新建）。
- `src/core/world/world.test-support.ts`：导出 `withEveryKindBound`（为测试世界中没有静态规则数据的种类补上不含任何点的形状），`testState()` 使用它。
- `src/core/systems/energy.test.ts`、`src/core/systems/area.test.ts`、`src/core/replay/snapshot.test.ts`：测试世界经 `withEveryKindBound`。
- `src/core/systems/pipeline.test.ts`：阶段表加入 `collision` 的 `run`。

## 验收标准

- [ ] AC-08（碰撞）：`0x29670`、`0x29934` 的次序、分组、筛选、检测与伤害公式按 H6；组因子与大型减半在正确位置；响应按 H6 写第一方或双方，每次 6 次抽取。
- [ ] AC-08（碰撞）：碎片接触计数是每 tick 的局部量，边界正确；`hit` 的原因为 `collision`；`proximity` 正确；不从模型或渲染网格推导碰撞体；自动驾驶取消不执行。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：以合成实体放置重叠与相邻位置，经正式 `step` 断言伤害、事件、移动块字段与抽取次数。
- 冲量与定时旋转被 P3-06 积分消费的集成在 22；原版对照见 27。

## 完成证据
