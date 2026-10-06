---
type: plan
status: active
phase: P2
task: "07"
subtask: "04"
updated: 2026-10-05
---

# 04 — 布局声明、转换与图形步骤的容器来源

**契约来源：** [spec](../spec.md) 的 S-03（子资源经步骤转换）、S-04，S-09 的 source 层；[容器子资源](../spec.md#容器子资源)、[布局转换声明](../spec.md#布局转换声明)、[行为与边界](../spec.md#行为与边界)、[错误码](../spec.md#错误码)；技术决定 1、3、4、10；AC-03 的步骤部分、AC-05、AC-07 的共用读取部分。
**依赖：** 01、03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **布局声明（扩展 [graphics-declarations.ts](../../../../../src/original-data/conversion/graphics-declarations.ts)）：** `GraphicsKind` 增加 `layout`；字段为 `asset`（kind `layout`）、`role`、`group`（须拥有 `layout`）、`frame`（同 payload 范围）、`elements`（1–16 个 image Asset ID，按存储顺序）。`checkBindings` 增加：每个元素须是同一声明组、同一资源组中的 image 声明，否则 `invalid-declaration`。
- **子资源（扩展 [graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts) 的来源解析）：**
  - CCKD `groups/<s>` → layout；`groups/<s>/elements/<i>` → image；
  - MFDD `lists/<l>/records/<i>` → image；
  - 上述记录的 `…/palette` → palette；
  - 序号为不带前导零的十进制；P2-05 的整条目来源与 `fonts/<i>` 不变。子资源与 kind 或条目类型不匹配 → `invalid-declaration`。
- **布局转换（扩展 [convert-graphics.ts](../../../../../src/original-data/conversion/convert-graphics.ts)）：**
  - 布局映射必须是 CCKD 的 `groups/<s>`；第 i 个元素图像的映射必须是同一 CCKD 条目、同一 slot 的 `groups/<s>/elements/<i>`，否则 `invalid-declaration`；
  - 实际元素数与声明不符、元素坐标为负、元素按图像尺寸越出画幅 → `geometry-mismatch`；
  - 产生 01 的布局 payload，描述符依赖为元素图像（ID 升序）；按 P2-01 预算扣除 `assets` 1、`dependencyEdges` 为元素数、`payloadBytes` 为实际长度，扣除先于分配；
  - 布局与元素映射只在整个步骤转换成功后才为 `verified`；任一失败使整个步骤失败、不输出结果。
- **共用读取：** 字库、布局与元素来自同一 CCKD 条目时，经 [step-entry-reader.ts](../../../../../src/original-data/conversion/step-entry-reader.ts) 在一步内只物理读取一次。
- **测试：** 在合成光盘上用 [conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts) 的 `countedVerifiedSource` 与扩展后的合成 CCKD、MFDD 运行步骤：
  - AC-05：画幅、元素顺序、坐标与图像引用逐项符合；依赖恰为元素图像；上列每种 `geometry-mismatch` 与 `invalid-declaration`；`verified` 只在成功后出现；
  - AC-03 的步骤部分：`groups/<s>/elements/<i>` 与 MFDD 记录经步骤转换的图像，与整条目偏移 0 的同一记录逐字节相同；`…/palette` 经步骤得到嵌入调色板；P2-05 的 `fonts/<i>` 测试照常通过；
  - AC-07 的共用读取：字库、布局与元素共用的 CCKD 条目只读一次（计量端口的读取次数与字节）；
  - 错误位置符合 `graphics[<Asset ID>]…` 与 `graphics.declarations[<i>]…` 的语法（`inGraphicsLocationGrammar`）。
- **文档：** 源码结构“图形转换”一节记录布局声明、子资源语法与布局转换。

## 不包含

- TABL `records/<i>` 来源：归 [06](./06-table-records.md)。
- 生产声明、映射与份额：归 [12](./12-production-cockpit-hud.md)。
- 组装、包身份与发送：归 [13](./13-group-assembly.md)。

## 关键文件与契约

- **修改：** [graphics-declarations.ts](../../../../../src/original-data/conversion/graphics-declarations.ts)、[convert-graphics.ts](../../../../../src/original-data/conversion/convert-graphics.ts)、[graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts) 及其测试；[conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts)。
- **复用：** 01 的布局编码；03 的容器读取；[source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 的子资源语法与 `assetSourceStates`（layout 已允许 CCKD 来源）；[conversion-budget.ts](../../../../../src/original-data/conversion/conversion-budget.ts)。

## 验收标准

- [ ] AC-05 全部条件通过。
- [ ] AC-03 的步骤部分：容器内记录与偏移 0 等价，`…/palette` 正确，`fonts/<i>` 回归通过。
- [ ] AC-07 的共用读取：同一 CCKD 条目一步只物理读取一次。
- [ ] 错误位置符合 spec 的位置语法，诊断不含条目编号、偏移或原版字节。
- [ ] `pnpm typecheck`、`pnpm lint` 与聚焦测试通过；源码结构已更新。

## 验证方法

- `pnpm test -- src/original-data/conversion/`。
- 只用代码生成的数据；不涉及浏览器或原版数据。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
