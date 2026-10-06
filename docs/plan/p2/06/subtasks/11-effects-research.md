---
type: plan
status: active
phase: P2
task: "06"
subtask: "11"
updated: 2026-10-05
---

# 11 — 弹丸、导弹与碎片的表现研究（U-027）

**契约来源：** [spec](../spec.md) 的 S-11（U-027 部分）、S-10 与 S-06（研究确认的 Asset）；[研究要求](../spec.md#研究要求)的第一行，[生产 Asset 与来源](../spec.md#生产-asset-与来源)的研究确认行与来源形式；AC-13。
**依赖：** 09。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **研究：** 对弹丸、导弹与碎片三个角色，确定原版绘制它们所用的资源与路径。方法按总计划 §3.1：先结构与截图，再有界的只读 Ghidra 分析（`-noanalysis -readOnly`，不 `-overwrite`）。线索均为未经核实的入口：
  - 列表 1 与效果回调 `0x3e590`（[mesh 次级表现路径](../../../../original/formats/mesh.md#secondary-presentation-model-reuse-bounded)）；
  - 未被 MODL 引用的 MESH、只有列表 1 的 MODL、不在选定任务中的小型 M2ID 模型；
  - ANIM、EXPL 与 EXIC（[hud §3](../../../../original/formats/hud.md#3-id-lists-confirmed-structure)）；
  - 分配器调用点 `0x38780`、`0x3cb80`（[executable](../../../../original/formats/executable.md#bounded-slot-1-interaction-kind-evidence)）；
  - `local/StarRang/captures/` 中开火、导弹与击毁的画面。

  证据只记地址、结构、计数与判定，反编译输出与截图留在 `local/`。
- **结论分类：** 每个角色的结论至少高概率，并归入以下一种：
  1. **独立来源，本 spec 直接支持：** 整条目 MODL 或 P2-05 已支持的整条目图像记录。
     - 模型经 05、06 的步骤与生产输入转换，ID 为 `model/<角色>`（多个时为 `model/<角色>-<n>`），角色为 `projectile`、`missile` 或 `debris`，不进入机型绑定；
     - 图像经 P2-05 的声明契约转换，ID 为 `image/<角色>`（或加序号），并有调色板绑定；
     - 它们引用了生产音效表中没有的 SND 时，按 P2-08 的命名规则追加到 [production-sounds.ts](../../../../../src/original-data/conversion/production-sounds.ts)，由其转换器转换，并核对音频份额；超出 P2-08 已批准的份额时，先修订 P2-08 spec；
     - 研究追加的 Asset 若使用量超出 04、06 的份额，修订本 spec 的份额表，不在执行中放宽常量。
  2. **独立来源，但需要其他形式：** 如没有 MODL 的独立 MESH、容器内的子资源、ANIM、EXPL。先修订本 spec，批准其规范表示、默认字段与命名；ANIM 还须先修订 P2-05 spec（其技术决定 6）。
  3. **另一模型的内部元素**（如碎片即被摧毁模型的列表 1），或 **程序生成、没有原版资源：** 须提出 P2-01 切片定义修订（角色、kind 或基数变化须递增切片定义版本），经用户批准。
- **落实：**
  - 第 1 种：在生产常量中加入相应 Asset，更新 Node 测试；复跑 09 的本地脚本，确认 AC-08、AC-11 通过。
  - 第 2、3 种：按 spec 与 execute-goal 的阻塞规则记录 blocked。
- **文档：** [mesh](../../../../original/formats/mesh.md)，按需 [executable](../../../../original/formats/executable.md)、[textures](../../../../original/formats/textures.md)；[unknowns](../../../../original/unknowns.md) 的 U-027 状态与 `updated:`。

## 不包含

- 弹丸与导弹的飞行、命中、生命周期，碎片的运动与持续时间（P3）。
- 歧义贴图条目（12）。
- 未经批准就修改 P2-01 的切片定义，或修改 P2-05、P2-08 的 spec。

## 关键文件与契约

- 第 1 种结论时修改：06 的生产模型输入、[production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts)、按需 [production-sounds.ts](../../../../../src/original-data/conversion/production-sounds.ts)，以及相应测试与合成光盘。
- 原版文档：mesh、executable、textures、unknowns。
- 本地新增 `local/research/p2-06/` 下的研究脚本与输出（被忽略）。
- 前提：本地 `SR.NOB`、截图与 `local/ghidra/srangers.gpr` 存在（2026-10-05 已确认）；缺少时本子任务为 blocked。

## 验收标准

- [ ] AC-13：三个角色各有至少高概率的结论与证据类型，记入 mesh（必要时 textures、executable），U-027 状态已更新。
- [ ] AC-13：第 1 种结论的 Asset 已加入生产声明与映射，ID 与角色符合规则，在 AC-08 的 Node 测试与 AC-11 的本地复跑中通过；额外 SND 已追加到 P2-08 的表与转换器，全包的音效外部要求都已解析。
- [ ] AC-13：第 2、3 种结论所需的 spec 修订已获用户批准，实现与之一致。
- [ ] **阻塞规则：** 任一角色达不到高概率，或所需修订未获批准时，本子任务为 blocked。记录原因、受影响的 AC-13，以及恢复条件：取得新证据，或相应修订获批准。不以空 Asset 或猜测的来源冒充完成。
- [ ] 改了代码时，`pnpm check` 通过。

## 验证方法

- 本地只读研究；文档与生产常量逐项对照审阅；改了代码时运行 Node 测试并复跑 09 的本地脚本。
- 不适用 browser-testing。
- 改了代码时，完成前按 execute-goal 流程做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)；只改文档时只做 rubber-duck。

## 完成证据
