---
type: plan
status: active
phase: P3
task: "03"
subtask: "16"
updated: 2026-10-09
---

# 16 — 补充图像与视角标签的图形转换

**契约来源：** [spec](../spec.md) 的 S-08（视角标签）、S-09（受击闪烁）、S-10（帧图像）、S-11（星云图像）、S-12、AC-06（视角标签转换）、AC-07（两个 TEX）、AC-08（帧图像）、AC-09（星云图像）、AC-13、AC-14、AC-18；[字段处理规则](../spec.md#字段处理规则) 9、[Asset 与角色](../spec.md#asset-与角色)。
**依赖：** 13, 14。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **图形步骤：** 扩展 [graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts) 与 [graphics-declarations.ts](../../../../../src/original-data/conversion/graphics-declarations.ts)，新增两种来源：
  - ANIM 帧的 image 来源，子资源为帧序号，可附帧调色板，解码用 14 的解析器；
  - TABL 10399 第 8 项的 data 来源，产出 09 的 `view-labels` payload，解析用 13 的解析器。

  只在解析出子资源后，才把该部件升为 `verified`。现有来源种类的行为不变。
- **生产声明：** 在计划新增的 `production-flight-graphics.ts` 中定义映射与图形声明，透明、行序、调色板绑定与显示方式按 05 的结论；若与 spec 表不同，以研究为准并记入证据：
  - `image/hit-shimmer`、`palette/hit-shimmer`（models）；
  - `image/hud/target-display/background`、`palette/hud/target-display/background`（cockpit-hud-map）；
  - `image/nebula/01`–`15`：绑定 `palette/flight/models`，按 05 的结论直接或最近色显示（models）；
  - `image/explosion/<nn>/<mm>` 与帧调色板（models）：帧调色板若为自带调色板，命名为 `palette/explosion/<nn>`，若使用 DATA 则复用 `palette/flight/models`；编号规则按 spec；
  - `data/hud/view-labels`（cockpit-hud-map）。

  本项不把它们并入 `PRODUCTION_GRAPHICS_*`，由 19 合并。份额计量用注入的限值；份额常量 `PRODUCTION_FLIGHT_GRAPHICS_SHARE` 的数值由 19 推导后填入。
- 用代码生成的合成 SR.NOB 条目（TEX、BITM、ANIM、TABL 10399）编写测试，合成图形条目的构建扩展 [conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts)。测试覆盖：
  - 正向转换与图像绑定；
  - ANIM 帧图像与合成帧逐像素相等；
  - 子资源越界为 `subresource-not-found` 或 spec 规定的 code；
  - 预算计量与读取日志；
  - 现有图形步骤的测试不变地通过。

## 不包含

- 爆炸表、动画与星云列表等 data Asset，以及 NEBC 与 EXIC 的 ID 链：归 17。
- 合并入生产图形声明、份额数值与转换器组件：归 19。
- 模块分册：由 22 同步。

## 关键文件与契约

- [graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts)、[graphics-declarations.ts](../../../../../src/original-data/conversion/graphics-declarations.ts)、[convert-graphics.ts](../../../../../src/original-data/conversion/convert-graphics.ts)、[production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts)（只读，作为先例）。
- 13 的 `view-labels.ts`；14 的 `anim.ts` 与 `source-graphics.ts`；09 的 `view-labels-payload.ts`。
- 计划新增：`src/original-data/conversion/production-flight-graphics.ts` 与其测试和合成支持。

## 写入范围

- `src/original-data/conversion/graphics-step.ts`：ANIM 帧与视角标签两种来源。
- `src/original-data/conversion/graphics-step.test.ts`：测试。
- `src/original-data/conversion/graphics-declarations.ts`：声明的读取。
- `src/original-data/conversion/graphics-declarations.test.ts`：测试。
- `src/original-data/conversion/convert-graphics.ts`：图形转换中的新来源（不改组件）。
- `src/original-data/conversion/convert-graphics.test.ts`：测试。
- `src/original-data/conversion/conversion.test-support.ts`：合成图形条目。
- `src/original-data/conversion/production-flight-graphics.ts`：生产映射与声明（新建）。
- `src/original-data/conversion/production-flight-graphics.test.ts`：测试（新建）。
- `src/original-data/conversion/production-flight-graphics.test-support.ts`：合成生产条目（新建）。

## 验收标准

- [ ] AC-06（视角标签转换）：`data/hud/view-labels` 只含第 8 项，读取器可解码。
- [ ] AC-07（两个 TEX）：生成 image 与 palette，显示方式与依赖符合 Asset 表或研究结论。
- [ ] AC-08（帧图像）：合成 ANIM 转换后的每帧图像与生成时的帧逐像素相等，调色板绑定正确。
- [ ] AC-09（星云图像）：15 个 BITM 图像绑定 `palette/flight/models`。
- [ ] AC-13：新映射能读取；带子资源的部件只在解析后为 `verified`。AC-14：预算恰等于上限时通过，超出 1 时报 `budget-exceeded`。
- [ ] 现有图形步骤与生产图形的测试不改断言即可通过；AC-18 的诊断与读取边界保持。
- [ ] `pnpm exec vitest run src/original-data src/content tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试，使用代码生成的合成图形条目与合成光盘。不涉及浏览器或原版数据。

## 完成证据
