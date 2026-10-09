---
type: plan
status: active
phase: P2
task: "02"
subtask: "03"
updated: 2026-10-08
---

# 03 — 原始扇区与 ISO9660 卷

**契约来源：** [spec](../spec.md) 的 S-03、S-04、S-11、S-12；[支持布局](../spec.md#支持布局)中的扇区与卷；AC-03（扇区部分）、AC-04。
**依赖：** 01, 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **原始扇区读取：** 镜像扇区 n 即 LBA n，用户数据取扇区内 `[16, 2064)`。每个被读取的扇区都校验：
  - 12 字节标准同步字；
  - MSF 每个半字节为合法 BCD，秒 < 60、帧 < 75，且绝对帧号等于 LBA + 150；
  - 模式字节为 1。

  失败返回带 LBA 的 `invalid-sector`。不校验 EDC/ECC，未读取的扇区不影响结果。
- **卷描述符序列：** 从 LBA 16 读到终止符，最多 16 个描述符，终止符须位于 LBA 16–31 内。
  - 每个描述符的标识须为 `CD001`、版本为 1。
  - 引导（0）、补充（2）、分区（3）描述符可在主卷前后出现，均跳过。
  - 终止符前须恰好有一个主卷描述符（1）。缺少或重复主卷、未知类型、缺少终止符都返回 `invalid-volume`。
- **主卷校验：**
  - 逻辑块为 2048 字节；
  - 卷空间包含整个描述符序列，且不超过镜像扇区数；
  - 卷集大小与序号均为 1，文件结构版本为 1；
  - 卷空间、卷集大小、卷序号、逻辑块大小、路径表长度这几个字段的双端序副本一致。
  - 只校验路径表长度字段，不读取路径表。
- **根目录记录：**
  - 结构须合法：34 字节，标识为单字节 0，带目录标志，不使用不支持的特性；extent、数据长度与卷序号的双端序一致；长度与 extent 在卷空间内。结构或范围无效返回 `invalid-volume`。
  - 长度合法但超过 65,536 字节时返回 `limit-exceeded`。
- **接入打开流程：** `disc-image.ts` 的打开流程接入卷校验。打开成功只读取 `.ccd` 与卷描述符所在扇区，返回冻结的卷信息 `{ sectorCount, volumeSectors }`。
- **合成构建器：** 扩展 [synthetic.ts](../../../../../src/original-data/synthetic.test-support.ts)：增加大端或双端序写入；生成原始扇区（含头部）与卷描述符序列；提供按需生成扇区的超大镜像端口，不分配整个镜像。

## 不包含

- 目录记录遍历与路径解析（04），文件范围读取（05）。
- Joliet、Rock Ridge、XA 等扩展语义，以及路径表读取（spec 不包含）。

## 关键文件与契约

- **计划新增：** `src/original-data/disc/raw-sector.ts`、`src/original-data/disc/iso9660-volume.ts`，以及相邻 `*.test.ts`。
- **修改：** 02 新增的 `src/original-data/disc/disc-image.ts`（打开流程）；[synthetic.ts](../../../../../src/original-data/synthetic.test-support.ts)（`ByteWriter` 增加大端或双端序写入，并加入扇区与卷构建器）。

## 验收标准

- [x] AC-03（扇区部分）：同步字、地址、非法 BCD 半字节、秒/帧越界、模式被破坏，都返回带 LBA 的 `invalid-sector`；被破坏但未被读取的扇区不影响打开。
- [x] AC-04：
  - 每个 `invalid-volume` 用例都通过：缺少终止符、主卷缺少或重复、未知类型、标识或版本错误、逻辑块不是 2048、卷空间越界或小于描述符序列、卷集或文件结构版本不符、每个规定双端序字段逐一不一致、根目录结构或范围无效；
  - 根目录长度合法但超限返回 `limit-exceeded`；
  - 引导与补充描述符位于主卷前后都能打开；
  - 读取日志中没有路径表扇区。
- [x] 合法打开时，`.img` 的读取日志只包含卷描述符扇区；卷信息冻结且可结构化克隆。
- [x] `pnpm exec vitest run src/original-data` 与 `pnpm typecheck` 通过。

## 验证方法

- 表驱动 Node 测试，用合成构建器逐字段变异，按 code、LBA 与 location 断言，并检查读取日志。
- 不适用 browser-testing 或原版对照。

## 完成证据

- **实现：**
  - [raw-sector.ts](../../../../../src/original-data/disc/raw-sector.ts)：`readSectors` 先校验 LBA 与扇区数为安全整数，再用一次端口请求读取连续原始扇区。逐个检查同步字、BCD MSF（每个半字节、秒 < 60、帧 < 75，且绝对帧号等于 LBA+150）与模式字节，返回 `[16, 2064)` 的用户数据视图；错误位置为 `image:lba N`。
  - [iso9660-record.ts](../../../../../src/original-data/disc/iso9660-record.ts)：双端序读取、按字节顺序报告首个结构问题的目录记录解析器（以缓冲长度为界，供 04 共用），以及 `unsupportedFeature` 与安全的 `extentFits`。
  - [iso9660-volume.ts](../../../../../src/original-data/disc/iso9660-volume.ts)：
    - 从 LBA 16 逐个扇区读取卷描述符，最多 16 个，终止符须在 LBA 16–31 内且不超出镜像；跳过类型 0/2/3，主卷恰好一个，并复制其字节（端口可能复用缓冲）；
    - 主卷依次校验：卷空间（双端序、覆盖整个描述符序列、不超过镜像）、卷集大小、卷序号、逻辑块大小、路径表长度（只校验字段）、文件结构版本、根目录记录；
    - 根目录记录须为 34 字节，标识为 0，带目录标志，非关联记录，无不支持特性，长度为 2,048 的正整数倍，extent 在卷空间内；以上失败均为 `invalid-volume`，位置为 `image:lba 16/<字段>`；
    - 根目录合法但超过 65,536 字节时，最后报 `limit-exceeded`（directoryBytes）。
  - [disc-image.ts](../../../../../src/original-data/disc/disc-image.ts)：打开流程接入 `readVolume`，冻结卷信息为 `{ sectorCount, volumeSectors }`。
  - [synthetic.ts](../../../../../src/original-data/synthetic.test-support.ts)：`ByteWriter` 新增大端与双端序写入；新增原始扇区、按需生成扇区的镜像端口（不分配整盘，整扇区直接写入响应）、目录记录、卷描述符与主卷描述符构建器。
  - [disc.test-support.ts](../../../../../src/original-data/disc/disc.test-support.ts)：新增最小卷布局、合成光盘文件组与按扇区解析请求日志的辅助函数。
- **测试：**
  - [raw-sector.test.ts](../../../../../src/original-data/disc/raw-sector.test.ts)（AC-03 扇区部分）：
    - 多扇区一次读取，返回逐扇区用户数据；
    - 同步字首、中、尾字节，模式 0/2，错误地址，非 BCD 分钟，都返回 `invalid-sector@image:lba 17`；
    - 换算后帧数相同但编码非法的三种情况（非 BCD 秒、帧 ≥ 75、秒 ≥ 60）都被拒绝；
    - 未读取的坏扇区不影响结果；非法 LBA 或扇区数在读取前返回 `invalid-range`。
  - [iso9660-record.test.ts](../../../../../src/original-data/disc/iso9660-record.test.ts)：双端序读取；记录过短、奇数长度、三个双端序字段不一致、空标识、标识越界、超出给定末尾或缓冲、非零 padding；10 种特性判断；extent 边界与超大值。
  - [iso9660-volume.test.ts](../../../../../src/original-data/disc/iso9660-volume.test.ts)（AC-04）：
    - 最小卷可以打开，读取日志只有 LBA 16、17，卷信息冻结且可结构化克隆；
    - 引导、补充、分区描述符位于主卷前后时都能打开，并只读取到终止符；
    - 16 个描述符内没有终止符时报 LBA 31，且不再继续读取；镜像先于终止符结束时报最后一个扇区；
    - 主卷缺少或重复、未知类型、标识错误、版本错误都返回 `invalid-volume`；描述符扇区头部损坏返回 `invalid-sector`；
    - 主卷字段：卷空间越界或小于描述符序列、卷集、卷序号、逻辑块、文件结构版本；8 个双端序字段的两份副本分别破坏；
    - 主卷字段先于根记录报告；路径表字段合法时不读取路径表；
    - 根记录：16 种结构、特性与范围错误；隐藏根目录可以打开；65,536 字节通过，67,584 字节返回 `limit-exceeded`。
  - [disc-image.test.ts](../../../../../src/original-data/disc/disc-image.test.ts) 保留句柄冻结与十二维用量形状的检查。
- **变异检查：** 依次禁用 8 处检查（重复主卷、卷空间覆盖、关联标志、文件结构版本、描述符上限、奇数记录长度、padding、空标识），每处都有测试失败。检查后已恢复原代码。
- **检查：**
  - `pnpm exec vitest run src/original-data` 通过；
  - `pnpm check`：首次运行时，与本任务无关的 `tools/compliance/build-plugin.test.ts` 真实构建用例在机器高负载（load average 13–21）下超过 30 秒。该文件单独运行 23 秒通过，重跑完整 `pnpm check` 通过：typecheck、lint、74 个测试文件共 1925 项测试、build；
  - `pnpm check:original` 通过，0 findings。
- **Rubber-duck：** 3 项发现均已修复：
  - `readSectors` 接受小数扇区数：改为读取前先校验安全整数；
  - 主卷文件结构版本在根记录之后才检查：已调到根记录之前，`limit-exceeded` 仍最后报告；
  - 记录解析器只按调用方给出的末尾判断，未以缓冲长度为界：已补充，并加回归测试。
- **Simplify：**
  - 已应用：删除未用的 `HIDDEN_FLAG`；`RecordProblem` 改为模块私有；合成模块与测试辅助改用合成侧的尺寸常量；删掉 `disc-image.test.ts` 中与卷测试重复的断言；`readSectors` 热路径不再每个扇区创建闭包或数组；合成镜像整扇区直接写入响应。
  - 未采纳：合成构建器不导入解析器常量，以保持测试数据与被测代码相互独立；句柄暂不保存 image/root，由 04 在实际使用时加入（否则会被 `noUnusedLocals` 拒绝）。
- **文档影响：**
  - [源码结构](../../../../engineering/source-structure.md)的目录树已加入 `raw-sector.ts`、`iso9660-record.ts`、`iso9660-volume.ts`；
  - 职责说明按计划在 07 补充；不涉及命令、原版事实或 U 项。
