---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "03"
updated: "2026-10-30"
---

# 03 — 联合故障的契约修订

**契约来源：** [spec](../spec.md) 的 S-05、AC-08（契约部分）、[技术决定](../spec.md#技术决定) 4。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **有界查证：** 按[原版证据获取](../../../../guides/original-evidence.md)读取已有的 [Warp 门禁](../../../../original/formats/executable.md#warp-cost-and-warp-start-p3-0905)、[DK1–DK4](../../../../original/formats/executable.md#docking-wait-docking-and-launch-p3-1004) 与[按键读取](../../../../original/formats/executable.md#input-polling-p3-0201)，必要时做只读 Ghidra 分析。确认原版在“本帧已投递 sub-command 0 或 4，之后玩家更新读到 `w`”时的代码路径，以及这条路径是否需要运行时证据。只记录事实与置信度。不运行 DOSBox-X，不增加原版启动。
- **契约修订：** 在 [P3-02 spec](../../02/spec.md) 中修订 [MW-04](../../02/spec.md#mw-04-命令原因码与内部请求) 与 [CB-07](../../02/spec.md#cb-07-命令判定)，内容按技术决定 4：
  - **冲突门禁：** 本 tick 已有玩家 `dock` 或 `depart` 待提交时，`request-warp` 为 `ignored`/`wrong-context`。玩家不可用的检查仍在它之前；它在目的地、冷却与能量门禁之前。
  - **不变量：** 被拒绝的命令不投递 `warp-start`，不改 Warp、目的地、有效视角或能量，不消耗 Warp 抽取；已有的 `dock`/`depart` 照常应用。
  - **相邻行为：** 没有待提交转换时，子状态 3–4 照常走原门禁；武器的内部 `launch` 请求不算冲突。
  - **更正旧前提：** “其前没有能改变判定输入的请求”与“有效视角”的旧前提按新门禁改写。
- **重复条文与审批记录：** 同步 P3-09、P3-10 spec 中实际重复该门禁的条文。在 P3-02 spec 的审批节写修订记录：依据、所选与被排除的方案、原版置信度、“依 P3-16 spec 的 2026-10-30 批准定稿”，以及这是不宣称与 DOS 同帧一致的项目差异。不伪造旧任务的批准。
- **超出边界时：** 查证若表明需要超出这两种交互、改变其他既定规则或持久化形状，停下并记为 blocked，交用户。

## 不包含

- Core 实现与测试（04）；Core 模块说明的更新（04）。

## 关键文件与契约

- [P3-02 spec](../../02/spec.md) 的 MW-04、CB-07 与审批节；[P3-09 spec](../../09/spec.md)、[P3-10 spec](../../10/spec.md) 中的重复条文；[executable](../../../../original/formats/executable.md)。

## 写入范围

- `docs/plan/p3/02/spec.md`：MW-04、CB-07 与审批节的修订记录。
- `docs/plan/p3/09/spec.md`：只同步重复的门禁条文。
- `docs/plan/p3/10/spec.md`：只同步重复的门禁条文。
- `docs/original/formats/executable.md`：只在查证得到新事实时补记，附置信度。
- `local/research/p3-16/joint-fault/**`：查证笔记与只读分析输出（被忽略）。

## 验收标准

- [ ] AC-08（契约）：MW-04 与 CB-07 写明冲突门禁的条件、优先序、原因码与无副作用的不变量，以及相邻行为与旧前提的更正。
- [ ] P3-09、P3-10 的重复条文与之一致；审批节的修订记录含依据、方案、置信度与批准出处，没有冒称旧任务批准。
- [ ] 查证结论有置信度与来源；没有把“原版不可达”写成已证实，原版同帧竞争缺运行证据的部分已标明。
- [ ] 改动的文档 `updated:` 已更新，链接与锚点可解析；没有原版字节或反编译输出。

## 验证方法

- 文档差异审阅、链接检查；对照 [warp.ts](../../../../../src/core/systems/warp.ts)、[docking.ts](../../../../../src/core/systems/docking.ts)、[commands.ts](../../../../../src/core/systems/commands.ts) 与 [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的现状，确认修订可以按纯 Core 实现。

## 完成证据
