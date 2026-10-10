---
type: plan
status: active
phase: P3
task: "03"
subtask: "20"
updated: 2026-10-09
---

# 20 — 浏览器验证

**契约来源：** [spec](../spec.md) 的 S-15、AC-15（浏览器缓存）、AC-17；[验证策略](../spec.md#验证策略)的浏览器验证。
**依赖：** 19, 26, 27。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 用版本 4 的合成包在生产预览中验证，不使用原版数据：
  - 导入后显示 `Complete resources, viewable`；保存后刷新，用 `Open saved resources` 恢复并重新校验；
  - 查看器能打开至少一个爆炸帧图像、一个星云图像、受击闪烁贴图与目标显示屏背景；断言实际的 Canvas/WebGL 像素与合成图像一致，不只看 Canvas 存在或 HTTP 200；
  - `Sounds` 列出新增的 `event-sound` 与 `hud-sound`，并能播放其中一个合成波形（断言调用与生命周期）；
  - `repeat` 方式的合成声音（27 提供）按次数播放后自然结束，可被提前停止（spec 修订 1，AC-17）；
  - 19 的交接：查看器的第一个图像现在是带掩码的爆炸帧；AC-24 布局对照在透明纹素上期望的棋盘灰（102）与实际渲染（153）不一致，19 已把该用例改用不透明的导弹图像。判明哪一方符合查看器契约：若是对照有误，修正对照并恢复覆盖带掩码的图像；若是渲染有误，不在本项改应用代码，作为阻塞报告给协调者。
  - 旧转换器版本的合成缓存记录不提供恢复。
- 在 [e2e/](../../../../../e2e/) 中新增或扩展用例：`viewer-page`、`resource-cache`、`cache-recovery`、`audio-playback` 及其观察支持。新用例带网络审计与资源平衡，不发出未预期的网络请求，也没有遗留资源。
- 运行完整的 `pnpm test:e2e`，确认既有用例全部通过。

## 不包含

- 原版数据的浏览器核对：本任务不要求。外观对照在 21 中只用本地数据与截图完成。
- 查看器中 data Asset 的专用显示：不做（spec 技术决定 9）。
- 本地导入指南：由 22 同步。

## 关键文件与契约

- [viewer-page.spec.ts](../../../../../e2e/viewer-page.spec.ts)、[resource-cache.spec.ts](../../../../../e2e/resource-cache.spec.ts)、[cache-recovery.spec.ts](../../../../../e2e/cache-recovery.spec.ts)、[audio-playback.spec.ts](../../../../../e2e/audio-playback.spec.ts)、[e2e/support/](../../../../../e2e/support/)。
- [viewer-items.ts](../../../../../src/app/viewer/viewer-items.ts)（只读）：新增图像与声音无需改代码即可列出。
- [工程约定：本地浏览器 runner](../../../../engineering/README.md#本地浏览器-runner)。

## 写入范围

- `e2e/**`：新增与扩展的浏览器用例及观察支持。

## 验收标准

- [ ] AC-17：版本 4 的合成包完成导入、保存与刷新恢复；查看器显示上述四类新图像，像素断言通过；`Sounds` 列出新声音并播放一个合成波形，`repeat` 声音按次数播放后结束；无未预期的网络请求或遗留资源。
- [ ] 带掩码图像的棋盘灰差异已判明，结论与处理记录在完成证据中。
- [ ] AC-15（浏览器）：`resource-cache` 与 `cache-recovery` 通过，旧版本记录不提供恢复。
- [ ] 完整的 `pnpm test:e2e` 通过；证据记录用例名、结果与 Chrome 版本，不保存截图到仓库。

## 验证方法

- `pnpm test:e2e`；按 browser-testing 核对实际画面与声音调用。合成按键与合成数据不作为原版证据。

## 完成证据
