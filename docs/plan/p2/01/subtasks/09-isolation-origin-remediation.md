---
type: plan
status: active
phase: P2
task: "01"
subtask: "09"
updated: 2026-10-08
---

# 09 — 结果隔离与来源类型判别补救

**契约来源：** [spec](../spec.md) 的 S-05、S-10；AC-04、AC-09。缺口由 [07 第一次最终对齐](./07-final-alignment.md#完成证据)发现。
**依赖：** 03、04、08。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- `ContentOrigin` 的两个变体在类型上排除对方的字段，使同时带有 `fixtureId` 与 `sourceFingerprint` 的具名对象无法赋值给来源类型；运行时拒绝保持不变。
- `validatePackage` 的成功结果返回冻结的组列表副本，不引用传入定义中的数组。
- `assetSourceStates` 为每个状态复制并冻结 U 项数组，不引用映射表中的数组。
- 复核其余公开结果和读取入口，确认它们都不引用调用者的可变容器，并记录结论。

## 不包含

- 不新增行为、错误 code、资源类型或契约字段，不修改 spec。
- 不改变 07 以外子任务已完成的验收结论。

## 关键文件与契约

- [content-identity.ts](../../../../../src/content/content-identity.ts)、[completeness.ts](../../../../../src/content/completeness.ts)、[source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 及其相邻测试。
- 用可变的结构化克隆模拟调用者传入的定义与映射表，不放宽唯一构造等既有边界。

## 验收标准

- [x] 混合两种来源字段的具名对象在类型检查中失败，运行时拒绝保持不变。
- [x] 全包结果与来源状态集不引用调用者的可变容器；之后修改调用者的定义或映射表不改变先前结果。
- [x] 其余公开结果的隔离复核没有遗漏，完整工程检查通过。

## 验证方法

- `pnpm exec vitest run src/content src/original-data tools/engineering-boundaries.test.ts`，以及 `pnpm typecheck`。
- 完成前运行 `pnpm check`；不适用 browser-testing。

## 完成证据

- **来源判别：** [content-identity.ts](../../../../../src/content/content-identity.ts) 的 `ContentOrigin` 两个变体都以可选 `never` 排除对方的字段。
  - [content-identity.test.ts](../../../../../src/content/content-identity.test.ts) 新增类型级断言：同时带两种字段的具名对象不能赋值给来源类型，合法形状仍可赋值。
  - 字段类型为 `SourceFingerprint | undefined` 时同样被拒绝。
  - 运行时读取继续拒绝任何多余字段。
- **结果隔离：**
  - [completeness.ts](../../../../../src/content/completeness.ts) 的全包结果返回冻结的组列表副本。测试用可变的 `structuredClone(CLASSIC_P2_SLICE)` 作为定义，验证后反转调用者的数组，先前结果不变且冻结。
  - [source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 的 `assetSourceStates` 为每个状态复制并冻结 U 项数组。测试向克隆映射表的 U 项追加元素，派生状态不变且冻结。
- **反证：** 暂存三处生产修改后，两项运行时测试失败，两项混合形状的类型断言以 TS2554 使 `tsc` 失败；恢复修改后全部通过。
- **隔离复核：** 复核 `src/content` 与来源映射的全部导出。
  - **会被保留的契约输出**都是冻结的新副本，修改调用者的输入不会影响它们：读取后的清单、描述符、身份、来源状态集、映射表与诊断，完整性与预算结果，以及切片定义。
  - **有意的所有权例外：** `readPayloadRecords` 只在同步验证期间引用调用者的 payload 字节，验证结果不含字节；`payloadTransferList` 必须返回调用者自己的 buffer 才能转移，转移后发送方视图失效。
  - **校验原语** `readRecord` 等只复制外层记录，其输出由各读取入口同步消费，并由它们复制、冻结接受的字段，不是契约结果。这一点已写入其文档注释。
- **审查：** rubber-duck 提出 2 个阻塞问题，经同一审查者复核后，两项拒绝理由均被认可，未做额外的代码改动：
  - **显式 `undefined` 仍可赋值：** 未开启 `exactOptionalPropertyTypes` 时，把另一来源的字段显式写成 `undefined` 仍能通过类型检查。该值不携带身份，不能冒充另一来源，运行时也会拒绝。开启该选项会改变全部四个 TypeScript 程序，超出补救范围。`ContentOrigin` 的注释已说明这一限制。
  - **`readRecord` 只浅复制：** 它是校验原语，不是契约输出。深复制会与各读取入口的复制工作重复。
- **simplify：** 复用、简化、效率与抽象层次四个角度均无发现。
- **验证：**
  - `pnpm exec vitest run src/content src/original-data tools/engineering-boundaries.test.ts` 为 14 个文件 423 项通过；
  - `pnpm check` 为 67 个文件 1642 项通过，四个 TypeScript 程序、lint 与生产构建均通过；
  - 依赖与锁文件未变；
  - 不适用 browser-testing。
- **文档影响：** [源码结构](../../../../engineering/modules/content.md#内容基础契约与切片定义)对来源判别、完整性与来源状态的说明仍然准确，不需要修改。限制与所有权说明已写入代码注释，工程约定、guides 与 STATUS 也不受影响。
