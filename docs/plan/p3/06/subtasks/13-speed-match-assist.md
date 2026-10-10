---
type: plan
status: active
phase: P3
task: "06"
subtask: "13"
updated: 2026-10-10
---

# 13 — 匹配速度与速度辅助

**契约来源：** [spec](../spec.md) 的 S-05（匹配与辅助、目标引用）；AC-04（`match-target`、`toggle-auto-match` 与确认键别名的命令结果）、AC-05；[匹配速度与速度辅助](../spec.md#匹配速度与速度辅助)；D-03、D-06；检查点 A 定稿的开关关系与事件形状。
**依赖：** 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **目标引用：** 玩家更新开始时，不能解析的目标 ID 清为 null（原版丢弃失效句柄）；玩家实体移除时随玩家引用清除。停放时清除归 14，Warp 开始清除归 P3-09。选择与切换目标归 P3-07，测试经内部状态设置目标，不开放生产写入口。
- **手动匹配：** `speed/match-target` 与普通飞行中的 `confirm-selection`（别名，保留原命令类型与索引，只发一个结果）在飞行上下文判定：目标为空或没有移动块为 `ignored`/`no-target`；否则 `accepted` 并投递内部 `match-speed` 请求。请求处理中按 `0x21adc` 应用：目标当前速度钳到 [0, 玩家最高速度]，模式 `craft` 时写指令速度并清到达，否则写当前速度；不检查锁定；成功时发 `speed-matched`（`origin: 'command'`）。`0x21adc` 作为规则函数交付（P3-08 的 AI 匹配复用）。12 的同 tick 读回推算计入匹配请求的效果。
- **开关：** 飞行上下文中 `toggle-auto-match` 翻转唯一的速度辅助开关（与难度辅助是同一开关），紧随其结果发 `speed-assist-toggled`；开启时到期时刻归 0、清除“已匹配”，关闭时两者不变。
- **速度辅助：** 玩家可用时，在玩家更新中、失效目标清除之后、命令判定与轴的变化检测之前运行，不论视角模式：
  - 无有效目标且“已匹配”：投递满油门、三轴不变的 `control` 请求（先于本 tick 命令的请求），清除“已匹配”，发 `speed-assist-released`；
  - 有效目标：种类在辅助种类掩码内、时钟不早于到期时刻（含等号）、三维距离平方（各分量差乘以其 f32 舍入值后求和）不大于阈值平方（含等号）时，记录速度差是否超过常数，直接按 `0x21adc` 写玩家移动块，置“已匹配”，到期时刻 = 本次时钟 + 固定间隔（不追赶）；写入成功时发 `speed-matched`（`origin: 'assist'`，带速度差标志）；目标没有移动块时写入失败，但“已匹配”与到期时刻照样更新；
  - 范围外、种类不符或未到期时无作用，计时不推进。
- **持续状态：** 开关与“已匹配”是世界状态，供 15 的 projection 读取；HUD 闪烁、开/关消息的呈现归 P3-13。
- **测试：** 组初值；开启时的复位与关闭时不变；目标有效、变更（不复位计时）、失效、移除、被毁（仍可匹配）与无移动块；种类掩码；距离等号与两侧；计时等号与跨阈值、多次重新计时；匹配后失去目标的满油门请求、事件与只发一次；速度差标志两侧；同 tick 辅助、命令与操纵应用的先后；事件内容与次序；锁定时手动匹配仍生效。

## 不包含

- 目标选择（P3-07）；停放时清除目标（14）；projection（15）。

## 关键文件与契约

- 12 的 `src/core/systems/flight-control.ts` 与 `src/core/rules/flight-control.ts`；[pipeline.ts](../../../../../src/core/systems/pipeline.ts)；[player-state.ts](../../../../../src/core/world/player-state.ts)。
- 03 的完成证据与检查点 A 定稿；[scenario 的难度读取路径 8](../../../../original/formats/scenario.md#difficulty-readers-p3-01)。

## 写入范围

- `src/core/systems/pipeline*.ts`：辅助在玩家更新中的位置及测试。
- `src/core/systems/flight-control*.ts`：匹配与辅助及测试。
- `src/core/rules/**`：匹配条件与计时纯函数及测试。
- `src/core/world/**`：辅助状态与目标引用读写所需的最小改动。

## 验收标准

- [ ] AC-05：手动匹配与速度辅助按 M-05 区分；条件矩阵、等号与跨阈值、多次重新计时（不追赶）、失去目标的恢复与 `speed-assist-released`、速度差标志、先后次序与事件内容通过；失败无成功事件。
- [ ] AC-04（部分）：`match-target`、`toggle-auto-match` 与确认键别名各有一次、原索引的结果；无目标或目标无移动块为 `no-target`。
- [ ] 失效目标在玩家更新开始时清除；没有在生产入口注入目标的途径。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 条件矩阵与事件序列测试；期望独立推导。
- 按 execute-goal 的流程完成 rubber-duck 审查后，以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不涉及浏览器。

## 完成证据
