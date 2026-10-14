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

- [x] 意图只在值变化且 running 时设置；上下文切换发布中性意图且不恢复旧轴或开火。
- [x] 命令经反馈入口提交，满队列显示错误、撤销重复、不重试；重复的入队时钟与消费 tick 精确符合契约。
- [x] `p`/Esc 经端口执行且不旁路菜单；清键时 `clear-input` 每次失焦至多一次，状态通知不递归控制。
- [x] 释放先失效后撤销，失败聚合；`pnpm exec vitest run src/ui/game-input` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 测试以真实 Session/Runtime 与受控宿主驱动；浏览器行为由 28、29 验证。

## 完成证据

- **实现：** [input-consumer.ts](../../../../../src/ui/game-input/input-consumer.ts) 的 `createInputConsumer` 返回 `MissionOwnerConsumer<'input'>`：连接时经注入的工厂创建并连接键盘源（所有者生命期内一个，跨运行保留；`bindZone` 转交 12 的输入区绑定，连接前给出的区也会绑定）；`attachRun` 以 `control.forRun(runId)` 取运行端口，先登记“运行结束即解除接线”的清理，再把帧、取消与状态订阅逐个交给 `ownCleanup`，交不出的注册立即撤销，撤销失败抛 `RollbackError`。绑定表、反馈（getter，取 `ui` 消费者创建的 `GameCommandFeedback.submit`）与“是否锁指针”谓词（21、22 填入，缺省为否）都经注入。[input-status.ts](../../../../../src/ui/game-input/input-status.ts) 为 zustand 只读状态：`focusHint`、`gap { gap, serial }`（约 3 秒的显示由 23 的 `GAP_NOTICE_MS` 计时）、`error { operation, cause, serial }`。
- **按键与帧：** 每次按键读会话状态与运行的最新完整 projection（不经 React store）；意图只在 running 且 `InputState` 报告变化时经 `setIntent` 设置；命令新按下经反馈提交一次，返回 null 或抛出即 `cancelRepeat`；`p` 经端口 `togglePause`，Esc 在未锁指针时经端口 `openMenu`（地图无绑定）；G 项写入输入状态。running 帧提交到期重复，帧显示新上下文时设中性意图。拦截直接返回 18 的判定。
- **清键：** 资格由真变假（按键或任一信号，`visibilitychange`/`pagehide` 除外）时清本地状态，running 时经端口一次 `clearInput('focus-loss')`；隐藏与 pagehide 只清本地；状态、取消与清理通知只同步/清本地，不调用控制或 `setIntent`；取消通知按 commandId 至多处理一次（记录每运行已处理的最大 ID）。公开的 `clear(reason)` 供 21、22 的能力退出使用：会话只以取消排队命令告知其他消费者的 `clear-input`，队列为空时不告知，所以对运行的清键都应经此入口（rubber-duck 发现 1 的处理）。
- **Node 测试：** `pnpm exec vitest run src/ui/game-input`：6 个文件、151 项通过（[input-consumer.test.ts](../../../../../src/ui/game-input/input-consumer.test.ts) 31 项、[input-status.test.ts](../../../../../src/ui/game-input/input-status.test.ts) 4 项）。用 `openMission` 的真实所有者/Session/Runtime 与 ControlledHost、开发录制（读每 tick 的真实输入）、假键盘源、`TEST_BINDINGS`、真实 store/bridge/feedback；上下文变化以包装运行句柄的合成 projection 表示（Core 目前只报告 flight）。断言：
  - AC-03/AC-04：意图只在值变化时设置（repeat、Shift 不重设；Ctrl 路由横滚）；暂停中按键不建立按住；CtrlLeft→AltRight 屏蔽合成 Ctrl 且 Alt 开火；进入地图的帧设中性意图，其后 tick 中性，回到飞行不恢复，须新按下；Warp 可转向不可开火；Alt 按住每 tick 主炮、两 tick 间多次短按只一个 tick、双 Alt 松一保持、失焦后 focus/repeat/`altKey` 不恢复；Space 一次 secondary，与 Alt、转向、Shift+1 档位、Ctrl+Enter 同 tick 并用。
  - AC-05/AC-06：按下于时钟 6 立即入队并在 tick 4 消费；时钟 36 前无重复，38 入队、tick 20 消费；其后下一到期为观察值 +16（58、78、98），0 tick 帧与超额 10 tick（限 5）的迟帧都只一次、不追赶；同帧按首按次序；Shift/Ctrl 改变动作即撤销该键重复且松开修饰键不复活；满队列（256 条）时反馈显示 `command-queue-full`、无 pending、按住越过到期也不重试，重新按下才提交；commandId 关联结果（rejected/not-implemented）与取消（focus-loss）；反馈缺失时输入状态显示错误并撤销重复；F2/KeyA/F11 只标注 G-08/G-09/G-10（同项再按序号刷新），不提交、不暂停。
  - AC-09：`p`（含 Shift）在飞行与地图经端口暂停/继续；未锁指针的 Esc 在飞行、Warp、基地打开菜单，地图与锁指针时无动作且不阻止默认；菜单中 `p`/Esc 不绕过，只有 Continue 离开；出发占位中无变化；隐藏暂停在可见后由 `p` 继续；端口失败进入输入状态，新运行清除。
  - AC-11：拦截判定（绑定键 keydown/keyup、Alt、Ctrl 绑定拦截；未绑定、Ctrl+未绑定、Tab、F12、Meta、无资格放行）。
  - AC-13：focusout 后再 blur 只一次 `clear-input('focus-loss')`，取消通知每 ID 一次，之后多 tick 帧中性、重新聚焦与 repeat 不恢复，越过旧到期无重复；unbind 与按键时发现失去资格同样清；hidden/pagehide 两种先后次序都只清本地、无控制调用；用户暂停、故障只清本地；重开后新运行中性、同一键盘源（connects 1）；外部经队列取消的清键也同步本地，重放同一通知不清新按键（否则松键后意图会卡住）；焦点提示随 running/paused 与资格变化。
  - 生命周期：释放时迟到回调返回 false、不提交/设意图/控制，然后撤销（releases 1）；撤销失败成为所有者清理失败；键盘源连接失败使所有者创建失败；第 3 次 `ownCleanup` 失败且撤销失败时开始失败为 `RollbackError`（含两项原因），回滚后下一次开始完整接线；在平台 `createKeyboardSource` 与测试宿主上验证区绑定、替换区后旧区事件无效与释放后监听为 0。
  - 变异检查：分别去掉隐藏只清本地、按键失去资格清键、每 ID 一次、取消清本地、失败撤销重复、Esc 锁指针门、每次失焦一次、帧上下文中性意图、释放先失效、只在 running 设意图、新运行/新按下清错误与同按键失败保留、焦点提示条件，各至少一项测试失败。
- **工程检查：** `pnpm check` 通过（TypeScript、ESLint、Vitest 239 个文件 7239 项、生产构建；仅有既有的 chunk 体积提示），本次未出现 5 秒超时。
- **rubber-duck：** 发现 1（其他消费者在队列为空时发出的 `clear-input` 不可见，可能遗留本地按住）——会话 API 不在本项写入范围，按其建议的第二种方案处理：`clear(reason)` 文档写明所有清键须经此入口，取消处理只声称“每条真实通知之后跟随”，测试改为不宣称同步任意外部清键；如需全面的“已清除”通知，属于会话契约修订。发现 2（keyup、同步或被锁指针抑制的 Esc 会清除错误）——已改为只有成功的新按下才清除，并补测试。
- **simplify：** 合并每次按键与状态通知中重复的 `session.status()` 读取（焦点提示只在资格、接线或状态变化时刷新）；去掉只供 `attachRun` 使用的 `#control` 字段与以状态错误身份取代的 `#failures` 计数；补“同一按键既改意图又失败时保留错误”的用例。未采纳：把资格变化原因、隐藏信号分类或取消去重下沉到 18 的 `InputState`/会话（不在写入范围，且 spec 规定隐藏只清本地、取消每 ID 至多处理一次）；输入状态的 `focusHint` 与 23 的 `focusHintShown` 重叠，按本项工作范围保留，由 25 选用其一。
- **文档影响：** 本项写入范围不含文档；建议 32 在 [键位文档](../../../../engineering/keyboard-input.md)、[ui 模块说明](../../../../engineering/modules/ui.md)与[源码结构指南](../../../../engineering/source-structure.md)记录输入消费者/输入状态的职责、清键规则与“所有清键经 `clear(reason)`”的约束。
