---
type: plan
status: active
phase: P3
task: "04"
subtask: "07"
updated: 2026-10-10
---

# 07 — 开发诊断与录制导出

**契约来源：** [spec](../spec.md) 的 S-07 与[开发诊断](../spec.md#开发诊断)；AC-22，AC-16 的导出部分。
**依赖：** 04, 05, 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **DOM-free 模型**（计划新增 `src/ui/dev/`）：
  - 事件日志：订阅运行的全部事件，保留最近 500 条结构化摘要（tick、类型、主要字段、commandId），超出丢最旧项并标记已截断；可清空；新运行清空。
  - 帧统计：最近 120 个 `{ processingMs, ticks, capped }` 样本，给出平均与最大处理时长、tick 数统计与触顶帧数；按 UI 采样频率发布；非法时钟值报告错误，不记 0。
  - 命令编辑：可选择 16 个 Core 命令变体之一并填写其字段，提交前经 `readTickInput` 的规则校验，经正常运行句柄提交，结果进入 06 的命令反馈。
  - 实体与任务状态：点击刷新时读取一次快照，显示 tick、时钟、种子、setupHash、内容身份、任务状态、玩家状态、生成队列摘要与实体列表（ID、种类位、来源、位置、对象状态与活动、被毁标志、放置序号）；名称只显示引用。faulted 时禁用。
- **帧计时接线**（计划新增 `src/app/mission/dev-*.ts`）：开发装配包装会话宿主的帧回调，在同一次有效帧处理的开始与结束读取单调时钟，窗口包含 Runtime 模拟、帧后事件与帧消费者，不含等待下一 rAF 的时间；不另开循环。
- **录制导出：** 在通知边界之外同步取得同一成功 tick 的 `Recording`，序列化为紧凑 JSON，经 04 的文件保存端口保存；文件名只含校验过的 setupHash、uint32 种子与 finalTick；faulted 不提供新导出，stopped 可导出；保存失败不丢弃记录，可重试；提示重开、返回与 HMR 会丢弃未导出的录制。
- **开发面板**（计划新增 `src/ui/dev/MissionDevPanel.tsx`）：原生控件、标题层级、按区块分别订阅，不注册全局键盘监听。生产隔离由 09 在装配时完成（编译期剔除）。
- 随实现编写 Node 测试：模型、帧计时窗口、导出副本、文件端口失败与资源释放；没有诊断消费者时 Core 录制与有诊断时一致。

## 不包含

- 在任务画面中挂载面板与开发/生产装配分支（09）；开发浏览器下载核对（10）；生产产物检查（12）。
- 改变 Core 的录制格式或规则版本。

## 关键文件与契约

- 计划新增：`src/ui/dev/event-log.ts`、`frame-stats.ts`、`command-draft.ts`、`recording-export.ts`、`MissionDevPanel.tsx` 及测试；`src/app/mission/dev-frame-timing.ts` 及测试（文件名可调整）。
- 只读消费：[recording.ts](../../../../../src/core/replay/recording.ts)、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[tick-input.ts](../../../../../src/core/contracts/tick-input.ts)；04 的文件保存与时钟端口；05 的所有者登记接口；06 的命令反馈。
- 参照：[SyntheticDevPanel.tsx](../../../../../src/ui/dev/SyntheticDevPanel.tsx) 的面板结构（不复用其合成语义）。

## 写入范围

- `src/ui/dev/**`：计划新增的诊断模型、导出、面板与测试（不改 `SyntheticDevPanel.tsx`）。
- `src/app/mission/dev-*.ts`：计划新增的开发装配帧计时与测试。

## 验收标准

- [x] AC-22：日志 500/501、帧窗口 120/121、最近结果 10/11 的保留正确；帧处理窗口包含模拟与消费者，不把 rAF 间隔当处理耗时；非法时钟不报告 0。
- [x] AC-22：导出副本在后续 tick 后不变；保存失败可重试；对象 URL 与临时元素在成功、失败与释放时回收；新运行清空日志；没有诊断消费者时录制一致。
- [x] 命令编辑的 16 个变体都能构造合法命令，非法字段在提交前拒绝；尚无规则的命令得到带 commandId 的 `not-implemented` 结果。
- [x] faulted 时禁用快照与导出，stopped 时可导出。
- [x] `pnpm exec vitest run src/ui/dev src/app/mission` 与 `pnpm check` 通过。

## 验证方法

- Node：注入时钟与文件保存端口的替身，真实会话与合成任务。
- 开发浏览器下载与 Node 核对由 10 完成，生产中不存在由 12 核对；不适用原版对照。

## 完成证据

- **实现：**
  - [dev-frame-timing.ts](../../../../../src/app/mission/dev-frame-timing.ts)：`createFrameTiming(host, clock)` → `{ host, consumer, subscribe }`。`host` 包装所有者的 SessionHost（09 以它作为 `MissionOwnerSetup.host`），`consumer`（stage `ui`）为每个运行登记帧监听以取得帧报告。对未取消、未重复的回调，在调用会话回调之前与返回之后各读一次单调时钟；只有出现非空报告的帧给出 `{ processingMs, ticks, capped }` 样本（另带 `endMs` 与 `stop`）。时钟抛错、非有限或倒退给出 `clock-failed`，不给 0。不自行请求帧；连接前与释放后直通。
  - `src/ui/dev/`：[event-log.ts](../../../../../src/ui/dev/event-log.ts)（恰好 500 条的环形窗口、截断标志、清空）；[frame-stats.ts](../../../../../src/ui/dev/frame-stats.ts)（120 个样本的平均/最大处理时长、tick 总数/平均/最大、触顶帧，失败帧计数与最近原因）；[command-draft.ts](../../../../../src/ui/dev/command-draft.ts)（16 个变体的表单描述，类型要求列出每个变体与字段，经 `readTickInput` 校验后返回 Core 的规范副本，或字段与原因）；[entity-inspection.ts](../../../../../src/ui/dev/entity-inspection.ts)（快照的显示模型，名称只显示引用）；[recording-export.ts](../../../../../src/ui/dev/recording-export.ts)（文件名 `osr-recording-<setupHash>-<seed>-<finalTick>.json`，三部分逐一校验；原样的紧凑 JSON）；[mission-diagnostics.ts](../../../../../src/ui/dev/mission-diagnostics.ts)（`createMissionDiagnostics({ timing, fileSave })` → `{ consumer, reader, clearLog, refreshSnapshot, exportRecording, retrySave }`，以及 `selectCanRead`、`selectCanRetry`）；[MissionDevPanel.tsx](../../../../../src/ui/dev/MissionDevPanel.tsx)（props 为 `{ diagnostics, game, submitCommand }`）。
  - 发布：样本按其自身的结束读数每 100 ms（沿用桥接的 `PROJECTION_SAMPLE_INTERVAL_MS`）至多发布一次；状态变化、容量停止、时钟失败与用户操作立即发布。新运行清空日志、帧统计、快照与导出状态；运行结束（idle）时丢弃快照与保留的副本，日志与帧统计留到下一个运行。
- **AC-22 保留窗口：** [event-log.test.ts](../../../../../src/ui/dev/event-log.test.ts)：500 条不截断，第 501 条丢弃最旧一条并标记截断，2,345 条只保留最后 500 条，清空后为空；[frame-stats.test.ts](../../../../../src/ui/dev/frame-stats.test.ts)：120/121，最慢且触顶的首个样本随第 121 个离开；[mission-diagnostics.test.ts](../../../../../src/ui/dev/mission-diagnostics.test.ts) 的 `keeps the 10 most recent command results of 11`：经 06 的反馈，10 个结果为 1–10，第 11 个后为 2–11。
- **帧计时窗口：** [dev-frame-timing.test.ts](../../../../../src/app/mission/dev-frame-timing.test.ts)：回调内的模拟与消费者时间计入，帧之间的 16/50 ms 不计入。在真实所有者中，每个投递事件 2 ms、帧消费者 1 ms 精确出现在 processingMs 中，事件投递都在起止两次读取之间，3 帧共读 6 次。取消或重复的回调不计时、不读时钟；隐藏页面上暂停的帧没有样本；重开后的新运行以 runId 2 计时。时钟在开头抛错、在结尾抛错、返回 NaN、倒退四种情形都给出 `clock-failed`，帧照常运行；包装不额外请求帧。在诊断中失败只计入 `failedFrames`，样本数不变。
- **导出与保存：** 保存失败（click 抛错）后保留副本；2 个 tick 之后重试保存，文本与导出当时的 `JSON.stringify(run.exportRecording())` 完全相同（finalTick 3）。之后的新导出为 finalTick 5，先前的 Blob 不变。释放失败（revoke 抛错）同样保留副本。成功、失败与 cleanup-failed 后对象 URL 与临时链接全部回收（`SaveHost.released`）；所有者释放后文件保存返回 `disposed`，不再获取资源。
- **没有诊断时录制一致：** `keeps Core's recording identical with and without the diagnostics`：相同种子、帧与命令下，有诊断的运行（命令经编辑器与反馈提交，每次都刷新快照、导出，最后清空日志）与无诊断的运行，其录制 JSON 完全相同（finalTick 10）。
- **命令编辑：** [command-draft.test.ts](../../../../../src/ui/dev/command-draft.test.ts)：16 个变体的每个选项与数值上下限都构造出合法命令，且等于 Core 再次读取的规范副本；`0`、`2.5`、空、`0x3`、`1.01`、`NaN` 与未知选项都在提交前按 Core 的规则拒绝并指明字段。在真实运行中，16 个变体经反馈提交得到 commandId 1–16，日志中每个 `command-result` 带对应 commandId 与 `not-implemented`，store 的最近 10 个结果为 rejected/`not-implemented`。
- **faulted 与 stopped：** 帧消费者故障后 `selectCanRead` 为假，刷新与导出不改变状态，之前取得的快照仍在，之前保存失败的副本仍可重试。[mission-diagnostics-core.test.ts](../../../../../src/ui/dev/mission-diagnostics-core.test.ts)（isolated 项目，在录制会话处注入）：录制容量停止后可刷新快照（tick 2）并导出 finalTick 2 的前缀；快照或导出首次发现 Core 故障时运行转为 faulted、调度停止、错误显示在相应区块，已保留的副本仍可重试。
- **所有权与释放：** 诊断与帧计时都是 `ui` 阶段的所有者级消费者，运行级监听交给 `run.ownCleanup`。所有者释放时取消订阅并释放文件保存，之后的操作被忽略；释放失败由所有者锁存；连接时帧计时订阅失败则回滚（文件保存已释放）后原样抛出。
- **面板：** 原生 button、select、input、label 与 table，h3 标题、各区块 h4，各区块分别以 selector 订阅，不注册全局键盘监听；挂载与生产隔离归 09。一次未提交的服务端渲染冒烟以真实运行的数据渲染出 15 个实体行、事件日志、命令结果与录制状态，没有控制台错误。
- **检查：** `pnpm exec vitest run src/ui/dev src/app/mission`（13 个文件、151 个测试）通过；`pnpm check` 通过（243 个测试文件、6,960 个测试与生产构建）。
- **审查：** rubber-duck 没有阻塞问题；两项非阻塞问题已修复：事件日志改为恰好保留 500 条的环形缓冲，面板的提交确认只在其运行仍为当前运行时显示。simplify 采用了 `runCleanup`，删除未使用的 `latest` 与 `ownerId`，事件摘要原地冻结，草稿校验按草稿记忆。未采纳：从 Core 导出命令字段表（需修改 Core，超出范围；类型检查与测试已覆盖漂移）、Session 的帧完成钩子（超出范围）、诊断自定发布节奏（spec 要求与 UI 同频，因此沿用桥接的采样间隔）。
- **文档影响：** 本项写入范围不含文档；工程约定与 app、ui 模块分册中的诊断与帧计时说明由 15 编写。不读取 `local/`，不涉及原版对照。
