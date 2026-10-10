---
type: plan
status: active
phase: P3
task: "05"
subtask: "20"
updated: 2026-10-10
---

# 20 — 输入消费者：意图、命令、重复、会话控制与清键

**契约来源：** [spec](../spec.md) 的[输入上下文](../spec.md#输入上下文)、[操纵](../spec.md#操纵)“设置意图”、[开火](../spec.md#开火)、[离散命令与重复](../spec.md#离散命令与重复)、[会话控制键](../spec.md#会话控制键)、[页面层拦截](../spec.md#页面层拦截)、[清键与恢复](../spec.md#清键与恢复)、[生命周期与资源](../spec.md#生命周期与资源)；S-04、S-05、S-07、S-08、S-10、S-14 的键盘部分；AC-03 至 AC-06、AC-09、AC-11、AC-13 的 Node 部分。
**依赖：** 15、18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/ui/game-input/input-consumer.ts`：任务所有者 `input` 阶段的消费者，所有者级连接键盘源（经注入的工厂与 12 的输入区绑定），跨运行保留；每个运行的帧、状态与取消订阅经 `ownCleanup` 登记为运行级资源。绑定表、反馈入口与控制端口都经注入（反馈为装配层提供的现有 `GameCommandFeedback.submit`，可在 `ui` 消费者连接后取得；不直接调用运行句柄的 `submitCommand`）。
- **解析与意图：** 每次按键读取当前运行句柄的最新完整 projection（不用降频的 React store）；先看流程与会话状态，再看 `player.interactionContext`；只有 running 接受意图与命令，paused 只处理宿主控制。轴或主炮电平改变时经 `setIntent` 设置完整意图，值不变不重复设置。进入新上下文时撤销本地状态并在 running 时发布中性意图。
- **命令与重复：** 新按下匹配命令后经反馈入口提交一次；在 running 的 `onFrame` 中按 18 的调度提交到期的重复；同步提交失败（含满队列）显示错误并撤销该键的重复，不自动重试；普通 `ignored` 结果保留为反馈数据，不逐 tick 弹出。`setIntent` 异常有可见的结构化反馈，不吞掉。
- **会话控制：** `p` 与 Esc 经 15 的端口执行（`togglePause`、`openMenu`），Esc 只在未锁指针且页面确实收到时、在 flight/warp/base 打开菜单，map 中无动作；两者在所有交互上下文的合格输入区有效。
- **拦截：** 按 18 的判定对事件调用 `preventDefault`。
- **清键：** blur、focusout 或资格因其他原因变为假时清本地状态，并在 running 时调用一次 `clearInput('focus-loss')`；hidden/pagehide 与 paused、transition、stopped、故障、运行结束的状态通知只清本地状态，不调用控制；恢复只靠新的非重复 keydown；取消通知按 commandId 至多处理一次。
- **生命周期：** 所有者释放时先失效（旧回调不再设置意图、提交或阻止默认），再撤销监听；部分连接失败回滚并聚合 `RollbackError`。
- **输入状态（`input-status.ts`）：** 供界面读取的只读状态：输入区是否需要“点击以操控”提示、当前 G 项标注（约 3 秒、同项刷新）、最近的输入错误；21、22 在其上追加能力与地图状态。
- Node 测试：用真实 Session/Runtime 与受控宿主（[session-host.test-support.ts](../../../../../src/app/session/session-host.test-support.ts)、[game-session.test-support.ts](../../../../../src/app/session/game-session.test-support.ts)）、假键盘源与测试绑定表，精确断言入队时钟与消费 tick（AC-06）、满队列与反馈关联（AC-05）、`p`/Esc（AC-09）、清键时序与多 tick 帧（AC-13）、上下文切换后中性意图（AC-03）、Alt 短按/按住经 Runtime 的结果（AC-04）。

## 不包含

- 全屏、锁键与 Pointer Lock 申请（21）；地图输入（22）；React 组件与装配（23、25）；最终绑定数据（19）。

## 关键文件与契约

- [game-session.ts](../../../../../src/app/session/game-session.ts)（`GameSessionRun`：`setIntent`、`onFrame`、`onCommandsCancelled`、`ownCleanup`、`projection()`）、[game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts)（`GameIntent`）、[game-command-feedback.ts](../../../../../src/ui/game/game-command-feedback.ts)、[mission-owner.ts](../../../../../src/app/mission/mission-owner.ts)（15 的端口）。
- 计划新增：`input-consumer.ts`、`input-consumer.test.ts`、`input-status.ts`、`input-status.test.ts`。

## 写入范围

- `src/ui/game-input/input-consumer.ts`、`src/ui/game-input/input-consumer.test.ts`
- `src/ui/game-input/input-status.ts`、`src/ui/game-input/input-status.test.ts`

## 验收标准

- [ ] 意图只在值变化且 running 时设置；上下文切换发布中性意图且不恢复旧轴或开火。
- [ ] 命令经反馈入口提交，满队列显示错误、撤销重复、不重试；重复的入队时钟与消费 tick 精确符合契约。
- [ ] `p`/Esc 经端口执行且不旁路菜单；清键时 `clear-input` 每次失焦至多一次，状态通知不递归控制。
- [ ] 释放先失效后撤销，失败聚合；`pnpm exec vitest run src/ui/game-input` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 测试以真实 Session/Runtime 与受控宿主驱动；浏览器行为由 28、29 验证。

## 完成证据
