---
type: plan
status: active
phase: P2
task: "12"
subtask: "18"
updated: 2026-10-07
---

# 18 — 任务字段、引用与 Core 载入（M-1、M-2、M-4）

**契约来源：** [spec](../spec.md) 的 S-10、[原版本地对照](../spec.md#原版本地对照)的 M-1、M-2、M-4；AC-19 的 agent 部分（用户的页面确认在 21）。
**依赖：** 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 被忽略的本地脚本（计划新增 `local/research/p2-12/mission/`）：
  - **独立读取：** 按 [scenario](../../../../original/formats/scenario.md) 与 [hud §3](../../../../original/formats/hud.md#3-id-lists-confirmed-structure) 自行读取所选 SCEN、SCCT 与 M2ID；可共用已验证的光盘与 NOB 字节读取（`openVerifiedSource`），不复用 `src/original-data` 的场景解析器或 `convert-logic`。
  - **字段来源表：** `MissionContent`、`CraftTypeTable`、`WingmanRoster` 的每个字段归为原样、去重/索引/单位变换、项目身份或研究派生。阵营、交互类别与地图轴向引用对应的 EXE 或行为依据（[executable](../../../../original/formats/executable.md)、[B-001](../../../../original/behavior/B-001-strategic-map.md)），不复制生产分类表生成期望；未知的规则输入保持未知。
  - **比较（M-1）：** 与经 `content/` 读取器解码的候选逻辑 payload 逐字段比较，不同字段数为 0；计数等于 [P2-09 AC-14](../../09/spec.md#验收标准) 的记录。
  - **引用（M-2）：** 用独立的 M2ID 读取核对机型到模型的绑定，全部解析为 `models` 组中的 Asset。
  - **Core（M-4）：** 在候选上调用纯 `loadMission`，完整 `MissionSetup`（玩家声明、编组与成员、生成区域、坐标与地图框架、机型/阵营/模型、僚机选项）等于独立预期；两次载入深度相同；不推进 tick、不随机生成世界。
- 证据只记计数、Asset ID 与判定，不记字段值、坐标或名称。

## 不包含

- 地图框架的运行时核实（19）；用户真实导入后的页面诊断（21）；P3 规则语义。

## 关键文件与契约

- [logic-content.ts](../../../../../src/content/logic/logic-content.ts)、[load-mission.ts](../../../../../src/core/mission/load-mission.ts)；[scenario 字段清单](../../../../original/formats/scenario.md#selected-mission-field-inventory-confirmed-structure)；`local/research/p2-09/` 的字段清单脚本做法。

## 写入范围

- `local/research/p2-12/mission/**`：独立读取与比较脚本及输出（被忽略）。

## 验收标准

- [ ] AC-19（agent）：字段来源表完整；逐字段差异为 0；计数等于 P2-09 记录；模型绑定全部可解析。
- [ ] 完整 `MissionSetup` 等于独立预期，两次载入相同。
- [ ] 证据不含字段值、坐标或名称。

## 验证方法

- 在本机运行脚本，记录命令与计数；再临时改动一个独立读取的字段，确认脚本报告差异。
- 不涉及浏览器验证。

## 完成证据
