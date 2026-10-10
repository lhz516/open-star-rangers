---
type: plan
status: active
phase: P3
task: "04"
subtask: "06"
updated: 2026-10-10
---

# 06 — UI 桥接与命令反馈

**契约来源：** [spec](../spec.md) 的 S-06 与 [UI 桥接与命令反馈](../spec.md#ui-桥接与命令反馈)；AC-11。
**依赖：** 03。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/ui/game/game-store.ts`：Zustand vanilla store，React 只拿到只读 reader；状态冻结，每次转换单次原子写入。内容：会话状态、projection 采样、任务流程位置、待确认命令与最近结果（最多 10 个）、操作错误。
- 计划新增 `src/ui/game/game-session-bridge.ts`：按 ownerId 与 runId 绑定当前运行：
  - 会话状态、新运行、暂停/保持/停止的静止边界立即写入；
  - projection 在帧通知中按 100 ms 采样，以 ownerId/runId/tick 去重，不另开定时器；
  - `mission.status`、`result` 分区的就绪与内容、`player.interactionContext`、各分区 readiness 的语义变化在本帧结束立即写入（比较语义字段，不比较每 tick 新建的对象引用）；
  - 注入时钟必须有限且不倒退，读取失败作为 consumer 故障抛出（沿用 P1-06 的附着与延迟报告规则）；
  - 附着事务化：运行级登记全部成功才写入状态，失败逆序撤销，撤销失败为 `RollbackError`。
- 计划新增 `src/ui/game/game-command-feedback.ts`：拿到 commandId 后才记 pending；按 ownerId/runId/commandId 匹配本消费者的 `command-result`，保留 outcome 与 reason；结果与帧末最新 projection 同次写入；取消按会话原因结算；故障中结果不明者记 unconfirmed；未知、重复、他人 ID 或 null 不产生结果；不自动重提；运行结束清空。
- 计划新增 `src/ui/game/use-game.ts`：`useStore(reader, selector)` 的 React 订阅 hook。
- 随实现编写 Node 测试，使用 03 的真实会话与合成任务；Core 尚未实现的 accepted/ignored 分支用类型化的通知替身验证，不修改 Core 规则。

## 不包含

- React 页面与接线（09）；开发诊断（07）；Classic 飞行 HUD（P3-13，不经 store）。
- 合成 `ui/game/synthetic-*` 的删除（13）。

## 关键文件与契约

- 计划新增：`src/ui/game/game-store.ts`、`game-session-bridge.ts`、`game-command-feedback.ts`、`use-game.ts` 及相邻测试。
- 参照：[synthetic-game-store.ts](../../../../engineering/source-structure.md#r6-合成-ui-层)、[synthetic-session-bridge.ts](../../../../engineering/source-structure.md#r6-合成-ui-层)、[synthetic-command-feedback.ts](../../../../engineering/source-structure.md#r6-合成-ui-层)（P1-06 的附着与反馈语义）。
- 只读消费：[projection.ts](../../../../../src/core/projections/projection.ts)、[domain-events.ts](../../../../../src/core/contracts/domain-events.ts)、03 的会话类型。

## 写入范围

- `src/ui/game/game-*.ts`：计划新增的 store、桥接、反馈与测试。
- `src/ui/game/use-game.ts`：计划新增的 React hook。

## 验收标准

- [x] AC-11：projection 在 99/100 ms 边界采样且去重；新对象但语义未变不触发即时发布；规定的关键变化、状态与命令结果即时发布。
- [x] AC-11：pending → accepted/rejected/ignored/cancelled/unconfirmed；重复、未知、null ID 与同 ID 的新 owner/run 正确隔离；最近结果最多 10 个；读时钟失败成为 consumer 故障。
- [x] 附着回滚、旧运行通知不写入、运行结束清空 pending。
- [x] `pnpm exec vitest run src/ui/game` 与 `pnpm check` 通过。

## 验证方法

- Node：可控时钟、`ControlledHost`、真实会话与合成任务；通知替身覆盖 Core 尚未产生的结果分支。
- 浏览器中的呈现由 10 验证；不适用原版对照。

## 完成证据

- **实现：** [game-store.ts](../../../../../src/ui/game/game-store.ts)、[game-session-bridge.ts](../../../../../src/ui/game/game-session-bridge.ts)、[game-command-feedback.ts](../../../../../src/ui/game/game-command-feedback.ts)、[use-game.ts](../../../../../src/ui/game/use-game.ts)；测试支持 [game-ui.test-support.ts](../../../../../src/ui/game/game-ui.test-support.ts)（真实会话、`ControlledHost`、可控时钟、记录运行监听器的会话包装与类型化的帧/投影替身）。
  - store 每个所有者一份：`createGameStore<Flow>(ownerId)`，状态含 `ownerId`、会话状态、projection、流程位置 `flow`（类型由所有者给定，须冻结）、pending、最近结果（≤10）、`actionError`、`sessionError`；每次 `commit` 一次冻结写入，无变化不通知；会话状态按字段比较（会话每次读取都新建对象）。pending 与结果以 ownerId/runId/commandId 为键。桥接与反馈只拿到不含 `flow` 的 `GameRunStore` 视图。
  - 桥接 `createGameSessionBridge({ store, clock, consumers })`：`bind(session)` 只读会话视图（`status`/`currentRun`/`onStatus`），自动附着每个新运行；另提供幂等的 `attach(run)`，供所有者在自己的状态监听中把桥接作为运行级消费者登记。附着时所有登记成功后才使绑定生效并写入状态与 projection，失败逆序撤销，撤销失败为 `RollbackError`；附着期间消费者的写入不生效。running 附着时读时钟作为采样起点（沿用 P1-06）；直接 `bind` 时失败即回滚抛出，状态通知或所有者附着时失败延到该运行下一帧抛出；其他 phase 在第一帧（只锚定）起算。关键事实（`mission.status`、`player.interactionContext`、四个分区 readiness、result 的 outcome/reason/message）按字段比较，变化在本帧末即时发布。运行消费者的 `frameEnd` 结算与帧末 projection 同次写入。
  - 反馈：`submit(command)` 拿到 commandId 后才记 pending（命令类型按 Core 的方式只读自有数据字段，不触发访问器）；`command-result` 只对本消费者 pending 的 ID 暂存，帧末写入；取消通知即时结算且不发布 projection（取消的命令未执行，不扰动采样窗口）；故障时先写已收到的结果与会话的 failure 取消，余下 pending 记 `unconfirmed`/`session-failed`，与 faulted 状态同次写入。
- **Node 证据（`pnpm exec vitest run src/ui/game`，177 个测试通过，其中新增 4 个文件 66 个）：**
  - 采样：[game-session-bridge.test.ts](../../../../../src/ui/game/game-session-bridge.test.ts) 中 99 ms 不发布、100 ms 发布，同 tick 的新对象与重复帧不发布，到期的 0 tick 帧补发最新未发布 tick；暂停静止帧立即发布，恢复后不补发；晚绑定的 running 运行从绑定起算，晚绑定的 paused 运行从首帧起算而不在附着后立即再发；时钟 NaN/Infinity/非数/倒退/读取失败均为 consumer 故障，含附着读失败的延后报告与所有者附着的延后报告。
  - 关键事实：类型化帧替身中语义相同的新对象不提前发布；交互上下文、`mission.status`（以替身代表 P3-11 的新状态）、result readiness、flight readiness 与 result 内容变化即时发布，之后从该次重新采样。
  - 状态与运行：新运行（含 G-02/2 保持，tick 0、无帧请求、不读时钟）一次写入状态与 projection；hidden 保持后的 paused (hidden)；exit/dispose 清空 projection 与运行反馈；旧运行的帧通知不写入；晚绑定 faulted 运行只读诊断不登记；unbind 幂等、retired 绑定拒绝输入、一个桥接只服务一个会话。
  - 附着事务：直接绑定部分登记失败时撤销且 store 不变，可重试；消费者在附着中提交、后一个消费者失败时 store 不变；撤销失败为 `RollbackError` 且会话 `cleanupFailed`；状态通知中附着失败后继续观察到 faulted，从未报告已开始。
  - 反馈（[game-command-feedback.test.ts](../../../../../src/ui/game/game-command-feedback.test.ts)）：真实 Core 的 rejected/not-implemented 与帧末 projection 同一次写入；accepted 与 ignored 以类型化 `command-result` 替身覆盖；null、未知、其他消费者的 ID 不产生结果、不重提，重复投递只结算一次；user-pause、hidden、focus-loss、pointer-lock-exit 与 exit 取消（exit 的取消先对同步订阅可见，随后清空）；最近 10 个；参数错误、`command-queue-full`（256 满）、暂停中的提交与尚无运行的提交为 actionError 且无 pending；同一 commandId 在新 run 与新 owner 下隔离；收到结果后时钟失败仍先写结果再故障；域事件接收者失败时已收到的结果与 failure 取消同次写入，无 unconfirmed。
  - 真实故障（[game-command-feedback-fault.test.ts](../../../../../src/ui/game/game-command-feedback-fault.test.ts)，`vi.mock` 只在测试创建世界处注入，isolated 项目）：后续 step 的 Core 故障使已取走的批次（与 Runtime 错误的 `unconfirmed` 1–128 一致）记 unconfirmed、余下记 failure 取消；首个 step 故障时该批次也为 unconfirmed；录制容量停止先结算此前 tick 的结果，再以 `recording-capacity` 取消余项，随后写入 stopped。
  - 类型层面：以具体流程类型实例化 store 并传给桥接、反馈与 `useGame` 的临时检查通过（未提交）。
- **检查：** `pnpm typecheck`、`pnpm exec eslint src/ui/game` 通过；`pnpm check` 通过（228 个测试文件、6,802 个测试与生产构建）。
- **rubber-duck：** 采纳全部 3 个阻塞项与 1 个非阻塞项：附着期间消费者写入不生效（绑定在全部登记成功后才生效）；恢复 P1-06 的附着读时钟与延后报告，没有采样起点的首个新 tick 帧只起算不发布；取消结算不再发布 projection（原实现会在不重设采样起点的情况下发布）；命令类型不经访问器读取。审查认可每所有者一份 store、帧末暂存结果、故障时余下 pending 记 unconfirmed 与按字段比较状态。
- **simplify：** 结果暂存移入反馈，桥接以通用的 `frameEnd` 消费者钩子取代 `hold`；关键事实改为类型化记录并每帧只算一次；绑定生命周期合并为单一状态；反馈的 pending 查询按 store 列表身份缓存为集合；撤销复用 `attemptAll`，测试支持复用 `current()` 与共用的已开始夹具。未采纳：从 `platform/` 复用单调时钟包装（UI 不依赖平台适配，且桥接须校验任何注入的时钟）、store 结算改为索引（有界且只在突发时发生）、删除 `useGame` 与选择器（09 使用的计划接口）、删除 `attach(run)`（所有者登记为运行级消费者的入口）。
- **文档影响：** 工程约定与 ui 分册中正式 UI 桥接的说明由 15 编写（其工作范围已包含“UI 投影与指令反馈”的替换）；本项不改文档，P1-06 的合成说明在 13 之前仍准确。
