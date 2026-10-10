---
type: plan
status: active
phase: P3
task: "07"
subtask: "13"
updated: 2026-10-09
---

# 13 — 目标与传感

**契约来源：** [spec](../spec.md) 的 S-03、AC-03，以及 AC-04 的雷达部分；[目标与传感](../spec.md#目标与传感)、[数值、随机数与逻辑视点](../spec.md#数值随机数与逻辑视点)。
**依赖：** 01, 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- `target` 命令的 `enemy`、`friendly`、`next`、`previous`、`forward` 按 01 的 Q-01 结论实现：候选筛选、种类掩码、距离度量与并列、方向映射、前方判定（固定逻辑视野，不读渲染）、写入时机与模式切换。
- 每个命令恰好一个结果：选中时 `accepted` 并在目标或模式实际改变后发出 `target-changed`；无候选、无变化、上下文屏蔽、无玩家或玩家被毁时用 08 定稿的原因码。
- 目标失效：移除、停放（经 11 在 `leave()` 中接入的调用）、被毁、进入 Warp 时按 Q-01 保留或清除，清除时发出 `target-changed`。
- 雷达接触点的选取规则（Q-02）：范围、上限与取舍、次序、分类与当前目标标记，作为纯函数供 23 组装分区；随机假接触点不在 Core 中抽取。
- **测试：** 每个筛选条件、距离并列、模式切换、前方判定的边界、写入时机与失效；命令结果与原因码；`target-changed` 的内容与次序；雷达的范围、上限、次序与分类；期望独立推导。

## 不包含

- `combat` 分区的组装（23）；雷达与显示屏绘制（P3-13）；键位（P3-05）；AI 选目标（P3-08）。

## 关键文件与契约

- `src/core/systems/targeting.ts`（11 新建）：命令判定与目标失效的接入。
- 计划新增：`src/core/rules/targeting.ts`、`src/core/rules/radar.ts` 及相邻测试。

## 写入范围

- `src/core/systems/targeting.ts`：目标命令与失效。
- `src/core/systems/targeting.test.ts`：目标系统测试（新建）。
- `src/core/rules/targeting.ts`：候选与前方判定（新建）。
- `src/core/rules/targeting.test.ts`：候选测试（新建）。
- `src/core/rules/radar.ts`：雷达接触点选取（新建）。
- `src/core/rules/radar.test.ts`：雷达测试（新建）。

## 验收标准

- [ ] AC-03：五种目标操作在合成场景中按 Q-01 选择，覆盖每个筛选条件、距离并列、模式切换、前方判定的边界、写入时机与目标失效；期望独立推导。
- [ ] AC-03：每个命令有正确的结果与原因码；`target-changed` 只在实际改变后发出，内容与次序正确。
- [ ] AC-04（雷达部分）：接触点的范围、筛选、上限与排序满足 Q-02；停放、移除与超出范围的对象不出现；选取不消耗 RNG。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：合成世界中放置已知位置与种类的实体，断言候选次序与选择；经正式 `step` 断言命令结果与事件。
- 不涉及浏览器；原版对照见 26、27。

## 完成证据
