---
type: plan
status: accepted
phase: P1
task: "06"
updated: 2026-10-02
---

# P1-06：UI projection 与 React 指令闭环 — Goal

## 目标与来源

落实[已批准 spec](./spec.md#审批) 的 S-01 至 S-08、AC-01 至 AC-15：在 P1-05 会话控制器之上建立 Zustand vanilla 投影 store、10 Hz 采样桥接、命令请求与结果反馈、会话控制与错误出口、应用 owner 装配和合成开发面板。行为、数据形状和技术决定 1–9 以 spec 为准，本文件不重定规则。

浏览器证据是必需交付：AC-10 的实际 hidden、AC-11 的 React 提交计数、AC-12 的 StrictMode/卸载/HMR、AC-13 的 DOM 与键盘交互都不能用 Node 代理通过。证据留在本 goal/subtask，供 P1 阶段评审核对；按 [ADR-0014](../../../decisions/ADR-0014-status-summary-only.md) 不更新 STATUS 退出项。Three.js、键盘游戏输入与 P1-10 联合回归不在本目标内。

## 代码现状与前提

- **跨任务前提 P1-05 尚未最终对齐：** 生成本 goal 时，[P1-05 tracker](../05/goal.md#子任务跟踪)的 01–07 为 completed，[08 最终对齐](../05/subtasks/08-final-alignment.md)为 pending。开始 01 前须确认 P1-05 的 08 为 completed，且完成证据覆盖其 AC-01 至 AC-14；否则 01 应记为 blocked，恢复条件为该证据存在。目录迁移验证或 01–07 的局部证据不能代替。
- **Core（只读）：** [synthetic-scene.ts](../../../../src/core/synthetic/synthetic-scene.ts) 定义 `Command`、`DomainEvent`、`SyntheticUiProjection`；[synthetic-replay.ts](../../../../src/core/synthetic/synthetic-replay.ts) 提供 `replaySyntheticRecord` 与 `compareSyntheticReplayResults`。本目标不改 Core、合成规则或录制格式。
- **Runtime/Session（只读复用）：** [synthetic-session.ts](../../../../src/app/session/synthetic-session.ts) 提供 `createSyntheticSession(options, host, onError)`、`SyntheticSession`、`SessionRun`、`SessionStatus`、`SessionFrame`、`SessionCommandsCancelled`、`SessionControl`；[synthetic-event-bus.ts](../../../../src/app/runtime/synthetic-event-bus.ts) 提供 `EventDelivery.commandId`；[session-errors.ts](../../../../src/app/session/session-errors.ts) 定义 `GameSessionError`。已有行为：
  - 状态通知中可为新的 running/paused 运行注册消费者。
  - 转换通知顺序为取消→静止帧→清理→状态→onError。
  - 故障运行可读最后成功投影，但拒绝注册与输入。
  - 如需修改这些 app 契约，属于 spec 外变更，须先停下。
- **平台：** [browser-session-host.ts](../../../../src/platform/browser/browser-session-host.ts) 的 `createBrowserSessionHost()` 实现真实 rAF/visibility/pagehide/pageshow，只在应用装配中创建。
- **测试先例：**
  - [ControlledHost](../../../../src/app/session/synthetic-session.test-support.ts)：可控请求、可见性与失败注入。
  - [会话故障测试](../../../../src/app/session/synthetic-session-fault.test.ts)：在 Vitest 创建边界包装真实场景，注入 step 失败。
  - [会话录制测试](../../../../src/app/session/synthetic-session-replay.test.ts)：真实 Session 与裸 Runtime 的 replay 对照。
  - UI 测试复用这些方式，不给生产 API 加测试后门。
- **应用入口：** [App.tsx](../../../../src/app/App.tsx) 仍为占位页；[main.tsx](../../../../src/main.tsx) 已启用 StrictMode，本目标不修改 main。
- **依赖：** [package.json](../../../../package.json) 已有 React 19.3，尚无 Zustand。生成时 npm `latest` 为 zustand 5.0.15（MIT，React/@types/react 是 >=18 的可选 peer），符合 [ADR-0008](../../../decisions/ADR-0008-mit-and-dependency-licenses.md)。01 在执行时加入兼容的 5.x 并同步 [pnpm-lock.yaml](../../../../pnpm-lock.yaml)；不新增其他运行时依赖、Playwright 或 DOM 测试框架。
- **类型与测试环境：**
  - [Vitest](../../../../vite.config.ts) 只发现 `src/**/*.test.ts`，在 Node 环境运行。
  - 测试及其导入链由无 DOM 的 [node 类型程序](../../../../tsconfig.node.json)检查；生产 `src/` 与 `.tsx` 由 [app 类型程序](../../../../tsconfig.app.json)检查。
  - [ESLint](../../../../eslint.config.js) 只禁止纯模块导入 Zustand/React。
  - 因此 `src/ui/game/` 的 store/桥接/反馈与 `src/app/composition/` 的 owner 保持 DOM-free 且不导入 React；React hook/组件不被 `.test.ts` 导入。
- **计划新增文件（当前均不存在）：**

| 新文件 | 责任子任务 |
|---|---|
| `src/ui/game/synthetic-game-store.ts`、`synthetic-game-store.test.ts` | 01：UI 状态类型、vanilla store、只读句柄与写入口分离、纯 selector |
| `src/ui/game/synthetic-session-bridge.ts`、`synthetic-session-bridge.test.ts` | 02：会话状态/运行接线、10 Hz 采样、即时边界、sessionError 出口 |
| `src/ui/game/synthetic-command-feedback.ts`、`synthetic-command-feedback.test.ts` | 03 创建，04 扩展：提交、pending、Core 结果、取消与 unconfirmed |
| `src/ui/game/synthetic-game-controls.ts`、`synthetic-game-controls.test.ts` | 04：控件可用性、会话控制 action 与 actionError |
| `src/ui/game/synthetic-command-outcomes.test.ts` | 04：取消、故障未确认、跨运行与跨 owner 隔离 |
| `src/ui/game/synthetic-game-replay.test.ts` | 05：接入与采样不改变 Core 事件、replay 与状态哈希 |
| `src/app/composition/synthetic-demo-owner.ts`、`synthetic-demo-owner.test.ts` | 06：DOM-free owner 装配、初始化/部分接线失败回滚、dispose 与清理错误 |
| `src/app/composition/use-synthetic-demo-owner.ts` | 07：React effect 创建浏览器宿主、时钟与 owner，卸载/StrictMode/HMR 时 dispose |
| `src/ui/game/use-synthetic-game.ts` | 07：基于只读句柄的 React selector hook |
| `src/ui/dev/SyntheticDevPanel.tsx` | 07：合成开发面板 |

- **既有文件修改：**
  - 01 修改 package.json 与锁文件；07 修改 App.tsx。
  - 各项按实际影响更新[工程约定](../../../engineering/README.md)、[源码结构指南](../../../engineering/source-structure.md)与[阶段索引](../tasks.md)中的现状描述。
  - Core、Runtime、Session、平台宿主、main 与 Vite/TS/ESLint 配置不修改。
- **浏览器前提：** 07/08 使用 [browser-testing](../../../../.agents/skills/browser-testing/SKILL.md)，需要本仓库 Vite、隔离 Chromium 与真实 rAF。
  - 08 的实际 hidden 使用[已验证 CDP 路线](../../../engineering/README.md#已验证的-cdp-自动化路线)。
  - HMR、卸载/再挂载与提交计数使用临时、可还原的源码编辑或页面探针，结束后还原且无工作区残留。
  - 取不到实际 hidden 或 HMR 观测时，08 记为 blocked，09 不能通过。
- **无原版或外部前提：** 不读原版数据，不需要 GPU/媒体/快捷键实机、云凭据或部署；合成 marker 行为不是原版证据。

## 验收覆盖

所有项最终由 09 核验；局部子任务完成不等于整项 AC 通过。

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01、07 | 01 store、只读句柄与 selector；07 组件只用 selector；09 核验 |
| S-02 | 02、03、04 | 02 采样与状态即时发布；03/04 结果与取消即时发布 |
| S-03 | 03 | 03 真实 Session 关联；08 浏览器接受/拒绝 |
| S-04 | 03、04 | 03 同步提交失败；04 取消与 unconfirmed；08 浏览器取消 |
| S-05 | 02、04 | 02 status 与 sessionError；04 控件可用性与 action；08 DOM |
| S-06 | 07 | 07 浏览器冒烟；08 完整 DOM/键盘 |
| S-07 | 02、04、06、07 | 02/04 运行隔离；06 owner dispose；08 StrictMode/卸载/HMR |
| S-08 | 01–07 | 各项目标测试；05 replay；08 浏览器；09 pnpm check、许可与范围 |
| AC-01 | 01、02、06、07 | 01 初始状态；02 start 与晚接线；06 owner 无请求；08 DOM |
| AC-02 | 02 | 02 可控时钟毫秒序列与非法时钟 |
| AC-03 | 02、03、04 | 02 状态与静止帧；03 结果同步投影；04 取消与故障；08 下一次提交可见 |
| AC-04 | 03 | 03 0 tick/执行 tick 两侧；08 同任务 click 与 DOM 读取 |
| AC-05 | 03 | 03 两种拒绝；08 两条实际交互 |
| AC-06 | 03 | 03 同 tick FIFO、外部命令与重复投递 |
| AC-07 | 04 | 04 六种 reason、新运行重置、迟到通知、ID/runId 重用；05 不入记录 |
| AC-08 | 04 | 04 第二 tick 故障注入、成功前缀、取消与 unconfirmed 并存 |
| AC-09 | 03、04、06 | 03/04 同步失败与 cleanupFailed；06 初始化/部分接线/卸载清理；08 诊断探针 |
| AC-10 | 02、04 | 02 暂停静止；04 可用性与取消；08 实际 hidden→visible |
| AC-11 | 01、07 | 01 selector 计数与负向类型；07 组件只取得只读句柄；08 提交计数 |
| AC-12 | 02、06、07 | 02 运行切换释放；06 计数与失败继续；08 StrictMode/卸载/HMR |
| AC-13 | 07 | 07 冒烟；08 逐项 DOM 与键盘 |
| AC-14 | 05 | 05 有/无桥接、不同采样表、取消与重启的 replay 对照 |
| AC-15 | 01–07 | 各项目标 Vitest；09 pnpm check、许可/锁文件与范围 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-projection-store-contract.md](./subtasks/01-projection-store-contract.md) | — | completed |
| [02-session-projection-bridge.md](./subtasks/02-session-projection-bridge.md) | 01 | completed |
| [03-command-result-feedback.md](./subtasks/03-command-result-feedback.md) | 02 | completed |
| [04-cancellation-failure-controls.md](./subtasks/04-cancellation-failure-controls.md) | 03 | completed |
| [05-ui-replay-invariants.md](./subtasks/05-ui-replay-invariants.md) | 04 | pending |
| [06-demo-owner-composition.md](./subtasks/06-demo-owner-composition.md) | 04 | pending |
| [07-dev-panel-app-wiring.md](./subtasks/07-dev-panel-app-wiring.md) | 06 | pending |
| [08-browser-acceptance-evidence.md](./subtasks/08-browser-acceptance-evidence.md) | 07 | pending |
| [09-final-alignment.md](./subtasks/09-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08 | pending |

依赖关系：

- 01–04 是同一个 UI 模块的契约链：store 契约 → 会话接线与采样 → 命令结果 → 取消、故障与控制。
- 05 只做 Node replay 验证，与 06 互不依赖。
- 07 需要 06 提供的 owner，08 需要可运行的面板。
- 09 仅验证，不实现功能。后续修复使用新 ID，插在 09 前并加入其依赖，不重编号或复用 ID。

## 执行记录

## 审批

**2026-10-02 用户批准本 goal。** 用户调用 execute-goal 并写明“approve and start”，批准当前 9 个子任务、依赖与验收覆盖。status 为 accepted，仅表示计划获批，不表示实现完成。
