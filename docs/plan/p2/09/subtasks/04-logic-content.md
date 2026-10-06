---
type: plan
status: active
phase: P2
task: "09"
subtask: "04"
updated: 2026-10-05
---

# 04 — 规范逻辑内容：类型、编码与读取器

**契约来源：** [spec](../spec.md) 的 S-04（内容部分）、S-11（内容层错误码）、AC-05；[规范逻辑数据](../spec.md#规范逻辑数据)、[`logic` 组的 Asset](../spec.md#logic-组的-asset)、[错误](../spec.md#错误)。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **类型：** 在 `content/logic/` 定义 `MissionContent`、`MissionGroup`、`MissionDeclaration`、`CraftTypeTable`、`WingmanRoster` 与 `StrategicMapFrame`，字段、取值范围与顺序完全按修订后的 spec，包括：
  - `ruleInputs` 中 `percentA`、`craftCount` 为 null 或 u32，其余六项为 null 或 i32；`spawnTime` 与编组 `spawnCount` 为 u32；`gridSpacing` 与生成矩形的四个值为 i32；
  - `origins` 的封闭集合与固定顺序；`craftType` 为 0–31 或 null；`aiTargetCraftTypes` 升序唯一；
  - `namePool` 为按表序的名称列表，名称规则同候选名称；
  - `coordinates` 为 `{ unit: 'scen-reference', referenceScale, layoutUnit: 'scen-runtime' }`；`references` 只有 `craftTypes` 与 `wingmanRoster`；`mapFrame` 不可为 null；
  - `placement`（`region`、`anchor`）、`memberOf`、`aiTarget` 为序号或 null；编组 `layout` 至少 1 项。
- **纯数据读取器：** 每种 payload 一个严格读取器，接收 plain data，拒绝缺少字段、未知字段、类型错误与超限，校验单个 payload 内部的引用（声明序号连续；编组引用的声明存在且带对应来源标记；`placement.region` 指向存在的生成矩形，`placement.anchor` 与 `aiTarget` 指向存在的声明；`memberOf` 与编组成员互相一致；名单序号连续，名单声明的放置引用、成员回指与 AI 目标都为 null），失败为 `logic-reference-mismatch`。结果冻结，与输入隔离。
- **规范编码：** 编码器按契约固定的字段顺序输出无空白的可打印 ASCII JSON 字节；数字用 ECMAScript 最短往返表示，-0 写为 0，拒绝非有限数。
- **字节解码入口：** 接收 payload 字节与该 Asset 的描述符：
  - 先检查字节长度（不超过 `logic` 组 `payloadBytes` 上限），再逐字节解码（不使用 `TextDecoder`，非 ASCII 失败）并 `JSON.parse`；
  - 用纯数据读取器读取；
  - 重新编码，与输入逐字节比较，不同时为 `non-canonical-payload`；
  - 核对 payload 内的 Asset 引用与描述符依赖一致，不一致为 `logic-reference-mismatch`。
- **错误码：** 在 `ContentContractErrorCode` 追加 `invalid-logic-payload`、`non-canonical-payload` 与 `logic-reference-mismatch`；路径只含结构名与下标。
- **测试支持：** 计划新增 `content/logic/` 的合成逻辑内容 test-support，供 06、09、11 复用；合成名称包含 `MARKER`，用于隐私断言。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md#内容基础契约与切片定义)中记录逻辑内容模块、编码规则与错误码。

## 不包含

- 从原版字节转换（05、09）；Core 的跨 Asset 前提检查（11）；`ManifestIdentity`（03）。

## 关键文件与契约

- **修改：** [contract-validation.ts](../../../../../src/content/contract-validation.ts)（追加错误码）。
- **复用：** `readRecord`、`requireFields`、`readOrderedArray`、`compareText`；[asset-id.ts](../../../../../src/content/asset-id.ts) 的 `readAssetId`；[asset-contract.ts](../../../../../src/content/asset-contract.ts) 的 `AssetDescriptor`、`AssetReference`。
- **计划新增：** `src/content/logic/` 下的类型、读取器、编码与解码模块，相邻测试与 test-support。

## 验收标准

- [ ] AC-05 正向：合成的三类 payload（任务含地图框架、生成矩形与编组布局）编码后解码再编码逐字节相同；相同内容的编码相同。
- [ ] AC-05 拒绝：缺少字段、未知字段、类型错误、非 ASCII、空白或字段顺序不同、-0、非有限数、超限（含 u32/i32 边界：u32 字段的 2³² 与负数、i32 字段的 2³¹ 与 −2³¹−1）、序号不连续、编组引用的声明不存在或缺少来源标记、放置矩形或锚点或 AI 目标越界、成员回指与编组成员不一致、僚机声明带放置引用，以及字节解码入口中引用与描述符依赖不一致，都返回预期的 code 与路径。
- [ ] AC-05 隔离：结果冻结；修改输入或先前结果不影响后续读取；错误诊断不含 `MARKER`、名称或坐标值。
- [ ] `content/logic/` 不导入 `original-data`、DOM 或 Node 类型；`pnpm exec vitest run src/content tools/engineering-boundaries.test.ts`、`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- 表驱动 Node 单元测试，按 code 与路径断言。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不适用 browser-testing。

## 完成证据
