---
type: plan
status: active
phase: P1
task: "06"
subtask: "01"
updated: 2026-10-10
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
- 复用类型：[synthetic-scene.ts](../../../../engineering/source-structure.md#r1-合成-core) 的 Command/DomainEvent/SyntheticUiProjection；[synthetic-session.ts](../../../../engineering/source-structure.md#r4-合成会话) 的 SessionStatus/SessionControl/SessionCommandsCancelled；[session-errors.ts](../../../../../src/app/session/session-errors.ts) 的 GameSessionError。
- 计划新增：`src/ui/game/synthetic-game-store.ts`、`src/ui/game/synthetic-game-store.test.ts`。

## 验收标准

- [x] S-01/AC-01：新 store 的初始 state 精确为 `{status:null, projection:null, pendingCommands:[], recentResults:[], actionError:null, sessionError:null}`；读出的数组与对象不可变。
- [x] AC-11（Node）：基于 subscribe+selector 的计数中，tick/坐标变化通知 0 次，marker ID 或 phase 变化各通知 1 次。
- [x] AC-11：只读句柄没有 setState 或其他写入口，有负向类型断言证明；写入口不从组件/hook 公共入口导出。
- [x] `recentResults` 的上限、顺序与清空行为符合 spec；store 中没有 RenderFrame、snapshot 或世界引用。
- [x] AC-15：Zustand 与锁文件同步，许可 MIT；store 无 DOM/React 导入；目标 Vitest 与 `pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/ui/game/synthetic-game-store.test.ts`；`pnpm check`。
- 在 `.test.ts` 中用 `@ts-expect-error` 证明只读句柄无写入口，并由 node 类型程序实际检查；冻结与上限用直接数据断言。
- 记录所选 Zustand 版本、许可和 peer 满足情况；确认 `pnpm-lock.yaml` 只含该依赖引入的变化。
- 使用 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 时限定本项文件、依赖与锁文件。检查[源码结构指南](../../../../engineering/source-structure.md)当前目录、[工程约定](../../../../engineering/README.md)及[阶段索引](../../tasks.md)§2 中关于 Zustand 尚未引入的现状描述。
- 不适用浏览器、实机或原版对照。

## 完成证据

- 2026-10-02：前提核验——P1-05 的 08 最终对齐已 completed（提交 `8fb36e8`），证据覆盖其 AC-01 至 AC-14。
- 依赖：`zustand@^5.0.15` 加入 dependencies，锁文件只新增 zustand 5.0.15 条目（React/@types/react 为可选 peer，解析到 19.3.0）。`pnpm licenses list --prod` 显示 MIT；`pnpm install --frozen-lockfile` 通过。
- 实现：[synthetic-game-store.ts](../../../../engineering/source-structure.md#r6-合成-ui-层) 定义 UI 状态与结果类型、`createSyntheticGameStore()`、只读 `reader`（仅 getState/getInitialState/subscribe 且冻结）与写入口 `commit(change)`，以及 phase/runId/tick/markerId 标量 selector。写入口只在 ui/game 模块内部流转，不进入组件公共入口（07 再核验 hook 导出）。
- 测试：[synthetic-game-store.test.ts](../../../../engineering/source-structure.md#r6-合成-ui-层) 6 项通过，覆盖：
  - 初始 state 精确值、冻结与只读句柄；两处 `@ts-expect-error`（无 setState、只读数组）经 node 类型程序检查。
  - 同值 commit 不通知；非冻结 status 被复制并冻结，改动原输入不影响 store；actionError 复制冻结、cause 保持原引用。
  - 用真实 Core 投影推进 3 tick：tick 通知 3 次，markerId/phase/runId/pending 列表各 0 次；加 marker 与改 phase 各 1 次。
  - settle 按序只终结一次，忽略未知、重复与跨 run 的 ID；recentResults 上限 10、最新在后，clearRun 清空，空清空不通知。
  - 故障（取消后 unconfirmed）、重启与退出各自只产生一次通知，且该次快照内的 status、projection、pending 与结果一致。
- 工程检查：`pnpm check` 通过（三个 TypeScript 程序、ESLint、28 个文件 / 604 项测试、生产构建）。store 无 DOM 或 React 导入。
- rubber-duck：
  - 采纳“生命周期转换需原子写入”：把 update/addPending/settle/clearRun 合并为单个 `commit`，并增加通知历史测试。
  - 采纳“状态可变泄漏”的可行部分：非冻结 status 复制并冻结，actionError 复制冻结。
  - 不冻结 GameSessionError：P1-05 规定不冻结异常对象，store 将错误和 cause 一样作为不透明引用保留。Core 投影与事件按 P1-02 契约本已深冻结。
- simplify（四角度）：
  - reuse 无发现。
  - 已采纳：显式处理字段，替代动态键与类型断言；新建数组就地冻结，不再二次复制；用变更比较代替 `Object.keys` 分配；未知 settlement 不再产生临时对象。
  - 未采纳“改成语义化 reducer”：会把单一原子 `commit` 拆成更大的 API，属于重新设计。
  - 未采纳“去掉 status 冻结保护”：这是 rubber-duck 要求的保证，只需一行。
  - 采纳后重验全部通过。
- 文档影响：[源码结构指南](../../../../engineering/source-structure.md)记录 `ui/game/` 的实际目录与职责；[阶段索引](../../tasks.md)§2 改为“已加入 Zustand”，并更正 Core/Runtime 已交付的现状。工程约定的 UI 桥接说明待 02 接线后补充；原版事实、冻结决定与指南无变化。
