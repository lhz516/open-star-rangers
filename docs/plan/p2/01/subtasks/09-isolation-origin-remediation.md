---
type: plan
status: active
phase: P2
task: "01"
subtask: "09"
updated: 2026-10-04
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

- [ ] 混合两种来源字段的具名对象在类型检查中失败，运行时拒绝保持不变。
- [ ] 全包结果与来源状态集不引用调用者的可变容器；之后修改调用者的定义或映射表不改变先前结果。
- [ ] 其余公开结果的隔离复核没有遗漏，完整工程检查通过。

## 验证方法

- `pnpm exec vitest run src/content src/original-data tools/engineering-boundaries.test.ts`，以及 `pnpm typecheck`。
- 完成前运行 `pnpm check`；不适用 browser-testing。

## 完成证据
