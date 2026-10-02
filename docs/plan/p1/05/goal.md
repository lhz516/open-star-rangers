---
type: plan
status: accepted
phase: P1
task: "05"
updated: 2026-10-02
---

# P1-05：会话与浏览器生命周期 — Goal

## 目标与来源

落实 [已批准 spec](./spec.md#审批) 的 S-01 至 S-08、AC-01 至 AC-14：在现有合成 Runtime 之上建立独立控制通道、唯一帧循环、身份隔离、后台暂停、资源清理和可观察错误。行为及技术决定以 spec 为准，本文件不重定规则。

浏览器验收是必需交付，不以 Node 代理通过。全部通过后可勾选 GameRuntime 退出项；真实 React StrictMode/HMR、键盘/UI/GPU 的联合生命周期仍属于 P1-10。

## 代码现状与前提

- **直接前提 P1-04 已完成：** [最终证据](../04/subtasks/06-final-alignment.md#完成证据)记录 21 文件、513 项测试和完整工程检查；最终提交 `7c576ff`。其传递前提 P1-02/03 提供真实 Core 与录制/replay，均已有完成证据。
- **现有 Runtime：** [synthetic-runtime.ts](../../../../src/app/synthetic-runtime.ts)定义 `SyntheticRuntimeOptions`、`RenderFrame`、`SyntheticRuntime` 和统一创建入口。其私有队列带 commandId，成功首 tick 才消费；没有重置时钟、清队列/轴、折叠状态对或清空订阅入口。02 添加这些显式操作，既有正常行为与测试不放宽。
- **现有内部设施：** [fixed-step-clock.ts](../../../../src/app/fixed-step-clock.ts)有时间基准/最后时间/相对 tick 数，无 reset；[synthetic-event-bus.ts](../../../../src/app/synthetic-event-bus.ts)提供类型化同步事件与幂等取消，无全量清理。[runtime-errors.ts](../../../../src/app/runtime-errors.ts)四种 kind 保持原样。
- **Core 只读：** 输入、领域事件、UI projection、Render State 归 [synthetic-scene.ts](../../../../src/core/synthetic-scene.ts)；录制格式、导出、replay 与结果比对归 [synthetic-replay.ts](../../../../src/core/synthetic-replay.ts)。会话数据归 app，不新增统一 schema 或 Core 生命周期字段。
- **测试先例：** [事件测试](../../../../src/app/synthetic-runtime-events.test.ts)覆盖帧末意图/重入；[故障测试](../../../../src/app/synthetic-runtime-fault.test.ts)在 Vitest 创建边界包装真实场景，仅在 step 前抛错。06 复用该方式，不给生产 API 添加故障开关。
- **计划新增文件，当前均不存在：**

| 新文件 | 责任子任务 |
|---|---|
| `src/app/session-host.ts` | 01：DOM-free SessionHost 与生命周期通知类型 |
| `src/app/session-errors.ts`、`src/app/session-errors.test.ts` | 01：GameSessionError 数据及类型/冻结测试 |
| `src/app/synthetic-runtime-lifecycle.test.ts` | 02：显式生命周期操作与既有行为对照 |
| `src/platform/browser-session-host.ts` | 03：真实 rAF/visibility/pagehide/pageshow 适配，无导入副作用 |
| `src/app/synthetic-session.ts` | 04 创建，05/06 扩展：控制器、SessionRun、状态及帧/取消通知类型 |
| `src/app/synthetic-session.test-support.ts` | 04：多个测试复用的可控宿主，只记录请求/通知/故障，不模拟世界 |
| `src/app/synthetic-session.test.ts` | 04：创建、控制、唯一调度、身份、后台与恢复 |
| `src/app/synthetic-session-consumers.test.ts` | 05：边界 FIFO、订阅、取消、资源所有权 |
| `src/app/synthetic-session-fault.test.ts`、`src/app/synthetic-session-replay.test.ts` | 06：失败汇总/恢复和录制/replay |

- **既有修改范围：** 02 修改 Runtime/clock/bus 的生产文件，新增测试；04–06 只接 app，会话消费者不能取得低层 frame 或总线发布。Core、App/main、依赖与配置不修改。
- **环境：** [工程约定](../../../engineering/README.md)、[package.json](../../../../package.json)与 [Vitest](../../../../vite.config.ts)已有 Node 测试和 `pnpm check`。app 的会话/端口由无 DOM 的 [node 类型程序](../../../../tsconfig.node.json)检查；platform 适配由 [app 类型程序](../../../../tsconfig.app.json)检查，不能为了导入适配器给 Core/Node 加 DOM。
- **验证入口：** 各实现项附目标 Vitest 和 `pnpm check`；错误/清理审阅遵循[工作流](../../../engineering/agent-workflow.md)。[simplify](../../../../.agents/skills/simplify/SKILL.md)限定当前项代码范围；各项检查 engineering/guides 的实际影响，不把通用执行策略复制在此。
- **浏览器前提：** 03/07 使用 [browser-testing](../../../../.agents/skills/browser-testing/SKILL.md)；需要隔离 Chromium、可运行本仓库 Vite、真实 rAF/可见性及可观察监听注册/撤销。当前没有 Playwright 项目依赖或 E2E 脚本，不新增 runner。工具不能制造真实 hidden 时须取得用户手动观测；都不可得则 07 阻塞，08 不能通过。
- **无其他外部前提：** 不用原版数据、GPU/媒体/快捷键实机、云凭据或部署。pagehide/pageshow 的适配事件探针不是 BFCache 命中证据。临时浏览器探针可使用公共模块，需移除，不作为生产页面交付。

## 验收覆盖

所有项最终由 08 核验；部分交付的完成不等于整项 AC 通过。

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01、04 | 04 配置副本、runId/句柄、单实例与分配前审阅 |
| S-02 | 04、05 | 04 状态表；05 通知边界内控制 |
| S-03 | 02、04 | 02 重锚/折叠；04 代次隔离；07 实际 rAF |
| S-04 | 03、04、05 | 04 环境策略；05 边界内通知；03/07 真实适配 |
| S-05 | 02、04、05 | 02 清意图返回 ID；04 输入状态门；05 取消与 FIFO |
| S-06 | 04、05 | 05 订阅/资源；07 真实监听撤销 |
| S-07 | 01、04、05、06 | 01 错误数据；各行为自带失败测试；06 汇总/恢复 |
| S-08 | 01–07 | 各针对性检查；08 工程/文档/范围核验 |
| AC-01 | 01、04 | 配置/端口/onError 校验、单次取值、无残留初始化、身份上限审阅 |
| AC-02 | 04、05、06 | 状态表、旧句柄、幂等、cleanupFailed 持续阻断 |
| AC-03 | 03、04、06 | 可控宿主的唯一请求/handle=0/复用/迟到；06 取消失败；07 实际 rAF |
| AC-04 | 02、04、06 | 50 Hz 原样时序、折叠与恢复、较早新锚、06 录制三 tick |
| AC-05 | 02、04、05、06 | 清意图不改世界；取消一次/原因、暂停拒绝；06 不入记录 |
| AC-06 | 05、06 | 域/帧/静止通知内 FIFO、宿主通知、非法排队控制及故障收尾 |
| AC-07 | 03、04、05 | 隐藏/离页阻断、手动暂停原因；07 真实 hidden |
| AC-08 | 02、04、05 | 折叠、0 tick 帧、通知顺序、冻结与注册/取消 |
| AC-09 | 05、06 | 逆序/至多一次、release、清理失败；07 真实监听解除 |
| AC-10 | 01、04、05、06 | phase 映射、错误列表、一次 onError、AggregateError、无效迟到帧 |
| AC-11 | 04、05、06 | 初始化/首次 request、可读成功前缀、清理阻断与安全重启 |
| AC-12 | 06 | 1/4 间隔、暂停/隐藏/重启、JSON replay 与模式对照 |
| AC-13 | 03、07 | 03 真实适配绑定；07 完整 Chromium rAF/visibility/清理证据 |
| AC-14 | 01–06 | 08 完整检查、旧 Runtime 回归、文档、只勾 GameRuntime |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`；证据在对应 subtask。所有依赖完成后才能开始。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-host-error-contracts.md](./subtasks/01-host-error-contracts.md) | — | completed |
| [02-runtime-lifecycle-primitives.md](./subtasks/02-runtime-lifecycle-primitives.md) | — | pending |
| [03-browser-session-host.md](./subtasks/03-browser-session-host.md) | 01 | pending |
| [04-session-controls-scheduler.md](./subtasks/04-session-controls-scheduler.md) | 01, 02 | pending |
| [05-consumer-boundaries-cleanup.md](./subtasks/05-consumer-boundaries-cleanup.md) | 04 | pending |
| [06-failure-recovery-replay.md](./subtasks/06-failure-recovery-replay.md) | 05 | pending |
| [07-browser-lifecycle-evidence.md](./subtasks/07-browser-lifecycle-evidence.md) | 03, 06 | pending |
| [08-final-alignment.md](./subtasks/08-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07 | pending |

01 与 02 互不依赖；03 只依赖宿主契约，04 的可控调度不依赖浏览器适配器。05 使用已成立的运行身份/控制器边界，06 验证完整消费者清理与错误恢复，07 才联合真实宿主和完整会话。

08 仅验证，不实现功能；后续修复使用新 ID，插在 08 前并加入其依赖，不重编号或复用 ID。

## 执行记录

## 审批

**2026-10-02 用户批准完整 Goal 并要求本地提交。** 用户明确回复“approve goal and commit”，批准本计划的八个子任务、依赖与验收覆盖，并授权提交当前规划文档。status 为 accepted，不表示实现完成；所有子任务仍为 pending，本次不开始执行或 push。
