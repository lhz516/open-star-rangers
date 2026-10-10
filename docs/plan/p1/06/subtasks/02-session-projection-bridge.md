---
type: plan
status: active
phase: P1
task: "06"
subtask: "02"
updated: 2026-10-10
---

# 02 — 会话状态绑定与投影采样

**契约来源：** [spec](../spec.md) 的 S-02、S-05（状态与 sessionError）、S-07（运行隔离），AC-01、AC-02、AC-03（状态部分）、AC-10（Node 暂停部分）、AC-12（运行切换），以及“发布频率与立即边界”与技术决定 2、3、6、9。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新建 owner 级会话桥接，输入为 `SyntheticSession` 和装配层注入的 `() => number` 毫秒时钟。
  - 提供 onError 出口，供装配层创建会话时传入：只同步写入 `sessionError`，不调用控制，也不抛出。
  - 提供解绑入口。
  - 桥接不创建会话或宿主，不使用 rAF、interval 或 timeout。
- 订阅控制器 onStatus：每次通知同步写入 `status`，绕过采样窗。
  - idle/disposed 时清空 projection 与运行字段（pending、recentResults）。
  - 新运行成功开始时清空 sessionError，与 Session 清除 error 的时机一致。
- 运行接线：
  - 状态显示新的 running/paused 运行，或绑定时已有这样的运行，则立即读取 `run.uiProjection()` 发布，记录已发布的 owner+runId+tick，并以时钟值建立采样基准。
  - 在该运行注册 onFrame；按技术决定 6，运行级状态由 `ownCleanup` 归属 Session。
  - faulted 运行只读取最后成功投影用于诊断，不注册资源。
  - 晚接线不依赖历史事件。
- 采样规则：
  - 同一运行同一 tick 不重复写入；0 tick 帧不单独触发写入。
  - 距上次发布不少于 100 ms，且最新 tick 尚未发布时，发布当前帧的 projection 并重建基准。
  - 静止帧（paused、report=null）上若最新 tick 未发布，则立即发布。
  - 帧稀疏时不补发历史快照。
- 时钟必须为有限、单调不减的毫秒值，运行切换时重建基准。读取抛错、NaN/Infinity 或倒退时，在监听器内同步抛出，由 Session 记为 consumer 故障并经 sessionError 显示；不默认为 0，不静默跳过。
- 所有回调同时校验 owner 绑定与当前 runId；旧运行或旧 owner 的迟到通知不能写入当前视图。
- 为 03/04 提供同模块内的“最新 tick 未发布则立即发布”入口，不暴露给组件。

## 不包含

- 命令提交与结果关联（03）；取消结果、unconfirmed、控件可用性与控制 action（04）。
- 应用装配、浏览器宿主与 React（06/07）。
- 修改 Session、Runtime 或 Core。

## 关键文件与契约

- [synthetic-session.ts](../../../../engineering/source-structure.md#r4-合成会话)（已有，只读复用）：`SyntheticSession.onStatus/currentRun/status`、`SessionRun.onFrame/ownCleanup/uiProjection`、`SessionFrame`。
- [ControlledHost](../../../../engineering/source-structure.md#r4-合成会话)（已有测试支持，仅测试导入）。
- 01 计划新增的 store 写入口（本项使用）。
- 计划新增：`src/ui/game/synthetic-session-bridge.ts`、`src/ui/game/synthetic-session-bridge.test.ts`。

## 验收标准

- [x] AC-01：绑定 idle 会话后，status 为 idle、projection 为 null，宿主无帧请求。start 后立即得到 tick=0 投影，与 `run.uiProjection()` 深相等。晚接线到已有 marker 的 running 或 paused 运行时，无需事件即可显示 marker。
- [x] AC-02：初次绑定 t=0 发布后，Core 持续推进的 99/100/199/200 ms 帧依次为不发布/发布/不发布/发布，且每次取最新投影。稀疏的 450 ms 帧只发布一次；0 tick 与同一 tick 不重复写入。NaN、Infinity、倒退与读取抛错均成为 consumer 故障并显示 sessionError。
- [x] AC-03（状态部分）：采样窗内 phase、pauseReason、environmentVisible、cleanupFailed、error 的变化在同一通知边界写入；暂停静止帧发布未发布的 tick；正常帧不存储 RenderFrame。
- [x] AC-10（Node）：暂停后跨帧 tick 不变且无采样写入；继续后的首帧不补发历史。
- [x] AC-12（运行部分）：restart/exit/failure 后旧运行绑定结束，旧回调不能写入；新运行从 tick 0 重新接线；idle/disposed 清空投影。
- [x] 目标 Vitest 与 `pnpm check` 通过，桥接文件 DOM-free。

## 验证方法

- `pnpm exec vitest run src/ui/game/synthetic-session-bridge.test.ts`；`pnpm check`。
- 使用真实 Session 与 ControlledHost，分别控制宿主 nowMs 和桥接时钟。Runtime 首帧只锚定，因此需安排宿主时间，使 99/100/199/200 ms 帧都有 tick 前进；记录每次 store 发布的时钟值、runId 与 tick。
- 隐藏通知用 `host.emit` 驱动，覆盖 environmentVisible/pauseReason 的即时写入；故障错误出口按实际 GameSessionError 断言。
- 使用 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 时限定本项文件；检查[工程约定](../../../../engineering/README.md)是否需要记录桥接与采样规则。浏览器可见性证据归 08。

## 完成证据

- 2026-10-02：实现 [synthetic-session-bridge.ts](../../../../engineering/source-structure.md#r6-合成-ui-层)：`createSyntheticSessionBridge(store, clock, consumers)` 提供 bind/unbind/currentRun/onError，并为 03/04 留出 `SyntheticRunBinding`/`SyntheticRunConsumer` 扩展点（consumer 只能写 addPending/settle）。测试支持 [synthetic-ui.test-support.ts](../../../../engineering/source-structure.md#r6-合成-ui-层) 组合真实 Session、`ControlledHost`、可控时钟和记录监听的会话包装。
- 测试：[synthetic-session-bridge.test.ts](../../../../engineering/source-structure.md#r6-合成-ui-层) 19 项（UI 目录合计 25 项）通过：
  - AC-01：绑定 idle 时 status=idle、projection=null、待交付请求为 0；start 立即得到与 `run.uiProjection()` 深相等的 tick 0 投影。晚绑定到已有 marker 的 running/paused 运行时，无需事件即可读到 marker。
  - AC-02：宿主与采样时钟分开控制，依次在 0/99/100/199/200/450/500/560/700 ms 送帧。发布记录精确为 `[[0,0],[5,100],[10,200],[15,450],[16,560]]`：560 是 0 tick 但到期且 tick 16 尚未发布的帧；700 是同 tick 帧，不再写入。NaN、Infinity、非数字与倒退值均成为 consumer 故障，sessionError 与错误出口相同，并保留最后成功投影。
  - AC-03（状态部分）：隐藏通知在同一边界写入 paused/hidden/environmentVisible=false，暂停静止帧立即发布未发布的 tick 2；可见后仍 paused；release 失败后 cleanupFailed 立即可见。store 不含 RenderFrame。
  - AC-10（Node）：暂停后无请求、无发布；恢复首帧不补发，下一 tick 到期才发布 `[6,5020]`。
  - AC-12（运行部分）：restart 后用记录的旧 run 1 帧监听送入伪造帧，store 不变；新运行从 tick 0 接线；exit/dispose 清空投影，unbind 幂等，宿主监听与请求归零。
- rubber-duck 四个阻断问题全部采纳，各自有回归测试：
  - 隐藏时 start 的运行没有帧，延迟的时钟失败会永远不报告：已暂停运行附着时不读时钟，改在恢复后的首帧锚定基准。
  - consumer 附着失败会让 store 停在 running 并丢失状态订阅：附着改为事务性，注册全部成功后才写入；失败时逆序撤销，并在重新订阅状态后再抛出。另覆盖直接绑定的部分失败。
  - 立即发布时时钟失败会丢弃已收到的结果，使其被误标为 unconfirmed：改为先写入结果与投影，再抛出。
  - 错误出口未按 owner 隔离：桥接成功绑定后只服务一个会话，只有首次绑定失败可以重试；附着时只在会话 error 为空时清空 sessionError。
- simplify（四个角度，分两个审查代理）：
  - 已采纳：抽出共用的 cleanup 排空、已锚定的同 tick 帧不读时钟、consumer 写入面收窄为 addPending/settle、测试包装按 run 复用。
  - 未采纳“去掉 live 标志”与“故障后 binding 仍可写”：live 在 Session 结束运行时由 ownCleanup 置 false，早于状态通知，故障后 binding 已不可写。
  - 未采纳“删除未用的事件与取消监听记录”：03/04 要用它们重放旧通知。
  - 采纳后重验全部通过。
- 工程检查：`pnpm check` 通过（29 个文件 / 623 项测试、三个类型程序、ESLint、构建）。桥接无 DOM 或 React 导入。
- 文档影响：[工程约定](../../../../engineering/README.md)新增“UI 投影与指令反馈”一节，覆盖 store、桥接采样、时钟失败、事务附着与单会话生命周期；[源码结构指南](../../../../engineering/source-structure.md)补充桥接文件。原版事实、冻结决定与指南无变化。
