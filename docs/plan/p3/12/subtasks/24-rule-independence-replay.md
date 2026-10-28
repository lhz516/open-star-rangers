---
type: plan
status: active
phase: P3
task: "12"
subtask: "24"
updated: 2026-10-17
---

# 24 — 规则独立与批次分组不变

**契约来源：** [spec](../spec.md) 的 AC-17；[验证策略](../spec.md#验证策略)。
**依赖：** 13, 14, 23。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 用 `ControlledHost` 驱动正式 Runtime 与 Session，保持逐 tick 输入相同而改变帧分组（1 tick/帧、5 tick/帧、插入 0 tick 帧），分别在无表现消费者、有表现模块与渲染逻辑（记录表面）、不绘制、模拟上下文丢失与已处理设备不可用下运行，断言相同 tick 的事件、检查点与状态哈希一致。
- 有表现的运行在同一注入表现种子下，选择与派生状态不因批次分组而改变。
- 契约异常另测故障前缀与停止，不宣称故障后继续完成。
- 代码边界审阅：表现代码不提交命令、不设置意图、不调用 Core。

## 不包含

- 新功能（交回相应子任务）。

## 关键文件与契约

- 现有：[game-session-replay.test.ts](../../../../../src/app/session/game-session-replay.test.ts)、[game-session.test-support.ts](../../../../../src/app/session/game-session.test-support.ts)。
- 计划新增：`src/app/session/game-session-presentation.test.ts`。

## 写入范围

- `src/app/session/game-session-presentation.test.ts`：集成测试。
- `src/app/session/game-session.test-support.ts`：必要的测试辅助。

## 验收标准

- [x] AC-17：各组合下事件、检查点与哈希一致；表现派生状态不因分组改变；故障前缀另测。
- [x] `pnpm exec vitest run src/app/session` 通过。

## 验证方法

- Node Runtime/Session 集成与 replay 测试；代码审阅结论写入完成证据。

## 完成证据

- **测试：** [game-session-presentation.test.ts](../../../../../src/app/session/game-session-presentation.test.ts) 22 项（约 4 秒）。正式 Session 与 Runtime 在 `ControlledHost` 上运行合成 `mission-startable` 包（不读原版文件），输入按 mission owner 的方式解码，只在内存中修改：类型 7、8 不移动且碰撞体积放大，使第 2–5 tick 摧毁 8 架飞行器（含玩家），7 次 Core 爆炸，表现模块另生成 10 次额外爆炸，选择项多样。飞行内容由 `prepareFlightContent(flightContentOf(groups))` 准备；运行在出发等待中（tick 0）经生产函数 `wireFlightRun` 接线，与飞行消费者相同，传入的运行句柄只含 `runId`、`renderFrame`、`onFrame`、`ownCleanup`。
  - 逐 tick 输入相同，只在 5 的倍数 tick 改变；60 tick 分成三种分组：1 tick/帧、5 tick/帧，以及 0–5 tick/帧（含插入的 0 tick 帧）。
  - 表现组合：无表现、记录表面上绘制、不绘制（无正尺寸）、上下文丢失（tick 10 丢失、30 恢复）、WebGL 2 不可用（`unavailable`）、设备失败（tick 20 起 `GraphicsDeviceError`，`failed`）。
  - 断言：每个组合在每种分组下，Core 送出的事件、录制输入、逐 tick 检查点与状态哈希都等于无表现、1 tick/帧的基线。基线录制经 `replayRecord` 重放一致。
  - 断言：所有有表现的组合中，每个 tick 的 `PresentationTick`（步首/步末相机与激活及其选择）、`explosions()`、`fragments()`、`flashRequests(tick)`，都等于绘制组合、1 tick/帧运行的结果。
  - 断言：在每个块末帧（alpha 0），已绘制帧的摘要（逐 pass 的场景、相机、目标与清除，逐对象的变换、几何哈希、材质与 uniform/纹理数据）同样等于该基线。丢失或失败期间缺少的帧完全符合预期；渲染器状态与绘制计数也按组合核对。
- **故障前缀与停止：** 篡改交给接线的帧，用 tick 11 的输出代替 tick 12 的输出，触发生产代码的批次连续性检查（`PresentationError` `invalid-input`，`consumer` 故障）。在 5 tick 与混合分组中，tick 12 位于多 tick 帧的中间。
  - Runtime 已运行完含该 tick 的整帧；该帧导出的录制输入、事件、检查点与哈希等于基线前缀。
  - 表现记录等于基线 tick 1–11；该帧未绘制。
  - 之后不再请求帧，`snapshot()` 被拒绝，表现模块已释放，本运行 GPU 资源为零。不宣称故障后继续。
- **变异核对（已还原）：** 把整帧一次交给表现模块时，测试被生产守卫拦下而失败。在 `flight-run.ts` 中每帧多抽取一次表现随机数时，5 tick 与混合分组的表现与画面比较失败。
- **代码边界审阅：** `src/render/flight/**`（非测试）中没有 `submitCommand`、`setIntent`、`control(` 或 Core 世界创建、推进、快照的调用。对 `core/` 的值导入只有纯规则辅助、常量与类型：`rules/*`、`contracts/*`、`view-switch` 常量、`entity-table` 的 `frozenVec`/`combatTypeOf`/`FRAGMENT_KIND_BIT` 与 `RandStream`。对 `app/` 只导入类型与 `RollbackError`。`FlightRunHandle` 只取上述四个成员，测试也只传这四个成员。无表现与各表现组合的 Core 结果一致，佐证表现不影响 Core。
- **发现（未在本范围修复）：** 玩家在 tick 2 被毁后，其爆炸在 tick 100 开始。逃生舱碎片以 `parts-0-2` 显示，但合成生产包的 `model/player-ship` 列表 1 只有 1 个部件。Core（`checkDebris`）只要求至少 1 个部件，渲染器（`fragmentLook`）要求至少 3 个，于是在飞行中途以 `ContentContractError` 使消费者故障，而不是在运行开始时拒绝。本测试因此在 tick 60 结束，已报告协调者。
- **检查：** `pnpm exec vitest run src/app/session` 通过（9 个文件、199 项）；`pnpm check` 通过（382 个文件、10,599 项测试、lint、typecheck、build）。
- **Rubber-duck：** 采纳两项。最终帧摘要过窄，改为每个块末帧的完整摘要，包括相机、变换、材质 uniform 与纹理数据。自定义订阅者抛错改为真实的批次异常，并比较故障帧的录制检查点与哈希前缀。
- **Simplify：** 采纳：包输入只解码一次；静态缓冲按 `version` 缓存哈希；设备事件 tick 命名为常量；`PICTURES` 改为 `as const`。原先用 Proxy 记录接线读取了哪些成员，现改为只含四个成员的句柄，由构造保证。
  - 未采纳：把规格构建或帧摘要移到共享测试辅助（目前只有一处使用；帧摘要应放在 `render-surface.test-support.ts`，不在写入范围内）；取消逐帧导出（故障后不能再导出录制）。
- **文档影响：** 无需更新。本子任务只新增测试，工程约定、指南与原版事实不受影响；渲染器文档按计划由 28 处理。上面的发现由协调者决定后续处理。

