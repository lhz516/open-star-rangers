---
type: plan
status: active
phase: P3
task: "03"
subtask: "17"
updated: 2026-10-09
---

# 17 — 飞行表现数据的转换步骤

**契约来源：** [spec](../spec.md) 的 S-09（场景设置）、S-10、S-11、S-14、AC-07（场景设置）、AC-08（引用与 ID 链）、AC-09（列表与 ID 链）、AC-13、AC-14、AC-18；[来源映射与核验](../spec.md#来源映射与核验)。
**依赖：** 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **步骤：** 计划新增的 `runFlightDataStep(source, mappings, declarations, limits, usage)` 在模型阶段运行，产出 models 组的 4 类 data Asset：
  - `data/scene-settings`：RENS 10751 的头部子资源，用 13 的解析器；
  - `data/explosions`：EXIC 10211 与 17 条 EXPL，用 14 的解析器；
  - `data/explosion-animation/<nn>`：按 spec 的编号规则；
  - `data/nebula-backgrounds`：NEBC 10661。

  步骤内读取，每个条目在本步骤内只物理读取一次。
- **ID 链：** 以下任一不一致都为 `subresource-mismatch`：
  - EXIC 的三张列表恰为映射的 17 个 EXPL；
  - 每个 EXPL 的 ANIM 等于对应动画 Asset 所映射的 ANIM；每个 EXPL 的 SND 等于音频表中已交付爆炸音效 Asset 的来源条目，查询 [production-sounds.ts](../../../../../src/original-data/conversion/production-sounds.ts)，只读；
  - 每个动画 Asset 的帧引用恰为 16 的生产声明中该 ANIM 的帧图像；
  - NEBC 的 15 个 ID 恰为 16 的星云图像映射的 BITM 部件，且顺序一致。
- **依赖：**
  - 爆炸表依赖全部动画 Asset 与 `sound/explosion/blast-v1`–`v4`（跨组外部要求）；
  - 动画依赖其帧图像；
  - 星云列表依赖 15 个星云图像。
- **生产表：** 在计划新增的 `production-flight-data.ts` 中定义映射与声明，置信度与 U 项按 Asset 表。份额常量 `PRODUCTION_FLIGHT_DATA_SHARE` 的数值由 19 推导后填入；本项不接入 `import-job.ts`。
- [effect-step.ts](../../../../../src/original-data/conversion/effect-step.ts) 不改，`data/projectile-visuals` 保持只含 RENS 记录。
- 用代码生成的合成 RENS、EXIC、EXPL、ANIM、NEBC 与合成光盘编写测试，覆盖：正向转换与依赖、四条 ID 链的不一致、预算、读取日志，以及 `data/projectile-visuals` 不变。

## 不包含

- 帧图像与星云图像本身：由 16 提供。
- 接入作业、models 组草稿的合并、份额数值与转换器组件：归 19。
- 爆炸选择与背景方向：归 P3-07、P3-12。
- 模块分册：由 22 同步。

## 关键文件与契约

- [effect-step.ts](../../../../../src/original-data/conversion/effect-step.ts)、[model-step.ts](../../../../../src/original-data/conversion/model-step.ts)（只读，作为步骤与分区的先例）。
- 16 的 `production-flight-graphics.ts`；13 的 `rens-header.ts`；14 的 `anim.ts`、`explosion.ts`；09 的 `src/content/flight/`。
- 计划新增：`src/original-data/conversion/flight-data-step.ts`、`production-flight-data.ts`、`flight-data.test-support.ts` 与测试。

## 写入范围

- `src/original-data/conversion/flight-data-step.ts`：步骤、ID 链与转换（新建）。
- `src/original-data/conversion/flight-data-step.test.ts`：测试（新建）。
- `src/original-data/conversion/production-flight-data.ts`：生产映射、声明与份额常量（新建）。
- `src/original-data/conversion/production-flight-data.test.ts`：测试（新建）。
- `src/original-data/conversion/flight-data.test-support.ts`：合成条目与合成光盘（新建）。
- `src/original-data/source-mapping.ts`：在 `SOURCE_ENTRY_TYPES.data` 中加入 ANIM，使 `data/explosion-animation/<nn>` 可映射整个 ANIM 条目（2026-10-09 由协调者扩展）。
- `src/original-data/source-mapping.test.ts`：对应测试（2026-10-09 由协调者扩展）。

## 验收标准

- [ ] AC-07（场景设置）：RENS 头部转换为 `data/scene-settings`，`data/projectile-visuals` 不变。
- [ ] AC-08（引用）：爆炸表与动画的引用和依赖正确；EXIC→EXPL→ANIM/SND 的不一致为 `subresource-mismatch`。
- [ ] AC-09（列表）：NEBC 的 15 个引用按顺序指向星云图像；列表与映射不一致为 `subresource-mismatch`。
- [ ] AC-13 与 AC-14：新映射能读取，带子资源的部件只在解析后为 `verified`；预算恰等于上限时通过，超出 1 时报 `budget-exceeded`，用量等于独立计算的值。
- [ ] AC-18：只经 `VerifiedSource` 读取；诊断不回显值；测试不读取文件。
- [ ] `pnpm exec vitest run src/original-data tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试，使用代码生成的合成条目与记录读取的合成光盘端口。不涉及浏览器或原版数据。

## 完成证据
