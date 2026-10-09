---
type: plan
status: active
phase: P2
task: "06"
subtask: "16"
updated: 2026-10-08
---

# 16 — LE 可执行文件的区域读取

**契约来源：** [spec](../spec.md) 的[效果几何数据](../spec.md#效果几何数据)中“EXE 区域读取”与结构限值；AC-18 的 EXE 部分；错误码中的效果条目。
**依赖：** 14。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。由 2026-10-06 的 spec 修订加入，见 [goal 执行记录](../goal.md#执行记录)。

## 工作范围

- 在 `src/original-data/formats/` 新增 LE 区域读取：
  - 从 MZ 头取 LE 偏移，校验签名、字节序与字序、页大小、对象表、页映射与修正页表；
  - 按对象序号、对象内偏移与长度读出区域，输出为独立副本；
  - 越出对象、跨入不由文件页支持的部分、与修正记录的目标位置重叠，都报 `invalid-payload`；
  - 对象数、页数与区域长度先于分配检查，超出报 `limit-exceeded`（`executableObjects`、`executablePages`、`executableRegion`）。
- 在 [source-error.ts](../../../../../src/original-data/source-error.ts) 追加 spec 的六个效果限值名。
- 在 [synthetic.ts](../../../../../src/original-data/synthetic.test-support.ts) 新增代码生成的合成 LE 文件：MZ 头、LE 头、对象表、页映射、修正页表与修正记录，可指定对象内容与修正位置。
- 原版格式的结构写入 [executable](../../../../original/formats/executable.md) §1（只记结构）。

## 不包含

- 区域 locator（15）、效果 payload（17）与步骤（18）。

## 关键文件与契约

- 新增 `src/original-data/formats/le-executable.ts` 及其测试；修改 `source-error.ts`、`synthetic.ts`。
- 测试只用合成 LE 文件，不读取原版 EXE。

## 验收标准

- [x] AC-18（EXE）：合成 LE 文件上读出的区域与输入逐字节相等，输出不共享缓冲。
- [x] 签名、字序、页大小、对象表、页映射或修正页表越界，区域越出对象、跨入非文件页、与修正重叠，都报 `invalid-payload`；对象数、页数或区域长度超限报 `limit-exceeded`，限值名正确，只读计数即拒绝。
- [x] 本地对原版 EXE 运行读取，计划的全部区域都通过，且与修正不重叠（证据只记计数与判定）。
- [x] `pnpm check` 通过。

## 验证方法

- Node 表驱动测试；本地只读脚本（被忽略的 `local/research/p2-06/`）。
- 完成前按 execute-goal 做 rubber-duck 与 simplify。

## 完成证据

2026-10-06 完成。

- **实现：**
  - [le-executable.ts](../../../../../src/original-data/formats/le-executable.ts) 的 `openLeExecutable(file, path)` 接收 `ByteSource`。打开时依次读取 MZ 头与 LE 头，对象数与页数先于后续读取检查；对象表、页映射与修正页表随后并行读取。
  - `readRegion` 按页映射定位存储页，按页映射序号取修正记录。每页的修正记录只解析一次并缓存；结果为新的独立缓冲。
  - 修正记录按源类型 {0:1, 2:2, 3:4, 5:2, 6:6, 7:4, 8:4} 计算改写字节，支持列表形式、加数与导入目标的各种宽度。保留位、保留目标标志、偏移类型上的别名标志与未知源类型一律 `invalid-payload`。
  - [source-error.ts](../../../../../src/original-data/source-error.ts) 追加六个效果限值名，[import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts) 同步。
  - [synthetic.ts](../../../../../src/original-data/synthetic.test-support.ts) 新增 `syntheticLeExecutable` 与 `leInternalFixup`。
  - [executable §1](../../../../original/formats/executable.md) 补充 LE 结构表（只记结构）。
- **AC-18（EXE）：** [le-executable.test.ts](../../../../../src/original-data/formats/le-executable.test.ts) 共 37 个测试，全部只用合成 LE 文件：
  - 跨页、跨对象的区域与输入逐字节相等；修改一次结果不影响下一次读取。
  - 页映射重排（存储顺序与映射顺序不同）时按映射找页，修正按映射序号归属。
  - 修正字节的首、尾与整体重叠都拒绝，紧邻修正的区域通过。列表形式与从前一页跨入的记录都参与判断，跨页记录在两侧页都拒绝。
  - 七种源类型的改写长度逐一验证：每条被测记录前放置加数、8 位序号导入与按名导入记录，任一长度算错都会错位。
  - 三种保留标志、12 种头部与表越界（签名、字序、页大小、末页、五个表偏移、页数越出文件）、对象不存在、越出对象、未存储的尾部与非文件页，都报 `invalid-payload`。
  - 对象数 0 或 9、页数 1,025 报 `limit-exceeded`，限值名、上限与观测值正确，且只读过两个头部（`reads === 2`）。区域长度 65,537 在读取之前报 `executableRegion`。
  - 同一页上的两个区域只读取一次修正记录。
- **本地检查：** 被忽略的 `local/research/p2-06/exe-regions.ts` 用生产读取器对本地原版 EXE 运行：4 个对象；计划的 28 个区域全部通过且与修正不重叠；16 个指令操作码与预期一致；3 处为短推入形式（留给 18 决定表示方式）。输出只记计数与判定。
- **Rubber-duck：** 无阻断项。3 个非阻断项已修复：修正标志校验更严格（保留位、别名标志），测试补强（全部源类型、跨页记录、只读计数），§1 补充结构表。
- **Simplify（4 路）：**
  - 已采纳：
    - 改用已有的 `ByteSource` 端口，删除重复的 `ExecutableFile`；
    - 三张表并行读取；
    - 每页修正记录缓存，并加测试；
    - 去掉内部对象的冻结，页内边界按页起点计算一次；
    - 合成构建的存储顺序改为单次遍历；
    - 测试改用 `PAGE` 常量、`leInternalFixup(-2)` 与 `expectInvalid`。
  - 未采纳：
    - `counted`/`viewOf` 与 mesh 等读取器重复：各读取器的私有小工具是现有模式，抽取会改动无关模块；
    - 合成构建复用读取器的页大小：合成数据保持为独立的对照；
    - 测试改用 `sourceFailure`：它校验 P2-03 的位置语法，不含 P2-06 的效果位置；
    - 合并物理连续的数据读取：区域小，复杂度不值得。
- **文档：** [source-structure](../../../../engineering/source-structure.md) 增加 LE 区域读取与合成 LE 构建的说明。
