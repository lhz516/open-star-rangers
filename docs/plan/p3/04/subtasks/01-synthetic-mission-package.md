---
type: plan
status: active
phase: P3
task: "04"
subtask: "01"
updated: 2026-10-09
---

# 01 — 合成任务包与导入场景

**契约来源：** [spec](../spec.md) 的 S-09 与[合成任务包](../spec.md#合成任务包)；为 AC-08、AC-12、AC-16 提供合成内容。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 核实**包含 P3-03 的基线**上（切片定义版本 4、logic payload schema 2，P3-03 已把合成光盘扩展为版本 4 的完整包）现有合成光盘场景（[import-scenarios.test-support.ts](../../../../../src/workers/import-scenarios.test-support.ts) 的 `models` 等）导入后的完整资源包：任务载入诊断是否 `loaded`，三份逻辑 Asset 与包的 `ContentIdentity` 能否以生产配置（`mission/first-campaign`、难度 19、默认步长、僚机 null 与 0–4）通过 `createWorld`。P3-03 为这些文件新增的场景与测试保持不变。
- 在 [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 与 `import-scenarios.test-support.ts` 中新增定向任务场景，不改变 P2 已有正常/失败场景的含义（它们仍被 P2 的 E2E 与 Node 测试使用）：
  - 可开始：完整包，任务满足生产配置（group 0 / slot 1、僚机名单 5 项），每个僚机索引与 null 都能创建世界。若现有 `models` 场景已经满足，记录结论并只补必要的导出名，不另建重复场景。
  - 部分包：缺少或不完整的组，持有者全包判定不是 `complete`。
  - `loadMission` 失败：逻辑组完整但任务跨 Asset 引用不合契约，诊断为 `failed`。
  - `loadMission` 通过而 `createWorld` 拒绝：例如违反 [setup-check.ts](../../../../../src/core/world/setup-check.ts) 的某一语义规则，诊断 `loaded`、创建抛出 `CoreInputError`。
- 为 08 与 10 导出生成可开始场景的 CloneCD 文件组与其预期包配置（`scenarioEntryProfile`）的入口，以及供生产缓存预置（[production-cache.ts](../../../../../e2e/support/production-cache.ts)）使用的可开始任务包的组。
- 需要改动 SCEN 等格式样本时，在 [formats.test-support.ts](../../../../../src/original-data/formats/formats.test-support.ts) 或逻辑合成内容中增量添加，不改变已有导出的默认值。
- 所有内容由代码生成，不读 `local/`，不含原版内容。

## 不包含

- 测试入口查询键与端口注入（09）；E2E 用例（10–12）；重放工具（08）。
- 生产内容契约、切片定义、转换器版本与来源白名单的任何修改。

## 关键文件与契约

- [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts)、[import-scenarios.test-support.ts](../../../../../src/workers/import-scenarios.test-support.ts)：扩展场景注册与导出。
- [formats.test-support.ts](../../../../../src/original-data/formats/formats.test-support.ts)、[logic-content.test-support.ts](../../../../../src/content/logic/logic-content.test-support.ts)：按需增量扩展。
- [create-world.ts](../../../../../src/core/world/create-world.ts)、[mission-diagnostics.ts](../../../../../src/app/resources/mission-diagnostics.ts)：只读消费，用于 Node 核对。
- 计划新增：`src/workers/mission-scenarios.test.ts`（Node 核对）。

## 写入范围

- `src/workers/synthetic-import.test-support.ts`：新增场景与导出。
- `src/workers/import-scenarios.test-support.ts`：注册场景名与预期包配置。
- `src/workers/mission-scenarios.test.ts`：计划新增的 Node 核对。
- `src/original-data/formats/formats.test-support.ts`：必要时增量扩展 SCEN 样本。
- `src/content/logic/logic-content.test-support.ts`：必要时增量扩展逻辑合成内容。

## 验收标准

- [ ] S-09：可开始场景的完整包经生产导入作业转换后 `validatePackage` 为 `complete`，诊断 `loaded`，`createWorld` 以生产配置对 null 与 0–4 各创建成功。
- [ ] 部分包、`loadMission` 失败、`createWorld` 拒绝三个场景分别在预期阶段失败，失败类别与路径稳定。
- [ ] 既有场景的语义与其测试不变；新增场景名符合 `TEST_ENTRY_QUERY` 的 `worker` 规则（小写连字符）。
- [ ] `pnpm exec vitest run src/workers src/original-data src/content` 与 `pnpm check` 通过。

## 验证方法

- `src/workers/mission-scenarios.test.ts`：对每个场景运行同一生产导入作业（`syntheticGroupsJob` 或场景作业），按持有者的规则做全包判定与任务诊断，再对可开始场景调用 `createWorld`；断言失败场景的错误类型、路径与原因。
- 不适用浏览器或原版对照；浏览器使用由 10 验证。

## 完成证据
