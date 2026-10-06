---
type: plan
status: active
phase: P2
task: "07"
subtask: "16"
updated: 2026-10-06
---

# 16 — 本地基准生产路径

**契约来源：** [spec](../spec.md) 的 S-10 的本地基准部分；[限值与预算](../spec.md#限值与预算)（实际用量记录）；AC-13。
**依赖：** 12、13。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **步骤结果：** 在 Node 中经产品入口打开本地基准镜像的已验证来源，直接调用生产图形步骤：
  - 得到 P2-05 的 5 个 Asset 与本任务的全部生产 Asset；
  - `cockpit-hud-map` 分区装配后（经 `productionIdentityBasis` 与 `applyManifestIdentity`）由 `validateGroup` 判定为 `group-complete`；
  - 两次运行每个 payload 的 SHA-256 相同；
  - 各维用量不超过份额，并记录实际用量。
- **作业路径：** 经 Worker 的作业、宿主与持有者模块（Node 中的 `MessageChannel`）处理同一镜像：阶段顺序正确，发送 `cockpit-hud-map` 组，持有者为 `group-complete`，作业以 `finished` 结束。
- **记录：** 证据只记命令、Asset 数、各维用量、两次运行的哈希是否一致与判定；实际用量超出份额时本子任务不通过，按 spec 修订 S-08 并重新批准。
- **方法：** 脚本放在被忽略的 `local/research/p2-07/`，只经生产入口与生产常量。

## 不包含

- 截图比较与 R5：归 [15](./15-local-composite-check.md)。
- 全量结构校验：归 [07](./07-local-structure-check.md)。

## 关键文件与契约

- **计划新增（不提交）：** `local/research/p2-07/` 下的本地核对脚本与输出。
- **复用：** 产品入口 [open-verified-source.ts](../../../../../src/original-data/source/open-verified-source.ts)、[graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts)、[import-job.ts](../../../../../src/workers/import-job.ts)、[import-host.ts](../../../../../src/workers/import-host.ts)、[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts)。
- **本地数据：** `local/StarRang/cd/` 的 CloneCD 文件组。

## 验收标准

- [x] AC-13 的步骤结果：Asset 集合正确，`group-complete`，两次运行哈希一致，用量不超过份额且已记录。
- [x] AC-13 的作业路径：阶段顺序正确，`cockpit-hud-map` 组为 `group-complete`，作业以 `finished` 结束。
- [x] 证据只含命令、计数与判定。

## 验证方法

- 本地 Node 脚本；不涉及浏览器。

## 完成证据

- **命令：** `node --preserve-symlinks --preserve-symlinks-main local/research/p2-07/base-check.ts`（2026-10-06，本地 CloneCD 镜像）。脚本只经产品入口 `openVerifiedSource` 与生产常量，作业路径使用真实的 `createImportJob()`、`runImportHost`、`connectImportWorker` 与 `createImportJobOwner`，通过 Node 的 `MessageChannel` 连接。
- **步骤结果：**
  - 每次运行转换 121 个 Asset，其中 P2-05 的 5 个与本任务的 86 个全部在内，其余为 P2-06 的切片贴图；
  - 两次运行各 121 个 payload 的 SHA-256 逐一相同；
  - `cockpit-hud-map` 分区 90 个 Asset 全部 `verified`，经 `productionIdentityBasis` 与 `applyManifestIdentity` 装配后，`validateGroup` 为 `group-complete`，外部要求为 0。
- **实际用量（本任务 / 份额）：**

  | 维度 | 实际 | 份额 |
  |---|---:|---:|
  | assets | 86 | 96 |
  | dependencyEdges | 91 | 192 |
  | imagePixels | 441,785 | 524,288 |
  | paletteEntries | 256 | 1,024 |
  | glyphs | 0 | 0 |
  | payloadBytes | 467,707 | 786,432 |

  整个图形步骤的用量也在图形份额（P2-05、P2-06 与本任务之和）之内。
- **作业路径：**
  - 阶段依次为 `identify-source`、`convert-graphics`、`convert-logic`、`convert-audio`、`convert-models`，最终为 `finished`；
  - 收到的组依次为 `logic`、`models`、`cockpit-hud-map`、`audio`；
  - 持有者对 `cockpit-hud-map` 记为 `group-complete`（90 个 Asset），`logic` 与 `audio` 也是 `group-complete`；`models` 为 `incomplete`，这是 P2-06 记录的已知状态（歧义贴图与效果角色），与本任务无关；
  - `takeGroups()` 移交 `logic`、`cockpit-hud-map` 与 `audio`。
- **判定：** 脚本汇总 9 项判定，任一失败时以非零状态退出；本次输出 `verdict: pass (9/9)`。9 项分别为：Asset 齐全、两次哈希一致、分区恰为 4 + 86 个 Asset、`group-complete`、只有布局/图像/调色板、本任务逐维不超过份额、步骤不超过图形份额、阶段顺序与 `finished`、组完整并被移交。
- **rubber-duck：** 没有阻塞问题。非阻塞建议已采纳：本任务的 Asset 集合改由 `cockpit-hud-map` 组的声明推得并检查精确相等；用量从完整的预算记录出发，调色板条目按 payload 实际条目数，逐个预算维度与份额比较；判定失败时以非零状态退出。
- **文档影响：** 只记录本子任务的证据；原版文档、源码结构与 STATUS 不受影响。
