---
type: plan
status: active
phase: P3
task: "14"
subtask: "23"
updated: 2026-10-15
---

# 23 — 原生隐藏、重开与音频资源平衡

**契约来源：** [spec](../spec.md#模式与生命周期) 的 S-08、S-10、AC-10、AC-12。
**依赖：** 22。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 复用 22 的探针，在 native-lifecycle 中以真实标签页隐藏/page 生命周期验证：暂停中隐藏也丢弃声音，可见后仍需显式恢复。
- 三次任务往返/重开检查 owner/run 隔离、上下文关闭、声音/参数节点、监听和待处理意图回到基线。
- 覆盖结果页、容量停止、错误、退出，以及 StrictMode/Fast Refresh；不让旧回调重放新 run 音效。
- Viewer 的既有声音/关闭行为纳入相关回归，资源失败如实记录，不把逻辑失效当作物理关闭已完成。

## 不包含

- 不用合成 visibility 事件代替真实隐藏，不新建浏览器 runner 或全站缓存清理。

## 关键文件与契约

- 现有 [native-lifecycle.spec.ts](../../../../../e2e/native-lifecycle.spec.ts)、[joint-resources.spec.ts](../../../../../e2e/joint-resources.spec.ts)、[fast-refresh.spec.ts](../../../../../e2e/fast-refresh.spec.ts)。
- 现有 resource-balance/browser-probes 和 22 新增输出探针；不改变 production 应用逻辑。

## 写入范围

- `e2e/native-lifecycle.spec.ts`：headed 原生隐藏。
- `e2e/joint-resources.spec.ts`：往返/重开资源平衡。
- `e2e/fast-refresh.spec.ts`：HMR 隔离。
- `e2e/support/resource-balance.ts`：音频资源计数。
- `e2e/support/browser-probes.ts`：清理/节点探针。
- `e2e/support/flight-audio.ts`：22 新建支持的生命周期读取。

## 验收标准

- [ ] 原生隐藏确实停止所有发声，visible/pageshow 不自动恢复游戏或过期声音。
- [ ] 往返、重开、结果/退出与 HMR 后资源平衡，创建与真实关闭一一对应。
- [ ] 悬置上下文和 analyser 旧值按 spec 判定，失败未被静默忽略。

## 验证方法

- 使用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；`pnpm test:e2e --project=development-headed e2e/native-lifecycle.spec.ts`。
- `pnpm test:e2e --project=development --project=production e2e/joint-resources.spec.ts e2e/fast-refresh.spec.ts e2e/audio-playback.spec.ts`（既有配置自动排除不适用项目）；`pnpm check`。
- 对测试改动调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)，不以 UI 外观替代资源证据。

## 完成证据
