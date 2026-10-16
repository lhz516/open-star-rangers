---
type: plan
status: active
phase: P3
task: "10"
subtask: "27"
updated: 2026-10-16
---

# 27 — 文档与交接

**契约来源：** [spec](../spec.md) 的 S-12、AC-18。
**依赖：** 20, 22, 23, 26。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 更新 [Core 模块说明](../../../../engineering/modules/core.md)（API、阶段与状态所有权、事件、分区、原因码、上限依据、已知差异，包括 G-02 不计时与 D-03 的差异）、[app](../../../../engineering/modules/app.md) 与 [ui](../../../../engineering/modules/ui.md) 分册、[键盘输入指南](../../../../engineering/keyboard-input.md)（通讯与基地按键已接入的部分）、[源码结构指南](../../../../engineering/source-structure.md)（新增模块）。
- 写明向 P3-08（命令码、友伤累计、回复入队、`0x4000` 的结论）、P3-09（基地视角与地图）、P3-11（子状态、队列清空、完全修理、感谢计数）、P3-13（菜单、来电、G-03 文字与基地视图）、P3-14（事件与音效阶段）、P3-15（联合复验项）的交接；上游契约修订使既有 goal/subtask 受影响时记录需重验的范围，不改写历史结论。

## 不包含

- STATUS 与阶段索引（协调者）。

## 关键文件与契约

- 现有分册的写法与 P3-07 的[文档交接](../../07/subtasks/28-docs-handoff.md)。

## 写入范围

- `docs/engineering/modules/core.md`、`docs/engineering/modules/app.md`、`docs/engineering/modules/ui.md`：API 与交接。
- `docs/engineering/keyboard-input.md`、`docs/engineering/source-structure.md`：接入与模块。
- `docs/original/formats/executable.md`：BS11 改为运行已确认，以及 25、26 交来的原版事实（简报按钮丢键、长时间受攻击后停靠中的自动离港、基地只在远处失效）。
- `docs/original/behavior/B-004-base-communications.md`：残留的“运行核对待 09”措辞。
- `docs/original/formats/imfat.md`、`docs/original/formats/scenario.md`、`docs/original/formats/audio.md`、`docs/original/formats/craft.md`：06 列出的交叉引用（CMOV、SCCT +0x70、基地音效、基地速率）。

## 验收标准

- [x] AC-18：分册与指南说明 API、所有权、反馈、上限、缺省与已知差异；各下游任务的接线与重验责任明确。
- [x] 链接与 `updated:` 正确。

## 验证方法

- 文档链接与元数据检查；git 审阅只改写入范围内的文件。

## 完成证据

2026-10-16，worker 分支 `exec-p3-10-27`（基于认领提交 `089949d0`）。只改文档，没有代码。

- **Core 分册**（[core.md](../../../../engineering/modules/core.md)）：正式 Core 的引言与世界创建（九项规则数据输入、`communicationsRuleData` 的位置）；规则数据一节加入三项通讯输入、CB-01 的检查 1–5、`WorldRuleData.communications`（含 `nameIndexes`/`nameIndexOf`）与 setupHash 的覆盖；契约一节加入 `subsystem-disabled`、`no-candidate` 的扩展、13 种 P3-10 事件与 tick 内次序；实体与世界状态加入 `flow`、玩家的 `dockingObject`/`communications`/`docking`、实体的 `communications` 与 `ai.pendingCommand`、世界的 `communications`/`ai.friendlyFire`/`baseService`；流水线表第 2、4、5、7、13、15、18 行（`mission-flow` 为 `checkDockingWait`，`communications-reply` 为 `takeRadio`，帧尾的左显示屏处理器、尾随警告与通讯呈现子步），五种请求，`judgeCommand` 的分派与批内生效视角（P3-07 的命令等待 MW-04），实例化扩展点的 `0x38cd4`；新节“通讯、停靠与基地服务（P3-10）”（命令与原因码表、投递与回应、无线电与来电、反应与报告、停靠等待/停靠/离港、基地服务与共享入口 `fullRepair(context, entity, inRequestHandling)`、停靠中的系统、给其他任务的入口）；原版规则辅助的 P3-10 规则；`communications` 分区就绪（撤销 `OptionUnavailableReason`/`CommunicationsReady`）；快照格式 4、`RULES_VERSION` 5、replay 格式 2（原文的 1 已过时，P3-05 递增）；上限表的 `radioQueueItems` 与 P3-10 的事件、请求、快照核算及比较器 32 帧对读取器 8 帧；已知差异（G-02 用于 G-02/3、G-02/4 不计时；D-03 的固定一 tick 载入延迟与只支持 HI；CB-17 的差异；P3-10 的对照结论）；交接（P3-04、P3-05、P3-08、P3-09、P3-11、P3-12/13、P3-14 的“来自 P3-10”，P3-15 的联合复验项，以及上游契约修订的重验范围）；针对性检查加入 P3-10 的测试与 `comm-replay.test.ts`。旧文中已由 P3-10 完成而仍写为待办的说法一并更正。
- **app 分册**：21 已写的 Runtime 截断与会话保持一致，无需改；补上 `GameRuntimeSpec` 与 `ruleDataInputs` 的三项通讯输入（此前遗漏）。
- **ui 分册**：会话桥接的基地页关键事实（`baseSelection`/`projectedBase`）、`GameView` 中的基地页面、G-02/3、G-02/4 占位、`base-page.ts`/`BasePage.tsx`、`MESSAGE_SUMMARIES`/`messageSummary`（交 P3-13）与 `BASE_PAGE`、`placeholderTakesFocus`、焦点入口 `transition-ended`、输入消费者把截断帧视为不在运行、事件日志的 P3-10 字段。
- **键盘输入指南**：通讯与基地按键的实现状态、通讯菜单与基地一段、P3-10 交接改为已交付；顺带去掉已过时的“待 P3-07 合入”。**源码结构指南**：目录树加入 16 个新文件，Core 内部目录与分册表的说明，`base-interaction.development` 与合成场景 `mission-docking`。
- **原版文档**（事实只依 executable、B-004 与 25、26 的记录核对，只记地址、结构与行为）：executable BS11 改为“Runtime cross-check — Confirmed (runtime, P3-10/25–26)”并采用 26 的措辞；DK1 加入 25 的自动离港与“基地只在远处或长时间停靠后失效”（原因未确认），选择页加入“按钮激活期间丢键”，DK4 的漂移改为“未观察”。B-004 的两处“未经运行核对”状态行写明 25 已核对的部分并链接到测量结果；“运行核对待 09”的措辞已由 26 去掉，无残留。scenario §3 的 +0x70（SCCT 僚机记录兼为头像）、audio（10167/10169 当帧播放、停靠时对象音效静音、基地导弹遍历的选择音效从不派发，并更正 11381 一行）、craft 的 +0x54/+0x9C（基地速率与上限）。imfat 的 CMOV 一行已是“Structure Confirmed”并链接 RQ9，无需改。
- **检查：** 自写的链接与锚点检查（GitHub 式 slug，覆盖改动的 10 个文档与本文件）0 项失效，并以一个不存在的锚点验证它能报错；全部改动文档的 `updated:` 为 2026-10-16；`pnpm check:compliance` 与 `pnpm check:original` 通过；读取文档的 `tools/engineering-boundaries.test.ts`、`tools/task-state.test.ts` 133 项通过。未运行 `pnpm check`：没有改动测试读取的代码或文档。
- **Rubber-duck：** 一轮，无阻塞，2 项一般，都已改正：录制入口仍写“六项规则数据输入”；P3-06 的命令判定把 `select-number` 归到 P3-06（实际在任何上下文都交给 P3-10）。
- **文档影响：** 本项即文档交接；STATUS 与阶段索引的建议见 worker 报告。unknowns 不改：写入的运行事实已由 26 在 U-010、U-022、U-030 中记录。

