---
type: plan
status: active
phase: P1
task: "06"
subtask: "06"
updated: 2026-10-02
---

# 06 — 应用 owner 装配与清理

**契约来源：** [spec](../spec.md) 的 S-07、S-08，AC-01（owner 初始无请求）、AC-09（初始化、部分接线与清理失败）、AC-12（Node 部分），行为表中的“React 卸载、StrictMode 重建、HMR”，以及技术决定 2、6、9。
**依赖：** 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新建 DOM-free 的 owner 装配函数，输入为 `SessionHost` 与 `() => number` 时钟。
  - 合成演示配置使用固定种子 0 与 Core 默认 tick 频率，不开启录制；页面显示实际 tickRateHz，这些数值不是原版规则。
  - 创建顺序：先建 store 与桥接，再以桥接的 onError 出口创建会话，然后绑定。
  - 返回只读 store 句柄、命令与控制 action，以及 dispose。
  - 不启动会话，不注册全局单例或 owner 登记。
- 初始化失败（如宿主订阅失败导致会话创建抛错）：`status=null`，写入 `actionError {operation:'initialize'}`，已取得的资源全部回滚，无残留请求或监听。
  - 部分接线失败：dispose 已创建的会话并解绑后再报告。
  - 报告失败时仍返回可读的 store，供面板显示。
- dispose：
  - 执行 `session.control({type:'dispose'})` 与 owner 级解绑。
  - 某一项抛错时，其余独立清理仍执行；随后抛出保留全部原因的错误，供 React 清理抛出或经 `reportError` 报告。
  - dispose 幂等。之后旧 action 与回调被拒绝或无效，不写入任何新 owner 的 store。
- 测试中模拟 StrictMode 的 owner 序列（建 A→销毁 A→建 B）：任一时刻最多一个活跃 owner、一个待交付帧请求和一组宿主生命周期监听。

## 不包含

- React hook、`createBrowserSessionHost()` 与 `performance.now` 的接线，以及 App 修改（07）。
- 真实浏览器中的 StrictMode/HMR 证据（08）。

## 关键文件与契约

- [synthetic-session.ts](../../../../../src/app/session/synthetic-session.ts) 的 `createSyntheticSession`（已有）；[session-host.ts](../../../../../src/app/session/session-host.ts) 的 `SessionHost`（已有）。
- [ControlledHost](../../../../../src/app/session/synthetic-session.test-support.ts) 的 pending/listeners/unsubscribed 计数与失败注入（已有，仅测试导入）。
- 01–04 计划新增的 `src/ui/game/` 模块（本项装配）。
- 计划新增：`src/app/composition/synthetic-demo-owner.ts`、`src/app/composition/synthetic-demo-owner.test.ts`。

## 验收标准

- [x] AC-01（owner）：创建后为 idle，store 初始值符合 spec，宿主待交付请求为 0，生命周期监听为 1；start 后请求为 1。
- [x] AC-09：初始化失败时 status=null、actionError 为 initialize 并保留原 cause，无残留；部分接线失败会回滚；dispose 中单项清理失败时其余仍执行，失败原因完整抛出。
- [x] AC-12（Node）：dispose 后请求与监听均为 0，重复 dispose 不重复清理；A→B 序列中最多一个活跃 owner/请求/监听组，A 的迟到回调与 action 不写入 B。
- [x] 装配文件 DOM-free，ui 不导入 app 装配；目标 Vitest 与 `pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/app/composition src/ui/game`；`pnpm check`。
- 使用 ControlledHost 的 `subscribeFailure`、`cancelFailure` 与可抛错时钟构造失败；请求、监听与撤销以计数和独立对照断言，不只观察 tick。
- 使用 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 时限定本项文件；在[源码结构指南](../../../../engineering/source-structure.md)记录 `app/composition/` 的实际职责。

## 完成证据

- 2026-10-02：实现 [synthetic-demo-owner.ts](../../../../../src/app/composition/synthetic-demo-owner.ts)。`createSyntheticDemoOwner(host, clock)` 依次创建 store、命令反馈、桥接与会话（`SYNTHETIC_DEMO_OPTIONS`：种子 0、Core 默认 60 Hz，均为合成值），不自动 start、不登记全局单例，只暴露只读 `store`、`dispatch(action)` 与 `dispose()`。动作路由放在 UI 层的 `createSyntheticPanelDispatcher`（[synthetic-game-controls.ts](../../../../../src/ui/game/synthetic-game-controls.ts)）。
- 测试：[synthetic-demo-owner.test.ts](../../../../../src/app/composition/synthetic-demo-owner.test.ts) 8 项通过；用 `vi.mock` 包装桥接工厂，以注入绑定前、绑定后与解绑失败：
  - AC-01（owner）：创建后为 idle，store 的其余字段为初始值，待交付请求 0、生命周期监听 1；dispatch start 后请求为 1，投影 tickRateHz=60。add-marker 先 pending，再经 Core 接受。
  - AC-09：
    - 会话创建时宿主订阅失败：status=null，actionError 为 initialize，cause 是带 scheduler 原因的 GameSessionError，无残留监听或请求；之后的 dispatch 不改 store，dispose 不抛错。
    - 绑定前或绑定后失败：会话被销毁、桥接解绑，宿主监听撤销 1 次，store 原子重置为 status=null。
    - 回滚的每一步都失败时：AggregateError 依次保留原因、会话清理失败与解绑失败。
    - dispose 时 cancelFrame 失败：仍撤销宿主监听，写入 actionError 的与抛出的是同一个 AggregateError（含 scheduler 原因）；重复 dispose 不抛错。
  - AC-12（Node）：dispose 后请求与监听归零，重复 dispose 不再清理，之后的 dispatch 被忽略。模拟 StrictMode 的“建 A→销毁 A→建 B”中，任一时刻至多一组请求与监听。B 启动后直接调用 A 被取消的帧回调与旧生命周期监听，并调用 A 的 dispatch：A、B 的 store 均不变，B 仍只有 1 个请求与 1 组监听，之后 B 正常推进。
- rubber-duck 的两个阻断问题与一个非阻断问题已采纳：
  - 初始化回滚原先只销毁会话、不解绑桥接，store 可能停在 disposed：改为两步都尝试，并原子重置 status=null。
  - StrictMode 测试原先没有真正调用 A 的旧回调：改为捕获并重放。
  - dispose 写入 store 的错误与抛出的不是同一对象：统一为同一个 AggregateError。
- simplify（四角度，各一个代理）：
  - reuse 与 efficiency 无发现。
  - 已采纳：抽出初始化回滚与 dispose 共用的 `release`；用单个可空的 `active` 记录取代 session/controls/disposed 三个重叠状态；动作路由移到 UI 层的 dispatcher。
  - 重验通过。
- 工程检查：`pnpm check` 通过（34 个文件 / 667 项测试、三个类型程序、ESLint、构建）。装配文件不使用 DOM 或 React；ui 不导入 app 装配。
- 文档影响：[源码结构指南](../../../../engineering/source-structure.md)增加 `app/composition/` 及其职责；[工程约定](../../../../engineering/README.md)记录 owner 的生命周期、回滚、dispose 与动作路由。原版事实与冻结决定无变化。
