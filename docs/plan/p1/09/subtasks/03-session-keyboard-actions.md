---
type: plan
status: active
phase: P1
task: "09"
subtask: "03"
updated: 2026-10-02
---

# 03 — 合成键位映射、会话动作分流与清键

**契约来源：** [Spec](../spec.md) 的 S-02/03/05、AC-01 至 AC-07、AC-12/14 与技术决定 4–8。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 UI/game 交付[键位文档 §2](../../../../engineering/keyboard-input.md#2-当前绑定表)五行映射：方向轴、N/X 命令、P 控制。消费者只依赖 01 的源端口和记录，不导入真实浏览器源，因此不依赖 02。
- 运行绑定窄扩展 setInput，保持 retired/unbind 保护和 Session 当前身份/phase 校验；store 的 UiActionError.operation 增加 input。
- 轴经当前绑定；命令复用 SyntheticCommandFeedback；P 复用 SyntheticGameControls 和 syntheticControlAvailability，按当前 Session 状态核对，不靠过期 React/store 缓存。
- 所有暂停清键，paused/idle/faulted 不登记轴；start/resume/new run 都不补旧输入。状态、取消、错误、清理及 attach 只做本地清理/接线，绝不调用输入或控制，也不排微任务绕过限制。
- 失焦/隐藏/pagehide 信号清表，仍合法 running 时立即发送 0。覆盖“源先清键、Session 后暂停”与相反顺序；旧 run 回调不能污染新 run。
- 已入队离散命令不因仅焦点变化撤回；取消/unconfirmed 按已有 Session 反馈，不重提、不乐观成功。
- 提供只读键盘状态快照：active/inactive 或 unavailable+原始 error，稳定引用且不按 tick 通知。input 同步失败保留 cause；实际成功轴变更只清旧 input 错误，no-op/忽略不清错。

## 不包含

- DOM 监听生产源（02）、owner/页面接线（04）。
- Core/Runtime/Session 修改、新命令/队列/控制、录制格式或额外调度。
- 独立键位文档定稿（06），其旧暂停规则不作为本项合同。

## 关键文件与契约

- **计划新增：** `src/ui/game/synthetic-keyboard-input.ts`、`synthetic-keyboard-input.test.ts`。
- **扩展现有：** [synthetic-session-bridge.ts](../../../../../src/ui/game/synthetic-session-bridge.ts)及[邻接测试](../../../../../src/ui/game/synthetic-session-bridge.test.ts)；[synthetic-game-store.ts](../../../../../src/ui/game/synthetic-game-store.ts)及[邻接测试](../../../../../src/ui/game/synthetic-game-store.test.ts)。
- **复用不另写判定：** [命令反馈](../../../../../src/ui/game/synthetic-command-feedback.ts)、[控制/可用性](../../../../../src/ui/game/synthetic-game-controls.ts)及[真实 UI 测试设施](../../../../../src/ui/game/synthetic-ui.test-support.ts)；测试设施如需记录 setInput，仅增加观测包装。

## 验收标准

- [ ] AC-01/02：五行映射一致；单/双轴、释放与重复发送序列正确，真实 Session 的逐 tick 投影与相同输入参考 Core 逐位相等。
- [ ] AC-03/04：N/X 仅一次提交，pending 经事件结算；P 覆盖 user/hidden 暂停、离页阻断、非法状态与同步错误；取消/unconfirmed 不重提。
- [ ] AC-05：修饰键/composition 的轴 keyup 释放但不拦截；无资格/未知/重复/不可用路径没有虚假错误或额外命令。
- [ ] AC-06/07：暂停、失焦、hidden、pagehide、restart/exit/fault/dispose 均清表；恢复的 repeat 不能建表，新非重复按下才生效，所有受限通知无输入/控制调用。
- [ ] AC-12：input 错误保留原因和操作名；仅成功轴变更清旧 input 错误，不覆盖独立错误；状态快照不因 tick/相同状态重复发布。
- [ ] retired/unbind/旧 run 的 setInput 不触及运行；目标测试与 `pnpm check` 通过，上游契约及测试不放宽。

## 验证方法

- `pnpm exec vitest run src/platform/input/keyboard-input.test.ts src/ui/game`，使用真实 Session、ControlledHost、store、桥接和命令反馈；测试源只按 01 端口交付记录，不伪造游戏结果。
- 固定种子与 tickRate，逐 tick 记录按键序列推导的 MoveInput；参考 Core 使用同一序列，比较投影。需要检查录制时使用现有 recording 选项，不改版本。
- 在通知边界记录 setInput/submitCommand/control 调用，确认暂停后既有轴归零且没有从 attach/status 补发；分别保留旧绑定/信号回调测试身份隔离。
- 浏览器反馈由 05 核验。本项收尾按 [simplify](../../../../../.agents/skills/simplify/SKILL.md)限于消费者及必要的桥接/store 扩展。

## 完成证据
