---
type: plan
status: active
phase: P2
task: "09"
subtask: "08"
updated: 2026-10-05
---

# 08 — 生产来源映射与子资源核验

**契约来源：** [spec](../spec.md) 的 S-06、AC-07、AC-04（`subresource-mismatch` 部分）；[`logic` 组的 Asset](../spec.md#logic-组的-asset)、[行为与边界](../spec.md#行为与边界)。
**依赖：** 05, 07。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **生产映射表：** 在 `original-data/conversion/` 定义 `logic` 组每个 Asset 的映射，形状为 P2-01 的 `SourceMappingTable`（`sourceFingerprint` 为 null，`resolution` 为 `declared`）：
  - `mission/first-campaign`：SCCT 部件（子资源 `group-0/slot-1`）与所选 SCEN 整条目，`likely`，U-022；
  - `data/craft-types`：`MAIN/SR.NOB` 的 M2ID 整条目，`likely`，U-022、U-028；
  - `data/wingman-roster`：SCCT 部件（子资源 `wingmen`），`likely`，U-023；
  - 结论 1 时的 `data/strategic-map-frame`：按 02 的结论使用封包条目 locator 或 07 的范围 locator，置信度与 U 项按 02 的记录。

  条目 ID 来自 `docs/original/` 的记录（SCEN 条目见 scenario 候选来源概况，SCCT 条目见 01 的记录，M2ID 见 hud §3）；`evidence` 只引用 `docs/original/` 文档。
- **子资源核验：** 提供一个函数，接收 `verifySourceMappings` 的结果与 05 对 SCCT 的解析：
  - `group-0/slot-1` 解析出的 SCEN 条目 ID 必须等于同一映射中 SCEN 部件的条目 ID，`wingmen` 必须解析成功；
  - 一致时把这些映射升为 `verified`，返回新的冻结表（经 `readSourceMappingTable` 重新读取）；
  - 不一致时为 `subresource-mismatch`，位置为 `sources.mappings[i].parts[j].alternatives[k]`。
- **来源状态：** 以 `assetSourceStates` 从最终表推导 `GroupInput.sources`，状态绑定已识别指纹。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md#原版来源映射)中记录生产映射表与子资源核验的位置与规则。

## 不包含

- 读取与转换编排（09）；非封包 locator 本身（07）。
- 修改 `verifySourceMappings` 对封包条目 locator 的既有行为。

## 关键文件与契约

- **复用：** [source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 的 `readSourceMappingTable`、`assetSourceStates`；[verify-source-mappings.ts](../../../../../src/original-data/source/verify-source-mappings.ts)；05 的 SCCT 解析与合成封包 test-support；[source.test-support.ts](../../../../../src/original-data/source/source.test-support.ts) 的 `catalogFor`。
- **计划新增：** `src/original-data/conversion/` 下的映射表与子资源核验模块、相邻测试。

## 验收标准

- [ ] AC-07：生产映射表能通过 `readSourceMappingTable` 读取；经 `verifySourceMappings` 后，不含子资源的映射为 `verified`，带子资源的仍为 `declared`；子资源核验一致后升为 `verified`，不一致报 `subresource-mismatch`；来源状态绑定已识别指纹；置信度与 U 项与 spec 的 Asset 表一致。
- [ ] AC-04（`subresource-mismatch` 部分）：合成 SCCT 中槽位的 SCEN ID 与映射不符时失败，位置为结构路径，不回显条目 ID 以外的值。
- [ ] 生产表另以只读方式核对形状（不读取 `local/`）；`pnpm exec vitest run src/original-data`、`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 测试：合成映射表、合成 `SCENARIO.NOB`/`SR.NOB` 与合成白名单，用 `identifySource` 得到 `VerifiedSource` 后核验。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不适用 browser-testing。

## 完成证据
