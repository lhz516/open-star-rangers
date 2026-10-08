---
type: plan
status: active
phase: P2
task: "12"
subtask: "07"
updated: 2026-10-07
---

# 07 — 生产项目联合闭环与回退审计

**契约来源：** [spec](../spec.md) 的 S-02（生产项目）、S-03、S-05（识别与恢复窗口）、[联合闭环](../spec.md#联合闭环)；AC-03、AC-04 与 AC-05 的生产部分、AC-08 的生产回退部分、AC-10。
**依赖：** 01, 02, 03, 04, 05。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **联合闭环（计划新增 `e2e/joint-pipeline.production.spec.ts`）：** 同一空的隔离 context，3 轮，全程记录 `securitypolicyviolation`（参照 [production-preview.spec.ts](../../../../../e2e/production-preview.spec.ts)）：
  1. 导入带金丝雀的生产尺寸合成文件，真实 `/assets/` Worker chunk 报告 `source`/`unsupported-version` 后终止；本次结果不持有资源，已有包保留不变。
  2. 只在第一轮识别失败后用 05 的带标记变体经 `seedProductionCache` 预置一次（`add`，不得重复插入同键），刷新以重新列出缓存；之后各轮保留该缓存。未持有包时经菜单恢复；已持有包时先验证识别失败不改变它，再直接查看。
  3. 查看 6 类、试听 4 个角色、返回；释放检查后同源刷新，再恢复、查看、返回；刷新前后完整内容身份、payload 指纹、已知像素与任务摘要相同。
  - 同文档内连续 3 次缓存恢复后的查看往返：暖态 GPU 计数相等，退出后自有资源为 0。
  - 实际窗口：识别作业与缓存恢复各自测量，长任务数为 0。
  - 不宣称生产导入的成功路径已由合成文件覆盖。
- **回退审计：** 修改 [production-preview.spec.ts](../../../../../e2e/production-preview.spec.ts)，让 Worker 脚本 404 与被回退为 HTML 两个用例使用 02 的审计夹具，测试专用的失败请求逐条声明；其余断言与精确诊断匹配不变。

## 不包含

- 开发项目闭环（06）；开发项目的 Worker 故障（09）；真实 SWA 响应头与回退（P5）。

## 关键文件与契约

- [production-cache.ts](../../../../../e2e/support/production-cache.ts) 的 `seedProductionCache`；[preview-csp.ts](../../../../../tools/preview-csp.ts)；[synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 的 `productionSizedFiles` 及 05 的带标记变体。

## 写入范围

- `e2e/joint-pipeline.production.spec.ts`：生产项目联合闭环。
- `e2e/production-preview.spec.ts`：回退用例启用审计。

## 验收标准

- [ ] AC-03：3 轮全部通过；识别失败不替换已有包；预置只发生一次；6 类画面、4 类试听、刷新恢复与任务诊断一致；无意外 CSP 违规或控制台错误。
- [ ] AC-04（生产）：每轮刷新前释放证据成立；同文档往返 GPU 暖态计数相等。
- [ ] AC-05（生产）：识别与恢复窗口的长任务数为 0，记录完整。
- [ ] AC-08（生产回退）：404 与 HTML 回退用例在审计下通过，测试专用请求单独声明。
- [ ] AC-10（本用例）：审计零意外违规，满足生产允许集。
- [ ] `pnpm typecheck`、`pnpm lint` 与 `pnpm exec playwright test e2e/joint-pipeline e2e/production-preview --project=production` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)：生产项目先构建（`pnpm build`），合成数据、隔离 context。
- 不涉及原版对照。

## 完成证据
