---
type: plan
status: active
phase: P3
task: "14"
subtask: "17"
updated: 2026-10-28
---

# 17 — 任务所有者音频与关闭屏障

**契约来源：** [spec](../spec.md#模式与生命周期) 的 S-08、AC-10、AC-11。
**依赖：** 16, 20。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 实现 media 消费者：等待 previousClosed 后创建控制器/加载同包内容，attachRun 连接 16，release 观察真实 close 并加入屏障。
- 按 D-02 的 DW-01、DW-11（D2-01、D2-14）：飞行消费者新增 `presentation()`，保存 `wireFlightRun` 返回的同一表现实例（含没有驾驶舱的分支），随运行结束撤回；媒体消费者的选项接收 `presentation` 取值函数，在 `attachRun` 中取得并核对 owner、run 与 tick 0，取得 20 增补后的实际 `FlightPresentation`；会话进入 `completed` 时与 `stopped`、`faulted` 一样立即失效。
- 暴露 D-01 的声音状态与可信操作入口供 18 使用；运行身份、主动暂停、隐藏、结果页和 stopped 的播放门禁与宿主状态独立。
- 可信操作异步完成仅在当前许可仍有效时恢复；跨 run/owner 的迟到 resume、ended、close 不改变新运行。
- 能力失败且清理成功可无声继续；内容、装配、挂起失败和清理锁存分别处理，部分创建回滚每步都尝试。

## 不包含

- 不让 media 消费者获得输入控制/step，不创建第二个 Session，不画 UI。

## 关键文件与契约

- 现有 [MissionOwnerConsumer/Connection](../../../../../src/app/mission/mission-owner.ts)、[mission-slot.ts](../../../../../src/app/composition/mission-slot.ts)及所有权测试。
- 计划新增 `src/app/flight-audio/owner.ts`、`owner.test.ts`；UI 只读其状态并调用明确操作。

## 写入范围

- `src/app/flight-audio/owner.ts`：所有者级声音连接。
- `src/app/flight-audio/owner.test.ts`：生命周期/身份/异步失败。
- `src/app/mission/mission-owner.ts`：仅 D-01 获批的操作接线。
- `src/app/mission/mission-owner-ownership.test.ts`：media 和屏障回归。
- `src/app/mission/mission-owner-input.test.ts`：p/菜单恢复不旁路。
- `src/app/composition/mission-slot.ts`：仅必要关闭屏障接线。
- `src/app/composition/mission-slot.test.ts`：新旧所有者隔离。
- `docs/engineering/modules/app.md`：所有权与错误说明。
- `src/app/mission/flight-consumer.ts`：新增 `presentation()` 取得同一表现实例（D2-01，协调者 2026-10-28 扩展）。
- `src/app/mission/flight-consumer.test.ts`：同上的测试。

## 验收标准

- [ ] 每 owner 至多一个控制器/上下文，等待屏障有状态，先前关闭失败锁存。
- [ ] 所有模式、快速暂停恢复、暂停中隐藏和晚回调都保持门禁；结果页和停止后无飞行声音。
- [ ] 同步/异步取得和清理错误分级准确，不吞异常、不由再次打开页面绕过锁存。

## 验证方法

- 使用 mission/session 现有假宿主，关闭成功/拒绝/悬置和多 run 组合；`pnpm test -- src/app/flight-audio/owner.test.ts src/app/mission/mission-owner-ownership.test.ts src/app/mission/mission-owner-input.test.ts src/app/composition/mission-slot.test.ts`、`pnpm check`。
- 对本项调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)；真实激活与 HMR 归 22/23。

## 完成证据
