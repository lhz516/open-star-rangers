---
type: plan
status: active
phase: P3
task: "09"
subtask: "26"
updated: 2026-10-14
---

# 26 — 文档与交接

**契约来源：** [spec](../spec.md) 的 S-12、AC-16；[范围](../spec.md#包含) 的 S-12。
**依赖：** 20, 21。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [Core 模块说明](../../../../engineering/modules/core.md)：新 API、阶段责任（`object-sets`、`warp-completion`、`frame-end`）、状态、事件、`map` 分区与 Warp 读模型、原因码、上限依据、版本与已批准差异（含 CR-11 差异 1、8）。
- [键盘输入指南](../../../../engineering/keyboard-input.md)：`w` 的门禁、右键编号的归属（按 D-01）、地图与 Warp 上下文的命令结果。
- [源码结构指南](../../../../engineering/source-structure.md)与 app/ui 模块分册：新模块的位置。
- 交接：向 P3-08（集合与可见标志、AI 对 Warp 的反应）、P3-10（基地上下文中的地图、保存页机制）、P3-11（Warp 中结算推迟、被毁/耗尽的中断边界）、P3-12（Warp 进度与规则位姿、标记呈现）、P3-13（`map` 分区、驾驶舱读数、生产几何、右键编号）、P3-14（点击、开始、到达事件）、P3-15（联合复验项）写明仍待表现与联合验收的内容。
- 内容、导入与工具指南的更新由 11 完成，本项核对其一致。

## 不包含

- 历史完成证据的改写。

## 关键文件与契约

- [core.md](../../../../engineering/modules/core.md)、[keyboard-input.md](../../../../engineering/keyboard-input.md)、[source-structure.md](../../../../engineering/source-structure.md)、[app.md](../../../../engineering/modules/app.md)、[ui.md](../../../../engineering/modules/ui.md)。

## 写入范围

- `docs/engineering/modules/core.md`
- `docs/engineering/keyboard-input.md`
- `docs/engineering/source-structure.md`
- `docs/engineering/modules/app.md`、`docs/engineering/modules/ui.md`
- `docs/engineering/modules/content.md`、`docs/guides/tools.md`：12 引入的应用侧输入表与录制上限（协调者 2026-10-14 扩大范围）。
- `docs/engineering/README.md`：桥接关键事实一行（21 提出，同上）。

## 验收标准

- [x] AC-16：文档记录实际 API、阶段、版本、原因码、上限与已批准差异；交接写明各下游任务仍待的验收。
- [x] 新增事件在日志/比较器、新规则输入在应用/replay、关键状态在桥接中的接线与文档一致。
- [x] 改动的文档 `updated:` 与链接有效；`pnpm check` 通过。

## 验证方法

- 文档与消费链审阅；链接与元数据核对。

## 完成证据

- **核对基线：** 认领提交 `74377f41`（含 08–21 的全部集成）；每条陈述对照该提交的代码与 P3-02 spec 的 MW-01 至 MW-16，以及 goal 执行记录中 08、12、13、14、15、17、18、19、21 的“交 26”各项。
- **Core 模块说明**（[core.md](../../../../engineering/modules/core.md)）：正式 Core 的引言与入口；世界创建的 `mapGeometry` 输入与 MW-01 的检查次序（`buildMapRuleData` 后 `checkPlayerWarp`，再 `checkCraftInfo`）、setupHash 的覆盖与创建后的初始状态；规则数据表与静态规则数据 `map`、`startupRotations`（R-A：播种之前，差异 6 不适用）；新增“地图与 Warp（P3-09）”一节（命令视角 `commandView`、三种命令与地图中选择命令的门禁表、三种请求的应用、`switchView`、标记、`object-sets` 与揭示、帧尾的地图步与 Warp 步、`completeWarp`、中断与世界抽取）；流水线表第 4、7、8、12、14、17、18 行（第 18 行改为 pipeline.ts 的 `runFrameEnd`，并更正 `ruleStage` 的说明）、`Request` 与 `defer`（`warp-start` 的延后次序，MW-12 差异 9）；P3-06/P3-07 判定改为读命令视角；实体与玩家状态的新字段、`marker` 移动块、`MarkerCombat`、`map-marker` 名称与表现；`statusDisplay.redraw` 的写入者更正为只在涉及视角 6 时由 `0x4cd68` 置位（MW-09/MW-16）；`object-sets` 改为已由 P3-09 实现、P3-08 复用；两个原因码与 4 种事件及 tick 内次序；`map` 分区、`flight.combat.warp`、Render State 的 `warp`；版本（`RULES_VERSION` 5、快照 4；并更正既有文档中过时的 replay 格式版本，实为 2，P3-05 递增）；比较器的 Warp 完成阶段；上限的 MW-14 合计（事件 8,328、请求 3,588、快照约 10.9–11 MiB）；扩展规则；已知差异（MW-12 差异 1–9，CR-11 差异 1、8 的适用、项目规则与研究结论、P3-09 的对照仍待 23、24、25）；原版规则辅助与针对性检查；交接（P3-04、P3-05、P3-08、P3-10、P3-11、P3-12、P3-13、P3-14 的“来自 P3-09”，新增 P3-15；P3-09 一条改为已交付，并记录对 P3-06/07 交接的三项更正）。
- **其他文档：** [keyboard-input.md](../../../../engineering/keyboard-input.md) 新增“地图与 Warp 上下文中的命令结果”（`m`、`map-point`、`w` 的门禁次序、同批次的上下文推进、右键编号归 P3-13 的呈现）并更新 `KeyW` 行与下游交接；[source-structure.md](../../../../engineering/source-structure.md) 目录树加入 14 个新文件（与 `ls` 核对）与各目录职责；[app.md](../../../../engineering/modules/app.md) 的 `CONTENT_INPUT_FIELDS`、`EVENT_TYPES` 与 `mapGeometryInput`；[ui.md](../../../../engineering/modules/ui.md) 的桥接关键事实与事件日志字段（对照 game-session-bridge.ts 与 event-log.ts）；[content.md](../../../../engineering/modules/content.md) 的 Core 输入表加入 `mapGeometry`；[tools.md](../../../../guides/tools.md) 的 `RECORDING_MAX_BYTES` 534,251,135 与事件行 924 字节（以 `recordingSizeBound()` 实算，最长事件 `warp-completed` 923 字节）；[README.md](../../../../engineering/README.md) 的桥接关键事实。11 已写的内容、导入与工具指南其余部分核对一致。
- **消费链：** 4 种事件在比较器（compare.ts 的字段表与 `TickOrder`）、事件总线 `EVENT_TYPES` 与开发事件日志中；`mapGeometry` 经 `ruleDataInputs`/`mapGeometryInput` 进入任务所有者、replay-check 与 `ReplayContent`；关键状态在桥接中——与文档一致。
- **检查：** 自写的链接与锚点检查（GitHub 规则的标题锚点，8 个文档）0 处错误；`pnpm check:compliance` 通过（0 findings）；`pnpm check`（typecheck、lint、test、build）通过。改动的文档 `updated:` 均为 2026-10-14。
- **rubber-duck：** 3 项全部采纳：`map.destination` 在玩家实例化时为 null 的契约由创建值满足（一个世界只实例化一次玩家且 select 需要可用玩家），文档写明代码不另写；P3-11 的交接补上能量耗尽不中断 Warp 的边界；键盘指南写明 `player-unavailable` 先于上下文判定。未改写历史完成证据。
- **文档影响：** 本项即文档更新；STATUS 与 tasks.md 无需修改。代码观察（范围外，未改）：[area.ts](../../../../../src/core/systems/area.ts) 模块注释仍说玩家 Warp 期间的区域中心“在标出的位置接入”，实际已在 `activeAreaCentre` 中实现。

