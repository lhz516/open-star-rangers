---
type: plan
status: active
phase: P3
task: "07"
subtask: "23"
updated: 2026-10-09
---

# 23 — `combat` 分区

**契约来源：** [spec](../spec.md) 的 S-03（读数部分）、S-08（显示状态）、AC-04；[目标与传感](../spec.md#目标与传感)、[能量与显示状态](../spec.md#能量与显示状态)、技术决定 1、6；分区形状以 08 获批的 P3-02 修订为准。
**依赖：** 13, 14, 15, 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 08 获批的形状实现 `combat` 分区的就绪内容：
  - 当前目标与目标信息（经可见性门禁，按 Q-02）；
  - 雷达接触点（使用 13 的选取：正常与受损的范围、筛选、上限与排序）；
  - 资源（能量、护盾、充能、船体，原始值与满刻度）、弹药、锁定、子系统状态与显示页面（16）。
- 若 08 规定由 P3-07 填充 `flight` 分区中的武器或资源成员，也在这里实现。
- 判别：分区未实现、玩家未出现或已移除、就绪、已被毁四种状态互不混淆。
- 纯度：输出冻结，脱离内部状态；重复读取、改变读取频率或纯外观不消耗 Core RNG，也不改变玩法状态。
- **测试：** 用合成世界做消费者契约测试。覆盖每个判别；雷达的各边界；目标信息不绕过可见性；输出冻结且与内部状态脱离；重复读取前后状态、事件与检查点哈希相同。

## 不包含

- 雷达与 HUD 的绘制（P3-13）；Runtime 的读取频率（P3-04）。
- 运动读数的 `flight` 成员（P3-06），08 另有规定的除外。

## 关键文件与契约

- [projection.ts](../../../../../src/core/projections/projection.ts)（11 已改为新形状）。
- 13 的 `src/core/rules/radar.ts` 与目标规则；16 的页面状态。
- 计划新增：`src/core/projections/combat.ts` 及相邻测试。

## 写入范围

- `src/core/projections/combat.ts`：`combat` 分区的构造（新建）。
- `src/core/projections/combat.test.ts`：消费者契约测试（新建）。
- `src/core/projections/projection.ts`：接入 `combat` 分区。
- `src/core/projections/projection.test.ts`：分区判别测试。

## 验收标准

- [ ] AC-04：未实现、玩家未出现或已移除、就绪、已被毁四种状态不混淆。
- [ ] AC-04：雷达正常与受损时的范围、筛选、上限和排序满足 Q-02；目标信息不绕过可见性。
- [ ] AC-04：资源、弹药、锁定、子系统与显示页面符合获批形状；输出冻结且脱离内部状态；重复读取不消耗 Core RNG，也不改变状态。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 消费者契约测试。对同一输入，比较读取与不读取分区两种情况下的状态与事件；不需要浏览器。

## 完成证据
