---
type: plan
status: active
phase: P2
task: "01"
subtask: "01"
updated: 2026-10-04
---

# 01 — 候选任务资格核对

**契约来源：** [spec](../spec.md) 的 S-01、S-02、S-03、S-06、S-11；AC-01、AC-10。
**依赖：** 08。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 使用开发者本地合法数据只读核对 SCCT 三组共用 slot 0、基准中间组策略及 P3 资格：玩家机型、1–2 种敌机、基地/基地交互对象、任务结果所需数据和地图/Warp 空间数据。
- 若首选不合格，按 spec 的确定性回退规则评估候选；记录候选选择器、结构计数、资源角色缺口、U 项和安全证据，不记录原版文字、图像、音频、字节或反编译输出。
- 产出供 `content/` 使用的候选身份与角色清单；没有合格候选时明确 blocked 原因和恢复条件。

## 不包含

- 不实现正式解析器、Asset ID 验证器、P3 规则或浏览器导入。
- 不把本地研究输出复制到跟踪文件或仓库；不执行上传、部署或破坏性操作。

## 关键文件与契约

- [SCEN/SCCT 格式](../../../../original/formats/scenario.md)与 [U-022/U-023](../../../../original/unknowns.md)是事实依据。
- 计划新增的本地研究/证据入口由执行时按现有工具归属决定；不在仓库追踪原版内容。
- 计划新增的生产切片定义由 02 消费本子任务结果。

## 验收标准

- [ ] 取得首选候选合格证据，或按确定性规则产出一个重新批准的合格回退候选；否则 goal 保持 blocked。
- [ ] 证据覆盖玩家、敌机基数、基地、结果、地图/Warp 角色及未知项置信度，未把高概率结论写成已确认。
- [x] 研究产物仅留在 `local/`，公开变更不包含原版内容或反编译输出。

## 验证方法

- 本地 Node 工具/只读研究与必要的 Ghidra/DOSBox 证据；输出只记录结构 ID、类型、计数、U 项和判定。
- 不适用 browser-testing；本子任务不建立浏览器交互。

## 完成证据

- `node tools/nob-list.ts local/StarRang/SRANGERS/MAIN/SCENARIO.NOB --entries` 确认 52 个 `SCEN` 和一个 `SCCT`；本地结构脚本确认三组均为 18 个 slot，slot 0 均指向 entry 3121，基准选择器为 group 1 / slot 0。
- `local/research/p2-01/candidate-qualification.json`（忽略目录）记录安全结构证据。首选任务有 10 条 section-1 记录，非玩家非零 kind 经函数 `0x65ca4` 确认映射到六个 M2ID 槽位；section 3/4 为空。该映射仍未证明敌我、基地能力、结果条件或 Warp 空间语义。
- Ghidra 只读分析输出仅写入 `local/research/p2-01/`；跟踪文档只记录安全结构 ID、类型、计数、置信度和判定，没有原版字节、文字、图像、音频或反编译内容。
- Rubber-duck 审查指出原结论错误地把消息段当作结果数据、把未确认 kind 当作敌方/基地角色，并忽略了六种非玩家槽位；这些问题均已撤回，子任务按契约保持 blocked。
- 文档影响：结构证据和资格缺口已写入权威 [scenario](../../../../original/formats/scenario.md#p2-slice-candidate-evidence) 并同步 U-022；其他工程/操作文档无需变更，因为本子任务未新增产品接口或命令。
- 2026-10-03 用户补充试玩及本地截图核对形成 [B-002](../../../../original/behavior/B-002-practice-mode.md)：练习玩法候选不合格，失败流程已有观察，成功条件仍未确认；截图编号错配不用于生产机型映射。入口到 slot 0 的绑定仍保留高概率，不能将练习和战役第一关混为一谈。
- 2026-10-03 用户补充战役试玩；本轮核对 32 个引用截图，证据按 owner 写入 [B-003](../../../../original/behavior/B-003-campaign-flow.md)、[B-004](../../../../original/behavior/B-004-base-communications.md)、[B-005](../../../../original/behavior/B-005-campaign-rescue.md) 与既有 [B-001](../../../../original/behavior/B-001-strategic-map.md)，同时同步未知项和键位。截图文字/名称与画面只留在 `local/`，未复制进文档。
- 资格判断：本轮足以消除战役是否具有基地交互、实际 Warp 和结算入口的玩法覆盖疑问，但不足以通过 AC-01/10 或解锁子任务 02。难度/敌机类别的证据限制见 B-003，结构选择器与闭包仍待研究；替代候选尚未修订、审阅和批准。
- 子任务证据/置信度检查：没有将击杀分类当作模型类别、将目标名称当作资源身份、将战机被毁当作战役失败；成功/失败的精确规则归 P3，不新增“关闭全部 U-031”作为 P2 资格条件。
- 本地执行 `node local/research/p2-01/profile-candidates.ts`，覆盖和计数限制见 [scenario 来源 profile](../../../../original/formats/scenario.md#campaign-candidate-source-profiles-confirmed-structure)；结构断言核对 54 个 slot、52 个不同 SCEN、三个 slot-1 profile 及逐类型最小值。`node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` 零失败。没有把原版来源条目数或来源边数作为 S-02 的规范 Asset/边数。
- 模型对照已补入 [mesh](../../../../original/formats/mesh.md#3-comparison-with-the-original-partial) 和 U-028；研究脚本与 Ghidra 输出仍只留在 `local/`。接口/测试规则未变化，无需改工程约定；跟踪文档只含来源 ID、数量、结构和研究结论。
- 后续只读分析核实首个战役任务使用 slot 1，并发现 section-5 实际成员数组遍历和 +0x5C 的真实用途。profile 已升级为 version 2 并重算 54 个槽位，slot-1 的来源数量和逐类型最小值保持不变；参数敏感结论同时核对原生调用寄存器，未依赖旧的 `__fastcall` 推断签名。事实见 scenario/executable，不在此复制原版代码。
- 08 完成后恢复研究；新增本地 `fixed-graphics-profile.ts`，固定 HI 图形贡献的结构/部分计数见 [cockpit](../../../../original/formats/cockpit.md#bounded-canonical-graphics-projection)。断言核对 25 个唯一单位（2 layout、20 image、3 font）及 8 条已解析布局/图像边；报告显式不完整，未把这些贡献当作全包数量或 S-02 排序结果。
- 2026-10-04 有界研究生成可重放的 `model-material-subgraphs.ts`，覆盖全部候选，重建闭包/引用并通过真实 `readAssetReference` 校验；重新生成的报告与初次结果逐字节一致。模型/几何/图像引用的划分与限制见 [mesh](../../../../original/formats/mesh.md#bounded-modelmaterial-dependency-projection-confirmed-structurecounts)，没有将研究编号当作稳定生产语义 ID。
- 同日新增 `sound-source-profile.ts`，全量样本区边界、模型音效引用和精确别名核对通过；合成边界样本同时拒绝截断和不完整采样字。结构结论及未确认的角色/声道/flags 见 [audio](../../../../original/formats/audio.md#sample-boundaries-and-candidate-model-references-confirmed-structure)。两份新报告均明确 `complete: false`、`rankingAvailable: false`，所有脚本/输出已确认 git-ignored。
- 本轮研究文档检查：6 份变更文档的元数据、98 个相对链接及锚点通过，`git diff --check` 通过；`pnpm --silent check:original` 四个范围均完成且零 finding。未改产品 TypeScript、测试或依赖，不重复 08 已通过的全量工程检查。本轮仅持久化事实里程碑，不表示子任务完成。
- 剩余资格条件：按 S-02 核实战役回退候选的角色、完整规范图和确定性排序，再修订、重新审阅和批准 spec。当前研究状态仅见 goal tracker；没有资格通过，不要求用户继续通关被排除的练习模式。

### 当前资格证据覆盖

| 资格/关卡 | 本轮评估 | 证据或未满足部分 |
|---|---|---|
| 玩家机型与基准配置 | 首关 slot-1 选择逻辑和三组来源 profile 已核对，配置未锁定 | B-003 和 scenario；本次统计样本不能冒充中间组，最终按原 S-02 选定配置，不能提前固定中间组 |
| 一至两种敌机 | 未证明完整基数 | B-003 的定性观察和击杀样本不替代全部主/延迟对象的机型与阵营映射 |
| 基地/基地交互角色 | 可观察功能已确认 | B-004；具体所选任务的基地数量、共享/独立模型及来源仍待闭包核实 |
| 战略地图/Warp | 存在与表现已确认 | B-001；所选任务空间对象与原版来源绑定仍待完成 |
| 任务结果入口 | 可观察结算/推进已确认 | B-003；正式成功公式归 P3，被毁后的救援与失败规则另见 B-005/U-031 |
| S-02 回退排序 | 来源规模对比已完成，规范排序未完成 | scenario 的计数不涵盖全部切片，来源条目/边也不是规范 Asset/边；需先明确规范划分或经批准修订选择规则 |
| 替代候选审批 | 未完成 | 现有 accepted spec 的批准不等于批准任意战役任务，不能静默改候选 |
