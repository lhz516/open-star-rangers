---
type: plan
status: active
phase: P2
task: "06"
subtask: "10"
updated: 2026-10-05
---

# 10 — 本地全量结构核对与部件结构记录

**契约来源：** [spec](../spec.md) 的 S-03（全量核对）、S-11（部件结构）、S-12（本地路线）；[研究要求](../spec.md#研究要求)的“部件结构”行；AC-12，AC-15 的 mesh 部分，AC-17 的 mesh 部分。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **全量结构核对：** 用加固后的 [nob-check.ts](../../../../../tools/nob-check.ts)（02 已改用新的读取函数）处理本地 `local/StarRang/SRANGERS/MAIN/SR.NOB`：
  - 全部 486 个 MESH 与 19 个 MODL 通过，输出只有计数与失败原因；
  - 需要时在工具输出中加入观察最大值：每网格顶点数、三角形数与着色槽数，每模型三个列表的部件数与合计，颜色分量最大值，标志值集合；
  - 任何实例被拒绝时本项不通过，须按证据修订 spec，不放宽为静默接受。
- **观察最大值：** 写入 [mesh](../../../../original/formats/mesh.md)，与 spec 的结构限值并列，格式同 [imfat §6](../../../../original/formats/imfat.md#6-observed-maxima-against-the-readers-limits-confirmed)。
- **部件结构记录：** 用被忽略的本地脚本 `local/research/p2-06/`，只统计切片 5 个模型实际用到的结构，写入 mesh 并标明置信度：
  - 用到的部件列表与各列表部件数；
  - 标志值；
  - 音效槽：含义以 P2-08 在 [audio](../../../../original/formats/audio.md#slice-sample-set-and-role-correspondences-p2-08) 与 mesh 中的记录为准，本任务不另作判断；
  - 三角形绕序与顶点法线的一致性统计（同向、混合、反向的网格数），只记录，不解释为渲染约定。

  未确认的含义保持未确认，不改写 payload 或玩法。
- **文档：** [mesh](../../../../original/formats/mesh.md) 的结构核对、观察最大值与部件结构；nob-check 输出若有变化，同步[工具指南](../../../../guides/tools.md#封包结构核对)；更新 `updated:`。

## 不包含

- 弹丸、导弹与碎片的来源研究与 U-027 状态（11）。
- 读取函数本身（02）。

## 关键文件与契约

- 修改 [nob-check.ts](../../../../../tools/nob-check.ts)（仅在需要输出观察最大值时）及其测试、[mesh.md](../../../../original/formats/mesh.md)、[tools.md](../../../../guides/tools.md)。
- 本地新增 `local/research/p2-06/` 下的统计脚本（被忽略）；生成 spec 时的探查脚本可复用。
- 前提：本地 `SR.NOB` 存在（2026-10-05 已确认）；缺少时本子任务为 blocked。

## 验收标准

- [ ] AC-12：`node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` 用同一套读取处理全部 486 个 MESH 与 19 个 MODL，都通过，输出只有计数与失败原因；观察最大值与限值一起写入 mesh。
- [ ] AC-15（mesh 部分）：mesh 记录切片用到的部件列表、标志值与音效槽的已知含义与置信度，以及切片网格的绕序与法线一致性统计。
- [ ] 文档中没有原版内容；nob-check 的测试与 `pnpm typecheck`、`pnpm lint` 通过（若改了工具）。

## 验证方法

- 本地运行工具与统计脚本，证据只记命令、计数与判定。
- 文档审阅：每条事实带置信度与证据，未确认项保持未确认。
- 只改文档时不做 simplify；改了 nob-check 时，按 execute-goal 流程做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
