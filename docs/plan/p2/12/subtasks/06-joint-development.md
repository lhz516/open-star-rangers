---
type: plan
status: active
phase: P2
task: "12"
subtask: "06"
updated: 2026-10-07
---

# 06 — 开发项目联合闭环

**契约来源：** [spec](../spec.md) 的 S-02（开发项目）、S-03、S-05（实际窗口）、[联合闭环](../spec.md#联合闭环)；AC-02、AC-04 与 AC-05 的开发部分、AC-10。
**依赖：** 01, 02, 03, 04, 05。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

计划新增 `e2e/joint-pipeline.development.spec.ts`，使用 02 的审计夹具、03 的响应探针、04 的资源平衡辅助与 05 的金丝雀 fixture：

- **3 轮联合闭环（同一隔离 context）：** 每轮按 spec 的开发步骤：
  1. 菜单 → 导入页面 → 文件选择控件提交带金丝雀的合成光盘 → 开始；真实模块 Worker 经测试入口走完五个阶段的真实转换（不是预制组）。
  2. 阶段顺序由 04 记录的 Worker 消息断言，React 可以合并短暂进度；状态符合 P2-11 的成立条件，任务载入与自动提交无先后要求；不以 `finished` 代替完整性。任务摘要同时等于 fixture 的独立预期与 Node 对同一合成组的诊断。
  3. 查看器中模型、效果、图像、调色板、布局、字库各选一项，已知像素样本误差 0（效果只取不跨接缝的面）；开火、导弹、爆炸、Warp 各一次可信点击试听，音频探针观察到缓冲、开始与停止。
  4. 返回菜单，验证释放（04），并在刷新前保存证据。
  5. 同源刷新 → 菜单显示有缓存（尚未校验）→ 打开已缓存的资源 → 恢复并重新校验；完整内容身份、payload 指纹、像素样本与任务摘要等于刷新前 → 返回菜单。
  6. 启动并退出合成演示，演示不显示也不使用导入的资源。
- **同文档往返：** 不刷新、不重建 App，连续 3 次导入与查看；同一项暖态 GPU 计数相等，退出后自有资源为 0。
- **实际窗口：** 导入（开始到终态）、提交（开始到终态）、恢复（开始到重新校验并载入完成）各自测量；长任务数为 0，记录实际耗时、最长任务与最大帧间隔。不人为拖慢 Worker。
- **网络与标记：** 全程审计零意外违规（HMR 流量单列）；金丝雀到达 payload 与缓存的证明作为附件。

## 不包含

- 生产项目闭环（07）；失败路径（08–10）；目标设备性能（P5）。

## 关键文件与契约

- 复用 [app-entry.ts](../../../../../e2e/support/app-entry.ts)、[viewer-observations.ts](../../../../../e2e/support/viewer-observations.ts) 的像素样本、[audio-playback.ts](../../../../../e2e/support/audio-playback.ts)、[resource-cache.ts](../../../../../e2e/support/resource-cache.ts) 的只读记录，以及 [mission-diagnostics.ts](../../../../../src/app/resources/mission-diagnostics.ts) 的 Node 诊断。
- 参照 [cache-recovery.spec.ts](../../../../../e2e/cache-recovery.spec.ts) 与 [joint-resources.spec.ts](../../../../../e2e/joint-resources.spec.ts)。

## 写入范围

- `e2e/joint-pipeline.development.spec.ts`：开发项目联合闭环。

## 验收标准

- [ ] AC-02：3 轮全部通过；阶段顺序、状态、6 类像素样本、4 类音频观察、刷新前后的身份/指纹/像素/摘要一致与 fixture 独立预期均断言；合成演示不消费导入包。
- [ ] AC-04（开发）：每轮刷新前释放证据成立；同文档 3 次往返 GPU 暖态计数相等、退出后自有资源为 0；包与 payload 键集合准确。
- [ ] AC-05（开发）：导入、提交、恢复三个实际窗口的长任务数为 0，记录完整。
- [ ] AC-10（本用例）：审计零意外违规，金丝雀到达已证明。
- [ ] `pnpm typecheck`、`pnpm lint` 与 `pnpm exec playwright test e2e/joint-pipeline --project=development` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)：合成数据、隔离 context，结束后清理。
- 长任务超标时保留样本并定位来源，不过滤或放宽；来自应用的超标按 spec 技术决定 15 回到责任任务。
- 不涉及原版对照。

## 完成证据
