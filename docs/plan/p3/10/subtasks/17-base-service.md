---
type: plan
status: active
phase: P3
task: "10"
subtask: "17"
updated: 2026-10-14
---

# 17 — 基地内部服务与完全修理

**契约来源：** [spec](../spec.md) 的 S-07、AC-09；[基地内部、修理与补给](../spec.md#基地内部修理与补给)。
**依赖：** 05, 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 基地上下文命令：`navigate-selection` 夹在两端，`confirm-selection` 把仍需服务的项移到服务队列首位；显示列表与服务队列分开；事件按 Q-08 的实际调用阶段发出（执行键不论是否需要服务都有音效输入）。
- `base-interior` 阶段（视角 6）按 Q-08 服务队列首项：状态聚合、时序、字段修理、槽位 5/7/8 的特例（复用 [mounts.ts](../../../../../src/core/rules/mounts.ts) 的 `repairListMounts` 真实语义）、资源与弹药补给与上限、出队，以及地图打开、离港中断时的门禁。
- 完全修理 `0x39820` 作为独立纯规则：只重置 D7 所列字段，复用挂点修理/选择与 P3-06 的控制辅助；耗尽锁存允许真实恢复后再次耗尽；`commandIndex: null` 的 `weapon-selected` 只在原版有反馈的位置发出。停靠、离港与报告路径按 Q-07/Q-09/Q-05 调用它；救援的调用归 P3-11。
- 基地受攻击、受损或失效的影响按 Q-03/Q-08。

## 不包含

- 离港（18）；G-05 页面（22）；救援对 `0x39820` 的调用（P3-11）。

## 关键文件与契约

- [mounts.ts](../../../../../src/core/rules/mounts.ts)、[combat-init.ts](../../../../../src/core/rules/combat-init.ts)、[flight-control.ts](../../../../../src/core/rules/flight-control.ts)（控制锁定与扰动的辅助）、[energy.ts](../../../../../src/core/rules/energy.ts)（耗尽锁存）。
- 计划新增：`src/core/rules/base-service.ts`、`src/core/rules/full-repair.ts`、`src/core/systems/base-interior.ts` 及测试。

## 写入范围

- `src/core/rules/base-service*.ts`、`src/core/rules/full-repair*.ts`、`src/core/systems/base-interior*.ts`：计划新增。
- `src/core/rules/mounts*.ts`：必要时导出复用的辅助（不改语义）。
- `src/core/systems/pipeline*.ts`：`base-interior` 阶段接入。
- `src/core/systems/docking*.ts`：停靠时对完全修理的调用。
- `src/core/systems/commands*.ts`：基地上下文 `navigate-selection`、`confirm-selection` 投递 base-navigate、base-confirm（CB-07 §3；13 只给出门禁）。

## 验收标准

- [ ] AC-09：列表与队列、端点导航、执行与重排、部分进度、11 项单槽位/组/挂点特例、资源与弹药补给和上限按 Q-08；一次挂点修理不被当作全补。
- [ ] 完全修理逐字段验证改变与保留：耗尽后恢复再耗尽、锁定与扰动、选择与冷却；事件只在原版对应位置发出；基地状态的影响有依据。
- [ ] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 各服务状态与时钟边界的独立期望；复用的 helper 用真实实现，不另写副本。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
