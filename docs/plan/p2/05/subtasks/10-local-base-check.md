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

- [ ] AC-13 步骤结果：5 个 Asset、分区与单元正确，两次运行逐 payload 一致，用量不超过份额。
- [ ] AC-13 作业路径：阶段顺序正确，以 `finished` 结束，`groups` 为空，转换维度与步骤一致。
- [ ] 脚本与输出只在被忽略的目录中；证据没有原版内容、哈希值或私人绝对路径。

## 验证方法

- 本地 Node 运行；证据只记录命令、计数与判定。
- 不适用 browser-testing。
- 本子任务没有仓库代码改动；若脚本暴露缺陷，回到相应子任务修复，或按 execute-goal 的补救流程新增子任务。

## 完成证据
