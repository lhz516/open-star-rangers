---
type: plan
status: active
phase: P2
task: "06"
subtask: "12"
updated: 2026-10-06
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
- [x] **阻塞规则：** 任一条目未达门槛时，本子任务为 blocked，相应贴图保持未确认。记录原因、受影响的 AC-14，以及恢复条件：取得 EXE 证据，或 P2-05 spec 修订获批准。
- [ ] 改了代码时，`pnpm check` 通过。

## 验证方法

- 本地只读研究；逐条目的展开断言在本地脚本中执行，证据只记地址、条目、计数与判定，不记像素或调色板值。
- 不适用 browser-testing。
- 改了代码时，完成前按 execute-goal 流程做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)；只改文档时只做 rubber-duck。

## 完成证据

**状态：blocked（2026-10-06）。** 没有条目达到证据门槛，相应贴图保持未确认，代码没有改动。

- **歧义条目清单（AC-14 第一部分）：** 切片贴图实际用到的歧义条目共 9 个 TEX、13 个调色板条目，用 04 的本地探查 `texture-table-probe.ts` 与 11 的 `effect-resources.ts` 复核：
  - 生产贴图表第 01、03、06、07、08、10、13、15 行：TEX 10613、10617、11067、10003、10001、10321、10681、10149，共 12 个条目；
  - 11 新增的导弹图像 TEX 10377，序号 1。

  第 16 行（TEX 10151）没有用到歧义条目。这 9 个图像就是 09 复跑时的 9 条 `source-not-ready`。
- **EXE 检索（有界、只读，`-noanalysis -readOnly`）：** 结果写入 [executable](../../../../original/formats/executable.md#native-tex-preparation-and-nearest-colour-search)，均为否定结果：
  - **TEX 载入路径三层调用：** 从 `0x65e28`、`0x660dc`、`0x82364`、`0x7a5e8` 出发共 56 个函数。`0x660dc` 把带自身调色板的索引图像交给渲染器，之后没有任何函数比较颜色或检索 DATA。
  - **全部导出函数（1,811 个，另加三层调用的 56 个）的形状扫描：** 分量差的平方或查表求和，以及打包 RGB 的查找下标。命中的只有向量、最近对象与纹理坐标计算。
  - **代码对象的原始字节扫描（含从未反汇编的代码）：** 整数自乘只有 6 处，没有成簇；浮点自乘有 25 簇，检查了渲染器与游戏代码中的 8 簇，都是向量与纹理坐标计算，没有遍历调色板的循环。

  检查范围内没有找到映射。渲染器接收索引图像之后的处理只是下一步检索的假设，不排除间接回调、预计算表或其他算法形状。扫描准则、总数与命中地址记录在被忽略的 `local/research/p2-06/nearest/scans.py` 与 `scans.log`，其余输出在同一目录。
- **截图证据：** 未使用。按 P2-05 的已批准规则与 spec，截图证据只有在 P2-05 spec 先修订并获用户批准之后才能代替 EXE 证据；未经批准不修改证据门槛。
- **受影响的验收：** AC-14 全部条目，以及依赖本子任务的 [13](./13-final-alignment.md)。`models` 组在这些图像解除之前保持不完整。
- **恢复条件，满足以下两条路径之一，且都覆盖全部 13 个条目：**
  1. **EXE 证据：** 找到并分析原版把索引图像映射到 DATA 颜色的实现，足以对全部 13 个条目得出结论。可从渲染器提交函数 `0x83250` 的更深调用，或绘制时使用图像调色板的路径入手。
  2. **截图证据：** 用户先批准 P2-05 spec 修订，允许逐条目的截图证据；之后对每个条目取得合格的截图证据，并排除光照明暗的干扰。

  运行期写入监视等其他证据，须先修订并批准相应 spec 才能采用。任一路径完成后，都要：
  - 记录结论与证据类型；
  - 对每个条目断言生产展开结果；
  - 按结论更新生产映射，必要时只改 `nearestColourMap`；
  - 复跑 09，确认 9 条 `source-not-ready` 诊断消失。
- **Rubber-duck：** 一项阻塞、三项非阻塞发现，均已修复：
  1. **（阻塞）** 恢复条件改为两条完整路径，各须覆盖全部 13 个条目并完成后续落实；运行期证据须先经 spec 认可；
  2. 穷举扫描的准则、总数与命中地址保存在本地 `scans.py` 与 `scans.log` 中，可复核，导出函数数更正为 1,811；
  3. “映射高概率发生在渲染器”弱化为下一步检索的假设，位置仍未确认（executable、U-028 与本证据同步）；
  4. 本条补上审查结果。

  审阅者确认：9 个 TEX、13 个调色板条目的计数在各文档中一致，度量与并列规则正确地保持未确认。
- **文档影响：** executable（扩大后的否定结果）、textures §3 的指引、unknowns 的 U-028（检索范围与切片歧义条目计数）。
