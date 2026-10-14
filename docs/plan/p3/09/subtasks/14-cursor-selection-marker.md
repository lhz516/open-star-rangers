---
type: plan
status: active
phase: P3
task: "09"
subtask: "14"
updated: 2026-10-14
---

# 14 — 光标、选择与种类 25 标记

**契约来源：** [spec](../spec.md) 的 S-04、AC-04；[光标、跃迁目标与标记](../spec.md#光标跃迁目标与标记)。
**依赖：** 13, 28, 30。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- `map-point` hover 与 select：按 D-01 的空间约定量化到整数像素（0/1、像素边界与中心、非零原点），按 `0x4c4c0` 换算世界 x、y（无半像素，最大值止于世界最大值前一像素），按 `0x2bc30` 设定并夹取放大范围；比例的存储类型与运算按 02、07。
- select：按 02 确认的阶段读取图标列表（若为上一帧列表，由 Core 拥有并序列化），3 像素内最近图标的边界、并列与未命中，z 门禁两种状态；提交目的地与选择资格；有效 select 坐标不变时的点击事实按 02；多选框按 04；不把选框直接当作玩家目标切换（按 02 的结论）。
- 种类 25 标记：在 [entity-table.ts](../../../../../src/core/world/entity-table.ts) 中加入构造入口、来源、名称引用与表现判别；在 [movement.ts](../../../../../src/core/systems/movement.ts) 加入不读机型记录的模式 4 变体；各阶段的参与与创建/移动/首更新/移除/失效后再次选择按 03 的研究；保持 P3-07 的友方候选与雷达 `marker` 分类有效。
- 事件 `warp-destination-set` 按 D-01 的字段；hover 不发出音效事件。

## 不包含

- 可见性与接触点（15）；`map` 分区输出（19）。

## 关键文件与契约

- `src/core/rules/map-frame.ts`（计划新增，由 13 新建）、[entity-table.ts](../../../../../src/core/world/entity-table.ts)、[movement.ts](../../../../../src/core/systems/movement.ts)、[targeting.ts](../../../../../src/core/rules/targeting.ts)、[radar.ts](../../../../../src/core/rules/radar.ts)、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)。

## 写入范围

- `src/core/systems/map.ts`、`src/core/systems/map.test.ts`
- `src/core/rules/map-frame.ts`、`src/core/rules/map-frame.test.ts`
- `src/core/rules/map-icons.ts`、`src/core/rules/map-icons.test.ts`：计划新增（图标列表与命中）。
- `src/core/world/entity-table.ts`、`src/core/world/entity-table.test.ts`
- `src/core/systems/movement.ts`、`src/core/systems/movement.test.ts`
- `src/core/rules/targeting.test.ts`、`src/core/rules/radar.test.ts`：标记的回归。
- `src/core/replay/snapshot.ts`、`src/core/replay/snapshot.test.ts`：新状态的写入器。
- `src/core/rules/startup-rotations.ts`、`src/core/rules/startup-rotations.test.ts`：计划新增，MW-12 的启动旋转表（按 28/29 的 R-A 判定）。
- `src/core/world/create-world.ts`、`src/core/world/rule-data.ts` 及其测试：`startupRotations` 的世界创建接入。
- `src/core/rules/firing.ts`、`src/core/rules/firing.test.ts`：P3-07 锁定计数对标记不读机型记录（MW-03）。（以上为协调者 2026-10-14 扩大范围）
- `src/core/systems/pipeline.ts`、`src/core/systems/pipeline.test.ts`、`src/core/systems/commands.ts`、`src/core/systems/commands.test.ts`、`src/core/world/world.test.ts`：`map-point` 的内部请求、有效目的地、帧尾地图步的接入与命令路由（协调者 2026-10-14 扩大范围；MW-07 第 1 步的接触谓词由本项在 `map-icons.ts` 实现，15 复用）。

## 验收标准

- [ ] AC-04：量化、换算、夹取、3 像素边界、并列/未命中、z 门禁、命中列表的阶段/历史、hover 不改已提交点与多选框都符合独立期望。
- [ ] 标记的创建/移动/失效后选择/首更新/移除符合 03，不伪造机型；友方目标与雷达消费有效；名称引用符合 T7；打开初值与 P3-05 起点落在同一整数像素。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 规则、内容边界与流水线测试；起点与比例的本地数据核对（私有，只记判定）。

## 完成证据
