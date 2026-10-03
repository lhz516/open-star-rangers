---
type: plan
status: active
phase: P1
task: "14"
subtask: "06"
updated: 2026-10-03
---

# 06 — 最终全覆盖、扫描与持久状态对齐（仅验证）

**契约来源：** [Spec](../spec.md) 的 S-01 至 S-07；AC-01 至 AC-14。
**依赖：** 01, 02, 03, 04, 05。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 核对01–05及按需新增修复项的证据覆盖全部S/AC、七退出条件与阶段主要交付；工程/Python、完整三项目浏览器、当前聚合、历史适用性/必需补验和人工来源/全文审阅闭合，代码修复有针对性回归/重验/独立提交，无未取得的必需证据。本项依赖必须包含全部新增修复项。
- 在最终评审/相关文档集合保存后实际运行 `pnpm check:original`，核验worktree/index/untracked/build四范围及被扫revision/差异/产物，记录真实passed/exit；数量随文件变化，不硬编码或声称扫描提交历史。
- 核对最终输入/依赖/构建身份与02/03/04的一致性：仅文档变化且构建输入不变可沿用本轮结果；有关变化重建并重跑受影响项，不能拿旧hash套新候选或机械再跑旧矩阵。
- 核对新draft评审结论/确认状态、完整问题与交接、STATUS下一步及未改总览，文档链接/元数据/范围与全部owned资源收尾。
- 检查最终Git差异、保存/提交状态和tracker；核对代码修复各自独立提交，无代码项仍可不逐项commit，明确哪些文档未提交，不造空提交或把未提交说成已commit。

## 不包含

- 仅验证和记录，不新增feature、CLI/plugin/观测/测试代码，不在最终项实现补丁。
- 缺口归原责任定位，在本Goal用新ID聚焦修复项插入本行前并加入依赖，代码/回归由新增项负责；按 [Goal 聚焦修复规则](../goal.md#按需聚焦修复)避免依赖受阻的本行形成死锁。保持原ID和正确历史证据，不放宽Spec。
- 不自动确认评审、冻结draft、切换阶段、规划下一Goal、push/部署/公开或操作用户profile/存储。

## 关键文件与契约

- 只读本任务[Spec](../spec.md)、[Goal](../goal.md)、01–05及新增修复项完成证据、实际代码/回归diff、05新评审及直接相关指南；本项只写完成证据及唯一tracker。
- [CLI](../../../../../tools/compliance/cli.ts)、[报告](../../../../../tools/compliance/report.ts)、[package](../../../../../package.json)、[lock](../../../../../pnpm-lock.yaml)和当前dist作为最终输入；`check:original`不自动build，不替代04聚合/许可验证。
- 阶段评审是退出判定权威，Goal completed只表示审阅交付完成；待负责人确认仍不自动变accepted。report/inventory/trace保持ignored，不入提交清单。

## 验收标准

- [x] S-01至S-07、AC-01至AC-14均有当前有效证据，01–05及全部实际修复项完成，最终行依赖所有行；无空修复项或遗漏的必需检查、数字目标或重跑掩盖。
- [x] AC-03至AC-09：工程/Python/E2E/聚合结果、Node/浏览器replay、历史适用性/必要补验、完整分发许可/人工审阅与最终输入相符；实际失败不写通过，必需未取得证据仍blocked。
- [x] AC-08：最终四范围扫描真实且完整，结果/版本/差异可追溯；新输入或产物不复用过期成功。
- [x] AC-10至AC-13：七项正式判定、问题原责任/修复/回归/重验、全部未关闭U项和P0/P2/P3/P5责任一致；评审draft/待确认、STATUS仅下一步，未自动批准或切换阶段。
- [x] AC-14：整个Goal最终diff仅评审/证据/tracker/直接相关文档及独立修复项的必要代码/回归，元数据/链接/导航正确；本最终项无代码，无新功能/依赖/原版/机读输出，自有资源清理且用户工作保留，代码独立提交与文档保存状态明确。

## 验证方法

- 逐项S/AC到01–05、新增修复项及正式评审交叉核验，保存最终文档后运行 `pnpm check:original`、检查输入身份与Git status/diff；记录最新扫描、代码修复独立提交及文档提交（若有）的真实范围，不以accepted代替完成。
- 文档检查只校验实际涉及文件的元数据/相对链接/锚点/结构和差异；实现身份未变不重跑全工程、Python、浏览器或旧手工矩阵。
- 必需失效浏览器项按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)验证；本项无新实现，不需代码 simplify。完成后汇报draft评审待确认，不执行下一规划或外部操作。

## 完成证据

### 最终覆盖核对

- 2026-10-03，执行候选 `831d231` 加本Goal文档；01–05全部completed，六ID/六文件与依赖一致、无环，06最后依赖全部五行，无真实缺陷或07空修复项。全Goal无源码/测试/config/lock/依赖变更，故02/03/04当前工程/浏览器/聚合与历史适用性均有效，不重跑旧矩阵或以文档改变为由重建。

| 契约 | 当前证据 |
|---|---|
| S-01、AC-01/02 | [01](./01-candidate-evidence-map.md#完成证据)前提85行/候选/责任，05正式七项/十二交付，06最终身份 |
| S-02、AC-03/04 | [02](./02-engineering-replay-checks.md#完成证据)四类型/lint/56文件1272测试/build与独立Python3项；[03](./03-browser-exit-checks.md#完成证据)完整21/21三项目、无skip/retry/失败重跑 |
| AC-05/06 | 03真实投影/Core反馈/像素/输入/控制/联合rAF监听GPU/native/WebGL-off；02Node及03同记录浏览器events/checkpoints精确match、合法hash tick2偏差、非法format/version拒绝 |
| S-03、AC-07 | 01逐类版本/相关diff/复用理由，03无必需失效项；最新window/new-owner HMR、Session首帧、DPR/restore/压力保留原范围，故障仍是Node层次 |
| S-04、AC-08/09 | [04](./04-compliance-artifact-review.md#完成证据)七范围聚合、240输入/分发/9全文及人工来源完整审阅；03当前production三文件；本项最终四范围扫描 |
| S-05、AC-10/11 | [05](./05-exit-review-handoff.md#完成证据)新四部分draft评审、七项均通过与实际结果一致，未闭合P1缺陷/缺失观测为零；没有伪造修复/结论批准或有条件豁免 |
| S-06、AC-12 | 05完整25未关闭U项/owner、设施/合成替代项/计划模块及P0/P2/P3/P4/P5边界；不复制研究事实或分配后续任务 |
| S-07、AC-13/14 | 05直接说明更正，STATUS仅下一步、P1仍进行中/评审列未改，所有六项只文档；本项最终链接/扫描/清理/持久化，无代码simplify |

- 所有验收数值沿原契约，计数不是硬门槛。工程/Python/E2E/聚合首次通过，常规错误空，probe自检/禁用WebGL原精确诊断独立，不新加allowlist；当前JS/map/声明及inventory与02/03/04相同。历史accepted/旧18+3或Node故障不替代本轮所需证据。
- 文档影响检查：05直接修正已接页面/runner/评审冻结说明，命令/键位/合规边界准确；本项只记录最终覆盖/identity和新评审的交付时点，不改变接口/架构/原版事实/未知项。P0冻结评审/全部历史Goal不改、无需ADR。待负责人明确确认后才accepted/冻结，阶段切换另行授权；没有推送/部署/公开或下游skill调用。

### 最终扫描、清理与持久化

- 最终评审/直接说明及六项证据保存后，实际 `pnpm --silent check:original` exit0：`osr-local-compliance`/1、kind=original、passed=true、findings=[]；worktree339/index339/untracked1/build7全部completed。此时index仍执行起点，untracked唯一为新P1-exit评审，tracked工作树含本Goal文档变更；不是只扫描旧提交或遗漏新文档。随后13文档精确暂存后的同命令再次exit0/passed=true/零finding，worktree340/index340/untracked0/build7全部completed；没有rebuild或改产物。审查/最终tracker收尾暂存后按此范围再核对，防止证据文本变动后漏扫实际blob。
- 当前产物/240输入指纹与02/03/04及P1-12完全相同；只有不进入build的文档改变，故工程/浏览器/许可证据不失效。已核对全部七dist文件/6归属digest、许可文本及map；最后doc扫描不替代七范围聚合或人工来源审阅。
- 4173/4174无监听，自有renderer/input/session/probe在runner finally释放、native contexts/targets关闭，无临时HMR编辑/原版读取/个人存储操作。进程检查仅见本请求前00:03启动的既存工具Chrome及其children，本请求09:20开始，未关闭/解锁/复用它们；无本轮残留profile/browser/服务器。
- 当前完整diff为13个文档：Goal/六subtask证据、P1-exit、STATUS下一步、阶段索引、工程/结构/评审索引；accepted Spec及生产代码/测试/配置/锁/依赖/原版/冻结记录无差异。结构、日期、全部本地链接/锚点、25 U项的精确ID/owner/status及STATUS下一步外零差异均通过；没有机读/截图/临时输出进入Git。
- 按用户无代码例外，01–05仅保存证据不分别制造commit；审查时13文档均已保存/暂存但尚未提交，本项统一准备一个聚焦本地文档提交，不含代码修复（实际没有修复项）。提交后验证真实hash、router done及clean worktree，最终报告提供hash，不在证据里嵌入自身commit hash。会话临时报告/校验脚本在最后核验后删除，ignored合成HTML由既有runner维护、不提交。
- rubber-duck限定本最终项证据/当前Goal身份措辞/评审身份段，交叉核对全S/AC、扫描范围、13文档及历史来源，无阻塞或非阻塞问题；补明确审查时未提交状态。14篇文档/449本地链接与锚点、全部元数据/日期、稳定图/覆盖及diff-check通过。最终审查后tracker完成、提交前重扫实际暂存最终文本；不执行代码simplify或新feature/补丁。
