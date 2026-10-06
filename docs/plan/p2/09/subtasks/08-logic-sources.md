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
  - `data/wingman-roster`：SCCT 部件（子资源 `wingmen`），`likely`，U-023。

  S-02 为结论 2，地图框架随任务的 SCEN 部件读取，没有独立映射。

  条目 ID 来自 `docs/original/` 的记录（SCEN 条目见 scenario 候选来源概况，SCCT 条目见 01 的记录，M2ID 见 hud §3）；`evidence` 只引用 `docs/original/` 文档。
- **子资源核验：** 提供一个函数，接收 `verifySourceMappings` 的结果与 05 对 SCCT 的解析：
  - `group-0/slot-1` 解析出的 SCEN 条目 ID 必须等于同一映射中 SCEN 部件的条目 ID，`wingmen` 必须解析成功；
  - 一致时把这些映射升为 `verified`，返回新的冻结表（经 `readSourceMappingTable` 重新读取）；
  - 不一致时为 `subresource-mismatch`，位置为 `sources.mappings[i].parts[j].alternatives[k]`。
- **来源状态：** 以 `assetSourceStates` 从最终表推导 `GroupInput.sources`，状态绑定已识别指纹。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md#原版来源映射)中记录生产映射表与子资源核验的位置与规则。

## 不包含

- 读取与转换编排（09）；非封包 locator（S-12 不适用）。
- 修改 `verifySourceMappings` 对封包条目 locator 的既有行为。

## 关键文件与契约

- **复用：** [source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 的 `readSourceMappingTable`、`assetSourceStates`；[verify-source-mappings.ts](../../../../../src/original-data/source/verify-source-mappings.ts)；05 的 SCCT 解析与合成封包 test-support；[source.test-support.ts](../../../../../src/original-data/source/source.test-support.ts) 的 `catalogFor`。
- **计划新增：** `src/original-data/conversion/` 下的映射表与子资源核验模块、相邻测试。

## 验收标准

- [x] AC-07：生产映射表能通过 `readSourceMappingTable` 读取；经 `verifySourceMappings` 后，不含子资源的映射为 `verified`，带子资源的仍为 `declared`；子资源核验一致后升为 `verified`，不一致报 `subresource-mismatch`；来源状态绑定已识别指纹；置信度与 U 项与 spec 的 Asset 表一致。
- [x] AC-04（`subresource-mismatch` 部分）：合成 SCCT 中槽位的 SCEN ID 与映射不符时失败，位置为结构路径，不回显条目 ID 以外的值。
- [x] 生产表另以只读方式核对形状（不读取 `local/`）；`pnpm exec vitest run src/original-data`、`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 测试：合成映射表、合成 `SCENARIO.NOB`/`SR.NOB` 与合成白名单，用 `identifySource` 得到 `VerifiedSource` 后核验。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不适用 browser-testing。

## 完成证据

- **实现：** [logic-sources.ts](../../../../../src/original-data/conversion/logic-sources.ts)：
  - **映射表：** `LOGIC_SOURCE_MAPPINGS` 未绑定来源，三项都为 `likely` 与 `declared`：
    - `data/craft-types`：M2ID 10649，U-022、U-028；
    - `data/wingman-roster`：SCCT 3123 的 `wingmen`，U-023；
    - `mission/first-campaign`：SCCT 3123 的 `group-0/slot-1`（由 `CLASSIC_P2_SLICE.candidate` 生成）加 SCEN 3019，U-022。

    条目 ID 集中在 `LOGIC_SOURCE_ENTRIES`，证据只引用 `docs/original/`。
  - **读取：** `logicEntryReader(source)` 是 P2-05 的步骤内读取，每个条目只物理读取一次。它带读取前钩子，在读取字节之前按目录项检查 SCCT、SCEN、M2ID 的 `payloadEntryBytes`。
  - **核验：** `verifyLogicSources(source, readEntry)` 按一个顺序完成核验：
    1. 以 `readEntry` 调用 `verifySourceMappings`；
    2. 从同一读取结果中以切片候选解析映射的 SCCT，核对子资源：槽位的 SCEN 是同一映射的部件、僚机记录解析成功、所有子资源在同一张 SCCT；
    3. 升为 `verified`，再由 `assetSourceStates` 推导绑定指纹的来源状态。

    它返回 `{ table, sources, campaign }` 供 09 复用。子资源核验不单独导出，因此映射只能由同一来源的读取证实。
  - **测试支持：** [source.test-support.ts](../../../../../src/original-data/source/source.test-support.ts) 新增 `syntheticVerifiedSource`；[formats.test-support.ts](../../../../../src/original-data/formats/formats.test-support.ts) 的 `ENTRY_IDS` 改为复用生产常量。
- **测试：** [logic-sources.test.ts](../../../../../src/original-data/conversion/logic-sources.test.ts) 5 个测试通过，使用合成 `SCENARIO.NOB`/`SR.NOB`、合成光盘与合成白名单：
  - **形状：** 生产表的 Asset ID 与 kind、部件、置信度、U 项与 `declared` 状态，指纹为 null；
  - **正向：** 核验后三项都为 `verified`，来源状态绑定已识别指纹，并返回解析出的僚机与 SCEN 条目 ID；
  - **`subresource-mismatch`（AC-04 部分）：** 槽位指向另一 SCEN 时报在 `sources.mappings[2].parts[0].alternatives[0]`；未知子资源、子资源分属两张 SCCT 也同样报错；
  - **限值：** SCCT 超过 262,144 字节时，按目录报 `payloadEntryBytes`，位置为首个引用 SCCT 的映射路径 `sources.mappings[1].parts[0].alternatives[0]`。读取日志证明该条目的字节从未读取；
  - **隐私：** 位置通过语法检查，诊断不含 `MARKER` 或条目 ID 数值。

  证据锚点（scenario §4、切片字段清单、executable 玩家目标模式、hud §3）用会话内的链接检查器核对有效：工程边界规定 original-data 测试不读文件，因此锚点不在测试中检查。
- **生产表只读核对：** 生产表由 `readSourceMappingTable` 在模块载入时读取；测试只用代码生成的数据，不读取 `local/`。
- **工程检查：** `pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 通过：102 个测试文件、3087 个测试与生产构建。第一次运行时，边界回归拦截了测试中读取文档的 `node:fs` 导入，已移除。
- **rubber-duck：** 1 项阻塞已采纳：只凭指纹不能证明表经过核验，SCCT 也未绑定来源。处理是把核验合并为 `verifyLogicSources`，在同一已验证来源上读取与解析，并补充跨表与未知子资源测试。1 项建议已采纳：测试断言 Asset kind。审阅确认映射 ID、部件、置信度、U 项、证据锚点，以及整项升级与精确备选的处理正确。
- **simplify：**
  - **已采纳：** 把已验证来源与带缓存的封包打开函数提升为共用测试支持。
  - **未采纳：**
    - 与 `verifySourceMappings` 共用封包缓存，或在其中执行读取前限值：当时会改动 P2-03 的通用核验器。P2-05 合入后已改用其步骤内读取，见下；
    - 把条目 ID 留在格式测试支持本地：会产生两份 ID；
    - 避免重复读取映射表：开销可忽略。
- **文档影响：** 已在[源码结构](../../../../engineering/source-structure.md#逻辑组转换)记录生产映射表与 `verifyLogicSources` 的步骤。工程约定、工具指南与 STATUS 无需更新。
- **P2-05 合入后的对齐（2026-10-05，变基后）：** 原因见 [goal 执行记录](../goal.md#执行记录)。以上实现与测试按对齐后的状态记录；对齐前的差异如下：
  - 核验接收带缓存的封包打开函数 `openArchive`，先单独预检目录，再由 `verifySourceMappings` 与 SCCT 解析各读一次条目；
  - 超限位置是条目位置；
  - 测试支持另有 `archiveOpener`，已删除。
