---
type: plan
status: active
phase: P3
task: "03"
subtask: "14"
updated: 2026-10-09
---

# 14 — ANIM 解码与爆炸表解析器

**契约来源：** [spec](../spec.md) 的 S-10、S-15、AC-08（解码与拒绝）、AC-14（结构限值）、AC-18；[字段处理规则](../spec.md#字段处理规则) 9、[错误](../spec.md#错误)。
**依赖：** 09。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **ANIM：** 新增解析器，按 05 的结构读取帧表与逐帧参数，并按 05 由代码确认的编码 1 规则解码每帧。若规则是帧间增量，按规则重建每一帧的完整索引图像。
  - 产出：逐帧的完整索引像素、透明掩码与调色板来源（自带调色板或 DATA），以及 09 `explosion-animation` 内容所需的逐帧或动画参数。
  - 拒绝：截断、越界、提前结束与剩余字节为 `invalid-payload`；研究未覆盖的编码分支为 `unsupported-payload`。
- **图像记录头：** [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts) 的读取只在 ANIM 帧中接受编码 1，其他条目中出现时仍为 `unsupported-encoding`。现有编码 0 与 2 的行为不变。
- **EXIC 与 EXPL：** 新增解析器。EXIC 为三张 EXPL ID 列表（格式规则为 3 张）；每个 EXPL 为 {SND ID, ANIM ID}，加上 05 确定的其他字段。
- 在合成支持中实现一个按格式文档编码 ANIM 的编码器，只用于测试。测试覆盖编码规则的每个分支、多帧、帧间依赖（如有）与透明。
- 结构超限用 06 的限值名。

## 不包含

- 帧图像的 payload、Asset 命名与转换：归 16。
- 爆炸表与动画 data Asset 的转换与 ID 链：归 17。
- 全部 186 帧的本地核对与外观对照：归 21。
- 模块分册：由 22 同步。

## 关键文件与契约

- [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts)：`readImageRecordHeader` 与解码入口。
- [payload-block.ts](../../../../../src/original-data/formats/payload-block.ts)、[m2id.ts](../../../../../src/original-data/formats/m2id.ts)（只读）：ID 列表解析的先例。
- 09 新增的 `src/content/flight/` 类型；05 写入 [textures](../../../../original/formats/textures.md) 的 ANIM 与 EXPL 结构。
- 计划新增：`src/original-data/formats/anim.ts`、`explosion.ts` 与它们的测试和合成支持。

## 写入范围

- `src/original-data/formats/anim.ts`：ANIM 帧表与编码 1 解码（新建）。
- `src/original-data/formats/anim.test.ts`：测试（新建）。
- `src/original-data/formats/anim.test-support.ts`：按格式文档编码的合成 ANIM（新建）。
- `src/original-data/formats/explosion.ts`：EXIC 与 EXPL 解析（新建）。
- `src/original-data/formats/explosion.test.ts`：测试（新建）。
- `src/original-data/conversion/source-graphics.ts`：只在 ANIM 中接受编码 1。
- `src/original-data/conversion/source-graphics.test.ts`：回归测试。

## 验收标准

- [ ] AC-08（解码）：代码生成的合成 ANIM 按文档化的编码 1 规则编码，解码后的逐帧完整图像与生成时的帧逐像素相等；样本覆盖每个分支、多帧与帧间依赖（如有）。
- [ ] AC-08（拒绝）：截断、越界与剩余字节为 `invalid-payload`，未覆盖的分支为 `unsupported-payload`；ANIM 以外的编码 1 仍为 `unsupported-encoding`，编码 0 与 2 的既有测试通过。
- [ ] EXIC 恰为 3 张列表，EXPL 字段按研究结构解析；越界与超限按 code 拒绝。
- [ ] AC-14 与 AC-18：结构限值恰等于上限时通过，超出 1 时拒绝；诊断不回显像素或数值；测试不读取文件。
- [ ] `pnpm exec vitest run src/original-data tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试，使用代码生成的合成 ANIM、EXIC 与 EXPL。不涉及浏览器或原版数据。

## 完成证据
