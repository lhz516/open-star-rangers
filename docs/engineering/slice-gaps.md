---
type: guide
status: active
phase: P3
updated: 2026-10-10
related: [B-003, B-005, B-006]
---

# 切片缺省清单（当前构建）

本文按 G ID 记录当前构建中已在界面标注的缺省与项目替代：每项缺什么、项目如何呈现、出现在哪些页面以及对应的代码位置。G 项的定义、全量清单与补齐阶段见 P3-01 的[缺省清单](../plan/p3/01/spec.md#缺省清单)，标注规则见[标注规则](../plan/p3/01/spec.md#标注规则)，P3-04 的范围见其 [spec：缺省与标注](../plan/p3/04/spec.md#缺省与标注)。本文描述当前构建，不是任务状态表；实现新的缺省项或改变呈现的任务同步更新本文。

## 代码与标注方式

- **文字集中在一处：** 每项的界面文字只在 [slice-gaps-copy.ts](../../src/ui/mission/slice-gaps-copy.ts) 中，`SLICE_GAPS` 以 G ID 为键（`SliceGapId`：`G-01`、`G-02/1`、`G-02/2`、`G-04`、`G-06`、`G-07`、`G-08`、`G-09`、`G-10`），每项为 `{ title, text }`；G-04 开始配置页保留的目标与限制另在同一文件的 `MISSION_OBJECTIVES` 中。页面只放置文字，不改写。
- **页面中的标注：** [MissionParts.tsx](../../src/ui/mission/MissionParts.tsx) 的 `GapNote` 渲染一项，元素为 `class="slice-gap"`、`data-gap="<G ID>"`，以 “标题（G ID）. 说明” 显示；`GapNotes` 在一个 “Missing from this build” 区块中列出多项，使占位结束后这些说明仍可阅读。所有标注都是项目的英文界面文字，不是原版文字。
- **核对：** [mission-copy.test.ts](../../src/ui/mission/mission-copy.test.ts) 核对 G ID 键与目标、限制的说明；开发与生产的任务流程 E2E 在每个页面读取可见的标注，每项恰好出现一次且文字与 `SLICE_GAPS` 一致（[P3-04/10](../plan/p3/04/subtasks/10-e2e-mission-flow.md#完成证据) 的 AC-19 行）。

## 当前构建的缺省项

| G ID | 原版有而本构建没有的 | 本构建的呈现 | 位置 |
|---|---|---|---|
| G-01 | 音乐 | 不播放任何音乐，标注 “No music” | 开始配置页与任务壳底部的缺省说明；任务壳状态栏的短标签 “No music (G-01)”（`mission-status` 中的 `data-gap="G-01"`） |
| G-02/1 | 第一关介绍过场（`C-INTALL`） | 项目占位页：标注缺少的过场与 G ID，不展示原版画面或文字。每次开始与重开时、开始配置之前出现；页面可见且没有 pagehide 时累计 3,000 ms 后自然结束，或用 Skip 按钮、本页范围内新的 Enter/Space/Esc 提前结束一次；隐藏时显示等待说明并暂停计时；计时失败时只能返回主菜单。介绍时还没有世界 | 占位页 [PlaceholderPage.tsx](../../src/ui/mission/PlaceholderPage.tsx)（`mission-placeholder`，`data-gap="G-02/1"`）；占位结束后仍列在开始配置页与任务壳的缺省说明中 |
| G-02/2 | 出发过场（未选僚机为 `FLYFROM`，选了僚机为 `WFLYFROM`） | 同上的项目占位页，另写明本次运行的变体（无僚机 `solo` 或带僚机 `wingman`，按本次僚机选择）。确认开始时已创建 tick 0 的世界，会话保持在 `transition`：不推进 Core、不接受游戏输入；结束后进入飞行。保持期间页面隐藏过时，结束后只进入暂停（hidden），须显式继续。时间计入见下节 | 占位页（`data-gap="G-02/2"`，`mission-placeholder-variant` 的 `data-variant`）；之后同样列在开始配置页与任务壳的缺省说明中 |
| G-04 | 原版简报、僚机档案与僚机选择页 | 项目的任务开始配置页：任务的战役组与槽位、固定难度、目标与限制（项目文字，注明代码证据已确认、正常玩法可达性为高概率、本构建尚未实现这些规则，并给出来源）、按名单次序的 5 个僚机选项与 “No wingman”。不显示原版简报文字与头像；僚机名字只按纯文本显示，没有候选名时用项目编号 | 开始配置页 [StartConfigPage.tsx](../../src/ui/mission/StartConfigPage.tsx)（`mission-config`）的标注与目标、限制区块（`mission-objectives`，`data-gap="G-04"`，文字为 `MISSION_OBJECTIVES`） |
| G-06（重开与返回） | 原版战役中的重开任务入口及其保留的战役状态；统计、高分榜、晋升与任务总结页 | `Restart mission` 开始同一任务的新实例：回到介绍，以同一内容、难度 19 与重新抽取的种子从 tick 0 创建新世界，只沿用僚机选择；不复刻原版重开时保留的关卡编号、战役统计、晋升与高分榜，也没有结果页。`Return to main menu` 释放任务 | 任务菜单 [MissionMenuPage.tsx](../../src/ui/mission/MissionMenuPage.tsx)（`mission-menu`）；运行故障或停止后的提示（`mission-ended`，可以重开时） |
| G-07 | 原版主菜单、选项与战役设置（含难度滑块） | 项目页面：主菜单的 `Start mission` 入口、开始配置页的固定难度（原始值 19，“fixed, G-07”）与暂停式的任务菜单（Continue、Restart mission、Return to main menu）；不提供难度设置 | 主菜单 [MainMenuPage.tsx](../../src/ui/pages/MainMenuPage.tsx) 入口的说明；开始配置页的标注与难度；任务菜单的标注 |
| G-08 | F2–F10 及原版光标、小键盘视角键（P3-05 绑定表中的视角键） | 本构建只提供前视驾驶舱；原版其他视角（含光标与小键盘别名）未实现，由 P4 补齐 | 任务壳的飞行输入区暂缺提示：F2–F10、`Home`、`PageUp`、`ArrowLeft`、`ArrowRight`、`ArrowDown`；NumLock 与 Shift 状态相同时的 `Numpad7`、`Numpad9`、`Numpad4`、`Numpad5`、`Numpad6`、`Numpad2` |
| G-09 | 自动驾驶（`a`） | 本构建不实现原版自动驾驶，也不提供自动驾驶命令；由 P4 补齐 | 任务壳的飞行输入区暂缺提示：`KeyA` |
| G-10 | 飞行中切换操纵灵敏度（F11） | 灵敏度固定为 Medium；本构建未实现飞行中切换，由 P4 补齐 | 任务壳的飞行输入区暂缺提示：`F11` |

各页面显示的 G 项：主菜单 G-07；介绍占位 G-02/1；开始配置 G-04、G-07，以及缺省说明中的 G-01、G-02/1、G-02/2；出发占位 G-02/2；任务壳（飞行）状态栏的 G-01、飞行输入区的 G-08–G-10 暂缺提示与缺省说明中的 G-01、G-02/1、G-02/2，运行结束且可以重开时另有 G-06；任务菜单 G-07、G-06。

本构建尚无界面的其他 G 项（G-02 的其余实例、G-03、G-05）见 P3-01 的[缺省清单](../plan/p3/01/spec.md#缺省清单)，由负责实现的任务加入本文。

## G-02 不计时与基准设置的差异

- **项目选择：** 按 P3-02 [技术决定 2](../plan/p3/02/spec.md#技术决定)，G-02 占位期间不推进 Core，结束后也不补计时间；自然结束与跳过的规则效果相同。出发占位保持 tick 0 的世界，结束后首个回调只锚定时钟（[Core 已知差异](./modules/core.md#已知差异)的“时间”一条）。占位的 3,000 ms 是项目的呈现时长，不是原版媒体的时长或测量容差。
- **与基准设置的差异：** 基准环境启用过场。原版看过场时，两段过场的用时计入生成队列的已过时间（但不计入飞行的第一步），所以延迟到达的编组在飞行中会比本构建更早出现（[B-003 出发](../original/behavior/B-003-campaign-flow.md#出发l-02)，已确认，代码与数据；未经运行核对）。本构建相当于省去媒体播放的用时，但不等同于原版关闭过场：原版的构建用时、生成原点与首帧取样仍与本构建不同。
- **世界的创建时机：** 本构建在确认开始时、出发占位之前创建 tick 0 的世界，以便提前报告创建失败；原版在出发过场之后才载入任务。本构建只保证占位结束之前不模拟，不声称构建时机与原版相同。首批对象在第一个 tick（时钟 2）实例化，原版在构建帧的第一次队列检查时实例化（同见 Core 已知差异）。
- **对照记录：** 这些差异在 [P3-04/14](../plan/p3/04/subtasks/14-real-content-comparison.md#完成证据) 的 L-02 流程部分披露；运行中衔接的 G-02（入港、离港与结果相关的实例）由 P3-10、P3-11 决定是否沿用同一方案。
