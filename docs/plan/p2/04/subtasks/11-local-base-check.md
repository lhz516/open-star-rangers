---
type: plan
status: active
phase: P2
task: "04"
subtask: "11"
updated: 2026-10-05
---

# 11 — 本地基准镜像核对

**契约来源：** [spec](../spec.md) 的 S-11；[验证策略](../spec.md#验证策略)中的实机与原版对照；技术决定 12；AC-12。
**依赖：** 07。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **本地脚本：** 在 `local/research/p2-04/` 中编写 Node 脚本（不提交）。
  - 用 `fs.openAsBlob` 打开 `local/StarRang/cd/` 的 CloneCD 文件组，组装为 `File`；
  - 按 07 的方式用 Node `MessageChannel` 连接生产作业（默认打开函数，即产品入口）、宿主与持有者，从 `start` 运行到终态。
- **核对：**
  - 收到 `identified`：版本为 `star-rangers-1995-cd`，指纹等于 P2-03 固定的生产常量；
  - 以 `finished` 结束，组为空；最后一次进度的 `readBytes` 等于 `usage.sourceReadBytes`；
  - 记录耗时、读取量与进度消息数。
- **输出：** 只含版本 ID、指纹、计数、读取量、耗时与结论，写入 `local/research/p2-04/`。
- **证据：** subtask 证据只记录命令、计数与结论，不粘贴原版内容或私人绝对路径。
- **前提：** `local/StarRang/cd/` 有开发者的 CloneCD 文件组（2026-10-05 已存在）。缺少时本子任务为 blocked，不能用合成数据代替。

## 不包含

- 浏览器中的原版数据：P2 阶段索引规定 agent 浏览器检查只用合成资源。
- 视觉或听觉对照；新的原版事实（预期不产生；若发现，按流程写入 `docs/original/`）。

## 关键文件与契约

- **只读使用：**
  - 03 的 `src/workers/import-job.ts`、02 的宿主、04 与 05 的持有者；
  - 06 的 `src/platform/workers/worker-port.ts`；
  - P2-03 生产指纹的测试常量，见 [source-catalog.test.ts](../../../../../src/original-data/source/source-catalog.test.ts)。
- **本地新增：** `local/research/p2-04/` 下的脚本与输出（被忽略，不提交）。

## 验收标准

- [ ] AC-12：本地运行以 `finished` 结束，版本与指纹符合预期，组为空，最后一次进度的 `readBytes` 等于 `usage.sourceReadBytes`；耗时与读取量已记录。
- [ ] 输出与证据只含允许的字段；`git status` 显示 `local/` 下的文件未被跟踪；`pnpm check:original` 通过。

## 验证方法

- 本地 Node 运行：`node local/research/p2-04/<脚本>.ts`，文件名执行时确定，记录在证据中。
- 不适用 browser-testing；不做视觉或听觉对照。

## 完成证据
