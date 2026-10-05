---
type: plan
status: active
phase: P2
task: "03"
subtask: "02"
updated: 2026-10-05
---

# 02 — 封包格式规则、错误类型与内存解析

**契约来源：** [spec](../spec.md) 的 S-01、S-02（规则部分）、S-09（结构限值）、S-10、S-12（合成封包）；[支持的封包格式](../spec.md#支持的封包格式)、[限值与预算](../spec.md#限值与预算)、[错误码](../spec.md#错误码)；AC-01、AC-02（重定位规则）、AC-03（共用样本）、AC-10（封包诊断）。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **错误类型：** 新增 P2-03 的封闭错误码集合与错误类，DTO 与 `DiscReadError` 相同，为 `{ code, location, reason, limit }`。
  - code 为 spec 列出的 11 个；`limit` 为 `{ name, limit, observed }` 或 null，限值名为 `archiveEntries`、`entryBytes`；
  - `reason` 只用固定的安全文本，可结构化克隆；
  - 错误模块是不导入其他模块的叶子，供封包与来源模块共用。
- **格式规则：** 新增纯规则模块，对字节做如下校验：
  - **文件头：** 长度、8 字节魔数、版本、条目数（`n ≥ 1`，超过 4,096 时 `limit-exceeded`）、第一个数据块偏移公式，以及 `L ≥ 24 + 36n`。
  - **目录：** 按目录顺序检查每一项：保留字、类型标签语法、ID 大于基数且严格递增、`1 ≤ size`（超过 4,194,304 时 `limit-exceeded`）、`relocationCount ≤ ⌊size/4⌋`、连续偏移、跨度在 `L` 内；全部通过后检查尾随字节。`flags` 原样保留。
  - **重定位：** 按表顺序检查位置在块内、存储的指针不超过 `size`；全部通过后，检查排序后的重叠，报告规则与 spec 一致。允许非对齐与无序位置。
  - **算术：** 所有比较都用安全整数减法，不依赖 `DataView` 异常。
  - **位置：** 按 spec 的语法生成（`archive`、`[i]`、`#ID`、`#ID.relocations[k]`），可带 `:/路径` 前缀；只回显通过语法的类型标签。
- **内存解析：** [imfat.ts](../../../../../src/original-data/imfat.ts) 的 `parseImfat` 与条目辅助函数改用上述规则与错误码，`ImfatEntry` 形状保持不变。若改名或移动导出，须同步 [nob-list](../../../../../tools/nob-list.ts)、[nob-check](../../../../../tools/nob-check.ts) 与测试，研究工具的输出不含新增的原版内容。
- **合成样本：**
  - 扩展 [synthetic.ts](../../../../../src/original-data/synthetic.ts)，可构造任意覆写文件头、保留字、原始类型标签字节、偏移、尾随字节与块内指针值的合成封包；
  - 新增共用的正负样本表，每条为 `(名称, 字节, 期望目录/重定位或期望 code 与位置)`，供本子任务与 03 的一致性测试使用。

## 不包含

- 在 `DiscFile` 上的按需读取、读取日志、预算与取消（03）。
- 版本白名单、识别、来源句柄与映射核验（04–06）；边界规则（07）。
- payload 解析器（`payloads.ts`）的任何改动。

## 关键文件与契约

- **计划新增：**
  - `src/original-data/source/source-error.ts`：P2-03 错误码、DTO 与错误类（名称可由实现调整，须保持叶子模块）；
  - `src/original-data/archive/imfat-rules.ts`：文件头、目录与重定位规则及限值常量；
  - `src/original-data/archive/archive.test-support.ts`：共用正负样本表；
  - 相邻的 `*.test.ts`。
- **修改：** [imfat.ts](../../../../../src/original-data/imfat.ts)、[imfat.test.ts](../../../../../src/original-data/imfat.test.ts)、[synthetic.ts](../../../../../src/original-data/synthetic.ts)，以及按需修改 [nob-list](../../../../../tools/nob-list.ts)、[nob-check](../../../../../tools/nob-check.ts)。
- **文档：** [源码结构](../../../../engineering/source-structure.md)的目录树与新增的封包读取说明。

## 验收标准

- [x] AC-01（内存解析）：
  - **正向：** 与基准同形的合成封包解析正确，`flags` 任意值原样保留；样本包含 1–4 字符的标签（含数字与全数字标签）、非固定步长的 ID，以及等于基数 + 1 的首项 ID。
  - **负向：** spec AC-01 列出的每一项都在预期位置返回 `invalid-archive`。
  - **限值：** 条目数 4,096 与数据块 4,194,304 字节通过，再多 1 个单位返回 `limit-exceeded`；u32 最大值不引起不安全算术或宿主异常。
- [x] AC-02（重定位规则）：
  - 非对齐与无序位置通过，指针等于 0 或 `size` 通过；
  - 位置等于 `size - 3` 或 u32 最大值、指针等于 `size + 1`、位置重复、位置相差 1–3，都返回 `invalid-entry`；
  - 报告的重定位序号符合排序后第一对重叠的规则。
- [x] AC-03（样本）：共用样本表覆盖上述正负情况，内存解析对每条给出期望结果。
- [x] AC-10（封包部分）：非法类型标签与块字节中植入的标记不出现在 DTO 中；DTO 可结构化克隆，code 属于封闭集合。
- [x] 既有 `imfat`、`payloads`、`source-mapping` 测试保持通过（必要时只按新规则调整合成样本）；`nob-list`、`nob-check` 通过类型检查。
- [x] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 表驱动 Node 测试，按 code、location 与 limit 断言，不比较错误消息文本；测试只导入允许的模块。
- 不适用 browser-testing；基准盘上的规则验证由 09 完成。

## 完成证据

- **实现：**
  - [source-error.ts](../../../../../src/original-data/source-error.ts)：封闭的 11 个错误码、`SourceError` 与 DTO，限值名为 `archiveEntries`、`entryBytes`。它是叶子模块；为避免 `archive/` 与 `source/` 互相依赖，放在 `original-data` 根目录，而不是计划中的 `source/`。
  - [imfat-rules.ts](../../../../../src/original-data/archive/imfat-rules.ts)：`readImfatHeader`、`readImfatDirectory`、`readImfatRelocations` 按 spec 顺序校验；位置只能由 `DiscPath | null` 生成；`ImfatEntry` 定义在这里。
  - [imfat.ts](../../../../../src/original-data/imfat.ts)：`parseImfat`、`entryData`、`entryRelocations` 改用上述规则，`ImfatEntry` 原样再导出。辅助函数只接受从同一字节数组解析出的条目，否则返回 `invalid-request`（研究用的内存接口，不属于产品入口）。最初的位置为 `request.entry`，已由 [12](./12-location-grammar.md) 改为 spec 语法中的 `request.id`。
  - 研究工具的源码无需修改。
- **样本：** [archive.test-support.ts](../../../../../src/original-data/archive/archive.test-support.ts) 的 `ARCHIVE_SAMPLES` 包含：
  - **正向：** 与基准同形的样本（1–4 字符标签、全数字标签、任意 `flags`、非固定步长 ID、非对齐且无序的重定位、指针 0 与 `size`），4,096 条目，以及 4,194,304 字节的数据块；
  - **负向：** spec AC-01 的全部文件头与目录项，含 u32 最大值，以及 4,097 条目与 4,194,305 字节的上限；AC-02 的重定位位置、指针、重复与相差 1–3 字节；
  - **多错误：** 9 个样本，每个在任何其他检查顺序下都会报告不同的 code 或位置，用来固定报错优先级。
- **测试：** [imfat.test.ts](../../../../../src/original-data/imfat.test.ts) 逐条驱动样本表，按 code、位置与 limit 断言。另外覆盖：
  - 冻结结果与块视图；
  - 同布局的另一份字节被拒绝；
  - 全部失败的 DTO 可结构化克隆且冻结，不含块内标记与非法小写标签。
- **变异检查：** 以下改动都使测试失败，恢复后全部通过：
  - 重叠距离判定由 `< 4` 改为 `< 1`；
  - 去掉第一个保留字检查；
  - 重叠时报告前一个序号。
- **本地快速核对：** `nob-list` 对 7 个安装目录的 NOB 退出码为 0，`nob-check` 对 7 个文件均为 0 失败。只看结论，正式证据在 09。
- **检查：**
  - `pnpm exec vitest run src/original-data`：13 个文件、512 个测试通过；
  - `pnpm check`：80 个测试文件 2,156 个测试与构建通过；eslint 通过。
- **Rubber-duck（无阻塞问题）：** 采纳三项：
  - 条目绑定到所解析的字节；
  - 增加多错误样本固定报错顺序；
  - 位置只接受 `DiscPath | null`。
- **Simplify：**
  - 采纳：类型标签检查复用 `matchesWhole`；错误模块移到根目录；所有权改为以字节为键的 `WeakMap`，条目不会让整份封包常驻；重叠检查改用 `Float64Array` 的原生数值排序；收窄 test-support 的导出，去掉别名，4,096 条目只构建一次，增加失败 helper。
  - 未采纳：与 `DiscReadError` 抽公共基类（需要修改 P2-02 代码）；复用 disc 的异步测试 helper；延迟构建 4 MiB 样本（只影响测试内存）；把辅助函数改为绑定方法（会改变工具接口）。
- **文档影响：** 更新[源码结构](../../../../engineering/source-structure.md#封包读取)的目录树与“封包读取”一节。[工具指南](../../../../guides/tools.md)中 `nob-list`/`nob-check` 的描述仍然准确，工程约定无受影响规则。

