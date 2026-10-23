---
type: plan
status: active
phase: P3
task: "11"
subtask: "16"
updated: 2026-10-23
---

# 16 — Runtime 与会话：救援保持与终局

**契约来源：** [spec](../spec.md) 的 S-09、AC-11；[运行中与终局衔接](../spec.md#运行中与终局衔接)；D-01 写入 [P3-04 spec](../../04/spec.md) 的修订。
**依赖：** 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **救援保持：** [game-session.ts](../../../../../src/app/session/game-session.ts) 的运行中衔接接受 G-02/5、G-02/6；有限序列上限与同 tick 组合按 D-01；逐次 `transitionId` 与凭证、未执行命令取消一次、两帧折叠、结束重锚不补跑。
- **完成截断：** [game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts) 依据成功 step 的有类型完成输出截断，事件派发前立起完成屏障；`FrameReport` 的新截断原因与实际 tick 数；监听器不能重入。
- **结果阶段：** 会话进入结果阶段，按冻结结果逐项保持终局占位（G-02/7；G-02/8 与可选 G-02/9），每项凭证绑定 ownerId/runId/transitionId；完成与普通衔接同 tick 时按 D-01 的有限序列，绝不恢复模拟；故障、退出、释放、完成与隐藏的优先级按 D-01；健康完成的录制在重试/退出前可导出。
- **任务所有者：** [mission-flow.ts](../../../../../src/app/mission/mission-flow.ts) 加入结果位置与相应输入、`FLOW_SESSION_PHASES` 与重开/返回的允许位置；[mission-owner.ts](../../../../../src/app/mission/mission-owner.ts) 的终局占位计时、结果后的重试（P3-04 重开路径：新 runId、重新抽取种子、预选上次僚机）与返回主菜单；同步全部 phase 白名单与消费者。
- 测试：Runtime、Session、owner 的竞态与故障矩阵（hidden/pagehide、重复跳过、旧凭证、退出/释放、StrictMode 式重复挂载、消费者/计时器/清理失败），沿用既有资源平衡测试。

## 不包含

- 结果页、占位文案与总结文字（17）；浏览器验证（18）。

## 关键文件与契约

- [session-errors.ts](../../../../../src/app/session/session-errors.ts)、[mission-ports.ts](../../../../../src/app/mission/mission-ports.ts)、[mission-slot.ts](../../../../../src/app/composition/mission-slot.ts)、[game-runtime-transition.test.ts](../../../../../src/app/runtime/game-runtime-transition.test.ts)、[game-session-transition.test.ts](../../../../../src/app/session/game-session-transition.test.ts)、[mission-owner-transition.test.ts](../../../../../src/app/mission/mission-owner-transition.test.ts)。

## 写入范围

- `src/app/runtime/**`：完成截断与测试。
- `src/app/session/**`：救援保持、结果阶段与测试。
- `src/app/mission/**`：结果位置、终局占位计时、重试与返回及测试。
- `src/app/composition/**`：任务槽的接线与测试。
- `src/ui/game/game-ui.test-support.ts`：`frameDouble` 的报告加入 `completion: null`。
- `src/ui/mission/mission-copy.ts`：会话阶段 `completed` 的文字。
- `src/ui/mission/PlaceholderPage.tsx`、`src/ui/mission/slice-gaps-copy.ts`：G-02/5、G-02/6 的最小占位标题与条目，使救援保持呈现可跳过的占位；最终措辞与 G-02/7–10、G-06 归 17。
- `src/ui/game-input/input-consumer.ts` 及其测试：任何截断帧都不按运行中处理。
- `src/ui/game/game-store.test.ts`、`src/ui/mission/mission-copy.test.ts`：状态字面量加入 `result: null`，`SLICE_GAPS` 键列表加入 G-02/5、G-02/6。

## 验收标准

- [x] 救援保持复用运行中衔接；未执行命令恰好取消一次；结束重锚不补跑。（AC-11）
- [x] 完成后没有额外 tick、输入或重入；终局占位每项恰好结束一次后进入结果；旧 run 与旧项的凭证被拒绝。（AC-11）
- [x] 重试产生新 runId 的新世界，返回主菜单释放所有者；清理失败沿用锁存。（AC-11）
- [x] `pnpm exec vitest run src/app src/ui`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 中的 Runtime/Session/owner 测试与资源平衡。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **2026-10-23（worker，基线 5d07e8d2）：**
  - **Runtime：** [game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts) 在检查 `transition` 的同一处检查 `mission-completed`：该 tick 为本运行最后一个，`FrameReport` 为 `cut: 'completed'`、`completion: { tick, outcome }`、`capped: false`；派发前立起永不解除的屏障（`GameRuntimeError` 新类别 `completed`，见 [runtime-errors.ts](../../../../../src/app/runtime/runtime-errors.ts)），拒绝 `frame`、`setIntent`、`submitCommand`、`resetClock` 与 `releaseTransitionBarrier`；`clearIntent`、折叠、清订阅、读取与录制导出照常。同一 tick 同时含 `transition` 与 `mission-completed` 时故障，本帧不派发。
  - **会话：** [game-session.ts](../../../../../src/app/session/game-session.ts) 增加阶段 `completed`、状态 `result: SessionResult | null`（完成 tick 的 projection 的冻结结果）、`EndingTransition`（与 `RunningTransition` 共用 transitionId 计数）与取消原因 `mission-complete`。进入次序：先取消未执行命令一次；取消监听器失败则故障，不进入 `completed`；否则保存结果、立第一项终局占位、折叠两帧、发静止帧，不再请求帧。`complete-transition` 逐项结束终局占位，最后一项后 `transition` 为 null，阶段保持 `completed`，从不恢复模拟。`completed` 中 pause/resume/start/clear-input/输入以 `invalid-state` 拒绝；隐藏不设 `resumeRequired`。同一通知中排队的 exit/dispose、帧消费者或帧后监听器失败、无终态结果、终局项为 0 或多于 2 都优先于完成。G-02/5、G-02/6 的救援保持沿用运行中衔接，未改动（每 tick 上限仍为 2）。
  - **任务所有者：** [mission-flow.ts](../../../../../src/app/mission/mission-flow.ts) 增加位置 `ending`、`result`（均对应 `completed`），输入 `run-completed`（flight → ending）与 `ending-ended`（ending → result）；`result` 可重开，`run-ended` 适用于两者。[mission-owner.ts](../../../../../src/app/mission/mission-owner.ts) 的 `transitionPlaceholder` 覆盖 G-02/3 至 G-02/6；新增 `endingPlaceholder`（G-02/7 至 G-02/9，带变体或行，绑定 runId 与 transitionId）。`skip` 可用于 `ending`，`restart` 可用于 `result`。离页保护在 `completed` 中保留，重开或释放时撤销。
  - **范围内的 UI 编译修正（协调者批准的范围扩大）：** [input-consumer.ts](../../../../../src/ui/game-input/input-consumer.ts) 把任何截断帧都视为非运行中，所以完成帧不向屏障提交重复键。`mission-copy.ts` 增加阶段文字 `Completed`。`PlaceholderPage.tsx` 与 `slice-gaps-copy.ts` 增加 G-02/5、G-02/6 的最小标题与条目（最终措辞归 17）。`game-ui.test-support.ts`、`game-store.test.ts` 与 `mission-copy.test.ts` 补上新字段。
  - **测试（Node）：**
    - [game-runtime-completion.test.ts](../../../../../src/app/runtime/game-runtime-completion.test.ts)：真实合成成功运行在 tick 647 截断（有上限帧与无上限帧），录制在完成处结束并可导出；屏障拒绝所有推进与输入；接收者遇到屏障且不能重入；同 tick 的衔接加完成时故障。
    - [game-session-completion.test.ts](../../../../../src/app/session/game-session-completion.test.ts)：真实成功运行进入 `completed`。真实失败运行经过两次真实 G-02/6 保持（transitionId 1、2）后以 G-02/7 能量完成（transitionId 3）。另覆盖：取消恰好一次；取消监听器失败时故障；两项终局与旧凭证；拒绝表；隐藏；exit/dispose 的资源释放；优先级矩阵与违约故障；G-02/5、G-02/6 保持。
    - [mission-owner-completion.test.ts](../../../../../src/app/mission/mission-owner-completion.test.ts)：救援占位；终局占位的自然结束、跳过、迟到计时器、隐藏计时、无暂停/菜单/重开与输入端口；计时失败不故障会话；结果后的重试（新种子，runId 2 从 tick 0 开始，预选沿用，旧计时器无效）；返回主菜单释放所有者；重挂载；重试清理失败锁存。
    - [input-consumer-transition.test.ts](../../../../../src/ui/game-input/input-consumer-transition.test.ts)：完成帧不提交重复键，也不报输入错误。恢复旧判断后该用例失败。
    - 注入设施 [transition-injection.test-support.ts](../../../../../src/app/runtime/transition-injection.test-support.ts) 现在支持 G-02/5、G-02/6 与带终态结果的完成；[mission-end.test-support.ts](../../../../../src/app/runtime/mission-end.test-support.ts) 以默认步长复用 Core 的两条合成闭环运行。
  - **检查：**
    - `pnpm exec vitest run src/app src/ui`：66 个文件、1232 项全部通过。
    - `pnpm typecheck`、`pnpm lint` 通过。
    - `pnpm check`：352 个文件、10286 项全部通过，构建成功。
    - 未出现超时，所以没有用 `--no-file-parallelism` 重跑。
  - **rubber-duck：** 指出 `#complete` 先公开 `completed` 再取消命令，取消监听器的失败会先暴露健康结果。已改为先取消、确认没有故障再进入，并加测试；恢复旧次序后该测试失败。其余问题（完成后不恢复、旧凭证、冻结结果、`#followHold` 次序）均无发现。
  - **simplify：** 已采纳以下简化：
    - Runtime 的两个屏障标志合并为一个字段，`cutOf` 直接给出截断种类；
    - `complete-transition` 的判定扁平化；
    - `#followHold` 改为 if/else；
    - 注入设施去掉非空断言。

    以下未采纳：
    - 运行中保持与终局共用推进函数，以及由会话状态推导流程位置：属于较大重构；
    - 复用 Core 的私有 `deepFreeze`：在写入范围之外；
    - `cutOf` 提前抛出：收益可忽略。
  - **文档影响：** `docs/engineering/modules/app.md` 第 20–21、32、35–36、62、73、78 行与 `ui.md` 第 29–30 行已过时，但属于 22 的写入范围，交 22 处理（见 worker 报告）。本项写入范围内没有其他文档。

