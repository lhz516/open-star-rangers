---
type: plan
status: active
phase: P3
task: "14"
subtask: "03"
updated: 2026-10-15
---

# 03 — HUD 提示与双警告条件研究

**契约来源：** [spec](../spec.md#研究项) 的 S-01、S-06、AC-01、AC-07、AC-08，A-06、A-07。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 查实锁定提示的读取对象、无量纲 progress 的 −1/0/正值变化与保持、到期比较、视角和损伤跳过。
- 查实 9 型仪表的对象条件、位掩码、武器锁定等级、两标志优先级、采样/闪烁节奏、通道参数及退出/恢复。
- 提出给 05/06/07 的事实输入清单，区分 Core 对象条件、纯表现时钟/RNG和实际声音句柄。

## 不包含

- 不把武器锁定字段写成 AiState.mode，不实现 AI；不绘制仪表，不创建第二套 HUD 状态机。

## 关键文件与契约

- 现有 [HUD indicators](../../../../original/formats/executable.md#hud-map-and-communications-text-from-the-exe-p3-0324)、[audio](../../../../original/formats/audio.md)。
- 现有 [combat.ts](../../../../../src/core/projections/combat.ts)、[entity-table.ts](../../../../../src/core/world/entity-table.ts) 对照字段语义；它们在本项只读。

## 写入范围

- `local/research/p3-14/03-hud/**`：私有静态脚本、条件和状态转换核对。

## 验收标准

- [ ] A-06/A-07 各正常与失败/退出分支有证据，保持正值时的行为没有被猜成周期播放。
- [ ] 列出 Core 必需事实和纯表现状态，位序号/掩码、锁定/AI 模式不混淆。
- [ ] 未测分支、可达性需求及人耳参考缺口明确交给 05。

## 验证方法

- 按[证据指南](../../../../guides/original-evidence.md)静态优先；来源置信度分别记录。
- 原版操作由协调者统筹，研究结果只在私有目录，跟踪文档只记录覆盖与引用。

## 完成证据
