---
type: plan
status: active
phase: P2
task: "13"
subtask: "06"
updated: 2026-10-08
---

# 06 — P2 负责未知项的处置

**契约来源：** [spec](../spec.md) 的 S-06、S-09、AC-12、AC-13 与 AC-15；技术决定 7。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **范围：** 按执行时的[未知项登记表](../../../../original/unknowns.md)，列出负责阶段含 P2、状态不是“已确认/不再需要”的各项。起草时为 U-001、U-004、U-020、U-023、U-027、U-028、U-029、U-031。U-032 已确认，负责阶段“P2-12”是历史记录，不在范围内。
- **逐项判定：** 以 P2-01 的切片定义与来源映射、P2-12 的必判范围与判定汇总，以及 `docs/original/` 的格式与行为文档为依据，判定该项 P2（切片）部分属于以下哪一种，并链接依据：
  - 已关闭；
  - 切片不需要；
  - 切片需要而仍未关闭；
  - 证据不足。
- **修改登记表：**
  - **已关闭或切片不需要：** 只把负责阶段一列中的 P2 部分改为后续阶段，并更新 front matter 的 `updated:`。后续阶段取登记表或总计划已为剩余部分指定的阶段，例如切片外内容归 P4、规则归 P3；无法确定时不改，记为证据不足。
  - **不得修改：** 状态、事项、结论/线索与证据列。
- **问题：** 切片需要而仍未关闭的项，负责阶段保持 P2，记为问题，写明受影响的退出条件、依据与恢复条件，供 07 判定。不在原契约之外开展新的原版研究。
- **交给 07 的表：** ID、评审时的状态、原负责阶段、P2 部分、判定与依据、新负责阶段或阻塞原因。

## 不包含

- 修改未知项的状态、结论、证据或置信度；修改其他 `docs/original/` 文档。
- 不以 P2 为负责阶段的项（它们在 07 的遗留事项中只列出，不改）。
- STATUS 中的未知项描述（由 07 建议、协调者修改）。

## 关键文件与契约

- [unknowns.md](../../../../original/unknowns.md)；[slice-definition.ts](../../../../../src/content/slice-definition.ts)；P2-01 的[切片与来源映射证据](../../01/subtasks/07-final-alignment.md#完成证据)。
- P2-12 的[判定分类](../../12/spec.md#判定分类)与[判定汇总](../../12/subtasks/26-final-alignment.md#第三次运行2026-10-08未通过源码结构的呈现约定表与-30-不一致)。

## 写入范围

- `docs/original/unknowns.md`：只改所判定项的负责阶段一列与 front matter 的 updated 日期。

## 验收标准

- [x] AC-13：范围内的每一项都有 P2 部分的判定与依据链接；登记表的差异只在负责阶段一列与 `updated:`，状态、结论、证据与置信度不变。
- [x] 切片需要而未关闭的项保持 P2，并已记为问题（AC-12）；没有时写明“无”。
- [x] 交给 07 的表完整。
- [x] 登记表的链接与 front matter 有效；没有复制原版内容。

## 验证方法

- `git --no-pager diff docs/original/unknowns.md`；用脚本逐行比较改动前后的表格单元格，确认只有负责阶段一列变化。
- 链接与锚点检查。不涉及浏览器；原版证据只引用已有记录。

## 完成证据

- **范围核对（2026-10-08）：** 以基线提交 `c2018af` 的[登记表](../../../../original/unknowns.md)为准，负责阶段一列含 P2 且状态不是“已确认/不再需要”的项恰为 U-001、U-004、U-020、U-023、U-027、U-028、U-029、U-031，与起草时一致；U-032 已确认，负责阶段“P2-12”是历史记录，不在范围内。
- **判定依据：** P2 部分的范围以 P2-01 的[切片定义](../../../../../src/content/slice-definition.ts)（版本 3）与[候选选择记录](../../01/spec.md#候选选择记录)、P2-12 的[判定分类与必判范围](../../12/spec.md#判定分类)以及[判定汇总](../../12/subtasks/26-final-alignment.md#第三次运行2026-10-08未通过源码结构的呈现约定表与-30-不一致)（[第四次运行](../../12/subtasks/26-final-alignment.md#第四次运行2026-10-08通过)通过）为准（spec 技术决定 7）。后续阶段按[总计划 §12](../../../master-plan.md#12-开发阶段与验收条件)：切片外的导入格式、其余模型与任务、音乐归 P4，规则归 P3；以及下表各行链接的责任任务 spec 与 `docs/original/` 记录对剩余部分的指定。没有开展新的原版研究。
- **交给 07 的表：** “评审时的状态”即登记表状态列，本任务未改。

  | ID | 评审时的状态 | 原负责阶段 | P2 部分 | 判定与依据 | 新负责阶段 |
  |---|---|---|---|---|---|
  | U-001 | 进行中 | P0（结构）/ P2（切片所需类型） | 切片定义各角色所用条目类型的解析与转换 | **已关闭。** 切片所用的条目类型都已解析与转换，全部封包逐条目通过校验（登记表 U-001 结论，[imfat](../../../../original/formats/imfat.md#6-observed-maxima-against-the-readers-limits-confirmed)，[P2-03/09](../../03/subtasks/09-local-base-check.md#完成证据)）；P2-12 判定汇总中 V-1 至 V-4、A-1、M-1 至 M-4 的必需项都已判定，没有“差异，待修复”。U-001 结论中仍为高概率的部分，其切片内的可见结果由 V-1 与[呈现约定](../../../../engineering/source-structure.md#资源查看渲染)的判定覆盖，按 spec [判定规则](../spec.md#判定规则)计入。其余类型不在切片定义中 | P0（结构）/ P3（玩法规则所需类型）/ P4（其余类型）。P3：P2-09 [不包含](../../09/spec.md#不包含)把运行时对象的参数记录与 CINF 交给 P3 研究规则时扩展转换器，[textures 编码 1](../../../../original/formats/textures.md#encoding-1-animation-unconfirmed)记其在 P3 的可能需要。P4：总计划 §12 |
  | U-004 | 部分确认 | P2（音效）/ P4（音乐） | 切片核心音效的样本解释与角色对应 | **已关闭。** 切片样本的解释与角色对应见 [audio P2-08](../../../../original/formats/audio.md#slice-sample-set-and-role-correspondences-p2-08)，经 P2-08/10 试听一致；P2-12 的 A-1 12 项判定一致，各角色都有原版直接对照（[audio 播放路径](../../../../original/formats/audio.md#viewer-playback-path-p2-12)，[P2-12/14](../../12/subtasks/14-sound-baseline-equivalence.md#完成证据)、[21](../../12/subtasks/21-user-comparison-session.md#完成证据)、[28](../../12/subtasks/28-a1-original-comparison.md#完成证据)）。audio 中仍未研究或未确认的部分在切片外，或被 audio 记为 P3 的行为问题 | P3（音效的选择与触发）/ P4（音乐与切片外音效） |
  | U-020 | 未确认 | P2 | 切片条目的读取是否依赖 `flags` | **切片不需要。** P2-03 [不包含](../../03/spec.md#不包含)规定不解释 `flags`、原样保留；在此前提下全部封包逐条目通过校验（[imfat §2](../../../../original/formats/imfat.md#2-directory-entry-36-bytes-confirmed-flags-meaning-unconfirmed)），P2-12 中切片的必需项都已判定 | P3 / P4（随 U-001 的其余类型）：只有转换切片外条目时才可能需要它 |
  | U-023 | 部分确认 | P2 | 所选任务实际用到的 SCCT 僚机记录字段 | **已关闭。** 切片任务用到的僚机记录字段已由 P2-09 清点（[scenario 字段清单](../../../../original/formats/scenario.md#selected-mission-field-inventory-confirmed-structure)）；P2-12 的 M-1、M-4 与独立读取一致，差异为 0（[scenario P2-12](../../../../original/formats/scenario.md#independent-field-comparison-and-core-load-p2-12)，[P2-12/18](../../12/subtasks/18-mission-comparison.md#完成证据)）。P2-01 [候选选择记录](../../01/spec.md#候选选择记录)：具体选择语义与生成门禁由 P3 处理 | P3（选择语义与生成门禁） |
  | U-027 | 部分确认 | P2（模型与效果外观对照）/ P3（第 2 列表的显示规则、部件标志、槽 0 与 3、碎片产生时机） | V-1、V-2 的模型与效果外观对照 | **已关闭。** P2-12 判定汇总：V-1 一致 10 项、V-2 一致 7 项，必需项都已判定，没有“差异，待修复”；其余为切片之外、已确认不使用的项（V-2 19 项），或用户批准的[范围例外](../../12/spec.md#判定分类)（V-1 4 项、V-2 9 项）。逐项依据见 [mesh V-1](../../../../original/formats/mesh.md#p2-12-viewer-comparison-v-1) 与 [executable](../../../../original/formats/executable.md#weapon-records-and-the-first-missions-shooters-p2-1230)。spec [判定规则](../spec.md#判定规则)：范围例外交 P3 在实现运行时显示后复核外观 | P3（第 2 列表的显示规则、部件标志、槽 0 与 3、碎片产生时机；范围例外的外观复核） |
  | U-028 | 部分确认 | P3（光照）/ P2（槽位） | 所选任务的机型槽位到模型的绑定 | **已关闭。** P2-12 的 M-2 以独立读取核对所选任务全部机型条目的模型绑定，全部可解析且一致（[scenario P2-12](../../../../original/formats/scenario.md#independent-field-comparison-and-core-load-p2-12)，[P2-12/18](../../12/subtasks/18-mission-comparison.md#完成证据)）；V-1 判定了这些模型（[mesh V-1](../../../../original/formats/mesh.md#p2-12-viewer-comparison-v-1)）。切片外的槽位属总计划 §12 的其余模型；救援对象的身份随 U-031 | P3（光照、救援对象的身份）/ P4（切片外的槽位） |
  | U-029 | 部分确认 | P2 | 前视驾驶舱、切片所需 MFD 页面与地图边框的布局与调色板 | **已关闭。** V-3 的前视驾驶舱、地图边框与地图调色板判定一致（[cockpit P2-12](../../../../original/formats/cockpit.md#all-qualifying-captures-p2-12)，[P2-12/16](../../12/subtasks/16-layout-comparison.md#完成证据)），V-4 的二维资源判定一致；所依据的分组调色板与绘制路径见 [cockpit](../../../../original/formats/cockpit.md#group-palette-and-drawing-confirmed)。P2-07 [不包含](../../07/spec.md#不包含)：CCKD 其他槽位与 LO 组未入选，HUD 动态内容归 P3；[cockpit 未决问题](../../../../original/formats/cockpit.md#4-open-questions)把仪表记录交给 P3 | P3（仪表记录与目录的其余字段）/ P4（其他视角与 10097） |
  | U-031 | 进行中 | P3（失败/救援规则）/ P2（所选任务必需来源） | 所选任务救援对象与救援船所需的来源 | **切片不需要。** 切片定义没有救援角色，P2-01 [执行记录](../../01/goal.md#执行记录)明确不以 U-031 作为 P2 门槛。P2-09 [不包含](../../09/spec.md#不包含)：救援对象等运行时对象的模型闭包已由 P2-01 与 executable 处理（[两条分配器路径](../../../../original/formats/executable.md#two-allocator-paths-native-inputs-and-profile-comparison)、[其余分配器输入](../../../../original/formats/executable.md#remaining-direct-allocator-input-inventory)），其参数记录由 P3 研究规则时扩展转换器。现有观察与未绑定的部分见 [B-005](../../../../original/behavior/B-005-campaign-rescue.md) 与 [mesh V-1](../../../../original/formats/mesh.md#p2-12-viewer-comparison-v-1) | P3（失败/救援规则与救援对象的来源） |

- **问题（切片需要而仍未关闭，AC-12）：** 无。也没有证据不足而保持 P2 的项。登记表中以 P2 为负责阶段的只剩已确认的 U-032（历史记录）。
- **供 07 参考（不阻塞，未在本项修改）：**
  - **U-004 的结论文字未随 P2-12/28 更新：** 登记表仍写“P2-12 中各角色与原版的直接对照尚无记录”，而 [audio 播放路径](../../../../original/formats/audio.md#viewer-playback-path-p2-12)已记录 P2-12/28 的逐角色直接对照（[28](../../12/subtasks/28-a1-original-comparison.md#写入范围)的写入范围不含登记表）。原版事实以 audio 为准，P2-12 判定汇总也引用 28，所以不影响上表判定。S-06 不允许修改结论列，需在本任务之外对齐。
  - **STATUS 的 U-022 说法：** [STATUS](../../../../STATUS.md) 的下一步第 3 条写 U-022 的剩余字段“在 P2 中继续”，登记表的负责阶段是 P3（规则语义）与 P4（其余任务的字段）。U-022 不在本项范围；按 AC-16，STATUS 中的未知项负责阶段须与登记表一致，由 07 建议、协调者修改。
  - **U-031 的残余风险：** 若 P3 研究救援规则时发现救援表现需要切片之外的来源，按 P2-09 的指定由 P3 扩展转换器，不属 P2 缺口。
- **登记表差异：** `git --no-pager diff docs/original/unknowns.md` 只有上表 8 行的负责阶段单元格。未跟踪的临时脚本按 `|` 拆分改动前后的每一行：行数不变；改动的 8 行都是 6 列，只有第 6 列（负责阶段）不同，ID、事项、状态、结论与证据单元格逐字相同；表外各行（含 front matter）没有变化。front matter 的 `updated:` 已是 2026-10-08，无需改动。
- **检查：** 改动的两份文档与 goal、P2-12/26 共 206 个相对链接与锚点（含中文锚点）都有效；`git diff --check` 无问题；两份文档的 front matter 完整。只改文档，不涉及浏览器与构建。没有复制原版内容：本文件只有 ID、计数、判定与链接，原版事实只在 `docs/original/`。
- **Rubber-duck：** 1 项阻塞问题已处理：初稿的判定单元格复述了原版事实（贴图坐标、音效触发、分配器结论、调色板与观察），已改为只写 P2 部分、判定、计数与链接。审查确认 8 项的状态、原负责阶段、P2-12 计数、新负责阶段与“供 07 参考”各条都有依据，只改了负责阶段一列。
- **文档影响：** 登记表负责阶段即本项交付。原版格式与行为文档、工程约定与指南都不受影响（没有新的原版事实或命令）。STATUS 与阶段索引不由本项修改；STATUS 中 U-022 的负责阶段说法见上方“供 07 参考”。
