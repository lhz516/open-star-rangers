---
type: plan
status: active
phase: P3
task: "10"
subtask: "18"
updated: 2026-10-14
---

# 18 — 离港与停靠中的系统

**契约来源：** [spec](../spec.md) 的 S-08、AC-10、AC-11；[离港](../spec.md#离港)、[停靠](../spec.md#停靠)的“停靠中的其他系统”、[依赖与交付边界](../spec.md#依赖与交付边界)。
**依赖：** 04, 17。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- `launch` 在基地上下文投递子命令 4；子状态 5 中停靠对象失效时 `mission-flow` 自行投递；按 Q-09 的次序执行：活动、视角恢复（低于 0xC 为 0xC，地图打开时的上一视角按 Q-09）、僚机恢复、按保存位姿放置且放置序号加 1、速度与控制状态、子状态回到 0、重绘、离港事件与离港衔接事件（G-02/4）。同 tick 重复请求按 Q-09，事件次数对应真实转移。
- 部分服务时离港不补满也不回滚（按 Q-08/Q-09）。
- 停靠中各系统（运动、能量、碰撞、弹丸、导弹起爆、目标候选、区域检查与停放）按 Q-10 的联合测试；`base-interior` 的视角门禁与地图打开、暂停恢复分别测试。被毁/救援与主流程未实现时只验本任务的入口与清空/恢复契约，用内部 test-support 建立前态，不新增生产注入入口。

## 不包含

- 运行中衔接的 Runtime 保持（21）；地图规则（P3-09）；被毁与救援流程（P3-11）。

## 关键文件与契约

- 16 的 `src/core/systems/docking.ts`、17 的 `src/core/systems/base-interior.ts`；[movement.ts](../../../../../src/core/systems/movement.ts)、[energy.ts](../../../../../src/core/systems/energy.ts)、[collision.ts](../../../../../src/core/systems/collision.ts)、[area.ts](../../../../../src/core/systems/area.ts) 中已有的停靠处理。
- 计划新增：`src/core/systems/docked-systems.test.ts`（联合测试）。

## 写入范围

- `src/core/systems/docking*.ts`、`src/core/rules/docking*.ts`：离港。
- `src/core/systems/base-interior*.ts`：离港对服务的中断。
- `src/core/systems/pipeline*.ts`：自动离港。
- `src/core/systems/docked-systems.test.ts`：计划新增。
- `src/core/systems/commands*.ts`、`src/core/systems/flight-control*.ts`：基地上下文 `launch` 投递 depart 与批内生效视角（CB-07 §3；13 只给出门禁）。
- `src/core/rules/base-service.ts`、`src/core/rules/base-service.test.ts`：与 rules/docking.ts 重复的周期与组字段常量去重（17 交接）。
- `src/core/systems/communications.ts`、`src/core/systems/communications.test.ts`：批内生效视角传入通讯判定（CB-07、CB-17 决定 8）与基地 `launch` 的断言。

## 验收标准

- [ ] AC-10：主动与自动离港的次序、重复请求、视角恢复、僚机、放置与放置序号、速度与控制状态按 Q-09；部分服务不补满或回滚；事件次数对应真实转移。
- [ ] AC-11：停靠中的各系统按 Q-10；视角门禁与地图、暂停分别测试；下游未实现部分只验入口并写明未接通。
- [ ] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
