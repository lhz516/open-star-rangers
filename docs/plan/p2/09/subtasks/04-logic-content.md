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

- [x] AC-05 正向：合成的三类 payload（任务含地图框架、生成矩形与编组布局）编码后解码再编码逐字节相同；相同内容的编码相同。
- [x] AC-05 拒绝：缺少字段、未知字段、类型错误、非 ASCII、空白或字段顺序不同、-0、非有限数、超限（含 u32/i32 边界：u32 字段的 2³² 与负数、i32 字段的 2³¹ 与 −2³¹−1）、序号不连续、编组引用的声明不存在或缺少来源标记、放置矩形或锚点或 AI 目标越界、成员回指与编组成员不一致、僚机声明带放置引用，以及字节解码入口中引用与描述符依赖不一致，都返回预期的 code 与路径。
- [x] AC-05 隔离：结果冻结；修改输入或先前结果不影响后续读取；错误诊断不含 `MARKER`、名称或坐标值。
- [x] `content/logic/` 不导入 `original-data`、DOM 或 Node 类型；`pnpm exec vitest run src/content tools/engineering-boundaries.test.ts`、`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- 表驱动 Node 单元测试，按 code 与路径断言。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不适用 browser-testing。

## 完成证据

- **实现：**
  - [logic-content.ts](../../../../../src/content/logic/logic-content.ts)：类型、`LOGIC_LIMITS`（含段 1 声明上限 64）与 payload schema 版本 1；
  - [logic-readers.ts](../../../../../src/content/logic/logic-readers.ts)：纯数据读取器与按角色分派；
  - [logic-payload.ts](../../../../../src/content/logic/logic-payload.ts)：`encodeLogicPayload` 与 `decodeLogicPayload`；
  - [contract-validation.ts](../../../../../src/content/contract-validation.ts)：三个错误码；
  - [import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts)：按类型穷举的内容错误码清单随之更新。

  读取器把共用基础读取器的结构错误统一报为 `invalid-logic-payload`，路径不变。除 spec 列出的引用外，还检查以下两项，均为 `logic-reference-mismatch`：
  - 来源标记与编组的双向一致；
  - 规范声明顺序：`object` 声明在前且不超过 64 条，其后为编组首次使用的声明。

  解码依次检查：字节类型、是否已转移与长度上限，然后才读取描述符；之后检查可打印 ASCII 与 JSON 语法，按角色读取，比较规范文本，最后核对描述符依赖。
- **测试：** `pnpm exec vitest run src/content` 482 个测试通过，其中 `src/content/logic` 的两个测试文件覆盖：
  - **正向：** 三类 payload 逐字节往返；相同内容编码相同且各占独立 buffer；字段顺序、无空白、-0 写为 0；含引号与反斜杠的名称及 `1e+21`、`5e-7`、`-1.5e-300` 往返；同时是模板与成员的声明；各结构限值恰好等于上限时通过（含 256 条声明、64 条 `object` 声明）；超出字节上限的内容拒绝编码。
  - **拒绝：**
    - 缺少字段、未知字段、类型错误；
    - 非 ASCII 字节、控制字符、空白、字段顺序、-0、较长数字拼写、转义字符与重复键（后几种为 `non-canonical-payload`）；
    - `__proto__` 键（不污染原型）；
    - 非有限数，以及 u32/i32 的 2³²、-1、2³¹、−2³¹−1 边界；
    - 各项超限，且超长数组在读取任何元素之前拒绝；
    - 序号断档、模板或成员缺失或缺少来源标记、成员回指不一致、放置矩形、锚点或 AI 目标越界、`object` 声明位于编组声明之后、首次使用顺序不符、僚机带引用；
    - 描述符依赖缺失、多余或不符（`logic-reference-mismatch`）；
    - 未知角色、kind 不符、schema 版本 2、已转移字节；字节上限在读取描述符之前检查。
  - **隔离：** 结果深度冻结，修改输入或字节不影响结果；含 `MARKER` 的名称、未知键与非有限值的诊断都不含 `MARKER`。
- **工程检查：**
  - `content/logic/` 不导入 `original-data`：测试支持使用内容自己的标记，`pnpm lint` 拦截过一次跨层导入并已改正；
  - `pnpm typecheck`、`pnpm lint` 与边界回归通过；
  - `pnpm check` 通过：99 个测试文件、2952 个测试与生产构建。
- **rubber-duck：** 2 项阻塞与 1 组建议均已采纳：
  - 编码器执行字节上限，解码先查长度再读描述符；
  - 执行规范声明顺序与段 1 上限 64；合成任务按此重排；
  - 补充指数数字、引号与反斜杠、`__proto__` 与“模板兼成员”测试。

  审阅认为把基础读取器错误映射为 `invalid-logic-payload` 是合理的。
- **simplify（四个角度）：**
  - **已采纳：**
    - 解码直接比较规范文本，不再重建字节；
    - 编码用预分配循环；
    - 名称改用 `matchesWhole`，升序数组改用 `readOrderedArray`；
    - 测试描述符改由共用的 `syntheticGroup` 生成；
    - 去掉重复的测试 helper 与多余的类型断言。
  - **未采纳：**
    - 给共用基础读取器增加错误码与上下限参数：属于更大的共用设施改动，超出本子任务；
    - 测试表格改用工厂函数：只改变写法。
- **文档影响：** 已在[源码结构](../../../../engineering/source-structure.md#内容基础契约与切片定义)记录 `content/logic/` 的类型、读取器、编码规则与错误码。工程约定、工具指南与 STATUS 无需更新：没有新命令或检查规则。
