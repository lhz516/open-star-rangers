---
type: plan
status: active
phase: P3
task: "06"
subtask: "13"
updated: 2026-10-09
---

# 13 — 匹配速度与速度辅助

**契约来源：** [spec](../spec.md) 的 S-05（匹配与辅助、目标引用）；AC-04（`match-target`、`toggle-auto-match` 与确认键别名的命令结果）、AC-05；[匹配速度与速度辅助](../spec.md#匹配速度与速度辅助)；D-03、D-06；检查点 A 定稿的开关关系与事件形状。
**依赖：** 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **手动匹配：** `speed/match-target` 与普通飞行中的 `confirm-selection`（别名，保留原命令类型与索引，只发一个结果）按 M-05 的 `0x21adc` 路径：条件、对油门或目标速度的写入、玩家上限的约束；成功发 `speed-matched`（`origin: 'command'`），无有效目标为 `ignored`/`no-target`，失败不发成功事件。
- **开关：** `toggle-auto-match` 按检查点 A 定稿的语义切换，发 `speed-assist-toggled`；不把不同的辅助功能合成一个开关。
- **难度辅助：** 在玩家更新中、命令批次之前，按 M-05 的条件（种类掩码、距离度量与比较符号、无移动块或被毁目标的处理）匹配；匹配后从当时的时钟重新计时，到期按 `>` 判定且不追赶；每次真实匹配发 `speed-matched`（`origin: 'assist'`）。
- **目标引用：** 被移除的 ID 不能解析为新实体，读作无目标；失效判定按 M-05。停放时清除归 14。选择与切换目标归 P3-07，测试经内部状态设置目标，不开放生产写入口。
- **持续状态：** 开关、到期与最新匹配时刻是世界状态，供 15 的 projection 读取；HUD 指示与消息文字的呈现归 P3-13。
- **测试：** 组初值；目标有效、变更、失效、停放、被毁与无移动块；距离等号与两侧；计时等号与跨阈值、多次重新计时；同 tick 辅助、命令与操纵应用的先后；事件内容与次序。

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

- [ ] AC-05：各类匹配与辅助按 M-05 区分；条件矩阵、等号与跨阈值、多次重新计时、先后次序与事件内容通过；失败无成功事件。
- [ ] AC-04（部分）：`match-target`、`toggle-auto-match` 与确认键别名各有一次、原索引的结果。
- [ ] 没有在生产入口注入目标的途径。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 条件矩阵与事件序列测试；期望独立推导。
- 按 execute-goal 的流程完成 rubber-duck 审查后，以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不涉及浏览器。

## 完成证据
