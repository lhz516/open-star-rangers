---
type: plan
status: accepted
phase: P1
task: "04"
updated: 2026-10-10
---

# P1-04：Runtime 调度、命令与事件分发 — Goal

## 目标与来源

落实已于 2026-10-02 批准的 [spec](./spec.md) 中 S-01 至 S-08、AC-01 至 AC-14：以调用者传入的毫秒时间戳驱动合成 Core，提供有上限的固定步长、输入与命令队列、帧末事件分发、两份 Render State 和可选录制。本文件不重新定义行为契约。

本目标只交付宿主无关的 app 层 Runtime。浏览器帧循环、暂停/继续/退出及会话资源清理由 P1-05 接入；本目标完成不等于整个 GameRuntime 退出项或 P1 通过。

## 代码现状与前提

### 现有代码与复用

- [synthetic-scene.ts](../../../engineering/source-structure.md#r1-合成-core) 已提供 `SyntheticSceneConfig`、`MoveInput`、`Command`、`TickInput`、`DomainEvent`、UI projection、Render State 及 `createSyntheticScene`。读取结果深冻结；`step` 同步返回事件，不调用消费者。
- 同文件已有 `readTickInput`，校验后返回一次取值的 `{moveX, commandTypes}`；Runtime 可用中性轴或空命令补齐临时 `TickInput`，复用轴/命令校验并重定位错误路径。场景配置仍交给真实创建入口验证，生效频率从场景读取，不能重读调用者 getter 得到另一份值。
- [errors.ts](../../../../src/core/errors.ts) 的 `CoreInputError` 已有 `path`、`reason`。Runtime 包装时保留原错误为 `cause`，不改 Core 错误或业务拒绝语义。
- [synthetic-replay.ts](../../../engineering/source-structure.md#r1-合成-core) 已提供 `SyntheticRecordingSession extends SyntheticScene`、`SyntheticRecording`、`createSyntheticRecordingSession`、`replaySyntheticRecord`、`compareSyntheticReplayResults`。录制内部独占新场景，导出已冻结；不得在 Runtime 另写录制器、哈希器或第二套世界。
- [录制测试](../../../engineering/source-structure.md#r1-合成-core) 有 getter 单次读取、调用者隔离、异常不入记录和多次导出的先例；[场景输入测试](../../../engineering/source-structure.md#r1-合成-core) 与[恢复测试](../../../engineering/source-structure.md#r1-合成-core)已有真实数值守卫证据。既有 Core 生产文件与测试均只读复用，不计划修改。
- [App](../../../../src/app/App.tsx) 是 app 目录当前唯一文件；[main](../../../../src/main.tsx) 使用 StrictMode，但尚无 Runtime。两者本目标不接线。`src/content/`、`src/platform/`、`src/render/`、`src/ui/` 的未来职责不在这里提前建空模块。

### 计划新增文件

以下文件目前均不存在；具体职责按子任务划分，不建立统一 schema、通用引擎或可替换 Core 的生产注入接口。

| 新文件 | 所属子任务与职责 |
|---|---|
| `src/app/runtime-errors.ts`、`src/app/runtime-errors.test.ts` | 01：共享 `GameRuntimeError` 及四类错误数据 |
| `src/app/fixed-step-clock.ts`、`src/app/fixed-step-clock.test.ts` | 02：内部时钟，毫秒换算、到期 tick、上限与 alpha；不持有 Core |
| `src/app/synthetic-event-bus.ts`、`src/app/synthetic-event-bus.test.ts` | 03：合成领域事件的同步订阅/分发与 `EventDelivery` |
| `src/app/synthetic-runtime.ts` | 04 创建，05 扩展：`SyntheticRuntimeOptions`、`SyntheticRuntime`、`createSyntheticRuntime`，私有场景、队列、输入和帧推进 |
| `src/app/synthetic-runtime.test.ts` | 04：创建、输入、时钟接线、两份 Render State 和读取隔离 |
| `src/app/synthetic-runtime-events.test.ts` | 04：命令关联、帧末分发、订阅副作用和重入 |
| `src/app/synthetic-runtime-fault.test.ts` | 04 创建，05 扩展：真实场景边界的受控故障、终止状态与录制例外 |
| `src/app/synthetic-runtime-recording.test.ts` | 05：可选录制、导出、replay 与模式等价性 |

`runtime-errors` 不依赖消费者；时钟与 Event Bus 只共享错误类型，彼此独立；`synthetic-runtime` 装配二者及真实 Core。时钟和 Event Bus 的推进/发布入口仅供 Runtime 内部使用，不经 `SyntheticRuntime` 暴露给 UI 或渲染器。

### 前提与验证环境

- **P1-02 已完成：** [最终对齐证据](../02/subtasks/05-final-alignment.md#完成证据)与现有 Core 类型/行为是直接前提。
- **P1-03 已完成：** [最终对齐证据](../03/subtasks/07-final-alignment.md#完成证据)记录 420 项测试与完整工程检查通过，最终提交为 `d71d184`。录制接线使其成为本目标的真实直接前提，阶段索引同步记录此依赖。
- **审批：** [spec 审批](./spec.md#审批)明确覆盖全部范围、14 项验收和技术决定 1–14；本 goal 已通过下方执行授权获批，完成状态仍以 tracker 为准。
- **工具链已存在：** [package.json](../../../../package.json)固定 Node/pnpm 和 `pnpm check`；[Vitest 配置](../../../../vite.config.ts)在 Node 环境发现 `src/**/*.test.ts`。[app](../../../../tsconfig.app.json)与 [node](../../../../tsconfig.node.json)类型程序均检查 Runtime，其中后者没有 DOM 声明。不新增 runner、依赖或配置。
- **检查：** 各实现子任务先跑所列目标测试，再运行 `pnpm check`；清理用 [simplify](../../../../.agents/skills/simplify/SKILL.md)，只覆盖该子任务列出的新文件及改动。06 核验最终完整检查和证据。
- **原版与外部前提：** 无原版资源、实机、浏览器、云凭据或部署前提。[U-008](../../../original/unknowns.md)仍未确认，本目标不采纳原版时钟推断。合成 Node 验证不能替代 P1-05/P1-10 的浏览器生命周期验收，也不声称跨运行时逐位一致。

## 验收覆盖

所有行最终均由 06 复核；下列编号表示实际拥有实现及针对性证据的子任务。

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 04、05 | 04 独占场景、配置取值与多实例隔离；05 独占录制会话 |
| S-02 | 02、04 | 02 精确时间序列、有限长帧、溢出拒绝；04 与真实 Core 联合断言 |
| S-03 | 04 | FIFO、0 tick 保留、commandId、输入单次取值与帧快照 |
| S-04 | 03、04 | 03 类型/订阅顺序/同步异常；04 帧末分发与后续 tick 意图 |
| S-05 | 04 | 0/1/多 tick 的前后状态、alpha、projection、旧输出隔离 |
| S-06 | 05 | 录制开关、JSON 往返、replay、通知序列及故障前缀 |
| S-07 | 01、02、03、04、05 | 01 错误数据；02 时间拒绝；03 监听器汇总；04/05 故障与 cause |
| S-08 | 01、02、03、04、05 | 各同目录测试；06 完整 `pnpm check` 与范围检查 |
| AC-01 | 04、05 | 创建缺省/undefined/null、非法字段、getter 与隔离；05 录制配置 |
| AC-02 | 02、04 | 50 Hz 精确边界；60 Hz 三种帧切分；04 输入采样反例 |
| AC-03 | 02、04 | 默认/自定义上限、恰好上限、重新锚定、同时间戳不重跑 |
| AC-04 | 02、04、05 | 时间倒退/非有限/差值及乘积溢出；对照状态、队列及录制不变 |
| AC-05 | 04 | add/add/remove 的 commandId=1/2/3、entityId=2；非法提交不耗 ID |
| AC-06 | 04 | 默认轴、50 Hz 积分、非法输入保留旧值、调用者隔离 |
| AC-07 | 03、04 | 类型负向、注册顺序、重复订阅、冻结 delivery；回调读到最终 tick/alpha |
| AC-08 | 03、04 | 订阅增删；04 延后命令/输入、0 tick 保留、捕获/未捕获重入 |
| AC-09 | 01、03、04、05 | 非 Error 异常汇总；04 不回滚监听器副作用、不重试；05 录制进度保留 |
| AC-10 | 04、05 | 并行裸场景逐 tick 对照、旧输出冻结；05 读取前后检查点不变 |
| AC-11 | 05 | 间隔 1/4，成功与拒绝、0 tick/capped 帧、JSON replay、两种模式等价 |
| AC-12 | 04、05 | 04 无录制的第 1/第 2 次 step 故障；05 成功前缀含未投递事件且 replay 一致 |
| AC-13 | 01、02、03、04、05 | 06 工程/类型/依赖/宿主 API/原版隔离检查，既有 Core 测试文件不变 |
| AC-14 | 04 | 分配前安全整数守卫与终止路径代码审阅；正常/非法递增自动验证 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-runtime-errors.md](./subtasks/01-runtime-errors.md) | — | completed |
| [02-fixed-step-clock.md](./subtasks/02-fixed-step-clock.md) | 01 | completed |
| [03-synthetic-event-bus.md](./subtasks/03-synthetic-event-bus.md) | 01 | completed |
| [04-runtime-command-loop.md](./subtasks/04-runtime-command-loop.md) | 01, 02, 03 | completed |
| [05-runtime-recording.md](./subtasks/05-runtime-recording.md) | 04 | completed |
| [07-scoped-cleanup-verification.md](./subtasks/07-scoped-cleanup-verification.md) | 01, 02, 03, 04, 05 | completed |
| [06-final-alignment.md](./subtasks/06-final-alignment.md) | 01, 02, 03, 04, 05, 07 | completed |

02 与 03 只需要 01 的错误契约，彼此无依赖；04 需要错误、时钟与总线才能建立完整帧边界；05 复用 04 的唯一 step 路径接入录制，而非另开循环。

最后一行始终为仅验证的最终对齐，依赖所有其他子任务。ID 保持稳定；新增修复项使用新 ID，插在 06 之前并加入其依赖，不在最终对齐中实现功能。

## 执行记录

- **2026-10-02 — 补齐清理检查流程：** 01–04 已在 rubber-duck 后调用 simplify 并做本地检查，但漏掉其四路独立审阅。05 已执行四路检查。新增 07，仅针对前四项各自原提交范围补齐独立复核与证据；不把补做时间记成原提交前已完成，不改变 spec。

## 审批

**2026-10-02 用户批准完整 Goal 并授权执行。** 用户调用 execute-goal 并写明“approve goal”，批准六个子任务及覆盖关系；另要求各代码子任务在 simplify 前先做 rubber-duck 审阅，并在每项完成时检查相关文档。批准不表示实现完成；只授权本地提交，不包含 push 或部署。
