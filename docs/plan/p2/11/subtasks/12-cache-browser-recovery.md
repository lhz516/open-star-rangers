---
type: plan
status: active
phase: P2
task: "11"
subtask: "12"
updated: 2026-10-06
---

# 12 — 缓存恢复的浏览器验证

**契约来源：** [spec](../spec.md) 的 S-04、AC-08（浏览器），以及[行为与边界](../spec.md#行为与边界)中的首次载入、打开缓存与缓存失败各行，[缓存编排](../spec.md#缓存编排)的重新导入提示。
**依赖：** 07, 11。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 开发项目 E2E（测试入口，测试拥有的隔离 context）：
  - **刷新恢复：** 合成完整包提交后，在同一 context 中刷新。菜单显示有缓存（尚未校验）；打开后恢复并校验，查看器的 manifest 身份与提交前相同，任务载入成功。
  - **改写：** 测试同长度改写一条 payload 记录后打开，显示 `cache-corrupt` 与重新导入提示，不显示任何资源。
  - **页面打开时删除：** 删除数据库后回到菜单，保存状态变为“仅在内存中”（`not-found`），资源仍可查看并可重新保存。
  - **刷新后删除：** 刷新后菜单显示没有原版数据。
  - **筛选：** `ConverterVersion` 或指纹与预期包配置不同的条目不提供恢复。
- 只在测试拥有的 context 中操作 IndexedDB；不清空用户站点数据。
- 若发现实现缺口，回到相应子任务（03、06、07、11）修正，并在本子任务记录。

## 不包含

- 缓存迁移、清理与管理界面（P5）；生产预览中的恢复（14）。

## 关键文件与契约

- 计划新增 E2E 用例，或扩展 07 的用例文件。
- 复用：[resource-cache.ts](../../../../../e2e/support/resource-cache.ts) 的 `installIdbProbe`、`readStoredRecords`、`clearOriginIndexedDb`、`withPersistentProfile`；[resource-cache.spec.ts](../../../../../e2e/resource-cache.spec.ts) 的改写与刷新方法。

## 验收标准

- [ ] AC-08（浏览器）：刷新恢复、改写、页面打开时删除、刷新后删除与条目筛选的结果都如上。
- [ ] 恢复后的内容身份与提交前相同，任务载入成功。
- [ ] 测试只改动自己的 context；开发项目的相关 E2E 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行 `pnpm exec playwright test <新用例> --project=development`。
- 本子任务只新增测试时，不需要 simplify；若修改实现代码，按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)，并运行 `pnpm check`。

## 完成证据
