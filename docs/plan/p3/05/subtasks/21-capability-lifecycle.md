---
type: plan
status: active
phase: P3
task: "05"
subtask: "21"
updated: 2026-10-10
---

# 21 — 能力申请生命周期：全屏、Keyboard Lock 与 Pointer Lock

**契约来源：** [spec](../spec.md) 的[全屏与 Keyboard Lock](../spec.md#全屏与-keyboard-lock)、[生命周期与资源](../spec.md#生命周期与资源)“异步申请”、[清键与恢复](../spec.md#清键与恢复)（退出全屏、退出 Pointer Lock）、[数据模型与契约](../spec.md#数据模型与契约)的“能力申请状态与错误”行，技术决定 7；S-10、S-12、S-14 的能力部分；AC-13、AC-14、AC-16 的 Node 部分。
**依赖：** 13、14、20。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/ui/game-input/capabilities.ts` 并接入 20 的输入消费者：全屏、锁键与 Pointer Lock 各自的 `unsupported`/`idle`/`pending`/`active`/`failed` 状态，带 owner、run 与申请代次；同种能力至多一个未结申请。
- **全屏：** 开始手势中发起的申请先绑定该次 start attempt，仅在这次 start 成功后关联其 run，不借给后来的重开；开始失败、返回菜单、取消或重开撤销资格，正常的配置→占位→飞行转换不撤销。只退出本任务申请且仍拥有的全屏。退出全屏时使锁键资格失效、清本地按住与重复，running 时 `clearInput('focus-loss')`，不单独暂停；同时 hidden 时以会话自动暂停为准。
- **锁键：** 只在 API 全屏、running 且输入区合格时以 19 推导的 code 清单锁定（不锁 Escape、Tab、Meta、F12）；暂停、失焦、任务菜单、配置、占位、stopped/faulted、离开页面或全屏时立即解锁；重新合格后满足条件才恢复，需要新手势时由状态提示按钮，不无限重试。锁键失败但全屏成功时保留“全屏、未锁键”并给出降级原因。
- **Pointer Lock 的通用部分：** 申请、实际目标确认与主动/被动解锁的状态与代次，供 22 使用；每次从本任务的锁定转为无锁都清本地状态，running 时 `clearInput('pointer-lock-exit')`。
- **迟到与屏障：** 主动取消立即逻辑失效；迟到成功只能对仍由本任务拥有的目标解锁/退出，不重设焦点、不改模式、不提交动作；迟到失败进入原申请的错误/收尾记录。跨 owner 等待 `previousClosed`，同 owner 重开也等待旧申请/关闭收尾；旧 disposer 不能解除新运行的锁。每项清理独立尝试、聚合失败；无法确认释放则锁存，不报“已释放”。
- 能力状态与失败写入 20 的输入状态供界面显示；不进入 Core 或录制。
- Node 测试：受控 Promise 与 change/error 事件的各种排列（成功、失败、部分成功、迟到成功/失败、未结时离页、重开与跨 owner 屏障），锁键启停条件矩阵，退出全屏与解锁的清键。

## 不包含

- 平台适配（13、14）；地图位置、光标与命令（22）；按钮与提示的呈现（23）；装配（25）。

## 关键文件与契约

- 13 的 `pointer-lock.ts`、14 的 `fullscreen.ts`；20 的 `input-consumer.ts`、`input-status.ts`；[mission-owner.ts](../../../../../src/app/mission/mission-owner.ts) 的 `previousClosed`；[rollback-error.ts](../../../../../src/app/session/rollback-error.ts)。
- 计划新增：`capabilities.ts`、`capabilities.test.ts`。

## 写入范围

- `src/ui/game-input/capabilities.ts`、`src/ui/game-input/capabilities.test.ts`
- `src/ui/game-input/input-consumer.ts`、`src/ui/game-input/input-consumer.test.ts`
- `src/ui/game-input/input-status.ts`、`src/ui/game-input/input-status.test.ts`

## 验收标准

- [ ] 各能力的状态、代次与单一未结申请成立；开始手势的全屏只关联成功的那次 start。
- [ ] 锁键只在全屏+running+合格输入区启用，清单不含 Escape/Tab/Meta/F12，所有规定情形立即解锁；失败与降级如实显示。
- [ ] 迟到结果不影响新运行，屏障与清理聚合、锁存符合契约（AC-16 的 Node 部分）；退出全屏与解锁的清键符合 AC-13。
- [ ] `pnpm exec vitest run src/ui/game-input` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 受控 Promise 与事件排列；浏览器与实机由 28、30 验证。

## 完成证据
