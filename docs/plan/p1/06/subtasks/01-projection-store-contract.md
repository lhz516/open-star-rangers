---
type: plan
status: active
phase: P1
task: "06"
subtask: "01"
updated: 2026-10-02
---

# 01 — 投影 store 契约与依赖

**契约来源：** [spec](../spec.md) 的 S-01、S-08，AC-01（初始状态）、AC-11（Node selector）、AC-15（依赖与锁文件），“计划新增的 UI 契约”及技术决定 1、8、9。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 开始前确认 goal 的跨任务前提：P1-05 的 08 最终对齐已 completed 且证据完整；否则本项记为 blocked。
- 加入 `zustand` 运行时依赖：选择与 React 19.3 兼容的 MIT 5.x，并同步锁文件。不加入其他运行时依赖、DOM 测试框架或浏览器 runner。
- 按 spec 定义 UI 状态 `status`、`projection`、`pendingCommands`、`recentResults`、`actionError`、`sessionError`，以及以下类型：
  - `UiPendingCommand`：`{runId, commandId, commandType}`。
  - `UiCommandResult` 判别联合：accepted 携带原 marker-added/removed 事件；rejected 携带原 command-rejected 事件；cancelled 携带 Session 原 reason；unconfirmed 携带 `reason:'session-failed'`。
  - `UiActionError`：operation 为 Command 类型、SessionControl 类型、`initialize` 或 `cleanup`，并保留原 cause。
  - Core/Session 类型直接复用，不重新定义。
- 用 `zustand/vanilla` 创建 store。
  - 初始值：`status=null`、`projection=null`、两个空数组、两个错误均为 null。
  - 写入口只交给同模块的桥接与反馈代码。组件/hook 只取得不含 `setState` 的只读句柄，即 getState、subscribe、getInitialState。
  - 每次写入为只读数据，不放 RenderFrame、snapshot、RNG 或世界引用。
- `recentResults` 的写入保持上限 10、最新在后、超出时丢弃最旧，并提供清空入口。它是显示保留上限，不是事件历史。
- 提供纯标量 selector，例如 phase、tick、marker ID，供 07 hook 使用。普通 tick/坐标更新不能通知只关心 marker ID 或 phase 的订阅。
- 本文件 DOM-free，不导入 React，可由 node 类型程序检查。

## 不包含

- 会话订阅、采样与运行接线（02）；命令提交与结果（03）；取消、故障与控制（04）。
- React hook、组件与 App 接线（07）。

## 关键文件与契约

- [package.json](../../../../../package.json)、[pnpm-lock.yaml](../../../../../pnpm-lock.yaml)（已有，本项修改依赖）。
- 复用类型：[synthetic-scene.ts](../../../../../src/core/synthetic/synthetic-scene.ts) 的 Command/DomainEvent/SyntheticUiProjection；[synthetic-session.ts](../../../../../src/app/session/synthetic-session.ts) 的 SessionStatus/SessionControl/SessionCommandsCancelled；[session-errors.ts](../../../../../src/app/session/session-errors.ts) 的 GameSessionError。
- 计划新增：`src/ui/game/synthetic-game-store.ts`、`src/ui/game/synthetic-game-store.test.ts`。

## 验收标准

- [ ] S-01/AC-01：新 store 的初始 state 精确为 `{status:null, projection:null, pendingCommands:[], recentResults:[], actionError:null, sessionError:null}`；读出的数组与对象不可变。
- [ ] AC-11（Node）：基于 subscribe+selector 的计数中，tick/坐标变化通知 0 次，marker ID 或 phase 变化各通知 1 次。
- [ ] AC-11：只读句柄没有 setState 或其他写入口，有负向类型断言证明；写入口不从组件/hook 公共入口导出。
- [ ] `recentResults` 的上限、顺序与清空行为符合 spec；store 中没有 RenderFrame、snapshot 或世界引用。
- [ ] AC-15：Zustand 与锁文件同步，许可 MIT；store 无 DOM/React 导入；目标 Vitest 与 `pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/ui/game/synthetic-game-store.test.ts`；`pnpm check`。
- 在 `.test.ts` 中用 `@ts-expect-error` 证明只读句柄无写入口，并由 node 类型程序实际检查；冻结与上限用直接数据断言。
- 记录所选 Zustand 版本、许可和 peer 满足情况；确认 `pnpm-lock.yaml` 只含该依赖引入的变化。
- 使用 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 时限定本项文件、依赖与锁文件。检查[源码结构指南](../../../../engineering/source-structure.md)当前目录、[工程约定](../../../../engineering/README.md)及[阶段索引](../../tasks.md)§2 中关于 Zustand 尚未引入的现状描述。
- 不适用浏览器、实机或原版对照。

## 完成证据
