---
type: plan
status: active
phase: P2
task: "05"
subtask: "02"
updated: 2026-10-05
---

# 02 — RGBA 展开、最近色映射与字符查找

**契约来源：** [spec](../spec.md) 的 S-04 的展开与查找部分，S-08 的 content 错误码；[payload 契约](../spec.md#payload-契约)中的“展开结果”与“最近色映射”；技术决定 1、2；AC-05、AC-07 的查找部分。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **在 `src/content/graphics/` 中新增展开函数：**
  - **输入：** 01 的图像读取结果，以及调用者提供的调色板读取结果（按 Asset ID 对应）。
  - **绑定核对：** 提供的调色板集合须恰好等于图像引用的集合，否则报 `binding-mismatch`。
  - **输出：** `{ width, height, rgba }`。`rgba` 是 `width × height × 4` 字节的非预乘 RGBA，每次调用返回调用者独占的新缓冲。
    - 不透明像素为显示所用调色板的颜色，alpha 为 255；透明像素为 (0, 0, 0, 0)；
    - `direct` 时直接查所绑定的调色板；
    - `nearest` 时先用最近色映射把源调色板逐项映射到目标调色板，再查表。
  - **失败：** 不透明像素的索引不小于源调色板条目数时报 `palette-index-out-of-range`。
- **最近色映射：** 导出纯函数，对源调色板的每一项取 8 位 RGB 平方欧氏距离最小的目标条目，距离相等时取较小索引，返回逐项的目标索引表。注释与文档标明这是暂定的项目规则（U-028，见 [11](./11-nearest-colour-research.md)）；研究工具复用同一函数，项目中不另写颜色逻辑。
- **字符查找：** 给定 01 的字体读取结果与码位，返回映射中的字形索引。未映射的码位报 `unmapped-character`，即使该码位恰有同号字形也不回退。提供按码位序列逐个查找的形式，供后续文字绘制消费。
- **[contract-validation.ts](../../../../../src/content/contract-validation.ts)：** 追加 `palette-index-out-of-range` 与 `unmapped-character`。
- **测试：**
  - 非对称合成图像（每像素索引不同）验证 `direct` 的逐像素颜色与透明；
  - `nearest` 覆盖颜色完全相同、唯一最近、距离相等三种情况，断言并列取较小索引；
  - 断言不透明像素的颜色都属于显示所用的调色板；
  - 同一输入两次展开逐字节相同；
  - 提供的调色板多一个、少一个或 ID 不同 → `binding-mismatch`；
  - 已映射与未映射码位的查找。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)的“图形 payload”一节补充展开、最近色与查找，注明最近色为暂定规则，合成测试只验证算法、不是保真证据。

## 不包含

- 原版度量与并列规则的研究：归 [11](./11-nearest-colour-research.md)。研究若取得证据并要求不同规则，由 11 修改本函数。
- Three.js 纹理、过滤方式与 HUD 文字绘制：归 P2-06/07/11。
- 生产字体的字符映射内容：归 [12](./12-character-map-research.md)。

## 关键文件与契约

- **计划新增：** `src/content/graphics/` 下的展开与查找模块及相邻测试（尚不存在）。
- **修改：** [contract-validation.ts](../../../../../src/content/contract-validation.ts)。
- **复用：** 01 的读取器与常量。

## 验收标准

- [x] AC-05：`direct` 展开逐像素正确，透明为 (0, 0, 0, 0)；`nearest` 等价于先映射再查表，三种情况均正确且并列取较小索引；不透明像素颜色都属于显示所用的调色板；重复展开逐字节相同；调色板与引用不符 → `binding-mismatch`；越界索引 → `palette-index-out-of-range`。
- [x] AC-07 查找部分：已映射码位得到声明的字形；未映射码位报 `unmapped-character`，不回退。
- [x] AC-17 部分：模块保持纯净；`pnpm exec vitest run src/content`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试，样本由代码生成。
- 不适用 browser-testing 或原版对照；最近色的原版证据见 11。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现（2026-10-05）：** [expand-image.ts](../../../../../src/content/graphics/expand-image.ts) 的 `expandImage(image, palettes)` 按 `referencedPalettes` 核对按 ID 提供的调色板集合（不等即 `binding-mismatch@palettes`），direct 直接查表，nearest 先用 `nearestColourMap` 把源调色板逐项映射到目标调色板再查表，返回冻结的 `{ width, height, rgba }`，`rgba` 为新分配的非预乘缓冲；不透明像素索引越界报 `palette-index-out-of-range@image.indices`，透明像素经 `isOpaque` 跳过。`nearestColourMap` 用 8 位 RGB 平方欧氏距离、严格小于才替换（并列保留较小索引），注释标明暂定规则与 U-028。[glyph-lookup.ts](../../../../../src/content/graphics/glyph-lookup.ts) 的 `glyphFor` 在有序映射中二分查找，`glyphsFor` 逐字节查找，未映射报 `unmapped-character`（`code` 或 `text[<i>]`），不回退。[contract-validation.ts](../../../../../src/content/contract-validation.ts) 追加两个 code，[import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts) 的穷举表同步。
- **测试：** `pnpm exec vitest run src/content/graphics` 6 个文件 115 项通过：
  - [expand-image.test.ts](../../../../../src/content/graphics/expand-image.test.ts)：最近色三种情况——完全相同（目标中另有一个相同颜色，仍取较小索引）、唯一最近、等距取较小索引——得到 `[2, 1, 0, 3]`，自映射为恒等；3×2 非对称 direct 图像逐像素 RGBA 与透明 (0, 0, 0, 0) 字面期望一致；nearest 图像的 RGBA 等于“映射后查目标表”的字面期望，且每个不透明颜色都在目标调色板中；重复展开逐字节相同、结果冻结、两个缓冲可同时交给 `payloadTransferList`；缺调色板、多一个、缺 nearest 目标、ID 不同 4 种 `binding-mismatch`；16 色调色板下不透明索引越界报错，透明像素上的越界索引不报错。
  - [glyph-lookup.test.ts](../../../../../src/content/graphics/glyph-lookup.test.ts)：已映射码位与 256 条映射的全部码位得到声明的字形；全部 256 个字形都存在时，未映射码位（含 -1、256、非整数）仍报 `unmapped-character`；空映射；序列查找按序返回并在 `text[1]` 报第一个未映射位置。
  - 诊断隐私：`expectContractError` 新增可选的禁止文本，断言上述错误消息不含越界索引、码位（十进制与十六进制）或调色板 ID。
  - 变异核对：把并列规则改为 `<=`、去掉透明像素跳过，各有 2 项用例失败，恢复后通过。
- **工程：** 新模块只导入 `content` 内模块；`pnpm typecheck`、`pnpm lint`、`pnpm check`（101 个文件、2916 项测试与构建）通过。
- **Rubber-duck：** 无 Blocker/High/Medium；唯一 Low（诊断不回显值缺少回归断言）已按上条补齐。
- **Simplify：** 采纳展开改用 `isOpaque`（集中掩码语义）、最近色内层循环先取出源颜色、nearest 颜色表改为普通循环、序列查找只在失败时构造路径。未采纳“删除不透明颜色属于目标调色板的集合断言”：AC-05 明确要求这项可观察结果。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md#图形-payload)“图形 payload”一节补充展开、最近色（标明暂定规则、U-028 与合成测试不是保真证据）与字符查找，目录树加入两个文件。工程约定、工具指南与原版文档无需更新：没有新命令，最近色的原版事实由 11 记录。

