---
type: guide
status: active
phase: P3
updated: 2026-10-28
related: [B-003, B-004, B-005, B-006]
---

# 切片缺省清单（当前构建）

本文按 G ID 记录当前构建中已在界面标注的缺省与项目替代：每项缺什么、项目如何呈现、出现在哪些页面以及对应的代码位置。G 项的定义、全量清单与补齐阶段见 P3-01 的[缺省清单](../plan/p3/01/spec.md#缺省清单)，标注规则见[标注规则](../plan/p3/01/spec.md#标注规则)，P3-04、P3-10 与 P3-11 的范围见各自 spec 的缺省与标注（[P3-04](../plan/p3/04/spec.md#缺省与标注)、[P3-10](../plan/p3/10/spec.md#缺省与标注)、[P3-11](../plan/p3/11/spec.md#缺省与标注)）。本文描述当前构建，不是任务状态表；实现新的缺省项或改变呈现的任务同步更新本文。

## 代码与标注方式

- **文字集中在一处：** 每项的界面文字只在 [slice-gaps-copy.ts](../../src/ui/mission/slice-gaps-copy.ts) 中，`SLICE_GAPS` 以 G ID 为键（`SliceGapId`：`G-01`、`G-02/1` 至 `G-02/10`、`G-03`、`G-04`、`G-05`、`G-06` 至 `G-10`），每项为 `{ title, text }`。同一文件中另有带 `gap` 字段的文案：G-04 开始配置页保留的目标与限制 `MISSION_OBJECTIVES`，G-03 的无线电消息摘要、页 5 短标注与未覆盖反馈 `MESSAGE_SUMMARIES`（`messageSummary`、`messageLabel`），战略地图零能量代价的项目提示标记 `MAP_COST_UNAVAILABLE`，G-05 基地页面的文字 `BASE_PAGE`，G-06 结果页的文字 `RESULT_PAGE`（`resultReason`）；G-02 占位页的标题与变体文字在 `PLACEHOLDER_PAGES`（`endingVariant`）。页面只放置文字，不改写；结果页的任务总结是唯一的导入文字，运行时从导入内容解析。
- **页面中的标注：** [MissionParts.tsx](../../src/ui/mission/MissionParts.tsx) 的 `GapNote` 渲染一项，元素为 `class="slice-gap"`、`data-gap="<G ID>"`，以 “标题（G ID）. 说明” 显示；`GapNotes` 在一个 “Missing from this build” 区块中列出多项，使占位结束后这些说明仍可阅读。所有标注都是项目的英文界面文字，不是原版文字。
- **核对：** [mission-copy.test.ts](../../src/ui/mission/mission-copy.test.ts) 核对 G ID 键与目标、限制的说明，[base-page.test.ts](../../src/ui/mission/base-page.test.ts) 核对 G-02/3、G-02/4、G-03、G-05 的文字、消息摘要的分类、基地页面的读数与消息行的呈现，[slice-gaps-copy.test.ts](../../src/ui/mission/slice-gaps-copy.test.ts) 以生产字符映射的合成字体核对 G-03 文案与 `MAP_COST_UNAVAILABLE` 的 DC-07 限制和切片可达序号的覆盖，[result-page.test.ts](../../src/ui/mission/result-page.test.ts) 核对结果页的读取与总结的各状态；开发与生产的任务流程 E2E 在每个页面读取可见的标注，每项恰好出现一次且文字与 `SLICE_GAPS` 一致（[P3-04/10](../plan/p3/04/subtasks/10-e2e-mission-flow.md#完成证据) 的 AC-19 行），[mission-result.development.spec.ts](../../e2e/mission-result.development.spec.ts) 同样核对救援占位、终局占位与结果页的标注（[P3-11/18](../plan/p3/11/subtasks/18-browser-verification.md#完成证据)）。

## 当前构建的缺省项

| G ID | 原版有而本构建没有的 | 本构建的呈现 | 位置 |
|---|---|---|---|
| G-01 | 音乐 | 不播放任何音乐，标注 “No music” | 开始配置页与任务壳底部的缺省说明；任务壳状态栏的短标签 “No music (G-01)”（`mission-status` 中的 `data-gap="G-01"`） |
| G-02/1 | 第一关介绍过场（`C-INTALL`） | 项目占位页：标注缺少的过场与 G ID，不展示原版画面或文字。每次开始与重开时、开始配置之前出现；页面可见且没有 pagehide 时累计 3,000 ms 后自然结束，或用 Skip 按钮、本页范围内新的 Enter/Space/Esc 提前结束一次；隐藏时显示等待说明并暂停计时；计时失败时只能返回主菜单。介绍时还没有世界 | 占位页 [PlaceholderPage.tsx](../../src/ui/mission/PlaceholderPage.tsx)（`mission-placeholder`，`data-gap="G-02/1"`）；占位结束后仍列在开始配置页与任务壳的缺省说明中 |
| G-02/2 | 出发过场（未选僚机为 `FLYFROM`，选了僚机为 `WFLYFROM`） | 同上的项目占位页，另写明本次运行的变体（无僚机 `solo` 或带僚机 `wingman`，按本次僚机选择）。确认开始时已创建 tick 0 的世界，会话保持在 `transition`：不推进 Core、不接受游戏输入；结束后进入飞行。保持期间页面隐藏过时，结束后只进入暂停（hidden），须显式继续。时间计入见下节 | 占位页（`data-gap="G-02/2"`，`mission-placeholder-variant` 的 `data-variant`）；之后同样列在开始配置页与任务壳的缺省说明中 |
| G-02/3 | 入港过场（`LANDING`） | 与 G-02/1、G-02/2 共用的项目占位页与计时（可见 3,000 ms 自然结束，或 Skip、本页范围内新的 Enter/Space/Esc 提前结束一次；计时失败只能返回主菜单）。停靠成功的 tick 完整执行后会话进入运行中保持，占位绑定 ownerId、runId 与本次 transitionId；同一 tick 的多条衔接依次各显示一页并写明“Transition i of n”。焦点：页面可见且原焦点随飞行页一起消失时移到 Skip，用户已移到其他控件或页面隐藏时不抢焦点；最后一项结束后（`inputFocusEntry` 的 `transition-ended`），运行中、页面可见、窗口有焦点且用户未移焦时焦点回到游戏输入区，否则落在任务壳标题；截断帧不再提交按住键的重复，保持清除按住与重复，恢复后只有新的按下生效 | 占位页 [PlaceholderPage.tsx](../../src/ui/mission/PlaceholderPage.tsx)（`mission-placeholder`，`data-gap="G-02/3"`，`data-transition`；多项时 `mission-placeholder-sequence`），流程位置 `transition` |
| G-02/4 | 离港过场（`LAUNCH`） | 同 G-02/3，在离港的 tick 之后 | 同上，`data-gap="G-02/4"` |
| G-02/5 | 被毁后的救援过场（`RESCUE`、`CHEWOUT`、`FLYFROM`） | 与 G-02/3 共用的运行中保持与占位（P3-11）：玩家被毁、爆炸延时与逃生舱（引擎内的规则时间）之后，舱到期的 tick 中 Core 已完成救援，会话在该 tick 之后保持并显示一页占位；一页代表整组媒体，跳过一次结束本页，不复刻原版逐片跳过。救援船只在媒体中，飞行中不出现。结束后玩家在基地附近（没有基地类对象时在世界缺省位置）以视角 0xC 继续同一关 | 占位页（`data-gap="G-02/5"`、`data-transition`），流程位置 `transition` |
| G-02/6 | 能量耗尽后的救援过场（`NOGAS`、`FLYFROM`） | 同 G-02/5，在信标消息之后 15 秒的信标等待到期、Core 完成能量救援的 tick 之后 | 同上，`data-gap="G-02/6"` |
| G-02/7 | 任务失败过场（`RESCUE` 或 `NOGAS`，再 `GARBSHIP`） | 终局占位（P3-11）：运行完成后、结果页之前显示，写明首片的变体（第三次损失为被毁或能量耗尽；罕见的结算失败照原版取被毁变体，并说明这时没有损失机体），标出“Ending i of n”；计时与跳过同 G-02/1，结束不恢复模拟 | 占位页（`data-gap="G-02/7"`，`mission-placeholder-variant` 的 `data-variant` 为 `destroyed` 或 `energy`，`mission-placeholder-sequence`），流程位置 `ending` |
| G-02/8 | 成功返航过场（`FLYTO` 或 `WFLYTO`） | 同 G-02/7 的终局占位，变体按锁存时僚机对象的状态为 `solo` 或 `wingman` | 同上，`data-gap="G-02/8"`，`data-variant` 为 `solo` 或 `wingman` |
| G-02/9 | 任务专属过场（所选任务为 `BASELOSS`） | 只在成功且总结选择字节为正时，接在 G-02/8 之后，写明所选的过场行 | 同上，`data-gap="G-02/9"`，`data-variant` 为行号（13–19） |
| G-02/10 | 授勋过场 | 不出现：P3 不判定勋章（勋章归 P4），在结果页披露 | 结果页的缺省说明（`data-gap="G-02/10"`） |
| G-03 | 通讯头像、动画与语音 | 规则仍按原版选择消息、推进来电通道、回调与抽取（[P3-10 D-03](../plan/p3/10/spec.md#d-03-定稿已批准)）；每条消息的规则含义由项目摘要文字给出：按（表、头像、序号）区分停靠回复、基地与友机的两种状态回复、基地发现敌机、感谢、友方受攻击及其后续呼叫、友方被毁、玩家误伤或击毁友方、僚机丢失、僚机的各类报告与对命令的答复（不能执行、确认、按船体的三档状态、编队、攻击目标、交战、返航或前往目的地、不能前往目的地）；原版没有停靠的拒绝消息，三种停靠取消没有反馈，因此不设对应文字。摘要至多 58 字节（DC-07），切片可达的消息全部覆盖；其余映射显示明确的未覆盖反馈（“No project summary covers this message yet (G-03).”），不伪造答复。驾驶舱（P3-13）：左显示屏页 5 在原版 96 × 96 头像区显示项目短标注（2 行，第二行为 `G-03 PROJECT`），完整摘要以原版来电文字的参数进入消息行；基地页显示同一消息行的队首与当前来电的全文，标为项目摘要或导入文字。这些都是项目文字，不是原版台词 | 文字在 `MESSAGE_SUMMARIES`、`messageSummary` 与 `messageLabel`，经应用装配（[cockpit-copy.ts](../../src/app/composition/cockpit-copy.ts)）传给驾驶舱并在开始前按字体核对，不从 `render/` 反向导入 React 页面；驾驶舱的页 5 与消息行；基地页 [BasePage.tsx](../../src/ui/mission/BasePage.tsx) 的 `base-messages` 区块（`data-gap="G-03"` 的标注，`base-incoming`、`base-message-line` 的 `data-origin`、`data-covered`） |
| G-04 | 原版简报、僚机档案与僚机选择页 | 项目的任务开始配置页：任务的战役组与槽位、固定难度、目标与限制（项目文字，经 P3-11 复核：全清之后的结算等待、Warp 中的推迟、完成消息与结果延时，罕见的同帧编组使结算失败，前两次损失救援、第三次失败，结算等待开始后的损失不计，基地、僚机损失与用时不导致失败；注明代码证据已确认、正常玩法可达性为高概率，说明结果由 Core 判定、本页只描述，并给出来源）、按名单次序的 5 个僚机选项与 “No wingman”。不显示原版简报文字与头像；僚机名字只按纯文本显示，没有候选名时用项目编号 | 开始配置页 [StartConfigPage.tsx](../../src/ui/mission/StartConfigPage.tsx)（`mission-config`）的标注与目标、限制区块（`mission-objectives`，`data-gap="G-04"`，文字为 `MISSION_OBJECTIVES`） |
| G-05 | 原版基地内部画面（TABL 10165 的图像与文字） | 项目的基地页面：在任务壳唯一的游戏输入区内，标题 “Base service (G-05)” 与标注。按 projection 的同一次序（既是服务队列也是显示次序）列出 11 行：行号、项目名称（按选择值所服务的子系统命名，置信度为高概率；子系统未知的写 “Subsystem N (unknown)”）、状态的文字（0 为无需服务，否则写出状态值）、首行在需要服务时为 “Being serviced”（首行无需服务时服务步不会越过它，所以其余行不标注）、光标行为 “Selected”；基地的三个完成标志；能量、船体与所选导弹挂点的弹药读数。projection 没有服务的到期与速率，因此不显示倒计时或进度百分比。按键说明区分已接入的上下、Enter、`L` 与 `M`（打开战略地图，地图中 `M` 或 Esc 关闭并回到基地；P3-02 spec 的 MW-04），以及项目控制 `P`（暂停）与 Esc（任务菜单，G-07）。页面不绑定按键、没有鼠标规则入口：按键经输入区与 `GameCommandFeedback.submit` 每次按下提交一次。本页打开之后最近一条基地命令的结果可查询（不朗读），之后的提交失败以 `role="alert"` 显示结构化原因；打开之前的飞行命令（Enter 的速度匹配同为 `confirm-selection`）与失败不显示。projection 经桥接按 10 Hz 采样，光标与行序的变化在帧末立即发布；页面另有 G-03 的无线电消息区块（见 G-03 行），显示驾驶舱消息行的同一队首与当前来电，队首变化立即发布，不建第二条队列，往返地图不重播；视图保持 4:3，内容较多时在输入区内滚动 | 任务壳的游戏视图 [BasePage.tsx](../../src/ui/mission/BasePage.tsx)（`base-page`，各行 `base-service-row` 的 `data-row`、`data-record`、`data-selector`、`data-state`、`data-in-service`、`data-selected`），读模型 [base-page.ts](../../src/ui/mission/base-page.ts)；样式在 [app.css](../../src/app/app.css) |
| G-06（结果页、重开与返回） | 原版战役中的统计页、二选一的重玩或继续提示、高分榜、晋升与勋章，以及重开任务入口保留的战役状态 | 运行完成后、终局占位之后的项目结果页（P3-11）：结果（成功或失败，文字加标记，不只靠颜色）、规则原因的项目文字（全清；第三次损失，区分被毁与能量耗尽；或结算失败）、标为本次尝试项目摘要的已用救援次数与击杀合计（不是原版统计公式），以及成功时从导入内容解析的任务总结（标注原版在下一关出发前显示它；无匹配、空总结、失败与解析失败分别说明）；明确它代替原版统计页、提示、高分榜、晋升与勋章，P3 不判定勋章。`Restart mission` 开始同一任务的新实例：回到介绍，以同一内容、难度 19 与重新抽取的种子从 tick 0 创建新世界，只沿用僚机选择，不复刻原版重开时保留的关卡编号、战役统计、晋升与高分榜。`Return to main menu` 释放任务。进入结果页时焦点在标题 | 结果页 [ResultPage.tsx](../../src/ui/mission/ResultPage.tsx)（`mission-result`，`data-outcome`、`data-reason`；总结 `mission-result-summary` 的 `data-summary`；缺省说明中的 G-06 与 G-02/10），流程位置 `result`；任务菜单 [MissionMenuPage.tsx](../../src/ui/mission/MissionMenuPage.tsx)（`mission-menu`）；运行故障或停止后的提示（`mission-ended`，可以重开时） |
| G-07 | 原版主菜单、选项与战役设置（含难度滑块） | 项目页面：主菜单的 `Start mission` 入口、开始配置页的固定难度（原始值 19，“fixed, G-07”）与暂停式的任务菜单（Continue、Restart mission、Return to main menu）；不提供难度设置 | 主菜单 [MainMenuPage.tsx](../../src/ui/pages/MainMenuPage.tsx) 入口的说明；开始配置页的标注与难度；任务菜单的标注 |
| G-08 | F2–F10 及原版光标、小键盘视角键（P3-05 绑定表中的视角键） | 本构建只提供前视驾驶舱；原版其他视角（含光标与小键盘别名）未实现，由 P4 补齐 | 任务壳的飞行输入区暂缺提示：F2–F10、`Home`、`PageUp`、`ArrowLeft`、`ArrowRight`、`ArrowDown`；NumLock 与 Shift 状态相同时的 `Numpad7`、`Numpad9`、`Numpad4`、`Numpad5`、`Numpad6`、`Numpad2` |
| G-09 | 自动驾驶（`a`） | 本构建不实现原版自动驾驶，也不提供自动驾驶命令；由 P4 补齐 | 任务壳的飞行输入区暂缺提示：`KeyA` |
| G-10 | 飞行中切换操纵灵敏度（F11） | 灵敏度固定为 Medium；本构建未实现飞行中切换，由 P4 补齐 | 任务壳的飞行输入区暂缺提示：`F11` |

各页面显示的 G 项：主菜单 G-07；介绍占位 G-02/1；开始配置 G-04、G-07，以及缺省说明中的 G-01、G-02/1、G-02/2；出发占位 G-02/2；入港与离港占位 G-02/3、G-02/4；救援占位 G-02/5、G-02/6；终局占位 G-02/7、G-02/8、G-02/9；结果页 G-06 与 G-02/10；任务壳（飞行）状态栏的 G-01、飞行输入区的 G-08–G-10 暂缺提示与缺省说明中的 G-01、G-02/1、G-02/2，运行结束且可以重开时另有 G-06；任务壳在基地视角时游戏视图内的 G-05 与 G-03；任务菜单 G-07、G-06。飞行中的 G-03 由驾驶舱左显示屏页 5 的项目短标注标出（画面内，不是 DOM 标注）。

本构建尚无界面的其他 G 项见 P3-01 的[缺省清单](../plan/p3/01/spec.md#缺省清单)，由负责实现的任务加入本文。

## 在制标注（非 G 项）

P3-13 已把驾驶舱、HUD、视角标签与战略地图画入同一飞行画布（[P3-13 spec：缺省与标注](../plan/p3/13/spec.md#缺省与标注)），所以 P3-12 时覆盖在飞行区域底部的驾驶舱在制提示已移除，构建状态说明 `MISSION_SKELETON` 也不再说没有驾驶舱与 HUD。

剩下的在制项是 P3-14 的音效：`MISSION_SKELETON` 写明还没有音效（P3-14），任务壳状态栏显示在制提示 “Sound effects are not implemented yet (P3-14).”（[MissionShell.tsx](../../src/ui/mission/MissionShell.tsx) 的 `flight-in-progress`，文字为 [mission-copy.ts](../../src/ui/mission/mission-copy.ts) 的 `FLIGHT_IN_PROGRESS`），在游戏画面之外，不遮挡驾驶舱像素。这是在制状态，不是 G 项：不进入 `SLICE_GAPS`，不使用 `GapNote`，也不是长期豁免；P3-14 接入音效时移除，最迟在 P3-15 之前补齐。音乐的缺省仍是 G-01。

战略地图在 `percent: null`（E = 0）时显示的 `MAP_COST_UNAVAILABLE`（`N/A`）是项目提示，不是 G 项：原版在这里触发 x87 异常，其结果不是有效百分比，项目以集中定义的短标记代替（[P3-13 DC-09](../plan/p3/13/spec.md#dc-09-地图呈现与输入)，已批准差异 Δ-06）。

## G-02 不计时与基准设置的差异

- **项目选择：** 按 P3-02 [技术决定 2](../plan/p3/02/spec.md#技术决定)，G-02 占位期间不推进 Core，结束后也不补计时间；自然结束与跳过的规则效果相同。出发占位保持 tick 0 的世界，结束后首个回调只锚定时钟（[Core 已知差异](./modules/core.md#已知差异)的“时间”一条）。占位的 3,000 ms 是项目的呈现时长，不是原版媒体的时长或测量容差。
- **与基准设置的差异：** 基准环境启用过场。原版看过场时，两段过场的用时计入生成队列的已过时间（但不计入飞行的第一步），所以延迟到达的编组在飞行中会比本构建更早出现（[B-003 出发](../original/behavior/B-003-campaign-flow.md#出发l-02)，已确认，代码与数据；未经运行核对）。本构建相当于省去媒体播放的用时，但不等同于原版关闭过场：原版的构建用时、生成原点与首帧取样仍与本构建不同。
- **世界的创建时机：** 本构建在确认开始时、出发占位之前创建 tick 0 的世界，以便提前报告创建失败；原版在出发过场之后才载入任务。本构建只保证占位结束之前不模拟，不声称构建时机与原版相同。首批对象在第一个 tick（时钟 2）实例化，原版在构建帧的第一次队列检查时实例化（同见 Core 已知差异）。
- **对照记录：** 这些差异在 [P3-04/14](../plan/p3/04/subtasks/14-real-content-comparison.md#完成证据) 的 L-02 流程部分披露。
- **运行中衔接（G-02/3、G-02/4，P3-10）：** 沿用同一方案（[P3-10 技术决定 1](../plan/p3/10/spec.md#技术决定)）。停靠或离港的状态变化在原定阶段执行，该 tick 的其余阶段照常完成；Runtime 在该 tick 之后截断本帧并保持，占位期间不调用 step、不接受游戏输入，结束后重锚时钟、不补跑。停靠倒计时、回复与基地服务都是规则时间，跳过占位不跳过它们。保持不进入录制，replay 与占位显示多久、是否跳过无关。与基准设置的差异：原版的 `LANDING` 在入港处理中阻塞，用时计入下一帧的步长；`LAUNCH` 计入离港后的第一帧；本构建不计（[P3-10 D-02](../plan/p3/10/spec.md#d-02-连续行为判据已批准) 的“已批准的差异”第 2 条）。
- **救援（G-02/5、G-02/6，P3-11）：** 沿用同一方案（[P3-11 技术决定 3](../plan/p3/11/spec.md#技术决定)）。救援的规则在救援的 tick 中已经完成，该 tick 的其余阶段照常；会话保持期间不调用 step，结束后重锚时钟、不补跑；爆炸延时、逃生舱与信标等待是规则时间，跳过占位不跳过它们。与基准设置的差异：原版在恢复玩家之前阻塞播放救援列表，能量救援（在任务流程中）的用时进入同一主循环迭代随后的取样，被毁救援（在请求处理中）的用时进入下一迭代的取样（C3）；本构建两者都不计，只说明媒体时长取零，不声称与关闭过场的原版整个世界状态等价（[Core 已知差异](./modules/core.md#已知差异)的“时间”一条；R-20 至 R-22 的对照把它作为已批准的差异单列）。
- **终局（G-02/7 至 G-02/9，P3-11）：** 运行在退场完成的 tick 结束，终局占位与结果页不恢复模拟，所以没有需要计入或补跑的时间。原版的终局媒体之后是战役的下一步，本构建以结果页代替（G-06）。
