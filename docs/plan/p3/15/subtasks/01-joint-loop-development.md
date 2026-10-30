---
type: plan
status: active
phase: "P3"
task: "15"
subtask: "01"
updated: "2026-10-29"
---

# 01 — 合成全闭环与 replay（development）

**契约来源：** [spec](../spec.md) 的 S-01、S-02、[行为与边界](../spec.md#行为与边界)前两行、[技术决定](../spec.md#技术决定)；AC-01 的 development 部分、AC-02。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新建 `e2e/support/joint-loop.ts`：在 Node 中由合成光盘转换结果构造联合闭环变体包（沿用 [mission-result.ts](../../../../../e2e/support/mission-result.ts) 的做法：替换 `mission-startable` 的任务与机型 payload，经严格逻辑编码器写回），使所选切片配置（group 0 / slot 1 的项目映射、原始难度 19、有/无僚机）下的运行能经正式输入自然经过起飞、飞行、选目标、射击、地图与 Warp、基地停靠/离港，并分别由规则到达成功（全清结算）与失败（被毁→救援→…→第三次损失）。可多个变体或多条运行合计覆盖；失败链不必经过成功独有的步骤。内容全部由代码生成，不含原版字节或解码内容。
- 新建 `e2e/joint-loop.development.spec.ts`（development 项目、网络审计下）：经开发测试入口恢复变体包，只用游戏输入区的受信输入和页面自身控件推进；逐步骤断言实际 UI/任务状态与开发事件日志中的正式 Core 事件（目标切换、开火/命中/被毁、`map-toggled`/`warp-*`、停靠/离港、`player-loss-started`/`player-rescued`、`settlement-started`/`result-latched`），以及结果页的结果值；每种结果页选择重试，断言新运行从任务初始状态与 tick 0 开始。
- 成功与失败两种完整运行各下载一份正式录制，在测试进程中以 [replay-check.ts](../../../../../tools/replay-check.ts) 的 `runReplayCheck`（同一合成光盘白名单）或 `replayRecord`/`compareReplayResults` 重放，断言事件序列、周期检查点与最终结果完全匹配（`{ match: true }`），并在证据中记录规则/内容身份、种子、运行时与事件/检查点摘要。
- 不注入终态、不直接改写 Core 状态、不 mock 结果；闭环步骤只经游戏输入区与地图光标的正式输入推进，不用开发命令编辑器提交玩家命令；开发面板只用于读取事件与导出录制。

## 不包含

- production 构建流程（02）、真实隐藏与资源平衡（03）、类型 9 警告（04）。
- 修改 `src/` 产品代码。若闭环某步因产品缺陷不可达，记录现象并作为差异交回责任任务（由协调者追加修复项），不在本任务补功能。

## 关键文件与契约

- 现有：[mission-result.ts](../../../../../e2e/support/mission-result.ts)、[production-cache.ts](../../../../../e2e/support/production-cache.ts)、[map-warp.ts](../../../../../e2e/support/map-warp.ts)、[base-interaction.ts](../../../../../e2e/support/base-interaction.ts)、[mission-observations.ts](../../../../../e2e/support/mission-observations.ts)、[keyboard-input.ts](../../../../../e2e/support/keyboard-input.ts)、[audited-test.ts](../../../../../e2e/support/audited-test.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)、[replay.ts](../../../../../src/core/replay/replay.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)。
- 计划新增：`e2e/support/joint-loop.ts`、`e2e/joint-loop.development.spec.ts`。

## 写入范围

- `e2e/support/joint-loop.ts`：联合闭环变体包与共享观察。
- `e2e/joint-loop.development.spec.ts`：development 闭环与 replay 用例。
- `e2e/support/mission-result.ts`：仅在需要把变体构造抽成可复用导出时修改，行为不变。

## 验收标准

- [ ] AC-01（development）：在有/无僚机配置下，起飞、飞行、选目标、射击、地图/Warp、基地交互、成功、失败与各自重试在一条或多条自然运行中全部出现，均有 UI/Core 事件/结果值断言；没有以画布存在、mock 事件或强制终态作为证据。
- [ ] AC-02：成功与失败两份开发录制的 Node 重放均为 `{ match: true }`；证据记录身份、种子、运行时与摘要，并只声明同一运行时一致。
- [ ] 合成包只由代码生成，测试不读取 `local/` 或原版文件；网络审计无违规。
- [ ] 已按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本子任务新增的测试代码；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 执行：`pnpm test:e2e e2e/joint-loop.development.spec.ts --project=development`，连续两次通过；附每条运行的步骤断言清单与种子。
- 若某步不可达，保留开发事件日志与录制，写明受影响步骤与责任任务。

## 完成证据
