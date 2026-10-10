---
type: plan
status: active
phase: P3
task: "05"
subtask: "19"
updated: 2026-10-10
---

# 19 — 绑定表与绑定矩阵

**契约来源：** [spec](../spec.md) 的[绑定表](../spec.md#绑定表)（经 08 定稿）、[修饰键与布局](../spec.md#修饰键与布局)、[暂缺标注](../spec.md#暂缺标注)、[全屏与 Keyboard Lock](../spec.md#全屏与-keyboard-lock)“锁键范围”，[数据模型与契约](../spec.md#数据模型与契约)的“绑定表”行，技术决定 1、10、11；S-02、S-03、S-04、S-09 的绑定部分；AC-02、AC-05、AC-08 的 Node 部分。
**依赖：** 08、11、16、18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/ui/game-input/bindings.ts`：按 08 定稿后的 spec 绑定表建立唯一、冻结的绑定数据（使用 18 的条目类型），每条带来源（原版/项目/G 项）；未经 K 放行的候选行不进入表中。包括项目操纵键（定稿键与 Ctrl 横滚）、左右 Alt 主炮、`Space`、速度键（含 Shift+数字 → `speed-preset` 1–9、Shift+0 → `speed maximum`、无 Shift 数字 → `select-number`）、Enter/Ctrl+Enter、目标、武器、导弹、能量（`s`/`g` 无 Shift 为减、Shift 为增）、伤害报告、地图、Warp、通讯、基地离港与导航、`cockpit-front`（F1、`ArrowUp` 及定稿别名）、G-08（F2–F10、`Home`、`PageUp`、`ArrowLeft`、`ArrowRight`、`ArrowDown` 及定稿别名）、`KeyA` → G-09、`F11` → G-10、`KeyP` 与 `Escape` 的会话控制；小键盘按定稿的 NumLock/Shift 语义。
- 导出锁键 code 清单的推导：实际绑定的 code（含所需 Ctrl/Alt 修饰键），排除 Escape、Tab、Meta 与 F12。
- 不绑定作弊键；不为 Shift+Slash 添加切武器别名。
- Node 绑定矩阵：逐条输出正确动作；同一上下文的 `code`、Shift、有效 Ctrl 与适用 NumLock 组合没有竞争的离散动作；NumLock 两态与 Shift 区分数字、前视别名、暂缺视角与基地导航；R/Y 为 next/previous；表中未列的键与组合无动作；不生效上下文无动作；锁键清单正确。

## 不包含

- 匹配与状态逻辑（18）；接线（20、25）；键位文档（32）。

## 关键文件与契约

- 18 的 `input-action.ts`；16 迁移后的 [tick-input.ts](../../../../../src/core/contracts/tick-input.ts)（含 `speed-preset`）；08 定稿后的 [spec 绑定表](../spec.md#绑定表)；11 修订后的 [P3-01 缺省清单](../../01/spec.md#缺省清单)。
- 计划新增：`bindings.ts`、`bindings.test.ts`。

## 写入范围

- `src/ui/game-input/bindings.ts`、`src/ui/game-input/bindings.test.ts`

## 验收标准

- [ ] 绑定数据与定稿 spec 逐行一致，来源准确，候选行未入表（AC-02 的代码部分）。
- [ ] 绑定矩阵覆盖全部条目、无竞争组合、NumLock/Shift 区分、G-08–G-10 与前视/导航的区分（AC-05、AC-08 的 Node 部分）。
- [ ] 锁键清单排除 Escape、Tab、Meta、F12。
- [ ] `pnpm exec vitest run src/ui/game-input` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 绑定矩阵；浏览器抽样由 28 完成，文档逐项一致由 32 与 33 核对。

## 完成证据
