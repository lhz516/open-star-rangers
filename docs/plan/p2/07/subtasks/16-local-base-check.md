---
type: plan
status: active
phase: P2
task: "07"
subtask: "16"
updated: 2026-10-05
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

- [ ] AC-13 的步骤结果：Asset 集合正确，`group-complete`，两次运行哈希一致，用量不超过份额且已记录。
- [ ] AC-13 的作业路径：阶段顺序正确，`cockpit-hud-map` 组为 `group-complete`，作业以 `finished` 结束。
- [ ] 证据只含命令、计数与判定。

## 验证方法

- 本地 Node 脚本；不涉及浏览器。

## 完成证据
