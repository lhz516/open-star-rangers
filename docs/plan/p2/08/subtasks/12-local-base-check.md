---
type: plan
status: active
phase: P2
task: "08"
subtask: "12"
updated: 2026-10-05
---

# 12 — 本地基准镜像核对

**契约来源：** [spec](../spec.md) 的 S-11（本地基准核对），AC-12；[音频转换预算](../spec.md#音频转换预算)中的基准核对、[验证策略](../spec.md#验证策略)中的实机与原版对照。
**依赖：** 11。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **本地脚本：** 在被忽略的 `local/research/p2-08/` 中编写 Node 脚本，不提交。
  - 用 `fs.openAsBlob` 打开 `local/StarRang/cd/` 的 CloneCD 文件组，组装为 `File`；
  - 按 [P2-04 的本地核对](../../04/subtasks/11-local-base-check.md)的方式，用 Node `MessageChannel` 连接以下各部分，从 `start` 运行到终态：
    - 生产作业 `createImportJob()`：不注入，即产品入口、生产音效表与生产规则；
    - 真实宿主、平台适配与持有者。
- **核对：**
  - 以 `finished` 结束，`audio` 组为 `group-complete`；
  - 清单身份的 `converterVersion` 为 `osr-import.audio-1`，`manifestIdentity` 符合格式；
  - 记录 Asset 数、各角色的 Asset 数、采样率、位宽与 `flags` 分布、payload 字节与采样点用量及其与各上限的比较、源读取量与耗时。
- **覆盖核对：** 脚本另读 P2-01 选定的 5 个 MODL 的音效槽（本地脚本可使用 `tools/` 级别的读取能力），确认每个非零 SND 都已映射到生产表；别名成员只要有一个在表中即算覆盖。
- **预算核对：** 任一用量超过上限时，按 spec 修订流程处理，不静默调高上限；本子任务记为 blocked。
- **输出：** 只含计数、分布、用量、读取量、耗时与结论，写入 `local/research/p2-08/`。

## 不包含

- 浏览器中的原版数据：阶段规定 agent 浏览器检查只用合成资源。
- 试听（10）与经查看器的联合对照（P2-12）。

## 关键文件与契约

- **只读使用：** 06 的作业与生产音效模块、05 的宿主与持有者、[worker-port.ts](../../../../../src/platform/workers/worker-port.ts)，以及 P2-03 生产指纹的测试常量（[source-catalog.test.ts](../../../../../src/original-data/source/source-catalog.test.ts)）。
- **本地新增（被忽略）：** `local/research/p2-08/` 下的脚本与输出。
- **前提：** `local/StarRang/cd/` 有开发者的 CloneCD 文件组（2026-10-05 已存在）。缺少时本子任务为 blocked，不能用合成数据代替。

## 验收标准

- [ ] AC-12：本地运行以 `finished` 结束，`audio` 组为 `group-complete`；计数、分布、用量与上限的比较、读取量与耗时已记录。
- [ ] AC-12（覆盖）：5 个模型音效槽中的每个非零 SND 都已映射到生产表。
- [ ] 全部用量不超过 spec 的音频预算上限。
- [ ] 输出与证据只含允许的字段；`git status` 显示 `local/` 下的文件未被跟踪；`pnpm check:original` 通过。

## 验证方法

- 本地 Node 运行：`node local/research/p2-08/<脚本>.ts <CloneCD 文件>`，文件名执行时确定，记录在证据中。
- 不适用 browser-testing；不做视觉或听觉对照。

## 完成证据
