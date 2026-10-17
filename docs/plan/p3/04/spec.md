---
type: plan
status: accepted
phase: P3
task: "04"
updated: 2026-10-17
related: [ADR-0004, ADR-0006, ADR-0015, B-001, B-003, B-005, B-006, U-010, U-021, U-031]
---

# P3-04：正式 Runtime、游戏会话与应用流程 — Spec

## 问题与目标

[P3-02](../02/spec.md) 交付了正式 Core（[Core 模块说明](../../../engineering/modules/core.md#正式-core)），但应用里没有任何东西推进它：

- [app/runtime/](../../../../src/app/runtime/) 与 [app/session/](../../../../src/app/session/) 只驱动 P1 的合成场景（[synthetic-runtime.ts](../../../engineering/source-structure.md#r3-合成-runtime)、[synthetic-session.ts](../../../engineering/source-structure.md#r4-合成会话)），输入、命令、事件、projection 与录制都是合成契约，不能改名充当正式玩法（[ADR-0015](../../../decisions/ADR-0015-source-module-structure.md)）。
- [页面流转](../../../../src/app/flow/app-flow.ts)只有菜单、导入、合成演示与查看器；没有任务开始入口、开始配置、出发衔接、任务中的暂停与菜单、重开或返回。
- 没有离页保护，没有消费正式 Core 的 projection 桥接、命令反馈或开发诊断，也没有在 Node 中重放浏览器录制的入口。

P3-05 至 P3-14 都要把输入、画面、HUD、音效与 React 页面接到同一个正式运行上；[阶段索引](../tasks.md#p3-04-正式-runtime游戏会话与应用流程)因此要求先有唯一的正式 Runtime 与 Session。本任务也负责 P3-01 闭环中 [L-01、L-02 的流程部分与 L-10 的重开与返回部分](../01/spec.md#闭环步骤)。

完成后可观察到：

- 主菜单只在持有完整资源包、且其任务能载入 Core 时提供开始任务的入口，否则说明原因。
- 开始后依次经过标注的第一关介绍占位（G-02/1）、项目的任务开始配置页（G-04、G-07：僚机 5 项或无僚机，难度固定为 19）、按本次僚机选择标注的出发占位（G-02/2），进入飞行。飞行中正式 Core 由唯一的 Runtime 以固定步长推进，生成与实例化按 P3-02 发生。
- 暂停与继续、暂停式的任务菜单、页面隐藏时自动暂停且恢复后不补跑、重开任务（新的任务实例）、返回主菜单，以及任务进行中的离页确认都可用；任何路径都不产生第二条游戏循环或遗留资源。
- 开发构建提供实体与任务状态检查、事件日志、帧耗时、命令提交与录制导出；导出的录制可在 Node 中用同一份原始文件组重放并比较。
- P1 合成演示退役，正式流程取代它在应用、测试与文档中的位置。

本任务不实现任何游戏规则、Classic 飞行画面与 HUD，也不绑定原版键位。阶段范围依据[总计划 §12](../../master-plan.md#12-开发阶段与验收条件)，任务导航见[阶段索引](../tasks.md)。生成、审阅或批准本 spec 都不会自动启动实现。

## 范围

### 包含

- **S-01 正式 Runtime：** 按 [Runtime](#runtime) 为正式 Core 提供固定步长推进、补跑上限、连续意图与按住开火、命令队列与每 tick 批次、帧后事件分发、两帧 Render State、projection 缓存、按需快照、开发录制与故障处理。
- **S-02 正式 Session：** 按[会话](#会话)以 [P1-05](../../p1/05/spec.md) 的控制器契约为基础，增加运行规格、衔接保持、停止状态与相应的取消原因。
- **S-03 任务流程与开始资格：** 按[应用流程](#应用流程)、[开始资格](#开始资格)与[任务开始配置](#任务开始配置)实现从菜单到飞行、任务菜单、重开与返回主菜单的流程，以及页面流转、任务所有者槽位与 React 接线。
- **S-04 衔接占位：** 按[衔接占位](#衔接占位)实现 G-02/1 与 G-02/2，以及新运行在出发占位期间的保持与一次性结束。飞行中的 Core 衔接由 P3-10、P3-11 定稿后接入，不预建检测器。
- **S-05 消费者所有权与离页保护：** 按[消费者接线与释放](#消费者接线与释放)与[离页保护](#离页保护)实现运行级与所有者级的接线、释放顺序、资源包替换时的释放，以及 `beforeunload` 的平台适配。
- **S-06 UI 桥接与命令反馈：** 按 [UI 桥接与命令反馈](#ui-桥接与命令反馈)提供正式 projection → Zustand 的桥接与命令反馈。
- **S-07 开发诊断：** 按[开发诊断](#开发诊断)提供只在开发构建出现的状态检查、事件日志、帧耗时、命令提交与录制导出。
- **S-08 Node 重放核对工具：** 按 [replay 核对工具](#replay-核对工具)新增 `tools/replay-check.ts`。
- **S-09 合成任务包：** 按[合成任务包](#合成任务包)扩展 P2 的合成内容，使 Node 与浏览器测试能创建正式世界，并覆盖不能开始的情形。
- **S-10 合成演示退役：** 按[合成演示退役](#合成演示退役)删除合成演示及其专用模块，迁移测试与文档。
- **S-11 缺省标注：** 按[缺省与标注](#缺省与标注)实现 G-01、G-02/1、G-02/2、G-04、G-07 的界面标注与 G-06 中重开与返回的流程部分，新建或更新 `docs/engineering/slice-gaps.md`。
- **S-12 文档与对照：** 同步[文档影响](#文档影响)所列文档；按[对照](#对照)记录 R-13 控制部分与流程顺序的结论。

### 不包含

- 原版键位与浏览器输入：飞行键、Alt/AltGr 开火、`p` 与 Esc 的按键映射、飞行输入区与焦点、清键、Pointer Lock、全屏与 Keyboard Lock、Alt+F4 风险提示：P3-05。本任务只提供它们调用的控制与意图接口。
- 任何游戏规则（运动、目标、武器、AI、地图、Warp、通讯、停靠、结果与救援）：P3-06 至 P3-11。
- 飞行场景渲染、Classic 驾驶舱、HUD/MFD 与地图画面：P3-12、P3-13；音效与音频解锁：P3-14。本任务只提供它们接入运行与释放的机制，不创建飞行画面的 WebGL 表面、音频上下文或键盘源。
- 任务结果页、结束条件及其后的 G-02/5 至 G-02/10：P3-11。P3-11 使用本任务的重开与返回流程。
- 入港与离港占位 G-02/3、G-02/4：P3-10。本任务的占位显示、计时与生命周期约定可复用，但不预先批准飞行中的 Core 衔接接口。
- 改变 Core 契约：命令、事件、projection 或 Render State 的形状，以及衔接所需的 Core 状态，都按 [P3-02 扩展规则](../02/spec.md#扩展规则)由需要它的任务修订。
- 存档、设置、键位重映射，以及原版菜单、简报、统计与战役页面（G-04、G-06、G-07 的原版呈现）：P4。CI、部署与跨浏览器矩阵：P5。
- Gamepad、鼠标飞行、其他任务或 Enhanced；不新增依赖或引入新的测试 runner。
- 模拟 Worker、ECS 或通用游戏引擎（[总计划 §6](../../master-plan.md#6-补齐-threejs-之外的游戏能力)）。

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| [app/runtime/](../../../../src/app/runtime/) | 计划新增正式 Runtime 与其事件总线；复用 [fixed-step-clock.ts](../../../../src/app/runtime/fixed-step-clock.ts) 与 [runtime-errors.ts](../../../../src/app/runtime/runtime-errors.ts)；删除 `synthetic-*` |
| [app/session/](../../../../src/app/session/) | 计划新增正式 Session；复用 [session-host.ts](../../../../src/app/session/session-host.ts)、[session-errors.ts](../../../../src/app/session/session-errors.ts) 与 [rollback-error.ts](../../../../src/app/session/rollback-error.ts)，按需扩展状态与原因；删除 `synthetic-session*` |
| `app/mission/`（计划新增） | DOM-free 的任务流程状态机与任务所有者：开始资格、配置、占位计时、运行创建、重开与返回、消费者与离页保护的所有权 |
| [app/flow/](../../../../src/app/flow/)、[app/composition/](../../../../src/app/composition/)、[App.tsx](../../../../src/app/App.tsx)、[ports.ts](../../../../src/app/ports.ts)、[browser-ports.ts](../../../../src/app/browser-ports.ts) | 页面流转增加任务画面；任务所有者槽位与 React hook；应用端口增加种子、会话宿主、时钟与定时器、离页保护与（开发）文件保存；删除演示槽位与 hook |
| [app/resources/](../../../../src/app/resources/) | 复用资源持有者与任务载入诊断；三份逻辑 Asset 的解码按需提取为与诊断共用的 helper，行为不变 |
| `ui/game/`、`ui/pages/`、`ui/mission/`（计划新增）、`ui/dev/` | 正式 store、桥接与命令反馈；菜单入口、开始配置、占位、任务画面与任务菜单；开发诊断面板。删除 `synthetic-*`、`SyntheticDemoPage`、`SyntheticDevPanel`、`SyntheticRenderView` |
| [platform/browser/](../../../../src/platform/browser/) | 复用会话宿主；计划新增 `beforeunload` 适配器 |
| [render/](../../../../src/render/) | 删除 `render/synthetic/`；共用的表面、视口与清理模块不变（查看器在用，P3-12 将使用） |
| [core/synthetic/](../../../engineering/source-structure.md#r1-合成-core) 与 lint 规则 `osr/core-synthetic-boundary` | 随合成场景一起删除；同步 [eslint.config.js](../../../../eslint.config.js) 与 [engineering-boundaries.test.ts](../../../../tools/engineering-boundaries.test.ts) |
| [content/](../../../../src/content/)、[workers/](../../../../src/workers/) 的测试支持 | 合成任务包扩展；生产内容契约、切片定义与转换器版本不变 |
| `tools/replay-check.ts`（计划新增） | Node 中以 CloneCD 文件组重放录制并比较 |
| [e2e/](../../../../e2e/) | 依赖合成演示的用例迁到正式流程；新增任务流程、生命周期与离页保护用例 |
| `docs/engineering/`、`docs/guides/`、`docs/engineering/slice-gaps.md`（计划新增） | 见[文档影响](#文档影响) |
| `local/research/p3-04/`（git 忽略） | 真实内容的本地核对输出 |

## 当前实现与依据

- **正式 Core：** 创建与推进使用 [create-world.ts](../../../../src/core/world/create-world.ts) 的 `CreateWorldInput` / `createWorld`、[world.ts](../../../../src/core/world/world.ts) 的 `World`、[recording.ts](../../../../src/core/replay/recording.ts) 的 `createRecordingSession`；读取与重放使用其公开方法及 [Core 模块说明](../../../engineering/modules/core.md#正式-core)列出的入口。动作规范化复用 [tick-input.ts](../../../../src/core/contracts/tick-input.ts) 的 `readTickInput`，预算读取 [limits.ts](../../../../src/core/contracts/limits.ts)，不调用内部世界构造器。创建时从同一个已验证包解码三份逻辑 Asset 并传入其身份；其余约束见 [Core 交接](../../../engineering/modules/core.md#交接)与 [P3-02 时间模型](../02/spec.md#时间模型)。尤其注意：Core 故障会锁存到所有后续读取，不能沿用合成 Core 的故障后快照或前缀导出语义。
- **时间模型：** 时钟单位 1/64 秒，默认每 tick 2 单位（[P3-02 时间模型](../02/spec.md#时间模型)）。“G-02 占位期间不推进、结束后不补计时间”由 P3-02 [技术决定](../02/spec.md#技术决定) 2 提出，要求 P3-04、P3-10、P3-11 在各自 spec 中接纳。
- **输入契约：** `TickInput` 为 `{ axes, commands }`，命令是 16 个变体的封闭联合；按住开火由 Runtime 依采样的按住状态每 tick 产生一个 `fire` 命令，两次采样之间的短按保留一次；Core 没有按键缓冲（[P3-02 输入与命令](../02/spec.md#输入与命令)）。
- **P1 的运行骨架：** [P1-04](../../p1/04/spec.md) 的 Runtime（固定步长、补跑上限 5、命令队列、帧后 Event Bus、两帧 Render State、录制、故障）；[P1-05](../../p1/05/spec.md) 的会话（控制通道、唯一帧请求、运行身份、通知边界、隐藏自动暂停、显式继续、重新锚定、资源所有权与清理锁存）；[P1-06](../../p1/06/spec.md) 的 projection 桥接与命令反馈；[P1-08](../../p1/08/spec.md) 的页面流转与生命周期槽位。现状与接线见[工程约定](../../../engineering/source-structure.md#r10-菜单入口键位与工程文档)及其后各节。按 [P1 退出评审](../../../reviews/P1-exit.md#可复用设施与必须替换的合成项)，这些机制可以复用，“真实第二场景出现后才设计复用”；本任务就是这个时机。
- **资源持有者：** [resource-holder.ts](../../../../src/app/resources/resource-holder.ts) 至多持有一份资源包，含 `validatePackage` 的全包判定；缓存恢复的资源包同样经过校验（[应用资源持有者](../../../engineering/modules/app.md#应用资源持有者)）。[mission-diagnostics.ts](../../../../src/app/resources/mission-diagnostics.ts) 在持有 `logic` 组时解码三份逻辑 Asset 并调用 `loadMission`，结果为 `loaded`，或带类别、路径与原因的 `failed`。
- **原版依据与置信度：** 出发顺序、媒体变体与时间关系见 [B-003 出发](../../../original/behavior/B-003-campaign-flow.md#出发l-02)及 [executable](../../../original/formats/executable.md#cut-scenes-and-loop-transitions-p3-0108)（已确认，代码；媒体与截图对应为高概率）；默认僚机及预选见 [spawn queue](../../../original/formats/executable.md#spawn-queue-p3-0203)（已确认，代码）；重开与 Esc 页面对应见 [B-003](../../../original/behavior/B-003-campaign-flow.md#重开任务p3-0104)（高概率）。暂停、地图与按键门禁分别见[时基](../../../original/formats/executable.md#simulation-time-base-p3-0106)、[B-001](../../../original/behavior/B-001-strategic-map.md#打开与关闭已确认)与[输入轮询](../../../original/formats/executable.md#input-polling-p3-0201)（已确认，范围以原文为准）。G-02 实例归属见 [P3-01/08](../01/subtasks/08-transition-media.md#完成证据)，本 spec 不另建事实清单。
- **闭环与缺省：** [闭环步骤](../01/spec.md#闭环步骤)、[切片配置](../01/spec.md#切片配置)、[缺省清单](../01/spec.md#缺省清单)、[标注规则](../01/spec.md#标注规则)。G 项的 P3 实现任务见 [P3-01/12 的交接](../01/subtasks/12-catalog-handoff.md#完成证据)：G-02/1、G-02/2、G-04、G-07、G-06（重试与返回的流程）与 G-01（建议）归本任务。R-13 的控制部分归本任务（[规则对照目录](../01/spec.md#规则对照目录)）。
- **合成演示：** 菜单的 `Start synthetic demo` 进入 P1 合成场景，带合成键位（[键位文档](../../../engineering/keyboard-input.md)）、开发面板与合成渲染；[键位文档 §1](../../../engineering/keyboard-input.md#1-适用范围)写明其绑定随合成场景退役。[阶段索引](../tasks.md#p3-04-正式-runtime游戏会话与应用流程)把保留或退役交给本 spec 决定，并要求任何时候都不并存两条游戏循环。多个 E2E 用例经它验证生命周期、资源平衡、网络审计与渲染。
- **证据边界：** 本任务的控制与出发流程依据已有记录，不另设新的 DOS 原版运行门槛；这不关闭 [U-010、U-021、U-031](../../../original/unknowns.md)，也不替代 P3-09 的真实地图、P3-11 的结果或 P3-15 的闭环验证。R-13 在此只验控制子集，见[对照](#对照)。

## 行为与边界

### 应用流程

页面状态只在内存中，不用路由或 history。任务画面与菜单、导入、查看器互斥，进入任务画面时创建一个任务所有者，离开时释放它。

| 流程位置 | 进入条件 | 呈现与可用操作 | 离开 |
|---|---|---|---|
| 主菜单 | 应用载入；任一画面返回 | 开始任务入口：满足[开始资格](#开始资格)时可用，否则禁用并说明原因 | 开始 → 介绍占位 |
| 介绍占位（G-02/1） | 开始、重开 | 见[衔接占位](#衔接占位) | 结束或跳过 → 开始配置 |
| 开始配置（G-04、G-07） | 介绍占位结束 | 见[任务开始配置](#任务开始配置)；开始、返回主菜单 | 开始成功 → 出发占位；创建失败 → 留在本页显示原因；返回 → 主菜单 |
| 出发占位（G-02/2） | 世界已创建，运行处于衔接保持 | 按本次僚机选择标注出发过场的变体 | 结束或跳过 → 飞行 |
| 飞行 | 衔接结束 | 运行或暂停；暂停与继续；打开任务菜单；画面区域由 P3-12、P3-13 填充 | 重开 → 介绍占位；返回 → 主菜单；故障或停止 → 对应提示 |
| 任务菜单（G-07） | 飞行中打开 | 暂停式：继续、重开任务、返回主菜单 | 继续 → 飞行（页面可见且未离页时） |
| 故障或停止 | 运行故障；开发录制容量用尽 | 原因；重开任务（无清理失败时）、返回主菜单；仅录制容量停止可导出，故障不提供新的导出 | 同上 |
| 结果（P3-11 接入） | — | — | 使用本任务的重开与返回 |

- **重开：** 先结束当前运行并取消未执行命令，只有全部必要收尾成功才回到介绍占位；配置页预选上次确认的僚机，允许用户改变选择。再次确认后，使用同一内容身份、固定难度和重新抽取的种子创建新世界。除配置选择外不继承任何运行状态；本控制器的 runId 递增，新运行从 tick 0 开始。重新抽样不保证种子数值或随机结果不同。清理失败不进入新流程，只保留错误并允许返回菜单。P3-11 的结果后重试使用此路径，不复刻战役存档或跨任务统计（G-06）。
- **返回主菜单：** 开始配置页、任务菜单与故障或停止提示中都提供。先失效并尝试释放任务所有者，再切换画面，使同步释放失败在菜单出现前锁存且仍可在菜单读取。焦点回到可用的开始任务入口，否则回到菜单标题。占位只提供跳过，跳过后再返回；失败的占位必须有返回出口，不能把用户困在不可结束页面。
- **锁存：** 任务所有者的清理失败（含初始化回滚失败）在本应用实例内锁存，之后不再创建任务所有者，开始入口禁用并显示原因，直到重新载入页面；导入与查看器不受影响。它与查看器的锁存互相独立。
- **僚机选择的保持：** 本应用实例内第一次进入开始配置时预选名单第 1 项；之后在同一内容身份下预选上一次成功确认的选择（含无僚机），跨重开与返回菜单保持。新内容身份或重新载入页面重置为默认；不能只凭同一个索引推断是同一名单。配置页尚未确认的编辑不覆盖上次选择。
- **资源包代际：** 打开任务画面与确认开始时都重读同一个 holder 的 `current()` 与摘要，绑定 holder 实例、generation 及完整内容身份。只从这一代包解析任务与所引用的两份 Asset，不从另一代补齐。缓存保存状态变化不重建运行；异步恢复/导入的迟到结果不能启动或改写当前任务。
- **替换与外壳释放：** `beforeReplace` 只通知包替换，不通知 `ResourceHolder.dispose()`（见其实际契约）。替换监听同步失效并释放任务所有者，返回菜单且显示原因；监听抛错不能用来否决 holder 替换，任务槽位须先锁存。外壳卸载、holder 更换与 Fast Refresh 必须由装配层显式保证任务消费者先于 holder 释放，不依赖 React 父子 effect 的偶然顺序或不存在的销毁通知。
- **StrictMode 与 Fast Refresh：** 旧所有者先失效并释放，确认可重建后新所有者从介绍占位开始；不恢复运行世界。页面/hook 刷新保留外壳的资源包和已确认选择，外壳刷新会丢弃内存包并回到菜单。所有者另有应用实例内递增的 ownerId；异步回调与反馈按 ownerId、runId 隔离，不能把新所有者的 runId=1 当成旧运行。

### 开始资格

开始任务入口在以下条件同时满足时可用：

1. 资源持有者持有资源包，其全包判定为 `complete`（导入与缓存恢复时已经过 `validatePackage`，不另行重算）；
2. 任务载入诊断为 `loaded`；
3. 任务所有者未锁存。

不满足时入口禁用，并说明对应原因：没有资源包、资源包不完整（附不完整或缺失的组）、任务诊断为 `not-attempted` 或 `failed`（附类别、路径与原因），或此前的清理失败。缓存列表中可恢复、作业 finished、缓存 saved 都不能代替上述条件；完整包即使尚未保存或保存失败，仍可开始。入口资格只证明可以进入配置，`loadMission` 的 loaded 不证明 `createWorld` 的语义校验已通过，后者在确认开始时执行。错误只显示结构信息，入口与任务画面明确区分“正式运行骨架”与“完整可玩切片”。

### 任务开始配置

本页是 G-04（原版简报、僚机档案与选择页）与 G-07（原版菜单与战役设置）的项目替代，在页面中以 G ID 标注。

- **任务：** 显示所选任务的组与槽位（来自导入内容）与固定难度 19（G-07：项目不提供难度调整）。
- **目标与限制：** 保留必需的玩法说明，以项目文字概述[成功条件及结算等待](../../../original/formats/executable.md#mission-result-success-path-and-campaign-restart-p3-0104)与[战役救援/失败的适用阶段](../../../original/formats/executable.md#mission-failure-player-loss-and-rescue-p3-0105)，不抄原版简报。不能简化成“最后一架敌机死亡立即胜利”或“任何阶段第三次损失都失败”。注明代码证据已确认、正常玩法可达性仍按 [B-003](../../../original/behavior/B-003-campaign-flow.md) / [B-005](../../../original/behavior/B-005-campaign-rescue.md)的置信度，并明确本构建尚未实现这些规则。文字集中一处，代码及 `slice-gaps.md` 链接权威来源；P3-11 接入规则时复核说明，不由此页判定胜负。
- **僚机：** 从 [MissionSetup](../../../../src/core/mission/load-mission.ts) 的 `wingmanOptions` 取得索引与 `nameCandidates`，5 项按名单次序展示，另有“无僚机”。选项值为 Core 接受的索引，不按显示名字匹配；名字只按纯文本渲染，不作为 HTML 或诊断回显。无候选名时显示明确的项目编号标签，多候选时呈现候选列表，不在 UI 中提前执行 Core 的随机名称分配。不显示原版档案文字与头像（G-04）。
- **开始：** 以本页的选择、难度 19、新的 uint32 种子与资源包的三份逻辑 Asset 和 `ContentIdentity` 创建世界。创建失败（`ContentContractError` 或 `CoreInputError`）时不开始，留在本页显示类别、路径与原因，可以更改选择后重试或返回菜单。创建成功后立即进入出发占位。
- **原子开始与端口错误：** 按当前代际同步校验、抽取种子并创建唯一世界；重复点击或迟到回调不能再创建。种子来源为平台 `crypto.getRandomValues`，返回 uint32；异常或非法值明确报开始失败，不回退为固定种子或宿主时间。会话宿主、消费者或离页监听登记失败时回滚已取得资源；回滚成功可重试，失败则锁存。不得只捕获两种内容错误而遗漏装配失败。
- **用户激活与焦点：** 开始/继续动作给后续音频或锁定适配器一个直接来自可信点击的调用时机，不能把需要激活的请求延后到 effect、Promise 或占位定时器；平台是否准许仍由各责任任务验证，本任务不承诺同步计算之后激活必然存在。进入配置或飞行壳时焦点落在标题，原生控件具备标签、Tab 顺序与可见焦点，错误通过 alert 呈现；不会把上一页的 Enter/Space 尾事件投给新页的开始按钮。例外（2026-10-10 修订，见[审批](#审批)）：出发占位结束进入飞行时，以及从任务菜单 Continue 成功恢复后，焦点移到 P3-05 的游戏输入区（[P3-05 输入区与焦点](../05/spec.md#输入区与焦点)）；只在页面可见、窗口有焦点且用户未主动把焦点移到另一控件时执行，隐藏期间完成衔接不抢焦点，也不自动恢复游戏；页面挂载时仍落在标题。

### 衔接占位

G-02/1 与 G-02/2 是本任务负责的两个 Smacker 过场实例（[P3-01/08](../01/subtasks/08-transition-media.md#完成证据)）。

| 实例 | 原版媒体 | 时机 | 由运行配置决定的部分 |
|---|---|---|---|
| G-02/1 第一关介绍 | `C-INTALL` | 每次开始与重开，开始配置之前 | 无 |
| G-02/2 出发 | 未选僚机为 `FLYFROM`，选了僚机为 `WFLYFROM` | 开始配置确认、世界创建之后，飞行之前 | 变体按本次运行配置的僚机选择（Core projection 的 `mission.wingman`） |

- **呈现：** 标注缺少的过场功能、项目占位与 G ID，不展示原版画面或文字。占位画面打开时焦点移到跳过按钮；标注在开始配置与任务壳的缺省说明中仍可阅读，不宣称 3 秒适合所有阅读速度。
- **结束：** 在环境可见且无 pagehide 阻断时累计 3,000 ms，自然结束；按钮及本占位范围内的 Enter、Space、Esc 可以提前结束。它是项目呈现时长，不是原版时长或测量容差。只接受新的按下，不接受 repeat；原生按钮激活与按键处理不得重复触发。介绍进入配置，出发释放初始保持；旧页面的 keyup、旧计时器和旧所有者回调不能触发下一页面。
- **计时：** 只有所有者持有一个可取消的单次计时器，不开模拟或渲染循环；以单调时钟核对实际经过的可见时间，提前回调不能提前完成。hidden/pagehide 时保留剩余时长并撤销计时器，visible/pageshow 后继续剩余可见时长。计时器登记、取消或时钟失败必须显示并报告，取消失败锁存，不能偷偷跳过占位或启动运行。
- **时间与隐藏保护：** 接纳 [P3-02 技术决定 2](../02/spec.md#技术决定)，出发占位保持 tick 0，结束不补计时间。只省去媒体用时，不声称与开启原版过场时的生成原点相同；差异写入 G-02 并链接 Core 的[已知差异](../../../engineering/modules/core.md#已知差异)。出发期间发生 hidden/pagehide，或运行在隐藏状态创建时，锁存 `resumeRequired`；之后即使已经 visible，计时结束或跳过也只进入 paused（hidden），必须再显式继续，不能因自动倒计时绕过隐藏保护。
- **本任务的保持接口：** 只支持创建时的 G-02/2，形状为 `{ gap: 'G-02/2', variant: 'solo' | 'wingman' }`，变体与有效运行配置一致。保持期间禁止游戏输入；所有者以绑定当前 ownerId、runId 的完成凭证结束一次。释放或重开使凭证失效，重复完成不重启模拟。介绍没有世界，只属于应用页面流程。
- **下游衔接边界：** 当前 Core 没有运行中媒体请求或播放完成动作。P3-10/P3-11 须先按 [P3-02 扩展规则](../02/spec.md#扩展规则)确定规则状态、输出、继续条件及 replay 语义，再共同修订本 spec 的运行中衔接。这里不提供“每 tick 调外部检测器”的生产 API，不猜测停靠/救援应该在 tick 中间还是之后暂停，不以完成占位直接写 Core 状态。下游可复用占位显示与计时，而非尚未存在的规则闭环。

### 运行中衔接（P3-10 的修订）

本节由 P3-10 的子任务 08 加入（2026-10-14），定稿 [P3-10 spec 的运行中衔接](../10/spec.md#运行中衔接)，是 P3-10 关卡 D-01 中属于本 spec 的部分；Core 的输出见 [P3-02 的 CB-10、CB-13](../02/spec.md#p3-10-的契约修订d-01)。它只覆盖入港 G-02/3 与离港 G-02/4；P3-11 可复用这些设施，但其救援与终态的衔接须在自己的契约中核实，不由本节预先批准。前文（包括[会话](#会话)表中“`transition` 只用于初始出发”与[衔接占位](#衔接占位)的“下游衔接边界”）与本节不一致时以本节为准。

- **Core 的输出：** 成功的停靠与每次离港在请求处理中发出 `transition` 事件 `{ type, tick, gap: 'G-02/3' | 'G-02/4' }`（P3-02 CB-13），每 tick 至多 2 个（CB-16），按发出次序。Core 不保存宿主等待状态，也不接受“占位结束”命令；停靠倒计时、无线电与服务照常按规则时间推进，跳过不能跳过它们。接纳 P3-02 技术决定 2：只省略媒体用时。
- **Runtime 的帧屏障：**
  - `frame()` 在每次成功 step 之后检查该 tick 的事件；含 `transition` 时，这个 tick 是本帧的最后一个，不再 step，余下的宿主时间丢弃（保持结束时重锚，不补跑）。该 tick 的读模型照常缓存。
  - `FrameReport` 增加 `cut: 'transition' | null` 与 `transitions: readonly { gap: 'G-02/3' | 'G-02/4'; tick: number }[]`：本帧因衔接提前结束时 `cut` 为 `'transition'`，`transitions` 按事件次序列出该 tick 的全部 `transition` 事件（冻结的副本，由 Runtime 在 step 返回后直接从该 tick 的事件中取出，不经 Event Bus 订阅，监听器失败不影响它）；否则 `cut` 为 null、`transitions` 为空。`ticks` 为实际执行数，截断时 `capped` 为 false。它与 `stop: 'recording-capacity'` 不同：前者执行到衔接 tick 为止且运行仍健康，后者是录制容量拒绝了下一个 tick。
  - 截断后、帧后派发之前先立起屏障：之后的 `setIntent` 与 `submitCommand`（包括帧后监听器的调用）以 `GameRuntimeError` 的新类别 `transition-hold` 拒绝，不改变意图、队列或 ID；`frame()` 同样拒绝。然后按原有规则派发本帧所有 tick 的事件与 `{ commandId }`，已执行命令的结果照常送达。屏障只由会话在通知边界之外调用新的生命周期操作 `releaseTransitionBarrier()` 解除；监听器不能重入 `clearIntent`、`resetClock` 或该操作（`reentrant-call`）。
  - 同一帧中较早的 tick 故障时没有衔接；衔接 tick 之后不再 step，所以截断与录制容量停止不会出现在同一帧。
- **会话的保持：**
  - 帧消费者收到带 `cut` 的帧报告之后，会话在通知边界的安全点进入 `transition`（若同一通知中已排有 exit，或运行已故障，则按既有优先级处理，不进入保持）。进入时依次：`clearIntent()`，把返回的未执行 ID 经 `onCommandsCancelled` 以 `transition` 原因通知一次；折叠两帧 Render State（previous = current、alpha = 0）；发布 `report = null` 的静止帧与状态。保持期间没有 step、没有游戏输入、没有游戏 rAF。
  - 状态的 `transition` 字段改为 `SessionTransition | null`：

    ```ts
    type SessionTransition = DepartureTransition | RunningTransition;   // DepartureTransition 为既有的 { gap: 'G-02/2', variant }
    interface RunningTransition {
      gap: 'G-02/3' | 'G-02/4';
      transitionId: number;   // 会话控制器内单调递增，从 1 起，跨运行不复用；不进入 Core、录制或 replay
      tick: number;           // 产生它的 Core tick
      index: number;          // 在同一 tick 的序列中的序号，从 0 起
      count: number;          // 该序列的长度，1 或 2
    }
    ```

  - **有限序列：** 帧报告的 `transitions` 按次序组成一个序列，逐项保持，每项有自己的 `transitionId`。全部结束之前不恢复模拟。一个 tick 多于 2 个是违反 Core 契约，会话以故障结束，不截断。
  - **完成：** 控制 `{ type: 'complete-transition', runId, transitionId }` 只在 `transition` 阶段、对当前运行的当前项生效一次；其他情形以 `invalid-state` 拒绝，不影响当前项。完成后转到下一项（新的 `transitionId`）；最后一项完成后：`releaseTransitionBarrier()`、`resetClock()`，页面可见且没有 `resumeRequired` 时为 running，否则为 paused（hidden）。不补跑。初始出发仍用既有的 `complete-departure`。
  - **竞态：** 保持期间 hidden/pagehide 锁存 `resumeRequired`，之后即使已经 visible 且占位自然结束，也只进入 paused（hidden），须显式继续；用户暂停与任务菜单在保持期间不可用（同初始出发）。exit、dispose 与新运行使整个序列失效，旧凭证、旧计时器与重复 skip 都不能结束下一项或下一次运行的占位。故障按既有锁存优先：故障后不继续播放占位、也不重启模拟。保持结束后呈现 Core 的最终状态（基地页或飞行），不强制切换到与它矛盾的页面。
- **任务所有者与界面：** 所有者为每一项显示可跳过的占位，沿用[衔接占位](#衔接占位)的页面、3,000 ms 可见时长与按钮/新的 Enter、Space、Esc 提前结束，以 `data-gap` 区分 G-02/3 与 G-02/4；计时器与完成请求绑定 ownerId、runId 与 transitionId。可见且用户未主动移焦时，最后一项结束后焦点回到游戏输入区；隐藏时不抢焦点。UI 桥接立即发布保持的进入、换项与结束。
- **replay：** 录制只含 tick 输入；保持、`transitionId` 与取消的命令都不进入录制，所以 replay 与占位显示多久、是否跳过无关。
- **不做：** 不在 tick 中间暂停；完成占位不写 Core 状态；不提供外部每 tick 检测器。
- **验证：** 由 P3-10 的子任务 21 按 [P3-10 的 AC-13](../10/spec.md#验收标准) 以 Runtime、Session 与所有者的故障与竞态矩阵验证，23 在浏览器中验证；本 spec 的既有验收与历史证据不改写。

### 帧后逐 tick 输出（P3-12 的修订）

本节由 P3-12 的子任务 09 加入（2026-10-16），定稿 [P3-12 spec 的共享契约修订（D-01）](../12/spec.md#共享契约修订d-01)中“帧后批次”一行，是 P3-12 关卡 D-01 中属于本 spec 的部分；Core 的事实见 [P3-02 的 P3-12 契约修订](../02/spec.md#p3-12-的契约修订d-01)。前文（包括[运行中衔接](#运行中衔接p3-10-的修订)）与本节不一致时以本节为准。

**批准状态：** 用户于 2026-10-17 明确批准（见[审批](#审批)）。

- **目的：** 表现模块必须按 tick 推进（P3-12 技术决定 1），而一帧可以推进 0 至 5 个 tick。Runtime 已在每个成功 step 后提取该 tick 的 Render State，并在帧后派发全部事件；本修订只把这些已有结果按 tick 分组随帧报告交出，不改变插值所用的两份 Render State（[总计划 §5](../../master-plan.md#5-状态管理与通信约定)），也不增加 tick 中途的回调。
- **形状：**

  ```ts
  interface TickEvent {
    readonly event: DomainEvent;          // 与 Event Bus 派发的是同一个冻结对象
    readonly commandId: number | null;    // 与派发时的 { commandId } 相同
  }
  interface TickOutput {
    readonly tick: number;                // === render.tick
    readonly clock: number;               // === render.clock
    readonly render: RenderState;         // 该 tick 提取的 Render State（同一对象）
    readonly events: readonly TickEvent[]; // 该 tick 的全部事件，按发出次序
  }
  interface FrameReport {
    // 既有：ticks、capped、stop、cut、transitions
    readonly outputs: readonly TickOutput[]; // outputs.length === ticks
  }
  ```

  `outputs` 按 tick 升序且连续；`ticks` > 0 时最后一项的 `render` 就是帧后 `renderFrame().current`。全部深度冻结；事件对象不复制。
- **交付：** 次序保持“全部模拟 → Domain Event Bus → 帧消费者”。会话帧 `GameSessionFrame.report` 原样带出 `outputs`；静止帧（进入暂停、保持或停止时）的 `report` 为 null，表示没有 tick。`outputs` 中的事件不再派发到 Event Bus，同一事件不会因两条通道被处理两次：需要逐 tick 推进的消费者（P3-12 的表现模块）只读 `outputs`，不同时订阅同一事件来推进。
- **故障矩阵：**

  | 情形 | `outputs` |
  |---|---|
  | 0 tick 帧 | 空数组 |
  | n 个成功 tick（含 `capped`） | n 项，至多 `MAX_TICKS_PER_FRAME`（5） |
  | 运行中衔接截断（`cut: 'transition'`） | 到衔接 tick 为止；之后的保持只有静止帧 |
  | 录制容量停止（`stop: 'recording-capacity'`） | 被拒 tick 之前的成功前缀；之后只有静止帧 |
  | step、projection 或 Render State 提取故障 | `frame()` 抛 `faulted`，没有帧报告，本帧的任何 tick 都不交付 |
  | Event Bus 监听器失败（`listener-failed`） | `frame()` 在整批派发之后抛错，会话按既有规则以 `consumer` 故障，帧消费者收不到本帧 |
  | 帧消费者自身抛错 | 既有的 `consumer` 故障；不重发本帧 |

- **消费者规则：** 逐 tick 推进的消费者在 `attachRun` 时绑定 owner 与 run，并从当时 `renderFrame().current.tick` 的下一个 tick 起要求连续：`runId` 不符、tick 缺失、倒退或重复都是契约错误，由消费者抛出并按既有政策成为 `consumer` 故障；静止帧与重复的帧通知不推进。P3 不支持在任意 tick 中途挂载后补算：表现模块须在 tick 0（出发保持或首帧之前）接线。
- **内存：** Runtime 只在下一次 `frame()` 开始之前持有本帧的 `outputs`，不保留历史；每帧至多 5 份 Render State 与 5 × `eventsPerTick` 个事件引用。读取帧报告的其他消费者（开发帧计时、UI 桥接）只复制所需的标量，不长期保存 `outputs`；开发帧计时保留的最近一份报告是有界的单帧。
- **不变：** `step()` 的返回、录制与 replay（录制只含 tick 输入）、会话状态、取消通知与控制都不变；没有每 tick 的外部钩子或检测器。
- **验证：** 由 P3-12 的子任务 11 以真实 Runtime 与会话（`ControlledHost`）的 Node 测试验证：0、1、5 tick 与 `capped`；与 `renderFrame()`、Event Bus 派发的同一对象与次序；衔接截断与录制容量停止的前缀；Core 故障与监听器失败不交付；暂停、保持与停止的静止帧；跨运行的 `runId`。P3-12 的子任务 24 以改变帧分组的方式验证规则独立（P3-12 的 AC-17）。本 spec 的既有验收与历史证据不改写。

### Runtime

正式 Runtime 每个运行一份，由会话创建与持有。复用 [P1-04](../../p1/04/spec.md) 的时钟、帧后总线与生命周期机制；正式输入、输出和故障语义以下文及 P3-02 为准，不整体继承合成格式。

- **创建：** 由运行规格创建：三份逻辑 Asset、内容身份、运行配置（难度、僚机、种子；步长使用 Core 默认值），以及可选的录制（开发构建）。有录制时用 `createRecordingSession`，否则用 `createWorld`。Core 的创建错误原样交给调用者，不创建 Runtime。
- **时间推进：** 本任务 Runtime 只接受 Core 的默认步长（含合成运行），名义频率由有效单位数推出（64 ÷ 2 = 32 Hz），不另设独立 tickRate。Core 的非默认步长校准仍在其纯测试中，不受影响。宿主时间戳为单调不减的毫秒，首帧只锚定；每帧至多 5 tick，超出部分丢弃，该帧 alpha=0，其余 alpha 为 [0,1) 内的小数进度。宿主时间不进入 Core。
- **连续意图：** `{ axes: { pitch, yaw, roll }, primaryFire }`。轴值按 Core 的规则校验（[−1, 1] 内的有限数，−0 记为 0），`primaryFire` 为布尔值。意图在帧之间保持，直到下一次设置或被清除；轴值原样进入之后每个 tick 的 `TickInput.axes`。
- **按住开火：** 每个 tick 组批时，若 `primaryFire` 为真，或自上一次成功 step 以来曾由假变真，就加入一个 `{ type: 'fire', channel: 'primary' }`；成功 step 后清除短按标记。因此按住期间每 tick 一个，两 tick 间按下又松开保留一个，多次短按也只算一个。不读取 OS 自动重复。这只覆盖主炮电平；单次请求（例如导弹）为普通命令。P3-05 把已确认的主炮绑定映射到 `primaryFire`。
- **命令队列：** `submitCommand(command)` 复用公开 `readTickInput` 的单命令输入校验，存入其规范副本，不导入内部 `readCommand`。待执行队列上限 256，满时以固定原因 `command-queue-full` 同步拒绝；结构错误或满队列不改队列、意图或 ID，不把合法旧命令丢掉。commandId 从 1 单调递增，只签发至 `Number.MAX_SAFE_INTEGER - 1`，耗尽为不可恢复故障。外部原对象变更不影响已提交输入。
- **每 tick 批次：** 先放按住开火产生的命令（如有），再按 FIFO 取队列命令，合计不超过 `CORE_LIMITS.commandsPerTick`（64）；余项进入后续 tick，不能让新命令越过旧命令。0 tick 帧不消费队列或短按标记；成功 step 才确认消耗。按住开火与明确提交的 `fire` 不合并，后者保留自己的 ID。实际批次就是录制输入；事件关联须按每个 tick 的批次查 `commandIndex`，不能共用整帧的一张索引表。
- **帧后事件：** 本帧模拟结束后按 tick、发出次序分发冻结的事件与 `{ commandId }`。只有已提交命令的 `command-result` 带对应 ID；自动开火的结果与非命令事件均为 null，不能把 `object-instantiated` 当成命令结果。接收者批次固定、新订阅下一批生效、取消立即生效；监听器只能同步执行。监听器提交的命令与意图最早在下一次帧调用的 tick 生效。监听器抛错仍尝试本批其余接收者，报告 `listener-failed`，不回滚或重放已经提交的 tick。
- **读模型：** 创建时读取初始 projection/Render State。每个成功 step 后完整取得同 tick 的 projection 与 Render State，全部成功才一起更新缓存（总计划要求每 tick 提取）；两帧 Render State 是这一运行的最近两份，`projection()` 返回最新缓存，两次提交之间对象身份不变。任一读取失败不能拼出不同 tick 的组合。暂停、出发保持、停止或故障时折叠为最后一组完整缓存（previous=current、alpha=0），继续的首个 0 tick 帧仍呈现这一组，不回退。缓存可能早于故障点，须标为“最后完整读模型”，不伪称故障世界的当前状态。
- **生命周期操作：** 重新锚定、清除意图并返回 FIFO 未执行 ID、折叠两帧、清除订阅，仍只由会话在通知边界之外调用，不改 Core、RNG、实体 ID 或录制。P3-05 通过会话的清输入控制处理失焦和退出 Pointer Lock，不拿到这些内部入口。
- **录制：** 开发构建默认从 tick 0 录制，间隔 32；`producer` 为应用名、包版本与构建模式的 1–128 码元标识，与间隔一起传给 `RecordingOptions`。生产装配不启用录制。保留 Core 的格式及规则版本，不记录宿主时间、暂停、保持、运行 ID 或取消命令。录制时长受 tick、总命令、总事件等共同预算约束，131,072 tick 只是约 68 分钟的 tick 上限，不保证能录满此时长。

#### 失败帧与录制容量

| 情形 | 状态与输出 | 命令与恢复 |
|---|---|---|
| 调用者提交非法意图/命令，或队列已满 | 同步参数/容量错误，运行保持健康 | 不分配 ID，不改变已接受意图 |
| 宿主时间非法/倒退，或调度 request/read/cancel 失败 | 会话 scheduler 故障；cancel 失败另锁存清理失败 | 停止调度；不伪造成功帧 |
| step、projection、renderState、snapshot 或录制检查点发生 `CoreFaultError` | Core 已锁存；Runtime/Session faulted；本帧未投递事件全部不投递，无成功帧通知 | 当前抛错 step 的批次可能已部分执行，标为 unconfirmed，不能报取消或自动重试；确认尚未调用 step 的队列才以 failure 取消 |
| Runtime 内部异常或非录制容量的 step `CoreInputError` | faulted，保留原因；后者也可能是 tick/时钟/ID 溢出，不一概称为组批错误 | 已成功 step 不回滚。可证明 step 前拒绝的批次仍未执行；已执行但未收到结果的 ID 为 unconfirmed |
| 某次 step 以 `CoreInputError` 且 path 恰为 `recording` 拒绝 | 容量停止，不是 Core 故障；只拒绝该 tick，本帧此前成功 tick 保留 | 分发此前成功 tick 的事件，报告实际 tick 数及 `stop:'recording-capacity'`，然后取消所有未执行队列并清意图；不再请求帧 |
| 帧后域事件/帧消费者失败 | 已提交的世界和录制不回滚；本批独立接收者照常尝试，会话随后 faulted | 已反馈结果不重发；未终结 ID 依是否确定未执行区分 cancelled/unconfirmed |

`snapshot()` 是按需 Core 读取，不是故障后缓存：故障时只允许读已缓存的 projection/render，不能向已锁存 Core 请求新快照。正式会话选择在任何 faulted 状态禁用新的快照和录制导出（即使只是消费者故障），以免导出被误认作正常结束；已经取得的冻结副本仍有效。容量停止可以正常导出完整的成功前缀。开发读取/导出若首次发现 Core 故障也必须停止运行并报告，不能只在面板显示错误而让循环继续。文件保存失败不是 Core 故障，见[开发诊断](#开发诊断)。

### 会话

正式 Session 复用 [P1-05](../../p1/05/spec.md) 的唯一请求凭证、runId、通知边界、幂等清理与错误聚合；下表和后文覆盖有差异的状态、输入与故障语义，不继承合成 Core 的可读性保证。

| 方面 | P1-05 | 正式 Session |
|---|---|---|
| 运行配置 | 创建控制器时固定；`restart` 以相同配置新建 | idle 时 `start` 带新规格，校验并复制后创建唯一运行；非 idle 的 start 明确拒绝，不默默忽略新配置。不提供 restart，重开使用 exit → 配置 → start |
| 状态 | `idle`、`running`、`paused`、`faulted`、`disposed` | 增加 `transition`（只用于初始出发）与 `stopped`（`recording-capacity`，不是任务失败）。新增结果或运行中媒体状态须另行修订 |
| 新运行 | 可见时 running，否则 paused（hidden） | 规格要求初始衔接时进入 `transition`，否则同 P1-05 |
| 输入 | `setInput` 与合成命令 | `setIntent` 与 Core 命令，只在 running 时可用；其他状态明确拒绝，不分配 commandId |
| 取消原因 | user-pause、hidden、restart、exit、dispose、failure | user-pause、hidden、transition、focus-loss、pointer-lock-exit、recording-capacity、exit、dispose、failure；重开以 exit 收尾 |

- **衔接保持（`transition`）：** 只在 start 的规格要求初始出发时进入，无帧请求、tick 为 0、意图为空、读模型折叠；允许接线运行消费者。pause/resume 均拒绝。`complete-departure` 需匹配当前运行，成功一次后凭证失效；环境可见且 `resumeRequired` 为 false 才进入 running，否则进入 paused（hidden）。新帧只锚定；重复或过期完成不能推进/重建，所有者忽略已消费的回调，非法直接控制明确拒绝。
- **停止（`stopped`）：** 容量已判定不足时立即禁止新意图/命令（含帧后监听器提交），但仍完成本帧此前成功 tick 的反馈和带 stop 的报告。随后清意图/取消余项、折叠读模型、发静止帧与状态，停止调度。保留录制与运行级资源以便读取/导出，直到 exit/dispose 收尾；不再发正常帧，pause/resume/start 拒绝。若投递时又发生消费者错误，故障优先，不能继续以可导出的 stopped 掩盖错误。
- **暂停原因：** user（含任务菜单）与 hidden，语义同 P1-05：隐藏或离页自动暂停并清除意图；页面恢复可见后仍保持暂停，必须显式继续；继续后首个回调只锚定，不补跑暂停时长。
- **环境与保持标记：** environmentVisible 只有在 visible 且无 pagehide 阻断时为 true；pageshow 后仍按实际 visibility 判定。resumeRequired 只锁存初始保持期间的隐藏要求，成功显式 resume 或结束运行后清除；visible 自身不清除。其他 phase 的暂停原因按上述规则，不借该标记恢复已结束的出发流程。
- **唯一循环与帧：** 一个控制器至多持有一个有效帧请求，句柄 0 合法；每个有效回调在调用 Runtime 前核对真实可见性与 pagehide 阻断。0 tick 帧也通知；取消后的迟到/重复回调不能推进、通知或续排。暂停、保持、停止没有持续 rAF；物理取消失败须报告并锁存，逻辑凭证立即失效。暂停/保持/停止的静止帧 `report=null`，实际帧报告包含 `ticks`、`capped` 和明确的 `stop`，不把容量停止当作成功的 0 tick 帧。Core 的地图、通讯、基地、Warp 或结果延时本身不触发 Runtime 暂停。
- **控制通道：** 暂停、继续、退出与结束衔接都走会话控制，不进入 Core 命令队列。会话不读取 Core 状态来决定是否接受暂停；原版在不轮询按键的阶段（例如被毁序列）`p` 不生效；P3-05 决定项目的 `p` 作为宿主控制在这些阶段仍有效，列为已知差异（[P3-05 会话控制键](../05/spec.md#会话控制键)）。
- **失焦清输入：** 当前 running 的输入适配器可调用 `clear-input`，原因只允许 focus-loss 或 pointer-lock-exit；清除轴、主炮电平、短按标记与未执行命令，逐 ID 通知取消，但不暂停、不重锚时钟、不改已由 Core 接受的持续动作。暂停/隐藏/结束时会话自行清理；P3-05 在状态通知中只清本地按住表，不递归调用控制。恢复必须新的按下，不能由 repeat 或聚焦自动恢复旧意图。
- **通知边界与控制：** 域事件 → 帧消费者 → 边界内排队控制 FIFO → 状态/错误，保留 P1-05 的非递归规则；状态观察允许为新运行接线，取消/错误/清理回调只读或撤销。帧中提出 exit/pause/clear-input 不能半途清理正在投递的批次；排队的非法控制单独报 control 错误，不终止健康运行。故障与排队 exit 同时存在时仍须处理退出，不以错误掩盖清理。
- **句柄与收尾：** `currentRun()` 在 transition/running/paused/stopped/faulted 有值，idle/disposed 为 null；旧句柄退役后读写/新订阅一律拒绝，已有撤销句柄幂等。exit 可结束任何有运行状态，idle exit 幂等；dispose 最终 disposed、重复幂等。faulted 不 resume，恢复只能在 exit 清理成功后重新 start；cleanupFailed 在应用实例中不清零，不能以新控制器绕过。无世界的 start 失败保持 idle；已有世界但接线/调度失败进入 faulted，绝不报告已开始。

### 任务菜单、暂停与退出

- **暂停与继续：** 任务画面提供暂停与继续控件，调用会话的 pause 与 resume；不能继续（页面隐藏或离页）时继续控件禁用并说明原因。暂停状态显示在游戏画面区域之外的项目状态栏中；原版暂停时游戏画面本身有无标识及其绘制归 P3-13。
- **任务菜单（G-07）：** 只在 running/paused 打开，先确认暂停成功再进入菜单；已经暂停时保留原因。继续必须经所有者统一关闭菜单并成功 resume，失败留在菜单显示原因；不得让单独的快捷键控制在菜单仍显示时恢复模拟。intro/config/transition/faulted/stopped 不开放任务菜单。菜单为替代画面而非未定义的模态层，进入聚焦标题，原生控件可操作；`p`/Esc 由 P3-05 的输入消费者经[输入控制端口](#消费者接线与释放)调用同一所有者动作，不旁路其状态。
- **退出：** 返回主菜单与重开都先以 exit 结束运行（未执行命令以 `exit` 取消）、释放运行级消费者，再继续流程。
- **故障：** 运行故障时显示原因（错误类别与固定的检测位置等，不含导入内容）；没有清理失败时可以重开，否则只能返回菜单并锁存。

### 消费者接线与释放

- **两级所有权：** 运行级消费者（帧消费者、事件订阅、HUD 读取、音效触发等）在每个运行开始时接线，随该运行结束（exit、故障、dispose）按注册逆序释放，不迁移到下一个运行。所有者级资源（飞行画面的表面、音频上下文、输入源、离页保护、开发诊断）属于任务所有者，跨运行保留，在所有者释放时释放。
- **所有者释放顺序：** 先使输入失效并撤销输入源，再释放会话（取消帧请求、结束运行及其消费者），再解绑 UI 桥接与开发诊断，再撤销离页保护，最后释放画面与音频等所有者级资源。每一项都尝试，失败汇总为一个错误；任何清理失败都锁存（见[应用流程](#应用流程)）。
- **部分取得与异步关闭：** 沿用 `ownCleanup` 的同步、逆序、至多尝试一次语义；订阅/端口创建半途失败时撤销已取得项，回滚失败保留 `RollbackError` 和全部独立原因。所有者先失效占位回调并撤销计时器，再执行上述释放。后续接入音频时，Promise 不能塞进同步 disposer 冒充完成；按[查看器所有者](../../../engineering/modules/app.md#查看器所有者)的关闭屏障，在真实关闭确认前禁止再次创建同类资源，关闭失败锁存。本任务不提前创建音频或空媒体适配器。
- **接入点：** P3-05、P3-12 至 P3-14 通过任务所有者登记自己的所有者级资源与运行级消费者，不自建会话、帧循环或第二个运行。消费者只使用公开的运行句柄、只读数据与下文限定的输入控制端口，不调用内部的 frame 或 step。
- **输入控制端口（2026-10-10 修订，供 P3-05）：** 所有者只向 `input` 阶段的消费者提供绑定当前 owner/run 的 `clearInput(reason: 'focus-loss' | 'pointer-lock-exit')`、`togglePause()`、`openMenu()`。`clearInput` 在 running 时发出一次 `clear-input`；`togglePause` 在 running 时以 user 暂停，在因 user 或 hidden 暂停且任务菜单未打开时继续（hidden 未解除时继续失败仍保持暂停），任务菜单打开、出发占位、停止或故障时无作用；`openMenu` 沿用所有者现有的打开条件与反馈。三者均沿用所有者现有的反馈与会话通知边界：`togglePause`、`openMenu` 复用相应的所有者动作，`clearInput` 由所有者在守卫下发出会话的 `clear-input` 控制；不暴露 start/exit/step，不旁路任务菜单状态；状态通知中不可递归调用；旧 owner/run 以 `GameSessionError` 的 `invalid-state` 拒绝，不迁移到新运行；所有者释放（`input` 阶段最先失效）后端口失效。
- **本任务的验证：** 以 Node 中的测试消费者验证两级登记、释放顺序、释放失败锁存与跨运行不迁移；浏览器中验证本任务实际接入的消费者（UI 桥接、开发诊断、离页保护、占位计时器、会话宿主）。

### 离页保护

- 任务所有者在拥有运行时登记一份 `beforeunload`：transition/running/paused，以及仍保有诊断或录制的 stopped/faulted；exit/dispose 才撤销。介绍、配置、主菜单没有运行，不登记。登记失败阻止开始并回滚，撤销失败锁存。会话仍只提供 DOM-free 状态，适配器在 `platform/browser/`，不在 Core 或模块导入时安装监听。
- 处理器请求浏览器原生确认，不定制原生提示文字，也不在处理器里退出、清世界、删除记录或自动导出。用户取消离页后保留同一运行；若宿主同时发生 hidden/pagehide，则仍遵守显式继续规则。应用内返回/重开使用自己的 exit，不靠原生离页确认收尾。
- 浏览器可能要求 sticky activation，或在系统终止等路径不提供对话框；只对本机 Chrome 的真实导航/关闭路径取得证据，不保证所有浏览器、系统快捷键或 BFCache。pagehide 建立阻断、pageshow 只解除环境阻断，不恢复快照或自动开始。Alt+F4 风险提示和实机输入仍归 P3-05/P3-15。

### UI 桥接与命令反馈

- **store：** Zustand vanilla store，React 只拿到只读 reader；状态冻结，每次转换单次原子写入。内容：会话状态、projection 的采样、任务流程位置、待确认命令与最近结果、操作错误。
- **采样：** 常规 projection 在既有帧通知中按 100 ms 采样，以 ownerId/runId/tick 去重，不另开定时器。会话状态、新运行、暂停/保持/停止的静止边界立即发布；`mission.status`、`result` 的就绪/结果内容、`player.interactionContext`、分区 readiness 变化在本帧结束立即发布，不等采样窗口。比较语义字段而不是每 tick 都新建的对象引用；P3-09/P3-10 接入真实菜单/地图后补足其关键状态。注入时钟必须有限且不倒退，失败是 consumer 故障，不默认成 0 或沿用旧时间假装正常。
- **命令反馈：** 拿到 commandId 后才记 pending，按 ownerId/runId/commandId 匹配本消费者的 `command-result`。已接受、拒绝、忽略分别保留 outcome/reason；结果与帧末最新 projection 同次写入，不先乐观更新。取消按会话原因结算，故障中可能已执行的记 unconfirmed；未知、重复、其他消费者的 ID 或 null 不产生本消费者的结果，也不自动重提。保留最近 10 个已终结结果（沿用 P1-06），pending 由队列/帧批次预算约束，运行结束后清空；诊断事件日志不是 pending 表。
- **范围：** 桥接只给 React 页面使用。Classic 飞行 HUD 由渲染器每帧直接读取运行的 projection，不经 store（[总计划 §5](../../master-plan.md#5-状态管理与通信约定)）。

### 开发诊断

只在开发构建（Vite 开发服务器，含测试入口）的任务画面中出现；生产构建的界面与产物中都没有。诊断只经公开的运行句柄读取，或经正常命令队列提交命令，不是 Core 的写入口。

- **实体与任务状态：** 按需（点击刷新）读取快照，显示 tick、时钟、种子、setupHash、内容身份、任务状态、玩家状态、生成队列摘要与实体列表（ID、种类位、来源、位置、对象状态与活动、被毁标志、放置序号）。名称只显示引用，不解析为文字。
- **事件日志：** 订阅全部事件，保留最近 500 条的结构化字段与 commandId，超出丢最旧项并显示已截断；不保存整套快照历史。500 条、最近 120 帧是开发显示窗口，不是性能或玩法阈值。
- **帧耗时：** 开发装配在同一次有效 Session 帧处理的开始与结束读取单调毫秒时钟，窗口包含 Runtime 模拟/帧后事件和帧消费者，不含等待下一 rAF 的时间；只在帧监听器内读一次时间不能测量它之前的工作。每个完成样本给出 processingMs、实际 tick 数与 capped；显示最近 120 个样本的平均/最大 processingMs、tick 数统计、capped 帧数，按 UI 采样频率更新。不是 GPU 完成耗时或显示器帧率，不设性能通过阈值，不另开循环。
- **命令提交：** 可选择任一 Core 命令变体并填写其字段，经正常队列提交，结果显示在命令反馈中。用于在 P3-05 之前验证命令路径；尚无规则的命令得到 `not-implemented`。
- **录制导出：** 在通知边界之外同步取得同一个成功 tick 的 `Recording { record, result }`，随后保存紧凑 JSON；录制期间可以导出当前前缀，后续 tick 不改变该副本。文件名仅使用受校验的 setupHash、uint32 种子与 finalTick，不含原版名称。faulted 不提供新导出；stopped 仍可导出。Blob/对象 URL、临时下载元素由平台文件适配器拥有，失败、完成与所有者释放均按所有权回收；失败明确提示，不把浏览器接收下载请求说成已验证写盘成功。
- **保留与丢弃：** 只保留当前运行的内存录制；重开、返回和 HMR 不自动导出，也不保留旧运行。开发界面明确提示这些操作会丢弃未导出的录制，用户可先导出。导出/保存失败不丢弃当前记录，可以重试；若原因是 Core 故障则按 Runtime 故障处理。
- **生产边界：** 编译期隔离开发面板、日志、命令编辑器、测量接线和下载入口；运行所必需的 Core 快照/错误类型不等同“开发诊断代码”，不要求删除 Core 的公开 API。生产任务壳可以提供只读的 ownerId、runId、最新已采样 Core tick 属性供生命周期取证，但没有世界引用、实体清单或调试命令入口。

### replay 核对工具

`node tools/replay-check.ts <录制.json> <CloneCD 文件组>` 在 Node 中核对浏览器导出的录制：

1. 在读入/解析之前检查录制文件字节上限；以同一个句柄作有界读取，文件变化或超过上限也拒绝。上限由当前 `ReplayRecord`/`ReplayResult`、`CORE_LIMITS`、字段长度及 JSON 编码最坏开销推导并固化，覆盖本工具支持的紧凑导出；依据与精确数值写在工具说明中，不能先无界 `readFile`/`JSON.parse` 再检查；
2. 校验顶层恰为 `{ record, result }`；字段/数组预算及 expected 结果须在执行重放前经 Core 公开校验边界验证。按 [logic-check.ts](../../../../tools/logic-check.ts) 的 Node 输入方式运行生产导入作业，但保留全部组并调用 `validatePackage`，不照搬只检 logic 组的实现。按任务所引用的 Asset ID 解码三份逻辑数据，完整身份来自实际验证结果，不从录制自报的身份构造；
3. 以 `replayRecord` 在新世界重放，以 `compareReplayResults` 比较 expected 与实际；未知版本、身份或 setupHash 不符都拒绝，不改写记录、忽略差异或选择兼容规则；
4. 输出固定形状 JSON 报告；通过退出 0，核对失败退出 1，命令用法错误退出 2。提前失败尚未取得的字段用 null，不以 0 或虚构身份冒充结果。

报告只含校验后的身份、哈希、计数与比较，不含名称、坐标、原始事件、宿主路径或异常原文；错误码为封闭集合，至少区分 usage、read-failed、file-too-large、invalid-recording、content-failed、replay-failed、replay-mismatch、internal-error，location 为固定阶段/经约束的结构路径。所有失败都明确输出，意外异常归 internal-error 且非零，不伪造成不支持的原版数据。

CLI 始终使用生产来源白名单，不能接受合成光盘作为原版。Node 测试/E2E 下载核对调用同一工具的可导出核对函数，显式注入现有合成导入作业/来源配置；仍经过完整包校验、身份比较及真实 replay，不从记录选择白名单。CLI 另测用法、I/O、未知来源与输出/退出码，成功 CLI 路径由私有真实内容核对取得。测试配置不进入生产网页或 CLI 参数。

### 合成任务包

- **Node：** 在现有测试支持（[create-world.test-support.ts](../../../../src/core/world/create-world.test-support.ts)、[logic-content.test-support.ts](../../../../src/content/logic/logic-content.test-support.ts)）上组装能创建正式世界的合成任务（含僚机名单），供 Runtime、会话、任务流程与工具的测试使用。
- **开发浏览器：** 在 [synthetic-import.test-support.ts](../../../../src/workers/synthetic-import.test-support.ts) 新增定向任务场景，而不是改坏 P2 已有正常/失败样本的含义。测试入口经合成光盘导入，完整任务满足生产配置（任务 Asset、group 0/slot 1、难度 19、僚机 5 项）；另覆盖部分包、loadMission 失败、loadMission 成功而 createWorld 失败。测试可注入种子/时钟，但真实隐藏证据不能使用伪造可见性。
- **生产浏览器：** 不存在开发测试入口。复用 [seedProductionCache](../../../../e2e/support/production-cache.ts) 在测试自己的隔离 context 预置代码生成的任务包，再经真实菜单恢复、完整校验与启动；身份按该 helper 在 Node 重新派生。生产未知来源导入仍应拒绝，不能为了测试放宽来源白名单、CSP 或添加全局后门。生产的运行推进从只读 Core tick 属性与宿主探针观察，不依赖开发面板；实体明细和录制在开发侧核对。
- 合成内容由代码生成，不含原版内容；生产内容契约、切片定义与转换器版本不变。

### 合成演示退役

- **删除边界：** 退役的是 P1 mover/marker 演示及专用链：`core/synthetic/`、`app/runtime/synthetic-*`、`app/session/synthetic-session*`、演示 owner/槽位/hook、`ui/game/synthetic-*`、`SyntheticDevPanel`、`SyntheticDemoPage`、`SyntheticRenderView`、`render/synthetic/`。删除前须核对真实使用者，不按名字批量删除仍被正式 Core、内容、平台、工具或 E2E 使用的合成 fixture/helper；如 `ControlledHost` 被新会话测试复用则归入中性的会话测试支持。仅删除没有意义的 `core-synthetic-boundary` 规则，Core 纯度、模块边界、生产禁入 test-support 等规则和回归仍保留。
- **测试迁移：** 经合成演示验证通用验收面的 E2E 用例，改为经正式任务流程验证同一验收面：应用外壳与菜单焦点、启动、生命周期与真实页面隐藏、Fast Refresh、资源平衡、网络审计与生产 CSP、探针契约。只验证合成规则或合成画面的用例删除。其中共用 WebGL 表面设施的检查（设备像素比变化、上下文丢失、WebGL 不可用）若查看器用例尚未覆盖，迁到查看器；飞行画面的同类验收由 P3-12 建立。P2-11 的“页面不声称可以游玩或开始任务”检查改为：开始入口只在满足资格时可用，且页面不声称原版玩法已可玩。
- **文字：** 应用外壳的权利与隐私声明不再提合成演示，仍声明独立项目、非官方授权、原版内容只在本地读取与保存、不授予原版内容的任何权利；不新增法律保证。
- **文档与历史链接：** 当前工程文档更新为正式流程；历史任务、评审与 ADR 只修正失效链接目标及必要元数据，不重写批准、S/AC 或过去结论。退役记录保留原路径、删除前提交与替代模块，链接指向对应条目而非无法定位的目录概览。P1/P3-02 的“保留合成实现”是各自交付时的约束，本次退役须由本 spec 的 S-10 明确获批后才执行，不把历史契约改成早已删除。

### 缺省与标注

按 [P3-01 标注规则](../01/spec.md#标注规则)：界面可见、`slice-gaps.md` 记录、代码以 G ID 标识，同一 G 项的界面文字集中在一处。本任务实现以下各项；P3-01 的 G 清单之外不新增缺省、临时资源或近似规则。

| G | 本任务的呈现 |
|---|---|
| G-01 音乐 | 任务画面的状态栏与开始配置页注明本构建没有音乐 |
| G-02/1、G-02/2 | [衔接占位](#衔接占位) |
| G-04 | 开始配置页：替代原版简报、僚机档案与选择页，保留目标、限制与僚机选择 |
| G-06（重开与返回的流程） | 重开为新的任务实例、返回主菜单；注明不复刻原版战役重开所保留的状态。结果页归 P3-11 |
| G-07 | 主菜单的开始入口、开始配置页的固定难度与任务菜单：替代原版主菜单、选项与战役设置 |

`docs/engineering/slice-gaps.md` 若尚不存在由本任务新建，并加入[文档地图](../../../README.md)；它描述当前构建，按 G ID 记录每项的呈现方式与位置，不是任务状态表。

### 对照

- **R-13 控制子集（离散）：** 依据 [B-001](../../../original/behavior/B-001-strategic-map.md#打开与关闭已确认)及[时基记录](../../../original/formats/executable.md#simulation-time-base-p3-0106)，项目的暂停/菜单必须精确不执行 tick，继续首帧为 0 tick、不补计停顿，未发控制时不因显示上下文而停钟。Node 覆盖正常暂停、菜单、hidden/pagehide、重复通知和不同暂停长度；浏览器取得原生隐藏/显式继续证据。只记“Runtime 暂停控制子集通过”；真实地图门禁尚未实现，不能凭只读替身或不读模式代码声称完整 R-13 已对照。原版扣时残差按源记录披露，32 Hz/后台策略为项目选择，不在这里验证整帧原版等价或关闭 U-021。
- **L-01、L-02、L-10 的流程部分（离散）：** 对照 [B-003 出发](../../../original/behavior/B-003-campaign-flow.md#出发l-02)与[重开](../../../original/behavior/B-003-campaign-flow.md#重开任务p3-0104)的顺序/选择边界。本任务在出发占位前创建 tick 0 世界，这是为提前反馈失败的项目装配选择；只保证占位结束前不模拟，不宣称构建时机与原版相同。结果后重试、完整起飞运动与画面尚待各责任任务，不能在此记为完整闭环通过。
- 结论、新版候选与内容身份记入 subtask 证据，不写入 `docs/original/`。

### 文档影响

- [工程约定](../../../engineering/README.md)：以正式 Runtime、会话、UI 桥接、任务流程与开发诊断取代“合成 Runtime”“会话端口与错误”“UI 投影与指令反馈”“合成渲染”“页面流转与演示生命周期”等节中的合成内容；针对性检查命令同步。
- 模块分册 [app](../../../engineering/modules/app.md)、[ui](../../../engineering/modules/ui.md)、[platform](../../../engineering/modules/platform.md)、[render](../../../engineering/modules/render.md)、[core](../../../engineering/modules/core.md)（删除合成模块与 lint 规则的说明，交接中的 P3-04 一项改为指向已交付的接口）。
- [源码结构指南](../../../engineering/source-structure.md)：目录、职责表与退役记录。
- [键位文档](../../../engineering/keyboard-input.md)：当前构建没有游戏键绑定（原版键位由 P3-05 加入）；占位的跳过键属于项目界面的按键；保留平台键盘源的通用规则；§7 中的离页确认改为已实现。
- [本地导入指南](../../../guides/local-import.md)与[工具指南](../../../guides/tools.md)：开始任务的条件与流程，`tools/replay-check.ts` 的用法。
- `docs/engineering/slice-gaps.md` 与[文档地图](../../../README.md)。

## 数据模型与契约

以下 app 接口是计划新增，名称可在实现时调整，形状与语义不能自行扩大。现有类型的具体权威位置：输入/命令在 [tick-input.ts](../../../../src/core/contracts/tick-input.ts)，事件在 [domain-events.ts](../../../../src/core/contracts/domain-events.ts)，读模型在 [projection.ts](../../../../src/core/projections/projection.ts) / [render-state.ts](../../../../src/core/projections/render-state.ts)，快照在 [snapshot.ts](../../../../src/core/replay/snapshot.ts)，录制及其配置在 [recording.ts](../../../../src/core/replay/recording.ts)，运行配置在 [run-config.ts](../../../../src/core/world/run-config.ts)，内容身份在 [content-identity.ts](../../../../src/content/content-identity.ts)。本任务不复制或修改这些形状、规则版本或既有纯度边界。

| 数据/接口 | 形状、单位与约束 | 权威所有者 | 输入/输出边界 |
|---|---|---|---|
| 运行规格 | `CreateWorldInput` 所需的三份逻辑 Asset、identity、run；生产固定 19/default 步长；`recording: RecordingOptions \| null`（含 producer、checkpointInterval）；`initialTransition: DepartureTransition \| null` | app（任务所有者组装） | start 校验并复制，不接受既有 World、任意规则处理器或检测器；App 总是从同一已验证包取输入 |
| 身份与控制 | ownerId、runId、commandId 各为递增安全整数，不复用；控制为 start（带规格）、pause、resume、exit、dispose、complete-departure（带 runId）、clear-input（限定原因） | app/session；ownerId 属于应用槽位 | 类型封闭、额外字段拒绝；消费者拿不到 frame/step/publish/world |
| 运行句柄 | setIntent、submitCommand；事件/帧/取消订阅、ownCleanup；projection、renderFrame，以及开发诊断所用 snapshot/exportRecording | app/session | 绑定当前运行，受 phase 与通知边界守卫；具体故障读取规则见正文 |
| 连续意图 | `{ axes: { pitch, yaw, roll }, primaryFire: boolean }`，轴值规则同 Core | app/runtime | P3-05 设置；Runtime 转为每 tick 的 axes 与按住开火命令 |
| 输入控制端口（2026-10-10 修订） | 绑定 owner/run 的 `clearInput(reason: 'focus-loss' \| 'pointer-lock-exit')`、`togglePause()`、`openMenu()` | app/mission（任务所有者） | 只给 `input` 阶段消费者；语义见[消费者接线与释放](#消费者接线与释放)；旧身份以 `invalid-state` 拒绝 |
| 交付信息 | `{ commandId: number \| null }`；commandId 是本运行内从 1 起的正安全整数 | app/runtime | 帧后随每个事件分发 |
| `RenderFrame` | `{ previous: RenderState, current: RenderState, alpha }`，alpha ∈ [0, 1)，两份来自同一运行 | app/runtime | 渲染器只读 |
| 会话状态 | `{ phase, runId, environmentVisible, pauseReason, transition, resumeRequired, stopReason, cleanupFailed, error }`；phase 为 idle/transition/running/paused/stopped/faulted/disposed；pauseReason 为 user/hidden/null；transition 为 DepartureTransition/null；stopReason 为 recording-capacity/null | app/session | 冻结；字段随 phase 一致，idle/disposed 的 runId 为 null，只有 paused 有 pauseReason，只有 stopped 有 stopReason |
| 会话帧 | `{ runId, phase, render, projection, report }`；phase 为 running/paused/transition/stopped；report 为 `{ ticks, capped, stop: 'recording-capacity' \| null }` 或静止通知的 null | app/session | 冻结且同 tick；故障不发成功形状的帧；实际报告的 ticks 只计成功 step |
| 取消通知 | `{ runId, commandIds, reason }`；reason 为 user-pause/hidden/transition/focus-loss/pointer-lock-exit/recording-capacity/exit/dispose/failure | app/session | 冻结 FIFO ID，仅确定未执行者；不属于 Core 事件或 replay |
| `DepartureTransition` | `{ gap: 'G-02/2', variant: 'solo' \| 'wingman' }`，必须与有效 wingman 配置对应 | app | 只用于新运行初始保持；G-02/1 是无世界的页面，后续 G-02 不在此联合中 |
| 任务流程状态 | 流程位置（介绍、配置、出发、飞行、任务菜单、故障或停止）；保持的僚机选择；最近一次开始失败；当前运行身份 | app/mission | React 只读；输入为用户意图 |
| 页面流转 | 画面增加 `mission`，含进入次数与任务所有者的清理失败锁存；去掉 `demo` | app/flow | App 外壳 |
| 应用端口 | uint32 种子来源、SessionHost 工厂、单调毫秒时钟、单次计时器（登记返回非负安全整数句柄后异步回调；取消幂等）、离页保护、开发文件保存 | 需求方在 app 定义 DOM-free 端口，platform 实现，AppPorts 装配 | 初始注册失败回滚、非法返回/时钟倒退显式报错；无导入时副作用、无生产 URL/全局开关 |
| UI store | 会话状态、projection 采样、流程位置、待确认命令与结果、操作错误；冻结 | ui/game | React 经 selector 订阅 |
| 开发诊断 | 最近 500 个事件摘要；最近 120 个 `{ processingMs, ticks, capped }` 样本；一份按需快照；最近 10 个命令结果 | ui/dev、app 装配 | 只在开发接线，独立于 Core/RNG；新 run 清空；与 UI 同频发布，原始时间不进入 replay |
| 导出的录制文件 | Core `Recording` 的 JSON | Core 定义格式；app 保存 | `tools/replay-check.ts` 与 P3-15 读取 |
| replay 核对报告 | `{ format: 'osr-replay-check', version: 1, passed, error, identity, mission, setupHash, finalTick, events, checkpoints, comparison }`；error 为固定 code/location 或 null；identity 为内容身份键/null，mission 为已校验 AssetId/null，setupHash 为哈希/null，三个计数为非负安全整数/null，comparison 为 Core ReplayComparison/null | tools | 每条失败也输出同一形状；passed 仅在完整比较 match 时为 true，失败不输出原始输入或异常 |

### 持久化与兼容

- 不新增存档或设置持久化，不改变 IndexedDB schema/localStorage。资源仍经既有 holder/cache 导入、保存、恢复与重新校验；存储失败不能抹掉已在内存中的可用包。僚机选择、页面、运行和诊断只在内存中，刷新不恢复任务。
- 录制格式与版本由 Core 拥有，本任务不改变。导出文件是用户主动保存的本机文件，可能包含由导入内容派生的状态（例如位置），不自动上传；以真实内容导出的文件只存放在 `local/`，不提交。
- 合成演示退役不涉及用户数据或缓存。

## 技术决定

1. **退役合成演示，而不是与正式流程并存或泛型化。** 合成演示的用途是 P1 的验证；它的合成键位（方向键、N、X）在原版中另有含义或尚未确认，与原版键位并存会混淆，[键位文档](../../../engineering/keyboard-input.md#1-适用范围)与 P1 退出评审都预期它被替换。并存需要维护两套 Runtime 与 Session，或把二者泛型化到合成与正式两种世界之上，超出 P3 的需要。本任务本来就要在正式流程上建立生命周期与资源平衡的浏览器证据，迁移现有用例比并存两套更省。P1 的既有证据作为历史记录保留。
2. **复用 P1 的机制，不继承其合成语义。** 调度、通知边界与清理复用；正式命令分批关联、每 tick 读模型、故障不可读、容量停止和 start 规格以本 spec 为准。
3. **接纳 G-02 占位不计时（P3-02 技术决定 2）。** 跳过与否不改变规则，也不需要模拟过场时长；与基准设置的差异披露。
4. **只实现初始出发保持。** 确认配置时创建 tick 0 世界，失败立即反馈，出发结束才开始调度；这是项目装配选择，不是原版构建时机相同的结论。删除草案中没有实际生产消费者的每 tick 衔接检测器；运行中停靠/救援媒体须由责任 spec 与 Core 契约共同定稿。
5. **按住开火在 Runtime 中按 tick 采样。** P3-02 要求“按住期间每 tick 一个、短按保留一次”，只有 Runtime 知道 tick 边界；只覆盖主炮电平，其余操作都是普通命令。
6. **命令顺延但有界。** 队列 256、每 tick 64、按住主炮占一个名额，保留 FIFO；队列满明确拒绝，不按“人工输入不可能这么快”忽略边界。暂停/失焦等取消和可能已经执行的故障批次分开反馈。
7. **每帧至多 5 个 tick，超出不补跑。** 沿用 P1-04 的取值（32 Hz 下约 156 ms），避免长时间卡顿后一次补跑过多（[总计划 §5](../../master-plan.md#5-状态管理与通信约定)）；代价是卡顿时游戏时间变慢，开发诊断显示触顶次数。
8. **每次创建重新抽样种子。** 平台提供 uint32 并进入录制，抽样失败拒绝开始；不保证两次抽样不同，也不宣称复现原版随机序列。测试注入确定种子序列验证使用次数和重试隔离。
9. **僚机默认名单第 1 项，在应用实例内保持上次选择。** 与原版新战役的默认值和出发前页面的预选一致（已确认，代码）；不持久化，存档归 P4。
10. **任务菜单是暂停式的项目页面（G-07），暂停标识放在游戏画面之外。** 原版的 Esc 页面与 `p` 暂停都扣除时长；原版暂停时游戏画面上有无标识尚未研究，由 P3-13 处理，避免本任务在游戏画面上加入未披露的项目绘制。
11. **保护运行和待导出诊断。** 有运行就登记离页确认，包括 stopped/faulted；显式退出后撤销。它不是存档或系统级防关闭保证。
12. **桥接按 10 Hz 采样，关键状态立即发布。** 取总计划 10–20 Hz 的下限，与 P1-06 一致；任务状态、结果与交互上下文的变化立即发布，使 React 页面不延迟反映结果或菜单上下文。
13. **开发默认录制、生产不启用。** 每 32 tick 一个检查点；任一 Core 录制预算用尽时明确停止并保留可导出的成功前缀，不改写 Core 上限或保证固定时长。普通故障禁止新导出，已保存副本仍有效。
14. **占位累计 3 秒可见时间，可跳过。** 保留项目呈现选择，说明长期可读；hidden/pagehide 后不能凭自然结束自动恢复模拟，旧回调与按键尾事件不得串到下一页。
15. **新增 Node 重放核对工具。** P3-15 要求在 Node 中重放完整闭环；从浏览器导出到 Node 重放的链路在本任务建立并测试，P3-15 只需使用。
16. **目标与限制的说明由本任务撰写、P3-11 复核。** G-04 要求保留游玩必需的信息，而原版简报文字的导入归 P4；说明依据已确认的代码事实撰写并标注置信度，规则实现后由 P3-11 复核。
17. **历史文档中失效的源码链接改指退役记录。** 保留历史文字与结论，同时不留下失效链接。

生成及本次审阅均按用户 2026-10-09 的指示（“如果有需要我回答的问题，直接用你最推荐的答案”）采用推荐方案。本次审阅纠正了初始与运行中衔接混用、故障读取/容量反馈、包销毁通知、清输入入口、生产验证路径及录制工具边界。该授权不等于完整 spec 批准，也不批准改变冻结决定；合成演示退役按阶段索引授权的选择范围提出，正式 Core 的既有契约不变。后续若要改 Core 公开语义或冻结架构，仍须相应审批/ADR，不能由本 spec 自动放行。

## 验收标准

| ID | 可观察的通过条件 | 验证方法与所需证据 |
|---|---|---|
| AC-01 | 时间戳 0 首帧锚定；31.25 ms 为 1 tick，之后相同时间戳为 0 tick；一次 156.25 ms 的增量恰 5 tick，187.5 ms 增量触顶至 5、alpha=0，余量不再补跑；一般余量 alpha 在 [0,1)。每 tick 的 projection/render 同 tick 原子缓存，读取失败不混合两组；暂停/恢复折叠不回退，旧冻结输出不变 | Node 时间序列与读模型测试；非有限、倒退、转换溢出拒绝；不以墙钟等候作为精确时基证明 |
| AC-02 | 意图完整校验，0 tick 帧不消耗短按；按住/短按/多次短按、普通 fire 与自动 fire 并存符合规则。覆盖队列 256/257、每 tick 64/65 和自动开火占额；FIFO 跨多 tick 不丢命令，每个 tick 独立 commandIndex→commandId，自动结果和实例化事件为 null。非法提交不改变 ID/旧队列；外部变更不影响副本 | Node 使用真实 Core 和合成任务，直接断言 Recording.record.ticks 与收到的交付元数据 |
| AC-03 | 覆盖首 tick 失败、多 tick 中后续 step 失败、step 后读取失败、快照/检查点/导出故障、监听器失败及容量停止：状态/缓存/已投递与未投递事件、cancelled 与 unconfirmed 均符合[失败表](#失败帧与录制容量)。容量停止前本帧成功 tick 的事件仍送达，失败 tick 无变化，余队列只取消一次，故障不可新导出而容量停止可导出 | Node 在测试创建边界注入故障，不加生产后门；真实录制容量边界用例验证 limit 与下一次拒绝 |
| AC-04 | start 只在 idle 接受规格；非法/重复 start 无第二世界；保持、停止、故障及旧句柄的输入/控制拒绝正确。重写 P1-05 的关键边界用例：句柄 0、旧/重复回调、帧内 FIFO 控制、非法排队控制、消费者与 onError 失败、清理失败锁存、状态通知非递归、exit/dispose 幂等。至多一个有效请求，取消失败明确而非宣称物理请求为 0 | Node 可控宿主与故障回归；确认无 Core 模式驱动的隐式暂停 |
| AC-05 | 初始 G-02/2 的合法变体与运行配置对应，保持期间 tick0、无 rAF；结束凭证只对当前 owner/run 生效一次。自然结束、跳过、隐藏/离页、重开和释放交错时不会启动旧运行；隐藏后已返回可见仍要求显式继续。生产接口没有外部每 tick 检测器或 Core 写回入口 | Node 初始保持与迟到回调矩阵；计时器/时钟故障可见，取消失败锁存 |
| AC-06 | 从初始出发保持开始，经过暂停、隐藏、任务菜单、按住开火、命令顺延、失焦/退出锁定清输入，实际执行的输入录制 JSON 往返后 replay 事件与全部检查点一致；取消命令和控制不入录制，清输入不改已接受的 Core 状态。零 tick、尾检查点、新运行与已导出副本分别验证 | Node 真实 Core 与合成任务；不把尚无真实地图/停靠系统的替身测试当成其玩法通过 |
| AC-07 | 开始/介绍/配置/出发/运行/重开/返回按流程执行；2,999 ms 可见时间不自然结束，达到 3,000 ms 后下次回调可结束，隐藏/离页不计入；所有结束路径至多一次。默认、无僚机、全部 5 个索引与保留选择正确；种子端口每次实际创建尝试只抽一次，允许值重复，错误不回退；失败原子回滚，新 run 从 tick0 且无旧意图 | Node 可控时钟、种子、内容代际、重复点击与部分创建失败；构造错误、端口错误、清理错误分别断言 |
| AC-08 | 没有包、部分包、诊断 not-attempted/failed、清理锁存均阻止入口；完整但未保存/保存失败可进入。loaded 仅允许配置，createWorld 失败留在配置；打开和确认间代际变化拒绝，不混合 Asset。缓存 listed/saved 不冒充已验证可开始；页面不声称完整玩法可玩 | Node 资格与代际测试；开发 E2E 经不同合成场景显示相应反馈 |
| AC-09 | 运行消费者逆序、至多一次释放，不迁移；所有者先失效输入/定时器、再完成其余收尾，失败仍尝试独立项并锁存。分别验证 beforeReplace 与不通知的 holder.dispose 路径，装配层先释放任务再销毁 holder。资源替换后没有旧运行/回调，缓存状态变化不重建 | Node 真实 holder 与会话、部分初始化/释放失败替身；不通过改变 holder 销毁语义让测试通过 |
| AC-10 | 所有有运行 phase 均只有一份 beforeunload（包括 stopped/faulted），exit/dispose 后为零；登记失败回滚。Chrome 中可信开始后请求真实关闭或刷新出现原生确认，取消后同一运行和录制保留；菜单/介绍/配置及 exit 后不出现。模拟 pagehide/pageshow 只算适配测试，不算 BFCache 证据 | Node phase 矩阵；浏览器原生 beforeunload dialog（关闭使用 runBeforeUnload 路径）及取消/离开分支；不把拦截 OS 快捷键算作已验证 |
| AC-11 | projection 在 99/100 ms 边界采样且去重；新对象但语义未变不触发即时发布，规定的关键变化/状态/命令结果即时发布。pending→accepted/rejected/ignored/cancelled/unconfirmed、重复/未知/null ID、同 ID 新 owner/run 都正确；最近结果最多 10，读时钟失败成为 consumer 故障 | Node 可控时钟与类型化消费者数据；尚未实现的 accepted/ignored 等分支用通知替身验证，不修改 Core 规则 |
| AC-12 | 开发与生产分别按[合成任务包](#合成任务包)的合法路径走完整应用流程；两种僚机配置各一次，跳过按钮、Enter、Space、Esc 和自然结束均覆盖，repeat/尾事件不启动下一页。两种构建都读到 tick 前进、暂停稳定、出发 tick0、重开新 run；菜单期间不能被旁路 resume，返回焦点正确。开发检查实际生成的玩家/僚机与命令 not-implemented 反馈 | 开发经测试入口导入，生产经隔离的合成缓存恢复；只读 tick 属性取证，开发实体诊断和帧后事件另核对；无飞行画面完成声明 |
| AC-13 | 真实页面隐藏（工程约定中已验证的 CDP 标签页切换路线）使运行自动暂停，恢复可见后仍暂停；显式继续后 tick 继续，且没有补跑后台时长 | E2E，原生可见性，不使用合成事件或 getter 替换 |
| AC-14 | 三次菜单→任务→菜单往返及开发任务 hook Fast Refresh 后，旧 owner 失效，holder 和已确认选择在页面刷新中保持；外壳刷新回菜单。监听、观察器、rAF、Worker、beforeunload 与本任务单次计时器回到基线；模拟活动只有一条，非 running 无游戏 rAF | 既有 E2E 资源平衡/StrictMode/HMR 用例迁移；现有探针未计单次计时器，按需增量补充非干扰探针及干净/故意泄漏控制样本，不另建 runner |
| AC-15 | 生产构建：任务流程在生产 CSP 与网络审计下没有违规或外发请求；界面与构建产物中没有开发诊断、测试入口或测试支持 | E2E 生产预览用例与产物检查 |
| AC-16 | 浏览器下载的合成 Recording 经工具的同一核对函数和测试用导入配置重放一致；顶层坏形状、文件超限、读取中增长、坏 expected、版本/身份/setupHash 不符、结果分歧都明确失败。导出 JSON 未被修改以求通过；报告含固定字段，早期未知字段为 null。CLI 保持生产白名单，验证用法/I/O/未知来源的非零退出 | Node limit/limit+1 及报告/退出码测试；E2E 的下载文件在 Node 核对，CLI 的真实成功归 AC-17，不要求 CLI 默认接受合成盘 |
| AC-17 | 私有真实内容实验：从合法本地导入包带/不带僚机各创建一次正式运行，验证玩家与选择对应的僚机数量、运行 tick 推进，分别导出并经生产 CLI 与同一 CloneCD 文件组 replay 一致。绑定候选、完整内容身份、配置、种子、浏览器及 Node/V8 版本 | agent 在独立开发浏览器执行本地参考实验，不纳入自动测试/公共 CI；关闭通用 trace/截图采集，原文件与含派生状态的录制只在 local，公开证据仅计数/身份/判定。未取得时保持未完成，不能用合成通过代替 |
| AC-18 | 合成演示退役：所列模块、菜单入口与 lint 规则已删除，受跟踪的源码与测试中没有对它们的引用；迁移后的 E2E 覆盖[合成演示退役](#合成演示退役)所列的验收面，完成证据列出每个旧用例的去向；权利与隐私声明已更新；历史文档中指向已删除文件的链接都指向退役记录，文字与结论未改 | `pnpm check`、`pnpm test:e2e`、`git grep`、文档链接与锚点检查、差异审阅 |
| AC-19 | 标注：G-01、G-02/1、G-02/2、G-04、G-06（重开与返回）、G-07 在界面中可见，文字各集中在一处并以 G ID 标识；`slice-gaps.md` 按 G ID 记录呈现与位置，含 G-02 不计时与基准设置的差异；开始配置页的目标与限制注明为项目文字，并链接事实来源与置信度 | 浏览器测试读取页面文字；文档与代码审阅 |
| AC-20 | 按[对照](#对照)记录 R-13 控制子集与 L 流程部分，区分项目调度通过、已有原版依据和未完成的下游玩法；披露暂停残差、媒体时间、提前创建 tick0 世界和独立任务重试差异，不关闭 U-010/U-021/U-031 或声称地图、完整起飞、结果后重试已通过 | Node/浏览器证据与源码/权威记录对照；无需新增 DOS 运行但不能扩大结论 |
| AC-21 | [文档影响](#文档影响)所列文档已同步，`updated:` 日期、链接与锚点正确；`pnpm check` 与 `pnpm check:compliance` 通过 | 命令输出；文档检查 |
| AC-22 | 开发日志 500/501、帧窗口 120/121、最近结果 10/11 的保留正确；帧处理起止时钟包含模拟与消费者，不把 rAF 间隔当处理耗时，非法时钟不报告 0。导出副本、保存失败重试、对象 URL/临时元素释放、重开清日志，以及没有诊断消费者时的 Core 录制一致性均可观测 | Node 注入时钟与文件端口；开发 E2E 下载与清理；生产产物/DOM 无开发面板、日志、命令编辑器或测量接线 |

## 验证策略

- **单元/契约测试：** Vitest，测试与源码相邻。Runtime 与会话以可控宿主与时间戳运行真实的正式 Core 和合成任务包；P1 的 Runtime 与会话测试中仍适用的场景（通知边界、旧回调隔离、清理锁存、错误归类）改写为针对正式实现。任务流程、所有者、资格推导、桥接与反馈都是 DOM-free 模块，以可控的定时器、种子与时钟测试。工具以合成光盘测试。迭代时的针对性检查为 `pnpm exec vitest run src/app src/ui src/platform/browser tools/replay-check.test.ts tools/engineering-boundaries.test.ts`。
- **Replay/一致性：** 同一代码/规则版本、同一 JS 运行时内精确比较事件与全部检查点；AC-16/17 另要求本机浏览器导出在本机 Node 实际比较通过，分别记录 Chrome、Node、V8 版本，不因都叫 V8 就推断一致。跨运行时不一致须报告并定位，不能改记录或放宽哈希判据；它不是跨引擎普遍保证。
- **浏览器验证：** 复用现有 development、production、development-headed 项目、网络审计与资源探针；开发才有测试入口，生产通过隔离的合成缓存和真实恢复流程。原生隐藏按既有 CDP 路线取得，beforeunload 经真实 dialog 检查；合成 visibility/pagehide 或直接监听调用不能替代。控件焦点与无障碍反馈同测；不以 rAF、HTTP 200 或空容器证明 Core/图形结果。P3-15 的系统输入实机核对不被豁免。
- **实机/原版对照：** 现有代码/行为证据足以支撑本任务限定的暂停和出发顺序，原版规则事实未补证的部分保持原置信度。AC-17 是新实现使用真实内容的私有参考实验，不是新的 DOS 原版对照或公共浏览器测试；agent 按[证据指南](../../../guides/original-evidence.md)操作，遇到无法自行取得的权限/设备能力时如实记录阻塞，不预先指定用户代为研究。
- **工程检查：** `pnpm check`、`pnpm test:e2e`、`pnpm check:compliance`；文档的链接、锚点与元数据检查。只生成或审阅本 spec 时，只检查文档与路由。

## 风险与恢复

风险等级：中高。本任务替换合成应用链并建立多个下游共用的运行基础；不迁移缓存或存档，但会消费本地包和持有尚未保存的录制，必须分别保护来源、代际和销毁顺序。

- **生命周期回归：** 退役不能丢失仍适用的通知边界、故障和清理覆盖；以迁移映射及正式场景回归证明，不把旧合成测试的通过直接当新实现证据。
- **E2E 覆盖缺口：** 迁移以“同一验收面”为单位核对，完成证据列出每个旧用例的去向（迁移、并入查看器，或因只验证合成内容而删除）。飞行画面的渲染验收在 P3-12 之前不存在，这是已知的阶段性缺口，不以空画面冒充。
- **接口过早固定：** 只交付初始出发保持与当前消费者需要的接口；运行中媒体的规则完成信号、tick 边界、replay 和异步音频关闭由下游据真实需求共同修订，不绕开 Core 自建状态机或另一条循环。
- **中间构建的完成度：** 本任务之后的构建可以开始任务，但看不到飞行画面，也没有键位；入口与画面如实说明，P3-15 审计时不得残留此类说明。
- **历史链接改写：** 只改链接目标，以差异审阅确认文字未变；退役记录保留删除前的提交，便于追溯。
- **恢复：** 实现故障先停、清理失败锁存，返回菜单不清除本地资源包；必要时重载再恢复既有缓存，但运行和未导出录制不能恢复。代码可按独立变更回退，不做缓存迁移或删除用户站点数据。

## 未决事项

无待用户选择的事项。本次取舍按授权采用推荐方案；仍为 draft，等待完整契约批准。P3-10/P3-11 的运行中媒体接口、P3-05 的物理绑定、P3-12/13 的画面和完整地图/结果证据不是已解决事项，而是明确排除的下游责任；本 spec 不准许先用检测器或近似规则填补。现无本任务 goal/subtask，无下游执行记录在此改写。

## 审批

用户于 2026-10-09 明确批准经 review-spec 修订后的完整契约（“approve the spec and generate goal”），并要求生成 goal。批准范围为 S-01 至 S-12、AC-01 至 AC-22，以及应用流程、开始资格、任务开始配置、衔接占位、Runtime（含失败帧与录制容量）、会话、任务菜单与退出、消费者接线与释放、离页保护、UI 桥接与命令反馈、开发诊断、replay 核对工具、合成任务包、合成演示退役、缺省与标注、对照、文档影响、数据模型与契约，和技术决定 1 至 17（其中按用户指示由 agent 采用的推荐方案随本次批准一并生效）。

本次只记录批准，不改变范围、行为或验收要求。批准不代表实现完成，不授权阶段验收豁免、改写历史结论或改变冻结决定；AC-17 的真实内容核对与各浏览器证据仍是执行时须取得的证据。运行中衔接（P3-10、P3-11）与物理键位（P3-05）仍归下游，需要时按扩展规则修订本 spec。front matter 的 `reviewed:` 标记对应批准前最后一次审阅的文本，本次只改了 status 与本节。

**2026-10-10 修订（P3-05 的共享契约同步）：** 用户于 2026-10-10 在 P3-05 goal 执行中明确批准本修订（对“是否批准这项 P3-04 spec 修订？”选择“批准修订”）。修订由 [P3-05 子任务 09](../05/subtasks/09-p3-04-spec-sync.md) 起草，落实已批准的 [P3-05 spec](../05/spec.md) 中的焦点转移与输入控制端口，只涉及：[任务开始配置](#任务开始配置)“用户激活与焦点”的焦点例外（进入飞行与 Continue 成功后移入游戏输入区）；[会话](#会话)“控制通道”中 `p` 在被毁序列期间仍有效的 P3-05 决定；[任务菜单、暂停与退出](#任务菜单暂停与退出)中 `p`/Esc 经输入控制端口调用所有者动作；[消费者接线与释放](#消费者接线与释放)新增“输入控制端口”；[数据模型与契约](#数据模型与契约)新增对应一行。没有新增 S/AC 编号，其他范围、行为与验收要求不变；P3-04 goal 与子任务的历史证据不改写，这些新行为的实现与验证属于 P3-05。

**2026-10-14 交接注记（P3-09 的 D-01）：** 不改变本 spec 的范围、行为、验收与历史证据。[P3-02 的 MW-01](../02/spec.md#mw-01-世界创建输入与静态规则数据)给 `createWorld`、录制入口与 `ReplayContent` 增加必需的 `mapGeometry` 输入（`data/hud/map-geometry`，[P3-03 修订 2](../03/spec.md#p3-09-的修订地图几何修订-2)）：会话组合与重试须从同一经验证的包中解码它，与其他规则输入一起传入；新切片定义版本使旧缓存须重新导入。地图打开时 Core 不暂停，`p` 与任务菜单仍只由 Runtime 控制；暂停、隐藏与菜单不取消已开始的 Warp，继续后接着同一 Warp，不补跑。实现与验证归 P3-09 的子任务 12、21、22。

**2026-10-14 修订（P3-10 的 D-01：运行中衔接，依用户授权，由 P3-10 的子任务 08 定稿）：** 只新增“运行中衔接（P3-10 的修订）”一节与本条记录，并改了 front matter 的日期：Core 的 `transition` 事件、Runtime 的帧屏障与 `FrameReport` 的 `cut`、`transitions`、错误类别 `transition-hold` 与生命周期操作 `releaseTransitionBarrier()`、会话的 `RunningTransition` 与有限序列、`complete-transition` 控制与 owner/run/transition 凭证、竞态与 replay。授权出处为用户 2026-10-14 的原话“i authorize you to approve the recommended options for gates 07, 08 and 10”（[P3-10 goal 的审批](../10/goal.md#审批)），不涵盖冻结决定。所选方案：Core 照常完成整个 tick，Runtime 在该 tick 之后截断、先立屏障再派发，会话在通知边界外保持，每次衔接各有凭证，同 tick 的多个衔接为有限序列。被排除的方案：在 tick 中间暂停 Core（违背固定流水线与 replay 不含宿主等待）；由 Event Bus 订阅者在派发中调用 `clearIntent`/`resetClock`（重入生命周期）；只以 runId 作凭证（同一运行的第二次停靠会被旧凭证结束）；每 tick 至多一个衔接（丢弃原版可达的双重离港）。没有新增 S/AC 编号，本 spec 的其他范围、行为与验收要求不变，既有 goal 与 subtask 的历史证据不改写；实现与验证归 P3-10 的子任务 21 至 23。修订后未重跑 review-spec。

**2026-10-16/17 修订（P3-12 的 D-01：帧后逐 tick 输出，经用户明确批准）：** 由 P3-12 的子任务 09 起草（2026-10-16），新增“[帧后逐 tick 输出（P3-12 的修订）](#帧后逐-tick-输出p3-12-的修订)”一节与本条记录，并改了 front matter 的日期：`FrameReport` 增加 `outputs`（`TickOutput { tick, clock, render, events }`，`TickEvent { event, commandId }`）、故障矩阵、消费者的连续性规则与内存边界；Core 的部分记在 [P3-02 的 P3-12 契约修订](../02/spec.md#p3-12-的契约修订d-01)。所选方案：随帧报告交出 Runtime 已有的逐 tick 结果。被排除的方案：在 Event Bus 中加入 tick 中途回调或按 tick 的二次派发（破坏“全部模拟后派发”的次序，同一事件可能被处理两次）；Runtime 保留多于两份的 Render State 供任意读取（改变总计划 §5 的两帧约定且需无界历史）；让表现模块按事件的 tick 自行分组、只读帧末 Render State（缺少中间 tick 的 Render State，P3-12 spec 已排除）。没有新增 S/AC 编号，本 spec 的其他范围、行为与验收要求不变，既有 goal 与 subtask 的历史证据不改写；实现与验证归 P3-12 的子任务 11。修订后未重跑 review-spec。

- **批准与用户原话：** 用户于 2026-10-17 经协调者提问（“是否批准 09 的 D-01 共享契约定稿？”）选择“批准，全部按推荐方案 (Recommended)”，批准本节与 [P3-02 的 P3-12 契约修订](../02/spec.md#p3-12-的契约修订d-01)。这是用户本人的批准；不涵盖冻结决定，本修订不改变总计划 §5 的两帧约定。
