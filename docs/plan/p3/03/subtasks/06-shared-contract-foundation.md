---
type: plan
status: active
phase: P3
task: "03"
subtask: "06"
updated: 2026-10-09
---

# 06 — 共用错误码、限值名与规范 JSON

**契约来源：** [spec](../spec.md) 的 S-14、AC-14（限值名）、AC-18；[规范 payload](../spec.md#规范-payload)、[错误](../spec.md#错误)、[限值与预算](../spec.md#限值与预算)。
**依赖：** 01, 02, 03, 04, 05。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **限值名：** 按 01–05 记录的结构，在 `SourceLimitName` 中一次追加全部新结构所需的限值名，例如事件触发与区间、CINF 与碎片记录、AI 程序与条目、菜单项目、ANIM 帧与帧数据、爆炸表项。名称与限值的对应写进类型注释。这些限值名供 07、10–17 共用，避免多个并行行同时修改同一封闭集合。研究证明现有的通用限值名（`payloadItems`、`payloadEntryBytes`、`textBytes`）已足够表达的结构，不另起新名。
- **内容错误码：** 按 spec 的错误一节作出以下决定：
  - logic 组的新 data 角色复用 `invalid-logic-payload`、`non-canonical-payload` 与 `logic-reference-mismatch`；
  - models 与 cockpit-hud-map 组的新 data 角色（场景设置、爆炸表、爆炸动画、星云列表、视角标签）追加 `invalid-flight-data-payload` 与 `flight-data-reference-mismatch`，`non-canonical-payload` 共用。

  在 [contract-validation.ts](../../../../../src/content/contract-validation.ts) 追加这两个错误码，在 [import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts) 的封闭列表中补上新码与新限值名。
- **规范 ASCII JSON：** 把 [logic-payload.ts](../../../../../src/content/logic/logic-payload.ts) 中与角色无关的规范编码与解码抽到计划新增的 `src/content/canonical-json.ts`。内容包括：可打印 ASCII 校验、无空白的规范输出、`reserve` 回调、在读取前检查长度上限、要求重新编码与输入逐字节相同；角色专用的读取由调用者传入。`logic-payload.ts` 改用它，输出字节与错误码不变，由现有测试证明。新模块不导入 `original-data`。
- 为新模块与新错误码编写单元测试，覆盖规范输出、非 ASCII、空白、字段顺序、`-0`、长度上限与 `reserve` 的调用时机。

## 不包含

- 各 payload 族的类型、读取器与限值常量：归 07、08、09。
- 解析器与转换：归 10–17。
- 模块分册的同步：由 22 完成；本项在完成证据中列出新增的 API、错误码与限值名。

## 关键文件与契约

- [source-error.ts](../../../../../src/original-data/source-error.ts) 的 `SourceLimitName`。
- [contract-validation.ts](../../../../../src/content/contract-validation.ts) 的 `ContentContractErrorCode`。
- [logic-payload.ts](../../../../../src/content/logic/logic-payload.ts) 的 `encodeLogicPayload`、`decodeLogicPayload`。
- 计划新增：`src/content/canonical-json.ts` 与 `src/content/canonical-json.test.ts`。

## 写入范围

- `src/original-data/source-error.ts`：追加限值名。
- `src/original-data/source-error.test.ts`：限值名的位置语法与回归。
- `src/content/contract-validation.ts`：追加两个内容错误码。
- `src/content/canonical-json.ts`：规范 ASCII JSON 编解码（新建）。
- `src/content/canonical-json.test.ts`：单元测试（新建）。
- `src/content/logic/logic-payload.ts`：改用共用模块，行为不变。
- `src/content/logic/logic-payload.test.ts`：必要时调整，证明字节不变。
- `src/workers/import-protocol.test.ts`：封闭列表补上新码与新限值名。

## 验收标准

- [x] AC-14（限值名）：新结构所需的限值名都已在 `SourceLimitName` 中，与 01–05 的结构一一对应，并经协议读取回归。
- [x] 两个新内容错误码已加入封闭集合与协议回归；logic 组新角色的错误码决定已写入完成证据。
- [x] `canonical-json.ts` 的单元测试通过；`logic-payload.ts` 的既有测试不改断言即可通过，同一输入的输出字节不变。
- [x] AC-18：`content/` 不导入 `original-data`；诊断不回显值。
- [x] 针对性检查 `pnpm exec vitest run src/content src/original-data/source-error.test.ts src/workers/import-protocol.test.ts tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 单元测试与既有回归，如上。不涉及浏览器或原版数据。

## 完成证据

2026-10-09，worker `exec-p3-03-06`，基于认领提交 19b6289。

- **限值名（AC-14）：** [source-error.ts](../../../../../src/original-data/source-error.ts) 的 `SourceLimitName` 追加 `aiProgramRecords`、`aiScriptItems`、`aiEntries`、`commMenuItems`、`animFrameBytes`，类型注释写明 01–05 各结构与限值名的对应。判定规则：按 payload-block 规则读取的结构沿用通用名，位置的结构路径指明结构；通用名表达不了的结构另起新名。
  - `payloadEntryBytes`：按 payload block 读取的条目大小，即 TABL 4003、CINF、DEBRIS TABL 4501、AICO 6001、TABL 6003、DFPG、AI 脚本 TABL、COMM 菜单 TABL、TABL 10165、TABL 10399、RENS 10751、EXIC、EXPL、NEBC 与 ANIM。
  - `payloadItems`：{指针, 数量} 数组的数量，即 SCEN 段 2 的事件触发、触发的区间、区间的消息指针；CINF 的炮、导弹、机型与弹体记录，机型记录的挂点、挂点列表、盒与数值对；DEBRIS 每个种类位的记录与记录的盒；AICO 的三元组与 16 字节元素；DFPG 的 6 个 ID 列表；EXIC 的 3 张列表；NEBC 的 ID；ANIM 的帧记录（+0x00/+0x04 是 {指针, 数量}，见 textures §6）。
  - `textBytes`：NUL 之前的文字字节，即 SCEN 段 2 消息、CINF 名称、AI 程序名与脚本文字、COMM 菜单项目文字、TABL 10399 标签与 EXE 飞行消息。`executableRegion`：飞行消息与内置 AI 程序表的 EXE 区域。
  - 新名：`aiProgramRecords` 为一张程序表的 0x54 字节记录（TABL 6003 在终止记录之前的记录，或 EXE 内置表）；`aiScriptItems` 为一个 AI 脚本到终止项（含）为止的 0x18 字节项；`aiEntries` 为组 0 ID 链所指的不同条目（DFPG 与脚本）；`commMenuItems` 为一张 COMM 菜单到最后一项（含）为止的 8 字节项；`animFrameBytes` 为一帧 ANIM 的编码数据字节（帧记录 +32）。前四者是以终止项结束或跨条目汇集的结构，不是 {指针, 数量} 数组。
  - 格式规定的固定数目（20 个种类位、TABL 4003 的 18 × 3、EXIC 的 3 张列表等）是格式规则，不设限值名。
  - 回归：[source-error.test.ts](../../../../../src/original-data/source-error.test.ts) 的 `P3-03 structure limits` 以结构路径位置构造各限值，诊断在位置语法内、冻结并可结构化克隆；[import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts) 的类型完整记录加入 5 个新名，协议读取接受每一个。
  - **交 07、10–14：** [payload-block.ts](../../../../../src/original-data/formats/payload-block.ts) 的 `array()` 固定报 `payloadItems`，与上述对应一致；使用新名的结构（终止项结束的列表、ANIM 帧数据）由解析器以 `block.limit(path, name, limit, observed)` 在读取之前判定。
- **内容错误码：** [contract-validation.ts](../../../../../src/content/contract-validation.ts) 追加 `invalid-flight-data-payload` 与 `flight-data-reference-mismatch`，供 models 与 cockpit-hud-map 组的新 data 角色（场景设置、爆炸表、爆炸动画、星云列表、视角标签）使用，`non-canonical-payload` 共用；协议回归的封闭列表已补上。logic 组的新 data 角色（`craft-info`、`debris-parameters`、`ai-programs`、`comm-menus`、`base-repair-items`、`flight-messages`）复用 `invalid-logic-payload`、`non-canonical-payload` 与 `logic-reference-mismatch`，不新增码。
- **规范 JSON：** 新增 [canonical-json.ts](../../../../../src/content/canonical-json.ts)，只导入 `contract-validation.ts` 与 `ownership.ts`。
  - `CanonicalJsonFormat { name, byteLimit, invalid }`：族名用于固定的诊断文字（`must not exceed the <name> byte limit`），`invalid` 是该族的格式错误码。
  - `requireCanonicalJsonBytes(bytes, format)`：先于读取描述符或任何字节，检查 `Uint8Array`、未被转移（`payload-detached`）与字节上限。
  - `encodeCanonicalJson(value, format, reserve?)`：`value` 须是严格读取的结果；先以字节长度调用 `reserve`，再查上限并分配恰好长度的新缓冲区。
  - `decodeCanonicalJson(bytes, format, read, encoded?)`：先做上述检查，再要求可打印 ASCII、JSON 文本、由调用者的 `read` 接受，且 `encoded(result)` 的规范文本与输入逐字节相同（默认即 `result`；logic 以 `result.content` 比较）。诊断路径为 `payload`，不回显字节。
  - 规范文本：无空白，字段顺序由读取器决定，数字为 ECMAScript 最短往返形式，`-0` 写作 `0`；字符串按 `JSON.stringify` 转义（控制字符与孤立代理项），其余 0x7F 及以上的码元写成小写 `\uXXXX`，因此码位 1–255 的字节串（字段处理规则 8）也是可打印 ASCII。有限 `f32` 转为 double 是精确的，最短形式往返后逐位不变，次正规数也是（按协调者决定）。
  - [logic-payload.ts](../../../../../src/content/logic/logic-payload.ts) 改用该模块：`decodeLogicPayload` 仍先查字节、再查描述符；`encodeLogicPayload` 与解码的输出字节、错误码、路径与原因文字不变。证明：改动前后对 3 个角色的合成 logic payload 与一个含引号、反斜杠、指数形式与 `-0` 的任务分别计算 sha256，结果相同；[logic-payload.test.ts](../../../../../src/content/logic/logic-payload.test.ts) 未改动即通过。
  - 单元测试 [canonical-json.test.ts](../../../../../src/content/canonical-json.test.ts)（23 个）：规范输出（字段顺序、无空白、最短数字、`-0`）；码位 1–255 与代理项的转义及往返；`f32` 逐位往返（含最小与最大次正规数）；`reserve` 恰调用一次且早于上限判定与分配，恰等于上限通过、超出 1 拒绝，`reserve` 抛错即停止；解码拒绝空白、字段顺序、`-0`、更长的数字写法、可打印字符的转义、`\u000a` 代替 `\n`、大写十六进制转义、重复键、尾随换行、非 JSON、读取器错误与未知字段，以及 0x00、0x0A、0x7F、0x80、0xE9、0xFF 字节；上限先于读取任何字节判定；描述符之前的字节检查；转移后的字节。每个拒绝都核对诊断不含标记。变异核对：去掉转义、把上限判定移到 ASCII 检查之后，都使测试失败。
- **AC-18：** `content/` 新增代码不导入 `original-data`，`tools/engineering-boundaries.test.ts` 通过；诊断只含 code 与路径，测试以 `expectContractError` 的秘密标记核对。
- **检查：** `pnpm exec vitest run src/content src/original-data/source-error.test.ts src/workers/import-protocol.test.ts tools/engineering-boundaries.test.ts`：31 个文件、1,370 个测试通过；`pnpm typecheck`、`pnpm lint` 通过；`pnpm check`：158 个文件、4,743 个测试与生产构建通过。
- **Rubber-duck：** 一项发现：ANIM 帧数组是 {指针, 数量}，按本项的判定规则应为 `payloadItems`，另设 `animFrames` 多余且与 `array()` 不一致。已采纳，删除 `animFrames`，ANIM 帧记录归入 `payloadItems`。规范 JSON、错误码、判定顺序与 AC-18 无其他发现。
- **Simplify：** 测试改用既有的 `asciiBytes`/`asciiText` 与 `expectContractError`（每个拒绝都加上不回显核对），`canonicalJsonText` 不再导出，删去多余的转移列表断言。未采纳：解码时字节检查重复一次（O(1)，使 `decodeCanonicalJson` 可单独安全使用）；对 ASCII 字符串也做转义扫描（字节串需要，O(n) 开销可忽略）；`encoded` 投影（logic 与将来按角色联合的族不必类型转换）；`f32` 位模式断言（协调者决定的直接证据）。
- **文档影响：** 模块分册按 goal 由 22 同步，本项不改。交 22：content 分册新增 `canonical-json.ts`（上述 4 个导出与规范文本规则，含 0x7F 及以上码元的转义），logic payload 的编解码改由它实现、行为不变；`ContentContractErrorCode` 新增 2 个码及其适用角色；original-data 分册的错误一节新增 5 个限值名及上述对应。其他文档无须更新：格式文档与 U 项未变，命令与工程约定未变。
