---
type: plan
status: active
phase: P2
task: "11"
subtask: "10"
updated: 2026-10-06
---

# 10 — 查看器所有者与音频

**契约来源：** [spec](../spec.md) 的 S-08（试听）、S-12（GPU 与音频的所有权）、AC-06（替换前释放）、AC-15（Node，锁存部分），以及[行为与边界](../spec.md#行为与边界)中的试听、从查看器返回菜单、新结果替换资源包各行，技术决定 1。试听意图与 `close()` 观察已拆到 [22](./22-viewer-audio.md)（见 goal 执行记录）。
**依赖：** 02, 08, 22。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增查看器所有者与生命周期（`src/app/viewer/`），沿用 [synthetic-demo-lifecycle.ts](../../../../../src/app/composition/synthetic-demo-lifecycle.ts) 的锁存模式：
  - **创建：** 每次进入查看器创建一个所有者，含查看渲染（08、09）与 22 的查看器音频，由应用端口提供表面工厂与音频能力。
  - **显示：** 读取资源持有者的当前资源包：只列出已完整验证的组，并解析查看意图（Asset ID 与序号），把对应的内容交给查看渲染。读取或展开失败只标记该项。
  - **替换：** 资源持有者替换资源包前，所有者先释放引用旧内容的 GPU 资源与已载入的声音，再采用新内容。
  - **释放：** 返回菜单、卸载、StrictMode 重跑与 Fast Refresh 时释放渲染与音频。任一步失败都锁存，阻止再次创建查看器直到整页重载；导入与演示不受影响。
- **音频：** 使用 22 的查看器音频。
  - 离开与替换资源包时取消待播放意图；替换后载入新资源包的声音。
  - 以 22 释放结果中的 `close()` 观察判断“已关闭”，不以控制器的 `disposed` 快照代替。关闭确认前不创建新的音频上下文；`close()` 被拒绝时锁存。
- **Node 测试**（伪造的表面工厂、音频能力与资源持有者）：
  - 创建与释放；替换前释放；锁存后不再创建；
  - 替换与离开时取消待播放意图；
  - `disconnect` 或监听撤销抛错、`close()` 被拒绝、`close()` 延迟完成时的锁存与不重建。

## 不包含

- React 页面、控件与键盘（11）；浏览器 E2E（11、13）。
- 修改 P2-08 的控制器契约（“不排队”保持不变）。

## 关键文件与契约

- 计划新增 `src/app/viewer/` 的所有者与生命周期及相邻测试；使用 22 的查看器音频。
- 复用：[audio-controller.ts](../../../../../src/platform/audio/audio-controller.ts)（`createAudioController`、`AudioCapability`、`SoundRecord`）、[browser-audio-controller.ts](../../../../../src/platform/audio/browser-audio-controller.ts)、08 与 09 的查看渲染、02 的资源持有者、[rollback-error.ts](../../../../../src/app/session/rollback-error.ts)。

## 验收标准

- [ ] AC-06（释放）：资源持有者替换资源包前，引用旧内容的 GPU 资源与声音已释放。
- [ ] AC-15（Node，所有者部分）：离开与替换取消待播放意图；`close()` 被拒绝时锁存且不创建新的音频上下文；关闭确认前不重建。
- [ ] 任一释放步骤失败都锁存；锁存不影响导入与合成演示。
- [ ] `app/viewer/` 不导入 `original-data`；`pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/app src/render`，完成前 `pnpm check`。
- 浏览器部分见 11 与 13。按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
