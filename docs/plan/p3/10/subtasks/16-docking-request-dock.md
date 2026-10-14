---
type: plan
status: active
phase: P3
task: "10"
subtask: "16"
updated: 2026-10-14
---

# 16 — 停靠请求、等待与停靠

**契约来源：** [spec](../spec.md) 的 S-05、S-06、AC-07、AC-08；[停靠请求与等待](../spec.md#停靠请求与等待)、[停靠](../spec.md#停靠)。
**依赖：** 04, 14。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 命令码 9 进入子状态 3；回复回调（按 D-03 的时刻）在子状态 3 时进入 4；`mission-flow` 阶段读上一 tick 的取样检查期限、到期与停靠对象有效性，到期投递停靠请求并设为 5；比较的严格与否、u32 视图按 Q-06。
- 请求处理中执行停靠：`0x3959c` 门禁返回遍历中首个合格基地（严格 < 1000），须等于停靠对象，否则回到子状态 0 并发出取消事件；成功时按 Q-07 的次序保存位姿、停靠玩家及符合条件的僚机、进入视角 6、清除目标、建立服务列表与光标、置重绘、发出停靠事件与入港衔接事件（G-02/3）。
- 子状态 5 的“请求已投递未应用”不报为已停靠；菜单与倒计时期间世界照常推进。
- 测试覆盖阈值等号（菜单 ≤、执行 <）、无回复、对象失效、重复请求、换通讯对象、过期回复，以及首个合格基地比请求目标更远的多基地用例。

## 不包含

- 服务（17）；离港（18）；地图与 Warp 规则（P3-09）；被毁流程（P3-11）。

## 关键文件与契约

- [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `mission-flow` 阶段与请求处理；[targeting.ts](../../../../../src/core/systems/targeting.ts) 的目标清除先例。
- 计划新增：`src/core/rules/docking.ts`（门禁与距离）、`src/core/systems/docking.ts`（子状态与执行）及测试。

## 写入范围

- `src/core/rules/docking*.ts`、`src/core/systems/docking*.ts`：计划新增。
- `src/core/systems/pipeline*.ts`：`mission-flow` 阶段与请求处理接入。

## 验收标准

- [ ] AC-07：子状态 3、4、5 的进入、到期检查、回复与取消按 Q-06，覆盖等号与跨阈值；子状态 5 不误报已停靠。
- [ ] AC-08：菜单门禁含等号、执行门禁严格且取首个合格者；保存位姿、僚机距离内/外、目标清除、视角、列表与光标、重绘按 Q-07；成功转移才产生入港事件。
- [ ] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
