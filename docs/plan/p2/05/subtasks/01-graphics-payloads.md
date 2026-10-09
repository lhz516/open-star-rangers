---
type: plan
status: active
phase: P2
task: "05"
subtask: "01"
updated: 2026-10-08
---

# 01 — 规范图形 payload 契约

**契约来源：** [spec](../spec.md) 的 S-01、S-02、S-03 的 payload 部分，S-04 的读取与一致性部分，S-07 的结构限值常量，S-08 的 content 错误码；[payload 契约](../spec.md#payload-契约)、[限值与预算](../spec.md#限值与预算)、[错误码](../spec.md#错误码)；AC-01、AC-02、AC-04、AC-07、AC-08 的 payload 与读取器部分。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **计划新增 `src/content/graphics/`：**
  - **常量：** 三类 payload 的 schema 版本均为 1。结构限值 `imageWidth` 1–640、`imageHeight` 1–480、`paletteEntryCount` 1–256、`fontCellWidth` 1–8、`fontHeight` 1–8、字形数 256、字符映射 0–256 条。这些常量供 03、04 的转换器与本子任务的读取器共用；格式规则与安全上限的区分写入源码结构文档，不在代码中另设类别字段。
  - **编码：** 调色板、图像、字体各有一个编码函数。输入为已校验的纯数据，输出一个独占整个 `ArrayBuffer` 的 `Uint8Array`。布局为小端定长头部加数据，总长恰为两者之和；Asset ID 以 ASCII 存储（纯程序没有 `TextEncoder`）。透明像素的索引与掩码填充位一律写为 0，同一输入得到同样的字节。
  - **字段：**
    - 调色板：`entryCount` 1–256，`entryCount` 组 8 位 (R, G, B)。
    - 图像：`width`、`height`；`alpha` ∈ {`opaque`, `mask`}；`palette`；`display` 为 `direct` 或 `{ nearest: 目标调色板 }`；`width × height` 字节的行优先索引；`alpha` 为 `mask` 时附掩码，每像素 1 位、bit 7 为最左、每行补齐到整字节、1 为不透明。
    - 字体：`cellWidth`、`height`；256 × `height` 字节的字形，逐位保留；`charMap` 为按 `code` 升序且唯一的 `{ code, glyph }`，二者都在 0–255。（[12](./12-character-map-research.md) 执行期修订：增加每字形行数 `glyphRows` 与字形数，见 [goal 执行记录](../goal.md#执行记录)。）
  - **严格读取器：** `(bytes, schemaVersion)` → 冻结的纯数据结果，其中的数组是调用者独占的新副本，读取器不保留输入。
    - schema 不是 1 → `unsupported-payload-schema`；
    - 长度不符、字段越界、未知的 `alpha` 或 `display` 值、非法 Asset ID、非零填充位、透明像素的非零索引、尾随字节、`charMap` 乱序或重复 → `invalid-graphics-payload`。
  - **描述符一致性：** 给定 P2-01 的 `AssetDescriptor` 与读取结果，核对 kind 与 payload 类别对应。图像引用的调色板 ID 去重后按升序，必须恰好等于描述符依赖：`direct` 为 `{palette}`，`nearest` 为 `{palette, target}`，依赖的 kind 都是 `palette`。调色板与字体没有依赖。不符时报 `binding-mismatch`。
- **[contract-validation.ts](../../../../../src/content/contract-validation.ts)：** 在 `ContentContractErrorCode` 中追加 `invalid-graphics-payload`、`unsupported-payload-schema`、`binding-mismatch`。02 再追加其余两个 code。
- **测试：** 在新模块旁新增 Node 测试：
  - 三类往返，含边界：调色板条目数 1 与 256；图像 1×1 与 640×480；掩码非对称；4×6 与 8×8 字体；空映射与 256 条映射；
  - 每个拒绝条件都断言 code 与路径；
  - 同一输入两次编码字节相同、`sha256Fingerprint` 相同；
  - 修改输入或结果数组互不影响；
  - 用这些 payload 构造的合成组（在 [synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts) 的形状上替换图形 Asset 的字节），经 `validateGroup` 没有 `payload-mismatch`。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)新增“图形 payload”一节：三类字节布局、常量、读取器、一致性校验与错误码，并说明格式规则与安全上限的区别。

## 不包含

- RGBA 展开、最近色映射与字符查找，以及 `palette-index-out-of-range`、`unmapped-character`：归 [02](./02-expansion-lookup.md)。
- 原版字节的读取与转换：归 [03](./03-source-hardening.md)、[04](./04-graphics-conversion.md)。
- 生产 Asset、Worker 与缓存。

## 关键文件与契约

- **计划新增：** `src/content/graphics/` 下的 payload 模块与相邻 `*.test.ts`（尚不存在）。
- **修改：** [contract-validation.ts](../../../../../src/content/contract-validation.ts)，追加 code。
- **复用：** [asset-id.ts](../../../../../src/content/asset-id.ts) 的 `readAssetId`；[asset-contract.ts](../../../../../src/content/asset-contract.ts) 的 `AssetDescriptor`；[sha256.ts](../../../../../src/content/sha256.ts)；[completeness.ts](../../../../../src/content/completeness.ts) 的 `validateGroup`。

## 验收标准

- [x] AC-01 读取器：调色板 payload 条目数 1 与 256 往返相等；条目数 0 或 257、截断、尾随字节 → `invalid-graphics-payload`；schema 2 → `unsupported-payload-schema`。
- [x] AC-02 与 AC-08 的 payload 不变量：掩码 bit 7 为最左，行尾填充位为 0，透明像素索引为 0；读取器拒绝违反者。
- [x] AC-07 payload：4×6 与 8×8 字体往返，单元宽度以外的位保留；宽或高为 0 或 9、`charMap` 乱序或重复都被拒绝。
- [x] AC-04 读取器部分：图像引用与描述符依赖不一致、依赖 kind 不是 `palette`、调色板或字体带依赖时都报 `binding-mismatch`。
- [x] AC-08：三类 payload 同输入同字节、同 SHA-256；`payloadIdentity` 与实际字节一致，`validateGroup` 无 `payload-mismatch`。
- [x] AC-17 部分：新模块不导入 `original-data`、DOM、Node 或 Three.js；`pnpm exec vitest run src/content`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试；合成样本全部由代码生成。
- 不适用 browser-testing 或原版对照。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现（2026-10-05）：** [src/content/graphics/](../../../../../src/content/graphics/) 新增 [graphics-format.ts](../../../../../src/content/graphics/graphics-format.ts)（`GRAPHICS_SCHEMA_VERSION`、`GRAPHICS_LIMITS` 与共用的字段/长度/ID 校验）、[palette-payload.ts](../../../../../src/content/graphics/palette-payload.ts)、[image-payload.ts](../../../../../src/content/graphics/image-payload.ts)、[font-payload.ts](../../../../../src/content/graphics/font-payload.ts) 的编码器与严格读取器，以及 [graphics-binding.ts](../../../../../src/content/graphics/graphics-binding.ts) 的 `referencedPalettes`、`checkGraphicsBinding`。[contract-validation.ts](../../../../../src/content/contract-validation.ts) 追加 `invalid-graphics-payload`、`unsupported-payload-schema`、`binding-mismatch`；[import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts) 的穷举 code 表随之补齐（DTO 语法本已接受新 token）。编码器写出独占整个 `ArrayBuffer` 的缓冲，并把透明像素索引与掩码填充位写为 0；读取器先校验头部字段与总长，再在借用视图上校验填充位与透明索引，最后复制。
- **测试：** `pnpm exec vitest run src/content/graphics` 4 个文件 96 项通过：
  - [palette-payload.test.ts](../../../../../src/content/graphics/palette-payload.test.ts)：字节布局；1 与 256 项往返、冻结与副本隔离；非零偏移视图；schema 0/2、截断头部、0 与 257 项、截断与尾随字节、已转移字节；编码器拒绝 0/257 项与不完整三元组。
  - [image-payload.test.ts](../../../../../src/content/graphics/image-payload.test.ts)：3×2 不透明字节布局与往返；10×3 非对称掩码（含全透明行与行尾填充）断言掩码字节为 `11011000 01000000 …` 且 `isOpaque` 逐像素与期望一致，即 bit 7 为最左；编码器把透明索引与填充位写 0 且不改输入；1×1、640×480、目标等于源调色板的 nearest 往返；65535×65535 头部只凭字段拒绝；读取器 18 类拒绝（含非调色板 ID、填充位、透明非零索引）与编码器 12 类拒绝都断言 code 与路径。
  - [font-payload.test.ts](../../../../../src/content/graphics/font-payload.test.ts)：字形按字形序与行序存放；4×6（单元宽度以外的位保留）、8×8、1×1、空映射与 256 条映射逐位往返且冻结；宽或高 0/9、257 条、表长不符、映射乱序或重复的读取器与编码器拒绝。
  - [graphics-binding.test.ts](../../../../../src/content/graphics/graphics-binding.test.ts)：引用去重升序；匹配时通过；kind 不同、缺少/多出/错误依赖、缺少 nearest 目标、依赖 kind 不是 `palette`、调色板或字体带依赖 8 种情况均为 `binding-mismatch@asset.*`；三类同输入同字节同 SHA-256；以三类 payload 替换合成 `cockpit-hud-map` 组的图形 Asset（另加 `flight-palette` 调色板并让图像依赖它）后 `validateGroup` 为 `group-complete`，每个图形 Asset 的读取结果与 `readAssetDescriptor` 的描述符通过绑定核对。
  - 变异核对：分别去掉填充位拒绝、透明非零索引拒绝、编码器的透明索引清零、整字节跳过，相应用例都失败，恢复后通过。
- **边界与工程：** 新模块只导入 `content` 内模块（逐文件核对 import）；`pnpm exec vitest run src/content src/workers/import-protocol.test.ts` 15 个文件 613 项、`pnpm typecheck`、`pnpm lint` 与 `pnpm check`（含工程边界回归）通过。
- **Rubber-duck：** 以本子任务 diff 为范围审查，无 Blocker/High/Medium/Low 发现。
- **Simplify：** 采纳 `payloadView` 复用 `requireBytes`、复制改用 `ownership.ts` 的 `exclusiveBytes`、图像按掩码字节跳过不透明像素并由编码器与读取器共用一个透明像素遍历、读取器先校验后复制、字体编码不再为每条映射分配对象、测试共用 [graphics.test-support.ts](../../../../../src/content/graphics/graphics.test-support.ts)。未采纳：`readPaletteReference` 把 ID 错误归为 `invalid-graphics-payload` 是 spec 规定的分类；共用的已转移检查需改动本 diff 之外的模块；`GRAPHICS_SCHEMA_VERSION` 供 04 的 `PayloadRecord` 使用，保留导出。
- **文档影响：** [源码结构](../../../../engineering/modules/content.md#图形-payload)新增“图形 payload”一节（字节布局、常量及两类限值、编码、读取、绑定与错误码）并在目录树与 content 概述中加入 `graphics/`。工程约定与工具指南没有列出 content code 或相关命令，无需更新；原版文档不受影响。
