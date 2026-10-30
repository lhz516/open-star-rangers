---
type: plan
status: active
phase: "P3"
task: "15"
subtask: "02"
updated: "2026-10-29"
---

# 02 — 合成全闭环（production）

**契约来源：** [spec](../spec.md) 的 S-01、S-02（生产部分）、[技术决定](../spec.md#技术决定)；AC-01 的 production 部分、AC-02 中“production 构建不暴露开发录制或诊断能力”。
**依赖：** 01。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新建 `e2e/joint-loop.production.spec.ts`（production 项目、严格 CSP 与网络审计下）：以 [production-cache.ts](../../../../../e2e/support/production-cache.ts) 的 `seedProductionCache` 用 01 的变体包（生产身份）预置并经菜单恢复，走与 01 相同的成功、失败与重试完整用户流程。
- 只经任务画面的只读属性（如 `data-tick`）、可见 UI、结果页与宿主探针观察；不依赖开发面板、事件日志或录制。
- 断言生产 DOM 与可达入口中不存在开发录制导出或诊断能力（与 [mission-flow.production.spec.ts](../../../../../e2e/mission-flow.production.spec.ts) 和 [production-preview.spec.ts](../../../../../e2e/production-preview.spec.ts) 的既有检查一致，不重复其产物扫描）。

## 不包含

- 录制与 Node replay（01）；生命周期与资源平衡（03）。
- 修改 01 的共享支持文件；若需新增仅生产用的辅助，写在本 spec 文件内。

## 关键文件与契约

- 现有：[mission-flow.production.spec.ts](../../../../../e2e/mission-flow.production.spec.ts)、[production-cache.ts](../../../../../e2e/support/production-cache.ts)、[audited-test.ts](../../../../../e2e/support/audited-test.ts)。
- 01 交付：`e2e/support/joint-loop.ts`。
- 计划新增：`e2e/joint-loop.production.spec.ts`。

## 写入范围

- `e2e/joint-loop.production.spec.ts`：production 闭环用例。

## 验收标准

- [ ] AC-01（production）：成功与失败均由规则自然产生并到达结果页，各自重试进入新运行（tick 从 0 起）；起飞、选目标、射击、地图/Warp、基地交互的可见结果均有断言。
- [ ] AC-02（production 部分）：生产构建中没有开发录制导出或诊断入口。
- [ ] 网络审计无违规；不读取原版文件；`pnpm typecheck`、`pnpm lint` 通过，已按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 执行：`pnpm test:e2e e2e/joint-loop.production.spec.ts --project=production`，连续两次通过。

## 完成证据
