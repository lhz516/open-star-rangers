---
type: plan
status: active
phase: P2
task: "06"
subtask: "12"
updated: 2026-10-05
---

# 12 — 歧义贴图条目研究（U-028）

**契约来源：** [spec](../spec.md) 的 S-11（U-028 部分）；[研究要求](../spec.md#研究要求)的第二行，[模型转换声明](../spec.md#模型转换声明)末段的贴图置信度规则，技术决定 8；AC-14。
**依赖：** 09。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **范围：** 04 的本地探查列出了切片贴图实际被像素用到的歧义条目（生成 spec 时为 8 个 TEX，见 [textures §3](../../../../original/formats/textures.md#nearest-colour-metric-and-tie-rule-unconfirmed)）。本子任务只研究这些条目。
- **证据门槛：** 按 P2-05 的已批准规则与 textures §3，解除歧义需要 EXE 证据：找到原版的最近色实现。
  - **EXE 检索：** 有界的只读 Ghidra 检索，从 P2-05 未检索的入口开始：类型回调表 `0x1766b4` 的分发函数，以及贴图准备之后的绘制路径（见 [executable](../../../../original/formats/executable.md#native-tex-preparation-and-nearest-colour-search)）。
  - **截图证据：** 能区分候选颜色的逐条目截图像素只能作为辅助。只有 P2-05 spec 先修订并经用户批准、允许这类证据解除歧义之后，才能代替 EXE 证据，且须说明如何排除光照明暗的干扰。
- **落实：**
  - **门槛满足时：**
    - 结论与暂定规则不同时，只修改 [expand-image.ts](../../../../../src/content/graphics/expand-image.ts) 的 `nearestColourMap` 一处（P2-05 技术决定 2），同步 P2-05 的相关测试；
    - 本地脚本对每个条目断言：生产展开路径得到的显示颜色与结论一致；
    - 04 的生产贴图映射按结论改为 likely（仍带 U-028）；
    - 复跑 09 的本地脚本，确认相应 `source-not-ready` 诊断消失。
  - **全局度量与并列规则：** 只有在 EXE 证据下才标为已确认。
- **文档：** [textures §3](../../../../original/formats/textures.md#nearest-colour-metric-and-tie-rule-unconfirmed)、按需 [executable](../../../../original/formats/executable.md)、[unknowns](../../../../original/unknowns.md) 的 U-028 状态与 `updated:`。

## 不包含

- 光照与明暗（U-028 的光照部分，归 P3）。
- 切片以外贴图的歧义条目。
- 未经批准就修改 P2-05 spec 的证据门槛。

## 关键文件与契约

- 门槛满足时修改：[expand-image.ts](../../../../../src/content/graphics/expand-image.ts)（仅在规则需要改变时）、04 的 [production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts) 与生产贴图表的置信度，以及相应测试。
- 原版文档：textures、executable、unknowns。
- 本地新增 `local/research/p2-06/` 下的研究脚本与输出（被忽略）。
- 前提：本地 `SR.NOB`、截图与 `local/ghidra/srangers.gpr` 存在（2026-10-05 已确认）；缺少时本子任务为 blocked。

## 验收标准

- [ ] AC-14：列出切片贴图实际用到的全部歧义条目；每个条目的结论都满足证据门槛（EXE 证据，或 P2-05 修订获批后允许的逐条目截图证据），证据类型记入 textures 与 U-028。
- [ ] AC-14：生产展开路径对每个条目得到的显示颜色与结论一致；生产贴图映射的置信度与之一致，不再有因歧义而未确认的贴图。
- [ ] AC-14：结论与暂定规则不同时，只改了 `nearestColourMap` 一处，P2-05 的相关测试已同步。
- [ ] **阻塞规则：** 任一条目未达门槛时，本子任务为 blocked，相应贴图保持未确认。记录原因、受影响的 AC-14，以及恢复条件：取得 EXE 证据，或 P2-05 spec 修订获批准。
- [ ] 改了代码时，`pnpm check` 通过。

## 验证方法

- 本地只读研究；逐条目的展开断言在本地脚本中执行，证据只记地址、条目、计数与判定，不记像素或调色板值。
- 不适用 browser-testing。
- 改了代码时，完成前按 execute-goal 流程做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)；只改文档时只做 rubber-duck。

## 完成证据
