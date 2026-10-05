---
type: plan
status: active
phase: P2
task: "05"
subtask: "04"
updated: 2026-10-05
---

# 04 — 图形转换声明与转换器

**契约来源：** [spec](../spec.md) 的 S-02、S-03 的转换部分，S-05 的声明，S-07 的预算扣除，S-08 的转换错误位置；[图形转换声明](../spec.md#图形转换声明)、[限值与预算](../spec.md#限值与预算)、[错误码](../spec.md#错误码)；技术决定 2、4、5；AC-02 的 `reversed`、AC-03 的预算部分、AC-04、AC-06、AC-07 的映射与单元部分、AC-08 的转换部分、AC-10 的扣除部分。
**依赖：** 01, 03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **计划新增声明读取（`src/original-data/conversion/`）：** 严格读取一组纯数据声明，失败报 `invalid-declaration`，位置为 `graphics.declarations[<i>]` 加字段路径。字段与约束按 spec [图形转换声明](../spec.md#图形转换声明)：
  - `asset` 为 `{ id, kind }`，`kind` ∈ {`palette`, `image`, `font`}，同一组声明中 ID 唯一；
  - `role` 为 P2-01 的角色 token；`group` 须拥有该 kind（依据 `CLASSIC_P2_SLICE.groupKinds`）；
  - 图像的 `palette` 必填；`palette` 与 `display.nearest` 都须指向同一组声明中同组的调色板声明；
  - `alpha` 为 `encoding` 或 `{ colourKey: 0–255 }`；`rowOrder` 为 `stored` 或 `reversed`；
  - 字体有预期 `cell`，`charMap` 为互不重叠、全部落在 0–255 的 `{ firstCode, firstGlyph, count }` 区间；
  - 未知字段、缺少字段与类型错误都拒绝。
- **计划新增转换器：** 输入为声明组与每个 Asset 的源块（条目字节与子资源，由 05 提供；本子任务的测试直接构造），输出描述符、payload 记录与转换用量。先转换调色板，再转换图像与字体。
  - **调色板：** DATA 条目按 6 位 VGA 读取，`palette` 子资源按嵌入 BGR 读取；来源格式由来源推导，不可声明。
  - **图像：**
    - 用 03 解码整条目记录；`colourKey` 只用于 raw，对 RLE 声明时报 `invalid-declaration`；`reversed` 把行序恰好反转；
    - 不透明像素索引不小于所绑定调色板（同组声明的转换结果）条目数时，报 `palette-index-out-of-range`；
    - 用 01 编码，`display` 照抄声明。
  - **字体：** 用 03 读取 `fonts/<i>`；实际单元与 `cell` 不符时报 `geometry-mismatch`；把 `charMap` 区间展开为升序条目。
  - **描述符：** `id`、`kind`、`role`、`group`，依赖按 ID 升序（图像为其调色板集合），`payloadIdentity` 由实际字节的版本、长度与 SHA-256 计算。
  - **预算：** 每个 Asset 在分配前，用 P2-01 `chargeBudget` 扣除由头部推得的 `assets`、`dependencyEdges`、`imagePixels`、`paletteEntries`、`glyphs` 与 `payloadBytes`。拒绝时报 `budget-exceeded`（`limit.name` 为维度，`observed` 可为 null），被拒绝的扣除不改变转换用量。转换用量的 `sourceReadBytes` 恒为 0。
  - **错误：** 03 抛出的相对位置加上 `graphics[<Asset ID>]` 前缀。任一失败使整组转换失败，不返回部分结果。
- **测试：**
  - **AC-04：** 无绑定；绑定到非调色板、别组或不在声明组中的 Asset；16 色调色板下的不透明索引 16；同一索引在透明像素上时不报错。
  - **AC-06：** raw 颜色键 k 使索引为 k 的像素透明（索引 0、掩码位 0），其他不变；RLE 上声明颜色键被拒绝；未声明时不透明。
  - **AC-02：** `reversed` 行序反转，`stored` 不变。
  - **AC-07：** 单元不符 → `geometry-mismatch`；区间重叠或越界 → `invalid-declaration`；区间展开正确。
  - **AC-03、AC-10：** 用量恰等于限值时通过；超出任一维度 → `budget-exceeded`，不产生结果，用量不变。
  - **AC-08：** 同输入同字节；描述符的 `payloadIdentity` 与字节一致。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)记录声明契约、转换顺序、预算扣除与错误位置。

## 不包含

- 读取光盘条目、映射核验、子资源解析与来源状态：归 [05](./05-graphics-step.md)。
- 生产声明与映射：归 [06](./06-production-graphics.md)。
- 容器内记录的位置（CCKD 元素、MFDD、TABL）：归 P2-07；本子任务只实现整条目偏移 0。

## 关键文件与契约

- **计划新增：** `src/original-data/conversion/` 下的声明读取、转换器与相邻测试（尚不存在）。
- **复用：** 01 的编码与常量；03 的源结构读取；[budget.ts](../../../../../src/content/budget.ts) 的 `chargeBudget`；[slice-definition.ts](../../../../../src/content/slice-definition.ts) 的 `CLASSIC_P2_SLICE`；[asset-contract.ts](../../../../../src/content/asset-contract.ts)；[sha256.ts](../../../../../src/content/sha256.ts)；[contract-validation.ts](../../../../../src/content/contract-validation.ts) 的严格读取原语。

## 验收标准

- [ ] AC-04、AC-06 的转换部分全部通过。
- [ ] AC-02 的 `reversed` 与 AC-07 的单元断言、映射区间通过。
- [ ] AC-03 预算部分与 AC-10 扣除部分：等于限值通过，超出被拒绝且用量不变、无部分结果；转换用量的 `sourceReadBytes` 为 0。
- [ ] AC-08 转换部分：同输入同字节，`payloadIdentity` 与字节一致。
- [ ] 错误位置都是 `graphics[<Asset ID>]…` 或 `graphics.declarations[<i>]…`，不含条目编号、偏移或字节。
- [ ] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试，直接构造源块，不经光盘。
- 不适用 browser-testing 或原版对照。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
