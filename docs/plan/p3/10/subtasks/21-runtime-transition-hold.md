---
type: plan
status: active
phase: P3
task: "10"
subtask: "21"
updated: 2026-10-14
---

# 21 — Runtime 与会话的运行中衔接保持

**契约来源：** [spec](../spec.md) 的 S-09、AC-13；[运行中衔接](../spec.md#运行中衔接)；D-01 定稿后的 [P3-04 spec](../../04/spec.md) 运行中衔接。
**依赖：** 11, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts)：一次成功 step 返回衔接事件时，该 tick 为本帧最后一个 tick，完整输出照常帧后派发；帧报告给出实际 tick 数与截断原因；先固定屏障再派发，订阅者不能重入 `clearIntent`/`resetClock`。
- [game-session.ts](../../../../../src/app/session/game-session.ts)：帧后在安全边界进入 `transition` 保持，折叠 Render State，清除按住与重复并以 `transition` 原因取消未执行命令（已执行的不报取消）；保持期间无 step、无游戏输入、无游戏 rAF；以 owner/run/transition 凭证结束一次，重锚时钟不补跑；同 tick 多衔接为有限序列；退出、换 run、异常、隐藏与暂停的竞态按 P3-04 定稿。
- [mission-owner.ts](../../../../../src/app/mission/mission-owner.ts) 的占位序列与 transitionId（单调，不进 Core 或 replay），旧计时器与重复 skip 不能结束下一次占位。

## 不包含

- 占位页面与 G-05 页面（22）；Core 规则（16、18）。

## 关键文件与契约

- [game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts)、[game-session.ts](../../../../../src/app/session/game-session.ts)、[mission-owner.ts](../../../../../src/app/mission/mission-owner.ts)、[mission-flow.ts](../../../../../src/app/mission/mission-flow.ts)；既有的 [game-session-pause-timing.test.ts](../../../../../src/app/session/game-session-pause-timing.test.ts) 与 [mission-owner-placeholder.test.ts](../../../../../src/app/mission/mission-owner-placeholder.test.ts) 是测试先例。

## 写入范围

- `src/app/runtime/**`：帧屏障与帧报告。
- `src/app/session/**`：保持、取消、凭证与竞态。
- `src/app/mission/**`：占位序列与 transitionId。
- `src/ui/game/game-ui.test-support.ts`、`src/ui/mission/MissionParts.tsx`：`FrameReport` 新字段与 `complete-transition` 操作标签（仅编译所需的一行改动）。
- `docs/engineering/modules/app.md`：正式 Runtime、游戏会话与任务所有者各节随运行中衔接同步。

## 验收标准

- [x] AC-13：衔接 tick 后本帧不再 step，该 tick 输出完整派发，截断可观察；无订阅回调重入生命周期。
- [x] 只取消未执行命令且通知一次；两帧折叠；结束重锚；同 run 第二次保持拒绝第一次凭证；同 tick 多衔接按有限序列。
- [x] hidden/pagehide、用户暂停、退出与换 run、消费者/计时器/清理失败都不绕过锁存或恢复保护；StrictMode/卸载不产生第二条循环。
- [x] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core src/app src/ui tools`；`pnpm typecheck` 与 `pnpm lint` 通过。
- Runtime/Session/owner 的故障与竞态矩阵；沿用既有资源平衡与消费者测试。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **2026-10-14 — 实现（按 [P3-04 运行中衔接](../../04/spec.md#运行中衔接p3-10-的修订)）：**
  - Runtime（[game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts)）：`FrameReport` 增加 `cut` 与 `transitions`（冻结副本，直接取自 step 输出，没有衔接的 tick 不分配）；衔接 tick 后不再 step、`capped` 为 false、读模型照常缓存；派发前立屏障，`setIntent`/`submitCommand`/`frame()` 以新类别 `transition-hold` 拒绝（[runtime-errors.ts](../../../../../src/app/runtime/runtime-errors.ts)），监听器重入 `clearIntent`/`resetClock`/`releaseTransitionBarrier`/`foldRenderState` 为 `reentrant-call`；新生命周期操作 `releaseTransitionBarrier()`。
  - 会话（[game-session.ts](../../../../../src/app/session/game-session.ts)）：`RunningTransition`/`SessionTransition`、控制 `complete-transition`、帧消费者之后的安全点进入保持（运行故障或已排 exit/dispose 时不进入；多于 2 个衔接为故障）、`transition` 原因的取消通知、折叠与静止帧、逐项凭证、最后一项后解除屏障并重锚、`resumeRequired` 锁存；同一边界排有该运行的故障时拒绝完成。控制读取的字段上限由 2 改为 3（`complete-transition` 有三个字段；回归由新测试覆盖）。
  - 所有者与流程（[mission-owner.ts](../../../../../src/app/mission/mission-owner.ts)、[mission-flow.ts](../../../../../src/app/mission/mission-flow.ts)）：流程位置 `transition` 与输入 `transition-held`/`transition-ended`；每项一个占位，计时与跳过沿用既有机制，结束时以 runId + transitionId 发 `complete-transition`；意图在会话回调中忽略；新操作 `complete-transition` 的 actionError。
  - 获批的 UI 编译修正：[game-ui.test-support.ts](../../../../../src/ui/game/game-ui.test-support.ts) 的 `frameDouble` 默认报告、[MissionParts.tsx](../../../../../src/ui/mission/MissionParts.tsx) 的 `complete-transition` 标签。
- **测试（衔接以 [transition-injection.test-support.ts](../../../../../src/app/runtime/transition-injection.test-support.ts) 在创建边界注入，合成任务不能停靠）：**
  - [game-runtime-transition.test.ts](../../../../../src/app/runtime/game-runtime-transition.test.ts)（11）：5 tick 帧在第 2 tick 截断、该 tick 的 `command-result` 带 ID 与 `transition` 都派发；封顶帧截断后 `capped` 为 false；同 tick 两项按次序；无接收者仍报告；投递中与之后的输入与 `frame()` 为 `transition-hold`，队列与 ID 不变，`clearIntent` 只返回未执行 ID；重入生命周期为 `reentrant-call`；屏障下可 snapshot/导出；解除并重锚后 1 小时只锚定、不补跑；同运行第二次截断；较早 tick 故障没有截断；截断帧不会出现录制容量停止。
  - [game-session-transition.test.ts](../../../../../src/app/session/game-session-transition.test.ts)（20）：截断帧 → `transition` 原因只取消未执行的 ID 一次（已执行的有结果、不报取消）→ 折叠静止帧 → 状态；保持期间无帧请求、无输入；两项序列各有 transitionId、旧凭证拒绝；多于 2 项故障（排有 exit 时也故障）；结束重锚不补跑；错误 runId/transitionId、出发控制混用均 `invalid-state`；hidden 与 pagehide 锁存 `resumeRequired`，恢复可见后结束仍为 paused（hidden），须显式继续；pause/resume 拒绝、`clear-input` 空操作；exit 使整个序列失效，下一运行的 transitionId 不复用；dispose；帧消费者排 exit 时不进入保持（取消原因为 `exit`）；截断帧或静止帧的消费者失败、取消接收者失败均故障优先，排队的完成不能先恢复运行；结束时帧请求失败为故障；状态监听器不能控制。
  - [mission-owner-transition.test.ts](../../../../../src/app/mission/mission-owner-transition.test.ts)（9）：占位绑定 runId/transitionId，自然结束回到 `flight` 且只有一个帧请求、不补跑；序列逐项跳过，重复跳过与迟到计时器无作用；同运行第二次保持的凭证独立；只计可见时间，隐藏后结束为 paused（hidden），`resume` 后运行；保持期间 pause、菜单、重开与输入端口无作用；会话通知中的 skip 被忽略、不使保持卡住；计时器失败后占位 `failed`、跳过无作用；保持中故障丢弃占位并结束流程；释放撤销计时器、帧请求与离页保护。
  - 既有测试的报告字面量加入 `cut: null, transitions: []`，流程测试加入新位置与输入。
  - StrictMode/卸载：本项在 Node 中验证所有者与会话只保有一条循环（保持期间 0 个帧请求、结束后 1 个、释放后 0 个）；React StrictMode 的浏览器行为由 23 验证。
- **检查：** `pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm check:compliance` 通过；`pnpm exec vitest run src/app` 735 通过（一次与其他 worker 并行的运行出现 12 个未复现的瞬时失败，连续两次重跑全部通过）；`pnpm exec vitest run --testTimeout=60000` 300 个文件 8,900 个测试全部通过。`pnpm check` 的 Vitest 在并行负载下有 5 个与本项无关的文件 5 s 超时（engineering-boundaries、import-job、snapshot、replay-check、mission-owner-stopped），60 s 超时下均通过。
- **rubber-duck：** 3 项采纳：同一边界中该运行的故障优先于排队的完成；所有者意图在会话回调中忽略（否则通知中的 skip 会丢掉占位而保持不结束），非“保持已结束”的完成拒绝改为 actionError；截断帧监听器调用 `frame()` 报 `transition-hold`。未采纳：排队的 exit 先于同帧消费者故障处理，这是 P1-05/P3-04 既有的通知边界语义（故障与排队 exit 同时存在时仍须处理退出）。
- **simplify：** 采纳 `transitionsOf` 免分配与帧循环简化；未采纳：`cut` 字段（spec 规定）、合并占位字段（见下）、把每 tick 上限移入 `CORE_LIMITS`（Core 不在写入范围）。
- **与验收措辞的差异与给 22 的接口说明：** D-01 方向修订 ①–⑨ 不涉及本项。运行中保持的占位放在快照的独立字段 `transitionPlaceholder`（`{ id, gap: 'G-02/3' | 'G-02/4', runId, transitionId, index, count, status, failure }`），流程位置为 `transition`，`skip(id)` 接受任一占位；这样 `src/ui/mission` 的 `PlaceholderPage`/`SliceGapId` 无需在本项改动，由 22 接入。截断帧仍以 phase `running` 送达帧消费者（`report.cut === 'transition'`），其中的输入以 `invalid-state`（`transition-hold`）拒绝，输入消费者宜把截断帧视为非运行（22 的 `src/ui/game-input/**`）。transitionId 在每项显示时取得，退出时未显示的项不占用 ID。
- **文档影响：** 已更新 [app 模块说明](../../../../engineering/modules/app.md)的正式 Runtime、游戏会话与任务所有者各节；STATUS 与阶段 tasks.md 无需改动。

