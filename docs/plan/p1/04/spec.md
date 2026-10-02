---
type: plan
status: accepted
phase: P1
task: "04"
updated: 2026-10-02
related: [ADR-0006, ADR-0012]
reviewed: sha256:31042ed18159
---

# P1-04：Runtime 调度、命令与事件分发 — Spec

## 问题与目标

P1-02 已交付合成纯 Core，P1-03 已交付录制与 replay，但目前只有测试代码直接调用 `step()`。还缺少固定步长调度、补跑上限、命令队列、连续输入快照、Event Bus，以及供渲染插值的两份 Render State。总计划规定这些都归 GameRuntime（[§4.2](../../master-plan.md#42-数据流)、[§5](../../master-plan.md#5-状态管理与通信约定)、[ADR-0006](../../../decisions/ADR-0006-core-returns-events.md)）。

本任务在 `src/app/` 新增一个**与宿主无关**的合成 Runtime，每帧依次完成：

1. 调用者传入单调不减的毫秒时间戳，Runtime 按固定步长算出本帧运行几个 tick，并受补跑上限约束；
2. 用命令队列和连续输入快照组装 `TickInput`，调用 Core；
3. 每个成功 tick 后保存 Render State；本帧模拟结束后确定插值系数和时间进度；
4. 按顺序把事件同步分发给类型化订阅者，订阅者只能读到本帧模拟结束后的状态。

录制可选开启，复用 P1-03 的录制会话。

完成后，Node 测试可以用手写时间戳和合成订阅者，验证调度、队列、分发、Render State 与录制一致性。

以下内容属于 [P1-05](../tasks.md#p1-05-会话与浏览器生命周期)：浏览器时钟（`requestAnimationFrame`）接入、暂停/继续/退出控制通道，以及会话生命周期。因此本任务完成后，[STATUS](../../../STATUS.md#运行骨架) 的 GameRuntime 退出项仍不能勾选。

阶段范围依据[总计划](../../master-plan.md#12-开发阶段与验收条件)，任务导航见[阶段索引](../tasks.md#p1-04-runtime-调度命令与事件分发)。前提为 [P1-02 最终证据](../02/subtasks/05-final-alignment.md#完成证据)与 [P1-03 最终证据](../03/subtasks/07-final-alignment.md#完成证据)。

## 范围

### 包含

- **S-01 创建与所有权：** 用 P1-02 的统一场景入口创建合成 Runtime。
  - Runtime 独占它的场景；开启录制时独占 P1-03 录制会话。
  - 外部拿不到可 step 的场景引用。
  - 实例之间不共享可变状态。
- **S-02 固定步长与补跑上限：**
  - 到期 tick 由时间基准计算；未触发补跑上限、非法时间或故障时，帧切分不影响同一最终时间戳的 tick 总数。
  - 每帧最多运行 `maxTicksPerFrame` 个 tick，超出的积压丢弃。
  - 非法时间戳显式拒绝。
- **S-03 命令队列与输入快照：**
  - 提交命令时先校验、复制，再分配 `commandId`，先进先出。
  - 帧开始时已排队的命令全部进入下一个实际运行的 tick。
  - 连续输入只保存最新值，用于之后的每个 tick。
- **S-04 类型化 Event Bus：**
  - 可以按事件类型订阅，也可以订阅全部事件。
  - 帧内全部 tick 结束、读取状态更新后，按 tick 与 `commandIndex` 顺序同步分发。
  - 订阅变更、重入和监听器异常都有确定的语义。
- **S-05 Render State 与读取：** 保存最后两个已执行 tick 的 Render State 及插值系数 `alpha`，并提供当前 UI projection 的只读读取。
- **S-06 可选录制：** 开启时，每个成功执行的 tick 都进入 P1-03 记录。导出的记录 replay 后与导出结果一致。无 Core 故障且有全程订阅者时，分发事件与结果事件相同；故障帧的例外见“Core 抛错与故障”。
- **S-07 错误与故障：** 参数错误、重入、监听器失败和不可恢复故障统一使用带判别字段的 `GameRuntimeError`。Core 抛错或命令 ID 耗尽后，Runtime 进入不可继续模拟的故障状态。
- **S-08 本地验证：** Node 单元测试使用手写时间戳与合成订阅者；`pnpm check` 通过。

### 不包含

- **P1-05：**
  - `requestAnimationFrame`、计时器或 `performance.now` 的接入；Runtime 不读取任何宿主时钟。
  - 开始/暂停/继续/重启/退出/销毁，页面隐藏与时间基准重置，暂停期间队列和输入的处理。
  - 运行时控制通道，包括原版 `p` 暂停键对应的控制。
- **P1-06：** Zustand 桥接、projection 采样频率、React 控件与反馈。Runtime 只提供读取，不推送 UI 快照。
- **P1-07：** Three.js、插值计算、实体出现或消失时的渲染处理。Runtime 只提供两份状态和 `alpha`，自己不插值。
- **P1-09：** 键盘映射、多输入源合并、按键状态、焦点与清键。Runtime 只有一个输入快照。
- **P1-05 至 P1-10：** 浏览器验证、StrictMode/HMR，以及在浏览器中复用录制。
- **上游契约不变：** 不改变 P1-02/P1-03 已批准的 Core 行为，以及输入、事件、投影和记录的形状。
- **不新增：** 通用引擎、ECS、模拟 Worker、可替换场景的泛型接口、开发者工具界面或新依赖。
- **不确定原版时间规律：** tick 频率仍是 Core 参数，默认 60 Hz 不是原版事实。[U-008](../../../original/unknowns.md) 中的时钟线索仍未确认，本任务不使用。
- **不做性能调参：** 不设性能阈值，也不做发布级调参。补跑上限的默认值是 P1 初始值。
- **不做远端操作：** 不运行 CI、部署或云操作，遵循 [ADR-0012](../../../decisions/ADR-0012-local-p1-defer-ci-deployment.md)。

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| 计划新增 `src/app/` 下的 Runtime 模块 | 调度、命令队列、输入快照、Event Bus、Render State、录制接线和错误类型；文件划分由 goal 决定 |
| 计划新增同目录 `*.test.ts` | 使用现有 Node 环境的 Vitest；由 [tsconfig.node.json](../../../../tsconfig.node.json) 做类型检查 |
| [synthetic-scene.ts](../../../../src/core/synthetic-scene.ts)、[synthetic-replay.ts](../../../../src/core/synthetic-replay.ts)（已有） | 只被消费。若需要复用命令或输入校验，可以增加 Core 内部导出，但不改变已批准的语义和既有测试 |
| [App.tsx](../../../../src/app/App.tsx)、[main.tsx](../../../../src/main.tsx)（已有） | 不接线，占位页面不变 |
| [ESLint](../../../../eslint.config.js)、各 tsconfig、[工程边界回归](../../../../tools/engineering-boundaries.test.ts) | 复用，不放宽 |

## 当前实现与依据

- **合成场景：** [createSyntheticScene](../../../../src/core/synthetic-scene.ts) 返回 `SyntheticScene`，提供 `step`、`inspect`、`uiProjection`、`renderState`。
  - 所有读取都是深冻结、与内部状态脱离的副本。
  - `TickInput`、`Command`、`MoveInput`、`DomainEvent`、`SyntheticRenderState`、`SyntheticUiProjection` 都定义在同一文件。
  - 非法输入抛 [CoreInputError](../../../../src/core/errors.ts)（带 `path`、`reason`），整个 tick 不执行。
  - 数值守卫也会在修改前抛错，例如位置积分会变为非有限数时。
  - 本场景的事件全部是命令结果，带 `tick` 与 `commandIndex`。
  - 配置：seed 为 uint32；`tickRateHz` 为有限正数且倒数有限，省略时为 60。
- **录制与 replay：** [createSyntheticRecordingSession](../../../../src/core/synthetic-replay.ts) 的行为与 `SyntheticScene` 相同，另可 `exportRecording()`。同文件还提供 `replaySyntheticRecord` 与 `compareSyntheticReplayResults`。
  - [P1-03 spec](../03/spec.md) 把“是否默认录制、如何把录制接入调度”留给 P1-04/05，并且不规定默认检查点间隔（其技术决定 5）。
  - 阶段索引原定本任务只依赖 P1-02；加入录制接线后，**本 spec 的实际前提增加了 P1-03**。两项前提都已完成，但不能因此称依赖未变。生成 goal 时须声明两项前提及其完成证据；阶段索引的依赖列需在允许修改导航的后续规划操作中同步，本轮 review 只改本 spec。
- **应用壳：** [App](../../../../src/app/App.tsx) 仍是占位页面，[main](../../../../src/main.tsx) 启用 StrictMode，目前没有 Runtime。[package.json](../../../../package.json) 没有 Zustand、Three.js 或 Playwright，本任务也不需要它们。
- **类型检查与 lint：**
  - [tsconfig.node.json](../../../../tsconfig.node.json) 包含 `src/**/*.test.ts`，lib 只有 ES2023、没有 DOM。因此被测试导入的 Runtime 模块必须在没有 DOM 声明的情况下也能通过类型检查。
  - [tsconfig.app.json](../../../../tsconfig.app.json) 检查全部浏览器源码。
  - ESLint 对 `src/app` 没有纯度限制，Core 的纯度规则不变。
- **架构依据：** [总计划 §5](../../master-plan.md#5-状态管理与通信约定) 规定：
  - 一帧可能补跑多个 tick，且每帧补跑数有上限；
  - 本帧模拟结束后统一发布事件；
  - 订阅者产生的意图进入下一个 tick；
  - 保留上一个 tick 与当前 tick 两份 Render State；
  - 运行时控制与游戏命令分开。

  [§6](../../master-plan.md#6-补齐-threejs-之外的游戏能力) 只要求小型运行层。本任务不新增原版事实。

## 行为与边界

### 创建

- **参数：**
  - `scene`：必填，P1-02 的场景配置；
  - `maxTicksPerFrame`：可省略，默认 5；
  - `recording`：可省略，给出时为 `{checkpointInterval}`。
  - 可选参数省略或为 `undefined` 都使用缺省行为；`null` 不是省略。`recording` 一旦给出，`checkpointInterval` 必填。
- **参数校验：** 全部参数在创建前校验，非法时不产生实例。以下情况抛 `GameRuntimeError`，`kind` 为 `invalid-argument`，`path` 以 `options` 开头：
  - 未定义的字段、非对象；
  - `maxTicksPerFrame` 不是正安全整数；
  - 场景配置非法，如 `options.scene.seed`，`cause` 为 Core 的原始错误；
  - 检查点间隔非法，即 `options.recording.checkpointInterval`。
- **初始状态：**
  - 场景位于 tick 0；
  - 输入快照为 `{moveX:0}`；
  - 命令队列为空，下一个 `commandId` 为 1；
  - 尚未建立时间基准；
  - `previous` 与 `current` 都是 tick 0 的 Render State，`alpha` 为 0。
- **隔离：** Runtime 校验并使用同一份取值副本，不在校验后重新读取调用者的配置、命令或输入字段；不修改或冻结调用者对象。实例之间不共享可变状态，交错调用互不影响。

### 帧推进与时间

| 情况 | 结果 | 拒绝或失败时的反馈 |
|---|---|---|
| 第一次帧推进 | 以该时间戳建立时间基准，运行 0 个 tick，`alpha` 为 0 | 时间戳非法时见下文 |
| 之后的帧推进 | 令 E =（now − 基准）× tickRateHz / 1000，使用 JS `number` 按此运算顺序求值。本帧到期 tick 数 = ⌊E⌋ − 自基准起已运行的 tick 数。计算出的 E 恰为整数时，该 tick 运行 | 中间数值不可表示时见下方“时间换算溢出” |
| 到期数 ≤ 上限 | 全部运行；`alpha` = E − ⌊E⌋ ∈ [0,1) | — |
| 有限的到期数 > 上限 | 运行上限个 tick；丢弃其余积压和不足一个 tick 的余量；以本次时间戳为新基准；`alpha` 为 0；报告 `capped: true` | 不是错误；游戏时间因此慢于真实时间 |
| 时间戳与上次相同 | 运行 0 个 tick，`alpha` 不变 | — |
| 时间戳不是 number、非有限，或小于上一次接受的时间戳 | 基准、队列、输入、场景、Render State 都不变 | `GameRuntimeError`，`kind` 为 `invalid-argument`，`path` 为 `nowMs` |
| 时间换算溢出：`now − 基准` 或随后乘以 `tickRateHz` 的结果不是有限数 | 在任何 tick、队列消费或时间进度修改前拒绝；不是积压，不补跑、不重置基准 | `invalid-argument`，`path` 为 `nowMs`，原因说明时间换算超出可表示范围；之后仍可提交相对最后一次接受时间有效的帧 |
| 事件分发期间再次调用帧推进 | 嵌套调用不改变状态或外层时间进度 | 嵌套调用抛 `reentrant-call`；监听器若不自行捕获，外层帧按监听器失败规则汇总，不保证外层正常返回 |
| 已处于故障状态 | 不运行 | `GameRuntimeError`，`kind` 为 `faulted` |

- 时间单位为毫秒，时间戳须单调不减；时间来源由 P1-05 决定。
- 到期数由时间基准计算，避免逐帧累加时间差造成的舍入累积；仍存在 `number` 的舍入与表示范围限制。按计算所得 E 取整，不另加提前运行 tick 的 epsilon。
- 未触发上限、非法时间或故障时，同一基准和最终时间戳得到相同的 tick 总数。**最终状态与事件还要求相同的逐 tick `TickInput`**；只在相同宿主时间调用 `setInput`/提交命令并不保证这一点。Runtime 不重建历史按键，也不按宿主时间回填输入。
- 成功帧返回冻结的 `{ticks, capped}`：`ticks` 是本帧实际运行的 tick 数，`capped` 表示是否丢弃了积压。时间进度、两份 Render State 和 `alpha` 均在通知监听器前更新；即使最终抛 `listener-failed`，这些进度也已生效，不得重跑该帧。

### 命令队列

- **提交与校验：** 按 P1-02 的 `Command` 契约校验：字段必须精确，`type` 为 `add-marker` 或 `remove-marker`。
  - 非法命令抛 `invalid-argument`，路径以 `command` 开头（如 `command.type`），`cause` 为 Core 的校验错误。该命令不入队、不消耗 ID，已排队的命令不受影响。
  - 合法命令复制后追加到队尾，返回 `commandId`：正安全整数，在实例内从 1 开始，每接受一条加 1。调用者之后修改原对象不影响队列。
  - 下一 ID 达到 `Number.MAX_SAFE_INTEGER` 时，不再签发新 ID，以免递增失去安全整数精度。此时提交抛带 `RangeError` 原因的 `faulted`，不接收本条命令、不重复或回绕 ID；实例进入故障状态。最后可签发值为 `MAX_SAFE_INTEGER − 1`，见技术决定 14。
- **命令进入哪个 tick：**
  - 本帧至少运行一个 tick 时，帧开始时排队的所有命令按提交顺序成为第一个 tick 的 `commands`。事件中 `commandIndex` 为 i 的那条，对应第 i 条命令的 `commandId`。
  - 同一帧后续的 tick 命令为空。
  - 0 tick 帧不动队列，命令留到之后的帧。
  - 分发期间（或帧开始后任何时候）提交的命令，最早在下一帧执行。
- **业务拒绝**是 Core 返回的 `command-rejected` 事件，带对应 `commandId` 分发，不是异常。
- **不包含的处理：** 本任务不设队列容量上限，也不去重；暂停期间的队列处理由 P1-05 决定。

### 连续输入快照

- **设置：** 按 P1-02 的 `MoveInput` 契约校验：只有 `moveX`，值为 [-1,1] 内的 number。
  - 非法时抛 `invalid-argument`，路径以 `input` 开头，`cause` 为 Core 的校验错误，保留原快照。
  - 合法时以副本替换，从下一个运行的 tick 起用于每个 tick，直到再次设置。
- **生效时机：** 同一帧内的所有 tick 使用同一快照；分发期间设置的值从下一帧起生效。
- **不自动归零：** Runtime 不推测按住状态。松键和失焦清零由输入适配层（P1-09）与会话（P1-05）负责。

### Event Bus

- **订阅：**
  - 按类型订阅时，类型必须是 `DomainEvent` 的类型之一（`marker-added`、`marker-removed`、`command-rejected`），TypeScript 会收窄事件参数。
  - 订阅全部事件时，收到每个事件。
  - 两种订阅的监听器都必须同步执行，签名为 `(event, delivery) => undefined`；订阅方法返回取消函数，重复调用取消函数没有额外效果。
  - 不支持 `async`/返回 Promise 的监听器，类型契约须拒绝它们；同步异常汇总不包含 Promise rejection。消费者若发起异步工作，须自行显式处理并呈现失败，不能交给同步 Event Bus 等待或兜底。
  - 未知类型或非函数监听器抛 `invalid-argument`，路径分别为 `on.type`、`on.listener` 或 `onAny.listener`，不产生订阅。
  - 同一函数重复订阅视为独立订阅，分别投递、分别取消；不因函数引用相同而去重。
- **投递：** 监听器以 `(event, delivery)` 调用。
  - `event` 是 Core 返回的冻结事件对象本身。
  - `delivery` 为冻结的 `{commandId}`。本场景的事件全部是命令结果，因此都带 `commandId`；非命令事件的投递元数据由引入它的任务定义。
- **时机与顺序：**
  - 先运行完本帧全部 tick，更新时间进度和 `alpha`，并让 Render State 与 UI projection 读到最后一个 tick，然后才分发。
  - 事件按 tick、再按 `commandIndex` 的顺序逐个投递。
  - 每个事件的匹配监听器按订阅先后调用；按类型订阅和全部订阅共用同一个先后序列。
  - 没有事件时，不调用任何监听器。
- **不缓存：** 没有订阅者时事件即丢弃，晚到的订阅者收不到历史事件。持续事实从 projection 读取。
- **分发期间的订阅变更：** 新增的订阅从下一帧的分发开始；被取消的监听器立即停止接收，包括本次分发中剩余的事件。
- **监听器在分发期间的调用：**
  - 可以提交命令、设置输入、读取状态、订阅或取消订阅；
  - 调用帧推进会抛 `reentrant-call`。
- **监听器抛出异常时：**
  - 异常被捕获，分发继续投递给其余监听器和剩余事件。
  - 全部投递完成后，帧推进抛 `GameRuntimeError`，`kind` 为 `listener-failed`，`errors` 按发生顺序列出全部异常。
  - 不回滚已完成的 tick、时间进度、录制或已更新的 Render State；监听器在抛错之前已提交的命令、输入和订阅变更也保留，抛错之后的语句当然不执行。
  - 该监听器保持订阅；下一帧照常运行，已分发的事件不重发。

### Render State 与读取

- `renderFrame()` 返回 `{previous, current, alpha}`。`previous` 与 `current` 是 Core 的冻结 `SyntheticRenderState`，分别对应倒数第二个和最后一个已执行 tick 之后的状态。

  | 情况 | `previous` | `current` |
  |---|---|---|
  | 尚未运行任何 tick | tick 0 的状态 | tick 0 的状态 |
  | 本帧 0 个 tick | 不变 | 不变 |
  | 本帧 1 个 tick | 原来的 `current` | 新 tick 的状态 |
  | 本帧 n ≥ 2 个 tick | 本帧第 n−1 个 tick 之后的状态 | 第 n 个 tick 之后的状态 |

  `alpha` 仅在创建及首帧建立基准时必为 0；之后按时间规则更新，即使当前仍是 tick 0。例如 50 Hz 下从基准前进 10 ms，仍是 tick 0，但 `alpha` 为 0.5。
- `uiProjection()` 返回 Core 对最新 tick 的 projection。
- 读取没有副作用。返回对象已冻结、与内部隔离，之后的 tick 或标记增删都不会改变它们。Runtime 不做插值，也不缓存可变的世界引用。

### 录制

- **未提供 `recording`：** 不录制，`exportRecording()` 返回 `null`。
- **提供 `{checkpointInterval}`：**
  - Runtime 用场景配置和该间隔创建 P1-03 录制会话，并通过它运行每个 tick；记录中的 `TickInput` 就是实际执行的那一份。
  - `exportRecording()` 返回 P1-03 的导出：深冻结，不改变状态，导出后录制继续。
  - 导出的记录经 `replaySyntheticRecord` 重放后，与导出结果比对一致。无 Core 故障时，从首个事件前就订阅、且未取消的 `onAny` 消费者，其收到的事件序列与结果的 `events` 相同；不能把多个消费者的投递合并后与结果比较。
  - `commandId` 只是 Runtime 的关联元数据，不写入 Core 事件或 P1-03 记录；replay 不还原 Event Bus 订阅、Runtime ID、时间戳或帧切分。
- **检查点间隔：** Runtime 不提供默认值。间隔 1 检查每个 tick，更大间隔减少哈希检查点，但**不会减少逐 tick 输入或事件记录**，不能用它保证长时间运行的内存有界。

### Core 抛错与故障

- Runtime 在提交时拒绝结构错误，时间换算溢出也在 step 前拒绝。不得用时间运算的 `Infinity` 制造本未到期的 tick，以便触发 Core 数值错误。
- Core 的 tick/实体 ID/位置守卫仍保留。正常实时使用很难达到这些边界，不把“正常不会发生”当作可以省略故障处理的理由；受控故障验证见 AC-12。
- Core 抛错时：
  - Runtime 停止本帧剩余的 tick，本帧事件不分发；
  - **整帧不具备回滚原子性。** 已成功的 tick（含命令、RNG、ID 和录制）保留，失败 tick 不推进；不能重发这些命令。Render State 保留最后一对成功状态，projection 为最后一个成功 tick，`alpha` 置 0；
  - 开启录制时只含成功的 tick，**包含其已产生但本帧未分发的事件**。故障导出依然能 replay 一致，但不再等于 Event Bus 已投递的事件流；
  - 帧推进抛 `GameRuntimeError`，`kind` 为 `faulted`，`cause` 为原始错误；
  - 之后帧推进、提交命令、设置输入都优先抛 `faulted`（即使参数也非法），保留最初故障原因；未消费的命令永久不再执行，读取与录制导出仍可使用；
  - 订阅与取消仍可用，但故障后没有新的事件可接收；它们不能恢复会话。不可恢复错误必须由 P1-05 在会话层呈现，不能把未收到结果的命令显示为成功。
- 命令 ID 耗尽同样终止后续模拟，但不改变已经提交的 Render State、alpha 或录制。若耗尽发生在监听器的命令提交中，当前帧模拟已完成，剩余投递仍完成；监听器未捕获的 `faulted` 按同步异常纳入外层 `listener-failed.errors`。这与模拟中途 Core 抛错、丢弃当前事件批次不同。
- 恢复方式由 P1-05 的会话重启决定，本任务不提供清除故障的入口。

## 数据模型与契约

Runtime 的类型与函数计划新增在 `src/app/`，具体文件由 goal 决定。以下标识符是供 P1-05 至 P1-10 使用的契约名称。Core 类型沿用 [synthetic-scene.ts](../../../../src/core/synthetic-scene.ts) 与 [synthetic-replay.ts](../../../../src/core/synthetic-replay.ts)，不重新定义。

| 数据/接口 | 形状、单位与约束 | 权威所有者 | 输入/输出边界 |
|---|---|---|---|
| `SyntheticRuntimeOptions` | `{scene: SyntheticSceneConfig, maxTicksPerFrame?: number, recording?: {checkpointInterval: number}}`。上限为正安全整数，默认 5，单位为 tick/帧；间隔沿用 P1-03 规则 | 调用者传入，Runtime 校验并持有副本 | 可选值 `undefined` 等同省略，拒绝 `null` 与未定义字段；错误路径以 `options` 开头 |
| `createSyntheticRuntime(options)` | 返回 `SyntheticRuntime`，内部独占一个 `SyntheticScene` 或录制会话 | app 层 Runtime | 唯一创建入口；场景来自 P1-02 统一入口 |
| `frame(nowMs)` | `nowMs` 为有限 number，单位毫秒，单调不减；时间差及乘积须可表示为有限 number；成功时返回冻结的 `{ticks: number, capped: boolean}` | Runtime | 不可重入；不读宿主时钟；溢出拒绝且不推进 |
| `submitCommand(command)` | 参数为 P1-02 `Command`；返回 `commandId`：从 1 起、至 `MAX_SAFE_INTEGER − 1`，实例内递增 | Runtime 命令队列 | 提交时校验并复制；非法时抛错且不消耗 ID；耗尽时终止，不回绕 |
| `setInput(input)` | 参数为 P1-02 `MoveInput`，`moveX` ∈ [-1,1]；初始为 `{moveX:0}` | Runtime 输入快照 | 校验并复制；以最新值为准 |
| `on(type, listener)` / `onAny(listener)` | `type` ∈ `DomainEvent['type']`；监听器 `(event, delivery) => undefined`，按类型收窄事件；订阅方法返回取消函数 | Runtime Event Bus | 仅同步回调，不接受 Promise 返回值；同步异常在帧末汇总，不缓存事件 |
| `EventDelivery` | 冻结的 `{commandId: number}` | Runtime | 纯数据，不含世界引用 |
| `renderFrame()` | 冻结的 `{previous: SyntheticRenderState, current: SyntheticRenderState, alpha: number}`，`alpha` ∈ [0,1) | Runtime 保存 Core 的输出 | 供 P1-07 插值；读取无副作用 |
| `uiProjection()` | Core 的 `SyntheticUiProjection`，对应最新 tick | Core 生成，Runtime 转交 | 供 P1-06 采样；读取无副作用 |
| `exportRecording()` | P1-03 的 `SyntheticRecording`；未开启录制时为 `null` | Core 录制会话 | 深冻结；导出不改变状态 |
| `GameRuntimeError` | 继承 `Error`；只读 `kind` ∈ `invalid-argument`、`reentrant-call`、`listener-failed`、`faulted`。`invalid-argument` 带 `path`、`reason`，来自 Core 校验时另带 `cause`；`listener-failed` 带冻结的 `errors: readonly unknown[]`（不冻结异常对象本身）；`faulted` 带最初的 `cause` | app 层 Runtime | Runtime 契约错误与同步分发错误使用此类型；业务拒绝不是错误，异步消费者失败由消费者处理 |

### 持久化与兼容

不适用。本任务不使用 IndexedDB、localStorage 或文件读写，不定义存档或设置格式。录制导出仍是 P1-03 的版本 1 格式，是否保存由调用者决定。

## 技术决定

用户于 2026-10-02 在生成和审阅时均指示：需要提问时直接采用代理最推荐的答案。以下选择（含审阅新增的 12–14 及修订）据此形成，并于同日随下方完整 spec 批准一并确认。

1. **Runtime 不读宿主时钟，由调用者传入时间戳。** 这样调度可以在 Node 中用手写时间戳精确测试，测试导入时 Runtime 也能通过不含 DOM 的 tsconfig.node 类型检查。浏览器时钟、页面隐藏和时间基准重置本属 P1-05，由它接入 `requestAnimationFrame` 时间戳，并可增加恢复时重新锚定的入口。
2. **到期 tick 由时间基准计算，而非逐帧累加。** 避免时间差逐帧相加的舍入累积，不承诺消除所有浮点误差。帧切分独立性只适用于未丢弃时间且未失败时的 tick 总数；状态/事件一致性还须保证逐 tick 输入相同。首帧只建立基准；计算出的 E 恰为整数时该 tick 运行。
3. **补跑上限默认每帧 5 个 tick，超出部分丢弃积压，并以本帧为新基准。**
   - 这落实了总计划“限制每帧最多补跑的 tick 数”。
   - 默认 60 Hz 下，5 个 tick 对应约 83.3 ms 的模拟时间预算；不能仅凭平均 FPS 推断是否触发上限，帧间隔抖动和 tick 边界同样影响到期数。
   - 长时间后台的情况由 P1-05 重置基准处理，不靠这个上限兜底。
   - 上限可以通过参数修改。默认值是 P1 初始值，不是原版事实或性能结论，需要时由 P5 性能工作重新校准。
4. **整个队列进入下一个运行的 tick，并分配 `commandId`。** 命令以最低延迟执行，顺序确定，并与录制中的 `TickInput` 一一对应。P1-09 的键盘也会向同一队列提交命令，`commandId` 让 P1-06 能把接受或拒绝反馈对应到自己提交的那条命令。
5. **连续输入采用“最新值”快照，不自动归零。** 这与 P1-02“Core 不猜测按住状态”一致：按住状态由输入适配层表达，清键时机由 P1-09/P1-05 决定。
6. **Event Bus 在帧末同步分发，顺序固定，不保存历史。** 这落实了总计划 §5 的“本帧模拟结束后统一发布”和“Event Bus 不负责保存持久事实”。分发期间新增的订阅从下一帧生效、取消立即生效，因此每次分发的接收者集合都是确定的。
7. **同步监听器异常隔离，并在帧末汇总抛出。** 一个消费者抛错不会中断其余投递；已发生的命令提交和输入修改不回滚。未捕获的重入错误同样被汇总，不承诺外层正常返回。会话层如何呈现这个异常由 P1-05 决定。
8. **只保存两份 Render State 和 `alpha`，不在 Runtime 中插值。** 这符合总计划 §5，也让 P1-07 自行决定实体出现或消失时如何渲染。
9. **录制默认关闭，开启时必须显式给出检查点间隔。** 更大间隔只减少哈希检查点，不减少逐 tick 输入或事件；录制仍随运行时长增长，不提供有界内存承诺。这回答了 P1-03 留下的两个问题；P1-10 在浏览器中复用录制时，由它开启录制并选择间隔。
10. **错误类型统一，故障后不可继续模拟；成功 tick 不回滚。** Core 原始错误保留在 `cause`；故障帧已成功的 tick 仍进入录制，但该帧不分发事件，所以录制不是 Event Bus 投递日志。故障后由 P1-05 重启恢复。AC-12 用测试层在真实场景的 step 边界注入失败验证状态机，不向生产 API 增加假场景、恢复入口或测试开关，也不把注入当作真实数值守卫的证据。
11. **只针对合成场景，一个实例就是一个会话。** 按总计划 §6 不建设通用引擎；P3 引入真实 Core 时再按需抽象。P1-05 可以在此基础上增加生命周期和控制通道，但不改变本 spec 的语义。
12. **时间换算溢出明确拒绝，不等同于长帧。** 原草案把任何非有限 E 当作积压。例如基准为 `−Number.MAX_VALUE`、now 为 `Number.MAX_VALUE`、频率为 `1e-308` 时，时间差先溢出；数学上的 E 约为 0.0036，尚不到一个 tick，却会误运行 5 个 tick。本轮改为 `invalid-argument` 且不改变状态，保留有限长帧的补跑规则；不为极端时间引入高精度调度器，也不借这种溢出制造 AC-12 的 Core 故障。
13. **Event Bus 只接收同步监听器。** 将回调返回类型限定为 `undefined`，而不是会接纳 `async` 函数的 `void`；用类型负向测试证明 Promise 返回值被拒绝。不引入异步事件总线，异步适配器仍负责自身错误通知。
14. **命令 ID 不允许溢出或复用。** 采用与 Core 分配器相同的“预留安全下一 ID”边界，最多签发 `MAX_SAFE_INTEGER − 1`；耗尽后进入 `faulted`，不把错误请求或失败命令伪装成成功。没有恢复/设置 Runtime 分配器的公开入口，自动执行到该边界不现实；以分配前守卫的代码审阅为证据，不新增可修改 ID 的测试后门。

## 验收标准

| ID | 可观察的通过条件 | 验证方法与所需证据 |
|---|---|---|
| AC-01 | 只给 `scene` 时创建成功：projection 为 tick 0；`previous`/`current` 为 tick 0，`alpha` 为 0；不录制。可选字段省略与显式 `undefined` 等价，`null` 被拒绝。非法参数（非对象、未定义字段、非法 seed/频率、上限为 0/1.5/NaN/字符串/超出安全整数、recording 缺间隔或间隔为 0）抛 `invalid-argument`，路径准确，不产生实例。创建后修改参数无影响，输入对象未被修改或冻结。两个相同配置实例交错运行同一调用序列，结果相同 | Node 测试断言 `kind`/`path`，Core 校验错误另断言 `cause`；使用会变化的字段 getter 验证校验与使用同一次取值；比较 projection、Render State、导出 |
| AC-02 | 50 Hz 下从 1000 开始，帧时间戳为 1000/1010/1020/1040/1085/1085 ms：`ticks` 为 0/0/1/1/2/0，`alpha` 为 0/0.5/0/0/0.25/0.25，均不 capped；满轴最终 X=0.08。单独验证 1019.999 ms 尚未到首个 tick，1020 ms 恰到。60 Hz 下从基准 0，以恒定满轴、相同命令 tick、至少三种未触发上限的帧切分抵达 1000 ms，均为 60 tick、相同 projection | Node 测试；整数/布尔报告精确比较，位置容差 1e-12。另验证输入采样反例：50 Hz、基准 0，在宿主 30 ms 将轴从 0 改为 1；有 20 ms 中间帧时，40 ms 的 X=0.02，没有中间帧时 X=0.04，两者均符合契约 |
| AC-03 | 60 Hz 默认上限下，从 0 到 1000 ms：运行 5 tick，capped=true，alpha=0；到 1010 ms：0 tick，alpha=0.6；再到 1020 ms：1 tick，证明没有残留积压。到期数恰等于上限时 capped=false。自定义上限 1、3 生效；有限时间差 1e9 ms 仍只运行上限个 tick。重复时间戳不再运行 tick | Node 测试断言报告、alpha、tick；上限用精确 50 Hz 边界独立验证，不以平均帧率代替 |
| AC-04 | NaN、±Infinity、字符串、回退时间抛 `invalid-argument`/`nowMs`。另覆盖差值溢出（−MAX_VALUE → MAX_VALUE，分别用 60 Hz 与 1e-308 Hz）和乘积溢出（0 → MAX_VALUE，60 Hz）；不得补跑。失败前后状态、Render State、alpha、队列、输入与录制不变，时间基准也不变；之后有效帧与未做非法调用的对照实例相同 | Node 对照测试；含首帧前后与失败后恢复，断言错误原因区分非有限输入、时间回退和换算溢出 |
| AC-05 | 50 Hz 下提交 add/add/remove，返回 commandId 1/2/3；0 tick 帧保留队列，下一 3 tick 帧的首个 tick 返回 added/rejected（marker-already-exists）/removed，delivery.commandId 分别为 1/2/3，后两个 tick 无事件。added/removed 的 **entityId 均为 2**，不是 commandId。非法命令不入队、不消耗 ID；提交后修改原对象无影响 | Node 测试比较完整事件、投递元数据、tick 与 projection；未知类型、多余字段、非对象均断言 invalid-argument、准确 path 和 Core cause；getter 变化不能使校验命令与执行命令不同 |
| AC-06 | 默认输入下物体不移动。`setInput({moveX:1})` 后运行 2 个 tick（50 Hz），X 为 0.04；改为 −0.5 后再运行 2 个 tick，X 为 0.02。非法输入（2、NaN、字符串、缺字段、多余字段）抛带 `cause` 的 `invalid-argument`，原值保留。设置后修改原对象无影响 | Node 测试；位置允许 1e-12 绝对误差 |
| AC-07 | 分发时 projection/current.tick 为本帧最后一个 tick，alpha 已是本帧新值。事件按 commandIndex、匹配监听器按注册顺序调用；按类型/全部订阅过滤正确，delivery 冻结且 commandId 正确。同一函数两次订阅产生两次投递，取消一个不影响另一个。晚订阅者没有历史事件；非法订阅参数抛 invalid-argument，path 准确 | Node 测试记录顺序，50 Hz 从 0 到 65 ms 的 3 tick 帧在回调内读到 alpha=0.25。类型负向测试拒绝错用其他事件字段及 async/Promise 返回监听器。本场景同帧仅首 tick 有事件，跨 tick 收集顺序仍以代码审阅为证据 |
| AC-08 | 监听器收到 removed 后提交 add、修改输入：本帧已完成的 tick 不受影响，下一实际运行的 tick 才生效，期间的 0 tick 帧不消费。嵌套 frame 抛 reentrant-call；监听器捕获时外层正常返回，不捕获时外层抛 listener-failed 且 errors 包含该错误，其余投递仍完成。取消监听器立即生效（包括当前事件尚未调用的接收者）；新增订阅下一帧生效，重复取消无效果 | Node 测试比较已运行 tick、队列结果和投递次数，包含捕获/未捕获两条重入路径 |
| AC-09 | 一帧 3 个事件，A 每次抛错、B 正常，二者均收到 3 个事件，帧末抛 listener-failed，冻结 errors 按顺序保留全部原异常（含非 Error 值）。A 若先提交命令/设置输入再抛错，这些操作保留。取消 A 后以同一时间戳调用 frame，0 tick、不重发；下一到期 tick 恰好执行已提交命令一次 | 与执行相同监听器副作用、但不抛错的实例比较 projection、Render State、alpha 和录制；断言时间进度已提交、无自动重试 |
| AC-10 | 0 tick 帧不改变 `previous`/`current`。1 tick 帧的 `previous` 等于原来的 `current`。3 tick 帧的 `previous`、`current` 分别为第 2、第 3 个 tick 之后的状态，且与一个按相同 `TickInput` 逐 tick 推进的并行裸场景在对应 tick 的 `renderState()` 相等。测试保留的旧 Render State 与 projection，在之后的 tick 和标记增删后保持不变且已冻结。读取不改变状态与导出哈希 | Node 测试；与并行裸场景比较，并检查旧对象是否不变、是否冻结 |
| AC-11 | 录制间隔 1 和 4 各运行一次无 Core 故障会话，覆盖 moveX=−1/0/0.5/1、成功 add/remove、两种拒绝、0 tick 帧和 capped 帧。记录 tick 数等于实际成功 tick 总数；JSON 往返后 replay 与导出结果一致。从首事件前开始、始终未取消的单个 onAny 所收到事件与 result.events 顺序相同。record/event 不含 commandId 或帧时间；导出后可继续，旧导出不变 | 使用 P1-03 replay/比对器，并独立断言 TickInput、事件和检查点；开启与关闭录制的两实例接受同一调用序列，projection、Render State、帧报告和投递结果相同 |
| AC-12 | 50 Hz、录制开启、满轴、提交 add，帧从 0 到 60 ms。第 1 tick 正常，第 2 次 step 在真正推进前被注入 CoreInputError：抛 faulted 且 cause 为该错误，previous/current 分别为 tick 0/1，projection 为 tick 1，alpha=0。本帧不投递；导出含 1 个 tick **及其 added 事件**，replay 仍一致。再覆盖首 tick 即失败：保持 tick 0、空事件。之后 frame/submit/setInput（含非法参数）都报原故障，解除测试注入也不能自动恢复；读取、导出和取消订阅可用 | 仅在 Vitest 中于已有创建边界包装真实场景/录制会话，在指定 step 调用前抛错，其余方法和成功 step 委托真实实现；测试后恢复包装。不是生产注入接口或 Core 数值守卫测试；真实守卫由 P1-02/P1-03 既有测试覆盖 |
| AC-13 | Runtime 模块及其测试通过 tsconfig.app 与 tsconfig.node 两个程序的类型检查。源码不含 `requestAnimationFrame`、计时器、`performance.now`、`Date`、`Math.random`、DOM、React、Zustand、Three.js。无新依赖；App/main 未接线；P1-02/P1-03 既有测试文件未修改且通过。针对性测试与 `pnpm check` 通过 | `pnpm exec vitest run <Runtime 测试>`、`pnpm check`；搜索 Runtime 源码，并审阅改动范围 |
| AC-14 | commandId 分配前有安全整数守卫：下一值为 MAX_SAFE_INTEGER 时抛带 RangeError 原因的 faulted，不签发、不入队、不回绕；之后遵守终止状态。若在分发中耗尽，当前批次仍投递完，未捕获错误被外层汇总。常规非法命令仍不消耗 ID | 按技术决定 14 审阅分配前检查与状态转换；正常递增、非法提交不消耗由 AC-05 自动验证。不执行数千万亿次提交或新增公开分配器恢复入口 |

## 验证策略

- **单元/契约测试：** 计划新增 `src/app/` 下的同目录 `*.test.ts`，使用现有 Node 环境的 Vitest。时间戳由测试直接给出，订阅者是合成的记录函数。正常调度、事件与 replay 测试使用真实 Core，不 mock Event Bus；仅 AC-12 在测试层对 step 边界注入异常，不用它证明 Core 规则。
- **数值：** 帧报告、tick、commandId、事件字段精确比较。alpha 的 0/0.25/0.5 等值精确断言；0.6 等非二进制精确值允许至多 `Number.EPSILON` 的绝对误差。位置容差为已有 Core 测试的 1e-12。不把位置容差用于放宽 tick 数或提前跨越时间边界。
- **失败路径：** 参数错误断言 kind/path，源于 Core 校验时另断言 cause；用对照实例证明非法调用无状态副作用。监听器失败则验证已经提交的副作用保留。重入、订阅变更、时间换算溢出和 Core 故障各有自动测试；命令 ID 不可达上限以代码审阅为证据。
- **Replay/一致性：** AC-11 验证成功 tick 与记录一一对应；AC-12 验证故障导出保留成功 tick，且与被丢弃的通知批次明确区分。确定性前提是同一版本/运行时、初始条件和逐 tick 输入，不是相同的宿主时间输入操作。浏览器中复用录制属于 P1-10。
- **浏览器验证：** 本任务不要求。Runtime 没有接入浏览器时钟或页面，不能用占位页面声称已在浏览器中运行；浏览器验证由 P1-05/P1-10 负责。
- **实机/原版对照：** 不适用。调度参数与合成场景都不是原版行为。
- **工程检查：** 先运行针对性的 Runtime 测试，再运行 `pnpm check`。不新增 runner、依赖或配置。

## 风险与恢复

风险等级：**中**。P1-05 至 P1-10 都依赖这里的调度、队列、分发和读取契约；本任务不涉及用户数据或存储迁移。

- **下游误解调度语义：** 帧报告、`alpha` 与补跑上限的行为都写成精确的数值验收。P1-05 只能在此基础上增加时间锚定与生命周期，不另开循环。
- **分发顺序或重入导致状态不一致：** 事件在帧末统一分发，禁止重入帧推进，分发期间订阅变更的语义固定，监听器异常隔离后汇总抛出。
- **默认上限不合适：** 上限可通过参数调整，且明确是 P1 初始值。P5 的性能工作可以按实测调整，契约结构不变。
- **录制占用内存：** 录制默认关闭；增大检查点间隔并不能限制输入/事件的内存增长，开启者须控制用途与时长。本任务不增加截断、容量策略或持久化。
- **故障后无法继续：** 这是有意为之，失败可以被看到；会话级恢复由 P1-05 的重启实现。
- **恢复：** 本任务只新增 `src/app/` 下的模块与测试，不接线，不改变 Core 语义，可以作为独立改动撤销。批准后若修改契约，须重新审阅与批准，并通知 P1-05 至 P1-10。

## 未决事项

无。技术决定 1–14 已随 2026-10-02 的完整 spec 批准一并确认。阶段索引补记 P1-03 依赖属于后续导航同步，不是缺失的功能决定；本轮未修改索引。文件划分、内部数据结构和测试拆分属于 goal 的实现选择，不是未决契约。

## 审批

**2026-10-02 用户批准完整 Spec。** 用户在本轮审阅结束后明确回复“批准spec”，批准当前契约的 S-01 至 S-08、AC-01 至 AC-14，以及技术决定 1–14（含审阅修订）。front matter 为 `accepted`，表示契约获批，不表示实现或验收完成；本次批准不包含 goal、执行或提交。
