---
type: plan
status: active
phase: P3
task: "03"
subtask: "08"
updated: 2026-10-09
---

# 08 — 规则数据的 payload 契约

**契约来源：** [spec](../spec.md) 的 S-03 至 S-08（logic 组角色）、AC-11、AC-14（结构限值）、AC-18；[字段处理规则](../spec.md#字段处理规则)、[Asset 与角色](../spec.md#asset-与角色)、[规范 payload](../spec.md#规范-payload)。
**依赖：** 02, 03, 04, 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在计划新增的 `src/content/rule-data/` 中，为 logic 组的 6 个新 data 角色定义类型、限值常量、读取器、规范编码、字节解码入口与描述符绑定检查：
  - `craft-info`：`hitDamageScale`，`guns` 与 `missiles` 按源序号排列，`craft` 恰为 20 项且下标为种类位，`missileBodies`；字段类型按 02；
  - `debris-parameters`：`byCraftType` 恰为 20 项，每项为 96 字节记录的数组，嵌套浮点数组按 02；
  - `ai-programs`：`groupTriple`、`programs`、`entries`、`builtInPrograms`；ID 链转为 `entries` 序号，代码指针为不透明的代码标识（LE 对象与对象内偏移），类型按 03；
  - `comm-menus`：5 张菜单，键名按已确认的选择条件命名，项目字段按 04；
  - `base-repair-items`：11 个 `subsystemSelectors`，值域按 04；
  - `flight-messages`：7 条字节串，键名按已确认的发送者与触发命名。
- 字段命名遵循字段处理规则 2：含义未确认的用中性名，类型注释链接源位置与 U 项。零值按规则 3 处理，只有原版代码确认 0 表示“缺省或不存在”时才记为 null。规范数据中除代码标识外，不含条目 ID、文件偏移、`flags` 或 locator。
- 每个族的 payload schema 版本初始为 1；编码经 06 的共用模块。读取器在读取元素前检查结构限值，限值按研究观测值以“2 倍，向上取整到 2 的幂”推导；格式规定的固定数目（20 个种类位、5 张菜单、7 条消息等）作为格式规则检查。
- 错误码复用 `invalid-logic-payload`、`non-canonical-payload` 与 `logic-reference-mismatch`。绑定检查要求 kind 为 `data`、角色正确、没有依赖。
- 用代码生成的合成内容编写单元测试：往返逐字节相同；缺少或多余字段、类型错误、非规范编码（空白、字段顺序、`-0`）、非有限数、超限、值域外与引用错误都按 code 拒绝；结果冻结且与输入隔离。

## 不包含

- 原版解析：归 10、11、12。
- 来源映射、转换与包装配：归 15、19。
- 规则语义：归 P3-06 至 P3-10。
- 模块分册：由 22 同步。

## 关键文件与契约

- [logic-content.ts](../../../../../src/content/logic/logic-content.ts)（只读）：`RuleInputs` 的先例。
- 06 新增的 `src/content/canonical-json.ts`；[contract-validation.ts](../../../../../src/content/contract-validation.ts)（只读）。
- 02、03、04 的完成证据，以及 `docs/original/formats/craft.md`、`ai.md`、`comm.md`、[hud](../../../../original/formats/hud.md)、[executable](../../../../original/formats/executable.md)。
- 计划新增：`src/content/rule-data/` 下各族的模块、测试与合成支持。

## 写入范围

- `src/content/rule-data/**`：6 个 payload 族的类型、限值、读取器、编码、测试与合成支持（新建）。

## 验收标准

- [x] AC-11（6 个族）：往返逐字节相同；各类坏输入按 code 拒绝；结果冻结且与输入隔离；字节解码入口拒绝描述符与 payload 不一致的输入。
- [x] AC-14（结构限值）：每个限值恰等于上限时通过，超出 1 时拒绝；推导所用的观测值写入完成证据。
- [x] 字段名与类型符合字段处理规则，类型注释链接源位置与 U 项；没有规则解释或默认值。
- [x] AC-18：`content/rule-data/` 不导入 `original-data`，测试不读取文件，合成值不来自原版。
- [x] `pnpm exec vitest run src/content tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 单元测试，使用代码生成的合成内容。不涉及浏览器或原版数据。

## 完成证据

2026-10-09，worker `exec-p3-03-08`，基于认领提交 3f7652b。

- **新增文件（`src/content/rule-data/`）：**
  - `rule-data-fields.ts`：共用的严格字段读取：`readI32`、`readU32`、`readInt32`（0…2³¹−1）、`readU8`、`readF32`（有限且 `Math.fround` 不变，次正规数逐位保留，−0 读为 0）、字节串（码位 1–255）、定长元组、先查长度再读元素的列表，以及按 `Shape<T>` 逐字段读取并冻结的 `records()`（形状的键序即规范字段顺序）。结构错误为 `invalid-logic-payload`，payload 内引用不符为 `logic-reference-mismatch`，诊断只含结构路径。
  - 6 个族各一个模块：`craft-info.ts`、`debris-parameters.ts`、`ai-programs.ts`、`comm-menus.ts`、`base-repair-items.ts`、`flight-messages.ts`，各含类型、限值或格式计数常量与读取器。
  - `rule-data-payload.ts`：角色联合与按角色的 schema 版本（均为 1）、读取、规范编码、绑定检查与字节解码入口。
  - 测试：`rule-data-payload.test.ts`、`rule-data-limits.test.ts`、`rule-data-content.test.ts`，合成支持 `rule-data.test-support.ts`，共 120 个测试。
- **API（交 22 写入 content 分册）：**
  - `rule-data-payload.ts`：`RuleDataPayload`（`{ role, content }` 的 6 角色联合）、`RuleDataRole`、`RULE_DATA_ROLES`、`RULE_DATA_SCHEMA_VERSIONS`、`readRuleDataContent(role, value, path?)`、`encodeRuleDataPayload(payload, reserve?)`、`checkRuleDataBinding(descriptor, path?)`、`decodeRuleDataPayload(bytes, descriptor)`。
  - 解码顺序与 logic payload 相同：先查字节（`Uint8Array`、未转移、上限为 `LOGIC_LIMITS.payloadBytes`），再查描述符（严格读取；角色须为 6 者之一、kind 为 `data`，否则 `invalid-logic-payload`；依赖非空为 `logic-reference-mismatch`），再查 schema 版本（`unsupported-payload-schema`），最后经 `decodeCanonicalJson` 按角色读取并逐字节比对规范文本。`reserve` 在上限判定与分配之前收到字节长度，供 15 计入预算。
  - 各族：`readCraftInfo`、`CRAFT_INFO_COUNTS`、`CRAFT_INFO_LIMITS`；`readDebrisParameters`、`DEBRIS_PARAMETERS_LIMITS`；`readAiPrograms`、`AI_PROGRAMS_COUNTS`、`AI_PROGRAMS_LIMITS`、`AI_SCRIPT_END_OPCODE`、`CodeIdentity`；`readCommMenus`、`COMM_MENUS_LIMITS`；`readBaseRepairItems`、`BASE_REPAIR_ITEM_COUNT`；`readFlightMessages`、`FLIGHT_MESSAGES_LIMITS`；以及各记录的类型。
- **字段处理（字段处理规则 2–8）：**
  - **命名：** 含义未确认的数值字段以 `atXX` 命名，即其所在结构内的源位置 +0xXX；格式文档确认用途或结构的字段用结构名：`name`、`boxes`、`mounts`、`pairs`、`mountLists`、`body`、`weapon`、`parameters`、`installScript`、`stateScripts`、`opcode`、`argument`、`branch`、`handler`、`kindMask`、`command`。spec 给出的名称照用：`hitDamageScale`、`guns`、`missiles`、`craft`、`missileBodies`、`byCraftType`、`groupTriple`、`programs`、`entries`、`builtInPrograms`、`subsystemSelectors`。每个类型注释写明源位置、存储类型与格式文档小节，接口注释链接 U 项（U-001、U-008、U-022、U-026、U-027、U-030）。
  - **不携带：** 载入代码覆盖的位置、只在基准中为零的字节、被改写为序号的首字（由位置表示）；文件偏移、条目 ID、`flags` 与 locator 都不出现，唯一的例外是内置程序处理程序的不透明代码标识 `{ object, offset }`（LE 对象号 1–65535 与对象内偏移 u32）。
  - **零值：** 只有已确认的“缺省或不存在”记为 null：mount +0x18/+0x1C、DFPG +0x38、脚本 +0x04/+0x14 的 0；程序表 +0x08 的 0 与 +0x2C 的 ±0（ai §6）。null 表示时读取器拒绝字面量 0，保证一种内容只有一种表示。内置程序不做这两个替换。
  - **机型碰撞形状：** 形状 +0x00 与 +0x08–+0x1C 仅在 `boxes` 为空时保留，有 box 时为 null（载入代码覆盖，craft §3.8）；+0x04 不携带。
  - **整数类型：** 只以与符号无关的方式使用的整数，craft 按 int32 只接受 0…2³¹−1；ai 按其 §6 的约定保留为 u32。
  - **其他约定：** mount +0x10 保留为 `at10`（0 或 1），`weapon` 按它索引 `guns` 或 `missiles`。字节串保留 0x80–0xFF（规范 JSON 写作 `\u00xx`）。没有默认值、单位换算或规则解释。
- **AC-11：**
  - **往返：** 6 个角色往返后逐字节相同，结果深度冻结，等于读取 `JSON.parse` 的结果；f32 次正规数与 0x80–0xFF 的字节逐位保留；相同内容编码相同，各占独立缓冲区。
  - **拒绝：** 缺少字段（`<root>.<field>`）、未知字段、类型错误、非数组根、非 JSON 文本都为 `invalid-logic-payload`。非规范编码为 `non-canonical-payload`，包括前后空白、`: `、`, `、字段顺序、`-0`、`1.250`、`-7e0`、可打印字符的转义与大写十六进制转义；换行不是可打印 ASCII，为 `invalid-logic-payload`。非有限数（`1e999`、NaN、±Infinity）与 f32 不能精确表示的值（0.1、2¹²⁸、2⁻¹⁵⁰）、超限、值域外，以及 payload 内引用错误（`logic-reference-mismatch`）都按 code 拒绝。
  - **隔离：** 读取后修改输入不影响结果，结果不可写，两次解码深度相等且不是同一对象。
  - **解码入口：** 字节上限先于描述符判定；被转移的字节为 `payload-detached`；描述符角色或 kind 错误为 `invalid-logic-payload`，有依赖为 `logic-reference-mismatch`，schema 2 为 `unsupported-payload-schema`；用另一角色的描述符解码时，按该角色读取失败。
  - **隐私：** 合成文字含 `MARKER`，各拒绝用例都核对诊断不含它。
- **族内约束（`rule-data-content.test.ts`）：**
  - **craft-info：** 引用越界：导弹 → 弹体、mount → 炮或导弹（按 `at10` 选择数组）、mount 之间的链、mount 列表 → mount。形状的 null 与 `boxes` 的耦合，`at10` ∉ {0, 1}，弹体没有文字、box、pair、列表与 mount 字段，字段按源顺序且不含被覆盖位置。
  - **ai-programs：** 条目须恰为程序可达的条目，并按表载入器 `0x649c8` 首次到达的顺序排列：每个程序依次为其 +0x1C 条目、该条目的 install script 与按源顺序的 6 个列表。拒绝的情形：程序指向脚本或越界、install script 指向参数条目、列表越界、顺序颠倒、孤立条目、没有程序却有条目。脚本以 opcode 10000 恰好结束于最后一项，分支目标为本脚本内的项；条目按 `kind` 读取。
  - **comm-menus：** 每张列表的值恰在最后一项为 0；空列表、末项非零与中间为零都拒绝。
  - **base-repair-items：** 0、31、33、34 通过，32、35、0xFFFFFFFF、−1、1.5 拒绝。
  - **flight-messages：** 7 个键按源顺序，含 NUL 的文字拒绝。
- **AC-14：** `rule-data-limits.test.ts` 对 21 个可调限值逐一核对：恰等于上限时读取通过并能编码、解码往返，超出 1 时在对应路径报 `invalid-logic-payload`；列表先查长度再读元素，超长的 null 元素列表报在列表路径。格式计数（20 个种类位、3 张 mount 列表、DEBRIS 20 组、三元组 3、元素 4 个 f32、11 个选择值）少 1、多 1 都拒绝；5 张菜单与 7 条消息由字段集固定。payload 字节上限沿用 logic 组的 `LOGIC_LIMITS.payloadBytes`（1,048,576）。推导：观测值 × 2，再向上取整到 2 的幂；测试以同一公式由观测值重算每个常量。

  | 族 | 限值 | 观测值（来源） | 上限 | 06 的限值名 |
  |---|---|---:|---:|---|
  | craft-info | `guns` / `missiles` / `missileBodies` | 10 / 9 / 9（craft §3.9，CINF 4037） | 32 / 32 / 32 | `payloadItems` |
  | craft-info | `mounts`（每机型） | 16 | 32 | `payloadItems` |
  | craft-info | `boxes`（每机型） | 32 | 64 | `payloadItems` |
  | craft-info | `mountListEntries`（每张列表） | 3 | 8 | `payloadItems` |
  | craft-info | `pairs`（每机型） | 3 | 8 | `payloadItems` |
  | craft-info | `nameBytes` | 26 | 64 | `textBytes` |
  | debris-parameters | `records`（每种类位） / `boxes`（每记录） | 8 / 1（craft §4.2） | 16 / 2 | `payloadItems` |
  | ai-programs | `programRecords`（TABL 6003 与内置表共用） | 10（内置表；TABL 6003 为 5，ai §8） | 32 | `aiProgramRecords` |
  | ai-programs | `programNameBytes` | 20 | 64 | `textBytes` |
  | ai-programs | `globalElements` | 5 | 16 | `payloadItems` |
  | ai-programs | `entries` | 25 | 64 | `aiEntries` |
  | ai-programs | `stateScriptItems`（每张列表） | 6 | 16 | `payloadItems` |
  | ai-programs | `scriptItems`（含终止项） | 40 | 128 | `aiScriptItems` |
  | ai-programs | `scriptTextBytes` | 37 | 128 | `textBytes` |
  | comm-menus | `items`（含末项） / `textBytes` | 8 / 15（comm §5） | 16 / 32 | `commMenuItems` / `textBytes` |
  | flight-messages | `textBytes` | 45（executable，飞行消息字串） | 128 | `textBytes` |

  COMM 文字上限 32 在格式支持的 47 字节之内（comm §4）。
- **AC-18：** `src/content/rule-data/` 只导入 `content/` 内的模块（`asset-contract`、`canonical-json`、`contract-validation`、`logic/logic-content` 的 `LOGIC_LIMITS`，测试另用 `graphics-format`、`graphics.test-support`、`ownership`、`synthetic-content.test-support` 与 `logic-content.test-support` 的 `deepFrozen`），不导入 `original-data`；`grep` 没有 `original-data`、`node:fs` 或 `readFile`。合成内容全部由代码生成，数值是任意选取的合成值，文字由 `MARKER`、0x80、0xFF 与填充组成。`tools/engineering-boundaries.test.ts` 通过。
- **变异核对：** 分别去掉以下检查，测试都会失败：列表长度预检（17 个失败）、首次到达顺序、f32 的 `fround` 检查、形状 null 耦合、mount 的武器引用、COMM 末项为零、选择值值域、绑定的依赖检查。
- **检查：**
  - `pnpm exec vitest run src/content tools/engineering-boundaries.test.ts`：32 个文件、1,180 个测试通过；
  - `pnpm typecheck`、`pnpm lint` 通过；
  - `pnpm check`：类型检查、ESLint、161 个文件 4,863 个测试与生产构建通过。
- **Rubber-duck：** 审阅全部 12 个文件、spec 字段处理规则与 6 篇格式文档，没有发现问题。
- **Simplify：** 4 个角度（复用、简化、效率、层级）。
  - **采纳：** 复用 `deepFrozen` 与 `asciiBytes`/`asciiText`；`readByteString`、合成支持的 `stateScripts` 改为模块私有；字段读取合并为一个 `try/catch` 的 `readPlainRecord`；`records()` 预先计算键表，各读取器在模块加载时构造一次（新增 `listOf`）；脚本文字读取器提出到循环外；`readBinding` 直接返回收窄后的描述符；选择值值域改为三项比较。
  - **未采纳：** 碰撞 box 与 20 个种类位移到中立模块（二者同属 craft.md 的结构，debris 从 craft-info 导入即可）；以下涉及写入范围之外的共用模块：在 `contract-validation.ts` 中参数化错误码、共用的定长或有界数组原语、logic 组字节上限的中立归属、`expectContractError` 移出 graphics 测试支持；`readEntry` 的二次复制（最多 64 条，可忽略）。
- **交给下游行的约定（10、11、12、15）：**
  - **−0：** 规范 JSON 不能表示 −0，读取器把 −0 读为 0。转换器遇到源 −0.0 的 f32 须报 `unsupported-payload`；基准中没有 −0（craft §3.9）。程序表 +0x2C 的 ±0 按规则 3 记为 null，不受此限。
  - **弹体记录：** craft §3.8 第 3 步只作用于机型记录，弹体记录不被覆盖，因此 236 字节布局中除指针与计数外的每个位置都按机型类型转换，包括形状 +0x00、+0x04、+0x08–+0x1C；文字、box、pair、列表与 mount 的指针与计数由转换器核对为零。
  - **AI 条目：** `entries` 按首次到达顺序排列（见上），11 按 `0x649c8` 的遍历顺序产出即可。
  - **TABL 2009：** 只携带第 0 项文字（`objectListLastEntry`），其 +0x04 由 12 核对为零。
  - **列表末项：** COMM 列表含值为 0 的末项；脚本含 opcode 10000 的终止项。
- **文档影响：** 写入范围只有 `src/content/rule-data/**` 与本文件。格式文档与 U 项不变，命令与工程约定不变，STATUS 与阶段索引无须改动。交 22：
  - content 分册新增“规则数据 payload”一节，内容为上面的 API、命名约定、限值表与解码顺序；
  - [源码结构](../../../../engineering/source-structure.md)的目录树加入 `src/content/rule-data/`。
