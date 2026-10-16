---
type: plan
status: active
phase: P3
task: "14"
subtask: "11"
updated: 2026-10-15
---

# 11 — 保留进度的暂停与宿主中断

**契约来源：** [spec](../spec.md#模式与生命周期) 的 S-03、S-08、AC-06、AC-10。
**依赖：** 10。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 10 的进度/句柄基础上实现任务暂停门禁：主动暂停保留播放位置，resume 只在许可仍有效时恢复。
- 隐藏/pagehide/非预期中断无条件丢弃旧声音，包含主动暂停中和 suspend 尚未完成的情况；可见性或上下文自行恢复不打开任务门禁。
- 处理快速 pause/resume、迟到 promise、挂起失败、关闭和重复清理；平台不读取 owner/run，而以 D-01 的许可/撤销接口接受消费者控制。
- 不启用任务门禁的查看器仍遵循既有隐藏释放/显示后恢复上下文且不重播的行为。

## 不包含

- 不选择哪些循环需要重建（16），不决定任务页面（17/18），不改变 Session 控制语义。

## 关键文件与契约

- 现有 [audio-controller.ts](../../../../../src/platform/audio/audio-controller.ts) 的状态跟随、hide/show 与 release；10 新增的进度/能力契约。
- 现有 [audio-controller.test.ts](../../../../../src/platform/audio/audio-controller.test.ts) 包含隐藏和迟到 resume 回归。

## 写入范围

- `src/platform/audio/**`：暂停/恢复、中断与能力替身测试。
- `src/app/viewer/viewer-audio.test.ts`：未启用新门禁时的兼容。
- `docs/engineering/modules/platform.md`：暂停/中断契约。

## 验收标准

- [ ] 主动暂停后的三种播放模式从原进度继续；暂停不消耗有限重复剩余量。
- [ ] 暂停中隐藏仍释放所有节点；迟到恢复不能让门禁关闭时输出。
- [ ] 宿主异常与清理失败明确上报，查看器旧行为不变，所有相关测试通过。

## 验证方法

- 假 promise 完成顺序、context.state 与采样时钟联合断言；`pnpm test -- src/platform/audio src/app/viewer/viewer-audio.test.ts`、`pnpm check`。
- [simplify](../../../../../.agents/skills/simplify/SKILL.md)只处理本项；原生可见性在 23 验证，不能由假事件代替。

## 完成证据
