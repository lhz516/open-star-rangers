---
type: plan
status: active
phase: P2
task: "11"
subtask: "22"
updated: 2026-10-06
---

# 22 — 查看器的试听与音频关闭观察

**契约来源：** [spec](../spec.md) 的 S-08（试听）、S-12（音频上下文的 `close()` 观察）、AC-15（Node），以及[行为与边界](../spec.md#行为与边界)中的试听行。查看器所有者与 GPU 归 [10](./10-viewer-owner-audio.md)。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增 DOM-free 的查看器音频（`src/app/viewer/`），由 10 的查看器所有者创建与释放：
  - **观察关闭：** 应用包装的音频能力记录上下文 `close()` 的完成或拒绝。释放以它判断“已关闭”，不以控制器的 `disposed` 快照代替；释放的结果是“没有上下文”“已关闭”或“关闭被拒绝（附原因）”，供 10 锁存。
  - **声音列表：** 从资源包完整的 `audio` 组载入声音（`SoundRecord`），列出的声音与组内 Asset 一一对应；载入失败如实报告。
  - **试听：** 可信点击时调用 `unlock()`，并记下一次待播放意图；控制器进入 `running` 后播放一次。停止、页面隐藏、取消（离开或替换资源包时由所有者调用）与释放都取消该意图，迟到的 `running` 不再播放。控制器本身不排队（P2-08）。
  - **停止：** 停止单个声音与全部声音。
  - **快照与订阅：** 冻结快照含控制器状态、声音列表、发声数与待播放意图；同步通知订阅者，抛错交给 `reportError`。
- Node 测试（伪造的音频能力与页面生命周期）：
  - 延迟解锁只播放一次；已在 `running` 时直接播放；
  - 进入 `running` 之前停止、隐藏、取消或释放后，迟到的 `running` 不播放；
  - `close()` 延迟完成、被拒绝、同步抛错；没有创建上下文时释放；
  - 声音列表与 `audio` 组一一对应；没有 `audio` 组时列表为空；
  - 不可用的音频能力：显示原因，载入与试听如实失败。

## 不包含

- 查看器所有者、GPU、锁存与生命周期（10）；React 页面与 E2E（11）。
- 修改 P2-08 的控制器契约。

## 关键文件与契约

- 计划新增 `src/app/viewer/` 的音频模块与相邻测试。
- 复用：[audio-controller.ts](../../../../../src/platform/audio/audio-controller.ts)（`createAudioController`、`AudioCapability`、`AudioContextPort`、`PageLifecycleHost`、`SoundRecord`）、06 的应用端口 `audio`、02 的资源包形状。

## 验收标准

- [ ] AC-15（Node，音频部分）：延迟解锁只播放一次；取消后迟到的 `running` 不播放；`close()` 的完成与拒绝由包装观察；声音列表与 `audio` 组一一对应；不可用的音频能力如实报告。
- [ ] `app/viewer/` 不导入 `original-data`、DOM 或 React；`pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/app tools/engineering-boundaries.test.ts`，完成前 `pnpm check`。
- 浏览器部分见 11。按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
