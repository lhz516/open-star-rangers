---
type: plan
status: active
phase: P2
task: "07"
subtask: "14"
updated: 2026-10-06
---

# 14 — 真实 Worker 中的 cockpit-hud-map 组

**契约来源：** [spec](../spec.md) 的 S-10 的浏览器部分；[验证策略](../spec.md#验证策略)中的浏览器验证；AC-09。
**依赖：** 12、13。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **场景：** 在 [import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts) 中提供（或更新）测试场景：生产作业处理合成光盘，光盘按生产映射的结构放置合成的 DATA、CCKD、MFDD、TABL 与 BITM 条目（12 的测试支持），以及满足逻辑与音频阶段的合成内容或测试注入。
- **用例（扩展 [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts)）：**
  - 成功：持有者收到以转移交出的 `cockpit-hud-map` 组并验证为 `group-complete`；`finished.usage` 的 `assets`、`imagePixels`、`paletteEntries`、`glyphs`、`payloadBytes` 等于合成声明的逐维合计（与 Node 侧期望来自同一常量）；
  - 损坏的合成 CCKD 元素：作业以 `source` 层 `invalid-payload` 失败，没有组被移交；
  - 收到首条 `convert-graphics` 进度时取消：状态为 `cancelled`，Worker 终止，之后状态不再改变；
  - 既有用例按新的组集合与用量更新，Worker 创建与终止、监听移除的探针断言保持。
- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的约定只用代码生成的合成数据，证据记录命令、用例名与结果。

## 不包含

- Node 侧的组装与失败分类：归 [13](./13-group-assembly.md)。
- 页面、查看器与 Canvas/WebGL 显示：归 P2-11。

## 关键文件与契约

- **修改：** [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts)、[import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts)、必要时 [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts)。

## 验收标准

- [x] AC-09：成功、损坏与取消三类用例在 development 项目的真实 Chromium 模块 Worker 中通过。
- [x] 既有 import-worker 用例全部通过；没有原版数据进入测试或证据。
- [x] `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm test:e2e e2e/import-worker.spec.ts --project=development`。
- 证据记录命令、通过的用例数与用量断言。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **命令：** `OSR_E2E_DEV_PORT=4273 OSR_E2E_PREVIEW_PORT=4274 pnpm test:e2e e2e/import-worker.spec.ts --project=development`，16/16 通过（Chromium，development 项目，Vite 开发服务器，端口 4273）。端口 4173 被其他工作树占用，因此改用其他端口。只用代码生成的合成数据。

  | 准则 | 用例 | 观察到的结果 | 结论 |
  |---|---|---|---|
  | AC-09 成功 | “test entry converts the production graphics and sounds after identification and finishes with the cockpit-hud-map and audio groups” | `graphics` 场景的合成光盘按生产结构放置 DATA、CCKD、MFDD、TABL 与 BITM。持有者对 `cockpit-hud-map` 记为 `group-complete`，Asset 数为 4 + `COCKPIT_HUD_MAP_USAGE.assets`，没有诊断。`finished.usage` 逐维等于 `PRODUCTION_CONVERSION_USAGE`；它与 Node 测试共用，含 P2-07 的 `COCKPIT_HUD_MAP_USAGE`。`takeGroups()` 移交 `cockpit-hud-map` 与 `audio`；Worker 发送 1 次、终止 1 次，没有残留监听 | passed |
  | AC-09 转移而非复制 | “test entry identifies production-sized synthetic files and transfers four complete groups” | `synthetic` 场景发送含 `cockpit-hud-map` 的四个组，测试入口在结束前确认发送过的 payload 视图都已失效 | passed |
  | AC-09 损坏 | “test entry fails corrupt synthetic graphics … › a corrupt cockpit element”（新增） | 第一个前视元素的绘制遍标志为 2（`productionCoveredFiles('element')`）：`failed`，`source` 层 `invalid-payload@graphics[layout/cockpit/front].elements`，没有收到 `group`，`takeGroups()` 为 null，Worker 终止 1 次 | passed |
  | AC-09 取消 | “cancelling at the first graphics progress terminates the Worker, and nothing changes afterwards” | 首个 `convert-graphics` 快照时取消，同步变为 `cancelled`；Worker 终止 1 次、监听移除，之后多帧没有新快照 | passed |
  | 既有用例 | 其余 12 个 | 全部通过；损坏字库用例与损坏元素用例合并为同一组参数化用例 | passed |
- **实现：**
  - [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 的 `productionCoveredFiles(corrupt?)` 接受 `'font' | 'element'`；
  - [production-graphics.test-support.ts](../../../../../src/original-data/conversion/production-graphics.test-support.ts) 的 `productionCockpitBlock` 可替换第一个前视元素的标志；
  - [import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts) 新增 `graphics-element-corrupt` 场景；
  - [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts) 新增该用例。
- **检查：** `pnpm typecheck`、`pnpm lint` 与 `pnpm test -- src/workers/ src/app/import/ src/original-data/conversion/` 通过（4044 个测试）。
- **rubber-duck：** 没有阻塞或非阻塞问题，确认 AC-09 的各项都有断言，且损坏夹具不改动共享块。
- **simplify：**
  - 已修正：
    - 损坏元素改为经 `productionCockpitBlock` 的标志参数声明式生成，不再改写字节，也不在模块载入时构建；
    - 损坏参数改为可选的 `CockpitCorruption`；
    - e2e 夹具选择改用查找表；
    - 两个损坏用例合并为参数化用例。
  - 跳过：Worker 场景改为按需构建（既有场景都在载入时构建，不在本子任务范围）。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)的测试 Worker 入口一节记录新场景与两个损坏变体。工具指南与 STATUS 不受影响。
