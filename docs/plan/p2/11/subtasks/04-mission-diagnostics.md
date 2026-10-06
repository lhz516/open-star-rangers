---
type: plan
status: active
phase: P2
task: "11"
subtask: "04"
updated: 2026-10-06
---

# 04 — 任务载入诊断

**契约来源：** [spec](../spec.md) 的 S-06、AC-10（Node），以及[数据模型与契约](../spec.md#数据模型与契约)中的任务载入结果、技术决定 10。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增纯函数（`src/app/resources/` 中）：
  - 从完整的 `logic` 组按 `role` 取出任务、机型表与僚机名单三个逻辑 Asset，用 `decodeLogicPayload` 解码，再调用 `loadMission`；
  - 结果为 `loaded`（附结构摘要）或 `failed`（附 `{ kind: 'core-input' | 'content', path, reason }`）。
- 结构摘要只含：
  - 声明数、编组数、生成区域数、僚机选项数、名称池条目数；
  - 任务的 Asset ID、`campaign`、地图轴向与坐标单位标注、玩家声明序号；
  - 各阵营的声明数。

  不含名称池文字、消息或任何原版文字。
- 引用校验：解析到模型的声明数，以及每个模型 Asset ID 是否在持有的 `models` 组中。`models` 组缺失或不完整时如实标注。
- 资源持有者在资源包替换后（`logic` 组完整时）计算一次任务载入结果，并纳入状态阶梯（“任务可载入 Core”“任务不可载入”）。
- Node 测试使用合成的逻辑内容：
  - 成功；
  - 两个玩家声明（`CoreInputError`）；
  - 机型表缺少引用的机型（`CoreInputError`）；
  - 损坏的任务 payload（`ContentContractError`）；
  - 摘要不含合成名称中的 `MARKER`；
  - 引用校验在 `models` 组完整、缺失两种情况下的输出。

## 不包含

- 页面上的显示（11 的查看器、07 与 06 的状态文字）。
- 改动 `loadMission` 或逻辑 payload 的契约。

## 关键文件与契约

- 计划新增 `src/app/resources/` 中的任务诊断模块与相邻测试；修改 02 的持有者以纳入载入结果。
- 复用：[load-mission.ts](../../../../../src/core/mission/load-mission.ts)、[logic-payload.ts](../../../../../src/content/logic/logic-payload.ts) 的 `decodeLogicPayload`、[logic-content.ts](../../../../../src/content/logic/logic-content.ts) 的类型、[errors.ts](../../../../../src/core/errors.ts) 的 `CoreInputError`；参照 [logic-check.ts](../../../../../tools/logic-check.ts) 的按 role 取出方式。
- 测试数据：[logic-content.test-support.ts](../../../../../src/content/logic/logic-content.test-support.ts)。

## 验收标准

- [ ] AC-10（Node）：成功时的摘要与对同一输入独立计算的期望一致；三种失败分别得到正确的 `kind`、路径与原因。
- [ ] 引用校验列出解析到模型的声明数与每个模型的存在情况。
- [ ] 摘要与诊断不含合成内容中的 `MARKER` 文字。
- [ ] 持有者在 `logic` 组完整时才尝试载入；状态阶梯的“任务可载入 Core”只由 `loadMission` 成功得到。
- [ ] `pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/app src/core/mission`，完成前 `pnpm check`。
- 浏览器部分见 11。完成前按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
