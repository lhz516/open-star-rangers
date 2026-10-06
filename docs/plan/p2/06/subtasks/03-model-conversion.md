---
type: plan
status: active
phase: P2
task: "06"
subtask: "03"
updated: 2026-10-05
---

# 03 — 模型转换声明与转换器

**契约来源：** [spec](../spec.md) 的 S-04、S-07（扣除部分）、S-08；[模型转换声明](../spec.md#模型转换声明)、[行为与边界](../spec.md#行为与边界)、[限值与预算](../spec.md#限值与预算)、[错误码](../spec.md#错误码)（位置语法与失败边界一览的结构、预算、声明行）；AC-05，AC-07 的扣除部分。
**依赖：** 01, 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **声明读取（计划新增 `src/original-data/conversion/model-declarations.ts`）：** `readModelDeclarations` 严格读取一组模型声明 `{ asset: { id, kind: 'model' }, role, group }`：
  - `role` 为 P2-01 的角色 token，`group` 必须是 `models`，同一组内 ID 唯一；
  - 声明中没有来源、贴图或音效字段；
  - 任何问题都为 `invalid-declaration`，位置为 `models.declarations[<i>]` 加字段路径，声明组整体的问题为 `models.declarations`。
- **转换器（计划新增 `src/original-data/conversion/convert-models.ts`）：** `convertModels(declarations, sources, references, limits, usage)`。
  - **输入：** `sources` 是每个模型已读入的 MODL 块，以及按条目号索引的 MESH 块；`references` 是两张查找表，把 TEX 条目号映射到 image ID、把 SND 条目号映射到 sound ID。读取条目与核验映射由 05 负责，生产查找表由 04、06 提供。
  - **每个模型的流程：**
    1. 以 02 的 `readModel` 读取，位置为 `models[<Asset ID>].model`；
    2. 部件的 MESH 在同一模型内按条目号去重，只存一份几何，跨模型不共享；
    3. TEX 与 SND 只经查找表解析；表中没有时报 `invalid-declaration`，位置为 `….parts[<l>][<p>].texture` 或 `….sounds[<s>]`，不跳过、不默认；
    4. 只读取各 MESH 的计数后，以 `chargeConversionBudget` 扣除 `assets`、`dependencyEdges`、`vertices`、`triangles` 与 `payloadBytes`（`modelPayloadLength` 与编码器共用公式），之后才解码 MESH 并编码 payload；
    5. 描述符的组为 `models`，依赖为去重后升序的 image 与 sound 引用，`payloadIdentity` 由实际字节计算。
  - **输出：** 冻结的描述符与 payload，按 ID 升序；本步的转换用量。被拒绝的扣除不改变用量，任何失败都不输出部分结果。
  - **常量：** 转换器版本组件 `MODEL_CONVERTER_COMPONENT` 为 `models-1`，由 07 组成生产值。
- **位置语法：** 测试支持新增模型位置语法检查（同 P2-05 的 `inGraphicsLocationGrammar`），覆盖：
  - `models.declarations[<i>]…` 与 `models.declarations`；
  - `models[<Asset ID>]` 后接 `.model`、`.parts[<l>][<p>]`、`.parts[<l>][<p>].mesh`、`.parts[<l>][<p>].texture` 或 `.sounds[<s>]`。

  全部转换错误的位置都须符合此语法，不含条目编号、偏移或宿主路径。
- **测试：** 计划新增 `model-declarations.test.ts`、`convert-models.test.ts`，覆盖 AC-05 的全部情形；预算部分覆盖总量恰等于限值时通过，以及每个扣除维度超出时的拒绝。
- **文档：** [源码结构](../../../../engineering/source-structure.md)新增“模型转换”一节：声明、查找表输入、扣除顺序与位置语法。

## 不包含

- 读取 MODL/MESH 条目、映射核验、来源状态与组草稿（05）。
- 生产贴图表（04）、生产模型输入与音效查找表（06）、作业接入（07）。

## 关键文件与契约

- 计划新增 `src/original-data/conversion/model-declarations.ts`、`convert-models.ts` 及测试。
- 修改 [conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts)（模型位置语法）、[source-structure.md](../../../../engineering/source-structure.md)。
- 复用 01 的 payload 编码与 `MODEL_LIMITS`、02 的读取函数、[conversion-budget.ts](../../../../../src/original-data/conversion/conversion-budget.ts)、[asset-contract.ts](../../../../../src/content/asset-contract.ts) 的描述符读取、[sha256.ts](../../../../../src/content/sha256.ts)。

## 验收标准

- [ ] AC-05：在合成输入上，按声明转换的模型 payload 等于期望：
  - 模型内重复的 MESH 只存一份；两个模型引用同一 MESH 时各自含有该几何；
  - TEX 与 SND 分别解析为查找表中的 image 与 sound ID；
  - 同一输入两次转换，payload 与 SHA-256 相同。
- [ ] AC-05：TEX 或 SND 不在查找表中、组不是 `models`、ID 重复或声明形状不合时报 `invalid-declaration`。全部位置都符合位置语法，不含条目编号。
- [ ] AC-07（扣除部分）：总量恰等于限值时通过；任一维度超出时报 `budget-exceeded`，带维度、`limit` 与 `observed`（超出安全整数时为 null），不改变转换用量，不产生部分结果；扣除先于 MESH 解码与 payload 分配。
- [ ] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试，用 `expectSourceError` 与位置语法检查断言 code、位置与限值；扣除先于分配，用声明超大计数的合成块断言不出现宿主 `RangeError`。
- 不适用 browser-testing。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
