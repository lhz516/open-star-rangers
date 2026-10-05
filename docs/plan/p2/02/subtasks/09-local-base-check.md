---
type: plan
status: active
phase: P2
task: "02"
subtask: "09"
updated: 2026-10-05
---

# 09 — 基准盘本地核对与结构事实记录

**契约来源：** [spec](../spec.md) 的 S-09（本地核对）、S-13；AC-12、AC-13（原版事实部分）。
**依赖：** 08。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **本地运行：** 在开发者机器上对 `local/StarRang/cd/` 中的基准 CloneCD 文件组运行 08 的 CLI。
  - 先确认 `.img`/`.sub` 的大小与 SHA-256 与 [manifest](../../../../original/manifest.md#光盘镜像) 一致；
  - 再核对 manifest 游戏文件表每个路径的解析、大小与分段 SHA-256；
  - 检查累计 `sourceReadBytes` 等于请求日志之和且小于 `.img` 大小，`.sub`/`.cue` 读取为 0。
- **结构事实：** 把 `local/research/p2-02/` 的结构调查结论带置信度写入新的英文格式文档，并从 manifest 链接。内容包括：
  - 描述布局、扇区与卷描述符；
  - 目录形状、名称与版本后缀的情况，以及不支持特性的出现情况；
  - 观测最大值与实际检查范围。
- **一致性：** 记录的观测最大值不超过 spec 的适用安全上限，格式常量一致。只陈述实际检查过的范围，不把未发布的调查当成已确认规范。
- **约束：** 只记录结构、计数、大小与哈希；输出、脚本与日志都留在 `local/`。

## 不包含

- 产品版本识别与来源指纹（P2-03）；视觉或音效保真对照（P2-06/07/08/12）。
- 新增 U 项或改变已有 U 项状态，因为没有 U 项涉及镜像结构。若调查发现与 spec 冲突的事实，停止并记录，不在本子任务中修改契约。

## 关键文件与契约

- **计划新增：** `docs/original/formats/disc-image.md`（英文，结构与置信度）。
- **修改：** [manifest](../../../../original/manifest.md)（加入链接）。
- **外部前提：** 本地基准镜像存在，且与 manifest 哈希一致；否则本子任务 blocked，不能用合成数据代替。

## 验收标准

- [x] AC-12：本地 CLI 运行通过：
  - 布局被接受；
  - 全部 manifest 游戏文件的路径解析成功，大小与 SHA-256 一致；
  - 累计用量等于请求日志之和，且小于 `.img` 大小；
  - `.sub`/`.cue` 读取为 0；
  - 输出只有规范路径、计数与结论。
  - subtask 证据只记录命令、计数与结论。
- [x] AC-13（原版部分）：结构事实带置信度写入 `docs/original/` 并由 manifest 链接；观测最大值不超过安全上限；文档只陈述实际检查的范围。
- [x] `pnpm --silent check:original` 零发现，`git status` 中没有 `local/` 内容或镜像类文件；文档链接与元数据检查通过。

## 验证方法

- 本地运行 `node tools/disc-check.ts` 的实际命令（形式以 08 落定为准），并在证据中记录命令与计数。
- 只读查看调查输出，再与 spec 的支持布局、限值逐项对照。
- 不适用 browser-testing。

## 完成证据

- **前提：** 本地 `local/StarRang/cd/STAR_RANGERS.img` 与 `.sub` 的大小和 SHA-256 均与 [manifest](../../../../original/manifest.md#光盘镜像) 一致（只读比较，仅输出是否一致）。
- **本地 CLI（AC-12）：**
  - 命令：`node tools/disc-check.ts local/StarRang/cd/STAR_RANGERS.ccd local/StarRang/cd/STAR_RANGERS.img local/StarRang/cd/STAR_RANGERS.sub local/StarRang/cd/STAR_RANGERS.cue`，退出码 0，完整报告留在 `local/research/p2-02/`。
  - 结论：`passed: true`，布局被接受；卷信息为 74,205 个扇区、卷空间 74,193 块；manifest 游戏文件表 50 行全部解析成功，大小与分段 SHA-256 一致，不一致 0 行。
  - 读取：`sourceReadBytes` 144,178,371，等于请求日志之和，小于 `.img` 的 174,530,160 字节；`.sub`/`.cue` 读取 0 字节。
  - 输出只有规范光盘路径、计数与结论。
- **结构事实（AC-13 原版部分）：**
  - 新增英文格式文档 [disc-image.md](../../../../original/formats/disc-image.md)，带置信度，[manifest](../../../../original/manifest.md#光盘镜像) 已链接到它。
  - 内容：文件组、`.ccd` 的行格式与节/键结构、全部原始扇区的头部检查、卷描述符与主卷字段、目录树、记录与名称、观测最大值与读取方限值的对照、本地核对结论，以及检查范围。
  - 依据：本地调查脚本对整个镜像做的只读检查，以及 CLI 运行。审阅期间补测了两项：`.ccd` 中空行与裸 LF 均为 0；30 个目录共 32 个零长度记录，其后到扇区末尾全部为 0。
  - 观测最大值都在适用安全上限内：`.ccd` 771 字节、镜像 74,205 扇区、卷描述符 2 个、目录 4,096 字节、单目录 79 条记录、路径 4 段。最大文件 37,462,634 字节超过单次范围读取的 16 MiB，按分段读取。
  - 格式常量一致：2,352/2,048 字节、MODE1、MSF 偏移 150、逻辑块 2,048。
  - 文档只陈述这一份文件组，不作为通用 CloneCD/ISO9660 规范；与 spec 支持布局没有冲突，不涉及任何 U 项。
- **检查：**
  - `pnpm exec vitest run tools/compliance/manifest.test.ts` 14 项通过，加入链接后 manifest 仍可解析；
  - `pnpm check:original` 通过，0 findings；
  - `git ls-files` 中没有 `local/` 或镜像类文件，`git status` 只有本子任务的文档；
  - 改动文档的相对链接与锚点检查通过（检查脚本留在 `local/research/p2-02/`）。
- **Rubber-duck：** 2 项阻塞已修复：
  - “描述中没有空行”缺乏直接证据：已补测并改写；
  - “全树零填充”超出了 CLI 实际检查的范围：已对全部 30 个目录补测并改写。
  - 非阻塞项已修复：“无文件上限”的说法不准确，改为“没有单独的文件大小上限，但 extent 须在卷内，单次范围读取最多 16 MiB”。
- **Simplify：** 本子任务只改文档，不需要代码清理。
- **文档影响：** `docs/original/formats/disc-image.md` 新增，manifest 加入链接；工程文档无需更改；STATUS 留待最终对齐后更新阶段摘要。
