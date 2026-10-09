---
type: plan
status: active
phase: P3
task: "03"
subtask: "13"
updated: 2026-10-09
---

# 13 — RENS 头部与视角标签解析器

**契约来源：** [spec](../spec.md) 的 S-08（`view-labels`）、S-09（`scene-settings`）、S-15、AC-06（视角标签）、AC-07（RENS 头部）、AC-14（结构限值）、AC-18。
**依赖：** 09。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **RENS 头部：** 新增解析器，按 04 的结构类型化读取 RENS 10751 的 +0x00–+0x57，产出 09 的 `scene-settings` 内容。非有限浮点为 `invalid-payload`；只在基准中为零的位置非零为 `unsupported-payload`。+0x58 起的记录数组不在本项范围内，现有效果步骤对它的读取保持不变。
- **视角标签：** 新增解析器，读取 TABL 10399 的 13 个字串指针，只取第 8 项，文字为字节串，须在块内以 NUL 结束；产出 `view-labels` 内容。第 0–7 项与第 9–12 项不转换，只检查定位所需的结构。
- 沿用 payload-block 的指针与边界规则；结构超限用 06 的限值名。
- 用代码生成的合成 RENS 块与 TABL 10399 块编写测试：各字段类型、负值与 `f32`；非有限值、未登记指针、缺少 NUL、超长与越界的拒绝；其他标签改变时结果不变。

## 不包含

- 来源映射与转换：归 16（视角标签）、17（场景设置）。
- 灯光与闪光的表现规则：归 P3-12。
- 模块分册：由 22 同步。

## 关键文件与契约

- [payload-block.ts](../../../../../src/original-data/formats/payload-block.ts)（只读）；[effect-step.ts](../../../../../src/original-data/conversion/effect-step.ts)（只读）：RENS 记录的现有读取。
- 09 新增的 `src/content/flight/` 与 `src/content/hud/view-labels-payload.ts` 类型；04 写入 [executable](../../../../original/formats/executable.md) 与 [hud](../../../../original/formats/hud.md) 的结构。
- 计划新增：`src/original-data/formats/rens-header.ts`、`view-labels.ts` 与它们的测试和合成支持。

## 写入范围

- `src/original-data/formats/rens-header.ts`：RENS 头部解析（新建）。
- `src/original-data/formats/rens-header.test.ts`：测试（新建）。
- `src/original-data/formats/rens-header.test-support.ts`：合成 RENS 块（新建）。
- `src/original-data/formats/view-labels.ts`：TABL 10399 第 8 项解析（新建）。
- `src/original-data/formats/view-labels.test.ts`：测试（新建）。

## 验收标准

- [ ] AC-07（RENS 部分）：头部各字段按类型转换；坏输入按 code 拒绝。
- [ ] AC-06（视角标签部分）：第 8 项转换正确，保留 128–255 的字节；缺少 NUL、超长与越界按 code 拒绝；其他项不出现在结果中。
- [ ] AC-14：每个结构限值恰等于上限时通过，超出 1 时为 `limit-exceeded`。
- [ ] AC-18：诊断不回显数值或文字；测试不读取文件。
- [ ] `pnpm exec vitest run src/original-data/formats tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试，使用代码生成的合成块。不涉及浏览器或原版数据。

## 完成证据
