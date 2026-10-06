---
type: plan
status: active
phase: P2
task: "09"
subtask: "05"
updated: 2026-10-05
---

# 05 — SCCT/SCEN/M2ID 定向解析

**契约来源：** [spec](../spec.md) 的 S-03、S-11（转换层错误码与结构限值名）、AC-03（解析部分）、AC-04（解析负向与限值）、AC-13（解析诊断隐私）；[源字段处理](../spec.md#源字段处理)、[限值与预算](../spec.md#限值与预算)、[错误](../spec.md#错误)。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **指针安全的数据块读取：** 在 `original-data/formats/` 提供对一个条目读取结果（字节加重定位位置）的结构读取工具：
  - 指针字段只在重定位表登记的位置上有效，其余位置的非零值视为非指针；
  - 指针目标及其整个结构必须完整位于数据块内；
  - 整数按小端读取，f32 必须有限；
  - 越界或违反格式规则为 `invalid-payload`，位置为 `archive:/路径#ID` 后接结构路径。
- **SCCT：** 解析组表与僚机记录，按 `CLASSIC_P2_SLICE.candidate` 取槽位的 SCEN 条目 ID；group/slot 超出范围为 `subresource-mismatch`。`MUSC` ID 与组名不读取。
- **SCEN：** 解析头部与段表，按[源字段处理](../spec.md#源字段处理)逐行处理：
  - 段 1 记录与段 5 的模板、成员数组生成中间记录，别名记录只保留一份并合并来源标记；
  - 种类为单比特时取位序号，0 为 null，多比特为 `invalid-payload`；
  - 规则输入按源类型（u32 或 i32）保留，0 为 null；`spawnTime` 按 u32；AI 掩码转为升序位序号；
  - 候选名称为有序字符串列表，必须为 NUL 结尾的可打印 ASCII；
  - 头部扇区数（0x00、0x04）按 spec 校验并交给 09 生成地图框架：为 0 为 `invalid-payload`，不相等或超过 32767 为 `unsupported-payload`；
  - 段 0 解析为名称备用池（NUL 结尾的可打印 ASCII）；段 3 解析为生成矩形；段 5 解析 `spawnCount`、模板、成员（保留顺序与重复）与布局指针，+20/+24 必须为零，模板与成员必须是段 1 记录的别名；段 6 只经段 5 布局读取，复现原版载入变换（只交换第 0 个元素的 y 与 z）；表后计数字不在数据块内为 `invalid-payload`，大于 0、项未被引用或元素数为 0 为 `unsupported-payload`；
  - 记录指针字段 +0x3C、+0x44、+0x48、+0x58 解析为编组、生成矩形或记录的序号；+0x54 只核对它指向段 2 表的第一个元素，且该事件触发头部的生成配对指针与数量为零；指针目标不是预期结构起点为 `unsupported-payload`；成员回指必须与编组成员互相一致；
  - 僚机记录的上述指针字段与空间字段（+0x24–+0x2C、+0x40）必须为零；“非默认即不支持”的位置与未列出的字节出现非零值为 `unsupported-payload`。
- **M2ID：** 严格解析 ID 列表，计数与长度受限；供 06 解析机型到 MODL 条目。
- **结构限值：** 按 spec 的限值表在分配与遍历之前判定，超限为 `limit-exceeded`，限值名为 `payloadEntryBytes`、`payloadItems` 或 `textBytes`。
- **错误：** 在 `SourceErrorCode` 追加 `invalid-payload`、`unsupported-payload` 与 `subresource-mismatch`，在 `SourceLimitName` 追加三个结构限值名；扩展 [source-error.test-support.ts](../../../../../src/original-data/source-error.test-support.ts) 的位置语法 oracle，使其接受 `archive:/路径#ID` 后接 `/名称[下标]…` 的结构路径。诊断不回显字节、名称或数值。
- **合成样本：** 计划新增 `original-data/formats/` 的 test-support，用 `ByteWriter` 生成带重定位表的合成 SCCT、SCEN 与 M2ID 数据块，并用 `buildImfat` 组成合成 `SCENARIO.NOB` 与 `SR.NOB`；名称包含 `MARKER`。08、09、10、12 复用。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)中新增 `original-data/formats/` 的说明。

## 不包含

- 转换为规范 payload、机型绑定与预算（06、09）；来源映射与子资源核验（08）。
- 读取文件或封包：解析器只接收 `ArchiveEntryRead` 形状的输入，读取由 09 经 `VerifiedSource` 完成。

## 关键文件与契约

- **修改：** [source-error.ts](../../../../../src/original-data/source-error.ts)（追加错误码与限值名）；[source-error.test-support.ts](../../../../../src/original-data/source-error.test-support.ts)（位置语法）。
- **复用：** [archive-reader.ts](../../../../../src/original-data/archive/archive-reader.ts) 的 `ArchiveEntryRead`（类型导入）；[synthetic.ts](../../../../../src/original-data/synthetic.ts) 的 `ByteWriter`、`buildImfat`；[slice-definition.ts](../../../../../src/content/slice-definition.ts) 的候选。
- **计划新增：** `src/original-data/formats/` 下的数据块读取工具、SCCT/SCEN/M2ID 解析器、相邻测试与 test-support。

## 验收标准

- [x] AC-03（解析部分）：合成样本覆盖多组 SCCT 中按候选选择 SCEN、非对齐指针、无序重定位、段 1 与成员数组别名（只生成一份并合并来源标记）、种类为 0 的模板、规则输入 0 为 null、有符号字段负值保留、无符号字段最高位为 1 时保留为正数、AI 掩码、多个候选名称与僚机记录；生成矩形、放置矩形与锚点、AI 目标、成员回指；成员重复、两个编组共用同一布局、`spawnCount`、布局第 0 个元素交换 y/z 而其余不变；名称备用池；头部扇区数与 `gridSpacing` 负值，逐字段断言。
- [x] AC-04（解析部分）：越界或未登记的指针（含各记录指针字段与段 5、段 6 的指针）、多比特种类、非有限坐标或布局、非 ASCII 或无 NUL 的名称、头部扇区数为 0、段 6 表后计数字不在数据块内、M2ID 越界都为 `invalid-payload`；候选槽位超出范围为 `subresource-mismatch`；每个“非默认即不支持”的位置单独一例为 `unsupported-payload`，并按 spec 的 AC-04 另为扇区数不等或过大、指针目标结构不符、成员回指不一致、事件触发含配对或不是第一个元素、段 6 项未引用或为空、表后计数字大于 0、段 5 运行时字段非零、模板或成员不是段 1 记录的别名、僚机指针或空间字段非零各构造一例；各结构限值恰好等于上限时通过，超出 1 个单位为 `limit-exceeded`，且不按声明规模分配。
- [x] 每个错误位置都通过扩展后的位置语法 oracle，诊断不含 `MARKER`、名称或数值（AC-13）。
- [x] `pnpm exec vitest run src/original-data tools/engineering-boundaries.test.ts`、`pnpm typecheck` 与 `pnpm lint` 通过；P2-03 的既有错误码与位置测试保持通过。

## 验证方法

- 表驱动 Node 测试，按 code、位置与限值断言；分配防护以超大声明计数不触发分配为断言依据。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不适用 browser-testing。

## 完成证据

- **实现：**
  - [payload-block.ts](../../../../../src/original-data/formats/payload-block.ts)：重定位安全读取、数组与名称限值、两步指针判定、数值字段的重定位重叠检查；
  - [object-record.ts](../../../../../src/original-data/formats/object-record.ts)：132 字节记录；
  - [scen.ts](../../../../../src/original-data/formats/scen.ts)：`parseScenario`；
  - [scct.ts](../../../../../src/original-data/formats/scct.ts)：`parseCampaignTable`；
  - [m2id.ts](../../../../../src/original-data/formats/m2id.ts)：`parseModelIdList`；
  - [source-error.ts](../../../../../src/original-data/source-error.ts)：三个错误码与三个限值名；
  - [source-error.test-support.ts](../../../../../src/original-data/source-error.test-support.ts)：位置语法接受 `#ID` 后的 `/名称[下标]` 结构路径；
  - [import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts)：按类型穷举的错误码与限值名清单随之更新。

  `ParsedScenario` 与 `ParsedCampaignTable` 使用 `content/logic` 的声明、编组与矩形类型；测试证明解析结果加上 campaign、coordinates、references 与 mapFrame 后能通过 `readMissionContent`。
- **测试：** [formats.test.ts](../../../../../src/original-data/formats/formats.test.ts) 115 个测试通过，使用 [formats.test-support.ts](../../../../../src/original-data/formats/formats.test-support.ts) 的合成数据块：结构位于奇数偏移、重定位表倒序；数值与原版不同，名称带 `MARKER`。覆盖：
  - **正向（AC-03 解析部分）：**
    - 多组 SCCT 中按候选选择 SCEN，也可选其他候选；
    - 段 1 与成员数组别名只生成一个声明并合并来源标记；成员重复；
    - 种类为 0 的模板；规则输入 0 为 null；负数保留；u32 最高位为 1 时保留为正数，上界为 2³²−1；
    - AI 掩码转为升序机型；多个候选名称与名称备用池；生成矩形、锚点、AI 目标与成员回指；
    - 两个编组共用同一布局，`spawnCount` 原样保留；布局只交换第 0 个元素的 y/z；
    - 扇区数与比例，`gridSpacing` 负值与位置原样保留；空段任务；僚机名单。
  - **`invalid-payload`：**
    - 越界或未登记的指针：逐个覆盖记录的五个引用字段、编组的布局、模板与成员指针、成员数组项、布局表项、段指针、形成与路线指针、运行时对象指针、生成配对指针；
    - 与头部重叠的段；段 2 有计数无指针；
    - 重定位落在数值字段或名称内（头部、矩形、布局元素、编组计数、名称），或落在记录内非指针位置与非对齐位置；
    - 引用目标越出数据块（矩形、事件触发）；
    - 多比特种类；非有限位置、布局与比例；比例为 0；扇区数为 0；
    - 非 ASCII、控制字符、空名称与无 NUL 的名称；
    - 编组无布局；布局表后的计数字越出数据块；段 2 触发头部越出数据块。
  - **`unsupported-payload`（逐项）：**
    - 头部 0x0C；扇区数不等，或超过 32767；段 4 的计数与指针；段 2 有指针无元素；
    - 记录的形成与路线指针、+0x38、八个保留字；有指针无名称；
    - 编组运行时计数与对象指针；未被引用或为空的布局；表后计数字大于 0；
    - 模板、成员或布局不是预期结构起点；同一记录被两个编组列出；回指与列出编组不一致或缺失；回指不指向编组；
    - 矩形、锚点、AI 目标、事件触发不是预期结构起点；事件触发含生成配对；
    - 僚机的形成、成员、矩形、锚点、事件触发、AI 目标、位置与网格间距。
  - **`subresource-mismatch`：** 候选组或槽位不在表中。
  - **限值：** 名称池、记录、矩形、编组、成员、布局、布局元素、候选名称数、名称字节，以及 SCCT 组、所选与未选组的槽位、僚机，都在恰好等于上限时通过、超出 1 时为 `limit-exceeded`，限值名、上限与观测值完整。SCEN、SCCT、M2ID 的 `payloadEntryBytes` 在等于上限时通过、超出时在解析前拒绝。超大的声明计数在分配与遍历前拒绝。
  - **隐私（AC-13）：** 每个错误位置都通过扩展后的 `inLocationGrammar`，DTO 与消息都不含 `MARKER`。
- **工程检查：**
  - P2-03 的既有错误码与位置测试保持通过；
  - `pnpm typecheck`、`pnpm lint` 与边界回归通过（`formats/` 只以类型导入封包与光盘模块）；
  - `pnpm check` 通过：100 个测试文件、3073 个测试与生产构建。
- **rubber-duck：** 6 项阻塞全部采纳：
  - 引用目标先按结构大小做边界检查，再判定是否为该结构的起点；
  - 校验 SCCT 每个组的槽位表头与限值；
  - +0x30、+0x4C、编组 +24 与生成配对指针按两步规则判定；段 2 指针与计数须一致；
  - 登记的重定位不得与任何数值字段重叠，顶层数组不得与头部重叠，M2ID 的零指针因此拒绝；
  - 名称最多检查 64 字节；
  - 补齐逐项负向测试。
- **simplify（四个角度）：**
  - **已采纳：**
    - 去掉未使用的 `layoutTail` 偏移与多余的 `size` 字段；`BlockWriter` 改为非导出；
    - 名称一次解码；记录的重定位审核移入 `PayloadBlock.requireRelocations`；
    - AI 掩码用直接循环，布局元素直接读取。
  - **未采纳：**
    - 共用的错误断言 helper：现有测试各有自己的 helper，只在这里新增不能减少重复；
    - 合成封包构建函数：08、09、10、12 会使用；
    - 重定位探测、表序号与数组头的进一步抽象：规模有界，逻辑集中。
- **文档影响：** 已在[源码结构](../../../../engineering/source-structure.md#任务数据的定向解析)新增“任务数据的定向解析”一节，并在目录树中加入 `formats/`。工程约定、工具指南与 STATUS 无需更新：没有新命令或检查规则。
