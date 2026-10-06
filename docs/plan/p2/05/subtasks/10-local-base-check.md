---
type: plan
status: active
phase: P2
task: "05"
subtask: "10"
updated: 2026-10-05
---

# 10 — 本地基准镜像核对（生产路径）

**契约来源：** [spec](../spec.md) 的 S-12 的本地基准部分；[验证策略](../spec.md#验证策略)中的实机与原版对照；AC-13。
**依赖：** 07。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **本地脚本：** 写在被忽略的 `local/research/p2-05/` 中，不提交。用 `fs.openAsBlob` 打开 `local/StarRang/cd/` 的 CloneCD 文件组。
- **步骤结果：** 经产品入口打开已验证来源，直接调用 06 的生产声明与 05 的步骤，运行两次。核对：
  - 得到 5 个 Asset：`models` 1 个，`cockpit-hud-map` 4 个；
  - 三个字库的单元与声明一致（8×8、8×8、4×6）；
  - 两次运行每个 payload 的 SHA-256 都相同（只记录是否一致，不发布哈希值）；
  - 读取字节与各维用量不超过 06 的份额。
- **作业路径：** 沿用 P2-04 [11](../../04/subtasks/11-local-base-check.md) 的方式，用 Node `MessageChannel` 连接生产作业、宿主与持有者，处理同一镜像，从 `start` 运行到终态。核对：
  - 阶段顺序为识别 → `identified` → `convert-graphics` → `finished`；
  - `groups` 为空；
  - `usage` 的转换维度与直接调用步骤时相同，`sourceReadBytes` 等于最后一次进度的 `readBytes`。
- **输出：** 只含计数、单元尺寸、一致性判定、读取量与耗时，写入 `local/research/p2-05/`。

## 不包含

- 浏览器中的原版数据：agent 浏览器检查只用合成资源。
- 视觉对照：最终保真判定归 P2-12；颜色规则研究归 [11](./11-nearest-colour-research.md)。

## 关键文件与契约

- **只读使用：** 03 至 07 的模块；P2-04 的持有者与端口适配。
- **本地新增：** `local/research/p2-05/` 下的脚本与输出（被忽略）。
- **前提：** `local/StarRang/cd/` 有开发者的 CloneCD 文件组（2026-10-05 已存在）；缺少时本子任务为 blocked，不能用合成数据代替。

## 验收标准

- [x] AC-13 步骤结果：5 个 Asset、分区与单元正确，两次运行逐 payload 一致，用量不超过份额。
- [x] AC-13 作业路径：阶段顺序正确，以 `finished` 结束，`groups` 为空，转换维度与步骤一致。
- [x] 脚本与输出只在被忽略的目录中；证据没有原版内容、哈希值或私人绝对路径。

## 验证方法

- 本地 Node 运行；证据只记录命令、计数与判定。
- 不适用 browser-testing。
- 本子任务没有仓库代码改动；若脚本暴露缺陷，回到相应子任务修复，或按 execute-goal 的补救流程新增子任务。

## 完成证据

- **命令（2026-10-05）：** `node local/research/p2-05/base-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`，退出码 0，`passed: true`。脚本与输出 `base-check.json` 都在被忽略的 `local/research/p2-05/`。脚本用 `fs.openAsBlob` 打开文件组，按 P2-04/11 的方式接线。输出只含计数、单元尺寸、判定、读取量与耗时，没有哈希值、原版字节、输入名或宿主路径。
- **步骤结果（AC-13 第一部分）：** 两次各自经产品入口 `openVerifiedSource` 打开新的已验证来源，直接调用 05 的步骤，输入为 06 的生产映射、声明与份额（限值为输入总字节加份额）。
  - **Asset 与分区：** 期望的组与 Asset ID 从生产声明推导。两次运行都恰为 `models` 1 个、`cockpit-hud-map` 4 个，每组的描述符、payload 与来源状态逐项对齐，状态全部为 `verified`。
  - **单元：** 字库单元按声明顺序为 8×8、8×8、4×6，与声明的 `cell` 一致。
  - **确定性：** 两次运行的 Asset 集合相同，每个 payload 的 SHA-256 相同（只记录判定），用量也相同。
  - **用量：** assets 5、paletteEntries 512、glyphs 768、payloadBytes 7,184，其余维度为 0，都不超过 06 的份额。
  - **读取：** 每次步骤读取 992,544 字节，来源累计读取 18,247,587 字节，均不超过 P2-02 的默认读取限值（`.ccd` 与 `.img` 共 174,530,931 字节）。步骤耗时 4 ms 与 3 ms。
- **作业路径（AC-13 第二部分）：** 生产作业、Worker 宿主与持有者经 Node `MessageChannel` 处理同一文件组。
  - 快照阶段序列恰为：初始 → 识别中 → 已识别 → `convert-graphics` → `finished`，共 53 条进度消息；
  - `groups` 与 `takeGroups()` 都为空；
  - `usage` 的全部转换维度与直接调用步骤时相同；
  - `sourceReadBytes` 为 18,247,587，等于最后一次进度的 `readBytes`，进度不减少；
  - 总耗时 115 ms，其中从识别到图形阶段 0 ms，图形阶段 3 ms。
- **Rubber-duck：** 对脚本与输出审查，无 Blocker/High。已按发现加严检查后重跑，结果同上：
  - **Medium：** 默认读取限值只算 `.ccd` 与 `.img`，并核对两次运行；
  - **Medium：** Asset ID 与分区从声明推导，并核对两次运行中描述符、payload 与来源的对齐，以及 Asset 集合相同后再比较哈希；
  - **Low：** 阶段序列含初始与终态，并要求完全一致；
  - **Medium：** 输出去掉阶段名、组名与 ID 字符串，结论改为布尔值。
- **代码与文档影响：** 本子任务没有仓库代码改动，不需要 simplify。脚本没有暴露缺陷。原版文档、工程约定与工具指南不需要更新：本地基准结果是验收证据，不是新的原版事实；结构事实已由 06 与 09 记录。

- **执行期修订（2026-10-05，[12](./12-character-map-research.md)）：** 2026-10-05 用修订后的生产声明复跑同一命令，`passed: true`；步骤用量为 assets 5、paletteEntries 512、glyphs 704、payloadBytes 7,683，单元仍为 8×8、8×8、4×6，读取量不变。见 [goal 执行记录](../goal.md#执行记录)。以上为修订前的记录。
