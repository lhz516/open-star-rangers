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

- [ ] AC-01：
  - 含同主名、扩展名大小写不同的 `.sub`/`.cue` 的合法文件组可以通过配对，读取日志显示 `.sub`/`.cue` 读取 0 字节；
  - 缺少 `.ccd` 或 `.img`、任一扩展名重复、空主名、主名不一致、含其他文件、超过 4 个文件、只有 `.cue` 加 `.img` 时，都返回 `unsupported-file-set`，且不发生读取；
  - 宿主文件名中的标记不出现在诊断里。
- [ ] AC-02：
  - LF 与 CRLF 的合法描述都通过，已知节中的未知键被忽略；
  - 每个 `unsupported-layout` 与 `invalid-descriptor` 用例都返回预期的 code 与安全位置，每个必需字段都有缺失回归；
  - 描述 65,536 字节通过尺寸门禁，65,537 字节在读取前返回 `limit-exceeded`；
  - 未知节/键中的标记不被回显。
- [ ] AC-03（大小部分）：长度不是 2352 整数倍、或扇区数与 lead-out 不符，返回 `image-size-mismatch`；扇区数 17 与 449,851 返回 `limit-exceeded`，18 与 449,850 通过尺寸门禁。端口只报告大小，不分配整个镜像。
- [ ] AC-07/AC-08（打开部分）：打开前取消返回 `cancelled` 且不发生读取；默认上限等于输入总量，限值高于上限返回 `limit-exceeded`；修改调用者的输入列表或预算配置不影响已打开的状态。
- [ ] `pnpm exec vitest run src/original-data` 与 `pnpm typecheck` 通过。

## 验证方法

- Node 表驱动测试，使用 01 的记录日志端口和只报告大小、不分配内容的合成端口。
- 不适用 browser-testing 或原版对照。

## 完成证据
