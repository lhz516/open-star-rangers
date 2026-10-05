---
type: plan
status: active
phase: P2
task: "02"
subtask: "02"
updated: 2026-10-04
---

# 02 — CloneCD 文件组与描述解析

**契约来源：** [spec](../spec.md) 的 S-01、S-02、S-10（输入尺寸限值）、S-11、S-12；[支持布局](../spec.md#支持布局)中的文件组、`.ccd` 文本与布局值；[限值与预算](../spec.md#限值与预算)；AC-01、AC-02、AC-03（镜像大小部分）、AC-07（打开前取消）、AC-08（诊断隐私）。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **文件组配对：** 输入为 `{ name, source }` 列表，最多 4 个文件。
  - 必须恰有一个 `.ccd` 和一个 `.img`，扩展名与主名都不区分大小写，主名不能为空且必须相同。
  - 同主名的 `.sub`、`.cue` 各最多一个，可以出现但从不读取。
  - 其他情况返回 `unsupported-file-set`，且不发生读取。宿主文件名只用于配对，不进入结果或诊断。
- **打开前快照：** 复制输入列表、端口引用、源长度和预算配置，之后修改调用者容器不影响句柄。
- **输入尺寸检查**（在任何读取前完成）：
  - 源长度必须是非负安全整数，否则返回 `invalid-range`；
  - `.ccd` 为 1–65,536 字节；
  - `.img` 长度必须是 2352 的整数倍，且扇区数在 18–449,850 之间。
  - 超出上限返回 `limit-exceeded`，长度不是 2352 的整数倍返回 `image-size-mismatch`。
- **默认预算：** `sourceReadBytes` 上限等于 `.ccd` 与 `.img` 的字节数之和；调用方的限值高于该上限时返回 `limit-exceeded`。打开前检查取消。
- **`.ccd` 解析：**
  - 文本须为可打印 ASCII，无 BOM，行尾为 LF 或 CRLF，只有 `[节]`、`键=值` 行和空行；节名与键名区分大小写；数值必须是完整的十进制或 `0x` 十六进制安全整数。
  - 只允许 `[CloneCD]`、`[Disc]`、`[Session 1]`、连续编号的 `[Entry n]` 与 `[TRACK 1]`。
  - 已知节中的未知键忽略，其值不解释。
  - 重复的节或键、缺少或非法的必需键、条目编号不连续或数量与 `TocEntries` 不符，都是 `invalid-descriptor`。
- **布局校验：**
  - TOC 恰为点 `0xa0`/`0xa1`/`0xa2`/`0x01` 各一个，均属于会话 1，ADR 为 1，控制字在 0–15 内且含数据轨位。
  - 首轨与末轨以 `PMin=1` 检查，不把 `0xa0`/`0xa1` 的 `PLBA` 当作地址。
  - `0x01` 的 `PLBA=0`；`0xa2` 的 `PLBA` 等于 `.img` 扇区数，否则为 `image-size-mismatch`。
  - `MODE=1`、`INDEX 1=0`，且没有其他 INDEX 键。
  - 其余不支持的布局返回 `unsupported-layout`。
- **诊断位置：** 只回显白名单内的节与键，未知或畸形的节/键只给行号。
- **合成构建器：** 扩展 [synthetic.ts](../../../../../src/original-data/synthetic.ts)，可生成与基准盘同形的合成描述，并为各个负向用例逐字段变异。

## 不包含

- 卷描述符及根目录的读取与校验（03），目录与文件读取（04、05）。
- 读取 `.sub`/`.cue`、BIN/CUE 或其他镜像格式（P5）。

## 关键文件与契约

- **计划新增：** `src/original-data/disc/clone-cd.ts`（文件组配对与描述解析）、`src/original-data/disc/disc-image.ts`（打开入口：本子任务做到描述与镜像大小，03 再接入卷），以及相邻 `*.test.ts`。
- **依赖：** 01 的端口、受控读取与错误 DTO；[synthetic.ts](../../../../../src/original-data/synthetic.ts)。

## 验收标准

- [x] AC-01：
  - 含同主名、扩展名大小写不同的 `.sub`/`.cue` 的合法文件组可以通过配对，读取日志显示 `.sub`/`.cue` 读取 0 字节；
  - 缺少 `.ccd` 或 `.img`、任一扩展名重复、空主名、主名不一致、含其他文件、超过 4 个文件、只有 `.cue` 加 `.img` 时，都返回 `unsupported-file-set`，且不发生读取；
  - 宿主文件名中的标记不出现在诊断里。
- [x] AC-02：
  - LF 与 CRLF 的合法描述都通过，已知节中的未知键被忽略；
  - 每个 `unsupported-layout` 与 `invalid-descriptor` 用例都返回预期的 code 与安全位置，每个必需字段都有缺失回归；
  - 描述 65,536 字节通过尺寸门禁，65,537 字节在读取前返回 `limit-exceeded`；
  - 未知节/键中的标记不被回显。
- [x] AC-03（大小部分）：长度不是 2352 整数倍、或扇区数与 lead-out 不符，返回 `image-size-mismatch`；扇区数 17 与 449,851 返回 `limit-exceeded`，18 与 449,850 通过尺寸门禁。端口只报告大小，不分配整个镜像。
- [x] AC-07/AC-08（打开部分）：打开前取消返回 `cancelled` 且不发生读取；默认上限等于输入总量，限值高于上限返回 `limit-exceeded`；修改调用者的输入列表或预算配置不影响已打开的状态。
- [x] `pnpm exec vitest run src/original-data` 与 `pnpm typecheck` 通过。

## 验证方法

- Node 表驱动测试，使用 01 的记录日志端口和只报告大小、不分配内容的合成端口。
- 不适用 browser-testing 或原版对照。

## 完成证据

- **实现：**
  - [clone-cd.ts](../../../../../src/original-data/disc/clone-cd.ts) 的 `openCloneCd` 依次执行：
    1. 配对：用 P2-01 的 `readArray`/`readRecord` 读取文件记录，不执行访问器；最多 4 个，扩展名与主名不区分大小写；`.sub`/`.cue` 连长度都不读取。
    2. 快照两个源的长度，并以无访问器方式读取选项记录（限值与取消探针）。
    3. 尺寸门禁：`.ccd` 1–65,536 字节；`.img` 必须是 2352 的整数倍，且为 18–449,850 个扇区。
    4. 上限：默认 `sourceReadBytes` 为输入总量，调用方限值高于它时返回 `limit-exceeded`（`limits.sourceReadBytes`）。
    5. 计量读取整个 `.ccd`，再按“语法与必需键 → 支持布局 → lead-out 与扇区数”的顺序检查。
  - 诊断位置只回显白名单内的节与键，例如 `descriptor[Entry 2].PLBA`；坏行、重复项与未知节都只给 `descriptor:line N`。
  - [disc-image.ts](../../../../../src/original-data/disc/disc-image.ts)：`openDiscImage` 返回冻结句柄，含冻结的 `volume.sectorCount` 与 `usage()`；03 再接入卷描述符。
  - 在 [source-reader.ts](../../../../../src/original-data/disc/source-reader.ts) 中补充：
    - `readCancellation`：打开时要求探针给出布尔值 `aborted`，并保留实时引用；
    - 失败即关闭：之后的检查中，探针抛错或不再报告 `false` 时一律视为已取消，其异常文本不进入诊断。
  - 采用的实现选择（spec 未逐项规定，均属已批准契约的细化）：
    - `[Entry n]` 须按 0..n−1 的顺序出现；`[Entry 01]` 这类非规范名视为未知节；
    - 十进制允许前导零，十六进制须以小写 `0x` 开头；最后一行可以没有行尾；
    - `[TRACK 1]` 中除 `INDEX 1` 外的 `INDEX ` 键按行号报 `unsupported-layout`；
    - 0 字节的 `.ccd` 报 `limit-exceeded`（limit 1）；
    - 非法取消探针或选项报 `invalid-record`，位置为 `cancellation`/`options`。
  - [synthetic.ts](../../../../../src/original-data/synthetic.ts) 新增 `cloneCdSections`/`cloneCdText`：与基准盘同形（节、键、CRLF、十六进制 Point/ADR/Control），数值由扇区数生成；0xa0/0xa1 的 PLBA 按公开格式由 MSF 推导，不是地址。
- **测试：**
  - [clone-cd.test.ts](../../../../../src/original-data/disc/clone-cd.test.ts)、[disc-image.test.ts](../../../../../src/original-data/disc/disc-image.test.ts)，以及共用的纯测试辅助 [disc.test-support.ts](../../../../../src/original-data/disc/disc.test-support.ts)（标记、首个错误、隐私与 plain data 检查）；[source-reader.test.ts](../../../../../src/original-data/disc/source-reader.test.ts) 改用该辅助。
  - AC-01：
    - 名称大小写混合的四文件组可以打开，`.sub`/`.cue` 用一碰即失败的端口证明从未触及；
    - 12 种错误文件组（含空集、只有 `.cue` 加 `.img`、5 个文件）及 6 种畸形输入（非数组、空记录、名称非文本、缺源、稀疏列表、抛出标记的访问器）全部返回 `unsupported-file-set@files`，且没有任何读取；
    - 宿主文件名中的标记不进入诊断。
  - AC-02：
    - LF、CRLF 与无结尾行尾都可以打开；已知节中的未知键、未用字段及 0xa0/0xa1 的 PLBA 被忽略；
    - 12 种语法错误按行号报告：BOM、非 ASCII、Tab、孤立 CR、坏行、空键名、坏节头、节前键、重复节、重复键、重复未知键、条目乱序；
    - 12 种不完整或不安全的数值；4 个必需节缺失；22 个必需键逐一缺失；`TocEntries` 偏多或偏少；
    - 13 种按键定位的 `unsupported-layout`：版本、会话数、加扰、条目会话、ADR、音轨控制字、越界控制字、重复点、首轨、末轨、pregap、MODE2、`INDEX 1`≠0；
    - 额外 TOC 点、缺少轨 1 点，以及 `INDEX 0`、第二轨、第二会话、未知节（后四项按行号）；
    - 报错优先级：语法先于布局，布局先于 lead-out；
    - 65,536 字节可以打开，65,537 字节在读取前返回 `limit-exceeded`。
  - AC-03（大小部分）：
    - 非 2352 整数倍返回 `image-size-mismatch@image`，且不发生读取；
    - 17 与 449,851 扇区返回带 limit/observed 的 `limit-exceeded`；18 与 449,850 扇区可以打开，镜像端口只报告大小、读取日志为空；
    - lead-out 不符返回 `image-size-mismatch@descriptor[Entry 2].PLBA`。
  - AC-07/AC-08（打开部分）：
    - 默认上限等于输入总量；上限本身通过，再多 1 字节在读取前返回 `limit-exceeded`；
    - 限值恰为 `.ccd` 大小时通过，少 1 字节在读取前返回 `budget-exceeded@descriptor`；
    - 坏预算记录保留 P2-01 code/path；6 种非法取消探针与 4 种非法选项返回 `invalid-record`；`AbortSignal` 可用；
    - 打开前取消返回 `cancelled` 且不读取；
    - 调用后立即修改文件列表与预算对象，不影响已打开状态；
    - 文件组错误先于尺寸，尺寸先于描述语法；探针后来抛错或不再是布尔值时，失败即关闭。
- **变异检查：** 依次禁用 lead-out、未知节、空主名、条目顺序、数据轨控制位、额外 INDEX 共 6 处检查，每处都有测试失败。检查后已恢复原代码。
- **检查：**
  - `pnpm exec vitest run src/original-data` 通过；
  - `pnpm check`：typecheck、lint、71 个测试文件共 1841 项测试、build 均通过；
  - `pnpm check:original` 通过，0 findings。
- **Rubber-duck：**
  - 已修复：取消探针未做结构校验（`{}`、`{aborted: 0}` 可以打开，抛错的 getter 会泄漏宿主文本），null 选项抛出原始 TypeError → 增加 `readCancellation`、无访问器读取选项和失败即关闭；
  - 已修复：重构测试时丢掉了结构化克隆断言 → 恢复为纯 plain-data 检查；`disc-error.test.ts` 仍做真实的 `structuredClone`。
- **Simplify：**
  - 已应用：配对复用 `readArray`/`readRecord`；文本编码复用 `ByteWriter.ascii`；文件数上限由扩展名集合推导；测试辅助不再经 `globalThis` 取宿主 API。
  - 未采纳：
    - 句柄保留 class：用闭包对象会捕获作用域；
    - 测试保留 65,536/18/449,850 等字面量，用来钉住 spec 数值；
    - 逐字符拼接行：输入不超过 64 KiB 且只解析一次；
    - 不把选项类型移出 clone-cd：P5 前只有 CloneCD 一种格式。
- **文档影响：**
  - [源码结构](../../../../engineering/source-structure.md)的目录树已加入 `clone-cd.ts` 与 `disc-image.ts`，职责说明按计划在 07 补充；
  - 不涉及命令、工具用法、原版事实或 U 项。
