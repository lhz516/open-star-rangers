---
type: guide
status: active
phase: all
updated: 2026-10-10
related: [ADR-0015]
---

# UI 模块说明

本文件是[源码结构指南](../source-structure.md)的模块分册，记录 `src/ui/` 中已交付代码的当前 API 与契约要点。目录树、职责边界与 helper 归属以指南为准，行为契约以各任务 spec 为准；修改本模块代码的任务同步更新本文件。

当前 `src/ui/` 中已交付：P3-04 的游戏 store、会话桥接与命令反馈（`ui/game/`）、P3-05 的任务输入消费者与能力/地图输入（`ui/game-input/`）、任务页面与缺省标注文字（`ui/mission/`）与只在开发构建出现的诊断（`ui/dev/`）；P1-08 起的主菜单与页面焦点 helper（`ui/pages/`）；P2-11 的导入页面与失败文案（`ui/import/`）、资源查看器页面（`ui/viewer/`）。菜单与任务页面都是项目的网页界面，不是原版界面或飞行 HUD；任务画面已连接键盘输入区与地图输入，但仍是逐步填充的正式运行骨架，缺少完整飞行画面、驾驶舱、HUD、部分规则与音效。P1 的合成 UI 层、开发面板与画面组件已于 P3-04 退役，见[退役记录](../source-structure.md#p3-04-合成演示退役记录)。React 接线、焦点与测试 ID 见[工程约定](../README.md#页面流转与任务生命周期)。

## 游戏 store、桥接与命令反馈

`ui/game/` 是 P3-04 S-06 的正式 UI 层（[spec：UI 桥接与命令反馈](../../plan/p3/04/spec.md#ui-桥接与命令反馈)），由 Node 测试以真实会话、`ControlledHost` 与可控时钟覆盖；采样、附着与时钟的工程规则见[工程约定](../README.md#ui-投影与指令反馈)。

- **store：** [game-store.ts](../../../src/ui/game/game-store.ts) 的 `createGameStore<Flow>(ownerId)` 返回 `{ ownerId, reader, commit }`，每个任务所有者一个。状态 `GameUiState` 为 `{ ownerId, status, projection, flow, pendingCommands, recentResults, actionError, sessionError }`：`flow` 是所有者写入的冻结流程值（泛型），`recentResults` 至多 `RECENT_RESULT_LIMIT`（10）个，每个待确认命令与结果都带 ownerId、runId 与 commandId。`commit(change)` 原子应用一次转换（含 `clearRun`、`addPending`、`settle`），至多通知一次，返回结算的命令数。桥接与运行级消费者只拿到不能写 `flow` 的 `GameRunStore`。标量 selector 有 `selectOwnerId`、`selectPhase`、`selectRunId`、`selectTick`；React 用 [use-game.ts](../../../src/ui/game/use-game.ts) 的 `useGame(reader, selector)`。
- **桥接：** [game-session-bridge.ts](../../../src/ui/game/game-session-bridge.ts) 的 `createGameSessionBridge({ store, clock, consumers })` 返回 `{ ownerId, onError, bind(sessionView), attach(run), unbind(), currentRun() }`。`bind` 只取会话的 `{ status, currentRun, onStatus }` 并自动附着每个新运行；`attach(run)` 幂等，所有者也可以把它作为运行级消费者调用（此时时钟失败延到该运行的下一帧报告）。`onError` 传给 `createGameSession` 作为错误出口；所有者释放时在会话之后 `unbind`。`PROJECTION_SAMPLE_INTERVAL_MS` 为 100。帧末立即发布的关键事实按字段比较：`mission.status`、`player.interactionContext`、飞行分区运动组与战斗组各自的就绪状态（P3-06 D-05；运动组已就绪，战斗组待 P3-07）、地图、通讯与结果分区的就绪状态及结果内容；运动组内读数的变化按采样发布。
- **运行级消费者：** `GameRunConsumer` 为 `{ attach(binding), frameEnd?(binding), faulted?(binding) }`，后两者返回要写入的结算。`binding` 提供 `runId`、`ownerId`、`run`、`isCurrent()`、`submitCommand`、`setIntent`、`commit(change, withLatestProjection?)` 与 `own(cleanup)`；桥接回滚或 unbind 后，binding 的提交在触及运行之前即被拒绝。
- **命令反馈：** [game-command-feedback.ts](../../../src/ui/game/game-command-feedback.ts) 的 `createGameCommandFeedback(store)` 是运行级消费者加 `submit(command) → commandId | null`。结果为 accepted、rejected、ignored（取自 `command-result` 的 outcome 与 reason）、cancelled（会话的取消原因）或 unconfirmed（`session-failed`）。
- **测试支持：** [game-ui.test-support.ts](../../../src/ui/game/game-ui.test-support.ts)。[describe-error.ts](../../../src/ui/game/describe-error.ts) 把错误（含会话失败项与聚合原因）展开为开发者可读的文字，供外壳的锁存与打开失败警告使用；任务页面改用不含消息文本的 `describeStructure`（见下节）。

## 任务页面与缺省标注

`ui/mission/` 是 P3-04 的任务页面（[spec：应用流程](../../plan/p3/04/spec.md#应用流程)、[任务开始配置](../../plan/p3/04/spec.md#任务开始配置)、[衔接占位](../../plan/p3/04/spec.md#衔接占位)、[缺省与标注](../../plan/p3/04/spec.md#缺省与标注)）。页面只渲染任务所有者的快照并在事件处理中调用其意图；文字与按键判定是 DOM-free 模块，由 Node 测试覆盖。

- **页面：** [MissionPage.tsx](../../../src/ui/mission/MissionPage.tsx) 按流程位置选择 [PlaceholderPage.tsx](../../../src/ui/mission/PlaceholderPage.tsx)（G-02/1、G-02/2）、[StartConfigPage.tsx](../../../src/ui/mission/StartConfigPage.tsx)（G-04、G-07）、[MissionShell.tsx](../../../src/ui/mission/MissionShell.tsx)（飞行与结束：空的游戏区域、游戏区域之外的状态栏、暂停/继续与任务菜单、故障或停止的提示）与 [MissionMenuPage.tsx](../../../src/ui/mission/MissionMenuPage.tsx)（Continue、Restart mission、Return to main menu）。[MissionParts.tsx](../../../src/ui/mission/MissionParts.tsx) 的 `GapNote`（`class="slice-gap"`、`data-gap`）、`GapNotes` 与 `SkeletonNote` 由各页面共用。
- **缺省标注文字：** [slice-gaps-copy.ts](../../../src/ui/mission/slice-gaps-copy.ts) 的 `SLICE_GAPS` 以 G ID 为键（`G-01`、`G-02/1`、`G-02/2`、`G-04`、`G-06`、`G-07`），每项为 `{ title, text }`；`MISSION_OBJECTIVES` 是 G-04 开始配置页的目标与限制（项目文字、事实来源与置信度、本构建尚未实现这些规则），代码注释链接权威来源，P3-11 接入规则时复核。同一 G 项的文字只在这里；各项的呈现与位置见[切片缺省清单](../slice-gaps.md)。
- **其他文字：** [mission-copy.ts](../../../src/ui/mission/mission-copy.ts) 为构建状态说明 `MISSION_SKELETON`、`eligibilityReason`（入口不可用的原因）、`wingmanLabel`（僚机名字只作纯文本：无候选为项目编号，多候选列出全部，不在 UI 中提前抽取）、`startFailureText` 与 `startRetryable`、状态栏的 `phaseText`/`pauseText`/`resumeBlockedText`，以及 `describeStructure`：只列错误类名与结构字段（kind、code、site、stage、operation、phase、path、reason）及其嵌套，不含消息文本，避免把导入内容带进页面。
- **按键：** [page-keys.ts](../../../src/ui/mission/page-keys.ts) 的 `placeholderKeyAction` 把占位范围内新的 Enter、Space、Esc 判为跳过，repeat 一律只阻止默认行为，带 Control/Alt/Meta 或输入法组合的新按下留给浏览器；`isHeldActivation` 判定 Enter/Space 的 repeat，供主菜单入口阻止重复激活。键位说明见[键位文档](../keyboard-input.md)。
- **游戏输入消费者：** [ui/game-input/](../../../src/ui/game-input/) 组合绑定表、上下文解析、键盘本地状态、按帧重复、命令反馈与宿主能力。`createInputConsumer` 是任务所有者的 `input` 阶段消费者，使用完整最新 projection 而非采样 store；连续轴/主炮电平通过运行句柄设置，离散动作经 `GameCommandFeedback` 排队。地图指针由独立 map input 路径解析，地图策略为生产显式注入。全屏、Keyboard Lock、Pointer Lock 的状态只在浏览器确认后变为 active；清除运行输入必须由 `GameInputConsumer.clear(reason)` 单一入口发起。逐组合契约及实机证据见[键位文档](../keyboard-input.md)。
- **焦点提示槽：** `InputNotices` 中的焦点提示 DOM 常驻并只视觉隐藏，CSS 稳定预留提示位，避免失焦/聚焦时页面布局跳动（P3-05/29）；G-08 至 G-10 缺省动作及能力/地图提示不夺焦、不暂停。
- **主菜单：** [MainMenuPage.tsx](../../../src/ui/pages/MainMenuPage.tsx) 的 `Start mission` 按开始资格启用或禁用，并说明原因与构建状态。

## 开发诊断

`ui/dev/` 是 P3-04 S-07 的开发诊断（[spec：开发诊断](../../plan/p3/04/spec.md#开发诊断)），只在开发构建中装配，生产构建与产物中没有（见[工程约定](../README.md#开发诊断与录制导出)）。DOM-free 部分由 Node 测试以注入的时钟与文件端口覆盖。

- **诊断：** [mission-diagnostics.ts](../../../src/ui/dev/mission-diagnostics.ts) 的 `createMissionDiagnostics({ timing, fileSave })` 返回 `{ consumer, reader, clearLog, refreshSnapshot, exportRecording, retrySave }`。`consumer` 是 `ui` 阶段的所有者级消费者；`reader` 的状态为 `{ runId, phase, log, frames, inspection, recording }`，每个新运行清空。只经公开的运行句柄读取，自己不提交命令；`selectCanRead`（有运行且未 faulted）与 `selectCanRetry`（保留了未保存的副本）供面板禁用控件。
- **事件日志：** [event-log.ts](../../../src/ui/dev/event-log.ts) 保留最近 `EVENT_LOG_LIMIT`（500）条摘要（tick、类型、主要字段与 commandId），超出时丢弃最旧的并标记已截断，不保存快照历史。主要字段按固定次序：`command-result` 为 commandIndex、commandType、outcome、reason；`object-instantiated` 为 entityId、kindBit、source、x、y、z；`speed-assist-toggled` 为 commandIndex、enabled；`speed-matched` 为 targetEntityId、origin，再按变体为 commandIndex 或 speedDifferenceExceeded；`speed-assist-released` 没有；`object-left-world` 为 entityId、kindBit、source（运行中创建的实体为 `rules`）。
- **帧统计：** [frame-stats.ts](../../../src/ui/dev/frame-stats.ts) 保留最近 `FRAME_SAMPLE_LIMIT`（120）个样本，给出平均与最大处理时间、tick 数与触顶帧数；计时失败只计数并保留原因，不记为 0 ms。样本来自 [app 的帧计时](./app.md#开发帧计时)。
- **实体与任务状态：** [entity-inspection.ts](../../../src/ui/dev/entity-inspection.ts) 的 `inspectSnapshot(snapshot, runId)` 把一份快照变为显示模型：tick、时钟、种子、setupHash、内容身份、任务与玩家状态、生成队列摘要与实体列表（ID、种类位、来源如 `wingman#0`、位置、对象状态与活动、被毁标志、放置序号）；名称只显示引用。
- **命令编辑：** [command-draft.ts](../../../src/ui/dev/command-draft.ts) 的 `COMMAND_FORMS` 描述每个 Core 命令变体的字段；`readDraft(draft)` 按 `readTickInput` 的规则校验，非法字段在提交之前即被拒绝，合法命令经命令反馈提交。
- **录制导出：** [recording-export.ts](../../../src/ui/dev/recording-export.ts) 的 `recordingFile(recording)` 给出 `JSON.stringify(Recording)` 原文与文件名 `osr-recording-<setupHash>-<seed>-<finalTick>.json`（各部分先校验，导入内容不进入文件名）；保存经所有者的 `FileSave`，失败时保留副本供 `retrySave`。
- **面板：** [MissionDevPanel.tsx](../../../src/ui/dev/MissionDevPanel.tsx) 接收 `diagnostics`、所有者 store 的 `reader` 与命令反馈的 `submitCommand`，按区块分别订阅，用原生控件，不注册全局键盘监听。测试支持为 [dev-diagnostics.test-support.ts](../../../src/ui/dev/dev-diagnostics.test-support.ts)。

## 失败文案

[ui/import/failure-copy.ts](../../../src/ui/import/failure-copy.ts) 是 P2-11 的纯文案模块（[spec 失败反馈](../../plan/p2/11/spec.md#失败反馈)），由 Node 测试覆盖：

- **入口：** `startFailureCopy`、`jobFailureCopy`、`cacheFailureCopy`、`missionFailureCopy` 分别接收启动规则的 `invalid-files`、作业快照的 `ImportErrorData`、P2-10 的 `ResourceCacheFailure` 与任务载入失败。
- **返回：** `{ category, message, details }`。
  - `category` 为 `<层>/<类别>`；
  - `message` 是该类别固定的英文句子；
  - `details` 只含 layer、code、结构位置、失败自带的固定原因与限值（名称、限值、观察值；缓存失败取第一条预算违规）。输入上的其他字段一律丢弃，所以宿主文本与文件名不会进入输出。
- **分类：** 只按 layer 与 code，不依赖 `reason`。
  - 每层的未知 code 用该层的默认句，未知层用全局默认句；
  - `source` 层的默认句与“结构或转换校验”同句，对应 spec 的“其余 code”。
  - `ui/` 不能导入 `original-data`，所以 disc 与 source 的 code 以字面量列出；测试以 `Record<DiscReadErrorData['code'] | SourceErrorCode | ImportErrorCode, …>` 的期望表逐一核对，上游新增 code 时类型检查失败。`import` 层的内部错误类别由 `IMPORT_ERROR_CODES` 派生。
  - 缓存的 13 个 code 各有一句，句子表的类型为 `Record<ResourceCacheFailureCode, string>`。
