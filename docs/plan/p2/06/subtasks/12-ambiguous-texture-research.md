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

- **范围：** 04 的本地探查列出了切片贴图实际被像素用到的歧义条目（生成 spec 时为 8 个 TEX，见 [textures §3](../../../../original/formats/textures.md#nearest-colour-metric-and-tie-rule-confirmed)）。本子任务只研究这些条目。
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
- **文档：** [textures §3](../../../../original/formats/textures.md#nearest-colour-metric-and-tie-rule-confirmed)、按需 [executable](../../../../original/formats/executable.md)、[unknowns](../../../../original/unknowns.md) 的 U-028 状态与 `updated:`。

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

- [x] AC-14：列出切片贴图实际用到的全部歧义条目；每个条目的结论都满足证据门槛（EXE 证据，或 P2-05 修订获批后允许的逐条目截图证据），证据类型记入 textures 与 U-028。
- [x] AC-14：生产展开路径对每个条目得到的显示颜色与结论一致；生产贴图映射的置信度与之一致，不再有因歧义而未确认的贴图。
- [x] AC-14：结论与暂定规则不同时，只改了 `nearestColourMap` 一处，P2-05 的相关测试已同步。
- [x] **阻塞规则：** 任一条目未达门槛时，本子任务为 blocked，相应贴图保持未确认。记录原因、受影响的 AC-14，以及恢复条件：取得 EXE 证据，或 P2-05 spec 修订获批准。
- [x] 改了代码时，`pnpm check` 通过。

## 验证方法

- 本地只读研究；逐条目的展开断言在本地脚本中执行，证据只记地址、条目、计数与判定，不记像素或调色板值。
- 不适用 browser-testing。
- 改了代码时，完成前按 execute-goal 流程做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)；只改文档时只做 rubber-duck。

## 完成证据

**状态：completed（2026-10-06，第二轮）。** 以 EXE 证据满足门槛，全部 13 个条目都有结论；下文“第一轮”保留 blocked 时的记录。

- **EXE 证据（恢复条件 1）：** 沿 DATA 调色板而不是 TEX 载入路径追踪，在 3D 渲染器（高概率为 RenderMorphics Reality Lab）的颜色管理器中找到最近色实现，地址与结构写入 [executable](../../../../original/formats/executable.md#native-tex-preparation-and-nearest-colour-search)：
  - 飞行初始化 `0x3ecdc` 载入 DATA 11075，`0x3d1c0` 把每个 6 位分量左移 2 位写入 `0x186c00`；两个 3D 设备的静态描述（`0x175224`、`0x1753ac`）为 8 位索引、256 项、调色板即该表。
  - 设备创建 `0x952b0` 用 `0x9e100` 建立颜色管理器，`0x9e24c` 登记全部 256 项，没有空闲项。
  - 查找函数 `0x9e304`：先在 257 桶散列中找完全相同的颜色（重复颜色取最小索引），分配回调与空闲项都不会发生；否则按索引升序扫描，保留严格更小的分量差平方和，初值大于最大可能距离，所以并列取最小索引。
  - 颜色梯度（ramp）代码 `0x6c8d4`、`0x6c0e8`（`ramplt.c`）以 8 位整数分量经同一函数填充 4,096 个槽；贴图创建后设置颜色数与 4 级明暗（`0x8526c`、`0x852c8`）。贴图颜色梯度的构建与光照如何选级未追踪，属 U-028 的光照部分（P3），不在本子任务范围。
  - 先前的扫描漏掉它：该函数只经函数指针到达、从未反汇编，且自乘指令低于聚簇阈值。
- **结论：** 渲染器以 8 位分量对 DATA 的 6 位值 × 4 取平方欧氏距离最小者，并列取最小索引。度量与并列规则标为已确认（代码）；贴图未着色的颜色以 BGR 调色板的 8 位分量进入这一搜索为高概率（贴图颜色梯度的构建、梯度表满时的回退与光照未追踪，属 P3）。均写入 [textures §3](../../../../original/formats/textures.md#nearest-colour-metric-and-tie-rule-confirmed) 与 U-028。它不在 P2-05/11 的候选规则中：与旧的暂定规则（DATA 按位复制展开为 8 位）相比，58 个嵌入调色板 1,335 个条目中有 8 个显示颜色不同，切片中为 10149:6、10321:3、11067:13。
- **落实：**
  - [expand-image.ts](../../../../../src/content/graphics/expand-image.ts) 只改 `nearestColourMap` 一处：目标分量清除低两位，对按位复制展开的 6 位调色板恰好得到 6 位值 × 4。[expand-image.test.ts](../../../../../src/content/graphics/expand-image.test.ts) 新增一个测试，覆盖清位改变结果的三种情形（其中一种改变并列），原有用例不变。
  - 本地脚本 `local/research/p2-06/nearest2/confirmed-rule.ts` 断言：修改后的生产函数在全部 1,335 个条目上与按 EXE 写成的规则选择相同的 DATA 条目（0 处不同），其中包括切片的 13 个条目；清位写法与“6 位值 × 4”逐项一致（0 处不同）。
  - 生产贴图表与效果图像去掉 `ambiguous` 字段，17 个 TEX 图像映射都为 likely（仍带 U-028，表示游戏中的明暗）；[production-graphics.test.ts](../../../../../src/original-data/conversion/production-graphics.test.ts) 与 [production-model-textures.test.ts](../../../../../src/original-data/conversion/production-model-textures.test.ts) 同步。
  - 合成切片光盘上 `models` 组变为 `group-complete`，四个组都完整并全部移交：[import-job.test.ts](../../../../../src/workers/import-job.test.ts)、[import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts) 与 E2E [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts) 同步。
- **复跑 09（本地基准）：** `local/research/p2-06/base-check.ts` 通过。9 条 `source-not-ready` 全部消失，`models` 组为 `group-complete`（44 个 Asset，0 条诊断），四个组都完整并共用一个包身份，持有者移交全部四个组。复跑前先修正了该本地脚本：改用新的 `modelsGroupDraft` 签名、加入效果步骤、按四个组核对身份，贴图用量只计贴图（P2-07 合入后图形步骤还含驾驶舱 Asset）。贴图用量 34 个 Asset，在份额之内。
- **文档：**
  - textures §3 改为已确认，原歧义清单作为历史记录保留，并给出变化的 8 个条目；
  - executable §2 的渲染器一行与 §4 的新一节；
  - U-028 的颜色部分改为已确认，光照仍未确认；
  - 源码结构与工程约定中的最近色与集成测试说明；
  - P2-05 spec 的最近色一行加注 2026-10-06 更新；
  - 最近色一节的锚点随标题改为 `…-confirmed`，引用它的文档同步更新。
- **检查：**
  - `pnpm check` 通过（139 个文件，4,227 个测试）；
  - `pnpm test:e2e e2e/import-worker.spec.ts` 通过（16 个）。

- **审阅：** 本会话没有可用的 rubber-duck 模型，改用只读 code-review 代理按同一要求审阅。
  - 确认：原生规则、清位等价性、计数与测试都无误。
  - 指出三项，均已修复：
    1. “未着色的贴图颜色以 8 位 BGR 分量进入搜索”只能标为高概率。已在 textures、executable、U-028 与本证据中分开标注；补记多级明暗与梯度表满时 `0x6c598` 的回退；更正 `0xa07d4` 颜色立方的说明。
    2. goal tracker 的 12 行改为 completed。
    3. STATUS 与本 spec 中两处现在时的“未确认”改为带日期的说明。
- **Simplify：**
  - 已采纳：目标调色板只清位一次，不在每次比较中重复；删除管线测试中“贴图未确认”的过时注释。
  - 未采纳：把生产贴图表改为纯数字数组。行对象是文档记录的只追加表格式，便于将来增加字段。
- **复核：** 修改后本地规则比对仍为 0 处不同。

### 第一轮（2026-10-06，blocked）

没有条目达到证据门槛，相应贴图保持未确认，代码没有改动。

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
