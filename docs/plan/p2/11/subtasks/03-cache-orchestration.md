---
type: plan
status: active
phase: P2
task: "11"
subtask: "03"
updated: 2026-10-06
---

# 03 — 缓存编排与操作代际

**契约来源：** [spec](../spec.md) 的 S-04、S-12（异步结果）、AC-05（缓存部分）、AC-06（旧提交）、AC-07（Node）、AC-08（条目筛选）、AC-09（超预算），以及[缓存编排](../spec.md#缓存编排)、[操作与代际](../spec.md#操作与代际)、[包预算与生产身份](../spec.md#包预算与生产身份)、技术决定 2、3。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在资源持有者中接入 P2-10 的 `ResourceCache` 端口（构造时注入），以及 01 的预期包配置：
  - **列出：** 创建后调用 `list()`，并提供“重新列出”供回到菜单时调用（06 接线）。只采用最近一次发起的结果。按预期包配置筛选可恢复的条目：`original-import`、指纹与 `ConverterVersion` 都相等。
  - **核对保存状态：** 已保存的资源包在列表中不再存在时，缓存状态改为 `not-saved`（`not-found`），资源仍可使用。
  - **空间检查：** 提供建议性的空间检查，需求为包预算的 `payloadBytes` 加 `measure` 的元数据估计；结果只用于提示，不阻止导入。
  - **自动提交：** 资源包来自导入且全包判定为 `complete` 时，以包预算调用 `commit(inputs, limits, { signal })`，状态为 `saving`，成功后为 `saved`，失败时为 `not-saved` 并附 code。部分结果与来自缓存的资源包从不提交。
  - **重新保存：** 对同一资源包再次提交；保存中不允许重复发起。
  - **恢复：** 只对筛选出的条目调用 `restore(key, limits)`。成功后核对身份与预期包配置，不一致时为 `cache-incompatible`，不持有。一致时替换资源包（`origin: cache`，状态 `saved`）。同一时刻至多一个恢复。
  - **代际与释放：** 每个列出、提交与恢复的结果都带发起时的代际与持有者实例，过期即丢弃。替换资源包时中止旧提交，旧提交的任何终态都不改变新资源包。释放持有者时中止进行中的提交。
- Node 测试，用伪造的缓存与可控 Promise：
  - 13 个失败码中，提交与恢复各自可能返回的码都得到 `not-saved` 或恢复失败的结果，并附 code；
  - 提交失败后重试成功；`over-budget` 时为“仅在内存中”；
  - 恢复成功；条目筛选（生产配置拒绝合成身份，反之亦然）；
  - 列出、提交、恢复的结果逆序完成；
  - 替换时旧提交的三种终态：写事务开始前取消、被中止、已提交；
  - 释放后迟到的结果；
  - 已保存的键从列表中消失。

## 不包含

- 页面上的按钮与文案（06、07、05）；真实 IndexedDB 的浏览器验证（07、12）。
- 缓存迁移、清理与持久存储申请（P5）。

## 关键文件与契约

- 修改 02 新增的持有者模块及其测试。
- 复用：[browser-resource-cache.ts](../../../../../src/platform/storage/browser-resource-cache.ts) 的 `ResourceCache` 接口（类型导入）；[resource-cache-contract.ts](../../../../../src/platform/storage/resource-cache-contract.ts) 的结果形状与 `cacheKeyOf`；01 的预期包配置。

## 验收标准

- [ ] AC-05（缓存部分）：“已保存”只在 `committed` 或 `restored` 之后、且列表中该键仍在时成立；逆序完成与释放后到达的结果按代际丢弃。
- [ ] AC-06（旧提交）：替换时进行中的旧提交，三种终态都不改变新资源包的缓存状态。
- [ ] AC-07（Node）：完整导入包自动以包预算提交；部分结果从不提交；`quota-exceeded`、`storage-unavailable`、`write-failed`、`cancelled` 各得到“仅在内存中”并附 code；重试成功后为“已保存”；空间检查为 `insufficient` 时只提示。
- [ ] AC-08（Node）：恢复只提供与预期包配置一致的条目；恢复结果的身份不一致时为 `cache-incompatible`。
- [ ] AC-09（超预算）：超出包预算的合成包提交得到 `over-budget`，状态为“仅在内存中”。
- [ ] `pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/app`，完成前 `pnpm check`。
- 浏览器部分见 07 与 12。完成前按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
