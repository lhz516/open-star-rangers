---
type: plan
status: active
phase: P2
task: "06"
subtask: "09"
updated: 2026-10-05
---

# 09 — 本地基准核对（生产路径）

**契约来源：** [spec](../spec.md) 的 S-12（本地基准路线）；AC-11。
**依赖：** 07。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在开发者机器上用本地基准镜像 `local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`，编写并运行被忽略的本地脚本 `local/research/p2-06/base-check.ts`，沿用 P2-05/10 与 P2-08/12 的做法：
  - **直接调用：** 经产品入口打开已验证来源，按生产输入直接调用模型步骤：
    - 得到全部生产模型，机型模型的 ID 与 P2-09 绑定一致；
    - 每个模型的几何、部件与音效引用，与用 02 读取函数独立做的参考读取逐项结构等价：顶点、三角形、着色槽逐项相同，浮点逐位相同；
    - 两次运行每个 payload 的 SHA-256 相同；
    - 用量不超过图形追加份额与模型份额。
  - **作业路径：** 用与 Worker 相同的作业、宿主与持有者模块（Node `MessageChannel`）处理同一镜像：
    - 作业以 `finished` 结束，`models` 组被接收方验证，结果为 `group-complete`；
    - 或为 `incomplete`，且每条诊断都对应 AC-13（弹丸、导弹、碎片的角色基数）或 AC-14（歧义贴图的 `source-not-ready`）中记录的阻塞；
    - `logic` 与 `audio` 组仍为 `group-complete`，三组身份相同。
  - 复跑 [logic-check.ts](../../../../../tools/logic-check.ts)，确认逻辑组核对不受新阶段影响。
- 脚本与输出留在被忽略的 `local/research/p2-06/`。证据只记录命令、计数、判定、诊断 code 与读取量，不含原版内容、哈希值、输入名或私人绝对路径。
- 若暴露实现缺陷，在相应子任务修复或新增修复子任务，不在本子任务改代码。

## 不包含

- 研究与生产常量的追加（11、12）；它们改变结果时，在各自的子任务中复跑本脚本。
- 视觉保真判定（P2-12）。

## 关键文件与契约

- 本地新增 `local/research/p2-06/base-check.ts`（被忽略）。
- 复用 [open-verified-source.ts](../../../../../src/original-data/source/open-verified-source.ts) 的产品入口、05/06 的模型步骤与生产输入、07 的作业、[import-host.ts](../../../../../src/workers/import-host.ts)、[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts)。
- 前提：本地基准镜像存在（2026-10-05 已确认）；缺少时本子任务为 blocked。

## 验收标准

- [ ] AC-11：直接调用得到全部生产模型，ID 与 P2-09 绑定一致；逐项结构等价；两次运行 SHA-256 相同；用量不超过份额。
- [ ] AC-11：作业路径以 `finished` 结束；`models` 组为 `group-complete`，或为 `incomplete` 且每条诊断都对应 AC-13、AC-14 记录的阻塞。
- [ ] `logic` 与 `audio` 组仍为 `group-complete`，三组身份相同；logic-check 通过。
- [ ] 证据只含命令、计数、判定与诊断 code。

## 验证方法

- 本地 Node 脚本；结果写入被忽略目录，完成证据摘录计数与判定。
- 不适用 browser-testing；不提交原版内容或脚本输出。

## 完成证据
