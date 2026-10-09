---
type: plan
status: active
phase: P2
task: "02"
subtask: "04"
updated: 2026-10-08
---

# 04 — 目录遍历与路径解析

**契约来源：** [spec](../spec.md) 的 S-05、S-10（目录限值）、S-11、S-12；[支持布局](../spec.md#支持布局)中的目录、名称匹配与解析目标限制；AC-05、AC-08（记录名称隐私与句柄不受损）。
**依赖：** 03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **共享光盘路径规则：** 把 [source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 中私有的 8.3 路径规则（`DOS_NAME`/`DISC_PATH`）抽成共享读取器，返回品牌化的光盘路径：1–8 段，不自动转大写。来源映射改用它，行为与诊断不变。
- **按路径查找：** 句柄提供查找操作，从根到叶只读取路径经过的目录，返回冻结的条目 `{ path, kind, byteLength, firstSector, sectorCount }`。
  - 目录长度为 2048–65,536 字节的整数倍，每个目录最多 1,024 条记录，超出返回 `limit-exceeded`。
  - 必须扫描完整个目录后才返回结果。
- **目录记录校验：**
  - 记录长度为 0 时，扇区剩余字节须全为 0；否则 `invalid-directory`。
  - 非零记录长度 ≥ 34 且为偶数，不跨扇区；名称长度 ≥ 1；名称与 padding 都在记录内，padding 为 0。
  - extent、数据长度、卷序号的双端序副本一致。
  - `.` 与 `..` 的标识依次为 0 与 1，均为目录，分别指向本目录与已知父目录。
- **名称匹配：**
  - 普通文件只接受合法的终端 `;N`（无前导零，1–32767），剥离后再去掉一个结尾的 `.`。
  - 规范化后须符合共享 8.3 规则，再与请求的段精确比较。
  - 关联文件记录不参与匹配；非 8.3 名称不可匹配，也不导致失败。
  - 可匹配名称重复（含不同版本剥离后撞名）视为目录无效，不任选一条。
- **结构与特性错误：**
  - 目录循环返回 `directory-loop`；中间段是文件、或预期类型不符返回 `wrong-entry-kind`。
  - 解析目标的不支持特性（多段、交错、扩展属性、记录格式/保护标志、非零保留 flag、卷序号不为 1）返回 `unsupported-layout`。
  - extent 用安全算术证明在卷空间内；长度为 0 的普通文件不检查 extent，目录不能为空。
- **失败与隐私：** 查找失败不损坏句柄；诊断位置使用已解析的路径前缀与记录序号或偏移，不回显记录原名。
- **合成构建器：** 扩展 [synthetic.ts](../../../../../src/original-data/synthetic.test-support.ts)，生成多级目录、版本名、非 8.3 兄弟记录、关联文件记录与各种缺陷记录。

## 不包含

- 文件范围读取与按路径打开文件后的读取（05）。
- 目录列举 API 与路径表（spec 不包含）。

## 关键文件与契约

- **计划新增：** `src/original-data/disc/disc-path.ts`（共享路径规则）、`src/original-data/disc/iso9660-directory.ts`，以及相邻 `*.test.ts`。
- **修改：**
  - [source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 改用共享路径规则，现有测试保持通过；
  - `src/original-data/disc/disc-image.ts` 增加查找操作；
  - [synthetic.ts](../../../../../src/original-data/synthetic.test-support.ts) 增加目录构建器。

## 验收标准

- [x] AC-05 正向：多级子目录、合法 `;N` 版本（边界 1 与 32767）与结尾带 `.` 的名称都能解析；非 8.3、非法版本后缀（0、32768、前导零、非数字）的兄弟记录与关联文件记录不妨碍查找。
- [x] AC-05 负向：每类目录缺陷、非法路径、不存在、类型不符、重名、自身或祖先循环、目标的不支持特性及非零保留 flag，都返回预期 code；目标之后出现的坏记录仍导致失败。
- [x] AC-05 限值：65,536 字节的目录和 1,024 条记录的目录分别通过；各超出一个单位时返回 `limit-exceeded`，且不被其他限值先行拦截。
- [x] AC-05 读取日志：`.img` 的读取日志只包含卷描述符扇区与路径经过的目录扇区。
- [x] AC-08（本层）：记录原名中的标记不出现在诊断里；查找失败后，同一句柄的其他查找结果不变。
- [x] 来源映射测试保持通过；`pnpm exec vitest run src/original-data` 与 `pnpm typecheck` 通过。

## 验证方法

- 表驱动 Node 测试，按 code、location、limit 与读取日志断言。
- 不适用 browser-testing 或原版对照。

## 完成证据

- **实现：**
  - [disc-path.ts](../../../../../src/original-data/disc/disc-path.ts)：品牌化 `DiscPath`，以及 `isDosName`/`isDiscPath`（1–8 段大写 8.3，不自动转大写）。[source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 改用它，locator 的 `discPath` 类型为 `DiscPath`；来源映射行为与诊断不变（35 项测试通过）。
  - [iso9660-directory.ts](../../../../../src/original-data/disc/iso9660-directory.ts) 的 `resolvePath`：
    - 先校验路径语法，再从根逐级读取路径经过的目录；作为目标的目录本身不读取；
    - 每个目录完整扫描，按字节顺序校验每条记录：零长度记录后该扇区剩余字节须全为 0，结构与双端序检查共用 `readDirectoryRecord`，`.`/`..` 须指向本目录与已知父目录；
    - 记录数达到第 1,025 条时返回 `limit-exceeded`；
    - 可匹配名称按规范化结果去重：文件须有终端 `;N`（1–32767，无前导零），剥离后再去掉一个结尾的 `.`；目录不带版本；只接受 8.3；关联文件记录不参与匹配；
    - 匹配到的记录当场依次检查：不支持特性、类型、目录长度、extent（空文件跳过）、目录 64 KiB 上限（中间目录与目标目录相同）、循环；
    - 扫描完整个目录后才返回结果。
  - 诊断位置只用已解析的路径前缀与记录序号，形如 `dir:/MAIN`、`dir:/MAIN[2]`；类型不符与循环位于已解析路径，例如 `dir:/MAIN/LOOP`。
  - [disc-image.ts](../../../../../src/original-data/disc/disc-image.ts) 的句柄新增 `lookup(path)`。[synthetic.ts](../../../../../src/original-data/synthetic.test-support.ts) 新增 `directoryData`，按扇区装箱且记录不跨扇区；测试辅助新增 `.`、`..`、子目录与文件记录构建器。
  - 基准盘的本地只读名称核对（只看计数）：359 个文件全部带 `;1`，没有结尾 `.`，没有关联、隐藏或保留标志，规范化后无重名，单目录最多 79 条记录。这与严格的名称规则一致；事实记录由 09 写入 `docs/original/`。
- **测试：**
  - [disc-path.test.ts](../../../../../src/original-data/disc/disc-path.test.ts)：路径语法的 6 种合法形式、15 种非法形式与非文本值。
  - [iso9660-directory.test.ts](../../../../../src/original-data/disc/iso9660-directory.test.ts)：
    - AC-05 正向：
      - 多级文件解析为冻结且可结构化克隆的条目；目标目录不读取；版本边界 32767 与 1；结尾带 `.` 的名称；
      - extent 越界的空文件可以解析；隐藏目标可以解析；
      - 14 种不可匹配的兄弟记录都不妨碍查找：非 8.3、`;0`、`;32768`、`;01`、`;X`、空版本、无版本、带版本的目录、关联记录、使用不支持特性的兄弟记录等；
      - 零填充后继续读取下一扇区。
    - AC-05 负向：
      - 8 种非法路径；不存在（根目录与子目录）；文件被当作目录使用；
      - 8 种记录缺陷出现在目标之后仍失败；记录跨扇区；零长度记录后藏有非零字节；
      - 7 种 `.`/`..` 缺陷；缺少 `.`/`..`；`.` 记录使用不支持的特性；
      - 4 种重名（同名、不同版本、结尾带 `.`、同名目录）；
      - 自身循环、祖先循环，以及直接把祖先作为目标；
      - 目标的 8 种不支持特性，以及中间目录的不支持特性；
      - 文件 extent 越界、空目录、目录长度非整扇区、目录 extent 越界；
      - 匹配记录的错误先于其后的坏记录报告（不支持特性、类型不符、循环三种）。
    - AC-05 限值：
      - 65,536 字节的目录可以读取，读取日志含其 32 个扇区；
      - 67,584 字节在读取前返回 `limit-exceeded`，不论该目录是中间段还是目标；
      - 1,024 条记录通过，1,025 条返回 `limit-exceeded`；两种限值都不被另一限值先行拦截。
    - 读取日志只含卷描述符扇区与路径经过的目录扇区；重复查找没有缓存，会重新读取并重复计量。
    - AC-08：诊断不含记录原名中的标记；查找失败后，同一句柄的其他查找结果不变。
- **变异检查：** 依次禁用 9 处逻辑，每处都有测试失败：重名、零填充、循环、`.` 的 extent、记录数上限、跳过关联记录、版本上限、扫描完整个目录前提前返回、空文件跳过 extent 检查。检查后已恢复原代码。
- **检查：**
  - `pnpm exec vitest run src/original-data` 428 项通过；`pnpm typecheck` 通过；`pnpm lint` 通过；`pnpm build` 单独运行通过；`pnpm check:original` 通过，0 findings。
  - 完整 `pnpm check` 在本机高负载下（其他桌面应用占用，load average 10–23）连续三次未能全绿：typecheck 与 lint 阶段通过，失败的全部是 `tools/` 中启动子进程的用例超时（`Test timed out` 或 `spawnSync ETIMEDOUT`），涉及 `tools/compliance/cli.test.ts`、`build-plugin.test.ts`、`packages.test.ts`、`tools/e2e-configuration.test.ts`、`tools/engineering-boundaries.test.ts`。
  - 本子任务没有修改 `tools/`。基线对照：暂存本子任务改动后，在 HEAD（20803e5，03 时完整 `pnpm check` 已通过）上同负载运行 `tools/e2e-configuration.test.ts`，同样有 4 个用例超时，因此这些失败与本改动无关。已在 goal 执行记录登记，由最终对齐在负载正常时重新取得完整 `pnpm check` 的通过结果。
- **Rubber-duck：** 2 项发现均已修复：
  - 作为目标的目录绕过 64 KiB 上限：上限检查已移到匹配检查中；
  - 匹配记录要等扫描完才检查，后续坏记录会抢先报错：改为扫描遇到匹配时当场检查。
  - 两项都已补回归测试。
- **Simplify：**
  - 已应用：`MAX_PATH_SEGMENTS`、`MAX_DIRECTORY_RECORDS` 不再导出；路径前缀由路径段推导，不再维护可变状态；只在需要时构造位置字符串；新增通用 `DiscExtent` 类型，替代根目录专用类型；测试改用 `isDiscPath`，不再复制语法。
  - 未采纳：目录缓存（spec 规定不做内部缓存）；把上下文或 `DiscEntry` 移到其他模块（会与 `disc-image.ts` 形成循环依赖）；逐字节的名称解析（每次查找最多 1,024 个名称）。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)的目录树已加入 `disc-path.ts` 与 `iso9660-directory.ts`，来源映射一节注明 locator 与光盘读取共用 `DiscPath` 规则；不涉及命令或 U 项。
