---
type: plan
status: active
phase: P3
task: "07"
subtask: "23"
updated: 2026-10-10
---

# 23 — 战斗组 `flight.combat`

**契约来源：** [spec](../spec.md) 的 S-03（读数部分）、S-08（显示状态）、AC-04；[目标与传感](../spec.md#目标与传感)、[能量与显示状态](../spec.md#能量与显示状态)、技术决定 1、6；P3-02 spec 的 [CR-12](../../02/spec.md#cr-12-projection-与-render-stated-01)（`flight.combat`），以及 [P3-06 的契约修订](../../02/spec.md#p3-06-的契约修订检查点-a)的 D-05（`flight: { motion, combat }`）。
**依赖：** 13, 14, 15, 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 CR-12 实现战斗组的就绪内容。战斗组是 P3-06 的 `flight: { motion, combat }` 中的 `flight.combat`，不是独立分区；运动组归 P3-06，两组互不覆盖。就绪时为 `{ readiness: 'ready'; player }`，没有玩家实体时 `player` 为 null，否则为 `CombatPlayer`：
  - `entityId`、`destroyed`、`targetMode`；
  - `target`（`CombatTarget`）：种类、名称引用、位置与姿态、距离（f32 坐标差的欧氏距离，T7）、速度（没有移动块时为 null）、护盾读数（机体为 {护盾, c5C}，其他为 null）；
  - `radar`：`status` 为子系统 12，接触点由 13 的雷达函数给出；
  - `resources`：能量 / c54、护盾 / c5C、充能 / c74、船体（原始值，可为负）/ c9C、剩余功率 E / T（D16）；`allocation` 为两个档位；
  - `weapons`：列表 0、1 的序号、当前挂点、武器记录引用（`craftInfo` 的 Asset ID 与 `family`、序号）、弹药（导弹项为从当前挂点起交替链上的弹药之和 `0x2dd04`，炮为 null）、当前挂点的损伤与列表状态（`0x2e438`、`0x2e264`）；
  - `lock`：等级、`losing` 与按 `0x2e080` 的进度；`subsystems`（19 项）；`leftPage`。
- **判别：** 战斗组未实现（`not-implemented`）、就绪而没有玩家（`player` 为 null）、就绪且玩家存活、就绪且玩家已被毁（`destroyed` 为 true）四种状态互不混淆。
- **纯度：** 输出冻结，与内部状态脱离；重复读取、改变读取频率或纯外观不消耗 Core RNG，也不改变玩法状态。
- **测试：** 用合成世界做消费者契约测试：覆盖每个判别；雷达的各边界与受损状态；目标信息的字段；资源、武器与锁定的读数（含导弹的弹药和与列表状态）；输出冻结且与内部状态脱离；重复读取前后的状态、事件与检查点哈希相同。

## 不包含

- 运动组（P3-06）；雷达的屏幕投影、噪点与 HUD 的绘制（P3-13）；Runtime 的读取频率（P3-04）。

## 关键文件与契约

- [projection.ts](../../../../../src/core/projections/projection.ts)（11 已加入战斗组的类型，为 `not-implemented`）。
- 13 的 `src/core/rules/radar.ts`；14 的 `src/core/rules/mounts.ts`（列表状态与弹药）；16 的页面状态。
- 计划新增：`src/core/projections/combat.ts` 及相邻测试。

## 写入范围

- `src/core/projections/combat.ts`：战斗组的构造（新建）。
- `src/core/projections/combat.test.ts`：消费者契约测试（新建）。
- `src/core/projections/projection.ts`：把战斗组接入 `flight`。
- `src/core/projections/projection.test.ts`：判别测试。
- `src/core/world/world.test.ts`：`populatedState()` 的玩家实体补上 `targeting`（CR-04 的不变量），不改断言。

## 验收标准

- [ ] AC-04：未实现、没有玩家、玩家存活、玩家已被毁四种状态不混淆；战斗组位于 `flight` 之内，不覆盖运动组。
- [ ] AC-04：雷达的筛选、次序、上限、分类与受损状态满足 CR-12；目标信息只给 CR-12 列出的字段。
- [ ] AC-04：资源、分配、武器、锁定、子系统与左页面符合 CR-12 的形状；输出冻结且与内部状态脱离；重复读取不消耗 Core RNG，也不改变状态。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 消费者契约测试。对同一输入，比较读取与不读取 projection 两种情况下的状态与事件；不需要浏览器。

## 完成证据
