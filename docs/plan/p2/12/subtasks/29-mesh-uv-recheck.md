---
type: plan
status: active
phase: P2
task: "12"
subtask: "29"
updated: 2026-10-08
---

# 29 — 修复：MESH 贴图坐标修复后的新候选复核

**契约来源：** [spec](../spec.md) 的[候选身份](../spec.md#候选身份)（候选变化）与“发现转换或内容缺陷”；S-08、S-11；AC-01、AC-12、AC-14、AC-21。由 [26](./26-final-alignment.md) 第一次运行新增（execute-goal §5）。
**依赖：** —。
**外部前提：** 责任任务 P2-06 修复 MESH 贴图坐标块的读取并递增模型转换器版本（按 spec“不包含”修订 P2-06 的 spec/goal 并经用户批准，不在本 goal 内实现）。
**执行方式：** 自动：前提满足后，agent 的脚本全部重跑；V-1 受影响项的视觉复核由 agent 经 Computer Use 完成（技术决定 8 的修订）。用户只需在新候选上导入或恢复（若 agent 不能代为导入）。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [22](./22-presentation-verdicts.md#完成证据) 判定基地贴图方向差异来自 MESH 贴图坐标的读取，影响全部坐标不全相同的带贴图模型部件。P2-06 修复后，按候选身份：
  - 记录新候选 `{ commit, buildFingerprint, contentIdentity }`，重跑 [12](./12-candidate-check.md#完成证据) 的候选核对；
  - 重跑 agent 可运行的脚本：16 的布局比较、17 的覆盖核对、18 的任务核对，以及 [11](./11-outbound-compliance-review.md#完成证据) 的出站扫描（含 `--control`）；结论与原候选不同时，写明差异与影响；
  - 在新候选的本地生产预览中复核 V-1 的 10 个带贴图模型项（各模型列表 0、1）：贴图方向与细节；可再尝试手性。21 中按错误映射判为“一致”的 5 项在此重新判定；
  - 更新 [mesh §1](../../../../original/formats/mesh.md#texture-coordinate-block-order-likely-p2-12) 中读取器状态，并删去[源码结构](../../../../engineering/source-structure.md#资源查看渲染)与[本地导入指南](../../../../guides/local-import.md#查看器操作与限制)中“当前候选的模型贴图与原版不同”的限制说明。
- 复核不通过时，相应 AC 保持 blocked，回 P2-06 或 22。

## 不包含

- P2-06 的修复本身；V-2 效果、二维项与音效（不经 MESH 贴图坐标）；30 的补拍。

## 关键文件与契约

- 22 的完成证据（受影响项清单与恢复条件）；12、16、17、18、11 的本地脚本命令。

## 写入范围

- `local/research/p2-12/recheck/**`：新候选的复核记录与汇总（被忽略）。
- `local/research/p2-12/candidate/**`、`local/research/p2-12/layouts/**`、`local/research/p2-12/hud/**`、`local/research/p2-12/mission/**`、`local/research/p2-12/outbound/**`：重跑脚本在原目录写出的本地输出（被忽略），不改脚本。
- `docs/original/formats/mesh.md`：读取器状态与复核结论。
- `docs/engineering/source-structure.md`、`docs/guides/local-import.md`：删去或更新模型贴图的限制说明。

## 验收标准

- [ ] 新候选已记录，12 的候选核对与 11、16、17、18 的脚本在新候选上重跑并通过，或差异已记录。
- [ ] V-1 的 10 个带贴图模型项在新候选上有判定；AC-14 中贴图坐标造成的缺口已解除，或保持 blocked 并写明恢复条件。
- [ ] 文档不含原版内容；链接与元数据有效，`pnpm --silent check:original` 通过。

## 验证方法

- 本地脚本输出与 agent 视觉复核；文档检查。

## 完成证据
