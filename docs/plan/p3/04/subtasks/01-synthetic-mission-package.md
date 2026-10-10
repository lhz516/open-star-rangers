---
type: plan
status: active
phase: P3
task: "04"
subtask: "01"
updated: 2026-10-10
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
- `docs/engineering/modules/workers.md`：Worker 场景列表与 `sliceCoveredFiles` 选项的说明。

## 验收标准

- [x] S-09：可开始场景的完整包经生产导入作业转换后 `validatePackage` 为 `complete`，诊断 `loaded`，`createWorld` 以生产配置对 null 与 0–4 各创建成功。
- [x] 部分包、`loadMission` 失败、`createWorld` 拒绝三个场景分别在预期阶段失败，失败类别与路径稳定。
- [x] 既有场景的语义与其测试不变；新增场景名符合 `TEST_ENTRY_QUERY` 的 `worker` 规则（小写连字符）。
- [x] `pnpm exec vitest run src/workers src/original-data src/content` 与 `pnpm check` 通过。

## 验证方法

- `src/workers/mission-scenarios.test.ts`：对每个场景运行同一生产导入作业（`syntheticGroupsJob` 或场景作业），按持有者的规则做全包判定与任务诊断，再对可开始场景调用 `createWorld`；断言失败场景的错误类型、路径与原因。
- 不适用浏览器或原版对照；浏览器使用由 10 验证。

## 完成证据

- **基线核对（2026-10-10，P3-03 之上）：** `models` 场景经生产作业后全包 `complete`、任务诊断 `loaded`，`createWorld` 以生产配置对 null、0、1 成功，但其名单只有 2 项（`defaultCampaignSpec`），索引 2–4 被 `input.run.wingman` 拒绝，不满足“僚机 5 项”。因此新增可开始场景，不改 `models`。
- **新增场景**（[import-scenarios.test-support.ts](../../../../../src/workers/import-scenarios.test-support.ts) 的 `MISSION_SCENARIOS` 记录各场景停下的阶段与稳定失败；名称都符合 `TEST_ENTRY_QUERY.worker`）：
  - `mission-startable`：任务光盘为 `sliceCoveredFiles({ campaign })`，战役表换成 [formats.test-support.ts](../../../../../src/original-data/formats/formats.test-support.ts) 新增的 `fiveWingmanCampaignSpec()`（5 个僚机选项，名字候选为 `FIVE_WINGMAN_NAMES`：1、2、0、1、3 个，供配置页显示，不带 `MARKER`，其一含 `<b>…</b> &` 以核对纯文本呈现）；运行完整生产作业。
  - `mission-partial`：同一光盘，音效表去掉唯一的 `warp-sound`（`sound/warp`），`audio` 组 `role-cardinality@roles.warp-sound` 不被持有，全包 `group-missing@groups.audio`，任务仍 `loaded`（只有资格条件 1 不满足）。
  - `mission-load-failed`：同一光盘，转换后名单第一项取玩家机种（与既有 `mission-invalid` 共用 `PLAYER_WINGMAN_LOGIC`，`mission-invalid` 行为不变），全包 `complete`，诊断 `failed`：`core-input`、`input.wingmanRoster.content.options[0].craftType`、`must not be the player craft type`。
  - `mission-create-rejected`：玩家记录 +0x10 请求两架（新增 `twoPlayerRequestsScenarioSpec()`），全包 `complete`、诊断 `loaded`，`createWorld` 对 null 与 0–4 都抛 `CoreInputError`：`input.mission.content.declarations[0].ruleInputs.craftCount`、`must give the player one request`（[setup-check.ts](../../../../../src/core/world/setup-check.ts) 的 `checkPlayer`）。
- **下游入口：** `scenarioFiles(name)` 给出场景光盘的 CloneCD 文件组（08）；`scenarioEntryProfile(name)` 给出预期包配置（`mission-partial`、`mission-load-failed` 与 `mission-startable` 相同）；`scenarioGroups(name)` 在调用线程运行场景作业并返回发送的全部组，形状同持有者的组，可直接传给 `seedProductionCache`（10）；测试入口经现有的 `worker` 查询键选择这些场景。
- **Node 核对：** [mission-scenarios.test.ts](../../../../../src/workers/mission-scenarios.test.ts)（5 项）按导入作业所有者与持有者的规则（只保留 `group-complete` 的组、按切片定义排序、`validatePackage`、`diagnoseMission`）判定；可开始场景的身份为 `original-import` 且与 `scenarioEntryProfile` 一致，`createWorld` 以 `mission/first-campaign`、难度 19、默认步长对 null 与 0–4 各创建 tick 0 世界，projection 的任务/组/槽位/难度/僚机正确，首个 tick 实例化 1 个玩家、选了僚机时恰好 1 个僚机；失败场景断言阶段、错误类型、路径与原因。
- **检查：** `pnpm exec vitest run src/workers src/original-data src/content` 通过（103 个文件、3,888 项）；`pnpm check` 通过（typecheck、lint、209 个文件 6,443 项测试与生产构建；同机负载很高时第一次运行有 2 项与本改动无关的 5 s 超时：`tools/engineering-boundaries.test.ts` 与 `tools/package-check.test.ts`，单独重跑通过，整套重跑通过）。既有 `failure-matrix.test.ts` 与 `import-job.test.ts` 遍历全部场景/光盘的入口配置测试包含新场景并通过；既有场景的测试未改。
- **Rubber-duck：** 一项阻塞——僚机显示名带 `MARKER` 会与“页面不含 `MARKER`”的隐私断言冲突（例如 `joint-pipeline.development.spec.ts`）；已改为不带标记的显示名并在测试中断言。其余无发现。
- **Simplify：** 改用 `thrownBy`、`tickInput`；逻辑 Asset 与入口配置各只求一次；`MISSION_PARTIAL_SOUND` 不再导出；SCCT/SCEN 样本移到 `formats.test-support.ts`。保留 `MISSION_SCENARIOS` 的 `stage`（供 05/10 使用）；未改生产模块 `mission-diagnostics.ts` 以共用解码。
- **文档影响：** [workers 模块分册](../../../../engineering/modules/workers.md)的测试支持一节补充 `sliceCoveredFiles` 的 `campaign` 参数与“任务场景（P3-04）”一项（四个场景、下游入口与 Node 核对），写入范围经协调者扩大后修改。其他文档无需改动：工程约定的测试入口说明已写明新场景名不必改查询规则。
