---
type: plan
status: draft
phase: P5
updated: 2026-10-01
related: [ADR-0012]
---

# P5：Classic 1.0 发布 — 阶段计划与任务

占位文档，尚未拆分具体任务。

阶段范围与退出条件见[总计划 §12](../master-plan.md#12-开发阶段与验收条件)，当前进度见 [STATUS](../../STATUS.md)。

## 从 P1 承接的范围

按用户确认的 [ADR-0012](../../decisions/ADR-0012-local-p1-defer-ci-deployment.md)，以下交付归入 P5，不再阻止本地 P1 验收：

- GitHub Actions 自动检查与构建，接入本地工程、合成浏览器和工具测试。
- 基于 P1 本地入口的仓库/发布产物原版哈希扫描、依赖许可自动门禁及第三方声明发布。
- PR/main 的检查保护、可信预览与 fork 凭据隔离、构建产物复用及预览关闭清理。
- SWA 预览与正式部署配置和实测，取得真实 CI/产物/URL 证据；不能用本地 build/preview 替代。

首次公开所需的许可、名称与原版资源隔离要求仍遵循总计划。push、部署或云资源变更需另行明确授权；未完成的真实发布验证不能因本地任务完成而视为通过。

这只是承接范围，不是完整 P5 拆分；浏览器、性能、存储、导入、PWA/升级和其余发布要求仍见总计划。本文件未分配实际任务 ID 或生成 spec/goal。

## 任务

暂无。后续任务使用 `01/`、`02/` 等编号目录，分别包含 `spec.md`、`goal.md` 和 `subtasks/`；本文件合并承载阶段计划与任务导航，不复制 subtask 状态。路径与分工见[Agent 任务工作流](../../engineering/agent-workflow.md)。
