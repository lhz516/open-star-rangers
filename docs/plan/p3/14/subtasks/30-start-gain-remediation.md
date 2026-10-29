---
type: plan
status: active
phase: P3
task: "14"
subtask: "30"
updated: 2026-10-29
---

# 30 — 发声开始时音量偶发未生效的排查（补救）

**契约来源：** [spec](../spec.md#控制器扩展边界) 的 S-03、AC-06；[D-01 定稿](../spec.md#d-01-定稿已批准)的播放器契约（初始参数在 `start()` 之前生效）。
**依赖：** 22。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 25 在私有真实内容运行 `nowing-3` 中观察到：3,373 个带参数的发声中有 1 个（10179，与前一次射击同 tick、同参数，晚 256 帧开始）在 `start()` 时音量增益读为 1 而不是 108/127；声像与速率正确，之后没有更新。53,040 次合成 Chrome 试验未复现，后续带 setter 记录的运行（108 个发声）也正常。
- 查明 [browser-audio-controller.ts](../../../../../src/platform/audio/browser-audio-controller.ts) 与 [audio-controller.ts](../../../../../src/platform/audio/audio-controller.ts) 中初始增益的设置方式（`.value`、自动化事件、节点连接与 `start()` 的先后）是否在某种时序下让初始值失效；若有此路径，改为与时序无关的设置并加回归测试。
- 若查明不可能出现（例如 25 的探针读法有误），给出证据并说明，不修改代码。

## 不包含

- 不改变 D-01 的参数契约与其他节点结构；不处理声像与速率。

## 写入范围

- `src/platform/audio/browser-audio-controller.ts`、`src/platform/audio/audio-controller.ts`：仅初始参数的设置时序。
- `src/platform/audio/*.test.ts`、`src/platform/audio/*.test-support.ts`：回归测试。
- `e2e/flight-audio.spec.ts`、`e2e/support/flight-audio.ts`、`e2e/support/audio-playback.ts`：仅在需要浏览器回归时。

## 验收标准

- [ ] 给出原因结论（代码路径或探针误读）及证据。
- [ ] 若为代码问题：已修复，初始增益在任何时序下于 `start()` 之前生效，有单元与浏览器回归；22 的输出探针仍通过。
- [ ] 查看器既有行为不变。

## 验证方法

- `pnpm check`；开发与生产项目中 `e2e/flight-audio.spec.ts` 与 `audio-playback.spec.ts`，按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)。

## 完成证据
