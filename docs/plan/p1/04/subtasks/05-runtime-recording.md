---
type: plan
status: active
phase: P1
task: "04"
subtask: "05"
updated: 2026-10-10
---

# 05 — 可选录制与故障导出一致性

**契约来源：** [spec](../spec.md) 的 S-01、S-06、S-07、S-08，AC-01、AC-04、AC-09、AC-10（录制部分）、AC-11、AC-12、AC-13，以及技术决定 9、10。
**依赖：** 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 完成 `SyntheticRuntimeOptions` 的可选 `recording: {checkpointInterval}`：省略/undefined 关闭；null、额外字段、缺失或非法间隔明确拒绝，path 以 `options.recording` 开头。没有默认间隔。
- 开启时仅创建并独占 P1-03 `SyntheticRecordingSession`，关闭时仍创建普通场景。两种模式共用 04 的时钟、队列、输入、事件和投影路径，每个 tick 只 step 一次；不先创建裸场景再另建录制世界。
- `exportRecording()` 关闭时为 null，开启时转交真实 `SyntheticRecording`。导出与旧输出隔离、深冻结、无副作用，导出后可以继续。
- Core 事件保持原样，Runtime 的 commandId/帧时间/订阅信息不进入记录。更大的间隔只减少检查点，不丢弃输入或事件。
- 增加跨模式对照、非法调用不入记录、监听器失败后已提交记录不回滚的测试。故障帧保留已成功 tick 及其未投递事件，失败 tick 不入记录，导出仍可 replay 一致。
- 完成全部公共 Runtime 接口与已批准形状，不增加存储、截断策略、恢复接口或依赖。

## 不包含

- 不改 P1-03 记录格式、哈希、replay 比对器或 Core 错误原子性。
- 不将 Event Bus 投递重放成世界，不把故障导出当作完整通知日志。
- 不做玩家录制界面、IndexedDB/localStorage、文件保存、浏览器回放或性能承诺。

## 关键文件与契约

- `src/app/synthetic-runtime.ts`（04 计划交付，本项修改）：创建分支、recording 选项与 export。
- `src/app/synthetic-runtime-fault.test.ts`（04 计划交付，本项扩展）：相同真实创建边界的录制模式故障，保留原无录制断言。
- 计划新增 `src/app/synthetic-runtime-recording.test.ts`：完整录制与 replay 集成测试。
- [synthetic-replay.ts](../../../../engineering/source-structure.md#r1-合成-core)（已有，只读）：`SyntheticRecordingSession`、`SyntheticRecording`、录制创建/导出/replay/比对。
- [录制测试](../../../../engineering/source-structure.md#r1-合成-core)（已有，只读）：配置/input 单次取值、副本冻结与失败不入记录的先例。

## 验收标准

- [x] AC-01：完整录制参数的合法/非法/undefined/null 路径准确，保留 Core cause；创建配置 getter 与普通模式一样只使用同次取值。
- [x] AC-04：非法时间和换算溢出前后导出完全相同；随后有效帧与未进行非法调用的实例相同。
- [x] AC-09、AC-10：监听器抛错不回滚已成功的记录；任意读取与导出不改变检查点；早期导出在后续运行后不变。
- [x] AC-11：间隔 1、4，各覆盖 moveX=−1/0/0.5/1、add/remove 成功、两种业务拒绝、0 tick 与 capped 帧；记录恰含实际成功的逐 tick 输入。JSON 往返后 replay 与导出结果一致，并另行比较事件与检查点。
- [x] AC-11：无 Core 故障时，全程未取消的一个 onAny 所收到事件与 result.events 相同；record/event 无 commandId 或帧时间。相同调用序列下开启/关闭录制的帧报告、状态对、projection 和通知完全等价。
- [x] AC-12：50 Hz、0→60 ms、第二次 step 在推进前失败，只导出 tick 1 及其 added 事件，监听器无本帧通知，previous/current 为 0/1、alpha=0；该导出 replay 一致。首 step 失败则只有初始检查点和空输入/事件。
- [x] AC-12：故障后拒绝 frame/submit/setInput，读取/导出/取消仍可用，解除测试注入也不恢复；原 cause 保留。
- [x] AC-13：旧 Core 测试文件不变；针对性测试、`pnpm check` 和限定范围清理复验通过。

## 验证方法

- `pnpm exec vitest run src/app/synthetic-runtime-recording.test.ts src/app/synthetic-runtime-fault.test.ts src/app/synthetic-runtime.test.ts src/app/synthetic-runtime-events.test.ts`。
- 正常路径全部使用真实录制会话与 `replaySyntheticRecord`、`compareSyntheticReplayResults`，不能只把一份对象和自身比较；使用新 replay 实例及独立 onAny 记录。
- 故障测试仅沿用 04 的 Vitest 包装边界，包装真实录制会话，在调用它的第 1/第 2 次 step 前抛错；不能在录制已经提交之后再抛错来假冒 Core 原子失败。异常后 JSON 往返 replay 导出，精确检查成功前缀。
- `pnpm check`；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 仅清理本项两个修改文件与一个新增文件，不扩大到 Core 或已完成子任务。
- 无浏览器、实机、原版或存储迁移要求；浏览器复用记录由 P1-10 验证。

## 完成证据

- 2026-10-02：[录制集成测试](../../../../engineering/source-structure.md#r3-合成-runtime) 12 项、[故障测试](../../../../engineering/source-structure.md#r3-合成-runtime) 4 项通过；最终 `pnpm check` 21 文件、513 项通过，typecheck/lint/build 成功。
- rubber-duck 确认只有一份场景、成功 step 才入记录、故障注入在真实提交之前；按建议强化 recording.* 错误路径、录制创建的 Core cause 和非法调用后的独立对照实例。
- 随后执行 simplify 四个独立角度检查。移除冗余 recording 引用/双参数，Runtime 只保留一个场景，通过实际能力导出。保留创建前的三行间隔校验（unknown → number 的边界且在分配场景前失败）；不删除 spec 明确要求的 checkpoint/replay/冻结集成断言，避免把必需验收当作重复测试删掉。
- 文档检查：更新 [engineering](../../../../engineering/source-structure.md#r10-菜单入口键位与工程文档) 的开启方式、内存边界与故障导出语义；没有新的持久化/浏览器操作，guides 无需新增步骤。
